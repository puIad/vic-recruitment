// POST /api/run {fn, args} → Apps Script API scripts.run as the signed-in visitor. Returns {value} or {error, code}.
// The script re-checks access on every call; this proxy only gates who may talk to it and never sees more than it needs.
const S = require('../lib/session');

const ALLOWED = ['webAccess', 'webState', 'webRun'];
const TIMEOUT_MS = 285000; // under maxDuration 300 (vercel.json)

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new Error('too large'); }
  return JSON.parse(raw || '{}');
}

const runUrl = () => 'https://script.googleapis.com/v1/scripts/' + process.env.SCRIPT_API_DEPLOYMENT_ID + ':run';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  if (!S.sameOrigin(req)) return S.sendJson(res, 403, { error: 'Bad origin' });
  const s = S.open(S.cookies(req)[S.COOKIE]);
  if (!s) return S.sendJson(res, 401, { error: 'Signed out', code: 'SIGNED_OUT' });
  if (S.expired(s)) {
    await S.revoke(s.rt);
    S.addCookie(res, S.clearSession());
    return S.sendJson(res, 401, { error: 'Your 48h session ended: sign in again.', code: 'EXPIRED' });
  }
  let b;
  try { b = await body(req); } catch (e) { return S.sendJson(res, 400, { error: 'Bad request' }); }
  const fn = b && b.fn, args = Array.isArray(b && b.args) ? b.args : [];
  if (ALLOWED.indexOf(fn) < 0) return S.sendJson(res, 400, { error: 'Not exposed: ' + String(fn).slice(0, 40) });

  const t0 = Date.now();
  const action = fn === 'webRun' ? 'webRun:' + String(args[0]).slice(0, 20) : fn;
  const done = (status, out, ok) => {
    console.log(JSON.stringify({ email: s.email, action, ms: Date.now() - t0, ok }));
    res.setHeader('X-Session-Expires', String(S.expiresAt(s)));
    S.sendJson(res, status, out);
  };

  if (!s.at || s.ate - Date.now() < 5 * 60e3) {
    const t = await S.tokenRequest({ grant_type: 'refresh_token', refresh_token: s.rt });
    if (!t.ok) {
      if (t.body.error === 'invalid_grant') { S.addCookie(res, S.clearSession()); return done(401, { error: 'Google ended this session: sign in again.', code: 'SIGNED_OUT' }, false); }
      return done(502, { error: 'Could not renew the Google token (' + (t.body.error || t.status) + '). Try again.' }, false);
    }
    s.at = t.body.access_token; s.ate = Date.now() + (t.body.expires_in || 3600) * 1000;
    S.addCookie(res, S.sessionCookie(s));
  }

  let r, j;
  try {
    r = await fetch(runUrl(), {
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
    return done(502, { error: 'Google Apps Script refused the call (' + st + ').' }, false);
  }
  if (j.error) { // the script threw: details[0].errorMessage is our own Error message
    const d = (j.error.details || [])[0] || {};
    return done(200, { error: String(d.errorMessage || j.error.message || 'Script error').slice(0, 500) }, false);
  }
  done(200, { value: j.response ? j.response.result : null }, true);
};
