// Load test of the dashboard as it is at launch (docs/load-test.md › Task 10): members and admins, each on their own
// Google account, each running the page's own loop (frontend/src/lib/vic/store.ts, app-shell.tsx) through the real proxy
// (web/api/run.js). With pending changes on, saves go through the real accept step and the real queue consumer
// (web/api/apply.js, web/lib/pending.js); in the model on in-memory Redis and a stand-in queue (test/fakes.js).
//
//   node test/load.js                        model: 64 members (32 binomes), 4 admins, 10 simulated min, switch on, off at 8 min
//   node test/load.js --dry-run              print the plan (who, which calls, how often, what is written) and stop
//   node test/load.js --live https://vic-recruitment.vercel.app --cookies cookies.txt --check
//                                            one webAccess per cookie: whose session, which role, until when. Never prints a cookie.
//   ... --live <url> --cookies cookies.txt --dry-run [--writes ...]
//                                            reads once per cookie (role, binome, TEST_MODE, switch, the write targets), prints
//                                            the plan, writes nothing
//   ... --live <url> --cookies cookies.txt [--writes ...] [--minutes 10]
//                                            production. Read-only unless --writes. With --writes it stops unless TEST_MODE is on,
//                                            writes only: Notes of the chosen test candidates (toggled, put back at the end),
//                                            Snooze / Mute / Unmute on chosen open alerts (put back to Open), the interview form
//                                            of --interview CODE re-saved with its own answers (only a form this account saved; Edited at / by move),
//                                            --setting ALL_BINOME_WEIGHT toggled 1 <-> 1.5 (no binome uses it) and put back.
//                                            None of these sends mail. --pending on|off flips the owner's switch (needs the owner's
//                                            cookie) and puts it back at the end (--pending-end on|off|found). After a switch-off
//                                            each writer saves once at once, so the direct fallback is always tried (mark 10).
//                                            --drop-slice <min> (default 3 with --writes, 0 = never): the owner drops the cached
//                                            slice of each binome a cookie sits in (webRun dropSlice, TEST_MODE only), so those
//                                            members read their binome sheet until the next sync (#101's read).
// cookies.txt: one vic_s value per line, one line per Google account. Admins go on admin cookies, members on member cookies.
// Options: --members 64 --admins 4 --minutes 10 --scale 5 --pending on|off|keep --pending-off-at <min> (0 = never) --pending-end on|off|found
//          --stagger 2 (min: each person opens at a random moment in the first N minutes, as real people do; it spreads their polls too)
//          --save-every 4 --form-every 20 --alert-every 2 --setting-every 30 (min per person, model; live: writers only)
//          --sync-hold 10 (s) --hours-per-day 1 (projection: hours a day with everyone on the page) --codes IT.12,HR.3 --alerts 4 --interview IT.12 --setting KEY
//          --out results.json --assert (the self-check in npm test: fails unless every call answered and every pending change ended)
//
// The Apps Script stand-in (model) has the two locks the script really has: the script lock (the 1-minute sync, every direct
// admin action, publishFresh_) and the document lock (memberSet, interviewSave, webApply: one lock for everyone, issue 59).
// Service times are medians from production (2026-10-05 and 2026-10-17 live runs; the rest estimated, marked est.), spread
// ±30% with a rare 10× tail. NOT modelled: Sheets/Drive slowing down under many readers, Vercel cold starts, Redis latency.
const http = require('http'), crypto = require('crypto'), fs = require('fs');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
// a numeric option: absent -> default; present without a number, or negative -> stop, instead of a run that looks valid
const num = (k, d) => { const v = opt(k, d), n = +v; if (v === true || !Number.isFinite(n) || n < 0) { console.error(`--${k}: expected a non-negative number, got ${v === true ? 'nothing' : v}`); process.exit(2); } return n; };
const LIVE = opt('live', null), DRY = !!opt('dry-run', false), CHECK = !!opt('check', false), WRITES = !LIVE || !!opt('writes', false);
const MEMBERS = num('members', 64), ADMINS = num('admins', 4), MINUTES = num('minutes', 10);
const SCALE = LIVE ? 1 : num('scale', 5); // the model runs SCALE× faster than real time; every time reported is simulated
const PENDING = String(opt('pending', LIVE ? 'keep' : 'on')), OFF_AT = num('pending-off-at', LIVE ? 0 : MINUTES * 0.8), END = String(opt('pending-end', 'found'));
const STAGGER = Math.min(num('stagger', 2), MINUTES / 2) * 60000, DROP_AT = num('drop-slice', LIVE && WRITES ? 3 : 0);
const SAVE_EVERY = num('save-every', 4), FORM_EVERY = num('form-every', 20), ALERT_EVERY = num('alert-every', 2), SETTING_EVERY = num('setting-every', 30);
const SYNC_HOLD = num('sync-hold', 10) * 1000, HOURS = num('hours-per-day', 1), ALERT_TARGETS = num('alerts', 4);
const CODES = String(opt('codes', '') || '').split(',').map(s => s.trim()).filter(Boolean), INTERVIEW = opt('interview', '') || '';
const SETTING = opt('setting', LIVE ? '' : 'ALL_BINOME_WEIGHT') || '';
const ADMIN_PULSE = 5000, MEMBER_PULSE = 30000, POLL_TIMEOUT = 20000; // store.ts (the idle backoff is not modelled: virtual users never go idle, so this is the worst case)
const SAFE_SETTINGS = { ALL_BINOME_WEIGHT: ['1', '1.5'] }; // no ALL binome exists this season: the value changes nothing
const MARK = '[load test]'; // added to a test candidate's Notes, then taken off again (the script trims, so no leading space)
const addMark = v => (String(v).trim() ? String(v).trimEnd() + ' ' : '') + MARK;
const same = (a, b) => String(a).trim() === String(b).trim();
if (!['on', 'off', 'keep'].includes(PENDING)) { console.error('--pending: on, off or keep'); process.exit(2); }
if (!['on', 'off', 'found'].includes(END)) { console.error('--pending-end: on, off or found'); process.exit(2); }
if (SETTING && !SAFE_SETTINGS[SETTING]) { console.error('--setting: only ' + Object.keys(SAFE_SETTINGS).join(', ')); process.exit(2); }

// Simulated time: in the model every Date.now() (the proxy, the consumer, the Redis fake's expiries) runs SCALE× fast.
const realNow = Date.now.bind(Date), T0 = realNow();
if (!LIVE) Date.now = () => T0 + (realNow() - T0) * SCALE;
const el = () => Date.now() - T0; // simulated ms since the start
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms) / SCALE));
const expo = meanMs => -Math.log(1 - Math.random()) * meanMs;
const TAIL = opt('assert', false) ? 0 : 0.005; // the self-check leaves out the rare slow call, so it never fails on a timeout
const spread = m => m * Math.exp((Math.random() - 0.5) * 0.6) * (Math.random() < TAIL ? 10 : 1);
const pick = a => a[Math.floor(Math.random() * a.length)];
function pct(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); }
let lastBeat = realNow(), maxStallMs = 0; // the machine itself can stall (sleep, power saving): every call in flight then looks slow
setInterval(() => { const n = realNow(); maxStallMs = Math.max(maxStallMs, n - lastBeat - 100); lastBeat = n; }, 100).unref();
let stop = false, OFF_T = null, DROP_T = null; // when the switch went off mid-run, when the slices were dropped (ms)

/* ---------- the Apps Script stand-in (model only) ---------- */

const MS = { access: 1200, accessMember: 1600 /* est. +Drive check */, pulse: 1300, pulseMember: 1600 /* est. */, state: 1700, stateMember: 1800 /* est. */,
  setPre: 1200, setHold: 1500, formGet: 1800, formPre: 1500, formHold: 2500, actPre: 500, actHold: 3000, publish: 4000,
  applyPre: 800, applyHold: 600, applyPer: 200 }; // est. except access / pulse / state (production logs)
const GOLD = ['Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation', 'Notes'];
const W = { snapVer: 1, built: 0, pub: null, binV: {}, sheet: {}, alerts: {}, settings: { ALL_BINOME_WEIGHT: '1' }, switchOn: PENDING !== 'off',
  changed: false, who: {}, wrote: {}, running: {}, script: 0, refusedConcurrency: 0, sync: { runs: 0, skipped: 0, ms: [] }, judged: {}, appliedTwice: 0, fields: {} };
