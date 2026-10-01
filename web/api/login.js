// GET /api/login[?consent=1] → Google sign-in (ENP accounts only, account picker, PKCE + state).
// consent=1 forces the consent screen: the only way Google re-issues a refresh token for an existing grant.
const crypto = require('crypto');
const S = require('../lib/session');

module.exports = (req, res) => {
  const consent = /(^|[?&])consent=1(&|$)/.test(String(req.url || '').split('?')[1] || '');
  const verifier = S.b64u(crypto.randomBytes(32));
  const state = S.b64u(crypto.randomBytes(16));
  S.addCookie(res, S.cookie(S.PKCE_COOKIE, S.seal({ state, verifier, consent }), 600, '/api'));
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: S.redirectUri(), response_type: 'code',
    scope: S.SCOPES.join(' '), access_type: 'offline', include_granted_scopes: 'true',
    prompt: consent ? 'consent select_account' : 'select_account', hd: S.DOMAIN, state,
    code_challenge: S.b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  S.redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + q);
};
