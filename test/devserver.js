// Local preview of the dashboard: real .gs files on the mock, Index.html served with a google.script.run shim.
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
// Just enough of HtmlService templates (<? code ?>, <?= escaped ?>) to preview NoAccess.html
function template(file, vars) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let js = 'let out = "";\n';
  fs.readFileSync(__dirname + '/../' + file, 'utf8').split(/(<\?=?[\s\S]*?\?>)/).forEach(p => {
    if (p.startsWith('<?=')) js += 'out += esc(' + p.slice(3, -2) + ');\n';
    else if (p.startsWith('<?')) js += p.slice(2, -2) + '\n';
    else js += 'out += ' + JSON.stringify(p) + ';\n';
  });
  return new Function('esc', ...Object.keys(vars), js + 'return out;')(esc, ...Object.values(vars));
}
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
  if (req.url.startsWith('/no-access')) { // /no-access?reason=NO_PROJECT|READ_ONLY|NO_EMAIL&email=…
    const q = new URL(req.url, 'http://x').searchParams;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(template('NoAccess.html', { reason: q.get('reason') || 'NO_PROJECT', email: q.has('email') ? q.get('email') : 'someone@g.enp.edu.dz',
      switchUrl: 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent('http://localhost:' + port + '/'), appUrl: '/' }));
    return;
  }
  const html = fs.readFileSync(__dirname + '/../Index.html', 'utf8').replace('<head>', '<head>' + SHIM);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}).listen(port, () => console.log('Dashboard preview on http://localhost:' + port));
