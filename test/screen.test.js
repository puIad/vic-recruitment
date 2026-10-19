// Screening (Screening.gs): hold low-effort applications for review, decline VIC members silently, the rejection email.
// Made-up answers only. Driven through webState / webRun under web-app conditions.
const assert = require('assert');
const { run, call } = require('./seed')();
const J = JSON.stringify;
let out;
const R = code => JSON.parse(JSON.stringify(run(code))); // out of the vm's realm, so deepStrictEqual compares plain values

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
const IV = run('idx_(IV_H)'), BFI = run('BFI');
const WHY = { IT: 16, COMM: 18, HR: 19, FLER: 20 };
const VIC = 'I want to learn design and meet people who build things together at school';
const DEPT = 'Because I already edit videos and want to get better at it with a team';
let n = 0;
const apply = (email, first, fam, whyVic, whyDept, c1) => run(`(function () {
  var r = regRow(new Date(Date.now() + ${++n} * 1000), ${J(email)}, ${J(first)}, ${J(fam)}, ${J(email)}, '01/03/2005', '0555${100000 + n}', ${J(c1 || 'IT')}, 'HR');
  r[12] = ${J(whyVic)}; r[${WHY[c1 || 'IT']}] = ${J(whyDept)};
  master.getSheetByName('Registration Responses').cells.push(r); })()`);
const ivRow = email => R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Email] === email);
const open = () => call('webState').alerts;
const find = (type, code) => open().find(a => a.type === type && (!code || a.code === code));
const quick = (op, ids) => call('webRun', 'quick', { op: op, ids: [].concat(ids) });
const sync = () => call('webRun', 'sync');
const inSheets = code => call('webState').binomes.some(b =>
  run(`__files[${J(b.fileUrl.split('/d/')[1])}].obj.sheets[0].getDataRange().getValues()`).some(r => r[BFI.Code] === code));
const history = type => R(`master.getSheetByName('Alerts').getDataRange().getValues().slice(1)`).filter(r => r[3] === type);
const settings = v => call('webRun', 'saveSettings', { values: v });

// ---- off (the default): everything as before, nothing scored ----
apply('dots.off@g.enp.edu.dz', 'Dots', 'Off', '.', '.');
sync();
let r = ivRow('dots.off@g.enp.edu.dz');
assert.deepStrictEqual([r[IV.Status], r[IV.Risk], r[IV.Screening]], ['ASSIGNED', '', ''], 'Screening off: assigned as today');
assert.strictEqual(call('webState').screening.on, false);

// ---- the members sheet: a Google Sheet with an email column, read through the cache ----
const MEMBERS = 'M3mb3rsSheetForTheVicClub2026xxxxxxxxxxxx';
run(`var mem = new MockSS('VIC members'); __files[${J(MEMBERS)}] = __files[mem.id]; mem.sheets[0].cells = [['VIC members 2026', ''], ['Name', 'E-mail'],
  ['Member One', 'Member.One@g.enp.edu.dz'], ['Member Two', 'member.two@g.enp.edu.dz']];
  var __reads = 0, __ob = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { if (id === ${J(MEMBERS)}) __reads++; return __ob.call(SpreadsheetApp, id); };`);
settings({ SCREENING: true, VIC_MEMBERS_SHEET: 'https://docs.google.com/spreadsheets/d/' + MEMBERS + '/edit#gid=' + run('mem.sheets[0].getSheetId()') });
out = call('webRun', 'membersRefresh');
assert(/2 VIC member emails read/.test(out.messages[0]), out.messages[0]);
assert.strictEqual(out.result.n, 2);
run('__reads = 0; __cacheClear()'); // the refresh above filled the cache: start from an empty one

// ---- a VIC member: declined silently, no mail of any kind, one line in the history ----
apply('member.one@g.enp.edu.dz', 'Member', 'One', '.', '.');
apply('member.one@g.enp.edu.dz', 'Member', 'One', VIC, DEPT); // twice: still declined, not a duplicate
sync();
assert.strictEqual(run('_mailsSent'), 0, 'nobody was emailed, admins included');
const mem = R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').filter(x => x[IV.Email] === 'member.one@g.enp.edu.dz');
assert.deepStrictEqual(mem.map(x => [x[IV.Status], x[IV.Screening], x[IV.Binome]]), [['DECLINED', 'VIC member', ''], ['DECLINED', 'VIC member', '']]);
assert(mem.every(x => x[IV.Code] && !inSheets(x[IV.Code])), 'a code, in no binome sheet');
assert.strictEqual(history('VIC_MEMBER_DECLINED').length, 2);
assert(history('VIC_MEMBER_DECLINED').every(x => x[8] === 'AUTO-FIXED' && x[7] === ''), 'history only, emailed to nobody');
assert(!open().some(a => /member\.one/.test(a.msg)), 'no open alert about them');

