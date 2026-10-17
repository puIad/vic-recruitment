// POST /api/run {fn, args} → Apps Script API scripts.run as the signed-in visitor. Returns {value} or {error, code}.
// The script re-checks access on every call; this proxy only gates who may talk to it and never sees more than it needs.
// Pending changes (docs/plans.md › Slice 2) live here too, so the page's polls keep it warm: fn 'accept' (the accept step:
// Redis, then the queue, no script call), 'pendingMark' (answers on drops), and webPulse with rec set, which also returns
// the author's record: rec 1 = only while the switch is on, 2 = always (the page still holds pending changes).
const S = require('../lib/session'), P = require('../lib/pending');

const ALLOWED = ['webAccess', 'webState', 'webRun', 'webPulse'], PENDING = ['accept', 'pendingMark'];
const ACCEPT_LIFE_MS = 30 * 60e3; // the accept step seals a token with at least this long to live (issue 56)
const TIMEOUT_MS = 285000; // under maxDuration 300 (vercel.json)

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  if (!S.sameOrigin(req)) return S.sendJson(res, 403, { error: 'Bad origin' });
  const s = S.open(S.cookies(req)[S.COOKIE]);
  if (!s || s.out) return S.sendJson(res, 401, { error: 'Signed out', code: 'SIGNED_OUT' });
  if (S.expired(s)) {
    // Ends this browser's sign-in only: no revoke (other browsers share the grant), the refresh token stays for reuse.
    S.addCookie(res, S.sessionCookie({ email: s.email, rt: s.rt, iat: s.iat }));
    return S.sendJson(res, 401, { error: 'Your 48h session ended: sign in again.', code: 'EXPIRED' });
  }
  let b;
  try { b = await body(req); } catch (e) { return S.sendJson(res, 400, { error: 'Bad request' }); }
  const fn = b && b.fn, args = Array.isArray(b && b.args) ? b.args : [];
  if (ALLOWED.indexOf(fn) < 0 && PENDING.indexOf(fn) < 0) return S.sendJson(res, 400, { error: 'Not exposed: ' + String(fn).slice(0, 40) });

  const t0 = Date.now();
  const action = fn === 'webRun' ? 'webRun:' + String(args[0]).slice(0, 20) : fn;
  const done = (status, out, ok) => {
    console.log(JSON.stringify({ email: s.email, action, ms: Date.now() - t0, ok }));
    res.setHeader('X-Session-Expires', String(S.expiresAt(s)));
    S.sendJson(res, status, out);
  };
  // any failure of the pending path sends the page down today's direct write (code DIRECT)
  const direct = msg => done(503, { error: msg, code: 'DIRECT' }, false);
  if (fn === 'pendingMark') {
    try { return done(200, { value: await P.mark(s.email, args[0] || {}, Date.now()) }, true); }
    catch (e) { console.warn(JSON.stringify({ at: 'pendingMark', error: String(e.message).slice(0, 200) })); return direct('Could not reach the pending-changes store.'); }
  }
  const change = fn === 'accept' ? args[0] || {} : null;
  if (change && change.v !== P.FORMAT) return done(400, { error: 'This page is out of date: reload it.', code: 'FORMAT' }, false);
  if (change && !(Array.isArray(change.changes) && change.changes.length && change.changes.length <= 200 && change.changes.every(P.valid)))
    return direct('Not a change the pending path takes.');

  if (!s.at || s.ate - Date.now() < (change ? ACCEPT_LIFE_MS : 5 * 60e3)) {
    const t = await S.tokenRequest({ grant_type: 'refresh_token', refresh_token: s.rt });
    if (!t.ok && change) return direct('Could not renew the Google token.'); // the direct write renews it, or signs out
    if (!t.ok) {
      if (t.body.error === 'invalid_grant') { S.addCookie(res, S.clearSession()); return done(401, { error: 'Google ended this session: sign in again.', code: 'SIGNED_OUT' }, false); }
      return done(502, { error: 'Could not renew the Google token (' + (t.body.error || t.status) + '). Try again.' }, false);
    }
    s.at = t.body.access_token; s.ate = Date.now() + (t.body.expires_in || 3600) * 1000;
    S.addCookie(res, S.sessionCookie(s));
  }
  if (change) {
    try { return done(200, { value: await P.accept(s, change.changes, Date.now()) }, true); }
    catch (e) { console.warn(JSON.stringify({ at: 'accept', error: String(e.message).slice(0, 200) })); return direct('Could not save it as pending.'); }
  }

  let r, j;
  try {
    r = await fetch(S.runUrl(), {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: 'Bearer ' + s.at, 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: fn, parameters: args, devMode: false }),
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError')
      return done(504, { error: 'Still running after ~5 minutes. It may finish on its own: refresh in a minute before trying again.', code: 'TIMEOUT' }, false);
    return done(502, { error: 'Could not reach Google Apps Script. Try again.' }, false);
  }
  if (r.status === 401) { S.addCookie(res, S.clearSession()); return done(401, { error: 'Google refused the session: sign in again.', code: 'SIGNED_OUT' }, false); }
  if (!r.ok) {
    const st = (j.error && j.error.status) || r.status;
    console.warn(JSON.stringify({ at: 'run', status: r.status, gstatus: st, msg: String(j.error && j.error.message || '').slice(0, 200) }));
    if (r.status === 429 || st === 'RESOURCE_EXHAUSTED') // per-account "Execution requests per minute" quota: the page pauses its polls
      return done(429, { error: 'Google is limiting requests from this account for a minute. Nothing was changed.', code: 'RATE_LIMIT' }, false);
    return done(502, { error: 'Google Apps Script refused the call (' + st + ').' }, false);
  }
  if (j.error) { // the script threw: details[0].errorMessage is our own Error message
    const d = (j.error.details || [])[0] || {};
    const msg = String(d.errorMessage || j.error.message || 'Script error').slice(0, 500);
    const busy = /^(?:Error: )?BUSY: ([\s\S]*)/.exec(msg); // the script's refused lock (busy_ in Sheets.gs): nothing was changed
    if (busy) return done(200, { error: busy[1], code: 'BUSY' }, false);
    const conflict = /^(?:Error: )?CONFLICT: ([\s\S]*)/.exec(msg); // memberSet: the partner changed that cell; error = its value now
    return done(200, conflict ? { error: conflict[1], code: 'CONFLICT' } : { error: msg }, false);
  }
  const out = { value: j.response ? j.response.result : null };
  if (fn === 'webPulse' && (b.rec === 2 || (b.rec === 1 && out.value && out.value.pending === true))) {
    try { out.rec = await P.read(s.email, Date.now()); } catch (e) { /* the next flagged pulse reads it */ }
  }
  done(200, out, true);
};
