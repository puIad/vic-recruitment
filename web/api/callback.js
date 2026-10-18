// GET /api/callback?code&state → exchange the code, check the account is a verified @g.enp.edu.dz one, start the session.
const S = require('../lib/session');

module.exports = async (req, res) => {
  const q = new URLSearchParams(String(req.url || '').split('?')[1] || '');
  const c = S.cookies(req);
  const o = S.open(c[S.PKCE_COOKIE]);
  S.addCookie(res, S.cookie(S.PKCE_COOKIE, '', 0, '/api'));
  if (q.get('error')) return S.sendPage(res, 400, 'Sign-in cancelled', 'Google said: ' + q.get('error').slice(0, 60) + '.');
  if (!o || !q.get('state') || q.get('state') !== o.state || !q.get('code'))
    return S.sendPage(res, 400, 'Sign-in expired', 'The sign-in link is stale or was opened in another browser. Start again.');

  const t = await S.tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), code_verifier: o.verifier, redirect_uri: S.redirectUri() });
  if (!t.ok) {
    console.warn(JSON.stringify({ at: 'callback', status: t.status, error: t.body.error }));
    return S.sendPage(res, 502, 'Sign-in failed', 'Google refused the sign-in (' + (t.body.error || t.status) + ').');
  }
  const id = S.idClaims(t.body.id_token) || {};
  const email = String(id.email || '').toLowerCase();
  const okAccount = id.aud === process.env.GOOGLE_CLIENT_ID && /^(https:\/\/)?accounts\.google\.com$/.test(id.iss || '') &&
    id.hd === S.DOMAIN && id.email_verified === true && email.endsWith('@' + S.DOMAIN) && id.exp * 1000 > Date.now();
  if (!okAccount) {
    await S.revoke(t.body.refresh_token || t.body.access_token);
    return S.sendPage(res, 403, 'ENP accounts only', 'Sign in with your @' + S.DOMAIN + ' Google account.');
  }
  if (S.missingScopes(t.body.scope || '').length) {
    await S.revoke(t.body.refresh_token || t.body.access_token);
    return S.sendPage(res, 403, 'Permissions missing', 'The dashboard needs every permission on the Google screen (Sheets, Drive, Forms, mail, triggers). Sign in again and keep them all ticked.');
  }
  const now = Date.now();
  const old = S.open(c[S.COOKIE]);
  // Same account back on this browser, signed out or past its 48h: Google sends no refresh token, so reuse the stored
  // one (no consent screen) once one refresh proves Google still honours it.
  let reuse = !t.body.refresh_token && old && old.rt && old.email === email;
  // a stored token from before a scope was added (script.external_request, 2026-10) can't call the script: consent once
  if (reuse) { const r = await S.tokenRequest({ grant_type: 'refresh_token', refresh_token: old.rt }); if (!r.ok || S.missingScopes(r.body.scope).length) reuse = false; }
  if (!t.body.refresh_token && !reuse) {
    // Google only issues a refresh token on consent: an earlier grant exists (e.g. a lost cookie). Ask once with consent.
    if (!o.consent) return S.redirect(res, '/api/login?consent=1');
    return S.sendPage(res, 502, 'Sign-in failed', 'Google did not return a long-lived token. Try again in a private window.');
  }
  // Revoking ends the whole grant for that account (all its browsers), so only when another account takes over this
  // browser inside the outgoing sign-in's 48h; past it, that sign-in already ended and its other browsers keep theirs.
  if (old && old.rt && old.email !== email && !S.expired(old, now)) await S.revoke(old.rt);
  S.addCookie(res, S.sessionCookie({ email, rt: reuse ? old.rt : t.body.refresh_token, at: t.body.access_token,
    ate: now + (t.body.expires_in || 3600) * 1000, iat: now }));
  console.log(JSON.stringify({ at: 'login', email }));
  S.redirect(res, '/');
};