// ---- a team member applying counts as a VIC member too ----
apply('sara@g.enp.edu.dz', 'Sara', 'Bouznad', VIC, DEPT);
// ---- junk is held, a decent one is assigned, swapped names are put right ----
apply('junk.one@g.enp.edu.dz', 'Junk', 'One', '..', '.');
apply('good.one@g.enp.edu.dz', 'Good', 'One', VIC, DEPT);
apply('kenza.haddad@g.enp.edu.dz', 'Haddad', 'Kenza', VIC, DEPT, 'COMM');
apply('short.one@g.enp.edu.dz', 'Short', 'One', 'I love this club', 'I love technology');
apply('idk.one@g.enp.edu.dz', 'Idk', 'One', VIC, 'I don’t know');
sync();
assert.strictEqual(ivRow('sara@g.enp.edu.dz')[IV.Status], 'DECLINED', 'Team tab emails are members');
const junk = ivRow('junk.one@g.enp.edu.dz');
assert.deepStrictEqual([junk[IV.Status], junk[IV.Binome], junk[IV.Risk]], ['HELD', '', 100]);
assert(junk[IV.Code] && !inSheets(junk[IV.Code]), 'held: a code, in no binome sheet');
assert.strictEqual(junk[IV.Screening], 'Held: Why VIC: only ".."; Why IT: only "."; Under 10 words in all');
assert.deepStrictEqual([ivRow('good.one@g.enp.edu.dz')[IV.Status], ivRow('good.one@g.enp.edu.dz')[IV.Risk]], ['ASSIGNED', 0]);
assert.deepStrictEqual([ivRow('short.one@g.enp.edu.dz')[IV.Status], ivRow('short.one@g.enp.edu.dz')[IV.Risk]], ['ASSIGNED', 10], 'short alone never holds');
assert.strictEqual(ivRow('idk.one@g.enp.edu.dz')[IV.Status], 'HELD', '"I don\'t know" holds');
const kh = ivRow('kenza.haddad@g.enp.edu.dz');
assert.deepStrictEqual([kh[IV['First Name']], kh[IV['Family Name']], /NAMES_SWAPPED/.test(kh[IV.Flags])], ['Kenza', 'Haddad', true]);
assert.strictEqual(run('__reads'), 1, 'the members sheet is read once, not on every sync');
sync();
assert.strictEqual(run('__reads'), 1, 'still cached');

let a = find('NEEDS_REVIEW', junk[IV.Code]);
assert(a && a.severity === 'MEDIUM' && /risk 100/.test(a.msg), 'NEEDS_REVIEW for the held one');
assert.deepStrictEqual([a.q.kind, a.q.iv.status, a.q.app.risk, a.q.app.whyVic], ['reg', 'HELD', 100, '..']);
sync();
assert.strictEqual(open().filter(x => x.type === 'NEEDS_REVIEW' && x.code === junk[IV.Code]).length, 1, 'raised once');
let st = call('webState');
assert.strictEqual(st.counts.byStatus.HELD, 2);
assert.strictEqual(st.interviewees.find(i => i.code === junk[IV.Code]).risk, 100);

// ---- approve: to a binome now, never held again ----
assert.throws(() => quick('approve', find('NEEDS_REVIEW', ivRow('idk.one@g.enp.edu.dz')[IV.Code]).id.replace(/\d+$/, '9999')), /no longer open/);
out = quick('approve', a.id);
assert(/approved, assigned to B\.\d\d as IT\.\d\d/.test(out.messages[0]), out.messages[0]);
r = ivRow('junk.one@g.enp.edu.dz');
assert.strictEqual(r[IV.Status], 'ASSIGNED');
assert(/Approved by admin@g\.enp\.edu\.dz, /.test(r[IV.Screening]) && inSheets(r[IV.Code]), 'stamped and in its binome sheet');
sync();
assert.strictEqual(ivRow('junk.one@g.enp.edu.dz')[IV.Status], 'ASSIGNED', 'a later sync never holds it again');
assert(!find('NEEDS_REVIEW', r[IV.Code]), 'its alert is closed');

