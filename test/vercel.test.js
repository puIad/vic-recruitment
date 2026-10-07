// The Vercel functions (web/api + web/lib) against a mocked Google: session cookie, login/callback, the run proxy, logout.
const assert = require('assert'), crypto = require('crypto');
process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
process.env.APP_ORIGIN = 'https://vic.test';
process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secret';
process.env.SCRIPT_API_DEPLOYMENT_ID = 'AKfyAPI';
console.log = () => {}; console.warn = () => {}; // the functions log one line per call

const S = require('../web/lib/session');
const seed = require('./seed')();
const g = require('./googlemock')(seed);
const handlers = { run: require('../web/api/run'), login: require('../web/api/login'), callback: require('../web/api/callback'), logout: require('../web/api/logout') };

function invoke(name, { method = 'GET', url = '/', cookie = '', origin = process.env.APP_ORIGIN, xvic = '1', body } = {}) {
  return new Promise(resolve => {
    const headers = {}, res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; },
      end(b) {
        const set = [].concat(headers['set-cookie'] || []);
        const jar = {}; set.forEach(c => { const m = c.match(/^([^=]+)=([^;]*)/); jar[m[1]] = decodeURIComponent(m[2]); });
        let j = null; try { j = JSON.parse(b); } catch (e) { /* html */ }
        resolve({ status: res.statusCode, headers, body: b, json: j, jar, set });
      },
    };
    Promise.resolve(handlers[name]({ method, url, headers: { cookie, origin, 'x-vic': xvic }, body }, res));
  });
}
const sess = (email, extra) => S.COOKIE + '=' + encodeURIComponent(S.seal(Object.assign({ email, rt: 'rt:' + email, at: 'at:' + email, ate: Date.now() + 3600e3, iat: Date.now() }, extra)));
const rpc = (cookie, fn, ...args) => invoke('run', { method: 'POST', cookie, body: { fn, args } });

