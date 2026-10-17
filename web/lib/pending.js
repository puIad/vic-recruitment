// Pending changes (docs/plans.md › Slice 2): the author's record in Upstash Redis, the accept step and the queue publish.
// Record = hash pc:<email>, one field per cell ("alert:A-0012"), each a JSON entry:
//   {id, cell, kind, alert, op, value (what the author wants), seen (what their screen showed), at (the click), until?,
//    state: pending | applied | met | dropped, by (apply-by = the sealed token's end), wrote? (Google's write or check
//    time), sheet? (the sheet's value on a drop), reason?, again? (Apply mine anyway offered), shown?, addressed?, exp?}
// Every deployment shares it, so its format only ever adds fields (issue 58). No token is ever written into it.
const crypto = require('crypto');
const S = require('./session');

const FORMAT = 1;          // the page's change format: another one is refused with code FORMAT (the page reloads)
const SCRIPT_FORMAT = 1;   // webApply's call format (Pending.gs APPLY_FORMAT)
const TOPIC = 'vic-apply';
const RETENTION_S = 7200;  // about 2 h (issue 58)
const ENDED_MS = 10 * 60e3, ADDRESSED_MS = 7 * 24 * 3600e3, RECORD_S = 30 * 24 * 3600;
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
/** The author's entries by cell, marks past their expiry left out. */
async function read(email, now) {
  const [flat] = await redis([['HGETALL', key(email)]]), out = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) {
    let e = null;
    try { e = JSON.parse(flat[i + 1]); } catch (x) { /* not ours */ }
    if (e && !(e.exp <= now)) out[flat[i]] = e;
  }
  return out;
}
/** Write entries ({cell: entry}) and remove cells, in one round trip. */
function save(email, entries, gone) {
  const k = key(email), flat = [], cmds = [];
  Object.keys(entries).forEach(c => flat.push(c, JSON.stringify(entries[c])));
  if (flat.length) cmds.push(['HSET', k].concat(flat));
  if (gone && gone.length) cmds.push(['HDEL', k].concat(gone));
  cmds.push(['EXPIRE', k, RECORD_S]);
  return redis(cmds);
}

/** A change as the page sends it: {kind: 'alert', alert, op, seen, at, until?, built? (its snapshot's build time)}. The page is not trusted for more than that. */
const valid = c => !!c && c.kind === 'alert' && !!VALUE[c.op] && /^A-\d{1,7}$/.test(String(c.alert)) && SHOWN.indexOf(c.seen) >= 0 &&
  Number.isFinite(c.at) && (c.op !== 'snooze' || (Number.isFinite(c.until) && c.until > c.at));

/**
 * The accept step: merge the author's changes into their record, then publish one message for the ones left. A change on a
 * cell they already have pending keeps its seen value (issue 50); one on a cell they ended within 10 min whose seen
 * value is that change's old value takes its new one (issue 61), unless the page's snapshot was built after that write
 * (built: then it really shows the sheet); one whose value equals its seen value cancels.
 * Redis first, then the queue; either failing throws, after putting the record back: that save is a direct write.
 * s = the session {email, at, ate}. Returns the record as it now is.
 */
async function accept(s, changes, now) {
  const rec = await read(s.email, now), writes = {}, cancel = [], before = {};
  changes.forEach(c => {
    const cell = 'alert:' + c.alert, e0 = writes[cell] || rec[cell];
    let seen = c.seen;
    if (e0 && e0.state === 'pending') seen = e0.seen;
    else if (e0 && (e0.state === 'applied' || e0.state === 'met') && e0.seen === c.seen && !(c.built >= e0.wrote)) seen = e0.value;
    if (!(cell in before)) before[cell] = rec[cell];
    delete writes[cell];
    if (VALUE[c.op] === seen) { if (rec[cell] && rec[cell].state === 'pending') cancel.push(cell); return; } // typed, then undone
    writes[cell] = { id: crypto.randomUUID(), cell: cell, kind: 'alert', alert: String(c.alert), op: c.op, value: VALUE[c.op], seen: seen,
      at: c.at, until: c.op === 'snooze' ? c.until : undefined, state: 'pending', by: s.ate };
  });
  const gone = cancel.filter(c => !writes[c]), ids = Object.keys(writes).map(c => writes[c].id);
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

/** The page's answers on drops: shown (it is on screen) and keep (Keep the sheet's value: addressed, gone in 7 days). */
async function mark(email, a, now) {
  const rec = await read(email, now), w = {}, list = x => (Array.isArray(x) ? x.slice(0, 200).map(String) : []);
  list(a.shown).forEach(c => { const e = rec[c]; if (e && e.state === 'dropped' && !e.shown) w[c] = Object.assign({}, e, { shown: now }); });
  list(a.keep).forEach(c => {
    const e = w[c] || rec[c];
    if (e && e.state === 'dropped' && !e.addressed) w[c] = Object.assign({}, e, { shown: e.shown || now, addressed: now, exp: now + ADDRESSED_MS });
  });
  if (Object.keys(w).length) await save(email, w);
  return Object.assign({}, rec, w);
}

module.exports = { FORMAT, SCRIPT_FORMAT, TOPIC, ENDED_MS, deps, redis, read, save, valid, accept, mark };