// ---- decline, then restore ----
const idk = ivRow('idk.one@g.enp.edu.dz');
out = quick('decline', find('NEEDS_REVIEW', idk[IV.Code]).id);
assert(/declined\. Nobody was emailed/.test(out.messages[0]), out.messages[0]);
assert.strictEqual(ivRow('idk.one@g.enp.edu.dz')[IV.Status], 'DECLINED');
sync();
assert.strictEqual(ivRow('idk.one@g.enp.edu.dz')[IV.Status], 'DECLINED', 'stays declined');
out = call('webRun', 'restore', { codes: [idk[IV.Code]] });
assert(/restored, assigned to B\.\d\d/.test(out.messages[0]), out.messages[0]);
assert(/Restored by /.test(ivRow('idk.one@g.enp.edu.dz')[IV.Screening]) && inSheets(idk[IV.Code]));
assert.throws(() => call('webRun', 'restore', { codes: [idk[IV.Code]] }), /is not declined/);

// ---- someone put on the members list after they were assigned: an alert, they stay until declined ----
run(`mem.sheets[0].cells.push(['Good One', 'good.one@g.enp.edu.dz']); __cacheClear();`);
sync();
const good = ivRow('good.one@g.enp.edu.dz');
assert.strictEqual(good[IV.Status], 'ASSIGNED', 'not pulled out');
a = find('VIC_MEMBER', good[IV.Code]);
assert(a && a.binome === good[IV.Binome] && /on the VIC members list but is with B\.\d\d/.test(a.msg), 'VIC_MEMBER alert');
assert.throws(() => quick('approve', a.id), /declined or kept, not approved/);
// a member is saving in a binome sheet (they hold the document lock): no row is deleted under them, so theirs can't shift
run('__docLockBusy = true');
assert.throws(() => quick('decline', a.id), /A member is saving in the sheet of B\.\d\d: nothing was changed/);
run('__docLockBusy = false');
assert(ivRow('good.one@g.enp.edu.dz')[IV.Status] === 'ASSIGNED' && inSheets(good[IV.Code]), 'refused: still assigned, row still there');
out = quick('decline', a.id);
assert(/declined, taken out of the sheet of B\.\d\d/.test(out.messages[0]), out.messages[0]);
r = ivRow('good.one@g.enp.edu.dz');
assert.deepStrictEqual([r[IV.Status], r[IV.Binome], r[IV.Screening].indexOf('VIC member, declined by ')], ['DECLINED', '', 0]);
assert(!inSheets(good[IV.Code]), 'out of the binome sheet');

