// Load test: N editors on the dashboard at once, each running the real page loop (frontend/src/lib/vic/store.ts):
// boot = webAccess → webPulse → webState; every PULSE_MS: webAccess + webPulse, webState when the pulse moved;
// now and then an action (webRun 'quick') followed by a refresh. Every call goes through the real proxy (web/api/run.js).
//
//   node test/load.js                         model: 100 editors, 10 simulated minutes, Apps Script stand-in (below)
//   node test/load.js --accounts 1            same 100 editors all on ONE Google account
//   node test/load.js --live https://vic-recruitment.vercel.app --cookies cookies.txt [--users 100 --minutes 3]
//                                             production, READ-ONLY (never writes): one vic_s cookie value per line,
//                                             editor i uses line i % lines. The cookies are yours to paste; never commit them.
// Options: --users 100 --accounts <users> --minutes 10 --scale 10 --pulse-ms 2000 --write-every 120 (s per editor)
//          --write-hold 6 --sync-hold 20 --sync-every 60 --sheet-edit-every 60 (s) --state-ms <median override>
//          --no-access-tick (skip webAccess on each tick) --out results.json
//
// The Apps Script stand-in is calibrated on production: service times are resampled from the proxy's own log lines
// (Vercel runtime logs, 2026-10-05, owner account, 273 interviewees). It enforces Google's documented limits: 30
// simultaneous executions per user, 1,000 per script; LockService.tryLock(30 s) on every write and on the sync trigger,
// as in Sheets.gs withLock_. NOT modelled: slow-down of Sheets/Drive when many executions read the same file at once.
// That only shows in --live, so the model is a lower bound on wait times.
const http = require('http'), crypto = require('crypto'), fs = require('fs');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const LIVE = opt('live', null);
// a numeric option: absent -> default; present without a number, or negative -> stop, instead of a run that looks valid
const num = (k, d) => { const v = opt(k, d), n = +v; if (v === true || !Number.isFinite(n) || n < 0) { console.error(`--${k}: expected a non-negative number, got ${v === true ? 'nothing' : v}`); process.exit(2); } return n; };
const USERS = num('users', 100), ACCOUNTS = num('accounts', USERS), MINUTES = num('minutes', LIVE ? 3 : 10);
const SCALE = LIVE ? 1 : num('scale', 10); // the model runs SCALE× faster than real time; reported times are scaled back
const PULSE_MS = num('pulse-ms', 2000), ACCESS_TICK = !opt('no-access-tick', false);
const WRITE_EVERY = num('write-every', 120), WRITE_HOLD = num('write-hold', 6) * 1000;
const SYNC_HOLD = num('sync-hold', 20) * 1000, SYNC_EVERY = num('sync-every', 60) * 1000, SHEET_EDIT_EVERY = num('sheet-edit-every', 60);
const LOCK_WAIT = 30000, PER_USER = 30, PER_SCRIPT = 1000;

// Production, ms per call as logged by web/api/run.js (2026-10-05 19:06–19:10 UTC).
const SAMPLES = {
  webAccess: [1075, 766, 1177, 1528, 1313, 888, 1940, 1740],
  webPulse: [1167, 1702, 1176, 1445, 1194, 1040, 1091, 2586, 2349, 979, 1403, 1410, 1638, 851, 1205, 1427],
  webState: [6400, 7773, 9048, 9837, 9239, 9989, 9498],
};
if (opt('state-ms', null)) { const m = median(SAMPLES.webState), k = +opt('state-ms') / m; SAMPLES.webState = SAMPLES.webState.map(v => v * k); }
const pick = a => a[Math.floor(Math.random() * a.length)] * (0.9 + Math.random() * 0.2);
const expo = meanMs => -Math.log(1 - Math.random()) * meanMs;

const T0 = Date.now();
const simNow = () => (Date.now() - T0) * SCALE;           // simulated ms since start
const sleep = simMs => new Promise(r => setTimeout(r, simMs / SCALE));
// The machine itself can stall (sleep, power saving): every call in flight then looks slow. Spot it and say so.
let lastBeat = Date.now(), maxStallMs = 0;
setInterval(() => { const now = Date.now(); maxStallMs = Math.max(maxStallMs, now - lastBeat - 100); lastBeat = now; }, 100).unref();
function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function pct(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); }

