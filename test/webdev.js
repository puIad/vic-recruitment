// Mock backend for the dashboard: the real web/api functions, Google mocked (googlemock.js), seeded data.
//   node test/webdev.js [port]  (or `npm run mock` in frontend/), then `npm run dev` in frontend/ and open
//   http://localhost:5173/dev-login?as=admin@g.enp.edu.dz (Vite proxies /api and /dev-login here).
//   ?as=helper@g.enp.edu.dz → no-access view; /dev-login?as=  → signed-out view. --empty = before team import.
//   /dev-login?as=member → a member of the busiest binome (opened with edit: My binome only; the start-up line names them).
//   /dev-login?as=closed → a member of a binome not opened yet (the "isn't open yet" gate).
//   /dev-login?as=adminmember → the busiest binome's other member, made an editor of the Master: the dashboard plus My binome.
//   --pairing = before Lock: this year's OT list (part of the 2025 team, pre-ticked Experienced), three pairs made by hand, the
//   rest free, so the Binomes page shows the Pairing panel (npm run mock -- --pairing).
//   Pending changes: Settings › General › Pending changes (admin@ is the owner); Redis and Queues are faked in memory. With it
//   on, alert actions, Save settings and My binome saves (?as=member) take the pending path.
//   --away = pending changes on, and three of admin@'s changes dropped while they were away: the next-visit dialog (slice 4).
//   --results = ratings, notes, proposals and choices for the Results page (npm run mock -- --results).
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
// pending changes (docs/plans.md › Slice 2): Redis and Queues in memory; a message reaches the consumer 4 s after its
// publish and is delivered again as the queue would (at most 10 s apart here). Turn the switch on in Settings › General.
const P = require('../web/lib/pending'), apply = require('../web/api/apply');
const F = require('./fakes')(P);
const published = P.deps.send;
const deliver = (payload, n, ms) => setTimeout(() => apply.handle(payload, { deliveryCount: n })
  .catch(e => deliver(payload, n + 1, Math.min((e && e.after) || 5, 10) * 1000)), ms);
