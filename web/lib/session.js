// Session cookie + Google OAuth helpers shared by the api/ functions. No dependencies (node:crypto + fetch).
// Cookie vic_s = AES-256-GCM{ email, rt, at, ate, iat }. The key lives only in SESSION_KEY (Vercel env):
// rotating it signs everyone out. Refresh tokens stay live at Google past the 48h, so the kill switch is SESSION_KEY
// plus the OAuth client secret.
const crypto = require('crypto');

const SESSION_HOURS = 48;            // fixed from sign-in, never extended
const COOKIE = 'vic_s', PKCE_COOKIE = 'vic_o';
const DOMAIN = 'g.enp.edu.dz';
const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/forms',
  'https://www.googleapis.com/auth/script.send_mail',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/script.container.ui',
  'https://www.googleapis.com/auth/userinfo.email',
];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function key() {
  const k = Buffer.from(process.env.SESSION_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('SESSION_KEY must be 32 bytes, base64');
  return k;
}
const b64u = buf => Buffer.from(buf).toString('base64url');

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), ct]));
}
/** The object, or null if missing / tampered / sealed with another key. */
function open(str) {
  if (!str) return null;
  try {
    const raw = Buffer.from(str, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch (e) { return null; }
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function cookie(name, value, maxAgeSec, path) {
  return name + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAgeSec + '; Path=' + (path || '/') + '; HttpOnly; Secure; SameSite=Lax';
}
function addCookie(res, c) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(prev || [], c));
}
const sessionCookie = s => cookie(COOKIE, seal(s), 30 * 24 * 3600); // 30d: a later sign-in on this browser reuses its refresh token (no consent screen)
const clearSession = () => cookie(COOKIE, '', 0);

const expired = (s, now) => (now || Date.now()) - s.iat > SESSION_HOURS * 3600e3;
const expiresAt = s => s.iat + SESSION_HOURS * 3600e3;

const origin = () => String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
const redirectUri = () => origin() + '/api/callback';

async function tokenRequest(params) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET }, params)),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body: j };
}
/** Best effort: a failed revoke must never block sign-out. */
async function revoke(token) {
  if (!token) return;
  try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }); }
  catch (e) { /* ignore */ }
}

/** Payload of an id_token that came straight from Google's token endpoint over TLS (no signature check needed). */
function idClaims(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8')); } catch (e) { return null; }
}

/** CSRF guard for state-changing POSTs: a custom header (a cross-site page can't send one without a CORS preflight,
 *  which we never answer), and a foreign Origin is refused when the browser sends one. */
const sameOrigin = req => !!origin() && req.headers['x-vic'] === '1' && (!req.headers.origin || req.headers.origin === origin());

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function sendPage(res, status, title, text) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) +
    '</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#1f2a44;background:#f6f4ef">' +
    '<h1 style="font-size:22px">' + esc(title) + '</h1><p>' + esc(text) + '</p><p><a href="/api/login" style="color:#1f3864;font-weight:600">Sign in again</a> · <a href="/" style="color:#1f3864">Home</a></p></body>');
}
function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.setHeader('Cache-Control', 'no-store'); res.end(); }

module.exports = {
  SESSION_HOURS, COOKIE, PKCE_COOKIE, DOMAIN, SCOPES, b64u, seal, open, cookies, cookie, addCookie, sessionCookie, clearSession,
  expired, expiresAt, origin, redirectUri, tokenRequest, revoke, idClaims, sameOrigin, sendJson, sendPage, redirect,
};
