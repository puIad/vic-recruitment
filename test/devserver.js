// Local preview of the dashboard: real Code.gs/WebApp.gs on the mock, Index.html served with a google.script.run shim.
//   node test/devserver.js [port]        then open http://localhost:8787
//   --empty  start before the team import (to see the launch sequence from step 01)
const http = require('http'), fs = require('fs');
const s = require('./seed')();
if (!process.argv.includes('--empty')) {
  s.call('webRun', 'importTeam', { link: '' });
  s.call('webRun', 'draft');
  s.call('webRun', 'lock');
  s.addRegistrations(40, 3);
  s.call('webRun', 'sync');
  s.backdateAssignments(3);
  s.call('webRun', 'sync');
}
const SHIM = `<script>
window.google = { script: { get run() {
  const h = { ok: () => {}, err: () => {} };
  const p = new Proxy({}, { get(_, fn) {
    if (fn === 'withSuccessHandler') return f => { h.ok = f; return p; };
    if (fn === 'withFailureHandler') return f => { h.err = f; return p; };
    return (...args) => fetch('/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) })
      .then(r => r.json()).then(r => (r.error ? h.err(new Error(r.error)) : h.ok(r.value)));
  } });
  return p;
} } };
</script>`;
const port = +process.argv.find(a => /^\d+$/.test(a)) || 8787;
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/rpc') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const { fn, args } = JSON.parse(body);
      let out;
      try {
        if (['webState', 'webRun'].indexOf(fn) < 0) throw new Error('Not exposed: ' + fn);
        out = { value: s.call(fn, ...args) };
      } catch (e) { out = { error: e.message }; }
      setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(out)); }, 350);
    });
    return;
  }
  const html = fs.readFileSync(__dirname + '/../Index.html', 'utf8').replace('<head>', '<head>' + SHIM);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}).listen(port, () => console.log('Dashboard preview on http://localhost:' + port));
