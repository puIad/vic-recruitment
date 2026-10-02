// Local preview of the Vercel app (web/): the real api/ functions and index.html, Google mocked (googlemock.js).
//   node test/webdev.js [port]      then open http://localhost:3000/dev-login?as=admin@g.enp.edu.dz
//   ?as=helper@g.enp.edu.dz → no-access view; /dev-login?as=  → signed-out view. --empty = before team import.
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const port = +process.argv.find(a => /^\d+$/.test(a)) || 3000;
process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
process.env.APP_ORIGIN = 'http://localhost:' + port;
process.env.SCRIPT_API_DEPLOYMENT_ID = 'LOCAL';
const S = require('../web/lib/session');
const s = require('./seed')();
require('./googlemock')(s);
if (!process.argv.includes('--empty')) {
  s.call('webRun', 'importTeam', { link: '' }); s.call('webRun', 'draft'); s.call('webRun', 'lock');
  s.run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,1,6).setValues([['Late Member','late@g.enp.edu.dz','IT','IT',false,'']]);})()"); // shows the Unpaired card
  s.addRegistrations(40, 3); s.call('webRun', 'sync'); s.backdateAssignments(3); s.call('webRun', 'sync');
  // two hand edits in the Master, so the Manual edits filter has something to show
  s.run("(function(){var iv=ss_().getSheetByName('Interviewees'),bn=ss_().getSheetByName('Binomes');iv.getRange(2,2).setValue(iv.getRange(2,2).getValue()==='B.03'?'B.04':'B.03');" +
    "bn.getRange(3,4,1,2).setValues([['Late Member','late@g.enp.edu.dz']]);})()");
  s.call('webRun', 'sync');
}
const api = { run: require('../web/api/run'), logout: require('../web/api/logout') };
http.createServer((req, res) => {
  // plain http locally: drop "Secure" so every browser keeps the cookie (production is https)
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => set(k, /^set-cookie$/i.test(k) ? [].concat(v).map(c => c.replace('; Secure', '')) : v);
  const path = req.url.split('?')[0];
  if (path === '/dev-login') {
    const email = new URL(req.url, 'http://x').searchParams.get('as');
    res.setHeader('Set-Cookie', email ? S.sessionCookie({ email, rt: 'rt:' + email, at: 'at:' + email, ate: Date.now() + 3600e3, iat: Date.now() }) : S.clearSession());
    return S.redirect(res, '/');
  }
  if (path === '/api/login') return S.redirect(res, '/dev-login?as=admin@g.enp.edu.dz'); // no real Google locally
  const fn = api[path.replace(/^\/api\//, '')];
  if (fn) return fn(req, res);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync(__dirname + '/../web/index.html'));
}).listen(port, () => console.log('Vercel app preview on http://localhost:' + port + '/dev-login?as=admin@g.enp.edu.dz'));
