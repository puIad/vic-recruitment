// Stands in for Google behind the Vercel functions (web/api): replaces global fetch for the token, revoke and
// scripts.run endpoints. scripts.run executes the real .gs code on the Apps Script mock (seed.js) as the account
// whose access token is "at:<email>", like the real API running the script as the visitor.
module.exports = function googleMock(seed) {
  const log = { token: [], revoked: [], runs: [] };
  const opts = { timeout: false, refreshFails: null, scriptStatus: 200 };
  const realFetch = global.fetch;
  const json = (status, obj) => ({ ok: status < 300, status, json: async () => obj, headers: { get: () => null } });

  global.fetch = async (url, init) => {
    url = String(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init.body));
      log.token.push(p.get('grant_type'));
      if (p.get('grant_type') === 'refresh_token') {
        if (opts.refreshFails) return json(400, { error: opts.refreshFails });
        return json(200, { access_token: 'at:' + p.get('refresh_token').replace(/^rt:/, ''), expires_in: 3600 });
      }
      return json(400, { error: 'unsupported in mock' });
    }
    if (url === 'https://oauth2.googleapis.com/revoke') { log.revoked.push(new URLSearchParams(String(init.body)).get('token')); return json(200, {}); }
    const m = url.match(/^https:\/\/script\.googleapis\.com\/v1\/scripts\/([^:]+):run$/);
    if (m) {
      if (opts.timeout) { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }
      if (opts.scriptStatus !== 200) return json(opts.scriptStatus, { error: { code: opts.scriptStatus, status: opts.scriptStatus === 429 ? 'RESOURCE_EXHAUSTED' : 'PERMISSION_DENIED', message: 'secret details' } });
      const email = String(init.headers.Authorization).replace(/^Bearer at:/, '');
      const b = JSON.parse(init.body);
      log.runs.push({ fn: b.function, email });
      seed.run('__as(' + JSON.stringify(email) + ')');
      try {
        return json(200, { done: true, response: { '@type': 'type.googleapis.com/google.apps.script.v1.ExecutionResponse', result: seed.call(b.function, ...b.parameters) } });
      } catch (e) {
        return json(200, { done: true, error: { code: 3, message: 'ScriptError', details: [{ '@type': 'type.googleapis.com/google.apps.script.v1.ExecutionError', errorMessage: e.message, errorType: 'Error' }] } });
      }
    }
    return realFetch(url, init);
  };
  seed.run('var __as = function (e) { Session = { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
  return { log, opts, restore: () => { global.fetch = realFetch; } };
};