const lockOf = name => ({ name, held: false, q: [], waits: [], refused: 0 });
const L = { script: lockOf('script'), doc: lockOf('document') };
function take(lk, waitMs) {
  const t = Date.now();
  if (!lk.held) { lk.held = true; lk.waits.push(0); return Promise.resolve(true); }
  return new Promise(res => {
    const w = { t, res, timer: setTimeout(() => { lk.q.splice(lk.q.indexOf(w), 1); lk.refused++; lk.waits.push(Date.now() - t); res(false); }, waitMs / SCALE) };
    lk.q.push(w);
  });
}
function give(lk) { const w = lk.q.shift(); if (w) { clearTimeout(w.timer); lk.waits.push(Date.now() - w.t); w.res(true); } else lk.held = false; }
const busy = msg => { throw new Error('BUSY: ' + msg); };
const pubAlerts = () => Object.keys(W.alerts).map(id => ({ id, code: W.alerts[id].code, type: 'NOT_CONTACTED', status: W.alerts[id].status }));
const pubState = () => ({ alerts: W.pub.alerts.filter(a => a.status === 'OPEN').map(a => ({ id: a.id, code: a.code, type: a.type })), // as buildState_: open, and held
  muted: W.pub.alerts.filter(a => a.status === 'SNOOZED' || a.status === 'MUTED').map(a => Object.assign({}, a)) });
async function publish() { const built = Date.now(); await sleep(spread(MS.publish)); W.pub = { alerts: pubAlerts(), settings: Object.assign({}, W.settings), built }; W.snapVer++; W.changed = false; }
async function publishFresh() { if (await take(L.script, 30000)) { try { await publish(); } finally { give(L.script); } } else W.snapVer++; } // dropped: the next webState builds live
function cell(code, f) { return (W.sheet[code] || {})[f] === undefined ? '' : W.sheet[code][f]; }
function writeCell(b, code, f, v) { W.sheet[code][f] = v; W.binV[b]++; W.changed = true; }

function buildWorld() {
  const n = Math.max(1, Math.ceil(MEMBERS / 2));
  for (let k = 1; k <= n; k++) {
    const b = 'B.' + String(k).padStart(2, '0');
    W.binV[b] = 1;
    for (let c = 0; c < 9; c++) { const code = 'IT.' + (k * 100 + c); W.sheet[code] = { _b: b }; GOLD.forEach(f => { W.sheet[code][f] = ''; }); }
  }
  for (let a = 1; a <= 120; a++) W.alerts['A-' + String(a).padStart(4, '0')] = { code: 'IT.' + (100 + a), status: 'OPEN' };
  W.pub = { alerts: pubAlerts(), settings: Object.assign({}, W.settings), built: Date.now() };
}
const codesOf = b => Object.keys(W.sheet).filter(c => W.sheet[c]._b === b);
const slice = (b, email) => ({ role: 'member', binome: b, v: W.binV[b], edit: true, pending: W.switchOn, user: email,
  candidates: codesOf(b).map(c => Object.assign({ Code: c }, ...GOLD.map(f => ({ [f]: W.sheet[c][f] })))) });

async function execute(email, fn, args) {
  if ((W.running[email] || 0) >= 30 || W.script >= 1000) { W.refusedConcurrency++; throw new Error('There are too many scripts running simultaneously for this Google user account.'); }
  W.running[email] = (W.running[email] || 0) + 1; W.script++;
  try { return await script(W.who[email], fn, args || []); } finally { W.running[email]--; W.script--; }
}
async function script(u, fn, args) {
  const member = u.role === 'member';
  if (fn === 'webAccess') { await sleep(spread(member ? MS.accessMember : MS.access)); return { ok: true, role: u.role, email: u.email, owner: !!u.owner, binome: u.binome || '', cover: false, v: 3 }; }
  if (fn === 'webPulse') { await sleep(spread(member ? MS.pulseMember : MS.pulse)); return { v: member ? W.binV[u.binome] : W.snapVer, pending: W.switchOn }; }
  if (fn === 'webState') {
    await sleep(spread(member ? MS.stateMember : MS.state));
    if (member) return slice(u.binome, u.email);
    return Object.assign(pubState(), { v: 3, built: W.pub.built, snap: W.snapVer, pending: W.switchOn,
      settings: { testMode: true }, settingsAll: Object.keys(W.pub.settings).map(key => ({ key, value: W.pub.settings[key] })) });
  }
  if (fn === 'webApply') return webApply(u, args[0] || {});
  if (fn !== 'webRun') throw new Error('Unknown function ' + fn);
  const [action, a] = [args[0], args[1] || {}];
  if (action === 'memberSet' || action === 'interviewSave' || action === 'interviewGet') {
    if (!member) throw new Error('Not allowed');
    const form = action !== 'memberSet', codes = codesOf(u.binome);
    if (codes.indexOf(a.code) < 0) throw new Error('This candidate is no longer in your binome.');
    if (action === 'interviewGet') { await sleep(spread(MS.formGet)); return { messages: [], result: { code: a.code, answers: {}, stamp: cell(a.code, '_stamp') } }; }
    await sleep(spread(form ? MS.formPre : MS.setPre));
    if (!(await take(L.doc, 10000))) busy('Your sheet is busy with another edit. Nothing was changed: try again.');
    try {
      await sleep(spread(form ? MS.formHold : MS.setHold));
      if (form) { if (cell(a.code, '_stamp') !== String(a.seen || '')) throw new Error('CONFLICT: your partner saved this form.'); writeCell(u.binome, a.code, '_stamp', 's' + Date.now()); return { messages: [], result: { code: a.code, stamp: cell(a.code, '_stamp') } }; }
      const out = a.fields.map(x => { if (String(cell(a.code, x.field)) !== String(x.seen)) return { field: x.field, conflict: cell(a.code, x.field) }; return { field: x.field, value: x.value }; });
      out.filter(x => 'value' in x).forEach(x => writeCell(u.binome, a.code, x.field, x.value));
      return { messages: [], result: { code: a.code, fields: out } };
    } finally { give(L.doc); }
  }
  if (member) throw new Error('Not allowed');
  if (action === 'pendingSwitch') { if (!u.owner) throw new Error('Only the owner'); W.switchOn = !!a.on; return { messages: [], result: { pending: W.switchOn } }; }
  await sleep(spread(MS.actPre));
  if (action === 'quick') { // snooze / mute / unmute: under the script lock, then published
    if (!(await take(L.script, 30000))) busy('Another update is running. Nothing was changed: try again in a minute.');
    let line;
    try {
      await sleep(spread(MS.actHold));
      const r = W.alerts[a.ids[0]], held = r && (r.status === 'SNOOZED' || r.status === 'MUTED');
      if (!r || (a.op === 'unmute' ? !held : r.status !== 'OPEN')) line = 'no longer open (refresh the page).';
      else { r.status = a.op === 'snooze' ? 'SNOOZED' : a.op === 'mute' ? 'MUTED' : 'OPEN'; line = 'done'; }
    } finally { give(L.script); }
    await publishFresh();
    return { messages: [line], result: { done: line === 'done' ? a.ids : [] } };
  }
  if (action === 'saveSettings') { await sleep(spread(MS.actHold / 2)); Object.assign(W.settings, a.values); await publishFresh(); return { messages: ['Saved'], result: null }; }
  throw new Error('Unknown action: ' + action);
}
// the lean apply entry (Pending.gs webApply): document lock 5 s or retry, judged per change, no publish
async function webApply(u, call) {
  await sleep(spread(MS.applyPre));
  if (!(await take(L.doc, 5000))) return { v: 1, retry: 'BUSY' };
  try {
    await sleep(spread(MS.applyHold + MS.applyPer * call.changes.length));
    const t = Date.now();
    const results = call.changes.map(c => {
      let now, set;
      if (c.kind === 'alert') { const r = W.alerts[c.alert]; now = r ? r.status : 'RESOLVED'; set = v => { r.status = v; W.changed = true; }; }
      else if (c.kind === 'setting') { now = W.settings[c.key]; set = v => { W.settings[c.key] = v; W.changed = true; }; }
      else { if (!W.sheet[c.code] || W.sheet[c.code]._b !== u.binome) return { id: c.id, end: 'dropped', reason: 'This candidate is no longer in your binome.' }; now = cell(c.code, c.field); set = v => writeCell(u.binome, c.code, c.field, v); }
      let end;
      if (String(now) === String(c.value)) end = 'met';
      else if (String(now) !== String(c.seen)) end = 'dropped';
      else { set(c.value); end = 'applied'; if (W.judged[c.id] === 'applied') W.appliedTwice++; }
      W.judged[c.id] = end; W.wrote[c.id] = t;
      if (c.kind === 'field' && end === 'applied') W.fields[c.id] = { b: u.binome, v: W.binV[u.binome] };
      return end === 'dropped' ? { id: c.id, end, sheet: String(now), at: t } : { id: c.id, end, at: t };
    });
    return { v: 1, results };
  } finally { give(L.doc); }
}
// The 1-minute sync as vic.rh: script lock (30 s), pull and save, re-raise resolved alerts, publish when something changed, api/drops.
async function syncLoop(P) {
  while (!stop) {
    const start = Date.now();
    (async () => {
      if (!(await take(L.script, 30000))) { W.sync.skipped++; W.sync.ms.push(Date.now() - start); return; }
      try {
        await sleep(spread(SYNC_HOLD));
        Object.keys(W.alerts).forEach(id => { if (W.alerts[id].status === 'RESOLVED') { W.alerts[id].status = 'OPEN'; W.changed = true; } });
        if (W.changed) await publish();
        W.sync.runs++;
      } finally { give(L.script); }
      count.invocations++; count.drops++;
      await P.forSync([], Date.now()).catch(() => {});
      W.sync.ms.push(Date.now() - start);
    })();
    await sleep(60000);
  }
}

