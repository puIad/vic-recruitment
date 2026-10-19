// Queue consumer (topic vic-apply, web/vercel.json): applies an author's pending changes through the script's webApply,
// as them, with the access token sealed in the message (docs/plans.md › Slice 2). The changes come from the author's
// record, never from the message, so a forged delivery can at most replay a real one.
const S = require('../lib/session'), P = require('../lib/pending');

/** Thrown to have the message delivered again in `after` seconds. */
class Later extends Error { constructor(s) { super('again in ' + s + ' s'); this.after = Math.max(1, Math.ceil(s)); } }
const MIN_LIFE_MS = 6 * 60e3; // a call can run for 6 min: none starts with less token life left than that
const GAP_MS = 60e3;          // at most one webApply per author per minute; it carries all their pending changes (issue 48)
const BATCH = 50;
// jitter: every author of one outage must not come back at the same second
const backoff = meta => Math.ceil(Math.min(300, 60 * 2 ** Math.max(0, ((meta && meta.deliveryCount) || 1) - 1) * (0.75 + Math.random() * 0.5)));
const lost = () => ({ state: 'dropped', reason: 'lost access' });
const signedOut = () => ({ state: 'dropped', reason: 'sign-in ended before it was saved', again: true });

/** End entries that are still the pending ones this delivery saw (a newer change on the cell wins). tok = the sealed token. */
async function end(tok, entries, how) {
  const email = tok.email, now = Date.now(), rec = await P.read(email, now), w = {};
  // shortcut: read then write, not atomic; an accept on the same cell in those few ms can be overwritten (Lua if it shows)
  entries.forEach(e => {
    const cur = rec[e.cell];
    if (!cur || cur.state !== 'pending') return;
    if (cur.id !== e.id) { // a newer change landed while webApply ran: it now judges against what this one wrote
      const y = how(e);
      if (y.state === 'applied' || y.state === 'met') w[e.cell] = Object.assign({}, cur, { seen: e.value });
      return;
    }
    const x = how(cur);
    w[e.cell] = Object.assign({}, cur, x, x.state === 'dropped' ? { droppedAt: now } : { exp: now + P.ENDED_MS });
  });
  if (!Object.keys(w).length) return;
  await P.save(email, w);
  console.log(JSON.stringify({ at: 'apply', email, ended: Object.keys(w).map(c => w[c].state) }));
  if (!Object.keys(rec).some(c => (w[c] || rec[c]).state === 'pending')) await revokeIfMarked(tok);
}

/** Another account took over a browser of theirs while changes were pending (callback.js): once none is left, revoke
 *  with this message's access token. An entry the #58 sweep ends holds no token: that mark expires (accepted, issue 56). */
async function revokeIfMarked(tok) {
  const [mark] = await P.redis([['GETDEL', P.REVOKE + tok.email]]).catch(() => [null]);
  if (mark) console.log(JSON.stringify({ at: 'apply', email: tok.email, revoked: await S.revoke(tok.at) }));
}

async function handle(msg, meta) {
  const tok = S.open(msg && msg.t), now = Date.now();
  if (!tok || !tok.email || !Array.isArray(msg.ids)) return console.warn(JSON.stringify({ at: 'apply', skip: 'unreadable message' }));
  const email = tok.email, rec = await P.read(email, now);
  const pending = Object.keys(rec).map(c => rec[c]).filter(e => e.state === 'pending').sort((a, b) => a.at - b.at);
  const mine = pending.filter(e => msg.ids.indexOf(e.id) >= 0);
  // ended by an earlier call, replaced or cancelled: a cancel ends the last one with no call, so the mark is checked here
  if (!mine.length) return pending.length ? undefined : revokeIfMarked(tok);
  if (tok.ate - now < MIN_LIFE_MS) return end(tok, mine, () => ({ state: 'dropped', reason: 'retries ran out', again: true }));
  const [got, ttl] = await P.redis([['SET', 'pcl:' + email, '1', 'NX', 'PX', GAP_MS], ['PTTL', 'pcl:' + email]]);
  if (got !== 'OK') throw new Later(Math.max(ttl, 0) / 1000 + 1);

  const batch = pending.slice(0, BATCH);
  const changes = batch.map(e => ({ id: e.id, kind: e.kind, alert: e.alert, op: e.op, until: e.until, key: e.key, code: e.code, field: e.field,
    value: e.value, seen: e.seen, at: e.at }));
  let r, j;
  try {
    r = await fetch(S.runUrl(), {
      method: 'POST', signal: AbortSignal.timeout(280000),
      headers: { Authorization: 'Bearer ' + tok.at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: 'webApply', parameters: [{ v: P.SCRIPT_FORMAT, changes }], devMode: false }),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) { throw new Later(backoff(meta)); } // timeout or network: judged cell by cell on the retry
  if (r.status === 401) return end(tok, pending, signedOut);
  // a token from before a new scope ends signed out; any other 403 (API disabled, broken deployment) is retried below, logged
  if (r.status === 403 && /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(JSON.stringify(j))) return end(tok, pending, signedOut);
  if (!r.ok || j.error) {
    console.warn(JSON.stringify({ at: 'apply', email, status: r.status, msg: String((j.error && j.error.message) || '').slice(0, 200) }));
    throw new Later(r.status === 429 ? 60 : backoff(meta));
  }
  const v = (j.response && j.response.result) || {};
  if (v.lost) return end(tok, pending, lost);
  if (v.refused) return end(tok, batch, () => ({ state: 'dropped', reason: v.refused }));
  if (v.retry) { // the document lock is busy: soon, and not in step with the other authors; free the gap key so it holds nobody a minute
    await P.redis([['DEL', 'pcl:' + email]]).catch(() => {});
    throw new Later(5 + Math.random() * 25);
  }
  if (!Array.isArray(v.results)) throw new Later(backoff(meta));
  const by = {};
  v.results.forEach(x => { by[x.id] = x; });
  await end(tok, batch.filter(e => by[e.id]), e => {
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
