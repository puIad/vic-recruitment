// Queue consumer (topic vic-apply, web/vercel.json): applies an author's pending changes through the script's webApply,
// as them, with the access token sealed in the message (docs/plans.md › Slice 2). The changes come from the author's
// record, never from the message, so a forged delivery can at most replay a real one.
const S = require('../lib/session'), P = require('../lib/pending');

/** Thrown to have the message delivered again in `after` seconds. */
class Later extends Error { constructor(s) { super('again in ' + s + ' s'); this.after = Math.max(1, Math.ceil(s)); } }
const MIN_LIFE_MS = 6 * 60e3; // a call can run for 6 min: none starts with less token life left than that
const GAP_MS = 60e3;          // at most one webApply per author per minute; it carries all their pending changes (issue 48)
const BATCH = 50;
const backoff = meta => Math.min(300, 60 * 2 ** Math.max(0, ((meta && meta.deliveryCount) || 1) - 1));
const lost = () => ({ state: 'dropped', reason: 'lost access' });
const signedOut = () => ({ state: 'dropped', reason: 'sign-in ended before it was saved', again: true });

/** End entries that are still the pending ones this delivery saw (a newer change on the cell wins). */
async function end(email, entries, how) {
  const now = Date.now(), rec = await P.read(email, now), w = {};
  // shortcut: read then write, not atomic; an accept on the same cell in those few ms can be overwritten (Lua if it shows)
  entries.forEach(e => {
    const cur = rec[e.cell];
    if (!cur || cur.id !== e.id || cur.state !== 'pending') return;
    const x = how(cur);
    w[e.cell] = Object.assign({}, cur, x, x.state === 'dropped' ? { droppedAt: now } : { exp: now + P.ENDED_MS });
  });
  if (Object.keys(w).length) await P.save(email, w);
  console.log(JSON.stringify({ at: 'apply', email, ended: Object.keys(w).map(c => w[c].state) }));
}

async function handle(msg, meta) {
  const tok = S.open(msg && msg.t), now = Date.now();
  if (!tok || !tok.email || !Array.isArray(msg.ids)) return console.warn(JSON.stringify({ at: 'apply', skip: 'unreadable message' }));
  const email = tok.email, rec = await P.read(email, now);
  const pending = Object.keys(rec).map(c => rec[c]).filter(e => e.state === 'pending').sort((a, b) => a.at - b.at);
  const mine = pending.filter(e => msg.ids.indexOf(e.id) >= 0);
  if (!mine.length) return; // ended by an earlier call, replaced or cancelled
  if (tok.ate - now < MIN_LIFE_MS) return end(email, mine, () => ({ state: 'dropped', reason: 'retries ran out', again: true }));
  const [got, ttl] = await P.redis([['SET', 'pcl:' + email, '1', 'NX', 'PX', GAP_MS], ['PTTL', 'pcl:' + email]]);
  if (got !== 'OK') throw new Later(Math.max(ttl, 0) / 1000 + 1);

  const batch = pending.slice(0, BATCH);
  const changes = batch.map(e => ({ id: e.id, kind: e.kind, alert: e.alert, op: e.op, seen: e.seen, at: e.at, until: e.until }));
  let r, j;
  try {
    r = await fetch(S.runUrl(), {
      method: 'POST', signal: AbortSignal.timeout(280000),
      headers: { Authorization: 'Bearer ' + tok.at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: 'webApply', parameters: [{ v: P.SCRIPT_FORMAT, changes }], devMode: false }),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new Later(backoff(meta)); } // timeout or network: judged cell by cell on the retry
  if (r.status === 401) return end(email, pending, signedOut);
  if (r.status === 403) return end(email, pending, lost);
  if (!r.ok || j.error) {
    console.warn(JSON.stringify({ at: 'apply', email, status: r.status, msg: String((j.error && j.error.message) || '').slice(0, 200) }));
    throw new Later(r.status === 429 ? 60 : backoff(meta));
  }
  const v = (j.response && j.response.result) || {};
  if (v.lost) return end(email, pending, lost);
  if (v.refused) return end(email, batch, () => ({ state: 'dropped', reason: v.refused }));
  if (v.retry || !Array.isArray(v.results)) throw new Later(backoff(meta));
  const by = {};
  v.results.forEach(x => { by[x.id] = x; });
  await end(email, batch.filter(e => by[e.id]), e => {
    const x = by[e.id];
    return x.end === 'dropped' ? { state: 'dropped', sheet: x.sheet, reason: x.reason, wrote: x.at, again: !x.reason } : { state: x.end, wrote: x.at };
  });
  if (mine.some(e => !by[e.id])) throw new Later(GAP_MS / 1000 + 1); // past the batch: the next call, a minute on
}

const retry = (err, meta) => ({ afterSeconds: err instanceof Later ? err.after : backoff(meta) });
let callback = null; // made at the first delivery, so tests and the local mock load this file without @vercel/queue
module.exports = (req, res) => {
  if (!callback) { const { QueueClient } = require('@vercel/queue'); callback = new QueueClient().handleNodeCallback(handle, { retry }); }
  return callback(req, res);
};
Object.assign(module.exports, { handle, retry, Later });