P.deps.send = async (topic, payload, opts) => { const out = await published(topic, payload, opts); deliver(payload, 1, 4000); return out; };
const pairing = process.argv.includes('--pairing'), empty = process.argv.includes('--empty') || pairing;
if (pairing) {
  s.run(`master.insertSheet('OT 2026').cells = [["Section", "First Name", "Last Name", "Email"],
    ["Committee Board", "Nassim", "Ouarab", "nassim@g.enp.edu.dz"], ["Council Board", "Dalila", "Tazrout", "dalila@g.enp.edu.dz"],
    ["HR", "Warda", "Tebbal", "warda@g.enp.edu.dz"], ["", "Houria", "Mokrane", "houria@g.enp.edu.dz"], ["", "Lamia", "Hadrane", "lamia@g.enp.edu.dz"],
    ["", "Nada", "Rahmani", "nada.rahmani@g.enp.edu.dz"], ["", "Hiba", "Saadi", "hiba.saadi@g.enp.edu.dz"], ["", "Wafa", "Djebbar", "wafa.djebbar@g.enp.edu.dz"],
    ["", "Imene", "Boudiaf", "imene.boudiaf@g.enp.edu.dz"], ["", "Rania", "Mekki", "rania.mekki@g.enp.edu.dz"], ["", "Selma", "Haddad", "selma.haddad@g.enp.edu.dz"],
    ["IT", "Nawel", "Chikhi", "nawel@g.enp.edu.dz"], ["", "Hakim", "Sahraoui", "hakim@g.enp.edu.dz"], ["", "Ilyes", "Hamdi", "ilyes.hamdi@g.enp.edu.dz"],
    ["", "Omar", "Ferhat", "omar.ferhat@g.enp.edu.dz"], ["", "Anis", "Belaid", "anis.belaid@g.enp.edu.dz"], ["", "Yanis", "Ouali", "yanis.ouali@g.enp.edu.dz"],
    ["COMM", "Nesma", "Laribi", "nesma@g.enp.edu.dz"], ["", "Lyna", "Toumi", "lyna.toumi@g.enp.edu.dz"], ["", "Meriem", "Kaci", "meriem.kaci@g.enp.edu.dz"],
    ["FLER", "Thiziri", "Ait Hamou", "thiziri@g.enp.edu.dz"], ["", "Nour", "Amrani", "nour.amrani@g.enp.edu.dz"], ["", "Walid", "Saidi", "walid.saidi@g.enp.edu.dz"]]`);
  s.call('webRun', 'importTeam', { link: '' });
  s.call('webRun', 'teamSet', { email: 'selma.haddad@g.enp.edu.dz', experienced: true }); // ticked by hand: interviewed before, not in the 2025 list
  [['nada.rahmani', 'nawel'], ['hiba.saadi', 'nesma'], ['wafa.djebbar', 'ilyes.hamdi']].forEach(([a, b]) =>
    s.call('webRun', 'draftPair', { emailA: a + '@g.enp.edu.dz', emailB: b + '@g.enp.edu.dz' }));
} else if (!empty) {
  s.call('webRun', 'importTeam', { link: '' }); s.call('webRun', 'draft'); s.call('webRun', 'lock');
  s.run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,1,6).setValues([['Late Member','late@g.enp.edu.dz','IT','IT',false,'']]);})()"); // shows the Unpaired card
  s.addRegistrations(40, 3);
  // Analytics: field and year of study, how they heard of VIC, why VIC, clubs; three birth dates typed with this year (guessed)
  s.run(`(function () { var reg = master.getSheetByName('Registration Responses'), F = [['PREPA', '1ST'], ['PREPA', '2ND'], ['DATA', '1ST'], ['ELT', '2ND'], ['MECA', '3RD'], ['GC', '1ST']],
    D = ['Friends', 'Social Media', 'Friends, Stand', 'Open Day', 'Social Media, Other: a member, Lina', 'Stand'],
    W = ['To learn new skills and meet motivated people', 'I want to organise events and grow my network', 'My friends told me VIC is the most active club at ENP'];
    for (var k = reg.cells.length - 40, i = 0; k < reg.cells.length; k++, i++) { var r = reg.cells[k];
      r[9] = F[i % F.length][0]; r[10] = F[i % F.length][1]; r[11] = D[i % D.length]; r[12] = W[i % W.length]; r[13] = i % 4 === 0 ? 'Yes, Enactus' : '';
      if (i % 13 === 4) r[5] = '0' + (1 + i % 9) + '/06/' + new Date().getFullYear(); } })()`);
  s.call('webRun', 'sync'); s.backdateAssignments(3); s.call('webRun', 'sync');
  // Schedule: interview dates typed in the binome sheets (Algiers time, UTC+1): this week, one clash, one in the past, one unreadable
  const day = ms => { const d = new Date(ms + 3600e3), p = n => String(n).padStart(2, '0');
    return [p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(), p(d.getUTCHours()) + ':' + p(d.getUTCMinutes())]; };
  const slots = [[-1, '10:00'], [0, '14:00'], [1, '09:30'], [1, '10:00'], [2, '11:00'], [3, '15:30'], [4, '13:00']].map(([k, t]) => [day(Date.now() + k * 864e5)[0], t]);
  s.run(`(function () { var c = loadCtx_(), slots = ${JSON.stringify(slots)}, n = 0;
    c.binomes.filter(function (b) { return b.status === 'ACTIVE'; }).forEach(function (b) { var sh = binomeSheet_(c, b); if (!sh) return;
      for (var row = 2; row <= bfLastRow_(sh) && row < 4; row++, n++) { var s = slots[n % slots.length];
        sh.getRange(row, bfCol_('Contacted')).setValue('Yes');
        sh.getRange(row, bfCol_('Interview Date')).setValue(s[0]); sh.getRange(row, bfCol_('Interview Time')).setValue(s[1]); } }); })()`);
  s.call('webRun', 'sync');
  { // a clash (two interviews of one binome 30 min apart) and a date the sync can't read; from the end: row 2 gets a hand edit below
    const set = (code, field, v) => s.run(`(function () { var c = loadCtx_(), b = c.binByCode[c.ivByCode[${JSON.stringify(code)}][c.iv.I.Binome]], sh = binomeSheet_(c, b);
      sh.getRange(findFileRow_(sh, ${JSON.stringify(code)}), bfCol_(${JSON.stringify(field)})).setValue(${JSON.stringify(v)}); })()`);
    const dated = s.call('webState').interviewees.filter(x => x.at).reverse(), a = dated.find(x => dated.some(y => y !== x && y.binome === x.binome));
    const b = a && dated.find(y => y !== a && y.binome === a.binome), bad = dated.find(x => a && x.binome !== a.binome);
    if (b) { const [d, t] = day(a.at + 30 * 6e4); set(b.code, 'Interview Date', d); set(b.code, 'Interview Time', t); }
    if (bad) set(bad.code, 'Interview Date', 'next Sunday');
    s.call('webRun', 'sync');
  }
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
  { // a move, so Change history has an Interviewee Changes row too
    const st = s.call('webState'), iv = st.interviewees.find(x => x.status === 'ASSIGNED');
    const to = iv && st.binomes.find(b => b.code !== iv.binome && b.status === 'ACTIVE' && (b.tag === 'ALL' || b.tag.includes(iv.code.split('.')[0])));
    if (to) s.call('webRun', 'reassign', { code: iv.code, binome: to.code });
  }
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
// the interview form in the dashboard (docs/interview-form.md part 2): in the busiest binome one candidate filled from the
// dashboard, one with the Google Form, the rest still to fill (interviewGet / interviewSave are served like any webRun action)
if (busiest && busiest.people.length > 1) {
  const as = e => s.run('__as(' + JSON.stringify(e) + ')');
  // codes from their own sheet: the seeded hand edit moved one Interviewees row to this binome, not its sheet row
  const codes = JSON.parse(s.run(`(function () { var c = loadCtx_(), sh = binomeSheet_(c, c.binByCode[${JSON.stringify(busiest.code)}]);
    return JSON.stringify(sh.getRange(2, BF_COL, Math.max(bfLastRow_(sh) - 1, 1), 1).getValues().map(function (r) { return String(r[0]); })
      .filter(function (k) { return k && c.ivByCode[k] && !c.ivByCode[k][c.iv.I['Interview Submitted At']]; })); })()`));
  if (codes.length >= 2) {
    const dept = codes[0].split('.')[0];
    as(memberEmail);
    s.run(`(function () { var a = {}; INTERVIEW_QUESTIONS.forEach(function (q) { if (['first', 'final', ${JSON.stringify(dept)}].indexOf(q.section) >= 0) a[q.id] = q.type === 'score' ? 7 : q.type === 'choice' ? q.options[0] : 'Clear, calm and curious; asked good questions about the department.'; });
      a.firstChoice = ${JSON.stringify(dept)}; a.finalDep = ${JSON.stringify(dept)}; webRun('interviewSave', { code: ${JSON.stringify(codes[0])}, answers: a, seen: '' }); })()`);
    as('admin@g.enp.edu.dz');
    s.run(`master.getSheetByName('Interview Responses').cells.push([new Date(), ${JSON.stringify(memberEmail)}, ${JSON.stringify(busiest.code)}, ${JSON.stringify(codes[1])}, 8, ${JSON.stringify(codes[1].split('.')[0])}, 'COMM', 'Great energy'])`);
    s.call('webRun', 'sync');
  }
}
// an admin who is also in a binome (docs/interview-form.md part 1): My binome under People
const adminMemberEmail = busiest && busiest.people.length > 1 ? busiest.people[0].email : '';
if (adminMemberEmail) s.run('master.addEditor(' + JSON.stringify(adminMemberEmail) + ')');
if (process.argv.includes('--away') && !empty) {
  s.call('webRun', 'pendingSwitch', { on: true });
  const st = s.call('webState'), a = st.alerts[0], t = Date.now() - 3600e3, rec = F.db['pc:admin@g.enp.edu.dz'] = {};
  const put = e => { rec[e.cell] = JSON.stringify(Object.assign({ id: crypto.randomUUID(), state: 'dropped', at: t, droppedAt: t + 6e4, again: true }, e)); };
  put({ cell: 'alert:' + a.id, kind: 'alert', alert: a.id, op: 'resolve', value: 'RESOLVED', seen: 'OPEN', sheet: 'SNOOZED' });
  put({ cell: 'setting:DIGEST_HOUR', kind: 'setting', key: 'DIGEST_HOUR', value: 9, seen: 8, sheet: '7' });
  put({ cell: 'alert:' + st.alerts[1].id, kind: 'alert', alert: st.alerts[1].id, op: 'mute', value: 'MUTED', seen: 'OPEN', reason: 'retries ran out' });
}
// --results = candidates with ratings, notes, proposals and 2nd choices for the Results page (docs/admin-features.md › The results view);
// a few have no proposal (Needs a decision) and a few were never interviewed. The interview phase stays open: close it in Maintenance.
if (process.argv.includes('--results') && !empty) {
  s.run(`(function () { var sh = master.getSheetByName('Interviewees'), d = sh.getDataRange().getValues(), I = idx_(IV_H), D = ['IT', 'COMM', 'FLER', 'HR'], n = 0;
    function set(r, h, v) { sh.getRange(r + 1, I[h] + 1).setValue(v); }
    for (var r = 1; r < d.length; r++) {
      var code = String(d[r][I.Code]); if (!code || [ST.DUPLICATE, ST.DECLINED, ST.WITHDRAWN].indexOf(d[r][I.Status]) >= 0) continue;
      var c1 = String(d[r][I['1st Choice']] || code.split('.')[0]).toUpperCase(), c2 = D[(D.indexOf(c1) + 1 + n % 3) % 4];
      set(r, '1st Choice', c1); set(r, '2nd Choice', c2);
      n++;
      if (n % 5 === 0) continue; // never interviewed
      var rating = Math.round((3.5 + (n * 7919 % 55) / 10) * 10) / 10;
      set(r, 'Rating', rating); set(r, 'Interview Submitted At', new Date());
      set(r, 'Binome Notes', ['Calm and clear, concrete examples.', 'Strong on practice, weak on availability.', 'Very motivated but vague on the department.', 'Needs prompting on most questions.'][n % 4]);
      if (n % 7 !== 0) set(r, 'Final Affectation', rating < 5 ? 'Not accepted' : n % 11 === 0 ? D[(D.indexOf(c1) + 2) % 4] : n % 3 === 0 ? c2 : c1);
    } })()`);
}
const api = { run: require('../web/api/run'), logout: require('../web/api/logout') };
http.createServer((req, res) => {
  // plain http locally: drop "Secure" so every browser keeps the cookie (production is https)
  const set = res.setHeader.bind(res);
  res.setHeader = (k, v) => set(k, /^set-cookie$/i.test(k) ? [].concat(v).map(c => c.replace('; Secure', '')) : v);
  const path = req.url.split('?')[0];
  if (path === '/dev-login') {
    const as = new URL(req.url, 'http://x').searchParams.get('as'), email = as === 'member' ? memberEmail : as === 'closed' ? closedEmail : as === 'adminmember' ? adminMemberEmail : as;
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
    '\nMember of ' + closed.code + ' (not opened yet): http://localhost:5173/dev-login?as=closed (' + closedEmail + ')' +
    (adminMemberEmail ? '\nAdmin in ' + busiest.code + ': http://localhost:5173/dev-login?as=adminmember (' + adminMemberEmail + ')' : '') : '')));