/* ---------- the Apps Script stand-in (model mode only) ---------- */

const G = { running: {}, script: 0, peakScript: 0, peakUser: 0, refusedConcurrency: 0, master: Date.now(), commits: [],
  syncRuns: 0, syncSkipped: 0, triggerMs: 0, sheetEdits: [], sheetLag: [] };
const lock = { held: false, q: [] };
function acquire(waitMs) {
  if (!lock.held) { lock.held = true; return Promise.resolve(true); }
  return new Promise(res => {
    const w = { res, t: setTimeout(() => { lock.q.splice(lock.q.indexOf(w), 1); res(false); }, waitMs / SCALE) };
    lock.q.push(w);
  });
}
function release() {
  const w = lock.q.shift();
  if (w) { clearTimeout(w.t); w.res(true); } else lock.held = false;
}
function commit() { G.master = Date.now(); G.commits.push(simNow()); }

async function execute(user, fn, args) {
  if ((G.running[user] || 0) >= PER_USER || G.script >= PER_SCRIPT) {
    G.refusedConcurrency++; await sleep(150);
    throw new Error('There are too many scripts running simultaneously for this Google user account.');
  }
  G.running[user] = (G.running[user] || 0) + 1; G.script++;
  G.peakUser = Math.max(G.peakUser, G.running[user]); G.peakScript = Math.max(G.peakScript, G.script);
  try {
    if (fn === 'webAccess') { await sleep(pick(SAMPLES.webAccess)); return { ok: true, v: 2 }; }
    if (fn === 'webPulse') { await sleep(pick(SAMPLES.webPulse)); return G.master; }
    if (fn === 'webState') { const snap = simNow(); await sleep(pick(SAMPLES.webState)); return { snap }; }
    if (fn === 'webRun') { // access_() outside the lock, then withLock_ (tryLock 30 s) around loadCtx_ + the change + save
      await sleep(pick(SAMPLES.webAccess));
      if (!(await acquire(LOCK_WAIT))) return { messages: ['Another update is already running. Please try again in a minute.'], result: null };
      try { await sleep(WRITE_HOLD * (0.8 + Math.random() * 0.4)); commit(); return { messages: ['Done'], result: { id: args[1] && args[1].id } }; }
      finally { release(); }
    }
    throw new Error('Unknown function ' + fn);
  } finally { G.running[user]--; G.script--; }
}

// The 1-minute sync trigger, as the sheet owner: waits up to 30 s for the lock, pulls the binome sheets, saves.
async function syncLoop(until) {
  while (simNow() < until) {
    const start = simNow();
    (async () => {
      const got = await acquire(LOCK_WAIT);
      if (!got) { G.syncSkipped++; G.triggerMs += simNow() - start; return; }
      const readAt = simNow(); // what binomes typed before this point is in this run
      try { await sleep(SYNC_HOLD * (0.8 + Math.random() * 0.4)); commit(); G.syncRuns++; }
      finally { release(); }
      const done = simNow();
      G.sheetEdits = G.sheetEdits.filter(e => { if (e <= readAt) { G.sheetLag.push({ edit: e, commit: done }); return false; } return true; });
      G.triggerMs += done - start;
    })();
    await sleep(SYNC_EVERY);
  }
}
// Binome members typing in their own sheets (not through the dashboard): the sync carries it to the Master.
async function sheetEditLoop(until) {
  const members = USERS;
  while (simNow() < until) { await sleep(expo(SHEET_EDIT_EVERY * 1000 / members)); G.sheetEdits.push(simNow()); }
}

function patchFetch() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://script.googleapis.com/')) {
      const user = String(init.headers.Authorization).replace('Bearer at:', '');
      const b = JSON.parse(init.body);
      let out;
      try { out = { response: { result: await execute(user, b.function, b.parameters) } }; }
      catch (e) { out = { error: { message: 'Script error', details: [{ errorMessage: e.message }] } }; }
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.startsWith('https://oauth2.googleapis.com/')) return new Response('{"access_token":"x","expires_in":3600}', { status: 200 });
    return real(url, init);
  };
}

