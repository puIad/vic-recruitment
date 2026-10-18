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
const P = require('../web/lib/pending'), F = require('./fakes')(P), apply = require('../web/api/apply');
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
  // same account back on this browser (signed out, inside or past 48h): Google sends no refresh token → reuse the stored one, no consent screen
  const cbWith = (sessCookie) => invoke('callback', { url: '/api/callback?code=c&state=s', cookie: S.PKCE_COOKIE + '=' + encodeURIComponent(S.seal({ state: 's', verifier: 'v', consent: false })) + '; ' + S.COOKIE + '=' + encodeURIComponent(S.seal(sessCookie)) });
  tokenReply = Object.assign({}, tokenReply, { id_token: idt({ email: 'a@g.enp.edu.dz' }) });
  const iat0 = Date.now() - 10 * 3600e3;
  for (const [iat, when] of [[iat0, 'within 48h'], [Date.now() - 49 * 3600e3, 'past 48h']]) {
    g.log.token.length = 0;
    const t0 = Date.now();
    r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat, out: true });
    const back = S.open(r.jar[S.COOKIE]);
    assert.deepStrictEqual([r.status, r.headers.location, back.rt, back.iat >= t0, back.out, g.log.token], [302, '/', 'rt:kept', true, undefined, ['refresh_token']], 'same account ' + when + ': grant reused after one test refresh, 48h restart now');
  }
  g.opts.refreshFails = 'invalid_grant';
  r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat: iat0, out: true });
  g.opts.refreshFails = null;
  assert.strictEqual(r.headers.location, '/api/login?consent=1', 'a reused token Google refuses → consent');
  r = await cbWith({ email: 'b@g.enp.edu.dz', rt: 'rt:other', iat: iat0, out: true });
  assert.strictEqual(r.headers.location, '/api/login?consent=1', "another account's grant is never reused");
  g.log.revoked.length = 0;
  tokenReply = Object.assign({}, tokenReply, { refresh_token: 'rt:new' });
  const t1 = Date.now();
  r = await cbWith({ email: 'a@g.enp.edu.dz', rt: 'rt:kept', iat: iat0 });
  const fresh = S.open(r.jar[S.COOKIE]);
  assert.deepStrictEqual([fresh.rt, fresh.iat >= t1, g.log.revoked], ['rt:new', true, []], 'same account re-consents: the old token is not revoked (that would end the new grant too), 48h restart now');
  r = await cbWith({ email: 'b@g.enp.edu.dz', rt: 'rt:other', iat: iat0, out: true });
  assert.deepStrictEqual([g.log.revoked, S.open(r.jar[S.COOKIE]).email], [['rt:other'], 'a@g.enp.edu.dz'], 'another account takes over inside 48h (even signed out): its grant is revoked');
  g.log.revoked.length = 0;
  r = await cbWith({ email: 'b@g.enp.edu.dz', rt: 'rt:other', iat: Date.now() - 49 * 3600e3 });
  assert.deepStrictEqual([g.log.revoked, S.open(r.jar[S.COOKIE]).rt], [[], 'rt:new'], 'another account takes over past 48h: overwritten, no revoke');
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
  assert.deepStrictEqual(r.json.value, { ok: true, role: 'admin', email: 'admin@g.enp.edu.dz', reason: '', owner: true, binome: '', cover: false, v: 3, photo: 'https://lh3.googleusercontent.com/a/test=s128-c' });
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
  seed.run('var __wr = webRun; webRun = () => { throw new Error("CONFLICT: No answer"); }');
  r = await rpc(admin, 'webRun', 'memberSet');
  seed.run('webRun = __wr');
  assert.deepStrictEqual([r.status, r.json.code, r.json.error], [200, 'CONFLICT', 'No answer'], 'a conflict reaches the page as code CONFLICT, with the value now in the cell');
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

  // --- 48h expiry: 401, no revoke, the cookie keeps the refresh token (access token dropped) for the next sign-in
  g.log.revoked.length = 0;
  const iatOld = Date.now() - 49 * 3600e3;
  r = await rpc(sess('admin@g.enp.edu.dz', { iat: iatOld }), 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code, g.log.revoked, S.open(r.jar[S.COOKIE])], [401, 'EXPIRED', [], { email: 'admin@g.enp.edu.dz', rt: 'rt:admin@g.enp.edu.dz', iat: iatOld }]);

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

  // --- logout: signed out on this browser, grant never revoked
  g.log.revoked.length = 0;
  assert.strictEqual((await invoke('logout', { method: 'POST', cookie: admin, origin: 'https://evil.test' })).status, 403);
  assert.strictEqual((await invoke('logout', { method: 'POST', cookie: admin, xvic: null })).status, 403, 'logout needs the header too');
  r = await invoke('logout', { method: 'POST', cookie: admin });
  const out = S.open(r.jar[S.COOKIE]);
  assert.deepStrictEqual([r.status, g.log.revoked, out.out, out.rt, out.at], [200, [], true, 'rt:admin@g.enp.edu.dz', undefined]);
  r = await rpc(S.COOKIE + '=' + encodeURIComponent(r.jar[S.COOKIE]), 'webAccess');
  assert.deepStrictEqual([r.status, r.json.code], [401, 'SIGNED_OUT'], 'a signed-out cookie cannot call the script');
  r = await invoke('logout', { method: 'POST', cookie: sess('admin@g.enp.edu.dz', { iat: iatOld }) });
  assert.deepStrictEqual([g.log.revoked, S.open(r.jar[S.COOKIE])], [[], { email: 'admin@g.enp.edu.dz', rt: 'rt:admin@g.enp.edu.dz', iat: iatOld, out: true }], 'past 48h: logout keeps the token, no revoke');

  // --- pending changes: the switch, the accept step, the consumer, the pulse flag, drop answers (fakes for Redis and Queues)
  {
    const own = sess('admin@g.enp.edu.dz');
    seed.run(`(function () { var sh = ss_().getSheetByName('Alerts'), n = sh.getLastRow() + 1, t = new Date();
      sh.getRange(n, 1, 4, 11).setValues(['A-9001', 'A-9002', 'A-9003', 'A-9004'].map(function (id) { return [id, t, 'HIGH', 'BAD_PHONE', '', '', 'x', '', 'OPEN', '', 'K|' + id]; })); })()`);
    const status = id => seed.run(`ss_().getSheetByName('Alerts').getDataRange().getValues().filter(function (r) { return r[0] === '${id}'; })[0][8]`);
    const setStatus = (id, st) => seed.run(`(function () { var sh = ss_().getSheetByName('Alerts'), d = sh.getDataRange().getValues();
      for (var i = 1; i < d.length; i++) if (d[i][0] === '${id}') sh.getRange(i + 1, 9, 1, 2).setValues([['${st}', '${st}' === 'SNOOZED' ? new Date(Date.now() + 36e5) : '']]); })()`);
    const accept = (cookie, ...changes) => rpc(cookie, 'accept', { v: 1, changes: changes.map(c => Object.assign({ kind: 'alert', at: Date.now() }, c)) });
    const last = () => F.sent[F.sent.length - 1].payload;
    const deliver = async (payload, n) => { F.unthrottle(); return apply.handle(payload || last(), { deliveryCount: n || 1 }); };
    const pulse = (cookie, rec) => invoke('run', { method: 'POST', cookie, body: { fn: 'webPulse', args: [true], rec } });
    const recOf = async (cookie, cell) => (await pulse(cookie, 2)).json.rec[cell];

    // switch off: the pulse reads no Redis, whatever the page asks with rec 1
    r = await pulse(own, 1);
    assert.deepStrictEqual([r.json.value.pending, 'rec' in r.json, F.log.redis], [false, false, 0], 'switch off: no Redis call');
    assert.strictEqual(typeof (await rpc(own, 'webPulse')).json.value, 'number', 'the bare pulse is unchanged');
    r = await rpc(own, 'webRun', 'pendingSwitch', { on: true });
    assert.deepStrictEqual(r.json.value.result, { pending: true });
    r = await pulse(own, 1);
    assert.deepStrictEqual([r.json.value.pending, r.json.rec], [true, {}], 'switch on: the record rides on the pulse');

    // accept → one message (token sealed, never in Redis) → the consumer applies it as the author
    r = await accept(own, { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    const e1 = r.json.value['alert:A-9001'];
    assert.deepStrictEqual([r.status, e1.state, e1.value, e1.seen, F.sent.length], [200, 'pending', 'RESOLVED', 'OPEN', 1]);
    assert.deepStrictEqual([F.sent[0].topic, F.sent[0].opts.retentionSeconds], ['vic-apply', 7200]);
    assert(!/at:admin/.test(JSON.stringify(F.sent[0].payload)) && !/at:admin/.test(JSON.stringify(F.db)), 'the token is sealed in the message and never in Redis');
    assert.strictEqual(S.open(F.sent[0].payload.t).at, 'at:admin@g.enp.edu.dz');
    assert.strictEqual(status('A-9001'), 'OPEN', 'accepted, not applied yet');
    await deliver();
    const done1 = await recOf(own, 'alert:A-9001');
    assert.deepStrictEqual([status('A-9001'), done1.state, done1.wrote > 0, done1.exp > Date.now()], ['RESOLVED', 'applied', true, true]);
    assert(g.log.runs.some(x => x.fn === 'webApply' && x.email === 'admin@g.enp.edu.dz'), 'scripts.run as the author');
    const runs0 = g.log.runs.length;
    await deliver(F.sent[0].payload);
    assert.strictEqual(g.log.runs.length, runs0, 'a second delivery finds it ended: nothing called');
    r = await accept(own, { alert: 'A-9001', op: 'mute', seen: 'OPEN' }); // a device still showing it open, before the snapshot catches up
    assert.deepStrictEqual([r.json.value['alert:A-9001'].state, F.sent.length], ['applied', 1], 'closed by their own Resolve: already met, nothing published');

    // same person, first still pending: Snooze then Unmute cancels; the queued Snooze finds no entry
    await accept(own, { alert: 'A-9002', op: 'snooze', seen: 'OPEN', until: Date.now() + 3600e3 });
    const snoozeMsg = last();
    r = await accept(own, { alert: 'A-9002', op: 'unmute', seen: 'SNOOZED' });
    assert.deepStrictEqual(['alert:A-9002' in r.json.value, F.sent.length], [false, 2], 'typed then undone: nothing left, nothing published');
    const runs1 = g.log.runs.length;
    await deliver(snoozeMsg);
    assert.deepStrictEqual([status('A-9002'), g.log.runs.length], ['OPEN', runs1], 'cancelled: never applied');
    // Snooze then Mute: the second replaces the first and keeps its seen value
    await accept(own, { alert: 'A-9002', op: 'snooze', seen: 'OPEN', until: Date.now() + 3600e3 });
    r = await accept(own, { alert: 'A-9002', op: 'mute', seen: 'SNOOZED' });
    assert.deepStrictEqual([r.json.value['alert:A-9002'].op, r.json.value['alert:A-9002'].seen], ['mute', 'OPEN']);
    await deliver();
    assert.strictEqual(status('A-9002'), 'MUTED');
    // an applied mark whose old value is what another device still shows: judged against the author's own change
    r = await accept(own, { alert: 'A-9002', op: 'resolve', seen: 'OPEN' });
    assert.strictEqual(r.json.value['alert:A-9002'].seen, 'MUTED', 'seen taken from the applied mark');
    await deliver();
    assert.strictEqual(status('A-9002'), 'RESOLVED', 'no drop against their own change');

    // an expired mark is left out of reads, and the next accept removes it from the hash
    F.db['pc:admin@g.enp.edu.dz']['alert:A-9999'] = JSON.stringify({ cell: 'alert:A-9999', state: 'applied', exp: Date.now() - 1 });
    assert(!('alert:A-9999' in (await pulse(own, 2)).json.rec), 'expired: not read');
    await accept(own, { alert: 'A-9003', op: 'resolve', seen: 'OPEN' });
    assert(!('alert:A-9999' in F.db['pc:admin@g.enp.edu.dz']), 'expired: removed by the next accept');
    await accept(own, { alert: 'A-9003', op: 'unmute', seen: 'OPEN' }); // undone: cancels it, so the next case starts clean

    // a hand edit before it applies: dropped with the sheet's value, shown, then Apply mine anyway / Keep the sheet's value
    await accept(own, { alert: 'A-9003', op: 'mute', seen: 'OPEN' });
    setStatus('A-9003', 'SNOOZED');
    await deliver();
    let d = await recOf(own, 'alert:A-9003');
    assert.deepStrictEqual([d.state, d.sheet, d.again, status('A-9003')], ['dropped', 'SNOOZED', true, 'SNOOZED']);
    r = await rpc(own, 'pendingMark', { shown: ['alert:A-9003'] });
    assert(r.json.value['alert:A-9003'].shown > 0 && !r.json.value['alert:A-9003'].addressed);
    r = await accept(own, { alert: 'A-9003', op: 'mute', seen: 'SNOOZED' });
    assert.deepStrictEqual([r.json.value['alert:A-9003'].state, r.json.value['alert:A-9003'].seen], ['pending', 'SNOOZED'], 'Apply mine anyway: a fresh change, seen = the sheet as the notice showed it');
    await deliver();
    assert.strictEqual(status('A-9003'), 'MUTED');
    await accept(own, { alert: 'A-9004', op: 'resolve', seen: 'OPEN' });
    setStatus('A-9004', 'SNOOZED');
    await deliver();
    r = await rpc(own, 'pendingMark', { keep: ['alert:A-9004'] });
    d = r.json.value['alert:A-9004'];
    assert(d.addressed > 0 && d.exp - Date.now() > 6 * 864e5, "Keep the sheet's value: addressed, gone in 7 days");

    // one call per author per minute: a second delivery inside the minute waits for it
    setStatus('A-9004', 'OPEN');
    await accept(own, { alert: 'A-9004', op: 'mute', seen: 'OPEN' });
    await deliver();
    setStatus('A-9004', 'OPEN');
    await accept(own, { alert: 'A-9004', op: 'resolve', seen: 'OPEN' });
    await assert.rejects(apply.handle(last(), { deliveryCount: 1 }), e => e instanceof apply.Later && e.after > 50 && e.after <= 61);
    assert.deepStrictEqual(apply.retry(new apply.Later(42), { deliveryCount: 1 }), { afterSeconds: 42 });
    // Google failing: retried with backoff; too little token life left: dropped, Apply mine anyway offered
    g.opts.scriptStatus = 500;
    await assert.rejects(deliver(last(), 3), e => e instanceof apply.Later && e.after === 240);
    g.opts.scriptStatus = 200;
    const stale = S.seal({ email: 'admin@g.enp.edu.dz', at: 'at:admin@g.enp.edu.dz', ate: Date.now() + 5 * 60e3 });
    await deliver({ v: 1, t: stale, ids: last().ids });
    d = await recOf(own, 'alert:A-9004');
    assert.deepStrictEqual([d.state, d.reason, d.again, status('A-9004')], ['dropped', 'retries ran out', true, 'OPEN']);
    // the sign-in ended at Google: every pending change of that author drops, with Apply mine anyway
    setStatus('A-9001', 'OPEN'); // reopened since the author's Resolve, and their snapshot shows it: a real new change
    r = await accept(own, { alert: 'A-9001', op: 'resolve', seen: 'OPEN', built: Date.now() });
    assert.strictEqual(r.json.value['alert:A-9001'].seen, 'OPEN', 'a snapshot built after the mark: no merge');
    g.opts.scriptStatus = 401;
    await deliver();
    g.opts.scriptStatus = 200;
    d = await recOf(own, 'alert:A-9001');
    assert.deepStrictEqual([d.state, d.reason, d.again], ['dropped', 'sign-in ended before it was saved', true]);
    // lost access: no longer an admin when it applies
    const stranger = sess('stranger@g.enp.edu.dz');
    await accept(stranger, { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    await deliver();
    d = (await P.read('stranger@g.enp.edu.dz', Date.now()))['alert:A-9001']; // not an admin: their pulse is refused, the record stays
    assert.deepStrictEqual([d.state, d.reason, !!d.again, status('A-9001')], ['dropped', 'lost access', false, 'OPEN']);
    await deliver({ t: 'forged', ids: [] }); // unreadable: acknowledged, nothing done

    // the accept step's own failures: each one is a direct write for the page, and leaves nothing behind
    r = await rpc(own, 'accept', { v: 2, changes: [] });
    assert.deepStrictEqual([r.status, r.json.code], [400, 'FORMAT'], 'another change format: reload');
    r = await accept(own, { alert: 'A-9001', op: 'delete', seen: 'OPEN' });
    assert.deepStrictEqual([r.status, r.json.code], [503, 'DIRECT']);
    r = await accept(own, { alert: 'A-9001', op: 'snooze', seen: 'OPEN' });
    assert.strictEqual(r.json.code, 'DIRECT', 'a snooze with no end is refused');
    F.log.fail.redis = true;
    r = await accept(own, { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    F.log.fail.redis = false;
    assert.deepStrictEqual([r.status, r.json.code], [503, 'DIRECT'], 'Redis down');
    F.log.fail.send = true;
    r = await accept(own, { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    F.log.fail.send = false;
    assert.deepStrictEqual([r.json.code, (await recOf(own, 'alert:A-9001')).state], ['DIRECT', 'dropped'], 'queue down: the entry it wrote is put back as it was');
    g.log.token.length = 0;
    r = await accept(sess('admin@g.enp.edu.dz', { ate: Date.now() + 20 * 60e3, at: 'at:stale' }), { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    assert.deepStrictEqual([r.status, g.log.token, S.open(r.jar[S.COOKIE]).at, S.open(last().t).ate > Date.now() + 50 * 60e3], [200, ['refresh_token'], 'at:admin@g.enp.edu.dz', true], 'under 30 min left: refreshed, written back, sealed fresh');
    g.opts.refreshFails = 'invalid_grant';
    r = await accept(sess('admin@g.enp.edu.dz', { ate: Date.now() + 20 * 60e3 }), { alert: 'A-9001', op: 'resolve', seen: 'OPEN' });
    g.opts.refreshFails = null;
    assert.deepStrictEqual([r.status, r.json.code, r.jar[S.COOKIE]], [503, 'DIRECT', undefined], 'a failed refresh: direct write, the cookie untouched');

    // settings (slice 3): one cell per key, applied as the admin; typed then undone cancels; a refused value drops with no Apply mine anyway
    const set = (key, value, seen) => ({ kind: 'setting', key, value, seen });
    const cellOf = k => seed.run(`String(ss_().getSheetByName('Settings').getDataRange().getValues().filter(function (r) { return r[0] === '${k}'; })[0][1])`);
    r = await accept(own, set('HOURS_NOT_CONTACTED', 30, 24));
    assert.deepStrictEqual([r.json.value['setting:HOURS_NOT_CONTACTED'].state, r.json.value['setting:HOURS_NOT_CONTACTED'].key], ['pending', 'HOURS_NOT_CONTACTED']);
    await deliver();
    assert.deepStrictEqual([(await recOf(own, 'setting:HOURS_NOT_CONTACTED')).state, cellOf('HOURS_NOT_CONTACTED')], ['applied', '30']);
    await accept(own, set('DIGEST_HOUR', 9, 8));
    r = await accept(own, set('DIGEST_HOUR', 8, 9));
    assert(!('setting:DIGEST_HOUR' in r.json.value), 'typed then undone: cancelled');
    await accept(own, set('DIGEST_HOUR', 25, 8));
    await deliver();
    d = await recOf(own, 'setting:DIGEST_HOUR');
    assert.deepStrictEqual([d.state, /0 to 23/.test(d.reason), !!d.again, cellOf('DIGEST_HOUR')], ['dropped', true, false, '8']);
    await accept(own, set('HOURS_NOT_CONTACTED', 24, 30));
    await deliver();
    assert.strictEqual(cellOf('HOURS_NOT_CONTACTED'), '24');
    r = await accept(own, set('HOURS_NOT_CONTACTED', { x: 1 }, 24));
    assert.strictEqual(r.json.code, 'DIRECT', 'not a plain value: not taken');

    // My binome fields (slice 3): a member's change, applied as them in their own sheet; the partner's next poll has it
    seed.run('__as("admin@g.enp.edu.dz")');
    ['importTeam', 'draft', 'lock'].forEach(a => seed.call('webRun', a, { link: '' }));
    seed.addRegistrations(12, 1);
    seed.call('webRun', 'sync');
    const st = seed.call('webState'), bin = st.binomes.find(b => b.people.length === 2 && st.interviewees.some(i => i.binome === b.code));
    const code = st.interviewees.find(i => i.binome === bin.code).code, other = st.interviewees.find(i => i.binome && i.binome !== bin.code).code;
    const mem = sess(bin.people[0].email), partner = sess(bin.people[1].email);
    const fd = (c, field, value, seen) => ({ kind: 'field', code: c, field, value, seen });
    r = await pulse(mem, 1);
    assert.deepStrictEqual([r.json.value.pending, r.json.rec], [true, {}], 'members get the switch, and the record rides on their pulse');
    r = await accept(mem, fd(code, 'Contacted', 'Yes', 'Not yet'), fd(code, 'Rating', '7,5', ''), fd(other, 'Notes', 'typed for a candidate gone', ''));
    assert.deepStrictEqual(Object.keys(r.json.value).sort(), ['field:' + code + ':Contacted', 'field:' + code + ':Rating', 'field:' + other + ':Notes'].sort());
    await deliver();
    const rec = (await pulse(mem, 2)).json.rec;
    assert.deepStrictEqual([rec['field:' + code + ':Contacted'].state, rec['field:' + code + ':Rating'].state], ['applied', 'applied']);
    const gone = rec['field:' + other + ':Notes'];
    assert.deepStrictEqual([gone.state, /no longer in your binome/.test(gone.reason), !!gone.again, gone.value], ['dropped', true, false, 'typed for a candidate gone'],
      'the candidate left: dropped with the typed text, no Apply mine anyway');
    assert(g.log.runs.some(x => x.fn === 'webApply' && x.email === bin.people[0].email), 'scripts.run as the member');
    const theirs = (await rpc(partner, 'webState')).json.value.candidates.find(c => c.Code === code);
    assert.deepStrictEqual([theirs.Contacted, theirs.Rating], ['Yes', 7.5], "the partner's next read has it");
    r = await accept(mem, fd(code, 'Email', 'a@b.dz', ''));
    assert.strictEqual(r.json.code, 'DIRECT', 'not a column members fill in');

    // slice 4: the sync's call (api/drops.js), the apply-by sweep, the seen mark on the pulse
    {
      const dropsApi = require('../web/api/drops');
      const drops = (body, auth) => new Promise(resolve => {
        const res = { statusCode: 200, setHeader() {}, end(b) { resolve({ status: res.statusCode, json: JSON.parse(b) }); } };
        Promise.resolve(dropsApi({ method: 'POST', headers: { authorization: auth === undefined ? 'Bearer s3cret' : auth }, body }, res));
      });
      const now = Date.now(), put = (email, cell, e) => { (F.db['pc:' + email] = F.db['pc:' + email] || {})[cell] = JSON.stringify(Object.assign({ cell, kind: 'alert', alert: cell.slice(6), op: 'resolve', value: 'RESOLVED', seen: 'OPEN', at: now - 7 * 60e3 }, e)); };
      const entry = (email, cell) => JSON.parse(F.db['pc:' + email][cell]);
      assert.strictEqual((await drops({})).status, 503, 'no DROPS_SECRET on Vercel: refused');
      process.env.DROPS_SECRET = 's3cret';
      assert.strictEqual((await drops({}, 'Bearer nope')).status, 403, 'wrong secret');
      assert.strictEqual((await drops({}, '')).status, 403, 'no secret');
      put('away@g.enp.edu.dz', 'alert:A-7001', { state: 'pending', by: now - 1000 });             // stranded past its apply-by
      put('away@g.enp.edu.dz', 'alert:A-7002', { state: 'dropped', sheet: 'SNOOZED', droppedAt: now - 6 * 60e3 }); // nobody saw it: email
      put('away@g.enp.edu.dz', 'alert:A-7003', { state: 'dropped', sheet: 'MUTED', droppedAt: now - 60e3 });       // too fresh for the email
      put('left@g.enp.edu.dz', 'alert:A-7004', { state: 'dropped', droppedAt: now - 20 * 60e3, shown: now - 15 * 60e3, seenAt: now - 6 * 60e3 }); // the visit ended
      put('done@g.enp.edu.dz', 'alert:A-7005', { state: 'dropped', droppedAt: now - 20 * 60e3, addressed: now - 60e3 });
      let r = await drops({});
      const of = (list, email) => list.find(x => (x.email || x) === email);
      const swept = entry('away@g.enp.edu.dz', 'alert:A-7001');
      assert.deepStrictEqual([r.status, swept.state, swept.reason, swept.again, swept.droppedAt >= now], [200, 'dropped', 'retries ran out', true, true], 'past its apply-by: dropped');
      assert.deepStrictEqual(of(r.json.mail, 'away@g.enp.edu.dz').drops.map(d => [d.cell, d.sheet]), [['alert:A-7002', 'SNOOZED']], 'email: only the drop unseen for 5 min');
      assert.deepStrictEqual([!!of(r.json.alert, 'left@g.enp.edu.dz'), !!of(r.json.alert, 'away@g.enp.edu.dz'), !!of(r.json.open, 'done@g.enp.edu.dz'), !!of(r.json.open, 'away@g.enp.edu.dz')],
        [true, false, false, true], 'alert: a shown drop unseen for 5 min; open: anyone with an unaddressed drop');
      assert(!JSON.stringify(r.json).includes('"by"'), 'the answer carries the drops, not the apply-by');
      r = await drops({ mailed: [{ email: 'away@g.enp.edu.dz', cells: ['alert:A-7002'], at: now - 25 * 3600e3 }] });
      assert.deepStrictEqual([entry('away@g.enp.edu.dz', 'alert:A-7002').mailed, !!of(r.json.mail, 'away@g.enp.edu.dz')], [now - 25 * 3600e3, false], 'what the sync mailed is taken back, never mailed again');
      assert(of(r.json.alert, 'away@g.enp.edu.dz'), 'mailed 24 h ago and unanswered: admin alert');
      await P.mark('left@g.enp.edu.dz', { seen: ['alert:A-7004'] }, Date.now());
      assert(!of((await drops({})).json.alert, 'left@g.enp.edu.dz'), 'on screen again: no alert');
      // the page's seen mark rides on the pulse
      put('admin@g.enp.edu.dz', 'alert:A-7006', { state: 'dropped', droppedAt: now - 60e3, shown: now - 60e3 });
      r = await invoke('run', { method: 'POST', cookie: own, body: { fn: 'webPulse', args: [true], rec: 2, seen: ['alert:A-7006'] } });
      assert(r.json.rec['alert:A-7006'].seenAt >= now, 'pulse with seen: seenAt moves');
      F.log.fail.redis = true;
      assert.strictEqual((await drops({})).status, 502, 'Redis down: the sync skips this cycle');
      F.log.fail.redis = false;
      ['away', 'left', 'done'].forEach(n => delete F.db['pc:' + n + '@g.enp.edu.dz']);
      delete F.db['pc:admin@g.enp.edu.dz']['alert:A-7006'];
      delete process.env.DROPS_SECRET;
    }

    await rpc(own, 'webRun', 'pendingSwitch', { on: false });
    F.log.redis = 0;
    await pulse(own, 1);
    assert.strictEqual(F.log.redis, 0, 'switched off again: no Redis call');
    assert((await pulse(own, 2)).json.rec, 'a page still holding pending changes reads them while they drain');
  }

  // --- front (frontend/): the one RPC wrapper is the proxy, version matches the script
  const front = f => require('fs').readFileSync(__dirname + '/../frontend/src/lib/vic/' + f, 'utf8');
  assert(/fetch\("\/api\/run"/.test(front('api.ts')) && !/google\.script/.test(front('api.ts')), 'every call goes through /api/run');
  const gs = require('fs').readFileSync(__dirname + '/../WebApp.gs', 'utf8');
  assert.strictEqual(front('types.ts').match(/export const API_VERSION = (\d+)/)[1], gs.match(/const API_VERSION = (\d+)/)[1], 'front and script API_VERSION match');

  // --- ignoreCommand (web/vercel.json): skip (exit 0) only when web/ and frontend/ are unchanged; an empty or unknown SHA builds
  {
    const { execSync, spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ign-')), sh = c => execSync(c, { cwd: dir, stdio: 'pipe' }).toString().trim();
    const cmd = JSON.parse(fs.readFileSync(__dirname + '/../web/vercel.json', 'utf8')).ignoreCommand;
    const run = sha => spawnSync('sh', ['-c', cmd], { cwd: path.join(dir, 'web'), env: Object.assign({}, process.env, { VERCEL_GIT_PREVIOUS_SHA: sha }) }).status;
    const commit = (f, m) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.appendFileSync(path.join(dir, f), 'x'); sh('git add -A && git -c user.name=t -c user.email=t@t -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -qm ' + m); return sh('git rev-parse HEAD'); };
    sh('git init -q'); const base = commit('web/a', 'a');
    commit('docs/x.md', 'doc'); assert.strictEqual(run(base), 0, 'doc-only push is skipped');
    commit('frontend/y', 'fe'); assert.strictEqual(run(base), 1, 'a frontend change builds');
    assert.strictEqual(run(''), 1, 'no previous SHA builds'); assert.notStrictEqual(run('0'.repeat(40)), 0, 'unknown SHA builds');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  g.restore();
  process.stdout.write('VERCEL OK\n');
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exit(1); });
