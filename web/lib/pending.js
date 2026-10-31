// Pending changes (docs/plans.md › Slices 2 to 4): the author's record in Upstash Redis, the accept step and the queue publish.
// Record = hash pc:<email>, one field per cell ("alert:A-0012", "setting:DIGEST_HOUR", "field:IT.12:Rating", "team:<email>",
// "bfield:IT.12:Contacted", "binome:B.05", "bmove:IT.12"), each a JSON entry:
//   {id, cell, kind (alert | setting | field | team | bfield | binome | bmove | result), alert?, op?, until? (alerts, binome), key? (settings), code?, field? (My binome
//    and bfield), email? (team: the member), binome? (bfield, binome, bmove), note?, codes? (binome: the author's reason, the codes to move),
//    value (what the author wants), seen (what their screen showed), at (the click),
//    state: pending | applied | met | dropped, by (apply-by = the sealed token's end), wrote? (Google's write or check
//    time), sheet? (the sheet's value on a drop), reason?, again? (Apply mine anyway offered), droppedAt?, shown?,
//    addressed?, exp?, seenAt? (a page showing the drop, refreshed once a minute), mailed? (the sync's email about it)}.
//    by, droppedAt, seenAt and mailed are for slice 4's sweep, email and admin alert (issues 58, 54).
// Every deployment shares it, so its format only ever adds fields (issue 58). No token is ever written into it.
const crypto = require('crypto');
const S = require('./session');

const FORMAT = 1;          // the page's change format: another one is refused with code FORMAT (the page reloads)
const SCRIPT_FORMAT = 1;   // webApply's call format (Pending.gs APPLY_FORMAT)
const TOPIC = 'vic-apply';
const LIVE = 'pcx'; // set of emails whose record may hold a pending or unaddressed dropped entry: the sync's sweep reads only these
const RETENTION_S = 7200;  // about 2 h (issue 58)
const MAX_CELLS = 300; // live cells per author: a real one holds a handful (shortcut: raise it if a page ever needs more)
const ENDED_MS = 10 * 60e3, ADDRESSED_MS = 7 * 24 * 3600e3, RECORD_S = 30 * 24 * 3600;
const AWAY_MS = 5 * 60e3, ANSWER_MS = 24 * 3600e3; // slice 4: no page showed it (email), the email went unanswered (alert)
const VALUE = { resolve: 'RESOLVED', snooze: 'SNOOZED', mute: 'MUTED', unmute: 'OPEN' };
const SHOWN = ['OPEN', 'SNOOZED', 'MUTED'];

/** Tests and the local mock put fakes here: redis(cmds) → results, send(topic, payload, opts). */
const deps = { redis: null, send: null };

/** Commands in one round trip (Upstash's REST pipeline), results in order; a command's error throws. */
async function redis(cmds) {
  if (deps.redis) return deps.redis(cmds);
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis is not configured');
  const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
    method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) throw new Error('Redis answered ' + r.status);
  return j.map(x => { if (x.error) throw new Error('Redis: ' + x.error); return x.result; });
}
async function publish(payload) {
  const send = deps.send || require('@vercel/queue').send;
  return send(TOPIC, payload, { retentionSeconds: RETENTION_S });
}

const key = email => 'pc:' + email;
/** The author's entries by cell, and the cells past their expiry (left out; the next accept removes them). */
function parse(flat, now) {
  const rec = {}, gone = [];
  for (let i = 0; i + 1 < (flat || []).length; i += 2) {
    let e = null;
    try { e = JSON.parse(flat[i + 1]); } catch (x) { /* not ours */ }
    if (e && !(e.exp <= now)) rec[flat[i]] = e; else gone.push(flat[i]);
  }
  return { rec, gone };
}
async function readAll(email, now) {
  const [flat] = await redis([['HGETALL', key(email)]]);
  return parse(flat, now);
}
const read = async (email, now) => (await readAll(email, now)).rec;
/** Write entries ({cell: entry}) and remove cells, in one round trip. */
function save(email, entries, gone) {
  const k = key(email), flat = [], cmds = [];
  Object.keys(entries).forEach(c => flat.push(c, JSON.stringify(entries[c])));
  if (flat.length) cmds.push(['HSET', k].concat(flat));
  if (gone && gone.length) cmds.push(['HDEL', k].concat(gone));
  cmds.push(['EXPIRE', k, RECORD_S]);
  if (Object.keys(entries).some(c => entries[c].state === 'pending' || entries[c].state === 'dropped')) cmds.push(['SADD', LIVE, email]);
  return redis(cmds);
}