// ---- an unreadable members sheet: a HIGH alert, nobody declined on a guess ----
settings({ VIC_MEMBERS_SHEET: 'https://docs.google.com/spreadsheets/d/NoSuchSheetAnywhere000000000/edit' });
run('__cacheClear()');
apply('member.two@g.enp.edu.dz', 'Member', 'Two', VIC, DEPT);
sync();
assert(find('MEMBERS_SHEET') && find('MEMBERS_SHEET').severity === 'HIGH', 'MEMBERS_SHEET alert');
assert.strictEqual(ivRow('member.two@g.enp.edu.dz')[IV.Status], 'ASSIGNED', 'not declined while the list is unreadable');
assert.throws(() => call('webRun', 'membersRefresh'), /can't be read: no access/);
assert(/no access/.test(call('webState').screening.members.error));
settings({ VIC_MEMBERS_SHEET: 'https://docs.google.com/spreadsheets/d/' + MEMBERS + '/edit' });
run('__cacheClear()');
sync();
assert(!find('MEMBERS_SHEET'), 'closes once the sheet reads');
assert(find('VIC_MEMBER', ivRow('member.two@g.enp.edu.dz')[IV.Code]), 'and the member with a binome is flagged then');

// ---- the rejection email: declined at screening only, once each, admins only in TEST_MODE ----
apply('junk.two@g.enp.edu.dz', 'Junk', 'Two', '/', DEPT);
sync();
quick('decline', find('NEEDS_REVIEW', ivRow('junk.two@g.enp.edu.dz')[IV.Code]).id);
out = call('webRun', 'rejections', {});
assert.deepStrictEqual([out.result.count, out.result.sample, out.result.testMode], [1, ['Junk Two <junk.two@g.enp.edu.dz>'], true], 'members are never in it');
assert(/\{first\}/.test(out.result.body) && out.result.subject);
let box = run('__outbox.length');
out = call('webRun', 'rejections', { send: true, subject: 'Your application', body: 'Hi {first}, sorry.' });
assert(/Test mode is on: one copy went to you/.test(out.messages[0]), out.messages[0]);
assert.deepStrictEqual(R('__outbox.slice(' + box + ').map(function (m) { return [m.to, m.subject]; })'), [['admin@g.enp.edu.dz', '[TEST] Your application']]);
assert(/Hi Junk, sorry/.test(run('__outbox[__outbox.length - 1].htmlBody')));
assert.strictEqual(run('__outbox[__outbox.length - 1].name'), 'VIC Recruitment', 'the test copy, as the applicants get it');
assert(!/Rejection sent/.test(ivRow('junk.two@g.enp.edu.dz')[IV.Screening]), 'nothing stamped in TEST_MODE');
settings({ TEST_MODE: false });
box = run('__outbox.length');
out = call('webRun', 'rejections', { send: true, subject: 'Your application', body: 'Hi {first}, sorry.' });
assert(/1 rejection email sent/.test(out.messages[0]), out.messages[0]);
assert.deepStrictEqual(R('__outbox.slice(' + box + ').map(function (m) { return [m.to, m.name]; })'), [['junk.two@g.enp.edu.dz', 'VIC Recruitment']]);
assert(/Rejection sent \d\d\/\d\d/.test(ivRow('junk.two@g.enp.edu.dz')[IV.Screening]), 'stamped');
assert.strictEqual(call('webRun', 'rejections', {}).result.count, 0, 'pressing again reaches nobody');
// a failed send (quota, bad address) is not stamped, so the next press retries it
apply('junk.four@g.enp.edu.dz', 'Junk', 'Four', '/', DEPT);
sync();
quick('decline', find('NEEDS_REVIEW', ivRow('junk.four@g.enp.edu.dz')[IV.Code]).id);
run('__send = MailApp.sendEmail; MailApp.sendEmail = function () { throw new Error("quota"); }');
out = call('webRun', 'rejections', { send: true, subject: 'Your application', body: 'Hi {first}, sorry.' });
run('MailApp.sendEmail = __send');
assert(/0 rejection emails sent\. 1 failed/.test(out.messages[0]), out.messages[0]);
assert.deepStrictEqual([out.result.sent, out.result.failed, out.result.left], [0, 1, 0]);
assert(!/Rejection sent/.test(ivRow('junk.four@g.enp.edu.dz')[IV.Screening]), 'not stamped');
out = call('webRun', 'rejections', { send: true, subject: 'Your application', body: 'Hi {first}, sorry.' });
assert(/1 rejection email sent\.$/.test(out.messages[0]), out.messages[0]);
assert(/Rejection sent/.test(ivRow('junk.four@g.enp.edu.dz')[IV.Screening]), 'retried and stamped');
assert.throws(() => call('webRun', 'rejections', { send: true, subject: ' ', body: 'x' }), /needs a subject/);
settings({ TEST_MODE: true });

// ---- the script never flags its own writes; Reset keeps held and declined rows as they are ----
assert.deepStrictEqual(open().filter(x => x.type === 'MANUAL_EDIT').map(x => x.msg), [], 'no manual-edit alert');
apply('junk.three@g.enp.edu.dz', 'Junk', 'Three', 'idk', 'idk');
sync();
assert.strictEqual(ivRow('junk.three@g.enp.edu.dz')[IV.Status], 'HELD');
call('webRun', 'resetBinomes', { phrase: 'I confirm to reset the binomes' });
assert.deepStrictEqual(['junk.three', 'junk.two', 'member.one'].map(e => ivRow(e + '@g.enp.edu.dz')[IV.Status]), ['HELD', 'DECLINED', 'DECLINED']);
assert.strictEqual(ivRow('junk.one@g.enp.edu.dz')[IV.Status], 'UNASSIGNED', 'the others go back to waiting as before');

console.log('SCREEN OK');