/* ---------- transport: the real proxy in the model, production live ---------- */

const count = { invocations: 0, deliveries: 0, sends: 0, drops: 0, redis: {} };
let BASE, P = null, F = null, apply = null, srv = null;
function patchFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://script.googleapis.com/')) {
      const email = String(init.headers.Authorization).replace('Bearer at:', ''), b = JSON.parse(init.body);
      let out;
      try { out = { response: { result: await execute(email, b.function, b.parameters) } }; }
      catch (e) { out = { error: { message: 'Script error', details: [{ errorMessage: e.message }] } }; }
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.startsWith('https://oauth2.googleapis.com/')) return new Response('{"access_token":"x","expires_in":3600}', { status: 200 });
    return real(url, init);
  };
}
async function startModel() {
  process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SCRIPT_API_DEPLOYMENT_ID = 'LOAD';
  const S = require('../web/lib/session'), run = require('../web/api/run');
  P = require('../web/lib/pending'); F = require('./fakes')(P); apply = require('../web/api/apply');
  ['log', 'warn'].forEach(k => { const f = console[k]; console[k] = (...a) => { if (!String(a[0]).startsWith('{')) f(...a); }; }); // the functions' JSON lines
  // the queue: each message delivered ~1 s after the send, again after the consumer's retry delay until it ends
  const redis0 = P.deps.redis; // commands by kind, for the month's estimate
  P.deps.redis = cmds => { cmds.forEach(c => { count.redis[c[0]] = (count.redis[c[0]] || 0) + 1; }); return redis0(cmds); };
  const send0 = P.deps.send;
  P.deps.send = async (topic, payload, o) => { const r = await send0(topic, payload, o); count.sends++; deliver(payload, 1, 1000); return r; };
  srv = http.createServer((req, res) => { count.invocations++; run(req, res); });
  srv.keepAliveTimeout = 60000;
  await new Promise(r => srv.listen(0, r));
  BASE = 'http://localhost:' + srv.address().port;
  process.env.APP_ORIGIN = BASE;
  buildWorld();
  const acct = (email, role, extra) => { W.who[email] = Object.assign({ email, role }, extra); return { email, role, owner: !!(extra && extra.owner), binome: extra && extra.binome, cookie: S.seal({ email, rt: 'rt', at: 'at:' + email, ate: Date.now() + 864e5, iat: Date.now(), acc: true }), perMin: {} }; };
  const accounts = [];
  for (let i = 0; i < ADMINS; i++) accounts.push(acct('admin' + i + '@g.enp.edu.dz', 'admin', { owner: i === 0 }));
  for (let i = 0; i < MEMBERS; i++) accounts.push(acct('member' + i + '@g.enp.edu.dz', 'member', { binome: 'B.' + String(Math.floor(i / 2) + 1).padStart(2, '0') }));
  return accounts;
}
const inflight = new Set();
function deliver(payload, n, delay) {
  const job = (async () => {
    await sleep(delay);
    count.deliveries++; count.invocations++;
    try { await apply.handle(payload, { deliveryCount: n }); }
    catch (e) { deliver(payload, n + 1, apply.retry(e, { deliveryCount: n }).afterSeconds * 1000); }
  })();
  inflight.add(job); job.finally(() => inflight.delete(job));
}

const calls = []; // {fn, ms, kind, code}
class Refused extends Error { constructor(m, code, status) { super(m); this.code = code; this.status = status; } }
async function call(acct, fn, args = [], extra, timeoutMs) {
  const t = Date.now();
  let status = 0, j;
  try {
    const r = await fetch(BASE + '/api/run', {
      method: 'POST', signal: timeoutMs ? AbortSignal.timeout(timeoutMs / SCALE) : undefined,
      headers: { 'Content-Type': 'application/json', 'X-VIC': '1', Origin: BASE, Cookie: 'vic_s=' + encodeURIComponent(acct.cookie) },
      body: JSON.stringify(Object.assign({ fn, args }, extra)),
    });
    status = r.status;
    // the proxy re-seals the cookie (a refreshed token, the acc flag the accept step needs): keep the newest, as a browser does
    const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(c => /^vic_s=([^;]+)/.exec(c)).filter(Boolean)[0];
    if (set && status !== 401) acct.cookie = decodeURIComponent(set[1]);
    j = await r.json().catch(() => ({ error: 'bad json (' + status + ')' }));
  } catch (e) { j = e.name === 'TimeoutError' ? { error: 'Google took too long to answer.', code: 'TIMEOUT' } : { error: 'network: ' + e.message, code: 'NETWORK' }; }
  const m = Math.floor(el() / 60000); acct.perMin[m] = (acct.perMin[m] || 0) + 1;
  const kind = !j.error ? 'ok' : j.code === 'RATE_LIMIT' || /too many scripts|RESOURCE_EXHAUSTED/i.test(j.error) ? 'quota' : status === 401 ? 'auth'
    : ['BUSY', 'CONFLICT', 'DIRECT', 'TIMEOUT', 'LOST', 'NETWORK', 'FORMAT'].includes(j.code) ? j.code.toLowerCase() : /^Not allowed/.test(j.error) ? 'refused' : 'error';
  calls.push({ fn: fn === 'webRun' ? 'webRun:' + args[0] : fn, ms: Date.now() - t, kind, err: j.error });
  if (j.error) throw new Refused(j.error, j.code, status);
  return { value: j.value, rec: j.rec };
}

/* ---------- the virtual people ---------- */

const R = { boots: { admin: [], member: [] }, saves: { sent: 0, written: 0, conflict: 0, busy: 0, failed: 0, ms: [] }, forms: { sent: 0, saved: 0, conflict: 0, busy: 0, failed: 0 },
  actions: { sent: 0, done: 0, stale: 0, busy: 0, failed: 0, ms: [] }, settings: { sent: 0, ok: 0, failed: 0 },
  accepted: [], acceptMs: [], direct: 0, actionErrors: [], ended: [], drops: 0, events: [], seen: [],
  afterOff: { pulsesOn: 0, accepted: 0, direct: 0, answered: 0 }, sheetReads: { ok: 0, refused: 0 }, dropped: [] };
// mark 10: a direct write after the switch went off, and whether it answered (written, a conflict or a stale alert all count)
const offWrite = ok => { if (OFF_T !== null && Date.now() >= OFF_T) { R.afterOff.direct++; if (ok) R.afterOff.answered++; } };
const hasPending = rec => Object.keys(rec || {}).some(c => rec[c].state === 'pending');