(async () => {
  // --- session sealing
  const box = S.seal({ a: 1 });
  assert.deepStrictEqual(S.open(box), { a: 1 }, 'round-trip');
  const raw = Buffer.from(box, 'base64url'); raw[raw.length - 1] ^= 1;
  assert.strictEqual(S.open(raw.toString('base64url')), null, 'tampered cookie rejected');
  assert.strictEqual(S.open('garbage'), null);
  const t = Date.now();
  assert.strictEqual(S.expired({ iat: t - 48 * 3600e3 + 1000 }, t), false, '48h boundary: just inside');
  assert.strictEqual(S.expired({ iat: t - 48 * 3600e3 - 1000 }, t), true, '48h boundary: just past');
  const k = process.env.SESSION_KEY; process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
  assert.strictEqual(S.open(box), null, 'rotating SESSION_KEY signs everyone out');
  process.env.SESSION_KEY = k;

  // --- login: PKCE + state + hd + account picker
  let r = await invoke('login', { url: '/api/login' });
  assert.strictEqual(r.status, 302);
  const auth = new URL(r.headers.location);
  assert.strictEqual(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepStrictEqual(['hd', 'prompt', 'access_type', 'code_challenge_method', 'redirect_uri'].map(x => auth.searchParams.get(x)),
    ['g.enp.edu.dz', 'select_account', 'offline', 'S256', 'https://vic.test/api/callback']);
  assert(auth.searchParams.get('scope').includes('https://www.googleapis.com/auth/script.scriptapp'));
  const o = S.open(r.jar[S.PKCE_COOKIE]);
  assert.strictEqual(o.state, auth.searchParams.get('state'));
  assert.strictEqual(S.b64u(crypto.createHash('sha256').update(o.verifier).digest()), auth.searchParams.get('code_challenge'));
  assert(r.set[0].includes('Path=/api') && r.set[0].includes('HttpOnly') && r.set[0].includes('Max-Age=600'));
  assert.strictEqual(new URL((await invoke('login', { url: '/api/login?consent=1' })).headers.location).searchParams.get('prompt'), 'consent select_account');

  // --- callback: needs the token endpoint to return an id_token; extend the mock for this step only
  const realFetch = global.fetch;
  const idt = c => 'x.' + Buffer.from(JSON.stringify(Object.assign({ aud: process.env.GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', hd: 'g.enp.edu.dz', email_verified: true, exp: Date.now() / 1000 + 3600 }, c))).toString('base64url') + '.sig';
  let tokenReply;
  global.fetch = async (url, init) => (String(url) === 'https://oauth2.googleapis.com/token' && /authorization_code/.test(init.body)
    ? { ok: true, status: 200, json: async () => tokenReply } : realFetch(url, init));
  const allScopes = S.SCOPES.join(' ');
  const cb = (state, cookieState) => invoke('callback', { url: '/api/callback?code=c&state=' + state, cookie: S.PKCE_COOKIE + '=' + encodeURIComponent(S.seal({ state: cookieState, verifier: 'v', consent: false })) });

  tokenReply = { access_token: 'at:helper@g.enp.edu.dz', refresh_token: 'rt:helper@g.enp.edu.dz', expires_in: 3600, scope: allScopes, id_token: idt({ email: 'Helper@g.enp.edu.dz' }) };
  r = await cb('s1', 's2');
  assert.strictEqual(r.status, 400, 'state mismatch refused');
  r = await cb('s1', 's1');
  assert.strictEqual(r.status, 302); assert.strictEqual(r.headers.location, '/');
  const s = S.open(r.jar[S.COOKIE]);
  assert.deepStrictEqual([s.email, s.rt], ['helper@g.enp.edu.dz', 'rt:helper@g.enp.edu.dz']);
  assert(r.set.some(c => c.startsWith(S.COOKIE + '=') && /HttpOnly; Secure; SameSite=Lax/.test(c) && /Max-Age=2592000/.test(c)));
  assert(r.set.some(c => c.startsWith(S.PKCE_COOKIE + '=;')), 'one-time state cookie cleared');

  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'x@gmail.com', hd: undefined }) });
  r = await cb('s', 's'); assert.strictEqual(r.status, 403, 'non-ENP account refused'); assert(!r.jar[S.COOKIE]);
  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'a@g.enp.edu.dz', email_verified: false }) });
  r = await cb('s', 's'); assert.strictEqual(r.status, 403, 'unverified email refused');
  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'a@g.enp.edu.dz', aud: 'someone-else' }) });
  r = await cb('s', 's'); assert.strictEqual(r.status, 403, 'token for another client refused');
  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'a@g.enp.edu.dz' }), scope: 'openid email https://www.googleapis.com/auth/spreadsheets' });
  r = await cb('s', 's'); assert.strictEqual(r.status, 403, 'unticked permissions refused'); assert(/Permissions missing/.test(r.body));
  tokenReply = Object.assign({}, tokenReply, { scope: allScopes, refresh_token: undefined });
  r = await cb('s', 's'); assert.deepStrictEqual([r.status, r.headers.location], [302, '/api/login?consent=1'], 'no refresh token → retry once with consent');
  // back within 48h (signed out, same account): Google sends no refresh token → reuse the stored one, no consent screen
  const cbWith = (sessCookie) => invoke('callback', { url: '/api/callback?code=c&state=s', cookie: S.PKCE_COOKIE + '=' + encodeURIComponent(S.seal({ state: 's', verifier: 'v', consent: false })) + '; ' + S.COOKIE + '=' + encodeURIComponent(S.seal(sessCookie)) });
  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'a@g.enp.edu.dz' }) });
  const iat0 = Date.now() - 10 * 3600e3;
  r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat: iat0, out: true });
  const back = S.open(r.jar[S.COOKIE]);
  assert.deepStrictEqual([r.status, r.headers.location, back.rt, back.iat, back.out], [302, '/', 'rt:kept', iat0, undefined], 'same account within 48h: grant reused, window kept');
  r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat: Date.now() - 49 * 3600e3, out: true });
  assert.strictEqual(r.headers.location, '/api/login?consent=1', 'past 48h: consent again');
  r = await cbWith({ email: 'b@g.enp.edu.dz', rt: 'rt:other', iat: iat0, out: true });
  assert.strictEqual(r.headers.location, '/api/login?consent=1', "another account's grant is never reused");
  g.log.revoked.length = 0;
  tokenReply = Object.assign({}, tokenReply, { refresh_token: 'rt:new' });
  r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat: iat0 });
  assert.deepStrictEqual([S.open(r.jar[S.COOKIE]).rt, g.log.revoked], ['rt:new', []], 'same account re-consents: the old token is not revoked (that would end the new grant too)');
  r = await cbWith({ email: 'b@g.enp.edu.dz', rt: 'rt:other', iat: iat0 });
  assert.deepStrictEqual(g.log.revoked, ['rt:other'], 'another account takes over: its grant is revoked');
  global.fetch = realFetch;

  // --- run proxy: gates
  const admin = sess('admin@g.enp.edu.dz'), helper = sess('helper@g.enp.edu.dz');
  assert.strictEqual((await invoke('run', { method: 'GET', cookie: admin })).status, 405);
  assert.strictEqual((await invoke('run', { method: 'POST', cookie: admin, origin: 'https://evil.test', body: { fn: 'webState' } })).status, 403, 'CSRF: foreign Origin refused');
  assert.strictEqual((await invoke('run', { method: 'POST', cookie: admin, xvic: null, body: { fn: 'webState' } })).status, 403, 'CSRF: no custom header refused');