const GOLD = ['Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation', 'Notes']; // BF_EDITABLE
const ADMIN_GOLD = ['Contacted', 'Interview Date', 'Interview Time']; // ADMIN_FIELDS: what the alerts' Fix writes in a binome sheet
const BIN_OP = { pause: 'PAUSED', resume: 'ACTIVE', date: 'PAUSED' }, BIN_SEEN = { pause: 'ACTIVE', resume: 'PAUSED', date: 'PAUSED' };
const scalar = v => typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 2100);
/** A change as the page sends it, with at (the click) and built? (its snapshot's build time):
 *  {kind: 'alert', alert, op, seen, until?} · {kind: 'setting', key, value, seen} · {kind: 'field', code, field, value, seen} ·
 *  {kind: 'result', code, value, seen, note?} (a Phase 1 Result override, '' clears) · {kind: 'team', email, value, seen} (both booleans) · {kind: 'bfield', binome, code, field, value, seen} ·
 *  {kind: 'binome', binome, op, value, seen, note, until (ms or null), codes}.
 *  The page is not trusted for more than that: the script checks every value again. */
const valid = c => !!c && Number.isFinite(c.at) && (
  c.kind === 'alert' ? !!VALUE[c.op] && /^A-\d{1,7}$/.test(String(c.alert)) && SHOWN.indexOf(c.seen) >= 0 &&
    (c.op !== 'snooze' || (Number.isFinite(c.until) && c.until > c.at))
  : c.kind === 'setting' ? /^[A-Z][A-Z0-9_]{0,40}$/.test(String(c.key)) && scalar(c.value) && scalar(c.seen)
  : c.kind === 'field' ? /^[A-Za-z]{1,10}\.\d{1,6}$/.test(String(c.code)) && GOLD.indexOf(c.field) >= 0 && scalar(c.value) && scalar(c.seen)
  : c.kind === 'team' ? /^[^\s@:]{1,80}@[^\s@:]{1,80}$/.test(String(c.email)) && typeof c.value === 'boolean' && typeof c.seen === 'boolean'
  : c.kind === 'result' ? /^[A-Za-z]{1,10}\.\d{1,6}$/.test(String(c.code)) && scalar(c.value) && scalar(c.seen) && (c.note === undefined || (typeof c.note === 'string' && c.note.length <= 300))
  : c.kind === 'binome' ? /^B\.\d{2,3}$/.test(String(c.binome)) && BIN_OP[c.op] === c.value && BIN_SEEN[c.op] === c.seen && typeof c.note === 'string' && c.note.length <= 500 &&
    (c.until === null || c.until === undefined || Number.isFinite(c.until)) && Array.isArray(c.codes) && c.codes.length <= 200 && c.codes.every(x => /^[A-Za-z]{1,10}\.\d{1,6}$/.test(String(x)))
  : c.kind === 'bfield' && /^B\.\d{2,3}$/.test(String(c.binome)) && /^[A-Za-z]{1,10}\.\d{1,6}$/.test(String(c.code)) && ADMIN_GOLD.indexOf(c.field) >= 0 &&
    scalar(c.value) && scalar(c.seen));
const cellOf = c => (c.kind === 'alert' ? 'alert:' + c.alert : c.kind === 'binome' ? 'binome:' + c.binome : c.kind === 'setting' ? 'setting:' + c.key : c.kind === 'team' ? 'team:' + String(c.email).toLowerCase() : c.kind === 'result' ? 'result:' + c.code
  : (c.kind === 'bfield' ? 'bfield:' : 'field:') + c.code + ':' + c.field);
const valueOf = c => (c.kind === 'alert' ? VALUE[c.op] : c.value);
const same = (a, b) => String(a) === String(b); // the page's values: Rating 7.5 or "7.5", Done true or "true"

