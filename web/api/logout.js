// POST /api/logout → revoke the refresh token at Google (ends the grant) and drop the cookie.
const S = require('../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  if (!S.sameOrigin(req)) return S.sendJson(res, 403, { error: 'Bad origin' });
  const s = S.open(S.cookies(req)[S.COOKIE]);
  if (s) { await S.revoke(s.rt); console.log(JSON.stringify({ at: 'logout', email: s.email })); }
  S.addCookie(res, S.clearSession());
  S.sendJson(res, 200, { ok: true });
};