async function startProxy() {
  process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SCRIPT_API_DEPLOYMENT_ID = 'LOAD';
  const S = require('../web/lib/session'), run = require('../web/api/run');
  ['log', 'warn'].forEach(k => { const f = console[k]; console[k] = (...a) => { if (!String(a[0]).startsWith('{')) f(...a); }; }); // the proxy's per-call JSON lines
  const srv = http.createServer((req, res) => run(req, res));
  srv.keepAliveTimeout = 60000;
  await new Promise(r => srv.listen(0, r));
  const base = 'http://localhost:' + srv.address().port;
  process.env.APP_ORIGIN = base;
  const cookies = Array.from({ length: USERS }, (_, i) => {
    const email = 'editor' + (i % ACCOUNTS) + '@g.enp.edu.dz';
    return S.seal({ email, rt: 'rt', at: 'at:' + email, ate: Date.now() + 864e5, iat: Date.now() });
  });
  return { srv, base, cookies };
}

/* ---------- the virtual editors ---------- */

const calls = [];   // {fn, ms, ok, kind}
const writes = { sent: 0, ok: 0, busy: 0, failed: 0, ids: new Set() };
const boots = [];   // ms from page open to first dashboard
const seen = [];    // per editor: [{snap, at}] each webState that came back

async function call(base, cookie, fn, args) {
  const t = simNow();
  let status = 0, j = {};
  try {
    const r = await fetch(base + '/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VIC': '1', Origin: base, Cookie: 'vic_s=' + encodeURIComponent(cookie) },
      body: JSON.stringify({ fn, args: args || [] }),
    });
    status = r.status; j = await r.json().catch(() => ({ error: 'bad json' }));
  } catch (e) { j = { error: 'network: ' + e.message }; }
  const ms = simNow() - t;
  const kind = j.error ? (/too many scripts|too many times/i.test(j.error) ? 'quota' : status === 401 ? 'auth' : status === 504 ? 'timeout' : 'error') : 'ok';
  calls.push({ fn: fn === "webRun" ? "webRun:" + args[0] : fn, ms, ok: !j.error, kind, err: j.error, t });
  if (j.error) { const e = new Error(j.error); e.kind = kind; throw e; }
  return j.value;
}

async function editor(i, base, cookie, until) {
  const me = { pulse: null, busy: false, refreshing: false, polling: false, state: null };
  seen[i] = [];
  const refresh = async () => {
    me.refreshing = true;
    try {
      const p = await call(base, cookie, 'webPulse').catch(() => null);
      const s = await call(base, cookie, 'webState');
      me.state = s; me.pulse = p;
      if (s && s.snap !== undefined) seen[i].push({ snap: s.snap, at: simNow() });
    } catch (e) { /* the page shows a toast and keeps the old numbers */ }
    finally { me.refreshing = false; }
  };
  const t0 = simNow();
  try { await call(base, cookie, 'webAccess'); await refresh(); if (me.state) boots.push(simNow() - t0); } catch (e) { /* stays on the error screen */ }

  const tick = async () => {
    if (me.busy || me.refreshing || me.polling || !me.state) return;
    me.polling = true;
    try {
      if (ACCESS_TICK) await call(base, cookie, 'webAccess');
      const p = await call(base, cookie, 'webPulse');
      if (p !== me.pulse && !me.busy) await refresh();
    } catch (e) { /* next tick retries */ }
    finally { me.polling = false; }
  };
  const timer = setInterval(tick, PULSE_MS / SCALE);

  // actions (model only): a quick fix / resolve now and then; the page refreshes after each
  const acts = (async () => {
    if (LIVE || !WRITE_EVERY) return;
    while (simNow() < until) {
      await sleep(Math.min(expo(WRITE_EVERY * 1000), until - simNow()));
      if (simNow() >= until || !me.state) continue;
      while (me.busy) await sleep(200);
      me.busy = true; writes.sent++;
      const id = i + ':' + writes.sent;
      try {
        const out = await call(base, cookie, 'webRun', ['quick', { op: 'resolve', id }]);
        if (out && out.result) { writes.ok++; writes.ids.add(id); } else writes.busy++; // null result = the "Another update…" message
      } catch (e) { writes.failed++; }
      finally { me.busy = false; }
      await refresh();
    }
  })();
  await sleep(Math.max(0, until - simNow()));
  clearInterval(timer);
  await acts;
}