/**
 * The accept step: merge the author's changes into their record, then publish one message for the ones left. A change on a
 * cell they already have pending keeps its seen value (issue 50); one on a cell they ended within 10 min whose seen
 * value is that change's old value takes its new one (issue 61), unless the page's snapshot was built after that write
 * (built: then it really shows the sheet); one whose value equals its seen value cancels.
 * Redis first, then the queue; either failing throws, after putting the record back: that save is a direct write.
 * s = the session {email, at, ate}. Returns the record as it now is.
 */
async function accept(s, changes, now) {
  const { rec, gone: expired } = await readAll(s.email, now), writes = {}, before = {};
  changes.forEach(c => {
    const cell = cellOf(c), e0 = writes[cell] || rec[cell], value = valueOf(c);
    let seen = c.seen;
    if (e0 && e0.state === 'pending') seen = e0.seen;
    else if (e0 && (e0.state === 'applied' || e0.state === 'met') && same(e0.seen, c.seen) && !(c.built >= e0.wrote)) seen = e0.value;
    if (!(cell in before)) before[cell] = rec[cell];
    delete writes[cell];
    // typed, then undone: on a cell with a pending entry a put-back stays (the entry may be inside webApply right now; end() fixes its seen)
    if (same(value, seen) && c.kind !== 'binome') { // a binome's date change keeps its status: value = seen is still a change
      if (!(rec[cell] && rec[cell].state === 'pending')) return;
      // an alert op takes only some seen values (unmute: SNOOZED or MUTED, never OPEN): judge the put-back against the op it replaces
      if (c.kind === 'alert') seen = rec[cell].value;
    }
    if (c.kind === 'alert' && seen === 'RESOLVED') return; // their own Resolve closed it: any action on a closed alert is already met (issue 50)
    const base = { id: crypto.randomUUID(), cell: cell, kind: c.kind, value: value, seen: seen, at: c.at, state: 'pending', by: s.ate };
    writes[cell] = Object.assign(base, c.kind === 'alert' ? { alert: String(c.alert), op: c.op, until: c.op === 'snooze' ? c.until : undefined }
      : c.kind === 'binome' ? { binome: c.binome, op: c.op, note: c.note, until: c.until || null, codes: c.codes.map(String) }
      : c.kind === 'result' ? { code: c.code, note: c.note }
      : c.kind === 'setting' ? { key: c.key } : c.kind === 'team' ? { email: String(c.email).toLowerCase() }
      : c.kind === 'bfield' ? { binome: c.binome, code: c.code, field: c.field } : { code: c.code, field: c.field });
  });
  // expired cells go here, inside the read-then-write the accept already has (a pulse never deletes)
  const gone = expired.filter(c => !writes[c]), ids = Object.keys(writes).map(c => writes[c].id);
  if (Object.keys(rec).concat(Object.keys(writes).filter(c => !(c in rec))).length > MAX_CELLS) throw new Error('Too many pending cells');
  await save(s.email, writes, gone);
  if (ids.length) {
    try {
      // the token travels sealed in the message only; the consumer reads the changes from the record
      await publish({ v: SCRIPT_FORMAT, t: S.seal({ email: s.email, at: s.at, ate: s.ate }), ids: ids });
    } catch (e) {
      const back = {}, drop = [];
      Object.keys(writes).forEach(c => { if (before[c]) back[c] = before[c]; else drop.push(c); });
      await save(s.email, back, drop).catch(() => { /* an entry left behind ends as already met */ });
      throw e;
    }
  }
  const out = Object.assign({}, rec, writes);
  gone.forEach(c => { delete out[c]; });
  return out;
}

/** The page's answers on drops: shown (it is on screen), seen (still on screen, once a minute on the pulse) and keep
 *  (Keep the sheet's value: addressed, gone in 7 days). */
async function mark(email, a, now) {
  const rec = await read(email, now), w = {}, list = x => (Array.isArray(x) ? x.slice(0, 200).map(String) : []);
  list(a.shown).forEach(c => { const e = rec[c]; if (e && e.state === 'dropped' && !e.shown) w[c] = Object.assign({}, e, { shown: now, seenAt: now }); });
  list(a.seen).forEach(c => { const e = w[c] || rec[c]; if (e && e.state === 'dropped' && !e.addressed) w[c] = Object.assign({}, e, { seenAt: now }); });
  list(a.keep).forEach(c => {
    const e = w[c] || rec[c];
    if (e && e.state === 'dropped' && !e.addressed) w[c] = Object.assign({}, e, { shown: e.shown || now, addressed: now, exp: now + ADDRESSED_MS });
  });
  if (Object.keys(w).length) await save(email, w);
  return Object.assign({}, rec, w);
}

