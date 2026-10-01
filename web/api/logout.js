// POST /api/logout → sign out, but keep the grant until its 48h end, so signing back in skips the consent screen.
// The cookie keeps only the refresh token (sealed, HttpOnly) marked out: /api/run refuses it until a Google sign-in.
const S = require('../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  if (!S.sameOrigin(req)) return S.sendJson(res, 403, { error: 'Bad origin' });
  const s = S.open(S.cookies(req)[S.COOKIE]);
  if (s) console.log(JSON.stringify({ at: 'logout', email: s.email }));
  if (s && !S.expired(s)) S.addCookie(res, S.sessionCookie({ email: s.email, rt: s.rt, iat: s.iat, out: true }));
  else { if (s) await S.revoke(s.rt); S.addCookie(res, S.clearSession()); }
  S.sendJson(res, 200, { ok: true });
};