function person(i, role, acct, until, targets) {
  const me = { i, role, acct, pulse: null, bv: null, built: 0, state: null, rec: {}, polls: 0, wantRec: true, busy: false, refreshing: false, polling: false, on: false, firstRec: true };
  const member = role === 'member', extra = [];
  // live: the first time this page sees the switch off mid-run, its writer saves once at once, so mark 10's direct path is always tried
  const setOn = on => {
    const was = me.on;
    me.on = on;
    if (!(was && !on && OFF_T !== null && LIVE && WRITES)) return;
    extra.push((async () => { while (me.busy) await sleep(200); try { if (member || acct.binome) await save(); if (!member) await alertAct(); } catch (e) { R.actionErrors.push(String(e && e.message).slice(0, 120)); } })());
  };
  const setRec = rec => {
    if (!rec) return;
    const now = Date.now(), shown = [];
    Object.keys(rec).forEach(c => {
      const e = rec[c], was = me.rec[c];
      if (was && was.id === e.id && was.state === 'pending' && e.state !== 'pending') R.ended.push({ id: e.id, state: e.state, seenMs: now - e.at, wrote: e.wrote, at: e.at });
      if (e.state === 'dropped' && !e.addressed && !e.shown) shown.push(c);
    });
    me.rec = rec;
    if (shown.length) { R.drops += shown.length; markDrops(shown); }
  };
  const markDrops = async cells => { // shown at once, then Keep the sheet's value a few seconds later, as a person would
    await call(acct, 'pendingMark', [{ shown: cells }]).then(r => setRec(r.value)).catch(() => {});
    await sleep(5000);
    await call(acct, 'pendingMark', [{ keep: cells }]).then(r => setRec(r.value)).catch(() => {});
  };
  const observe = s => { const o = { i, at: Date.now() }; if (member) { o.bin = s.binome; o.v = s.v; } else o.built = s.built || 0; R.seen.push(o); };
  const refresh = async () => {
    me.refreshing = true;
    try {
      const rec = hasPending(me.rec) ? 2 : me.wantRec ? 1 : 0;
      me.wantRec = false;
      const pr = await call(acct, 'webPulse', [true], rec ? { rec } : undefined, POLL_TIMEOUT).catch(() => null);
      if (pr && pr.rec) setRec(pr.rec);
      const s = (await call(acct, 'webState')).value;
      me.state = s; me.pulse = pr && pr.value && pr.value.v; me.bv = pr && pr.value && pr.value.bv; setOn(pr && pr.value ? !!pr.value.pending : !!s.pending);
      // #101: My binome read from the binome sheet (a cache miss, or the slice dropped mid-run); false = an admin's My binome refused
      const mine = member ? s : s.member;
      if (mine && mine.fromSheet) R.sheetReads.ok++; else if (mine === false) R.sheetReads.refused++;
      observe(s);
    } catch (e) { if (member && /isn't shared|permission/i.test(e.message)) R.sheetReads.refused++; /* the page shows a toast and keeps what it had */ }
    finally { me.refreshing = false; }
  };
  const tick = async () => {
    if (stop || me.busy || me.refreshing || me.polling || !me.state) return;
    me.polling = true;
    try {
      const held = hasPending(me.rec);
      const rec = me.wantRec ? (held ? 2 : 1) : held && (member || ++me.polls % 2 === 0) ? 2 : 0;
      me.wantRec = false;
      const sent = Date.now(), r = await call(acct, 'webPulse', [true], rec ? { rec } : undefined, POLL_TIMEOUT);
      if (r.rec) setRec(r.rec);
      if (r.value && typeof r.value === 'object') {
        if (r.value.pending && OFF_T !== null && sent > OFF_T) R.afterOff.pulsesOn++; // asked after the switch-off, still said on
        setOn(!!r.value.pending);
      }
      const v = r.value && typeof r.value === 'object' ? r.value.v : r.value, bv = r.value && r.value.bv;
      if ((v !== me.pulse || bv !== me.bv) && !me.busy) await refresh();
    } catch (e) { /* the next tick retries */ }
    finally { me.polling = false; }
  };
  // a write: the accept step when the switch is on (DIRECT = today's direct write), else the direct write
  const accept = async changes => {
    if (!me.on) return false;
    const t = Date.now();
    try {
      const r = await call(acct, 'accept', [{ v: 1, changes }]);
      R.acceptMs.push(Date.now() - t);
      if (OFF_T !== null && t >= OFF_T) R.afterOff.accepted++; // a page that had not polled since the switch-off: it must still end
      setRec(r.value);
      changes.forEach(c => { const cellId = c.kind === 'alert' ? 'alert:' + c.alert : c.kind === 'setting' ? 'setting:' + c.key : 'field:' + c.code + ':' + c.field, e = r.value[cellId];
        if (e && e.state === 'pending') R.accepted.push({ email: acct.email, cell: cellId, id: e.id, at: c.at, kind: c.kind, i }); });
      return true;
    } catch (e) { R.direct++; return false; }
  };
  const run = async (action, args) => { // store.run: a quick action refused BUSY is tried once more after 3 s
    try { return (await call(acct, 'webRun', [action, args])).value; }
    catch (e) { if (action !== 'quick' || e.code !== 'BUSY') throw e; await sleep(3000); return (await call(acct, 'webRun', [action, args])).value; }
  };

  const save = async () => { // My binome: one candidate, one Save of 1–3 fields (live: Notes only, toggled)
    const mine = member ? me.state : me.state.member || {}; // an admin in a binome: My binome is state.member
    const cands = (mine.candidates || []).filter(c => !targets.codes || targets.codes.includes(String(c.Code)));
    if (!cands.length) return;
    const c = pick(cands), code = String(c.Code), at = Date.now();
    const fields = LIVE ? ['Notes'] : GOLD.slice().sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
    // live: the mark goes on only over the original and comes off only from original + mark; anything else is a person's text
    if (LIVE && !same(c.Notes || '', targets.orig[code]) && !same(c.Notes || '', addMark(targets.orig[code]))) { targets.codes = targets.codes.filter(x => x !== code); return; }
    const list = fields.map(f => { const seen = c[f] === undefined ? '' : c[f]; return { field: f, seen, value: LIVE ? (same(seen, targets.orig[code]) ? addMark(targets.orig[code]) : targets.orig[code]) : 'v' + Math.random().toString(36).slice(2, 7) }; });
    R.saves.sent++;
    if (await accept(list.map(x => ({ kind: 'field', code, field: x.field, value: x.value, seen: x.seen, at })))) return;
    try {
      let out = (await call(acct, 'webRun', ['memberSet', { code, fields: list }])).value.result.fields;
      const theirs = out.filter(x => 'conflict' in x);
      if (theirs.length) { R.saves.conflict++; if (LIVE) targets.codes = targets.codes.filter(c => c !== code); } // live: never that cell again
      // Use mine, model only: live, a conflict means a real person typed there, so the run leaves their value alone
      if (theirs.length && !LIVE) out = (await call(acct, 'webRun', ['memberSet', { code, fields: theirs.map(x => ({ field: x.field, value: list.find(y => y.field === x.field).value, seen: x.conflict })) }])).value.result.fields;
      if (out.some(x => 'value' in x)) { R.saves.written++; R.saves.ms.push(Date.now() - at); if (!LIVE) R.events.push({ bin: mine.binome, v: W.binV[mine.binome], at, by: i }); }
      offWrite(true);
    } catch (e) { if (e.code === 'BUSY') R.saves.busy++; else R.saves.failed++; offWrite(false); }
  };
  const form = async () => { // the interview form: open (interviewGet), then save (always direct)
    const code = LIVE ? targets.interview : String(pick(me.state.candidates || [{}]).Code || '');
    if (!code) return;
    R.forms.sent++;
    try {
      const got = (await call(acct, 'webRun', ['interviewGet', { code }])).value.result;
      // live: only a dashboard row this account saved last, re-saved with its own answers (its Edited at / by move)
      if (LIVE && !(got.source === 'Dashboard' && got.answers && String(got.editedBy || got.submittedBy || '').toLowerCase() === String(acct.email).toLowerCase())) return;
      await call(acct, 'webRun', ['interviewSave', { code, answers: got.answers || {}, seen: got.stamp || '' }]);
      R.forms.saved++;
    } catch (e) { if (e.code === 'BUSY') R.forms.busy++; else if (e.code === 'CONFLICT') R.forms.conflict++; else R.forms.failed++; }
  };
  const alertAct = async () => { // Alerts: Snooze 4 h or Mute an open one, Unmute a held one
    // live: open targets, and held ones only while held the way this run left them (one a real admin held stays theirs)
    const list = (me.state.alerts || []).map(a => ({ id: a.id, status: 'OPEN' })).concat((me.state.muted || []).filter(a => !LIVE || targets.lastSet[a.id] === a.status))
      .filter(a => !targets.alerts || targets.alerts.includes(a.id));
    if (!list.length) return;
    const a = pick(list), seen = a.status || 'OPEN', op = seen === 'OPEN' ? pick(['snooze', 'mute']) : 'unmute', at = Date.now();
    R.actions.sent++;
    const to = op === 'snooze' ? 'SNOOZED' : op === 'mute' ? 'MUTED' : 'OPEN';
    if (await accept([{ kind: 'alert', alert: a.id, op, seen, at, until: op === 'snooze' ? at + 4 * 3600e3 : undefined, built: me.state.built }])) { if (targets.lastSet) targets.lastSet[a.id] = to; return; }
    me.busy = true;
    try {
      const out = await run('quick', { op, ids: [a.id], for: '4h' });
      if (out.result && out.result.done && out.result.done.length) { R.actions.done++; if (targets.lastSet) targets.lastSet[a.id] = to; R.events.push({ admin: true, at, wrote: at, by: i }); } else R.actions.stale++;
      R.actions.ms.push(Date.now() - at);
      offWrite(true);
    } catch (e) { if (e.code === 'BUSY') R.actions.busy++; else R.actions.failed++; offWrite(false); }
    finally { me.busy = false; }
    await refresh();
  };
  const settingAct = async () => {
    if (LIVE && !targets.setting) return; // live: only the account's writer
    const s = (me.state.settingsAll || []).find(x => x.key === SETTING);
    if (!s) return;
    const [x, y] = SAFE_SETTINGS[SETTING], value = String(s.value) === x ? y : x, at = Date.now();
    R.settings.sent++;
    if (await accept([{ kind: 'setting', key: SETTING, value, seen: String(s.value), at, built: me.state.built }])) return;
    me.busy = true;
    try { await run('saveSettings', { values: { [SETTING]: value } }); R.settings.ok++; } catch (e) { R.settings.failed++; } finally { me.busy = false; }
    await refresh();
  };
  const every = async (minutes, fn) => {
    if (!minutes) return;
    while (!stop && el() < until) {
      await sleep(Math.min(expo(minutes * 60000), until - el()));
      if (stop || el() >= until || !me.state) continue;
      while (me.busy) await sleep(200);
      // one action going wrong is counted and the person carries on: a throw here once ended a live run before its put-back
      try { await fn(); } catch (e) { R.actionErrors.push(String(e && e.message).slice(0, 120)); }
    }
  };

  return (async () => {
    await sleep(Math.random() * STAGGER); // people open the page at different moments, so their polls never tick together
    const t0 = Date.now();
    try { await call(acct, 'webAccess', [], undefined, POLL_TIMEOUT); await refresh(); if (me.state) R.boots[role].push(Date.now() - t0); } catch (e) { /* the error screen */ }
    const timer = setInterval(tick, (member ? MEMBER_PULSE : ADMIN_PULSE) / SCALE);
    const writers = !WRITES ? [] : member || acct.binome ? [every(SAVE_EVERY, save), targets.interview || !LIVE ? every(FORM_EVERY, form) : null] : [];
    if (WRITES && !member) writers.push(every(ALERT_EVERY, alertAct), SETTING ? every(SETTING_EVERY, settingAct) : null);
    while (!stop && el() < until) await sleep(Math.min(1000, until - el()));
    await Promise.all(writers.concat(extra));
    clearInterval(timer);
    // after the run: keep polling the record until this person's pending changes ended (the page would, tab open)
    for (let k = 0; k < 60 && hasPending(me.rec); k++) { await sleep(5000); await call(acct, 'webPulse', [true], { rec: 2 }, POLL_TIMEOUT).then(r => setRec(r.rec)).catch(() => {}); }
    return me;
  })();
}

/* ---------- live: who is who, the plan, the switch, putting things back ---------- */

async function readAccounts(lines) {
  const out = [];
  for (const [n, raw] of lines.entries()) {
    const a = { n: n + 1, cookie: decodeURIComponent(raw), perMin: {} };
    try {
      const r = await call(a, 'webAccess', [], undefined, POLL_TIMEOUT), v = r.value || {};
      Object.assign(a, { email: v.email, ok: v.ok, role: v.ok ? v.role || 'admin' : '', owner: !!v.owner, binome: v.binome || '' });
      if (CHECK || !v.ok) { out.push(a); continue; }
      const s = (await call(a, 'webState')).value || {};
      a.state = s;
      // the author's record, switch on or off: anything still pending or unanswered from an earlier run shows in the plan
      const pr = await call(a, 'webPulse', [true], { rec: 2 }, POLL_TIMEOUT).catch(() => null), rec = (pr && pr.rec) || {};
      a.left = { pending: Object.keys(rec).filter(c => rec[c].state === 'pending').length, dropped: Object.keys(rec).filter(c => rec[c].state === 'dropped' && !rec[c].addressed).length };
      if (a.role === 'admin' && s.member && s.member.binome) { a.binome = s.member.binome; a.slice = s.member; } else if (a.role === 'member') a.slice = s;
    } catch (e) { a.error = e.code === 'SIGNED_OUT' || e.code === 'EXPIRED' || e.status === 401 ? 'session ended (' + (e.code || e.message) + '): sign in again and replace this line' : e.message; }
    out.push(a);
  }
  return out;
}
function liveTargets(accts) {
  const admin = accts.find(a => a.role === 'admin' && a.state), st = admin && admin.state;
  const t = { testMode: st ? st.settings && st.settings.testMode === true : null, switchOn: st ? !!st.pending : null, codes: null, alerts: null, interview: '', original: { notes: {}, alerts: {}, setting: null }, lastSet: {} };
  // My binome: the given codes, else two candidates of each binome a cookie sits in
  t.codes = [];
  accts.filter(a => a.slice).forEach(a => {
    const cands = (a.slice.candidates || []).map(c => String(c.Code)), mine = CODES.length ? cands.filter(c => CODES.includes(c)) : cands.slice(0, 2);
    mine.forEach(c => { t.codes.push(c); t.original.notes[c] = { acct: a, value: String((a.slice.candidates.find(x => String(x.Code) === c) || {}).Notes || '') }; });
  });
  // Alerts: open ones about a candidate, not manual edits (Snooze refuses those)
  if (st) {
    t.alerts = (st.alerts || []).filter(a => a.code && a.type !== 'MANUAL_EDIT').slice(0, ALERT_TARGETS).map(a => a.id);
    t.alerts.forEach(id => { t.original.alerts[id] = 'OPEN'; });
    const s = (st.settingsAll || []).find(x => x.key === SETTING);
    if (SETTING && s) t.original.setting = String(s.value);
  }
  t.interview = String(INTERVIEW);
  return t;
}
function plan(accts, t) {
  const admins = accts.filter(a => a.role === 'admin'), members = accts.filter(a => a.role === 'member');
  const nA = admins.length ? ADMINS : 0, nM = members.length ? MEMBERS : 0;
  const perAcct = accts.map(a => { const isA = a.role === 'admin', n = isA ? Math.ceil(nA / admins.length) : a.role === 'member' ? Math.ceil(nM / members.length) : 0; return { a, n, perMin: n * (isA ? 60000 / ADMIN_PULSE : 60000 / MEMBER_PULSE) * 1.1 }; });
  console.log(`\nPlan: ${LIVE ? 'LIVE ' + LIVE : 'model'}, ${MINUTES} min, ${nA} admins (poll ${ADMIN_PULSE / 1000} s) and ${nM} members (poll ${MEMBER_PULSE / 1000} s).`);
  console.log('  Each page: open = webAccess → webPulse → webState; each poll = webPulse (+ the pending record while changes are pending); webPulse + webState when the version moves.');
  if (LIVE) perAcct.forEach(({ a, n, perMin }) => console.log(`  cookie ${a.n}: ${a.email || '?'} ${a.error ? '(' + a.error + ')' : (a.role || 'no access') + (a.owner ? ', owner' : '') + (a.binome ? ', binome ' + a.binome : '')}: ${n} virtual ${a.role === 'admin' ? 'admins' : 'members'}, ~${Math.round(perMin)} calls/min${perMin > 450 ? '  ! near Google\'s ~600/min per account' : ''}${a.left ? (a.left.pending || a.left.dropped ? `  ! record holds ${a.left.pending} pending, ${a.left.dropped} unanswered drops from before` : ', record clear') : ''}`));
  if (LIVE && !members.length && MEMBERS) console.log('  ! no member cookie: no member polls in this run (an admin in a binome still saves through My binome).');
  console.log(`  Openings spread over the first ${STAGGER / 60000} min.`);
  const found = t.switchOn === null ? '?' : t.switchOn ? 'on' : 'off';
  console.log(`  Pending changes: ${PENDING === 'keep' ? 'switch left as it is (' + found + ')' : 'switch ' + PENDING + ' at the start'}${OFF_AT ? `, off at minute ${OFF_AT} (then each writer saves once, direct)` : ''}${PENDING !== 'keep' || OFF_AT ? `, ${END === 'found' ? 'put back as found (' + found + ')' : 'left ' + END} at the end` : ''}.`);
  if (LIVE && DROP_AT) console.log(`  Minute ${DROP_AT}: the owner drops the cached slice of ${[...new Set(accts.filter(a => a.slice).map(a => a.binome))].join(', ') || 'no binome'} (TEST_MODE only): those members read their sheet until the next sync.`);
  if (!WRITES) { console.log('  Writes: none (read-only). Add --writes for saves and alert actions.'); return; }
  console.log(`  Writes${LIVE ? ` (TEST_MODE ${t.testMode ? 'on' : 'OFF: the run will refuse'})` : ''}:`);
  console.log(`    My binome Save every ~${SAVE_EVERY} min per ${LIVE ? 'writer' : 'member'}${LIVE ? `: Notes of ${t.codes.join(', ') || 'no candidate'} (toggled "${MARK}", put back at the end)` : ' (1–3 fields)'}`);
  console.log(`    Interview form every ~${FORM_EVERY} min: ${LIVE ? (t.interview ? t.interview + ', re-saved with its own answers if this account saved its dashboard form (its Edited at / by move)' : 'none (--interview CODE)') : 'interviewGet + interviewSave'}`);
  console.log(`    Alert action every ~${ALERT_EVERY} min per admin: Snooze 4 h / Mute / Unmute${LIVE ? ' on ' + ((t.alerts || []).join(', ') || 'no alert') + ' (put back to Open at the end)' : ''}`);
  console.log(`    Setting: ${SETTING ? SETTING + ' ' + SAFE_SETTINGS[SETTING].join(' <-> ') + ' every ~' + SETTING_EVERY + ' min' + (LIVE ? ' (put back to ' + t.original.setting + ')' : '') : 'none'}`);
  console.log('    No mail: none of these actions sends any.');
}
async function setSwitch(accts, on, why) {
  const o = accts.find(a => a.owner && a.role === 'admin');
  if (!o) { console.log(`! ${why}: turn pending changes ${on ? 'on' : 'off'} now in Settings › General (no owner cookie here).`); return false; }
  return call(o, 'webRun', ['pendingSwitch', { on }]).then(() => (console.log(`  ${why}: pending changes ${on ? 'on' : 'off'} (${new Date().toISOString().slice(11, 19)} UTC)`), true)).catch(e => (console.log(`! ${why}: switch refused: ${e.message}`), false));
}
async function dropSlices(accts) { // #101 live: the binomes the cookies sit in read their sheets until the next sync republishes them
  const o = accts.find(a => a.owner && a.role === 'admin'), bins = [...new Set(accts.filter(a => a.slice).map(a => a.binome))];
  if (!o) return console.log('! drop slices: no owner cookie here');
  for (const binome of bins) {
    await call(o, 'webRun', ['dropSlice', { binome }]).then(() => { DROP_T = DROP_T || Date.now(); R.dropped.push(binome); console.log(`  minute ${DROP_AT}: ${binome}'s cached slice dropped (${new Date().toISOString().slice(11, 19)} UTC)`); })
      .catch(e => console.log(`! drop ${binome}: ${e.message}`));
  }
}
async function restore(accts, t) { // live: what the run changed goes back, read from a fresh state after the sync published it
  console.log('Putting things back (waiting 70 s for the sync to publish the last changes)…');
  await sleep(70000);
  const admin = accts.find(a => a.role === 'admin' && a.state);
  for (const code of Object.keys(t.original.notes)) {
    const { acct, value } = t.original.notes[code];
    const s = (await call(acct, 'webState').catch(() => null)), c = s && (acct.role === 'admin' ? s.value.member : s.value);
    const now = c && (c.candidates || []).find(x => String(x.Code) === code);
    const cur = now && String(now.Notes || '');
    if (!now || same(cur, value)) continue;
    if (!same(cur, addMark(value))) { console.log('  ' + code + ' Notes changed by someone during the run: left as is'); continue; }
    await call(acct, 'webRun', ['memberSet', { code, fields: [{ field: 'Notes', value, seen: cur }] }]).then(() => console.log('  ' + code + ' Notes put back')).catch(e => console.log('! ' + code + ' Notes: ' + e.message));
  }
  if (!admin) return;
  const s = (await call(admin, 'webState').catch(() => null)), st = s && s.value;
  if (!st) return console.log('! could not read the state: check the alerts ' + (t.alerts || []).join(', ') + ' by hand');
  for (const id of t.alerts || []) {
    if ((st.alerts || []).some(a => a.id === id)) continue;
    const held = (st.muted || []).find(a => a.id === id);
    // only an alert still held the way this run left it: one a real admin snoozed or muted since stays as they left it
    if (!held || held.status !== t.lastSet[id]) { console.log('  ' + id + (held ? ' held by someone else: left as is' : ' no longer open or held: left as is')); continue; }
    await call(admin, 'webRun', ['quick', { op: 'unmute', ids: [id] }]).then(() => console.log('  ' + id + ' back to Open')).catch(e => console.log('! ' + id + ': ' + e.message));
  }
  const cur = (st.settingsAll || []).find(x => x.key === SETTING);
  if (t.original.setting !== null && cur && String(cur.value) !== t.original.setting && SAFE_SETTINGS[SETTING].includes(String(cur.value))) await call(admin, 'webRun', ['saveSettings', { values: { [SETTING]: t.original.setting } }]).then(() => console.log('  ' + SETTING + ' put back to ' + t.original.setting)).catch(e => console.log('! ' + SETTING + ': ' + e.message));
}

/* ---------- report ---------- */

function report(accts) {
  const by = {};
  calls.forEach(c => { (by[c.fn] = by[c.fn] || []).push(c); });
  const rows = Object.keys(by).sort().map(fn => {
    const a = by[fn], ok = a.filter(c => c.kind === 'ok').map(c => c.ms), kinds = {};
    a.filter(c => c.kind !== 'ok').forEach(c => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
    return { fn, calls: a.length, ok: ok.length, kinds, p50: pct(ok, 50), p95: pct(ok, 95), p99: pct(ok, 99), max: pct(ok, 100) };
  });
  const answered = ['ok', 'busy', 'conflict', 'direct', 'refused']; // errors the page shows or handles: the call did answer
  const lost = calls.filter(c => !answered.includes(c.kind));
  // a change on someone else's screen: admins once a state built at or after the write came back, a partner once their binome's version did
  const lag = { admin: [], adminPending: [], partner: [], partnerPending: [] };
  R.accepted.forEach(x => { // pending changes that applied: from the click, as the other screens show them
    const wrote = LIVE ? (R.ended.find(y => y.id === x.id && y.state === 'applied') || {}).wrote : W.judged[x.id] === 'applied' && W.wrote[x.id];
    if (!wrote) return;
    if (x.kind !== 'field') R.events.push({ admin: true, pending: true, at: x.at, wrote, by: x.i });
    else if (!LIVE && W.fields[x.id]) R.events.push({ pending: true, bin: W.fields[x.id].b, v: W.fields[x.id].v, at: x.at, by: x.i });
  });
  R.events.forEach(ev => {
    const seen = {};
    R.seen.forEach(o => {
      if (o.i === ev.by || seen[o.i] || o.at < ev.at) return;
      if (ev.admin ? o.built !== undefined && o.built >= ev.wrote : o.bin === ev.bin && o.v >= ev.v) { seen[o.i] = 1; lag[(ev.admin ? 'admin' : 'partner') + (ev.pending ? 'Pending' : '')].push(o.at - ev.at); }
    });
  });
  const ended = { applied: 0, met: 0, dropped: 0 }, lostIds = [];
  if (!LIVE) { // every accepted change ends once: applied, met or dropped, or replaced by the author's next change on that cell
    R.accepted.forEach(x => { const st = W.judged[x.id]; if (st) ended[st]++; else lostIds.push(x.id); });
  } else R.accepted.forEach(x => { const e = R.ended.find(y => y.id === x.id); if (e) ended[e.state]++; else lostIds.push(x.id); });
  // replaced: the author's next change on that cell, accepted while this one was pending, took it over (the accept step's merge)
  const replaced = lostIds.filter(id => { const x = R.accepted.find(y => y.id === id); return R.accepted.some(y => y.email === x.email && y.cell === x.cell && y.at > x.at); }).length;
  const inSheet = R.accepted.map(x => { const w = LIVE ? (R.ended.find(y => y.id === x.id) || {}).wrote : W.wrote[x.id]; return w ? w - x.at : null; }).filter(v => v !== null);
  const authorSees = R.ended.map(e => e.seenMs);
  const mins = MINUTES, perHour = n => n / mins * 60, idle = (24 - HOURS) * 60 * 30, month = (n, base) => Math.round(perHour(n) * HOURS * 30 + idle * base);
  const peak = {};
  accts.forEach(a => { peak[a.email] = Math.max(0, ...Object.values(a.perMin)); });
  const r = { mode: LIVE ? 'live ' + LIVE : 'model', minutes: mins, admins: R.boots.admin.length + '/' + R.planned.admin, members: R.boots.member.length + '/' + R.planned.member, rows,
    total: calls.length, lost: lost.length, lostKinds: lost.reduce((o, c) => (o[c.kind] = (o[c.kind] || 0) + 1, o), {}),
    boot: { admin: { p50: pct(R.boots.admin, 50), p95: pct(R.boots.admin, 95) }, member: { p50: pct(R.boots.member, 50), p95: pct(R.boots.member, 95) } },
    saves: Object.assign({}, R.saves, { ms: undefined, p50: pct(R.saves.ms, 50), p95: pct(R.saves.ms, 95) }), forms: R.forms,
    actions: Object.assign({}, R.actions, { ms: undefined, p50: pct(R.actions.ms, 50), p95: pct(R.actions.ms, 95) }), settings: R.settings,
    lag: Object.keys(lag).reduce((o, k) => (o[k] = { n: lag[k].length, p50: pct(lag[k], 50), p95: pct(lag[k], 95) }, o), {}),
    pending: { accepted: R.accepted.length, directFallback: R.direct, acceptP50: pct(R.acceptMs, 50), acceptP95: pct(R.acceptMs, 95), ended, replaced, lost: lostIds.length - replaced,
      appliedTwice: LIVE ? null : W.appliedTwice, dropsShown: R.drops, inSheetP50: pct(inSheet, 50), inSheetP95: pct(inSheet, 95), authorSeesP95: pct(authorSees, 95) },
    afterOff: OFF_T === null ? null : Object.assign({ atMin: +((OFF_T - T0) / 60000).toFixed(1) }, R.afterOff),
    sheetReads: Object.assign({ dropped: R.dropped, atMin: DROP_T === null ? null : +((DROP_T - T0) / 60000).toFixed(1) }, R.sheetReads),
    peakCallsPerMinPerAccount: Math.max(0, ...Object.values(peak)), machineStallS: +(maxStallMs / 1000).toFixed(1),
    actionErrors: R.actionErrors, errorsSample: [...new Set(lost.map(c => String(c.err).slice(0, 120)))].slice(0, 5) };
  if (!LIVE) {
    const lk = x => ({ waitP95: pct(x.waits, 95), max: pct(x.waits, 100), refused: x.refused });
    r.locks = { script: lk(L.script), document: lk(L.doc) };
    r.sync = { runs: W.sync.runs, skipped: W.sync.skipped, avgS: +(W.sync.ms.reduce((a, b) => a + b, 0) / Math.max(1, W.sync.ms.length) / 1000).toFixed(1) };
    // hours a day with everyone on the page before a free limit is reached (the idle sync's 1 call / 1 command a minute included)
    const hoursFor = (n, limit, base) => +Math.max(0, (limit - 43200 * base) / 30 / Math.max(1, perHour(n) - 60 * base)).toFixed(1);
    r.month = { hoursPerDay: HOURS, vercelInvocations: month(count.invocations, 1), redisCommands: month(F.log.redis, 1), queueOps: month(count.sends + count.deliveries, 0),
      hoursUntil: { vercel1M: hoursFor(count.invocations, 1e6, 1), redis500K: hoursFor(F.log.redis, 5e5, 1), queues1M: hoursFor(count.sends + count.deliveries, 1e6, 0) },
      redisByCommand: count.redis, invocationsPerMin: Math.round(count.invocations / mins) };
    r.concurrencyRefused = W.refusedConcurrency;
  }
  return r;
}
function print(r) {
  const f = v => (v == null ? '-' : (v / 1000).toFixed(1) + 's');
  console.log(`\n${r.mode}: ${r.minutes} min, admins ${r.admins} and members ${r.members} loaded`);
  console.log(`  ${r.total} calls, ${r.lost} not answered ${JSON.stringify(r.lostKinds)}. Opening: admins p50 ${f(r.boot.admin.p50)} p95 ${f(r.boot.admin.p95)}, members p50 ${f(r.boot.member.p50)} p95 ${f(r.boot.member.p95)}`);
  console.log('  call                     calls     ok      p50     p95     p99     max  other answers');
  r.rows.forEach(x => console.log('  ' + x.fn.padEnd(24) + String(x.calls).padStart(6) + String(x.ok).padStart(7) + [x.p50, x.p95, x.p99, x.max].map(v => f(v).padStart(8)).join('') + (Object.keys(x.kinds).length ? '  ' + JSON.stringify(x.kinds) : '')));
  const s = r.saves, a = r.actions, p = r.pending;
  console.log(`  My binome saves: ${s.sent} clicks (pending ones counted below); direct: ${s.written} written, ${s.conflict} conflicts (model: then Use mine; live: left alone), ${s.busy} refused BUSY, ${s.failed} failed; answered p50 ${f(s.p50)} p95 ${f(s.p95)}`);
  console.log(`  interview forms: ${r.forms.sent} opened, ${r.forms.saved} saved, ${r.forms.busy} BUSY, ${r.forms.conflict} conflicts, ${r.forms.failed} failed`);
  console.log(`  alert actions: ${a.sent} clicks; direct: ${a.done} done, ${a.stale} already changed, ${a.busy} BUSY, ${a.failed} failed; answered p50 ${f(a.p50)} p95 ${f(a.p95)}. Settings: ${r.settings.sent} sent`);
  const g = x => `p50 ${f(x.p50)} p95 ${f(x.p95)} (${x.n})`;
  console.log(`  from the click to the partner's screen: direct ${g(r.lag.partner)}, pending ${g(r.lag.partnerPending)}`);
  console.log(`  from the click to the other admins' screens: direct ${g(r.lag.admin)}, pending ${g(r.lag.adminPending)} (pending: at the next sync's publish)`);
  console.log(`  pending: ${p.accepted} accepted (${p.directFallback} went direct), accept p50 ${f(p.acceptP50)} p95 ${f(p.acceptP95)}; ended ${JSON.stringify(p.ended)}, ${p.replaced} replaced by a later change, ${p.lost} LOST${p.appliedTwice !== null ? `, ${p.appliedTwice} applied twice` : ''}; ${p.dropsShown} drops shown`);
  console.log(`  pending: click → in the sheet p50 ${f(p.inSheetP50)} p95 ${f(p.inSheetP95)}; the author's page sees it ended p95 ${f(p.authorSeesP95)}`);
  const o = r.afterOff;
  if (o) console.log(`  switch off at minute ${o.atMin}: ${o.pulsesOn} polls sent after it still said on; ${o.accepted} saves accepted after it (pages that had not polled yet: counted in "ended" above); ${o.direct} direct writes after it, ${o.answered} answered`);
  const sr = r.sheetReads;
  console.log(`  My binome read from the binome sheet: ${sr.ok} answered, ${sr.refused} refused${sr.dropped.length ? ` (slices of ${sr.dropped.join(', ')} dropped at minute ${sr.atMin})` : ''}`);
  console.log(`  busiest account: ${r.peakCallsPerMinPerAccount} calls in one minute (Google: ~600 a minute per account)`);
  if (r.locks) {
    console.log(`  locks: script wait p95 ${f(r.locks.script.waitP95)} max ${f(r.locks.script.max)}, ${r.locks.script.refused} refused; document wait p95 ${f(r.locks.document.waitP95)} max ${f(r.locks.document.max)}, ${r.locks.document.refused} refused`);
    console.log(`  sync: ${r.sync.runs} runs, ${r.sync.skipped} skipped (lock busy), ${r.sync.avgS} s average with its lock wait`);
    const m = r.month;
    console.log(`  a month with everyone on the page ${m.hoursPerDay} h a day (idle the rest): Vercel invocations ${m.vercelInvocations} (Hobby: 1M), Redis commands ${m.redisCommands} (free: 500K), Queues operations ${m.queueOps} (free: 1M)`);
    console.log(`  hours a day before a limit: Vercel ${m.hoursUntil.vercel1M} h, Redis ${m.hoursUntil.redis500K} h, Queues ${m.hoursUntil.queues1M} h; ${m.invocationsPerMin} invocations a minute; Redis by command ${JSON.stringify(m.redisByCommand)}`);
  }
  if (r.machineStallS > 2) console.log(`  ! this machine stalled for ${r.machineStallS} s during the run: calls in flight then are inflated; run again`);
  if (r.errorsSample.length) console.log('  errors seen: ' + r.errorsSample.join(' | '));
  if (r.actionErrors.length) console.log(`  ! ${r.actionErrors.length} actions threw in the load script itself: ${[...new Set(r.actionErrors)].slice(0, 3).join(' | ')}`);
}

/* ---------- main ---------- */

(async () => {
  const until = MINUTES * 60000;
  let accts, t = { codes: null, alerts: null, interview: '', original: { notes: {}, alerts: {}, setting: null } };
  if (LIVE) {
    BASE = String(LIVE).replace(/\/$/, '');
    const lines = fs.readFileSync(opt('cookies', 'cookies.txt'), 'utf8').split(/\r?\n/).map(s => s.trim().replace(/^vic_s=/, '')).filter(Boolean);
    accts = await readAccounts(lines);
    if (CHECK) {
      accts.forEach(a => console.log(`cookie ${a.n}: ${a.error || `${a.email}, ${a.ok ? a.role + (a.owner ? ' (owner)' : '') : 'no access'}`}`));
      if (accts.some(a => a.error)) process.exitCode = 1;
      return;
    }
    if (accts.some(a => a.error)) { accts.filter(a => a.error).forEach(a => console.error(`cookie ${a.n}: ${a.error}`)); process.exitCode = 1; return; }
    t = liveTargets(accts);
    plan(accts, t);
    if (DRY) return;
    if (WRITES && t.testMode !== true) { console.error('TEST_MODE is not on (or no admin cookie to read it): this run writes, so it stops here.'); process.exitCode = 1; return; }
    accts = accts.filter(a => a.ok);
  } else {
    if (DRY) { plan([{ role: 'admin' }, { role: 'member' }], { switchOn: PENDING !== 'off' }); return; }
    patchFetch();
    accts = await startModel();
    syncLoop(P);
  }
  const switchWas = t.switchOn, endOn = END === 'found' ? switchWas : END === 'on';
  // live: whatever happens, the put-back and the switch run before the process ends
  let cleaning = null; // one put-back, which every way out waits for
  const cleanup = () => cleaning || (cleaning = (async () => {
    if (!LIVE) return; stop = true;
    if (WRITES) await restore(accts, t).catch(e => console.log('! put-back failed: ' + e.message));
    if ((PENDING !== 'keep' || OFF_AT || END !== 'found') && endOn !== null) await setSwitch(accts, endOn, END === 'found' ? 'end, as found' : 'end, as asked');
  })());
  if (LIVE) ['uncaughtException', 'unhandledRejection'].forEach(ev => process.on(ev, e => { console.error('! crashed: ' + (e && e.stack || e)); cleanup().then(() => { try { print(report(accts)); } catch (x) { /* the put-back is what matters */ } }).finally(() => process.exit(1)); }));
  if (LIVE && PENDING !== 'keep') await setSwitch(accts, PENDING === 'on', 'start');
  // OFF_T once the switch really is off: a poll sent after it must say off (mark 10)
  if (OFF_AT) setTimeout(() => (LIVE ? (!stop && setSwitch(accts, false, 'minute ' + OFF_AT).then(ok => { if (ok) OFF_T = Date.now(); })) : (W.switchOn = false, OFF_T = Date.now())), OFF_AT * 60000 / SCALE);
  if (LIVE && WRITES && DROP_AT) setTimeout(() => !stop && dropSlices(accts), DROP_AT * 60000);
  process.on('SIGINT', () => { if (stop) process.exit(130); stop = true; console.log('\nStopping: the people finish, then things are put back (Ctrl-C again to quit at once).'); });

  const admins = accts.filter(a => a.role === 'admin'), members = accts.filter(a => a.role === 'member');
  const people = [];
  R.planned = { admin: admins.length ? ADMINS : 0, member: members.length ? MEMBERS : 0 };
  for (let i = 0; admins.length && i < ADMINS; i++) people.push(['admin', admins[i % admins.length]]);
  for (let i = 0; members.length && i < MEMBERS; i++) people.push(['member', members[i % members.length]]);
  // live: only the first virtual person on each account writes (one person per Google account); every one of them reads
  const writer = new Set();
  const targetsFor = a => (LIVE ? (writer.has(a) ? null : (writer.add(a), { codes: t.codes, alerts: t.alerts, interview: t.interview, setting: true, lastSet: t.lastSet, orig: Object.keys(t.original.notes).reduce((o, c) => (o[c] = t.original.notes[c].value, o), {}) })) : {});
  console.log(`Running ${people.length} people for ${MINUTES} min${SCALE > 1 ? ` (model, ${SCALE}× real time: ~${Math.round(MINUTES * 60 / SCALE)} s)` : ''}…`);
  const runs = people.map(([role, a], i) => { const tg = targetsFor(a); return person(i, role, a, until, tg || { codes: [], alerts: [], lastSet: {} }); });
  await Promise.all(runs);
  stop = true;
  if (!LIVE) for (let k = 0; k < 600 && inflight.size; k++) await sleep(1000); // the queue drains
  await cleanup();
  const r = report(accts);
  print(r);
  if (opt('out', null)) fs.writeFileSync(opt('out'), JSON.stringify(r, null, 2));
  if (opt('assert', false)) { // the self-check (npm test): every call answered, every accepted change ended
    const bad = [r.lost && 'calls not answered', r.pending.lost && 'pending changes lost', r.pending.appliedTwice && 'applied twice', r.actionErrors.length && 'the script threw', !r.pending.accepted && 'no pending change', !r.saves.written && 'no direct save'].filter(Boolean);
    if (bad.length) { console.error('load self-check failed: ' + bad.join(', ')); process.exitCode = 1; }
  }
  if (srv) srv.close();
  process.exit(process.exitCode || 0);
})();