/* ---------- report ---------- */

function report(extra) {
  const byFn = {};
  calls.forEach(c => { (byFn[c.fn] = byFn[c.fn] || []).push(c); });
  const rows = Object.keys(byFn).sort().map(fn => {
    const a = byFn[fn], ok = a.filter(c => c.ok).map(c => c.ms), kinds = {};
    a.filter(c => !c.ok).forEach(c => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
    return { fn, calls: a.length, ok: ok.length, failed: a.length - ok.length, kinds, p50: pct(ok, 50), p95: pct(ok, 95), p99: pct(ok, 99), max: pct(ok, 100) };
  });
  const simMin = MINUTES;
  const r = { mode: LIVE ? 'live ' + LIVE : 'model', users: USERS, accounts: LIVE ? extra.accounts : ACCOUNTS, minutes: simMin, pulseMs: PULSE_MS,
    accessTick: ACCESS_TICK, rows, total: calls.length, failed: calls.filter(c => !c.ok).length,
    callsPerSecond: +(calls.length / (simMin * 60)).toFixed(1),
    boot: { n: boots.length, p50: pct(boots, 50), p95: pct(boots, 95), max: pct(boots, 100) },
    machineStallS: +(maxStallMs / 1000).toFixed(1),
    errorsSample: [...new Set(calls.filter(c => !c.ok).map(c => String(c.err).slice(0, 120)))].slice(0, 5) };
  if (!LIVE) {
    // a change is on an editor's screen once a webState that started after the commit has come back
    const lag = commitTimes => {
      const out = [];
      commitTimes.forEach(tc => seen.forEach(list => { const s = list.find(x => x.snap >= tc); if (s) out.push(s.at - tc); }));
      return out;
    };
    const writeLag = lag(G.commits.filter(t => t < simMin * 60000 - 60000));
    const sheet = G.sheetLag.map(x => ({ edit: x.edit, commit: x.commit }));
    const sheetLag = [];
    sheet.filter(x => x.commit < simMin * 60000 - 60000).forEach(x => seen.forEach(list => { const s = list.find(y => y.snap >= x.commit); if (s) sheetLag.push(s.at - x.edit); }));
    r.writes = { sent: writes.sent, applied: writes.ok, refusedBusy: writes.busy, failed: writes.failed, holdS: WRITE_HOLD / 1000, everyS: WRITE_EVERY };
    r.writesReconciled = writes.ok + writes.busy + writes.failed === writes.sent; // every action got an answer
    r.lagDashboardWrite = { p50: pct(writeLag, 50), p95: pct(writeLag, 95), max: pct(writeLag, 100) };
    r.lagSheetToDashboard = { n: sheetLag.length, p50: pct(sheetLag, 50), p95: pct(sheetLag, 95), max: pct(sheetLag, 100), notYetSynced: G.sheetEdits.length };
    r.sync = { holdS: SYNC_HOLD / 1000, runs: G.syncRuns, skippedBusy: G.syncSkipped,
      triggerMinPerDay: Math.round(G.triggerMs / (simMin * 60000) * 1440), triggerQuotaMinPerDay: 360 };
    r.concurrency = { peakPerAccount: G.peakUser, peakScript: G.peakScript, refused: G.refusedConcurrency, limits: { perUser: PER_USER, perScript: PER_SCRIPT } };
    r.executionsPerDayAtThisRate = Math.round(calls.length / simMin * 1440);
  }
  return r;
}

function print(r) {
  const f = v => (v == null ? '-' : (v / 1000).toFixed(1) + 's');
  console.log(`\n${r.mode}: ${r.users} editors on ${r.accounts} account(s), ${r.minutes} min, poll ${r.pulseMs} ms${r.accessTick ? ' (+webAccess each tick)' : ''}`);
  console.log(`  ${r.total} calls (${r.callsPerSecond}/s), ${r.failed} failed. First dashboard: p50 ${f(r.boot.p50)}, p95 ${f(r.boot.p95)}, max ${f(r.boot.max)} (${r.boot.n}/${r.users} loaded)`);
  console.log('  call              calls    ok  failed      p50     p95     p99     max');
  r.rows.forEach(x => console.log('  ' + x.fn.padEnd(16) + String(x.calls).padStart(7) + String(x.ok).padStart(6) + String(x.failed).padStart(8) +
    [x.p50, x.p95, x.p99, x.max].map(v => f(v).padStart(8)).join('') + (Object.keys(x.kinds).length ? '  ' + JSON.stringify(x.kinds) : '')));
  if (r.writes) {
    console.log(`  actions: ${r.writes.sent} sent, ${r.writes.applied} applied, ${r.writes.refusedBusy} refused "Another update is already running", ${r.writes.failed} failed; all answered: ${r.writesReconciled}`);
    console.log(`  action → every other screen: p50 ${f(r.lagDashboardWrite.p50)}, p95 ${f(r.lagDashboardWrite.p95)}`);
    console.log(`  binome sheet edit → dashboards: p50 ${f(r.lagSheetToDashboard.p50)}, p95 ${f(r.lagSheetToDashboard.p95)} (${r.lagSheetToDashboard.notYetSynced} still waiting at the end)`);
    console.log(`  sync: ${r.sync.runs} runs, ${r.sync.skippedBusy} skipped (lock busy); trigger time ${r.sync.triggerMinPerDay} min/day vs quota ${r.sync.triggerQuotaMinPerDay}`);
    console.log(`  concurrency: peak ${r.concurrency.peakPerAccount}/account (limit 30), ${r.concurrency.peakScript}/script (limit 1000), ${r.concurrency.refused} refused`);
    console.log(`  executions/day at this rate: ${r.executionsPerDayAtThisRate}`);
  }
  if (r.machineStallS > 2) console.log(`  ! this machine stalled for ${r.machineStallS} s during the run: calls in flight then are inflated; run again`);
  if (r.errorsSample.length) console.log('  errors seen: ' + r.errorsSample.join(' | '));
}

(async () => {
  const until = MINUTES * 60000;
  let base, cookies, srv, accounts = ACCOUNTS;
  if (LIVE) {
    base = String(LIVE).replace(/\/$/, '');
    cookies = fs.readFileSync(opt('cookies', 'cookies.txt'), 'utf8').split(/\r?\n/).map(s => s.trim().replace(/^vic_s=/, '')).filter(Boolean);
    accounts = cookies.length;
    // One cheap call per cookie first: is the session alive, and when does it end (X-Session-Expires)? Never prints the cookie.
    for (const [i, c] of cookies.entries()) {
      const r = await fetch(base + '/api/run', { method: 'POST', body: '{"fn":"webAccess","args":[]}',
        headers: { 'Content-Type': 'application/json', 'X-VIC': '1', Origin: base, Cookie: 'vic_s=' + c } });
      const j = await r.json().catch(() => ({})), exp = Number(r.headers.get('X-Session-Expires'));
      if (r.status === 401) { console.error(`cookie ${i + 1}: session ended (${j.code || j.error}). Sign in again and replace it.`); process.exitCode = 1; return; }
      console.log(`cookie ${i + 1}: ${j.value && j.value.email || '?'}, ${j.value && j.value.ok ? 'admin' : 'no access'}, session ends ${exp ? new Date(exp).toISOString() : '?'}`);
    }
    if (opt("check", false)) return;
    cookies = Array.from({ length: USERS }, (_, i) => decodeURIComponent(cookies[i % cookies.length]));
    if (USERS / accounts > 25) console.warn(`! ${USERS} editors on ${accounts} account(s): over Google's 30 simultaneous runs per account, expect "too many scripts" errors.`);
  } else {
    patchFetch();
    ({ srv, base, cookies } = await startProxy());
    syncLoop(until); sheetEditLoop(until);
  }
  console.log(`Running ${USERS} editors for ${MINUTES} min${SCALE > 1 ? ` (model, ${SCALE}× real time: ~${Math.round(MINUTES * 60 / SCALE)} s)` : ''}…`);
  await Promise.all(cookies.map((c, i) => editor(i, base, c, until)));
  const r = report({ accounts });
  print(r);
  if (opt('out', null)) fs.writeFileSync(opt('out'), JSON.stringify(r, null, 2));
  if (srv) srv.close();
  process.exit(0);
})();