assert.strictEqual((await invoke('run', { method: 'POST', cookie: admin, origin: null, body: { fn: 'webAccess' } })).status, 200, 'no Origin + custom header is fine (same-origin)');
  assert.strictEqual((await rpc('', 'webState')).status, 401);
  r = await rpc(admin, 'setup');
  assert.deepStrictEqual([r.status, /Not exposed/.test(r.json.error)], [400, true], 'allowlist');
  assert.strictEqual(g.log.runs.length, 1, 'only the one allowed call reached the script');

  // --- run proxy: real calls, as the visitor
  r = await rpc(admin, 'webAccess');
  assert.deepStrictEqual(r.json.value, { ok: true, role: 'admin', email: 'admin@g.enp.edu.dz', reason: '', owner: true, binome: '', cover: false, v: 3 });
  assert.strictEqual(+r.headers['x-session-expires'] > Date.now() + 47 * 3600e3, true, 'session end exposed to the page');
  r = await rpc(admin, 'webRun', 'importTeam', { link: '' });
  assert(/Imported 13 members/.test(r.json.value.messages[0]));
  r = await rpc(helper, 'webAccess');
  assert.strictEqual(r.json.value.reason, 'READ_ONLY', 'a non-editor gets the no-access view, decided by the script');
  r = await rpc(helper, 'webState');
  assert.deepStrictEqual([r.status, r.json.error], [200, 'Not allowed'], 'script errors come back as {error}');
  seed.run('__lockBusy = true');
  r = await rpc(admin, 'webRun', 'sync');
  seed.run('__lockBusy = false');
  assert.deepStrictEqual([r.status, r.json.code, /^Another update is running\. Nothing was changed/.test(r.json.error)], [200, 'BUSY', true], 'a refused lock reaches the page as code BUSY, without the prefix');
  seed.run('ss_().addEditor("helper@g.enp.edu.dz")');
  r = await rpc(helper, 'webRun', 'setup');
  assert(/Only the owner/.test(r.json.error), 'editor cannot run setup through the proxy');
  r = await rpc(helper, 'webState');
  assert.strictEqual(r.json.value.team.total, 13, 'sharing the Master = access, no Vercel change');
  assert.deepStrictEqual(g.log.runs.slice(-1)[0], { fn: 'webState', email: 'helper@g.enp.edu.dz' }, 'runs with the visitor token');

  // --- token refresh before the call
  g.log.token.length = 0;
  r = await rpc(sess('admin@g.enp.edu.dz', { ate: Date.now() + 60e3, at: 'at:stale' }), 'webAccess');
  assert.deepStrictEqual([g.log.token, r.json.value.email], [['refresh_token'], 'admin@g.enp.edu.dz'], 'refreshed when < 5 min left');
  assert.strictEqual(S.open(r.jar[S.COOKIE]).at, 'at:admin@g.enp.edu.dz', 'new token written back to the cookie');
  g.opts.refreshFails = 'invalid_grant';
  r = await rpc(sess('admin@g.enp.edu.dz', { ate: 0 }), 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code, r.jar[S.COOKIE]], [401, 'SIGNED_OUT', ''], 'revoked grant → signed out');
  g.opts.refreshFails = null;

  // --- 48h expiry: revoke + 401
  g.log.revoked.length = 0;
  r = await rpc(sess('admin@g.enp.edu.dz', { iat: Date.now() - 49 * 3600e3 }), 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code, g.log.revoked, r.jar[S.COOKIE]], [401, 'EXPIRED', ['rt:admin@g.enp.edu.dz'], '']);

  // --- timeout and Google refusals
  g.opts.timeout = true;
  r = await rpc(admin, 'webRun', 'lock', { budgetMs: 200000 });
  assert.deepStrictEqual([r.status, r.json.code], [504, 'TIMEOUT']); assert(/may finish on its own/i.test(r.json.error));
  g.opts.timeout = false;
  g.opts.scriptStatus = 403;
  r = await rpc(admin, 'webAccess');
  assert.strictEqual(r.status, 502); assert(!/secret details/.test(r.body), 'Google error messages are summarized, not echoed');
  g.opts.scriptStatus = 429;
  r = await rpc(admin, 'webPulse');
  assert.deepStrictEqual([r.status, r.json.code, /limiting requests.*Nothing was changed/.test(r.json.error)], [429, 'RATE_LIMIT', true], "Google's rate limit reaches the page as code RATE_LIMIT");
  g.opts.scriptStatus = 401;
  r = await rpc(admin, 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code], [401, 'SIGNED_OUT']);
  g.opts.scriptStatus = 200;

  // --- logout: signed out, grant kept until its 48h end
  g.log.revoked.length = 0;
  assert.strictEqual((await invoke('logout', { method: 'POST', cookie: admin, origin: 'https://evil.test' })).status, 403);
  assert.strictEqual((await invoke('logout', { method: 'POST', cookie: admin, xvic: null })).status, 403, 'logout needs the header too');
  r = await invoke('logout', { method: 'POST', cookie: admin });
  const out = S.open(r.jar[S.COOKIE]);
  assert.deepStrictEqual([r.status, g.log.revoked, out.out, out.rt, out.at], [200, [], true, 'rt:admin@g.enp.edu.dz', undefined]);
  r = await rpc(S.COOKIE + '=' + encodeURIComponent(r.jar[S.COOKIE]), 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code], [401, 'SIGNED_OUT'], 'a signed-out cookie cannot call the script');
  r = await invoke('logout', { method: 'POST', cookie: sess('admin@g.enp.edu.dz', { iat: Date.now() - 49 * 3600e3 }) });
  assert.deepStrictEqual([g.log.revoked, r.jar[S.COOKIE]], [['rt:admin@g.enp.edu.dz'], ''], 'past 48h: logout revokes');

  // --- front (frontend/): the one RPC wrapper is the proxy, version matches the script
  const front = f => require('fs').readFileSync(__dirname + '/../frontend/src/lib/vic/' + f, 'utf8');
  assert(/fetch\("\/api\/run"/.test(front('api.ts')) && !/google\.script/.test(front('api.ts')), 'every call goes through /api/run');
  const gs = require('fs').readFileSync(__dirname + '/../WebApp.gs', 'utf8');
  assert.strictEqual(front('types.ts').match(/export const API_VERSION = (\d+)/)[1], gs.match(/const API_VERSION = (\d+)/)[1], 'front and script API_VERSION match');

  g.restore();
  process.stdout.write('VERCEL OK\n');
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exit(1); });
