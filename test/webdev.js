// Mock backend for the dashboard: the real web/api functions, Google mocked (googlemock.js), seeded data.
//   node test/webdev.js [port]  (or `npm run mock` in frontend/), then `npm run dev` in frontend/ and open
//   http://localhost:5173/dev-login?as=admin@g.enp.edu.dz (Vite proxies /api and /dev-login here).
//   ?as=helper@g.enp.edu.dz → no-access view; /dev-login?as=  → signed-out view. --empty = before team import.
//   /dev-login?as=member → a member of the busiest binome (opened with edit: My binome only; the start-up line names them).
//   /dev-login?as=closed → a member of a binome not opened yet (the "isn't open yet" gate).
//   --pairing = before Lock: this year's OT list (part of the 2025 team, pre-ticked Experienced), three pairs made by hand, the
//   rest free, so the Binomes page shows the Pairing panel (npm run mock -- --pairing).
//   --screening = the default data with Screening on and a linked members sheet: applications held for review (dots, one
//   word, a non-answer), a VIC member declined silently, one declined by an admin, one with a binome flagged (npm run mock -- --screening).
const http = require('http'), crypto = require('crypto');
const port = +process.argv.find(a => /^\d+$/.test(a)) || 3000;
process.env.SESSION_KEY = crypto.randomBytes(32).toString('base64');
process.env.APP_ORIGIN = 'http://localhost:' + port;
process.env.SCRIPT_API_DEPLOYMENT_ID = 'LOCAL';
const S = require('../web/lib/session');
const s = require('./seed')();
require('./googlemock')(s);
const pairing = process.argv.includes('--pairing'), empty = process.argv.includes('--empty') || pairing;
if (pairing) {
  s.run(`master.insertSheet('OT 2026').cells = [["Section", "First Name", "Last Name", "Email"],
    ["Committee Board", "Aymene", "Khaled", "aymene@g.enp.edu.dz"], ["Council Board", "Sabrina", "Aknine", "sabrina@g.enp.edu.dz"],
    ["HR", "Ikram", "Mahi", "ikram@g.enp.edu.dz"], ["", "Zineb", "Taibi", "zineb@g.enp.edu.dz"], ["", "Djamila", "Cherifi", "djamila@g.enp.edu.dz"],
    ["", "Nada", "Rahmani", "nada.rahmani@g.enp.edu.dz"], ["", "Hiba", "Saadi", "hiba.saadi@g.enp.edu.dz"], ["", "Wafa", "Djebbar", "wafa.djebbar@g.enp.edu.dz"],
    ["", "Imene", "Boudiaf", "imene.boudiaf@g.enp.edu.dz"], ["", "Rania", "Mekki", "rania.mekki@g.enp.edu.dz"], ["", "Selma", "Haddad", "selma.haddad@g.enp.edu.dz"],
    ["IT", "Sara", "Bouznad", "sara@g.enp.edu.dz"], ["", "Madjid", "Medjkane", "madjid@g.enp.edu.dz"], ["", "Ilyes", "Hamdi", "ilyes.hamdi@g.enp.edu.dz"],
    ["", "Omar", "Ferhat", "omar.ferhat@g.enp.edu.dz"], ["", "Anis", "Belaid", "anis.belaid@g.enp.edu.dz"], ["", "Yanis", "Ouali", "yanis.ouali@g.enp.edu.dz"],
    ["COMM", "Aya", "Gharbi", "aya@g.enp.edu.dz"], ["", "Lyna", "Toumi", "lyna.toumi@g.enp.edu.dz"], ["", "Meriem", "Kaci", "meriem.kaci@g.enp.edu.dz"],
    ["FLER", "Yasmine", "Ait Ahmed", "yasmine@g.enp.edu.dz"], ["", "Nour", "Amrani", "nour.amrani@g.enp.edu.dz"], ["", "Walid", "Saidi", "walid.saidi@g.enp.edu.dz"]]`);
  s.call('webRun', 'importTeam', { link: '' });
  s.call('webRun', 'teamSet', { email: 'selma.haddad@g.enp.edu.dz', experienced: true }); // ticked by hand: interviewed before, not in the 2025 list
  [['nada.rahmani', 'sara'], ['hiba.saadi', 'aya'], ['wafa.djebbar', 'ilyes.hamdi']].forEach(([a, b]) =>
    s.call('webRun', 'draftPair', { emailA: a + '@g.enp.edu.dz', emailB: b + '@g.enp.edu.dz' }));
} else if (!empty) {
  s.call('webRun', 'importTeam', { link: '' }); s.call('webRun', 'draft'); s.call('webRun', 'lock');
  s.run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,1,6).setValues([['Late Member','late@g.enp.edu.dz','IT','IT',false,'']]);})()"); // shows the Unpaired card
  s.addRegistrations(40, 3); s.call('webRun', 'sync'); s.backdateAssignments(3); s.call('webRun', 'sync');
  // registration and interview-form problems, so the Alerts page shows its quick fixes
  const bs = s.call('webState').binomes.filter(b => b.people.length === 2);
  s.run(`(function () { var reg = master.getSheetByName('Registration Responses'), ir = master.getSheetByName('Interview Responses'), t = Date.now() - 864e5;
    reg.cells.push(regRow(new Date(t), 'lina.kaci@g.enp.edu.dz', 'Lina', 'Kaci', 'lina.kaci@g.enp.edu.dz', '01/03/2005', '12345', 'IT', 'HR'));
    reg.cells.push(regRow(new Date(t + 6e4), 'rayan.ziani@g.enp.edu.dz', 'Rayan', 'Ziani', 'rayan.ziani@g.enp.edu.dz', '01/03/2005', '0555999001', 'Marketing', 'HR'));
    reg.cells.push(regRow(new Date(t + 12e4), 'amine.belkacem0@g.enp.edu.dz', 'Amine', 'Belkacem', 'amine.belkacem0@g.enp.edu.dz', '01/03/2005', '0555999002', 'IT', 'FLER'));
    ir.cells.push([new Date(t + 18e4), '${bs[0].people[0].email}', '${bs[0].code}', 'XX.99', 'intro', 'IT', 'IT', '']); })()`);
  s.call('webRun', 'sync');
  // two hand edits in the Master, so the Manual edits filter has something to show
  s.run("(function(){var iv=ss_().getSheetByName('Interviewees'),bn=ss_().getSheetByName('Binomes');iv.getRange(2,2).setValue(iv.getRange(2,2).getValue()==='B.03'?'B.04':'B.03');" +
    "bn.getRange(3,4,1,2).setValues([['Late Member','late@g.enp.edu.dz']]);})()");
  s.call('webRun', 'sync');
  // a replacement and a swap after lock, so Change history has rows
  const two = s.call('webState').binomes.filter(b => b.people.length === 2);
  s.call('webRun', 'changeMember', { binome: two[0].code, outEmail: two[0].people[0].email, inName: 'Outside Person', inEmail: 'outside@g.enp.edu.dz', reason: 'left the club' });
  s.call('webRun', 'swapMembers', { binomeA: two[1].code, emailA: two[1].people[0].email, binomeB: two[2].code, emailB: two[2].people[0].email });
  if (process.argv.includes('--screening')) seedScreening();
}
function seedScreening() {
  const MEM = 'M3mb3rsSheetForTheVicClub2026xxxxxxxxxxxx';
  s.run(`var mem = new MockSS('VIC members 2026'); __files['${MEM}'] = __files[mem.id];
    mem.sheets[0].cells = [['Name', 'E-mail'], ['Lina Kaci', 'lina.kaci@g.enp.edu.dz'], ['Rym Benali', 'rym.benali@g.enp.edu.dz'], ['Adam Rahmani', 'adam.rahmani@g.enp.edu.dz']];`);
  s.call('webRun', 'saveSettings', { values: { SCREENING: true, VIC_MEMBERS_SHEET: 'https://docs.google.com/spreadsheets/d/' + MEM + '/edit' } });
  const VIC = 'I want to learn video editing and meet people who organise events, the open day made me want to be part of it';
  const apps = [ // email, first, family, 1st choice, why VIC, why this department, anything to add
    ['nadia.ferhat@g.enp.edu.dz', 'Nadia', 'Ferhat', 'IT', '..', '.', ':)'],
    ['karim.oudjit@g.enp.edu.dz', 'Karim', 'Oudjit', 'FLER', VIC, 'Yes', ''],
    ['ines.bouras@g.enp.edu.dz', 'Ines', 'Bouras', 'COMM', 'Bouras', 'Because I like posting and I follow every trend', ''],
    ['yacine.mazouz@g.enp.edu.dz', 'Yacine', 'Mazouz', 'HR', 'To meet people', 'I don’t know', 'No'],
    ['rym.benali@g.enp.edu.dz', 'Rym', 'Benali', 'IT', VIC, 'I edit videos for my friends and want to learn more', ''],
    ['sami.lounis@g.enp.edu.dz', 'Lounis', 'Sami', 'IT', VIC, 'Because I already make posters and I want to get better with a team', 'Thank you'],
    ['amel.taleb@g.enp.edu.dz', 'Amel', 'Taleb', 'HR', '/', 'test', ''],
  ];
  s.run(`(function () { var reg = master.getSheetByName('Registration Responses'), t = Date.now() - 36e5, W = { IT: 16, COMM: 18, HR: 19, FLER: 20 };
    ${JSON.stringify(apps)}.forEach(function (a, i) {
      var r = regRow(new Date(t + i * 6e4), a[0], a[1], a[2], a[0], '01/03/2005', '0555' + (200000 + i), a[3], 'HR');
      r[12] = a[4]; r[W[a[3]]] = a[5]; r[23] = a[6]; reg.cells.push(r); }); })()`);
  s.call('webRun', 'sync');
  const st = s.call('webState'), amelCode = (st.interviewees.find(x => x.name === 'Amel Taleb') || {}).code;
  const amel = st.alerts.find(a => a.type === 'NEEDS_REVIEW' && a.code === amelCode);
  if (amel) s.call('webRun', 'quick', { op: 'decline', ids: [amel.id] });
  // a VIC member who registered before screening was on and already has a binome (lina.kaci, from the default data)
  s.call('webRun', 'sync');
}
// a binome member who is not an editor of the Master: the member view (task 7)
const busiest = empty ? null : s.call('webState').binomes.filter(b => b.people.length).sort((a, b) => b.assigned - a.assigned)[0];
const memberEmail = busiest ? busiest.people[busiest.people.length - 1].email : '';
// members get the dashboard only while they can open their binome sheet: the busiest binome is opened (edit), the others not
const closed = busiest ? s.call('webState').binomes.find(b => b.code !== busiest.code && b.status !== 'DRAFT' && b.people.length) : null;
const closedEmail = closed ? closed.people[0].email : '';
if (busiest) { s.run('__acl = true'); s.call('webRun', 'binomeAccess', { binome: busiest.code, level: 'edit' }); }
const api = { run: require('../web/api/run'), logout: require('../web/api/logout') };
http.createServer((req, res) => {
  // plain http locally: drop "Secure" so every browser keeps the cookie (production is https)
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => set(k, /^set-cookie$/i.test(k) ? [].concat(v).map(c => c.replace('; Secure', '')) : v);
  const path = req.url.split('?')[0];
  if (path === '/dev-login') {
    const as = new URL(req.url, 'http://x').searchParams.get('as'), email = as === 'member' ? memberEmail : as === 'closed' ? closedEmail : as;
    res.setHeader('Set-Cookie', email ? S.sessionCookie({ email, rt: 'rt:' + email, at: 'at:' + email, ate: Date.now() + 3600e3, iat: Date.now() }) : S.clearSession());
    return S.redirect(res, '/');
  }
  if (path === '/api/login') return S.redirect(res, '/dev-login?as=admin@g.enp.edu.dz'); // no real Google locally
  const fn = api[path.replace(/^\/api\//, '')];
  if (fn) return fn(req, res);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Mock API only. The UI: npm run dev in frontend/, then http://localhost:5173/dev-login?as=admin@g.enp.edu.dz\n');
}).listen(port, () => console.log('Mock API on http://localhost:' + port + '. UI: npm run dev in frontend/, then http://localhost:5173/dev-login?as=admin@g.enp.edu.dz' +
  (memberEmail ? '\nMember of ' + busiest.code + ' (opened, edit): http://localhost:5173/dev-login?as=member (' + memberEmail + ')' +
    '\nMember of ' + closed.code + ' (not opened yet): http://localhost:5173/dev-login?as=closed (' + closedEmail + ')' : '')));
