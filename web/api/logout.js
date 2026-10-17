// POST /api/logout → sign out on this browser only. Never revokes: the grant is shared by the person's other browsers,
// and signing back in here reuses it (no consent screen). The cookie keeps only the refresh token (sealed, HttpOnly)
// marked out: /api/run refuses it until a Google sign-in.
const S = require('../lib/session');

module.exports = (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  if (!S.sameOrigin(req)) return S.sendJson(res, 403, { error: 'Bad origin' });
  const s = S.open(S.cookies(req)[S.COOKIE]);
  if (s) console.log(JSON.stringify({ at: 'logout', email: s.email }));
  S.addCookie(res, s ? S.sessionCookie({ email: s.email, rt: s.rt, iat: s.iat, out: true }) : S.clearSession());
  S.sendJson(res, 200, { ok: true });
};