/** Is any author's Phase 1 Result override ("result:<code>") pending, or dropped and not yet addressed? Going final waits for none. */
async function resultsOpen(now) {
  const [emails] = await redis([['SMEMBERS', LIVE]]);
  const flats = emails.length ? await redis(emails.map(e => ['HGETALL', key(e)])) : [];
  return flats.some(f => { const { rec } = parse(f, now); return Object.keys(rec).some(c => /^result:/.test(c) && (rec[c].state === 'pending' || (rec[c].state === 'dropped' && !rec[c].addressed))); });
}

/**
 * The sync's call each cycle (docs/plans.md › Slice 4, issue 54), over the authors in the live set (LIVE: pending or unaddressed dropped entries):
 *  - mailed = what the last cycle emailed ([{email, cells, at}]): those drops get mailed = at;
 *  - an entry still pending past its apply-by (its deployment died, or the queue gave up) ends dropped, "retries ran out";
 *  - mail: per author, the unaddressed drops no page showed within 5 min and no email covered yet;
 *  - alert: authors with an unaddressed drop shown but unseen for 5 min (the visit ended), or mailed 24 h ago unanswered;
 *  - open: authors with any unaddressed drop (the sync resolves DROPPED|<email> for everyone else).
 * shortcut: read then write per author like the consumer's end(), not atomic; Lua if a race ever shows.
 */
async function forSync(mailed, now) {
  const [emails] = await redis([['SMEMBERS', LIVE]]);
  const flats = emails.length ? await redis(emails.map(e => ['HGETALL', key(e)])) : [], sent = {}, idle = [];
  (Array.isArray(mailed) ? mailed : []).forEach(m => { if (m && m.email && Array.isArray(m.cells)) sent[m.email] = m; });
  const out = { mail: [], alert: [], open: [] }, writes = [];
  emails.forEach((email, i) => {
    const { rec, gone } = parse(flats[i], now), w = {}, m = sent[email];
    Object.keys(rec).forEach(c => {
      let e = rec[c];
      if (e.state === 'pending' && e.by < now) e = w[c] = Object.assign({}, e, { state: 'dropped', reason: 'retries ran out', again: true, droppedAt: now });
      if (e.state === 'dropped' && !e.mailed && m && m.cells.indexOf(c) >= 0) e = w[c] = Object.assign({}, e, { mailed: Number(m.at) || now });
      rec[c] = e;
    });
    if (Object.keys(w).length || gone.length) writes.push(save(email, w, gone)); // expired cells go here too, not only on the author's next accept
    const drops = Object.keys(rec).map(c => rec[c]).filter(e => e.state === 'dropped' && !e.addressed);
    if (!drops.length && !Object.keys(rec).some(c => rec[c].state === 'pending')) idle.push(email); // nothing left to sweep for them
    if (!drops.length) return;
    out.open.push(email);
    const due = drops.filter(e => !e.shown && !e.mailed && now - (e.droppedAt || e.at) >= AWAY_MS);
    if (due.length) out.mail.push({ email, drops: due.map(e => ({ cell: e.cell, kind: e.kind, alert: e.alert, op: e.op, until: e.until, key: e.key,
      code: e.code, field: e.field, email: e.email, binome: e.binome, value: e.value, seen: e.seen, sheet: e.sheet, reason: e.reason, at: e.at })) });
    if (drops.some(e => (e.shown && now - Math.max(e.shown, e.seenAt || 0) >= AWAY_MS) || (e.mailed && now - e.mailed >= ANSWER_MS))) out.alert.push(email);
  });
  await Promise.all(writes);
  // shortcut: SREM can race an accept's SADD between our read and here (ms); that entry is then missed by the sweep only, never by the consumer
  if (idle.length) await redis([['SREM', LIVE].concat(idle)]);
  return out;
}

module.exports = { FORMAT, LIVE, SCRIPT_FORMAT, TOPIC, ENDED_MS, deps, redis, read, save, valid, accept, mark, forSync, resultsOpen };
