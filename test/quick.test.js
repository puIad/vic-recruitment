// The dashboard's quick actions on alerts (QuickFix.gs), driven through webState / webRun('quick') under web-app conditions
const assert = require('assert');
const { run, call, addRegistrations, backdateAssignments } = require('./seed')();

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
addRegistrations(8, 3);
run(`(function () { var reg = master.getSheetByName('Registration Responses'), t = Date.now();
  reg.cells.push(regRow(new Date(t + 1e3), 'bad.phone@g.enp.edu.dz', 'Bad', 'Phone', 'bad.phone@g.enp.edu.dz', '01/03/2005', '12345', 'IT', 'HR'));
  reg.cells.push(regRow(new Date(t + 2e3), 'no.dept@g.enp.edu.dz', 'No', 'Dept', 'no.dept@g.enp.edu.dz', '01/03/2005', '0555999001', 'Marketing', 'HR'));
  reg.cells.push(regRow(new Date(t + 3e3), 'amine.belkacem0@g.enp.edu.dz', 'Amine', 'Belkacem', 'amine.belkacem0@g.enp.edu.dz', '01/03/2005', '0555999002', 'IT', 'FLER'));
  reg.cells.push(regRow(new Date(t + 4e3), 'twin@g.enp.edu.dz', 'Twin', 'One', 'twin@g.enp.edu.dz', '01/03/2005', '0555999003', 'HR', 'IT'));
  reg.cells.push(regRow(new Date(t + 5e3), 'twin@g.enp.edu.dz', 'Twin', 'Two', 'twin@g.enp.edu.dz', '02/03/2005', '0555999004', 'HR', 'IT'));
  reg.cells.push(regRow(new Date(t + 6e3), "m'hamed.ouali@g.enp.edu.dz", "M'hamed", 'Ouali', "m'hamed.ouali@g.enp.edu.dz", '01/03/2005', '0555999005', 'IT', 'HR'));
  reg.cells.push(regRow(new Date(t + 7e3), 'mhamed.ouali@g.enp.edu.dz', 'Mhamed', 'Ouali', 'mhamed.ouali@g.enp.edu.dz', '01/03/2005', '0555999005', 'IT', 'COMM'));
})()`);
call('webRun', 'sync');

const quick = (op, ids, extra) => call('webRun', 'quick', Object.assign({ op: op, ids: [].concat(ids) }, extra || {}));
const open = () => call('webState').alerts;
const find = (type, pred) => open().find(a => a.type === type && (!pred || pred(a)));
const fileId = code => call('webState').binomes.find(b => b.code === code).fileUrl.split('/d/')[1];
const sheetRow = (bin, code) => run(`__files["${fileId(bin)}"].obj.sheets[0].getDataRange().getValues()`).find(r => r[BFI.Code] === code);
const ivRow = pred => run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(pred);
const IV = run('idx_(IV_H)'), BFI = run('BFI');
const noEdits = () => assert.deepStrictEqual(open().filter(a => a.type === 'MANUAL_EDIT').map(a => a.msg), [], 'the script never flags its own writes');

// ---- a typo fixed in place: Master + binome sheet, no manual edit, alert closed ----
{
  const a = find('BAD_PHONE');
  assert.deepStrictEqual([a.q.kind, a.q.iv.phone, a.q.iv.first], ['reg', '12345', 'Bad']);
  const cd = quick('draft', a.id, { to: 'candidate' }).result.drafts[0];
  assert(/phone number \("12345"\) does not look valid/.test(cd.body) && cd.to.includes('bad.phone@g.enp.edu.dz'), cd.body);
  call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
  const box = run('__outbox.length');
  quick('send', a.id, { to: 'candidate', drafts: [{ group: cd.group, subject: cd.subject, body: cd.body }] });
  call('webRun', 'saveSettings', { values: { TEST_MODE: true } });
  assert.deepStrictEqual(JSON.parse(run('JSON.stringify(__outbox.slice(' + box + ').map(function (m) { return [m.to, m.name]; }))')), [['bad.phone@g.enp.edu.dz', 'VIC Recruitment']], 'a candidate mail');
  assert.throws(() => quick('edit', a.id, { values: { Phone: 'abc' } }), /not an Algerian phone/);
  assert(find('BAD_PHONE'), 'a wrong value is refused and the alert stays');
  const out = quick('edit', a.id, { values: { Phone: '0555 12 34 56' } });
  assert(/Phone "12345" → "0555123456", also in the sheet of B\.\d\d/.test(out.messages[0]), out.messages[0]);
  const r = ivRow(x => x[IV['First Name']] === 'Bad');
  assert.strictEqual(r[IV.Phone], '0555123456');
  assert.strictEqual(String(sheetRow(r[IV.Binome], r[IV.Code])[BFI.Phone]), '0555123456', 'binome sheet follows');
  assert(!find('BAD_PHONE'), 'resolved');
  call('webRun', 'sync');
  noEdits();
}

// ---- a department picked for a candidate the routing could not place assigns them ----
{
  const a = find('INVALID_CHOICE');
  assert.deepStrictEqual([a.q.iv.status, a.q.iv.code], ['UNASSIGNED', '']);
  const out = quick('edit', a.id, { values: { '1st Choice': 'IT' } });
  assert(/assigned to B\.\d\d as IT\.\d\d/.test(out.messages[0]), out.messages[0]);
  const r = ivRow(x => x[IV['First Name']] === 'No');
  assert(r[IV.Binome] && sheetRow(r[IV.Binome], r[IV.Code]), 'in a binome and its sheet');
  call('webRun', 'sync');
  noEdits();
}

// ---- duplicate registrations: use the new answers / a different person ----
{
  const a = find('DUPLICATE_REGISTRATION', x => /Amine/.test(x.msg));
  assert.deepStrictEqual([a.q.iv.phone, a.q.old.phone, a.q.old.code !== ''], ['0555999002', '0555100000', true]);
  let out = quick('dupNew', a.id);
  assert(/Phone, 2nd Choice taken from the new registration, also in the sheet/.test(out.messages[0]), out.messages[0]);
  const r = ivRow(x => x[IV.Code] === a.q.old.code);
  assert.deepStrictEqual([r[IV.Phone], r[IV['2nd Choice']]], ['0555999002', 'FLER']);
  assert.strictEqual(String(sheetRow(r[IV.Binome], r[IV.Code])[BFI.Phone]), '0555999002');
  const t = find('DUPLICATE_REGISTRATION', x => /Twin/.test(x.msg));
  out = quick('dupSeparate', t.id);
  assert(/Twin Two is now a candidate of their own \(HR\.\d\d\), assigned to B\.\d\d/.test(out.messages[0]), out.messages[0]);
  assert(call('webState').interviewees.some(i => i.name === 'Twin Two' && /^HR\.\d\d$/.test(i.code)));
  // caught by name + phone only, M'hamed and Mhamed being one name: the earlier one is found, the new answers taken
  const m = find('DUPLICATE_REGISTRATION', x => /Mhamed/.test(x.msg));
  assert(m.q.old.code !== '', 'the earlier registration is shown');
  out = quick('dupNew', m.id);
  assert(/2nd Choice taken from the new registration/.test(out.messages[0]), out.messages[0]);
  call('webRun', 'sync');
  noEdits();
}

// ---- snooze, expiry, mute, unmute ----
{
  backdateAssignments(3);
  call('webRun', 'sync');
  const nc = open().filter(a => a.type === 'NOT_CONTACTED');
  assert(nc.length >= 3, 'timing alerts');
  const [a, b] = nc;
  assert.throws(() => quick('snooze', a.id, { for: 'interview' }), /no interview date ahead/);
  quick('snooze', a.id, { for: '24h' });
  let st = call('webState');
  assert(!st.alerts.some(x => x.id === a.id) && st.muted.find(x => x.id === a.id).status === 'SNOOZED', 'snoozed: out of the open list');
  call('webRun', 'sync');
  assert(!open().some(x => x.type === 'NOT_CONTACTED' && x.code === a.code), 'not raised again while snoozed');
  run(`(function () { var sh = master.getSheetByName('Alerts'), I = idx_(ALERT_H);
    for (var k = 1; k < sh.cells.length; k++) if (sh.cells[k][0] === '${a.id}') sh.cells[k][I['Resolved At']] = new Date(Date.now() - 1000); })()`);
  call('webRun', 'sync');
  assert(open().some(x => x.id === a.id), 'a snooze that ran out opens the same alert again');
  quick('mute', b.id);
  call('webRun', 'sync');
  st = call('webState');
  assert(!st.alerts.some(x => x.type === 'NOT_CONTACTED' && x.code === b.code) && st.muted.some(x => x.id === b.id && x.status === 'MUTED'), 'muted for good');
  quick('unmute', b.id);
  assert(open().some(x => x.id === b.id), 'unmuted');
  const e = open().find(x => x.type === 'MANUAL_EDIT');
  if (e) assert.throws(() => quick('mute', e.id), /Apply \/ Revert \/ Accept/, 'manual edits keep their own buttons');
}

// ---- odd value fixed in the binome sheet ----
let oddCode;
{
  const r = ivRow(x => x[IV.Status] === 'ASSIGNED');
  oddCode = r[IV.Code];
  // a week ahead, typed with last year: the YEAR check catches it
  const p2 = n => String(n).padStart(2, '0'), wk = new Date(Date.now() + 7 * 864e5), y = wk.getFullYear();
  const dd = p2(wk.getDate()) + '/' + p2(wk.getMonth() + 1);
  run(`(function () { var sh = __files["${fileId(r[IV.Binome])}"].obj.sheets[0];
    for (var k = 1; k < sh.cells.length; k++) if (sh.cells[k][BFI.Code] === '${oddCode}') {
      sh.cells[k][BFI.Contacted] = 'Yes'; sh.cells[k][BFI['Interview Date']] = '${dd}/${y - 1}'; sh.cells[k][BFI['Interview Time']] = '14:00'; } __touch("${fileId(r[IV.Binome])}"); })()`); // a typed edit moves Drive's "last updated"
  call('webRun', 'sync');
  const a = find('ODD_VALUE', x => x.code === oddCode);
  const iso = yy => yy + '-' + p2(wk.getMonth() + 1) + '-' + p2(wk.getDate());
  assert.deepStrictEqual([a.q.check, a.q.date, a.q.time, a.q.regYear], ['YEAR', iso(y - 1), '14:00', String(new Date(Date.now() - 3 * 864e5).getFullYear())]);
  assert.strictEqual(run(`fmt_(new Date(${a.q.atMs}), 'yyyy-MM-dd HH:mm')`), iso(y - 1) + ' 14:00', 'atMs: the interview as a timestamp, for a pending snooze');
  assert.throws(() => quick('setCell', a.id, { date: y + '-02-31', time: '14:00' }), /not a real date/);
  const out = quick('setCell', a.id, { date: iso(y), time: '14:00' });
  assert(out.messages[0].includes('interview on ' + dd + '/' + y + ' at 14:00, written in the sheet of'), out.messages[0]);
  assert.strictEqual(sheetRow(r[IV.Binome], oddCode)[BFI['Interview Date']], dd + '/' + y);
  call('webRun', 'sync');
  assert(!find('ODD_VALUE', x => x.code === oddCode), 'fixed: not raised again');
  assert.strictEqual(ivRow(x => x[IV.Code] === oddCode)[IV.Status], 'SCHEDULED');
}

// ---- a free member excluded in one click ----
{
  run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,1,6).setValues([['Late Member','late@g.enp.edu.dz','IT','IT',false,'']]);})()");
  call('webRun', 'sync');
  const a = find('UNPAIRED_MEMBER');
  assert.strictEqual(a.q.email, 'late@g.enp.edu.dz');
  assert(/#gid=\d+&range=A\d+$/.test(quick('locate', a.id, { target: 'team' }).result.url), 'link to the Team row');
  quick('exclude', a.id);
  call('webRun', 'sync');
  assert(!find('UNPAIRED_MEMBER') && call('webState').unpaired.length === 0, 'excluded: nobody unpaired');
}

// ---- interview forms: unknown code, second form ----
{
  const st = call('webState'), it = st.interviewees.find(i => i.status === 'ASSIGNED' && i.code !== oddCode), b = st.binomes.find(x => x.code === it.binome);
  const it2 = st.interviewees.find(i => i.status === 'ASSIGNED' && i.code !== it.code && i.code !== oddCode && i.binome === it.binome) ||
    st.interviewees.find(i => i.status === 'ASSIGNED' && i.code !== it.code && i.code !== oddCode);
  const b2 = st.binomes.find(x => x.code === it2.binome), sub = b.people[0].email, sub2 = b2.people[0].email;
  run(`(function () { var ir = master.getSheetByName('Interview Responses'), t = Date.now();
    ir.cells.push([new Date(t), '${sub}', '${b.code}', 'XX.99', 'intro', 'IT', 'IT', '']);
    ir.cells.push([new Date(t + 1000), '${sub2}', '${b2.code}', '${it2.code}', 'intro', 'IT', 'IT', '']);
    ir.cells.push([new Date(t + 2000), '${sub2}', '${b2.code}', '${it2.code}', 'intro', 'IT', 'IT', '']); })()`);
  call('webRun', 'sync');
  const u = find('UNKNOWN_INTERVIEWEE');
  assert.deepStrictEqual([u.q.form.typedIv, u.q.form.submitter, u.q.form.subBinome], ['XX.99', sub, b.code]);
  const d = quick('draft', u.id, { to: 'submitter' }).result;
  assert(d.testMode && d.drafts.length === 1 && /"XX\.99"/.test(d.drafts[0].body) && d.drafts[0].to.includes(sub), JSON.stringify(d));
  assert(/Interview%20Log|#gid=\d+&range=A\d+$/.test(quick('locate', u.id, { target: 'log' }).result.url));
  const irGid = run("String(responseSheet_('INT').getSheetId())");
  const formUrl = quick('locate', u.id, { target: 'form' }).result.url;
  assert(formUrl.includes('#gid=' + irGid + '&range=A') && /&range=A\d+$/.test(formUrl), 'its Interview Responses row: ' + formUrl);
  let out = quick('pickCandidate', u.id, { code: it.code.toLowerCase() });
  assert(/now interviewed/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(call('webState').interviewees.find(i => i.code === it.code).status, 'INTERVIEWED');
  assert.strictEqual(sheetRow(b.code, it.code)[BFI['Interview Done']], true);

  const dup = find('DUPLICATE_INTERVIEW', x => x.code === it2.code);
  assert(dup.q.first && dup.q.first.row < dup.q.form.row, 'both forms shown');
  out = quick('keepForm', dup.id, { which: 'latest' });
  assert(/latest form \(row \d+\) counts/.test(out.messages[0]), out.messages[0]);
  const log = run('master.getSheetByName("Interview Log").getDataRange().getValues()');
  assert.strictEqual(log[dup.q.first.row - 1][6], 'IGNORED');
  assert.strictEqual(ivRow(x => x[IV.Code] === it2.code)[IV['Interview Log Row']], dup.q.form.row);
}

// ---- links ----
{
  const st = call('webState'), a = st.alerts.find(x => x.type === 'NOT_CONTACTED');
  const url = quick('locate', a.id, { target: 'cell' }).result.url, col = run('a1_(1, bfCol_("Contacted"))').replace('1', '');
  assert(url.includes(fileId(a.binome)) && new RegExp('&range=' + col + '\\d+$').test(url), url);
  const regGid = run("String(responseSheet_('REG').getSheetId())");
  const dupA = run(`ss_().getSheetByName('Alerts').getDataRange().getValues().find(r => r[3] === 'DUPLICATE_REGISTRATION')[0]`);
  assert(quick('locate', dupA, { target: 'form' }).result.url.includes('#gid=' + regGid + '&range=A'), 'link to the form response');
}

// ---- binome sheet repairs ----
{
  const bins = call('webState').binomes.filter(b => b.status === 'ACTIVE' && b.assigned >= 2);
  const B1 = bins[0].code, B2 = bins[1].code, f1 = fileId(B1), f2 = fileId(B2);
  run(`(function () { var bk = __files["${f1}"].obj; bk.title = 'my notes'; var s = bk.insertSheet('Scratch'); bk.sheets = [s].concat(bk.sheets.filter(x => x !== s)); })()`);
  call('webRun', 'integrity');
  const fixes = open().filter(a => a.type === 'INTEGRITY' && a.binome === B1);
  assert.deepStrictEqual(fixes.map(a => a.q.repair).sort(), ['rename', 'reorder'], JSON.stringify(fixes.map(a => a.msg)));
  let out = quick('repair', fixes.map(a => a.id));
  assert(/is titled "\[B\.\d\d\]/.test(out.messages[0]) && /first tab of/.test(out.messages[0]), out.messages[0]);

  const own = call('webState').interviewees.filter(i => i.binome === B1), other = call('webState').interviewees.find(i => i.binome === B2);
  run(`(function () { var sh = __files["${f1}"].obj.sheets[0]; sh.protections = [];
    var k = sh.cells.findIndex(r => r && r[BFI.Code] === '${own[0].code}'); sh.cells.push(sh.cells[k].slice());
    var x = sh.cells[k].slice(); x[BFI.Code] = '${other.code}'; sh.cells.push(x);
    sh.cells.splice(sh.cells.findIndex(r => r && r[BFI.Code] === '${own[1].code}'), 1); })()`);
  call('webRun', 'integrity');
  const more = open().filter(a => a.type === 'INTEGRITY' && a.binome === B1);
  assert.deepStrictEqual(more.map(a => a.q.repair).sort(), ['dedupe', 'protect', 'putback', 'remove'], JSON.stringify(more.map(a => a.msg)));
  out = quick('repair', more.filter(a => /dedupe|remove/.test(a.q.repair)).map(a => a.id), { dryRun: true });
  assert(/keep row \d+ \(.*\), delete row \d+/.test(out.result.lines.join('\n')) && /delete .* from the sheet of/.test(out.result.lines.join('\n')), out.result.lines);
  assert.strictEqual(out.messages.length, 0, 'a dry run says nothing');
  out = quick('repair', more.map(a => a.id));
  assert.strictEqual(out.result.done.length, 4, out.messages[0]);
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'all repaired');
  assert(run(`__files["${f2}"].obj.sheets[0].getDataRange().getValues()`).some(r => r[BFI.Code] === other.code), 'the other binome keeps its row');

  // a dashboard interview form (docs/interview-form.md part 2): its tab is never an integrity problem, even put in front, and
  // the alerts it raises link to its Dashboard Interviews row
  const cand = call('webState').interviewees.find(i => i.binome && i.binome !== B1 && ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status));
  const BX = cand.binome, fX = fileId(BX), sub = call('webState').binomes.find(b => b.code === BX).people[0].email;
  const wrong = ['IT', 'COMM', 'FLER', 'HR'].find(d => d !== cand.code.split('.')[0]);
  run(`var __adm = Session; Session = { getEffectiveUser: () => ({ getEmail: () => '${sub}' }), getActiveUser: () => ({ getEmail: () => '${sub}' }) };
    (function () { var a = {}; INTERVIEW_QUESTIONS.forEach(function (q) { if (['first', 'final', '${wrong}'].indexOf(q.section) >= 0) a[q.id] = q.type === 'score' ? 6 : q.type === 'choice' ? q.options[0] : 'ok'; });
      a.firstChoice = '${wrong}'; a.finalDep = '${wrong}'; webRun('interviewSave', { code: '${cand.code}', answers: a, seen: '' }); })();
    Session = __adm;`);
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'the Interview Answers tab is left alone');
  const mism = open().find(a => a.type === 'CHOICE_MISMATCH' && a.code === cand.code);
  assert(mism, 'the dashboard form was logged and checked');
  const dashGid = run("String(ss_().getSheetByName(TAB.DASH).getSheetId())");
  assert(/#gid=\d+&range=A2$/.test(quick('locate', mism.id, { target: 'form' }).result.url) && quick('locate', mism.id, { target: 'form' }).result.url.includes('#gid=' + dashGid), 'its Dashboard Interviews row');
  run(`(function () { var bk = __files["${fX}"].obj, t = bk.getSheetByName(IA_TAB); bk.sheets = [t].concat(bk.sheets.filter(x => x !== t)); })()`);
  call('webRun', 'integrity');
  const front = open().filter(a => a.type === 'INTEGRITY' && a.binome === BX);
  assert.deepStrictEqual(front.map(a => a.q.repair), ['reorder'], JSON.stringify(front.map(a => a.msg)));
  quick('repair', front[0].id);
  assert.deepStrictEqual(run(`__files["${fX}"].obj.getSheets().map(x => x.getName())`).join('|'), BX + '|Interview Answers', 'the binome tab first again, the answers kept');
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'repaired');

  // a protection made before the triggers moved lists only its old editor: flagged, and Repair puts the trigger account back
  run(`(function () { var sh = __files["${f1}"].obj.sheets[0]; sh.protections = []; var p = sh.protect(); p.removeEditors([__props.TRIGGER_OWNER]); p.addEditor('old.owner@g.enp.edu.dz'); })()`);
  call('webRun', 'integrity');
  const lock = open().filter(a => a.type === 'INTEGRITY' && a.binome === B1);
  assert(lock.length === 1 && lock[0].q.repair === 'protect' && /does not list admin@g\.enp\.edu\.dz/.test(lock[0].msg), JSON.stringify(lock.map(a => a.msg)));
  quick('repair', lock[0].id);
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'repaired');
  assert(run(`__files["${f1}"].obj.sheets[0].protections[0].getEditors().map(u => u.getEmail()).includes(__props.TRIGGER_OWNER)`), 'trigger account is an editor again');
  // the menu action rewrites a stale protection directly, and leaves a good one alone
  run(`(function () { var sh = __files["${f1}"].obj.sheets[0]; sh.protections = []; var p = sh.protect(); p.removeEditors([__props.TRIGGER_OWNER]); p.addEditor('old.owner@g.enp.edu.dz'); })()`);
  run('reprotectBinomeSheets()');
  assert(run(`__files["${f1}"].obj.sheets[0].protections[0].getEditors().map(u => u.getEmail()).includes(__props.TRIGGER_OWNER)`), 'menu: trigger account listed');
  // refused: not the Master's owner, no trigger owner set, lock busy; each leaves a stale protection as it was
  const stale = () => run(`(function () { var sh = __files["${f1}"].obj.sheets[0]; sh.protections = []; var p = sh.protect(); p.removeEditors([__props.TRIGGER_OWNER]); p.addEditor('old.owner@g.enp.edu.dz'); })()`);
  const fixed = () => run(`__files["${f1}"].obj.sheets[0].protections[0].getEditors().map(u => u.getEmail()).includes("admin@g.enp.edu.dz")`);
  stale(); run('var __asq = e => { Session = { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }; __asq("helper@g.enp.edu.dz"); reprotectBinomeSheets(); __asq("admin@g.enp.edu.dz")');
  assert.strictEqual(fixed(), false, 'a non-owner is refused');
  stale(); run('var __t = __props.TRIGGER_OWNER; delete __props.TRIGGER_OWNER; reprotectBinomeSheets(); __props.TRIGGER_OWNER = __t');
  assert.strictEqual(fixed(), false, 'no trigger owner: nothing rewritten');
  stale(); run('__lockBusy = true; reprotectBinomeSheets(); __lockBusy = false');
  assert.strictEqual(fixed(), false, 'lock busy: nothing rewritten');
  run('reprotectBinomeSheets()');
  assert.strictEqual(fixed(), true, 'the owner, with the lock free, rewrites it');
  run(`__files["${f1}"].obj.sheets[0].protections[0].__id = 'kept'`);
  run('reprotectBinomeSheets()');
  assert.strictEqual(run(`__files["${f1}"].obj.sheets[0].protections[0].__id`), 'kept', 'a sheet already fine is not touched');
  // an admin added to the Master after the sheet was protected: flagged (their Sync now would hit the protection), and the menu lists them
  run(`ss_().addEditor('second.admin@g.enp.edu.dz')`);
  call('webRun', 'integrity');
  const noAdmin = open().filter(a => a.type === 'INTEGRITY' && a.binome === B1);
  assert(noAdmin.length === 1 && /does not list second\.admin@g\.enp\.edu\.dz/.test(noAdmin[0].msg) && /Sync now/.test(noAdmin[0].msg), JSON.stringify(noAdmin.map(a => a.msg)));
  run('reprotectBinomeSheets()');
  assert(run(`__files["${f1}"].obj.sheets[0].protections[0].getEditors().map(u => u.getEmail()).includes('second.admin@g.enp.edu.dz')`), 'menu: the new admin listed');
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'every admin listed');
  run(`__files["${f1}"].obj.sheets[0].protections[0].__id = 'kept'`);
  // a protection whose editors the account cannot read is flagged too, not taken for fine
  run(`__files["${f1}"].obj.sheets[0].protections[0].getEditors = function () { throw new Error('You do not have permission'); }`);
  call('webRun', 'integrity');
  const unreadable = open().filter(a => a.type === 'INTEGRITY' && a.binome === B1);
  assert(unreadable.length === 1 && /cannot be read/.test(unreadable[0].msg) && /does not list admin@g\.enp\.edu\.dz \(/.test(unreadable[0].msg) /* just the runner, not every admin */, JSON.stringify(unreadable.map(a => a.msg)));
  quick('repair', unreadable[0].id);
  call('webRun', 'integrity');
  assert.deepStrictEqual(open().filter(a => a.type === 'INTEGRITY').map(a => a.msg), [], 'repaired again');

  // a sheet that could not be opened (the Sheets API refusing too, so the sync opens it the usual way): retried
  run(`__sheetsApi = false; __touch("${f2}"); var __ob = SpreadsheetApp.openById; SpreadsheetApp.openById = id => { if (id === "${f2}") throw new Error("Service unavailable"); return __ob.call(SpreadsheetApp, id); }`);
  call('webRun', 'sync');
  run('SpreadsheetApp.openById = __ob; __sheetsApi = true');
  const fe = find('FILE_ERROR', x => x.binome === B2);
  assert.strictEqual(fe.q.repair, 'retry');
  out = quick('repair', fe.id);
  assert(/opens, its title and banner are up to date/.test(out.messages[0]), out.messages[0]);
  assert(!find('FILE_ERROR', x => x.binome === B2));
}

// ---- sharing (test mode off) and emails ----
{
  call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
  const B = call('webState').binomes.find(b => b.status === 'ACTIVE' && b.people.length === 2), f = fileId(B.code);
  run(`__files["${f}"].editors.push('stranger@g.enp.edu.dz')`);
  call('webRun', 'integrity');
  const mine = open().filter(a => a.type === 'INTEGRITY' && a.binome === B.code);
  assert.deepStrictEqual(mine.map(a => a.q.repair).sort(), ['reshare', 'reshare', 'unshare'], JSON.stringify(mine.map(a => a.msg)));
  quick('repair', mine.map(a => a.id));
  const eds = run(`__files["${f}"].editors`);
  assert(B.people.every(p => eds.includes(p.email)) && !eds.includes('stranger@g.enp.edu.dz'), JSON.stringify(eds));

  const nc = open().filter(a => /NOT_CONTACTED|NO_DATE/.test(a.type));
  const bin = nc.find(a => nc.filter(x => x.binome === a.binome).length >= 2).binome, ids = nc.filter(a => a.binome === bin).map(a => a.id);
  const d = quick('draft', ids, { to: 'binome' }).result;
  assert(!d.testMode && d.drafts.length === 1 && d.drafts[0].ids.length === ids.length, 'one email per binome');
  assert.strictEqual((d.drafts[0].body.match(/^• /gm) || []).length, ids.length);
  assert.throws(() => quick('send', ids, { to: 'binome', drafts: [{ group: d.drafts[0].group, subject: '', body: 'x' }] }), /subject and a text/);
  run('__outbox.length = 0');
  const out = quick('send', ids, { to: 'binome', drafts: [{ group: d.drafts[0].group, subject: 'Please call them', body: 'Hi <both>\nline two', to: 'evil@x.dz' }] });
  assert(/Email sent to B\.\d\d/.test(out.messages[0]), out.messages[0]);
  const sent = run('__outbox.slice()'), people = call('webState').binomes.find(b => b.code === bin).people.map(p => p.email);
  assert.strictEqual(sent.map(m => m.to).sort().join(), people.slice().sort().join(), 'the members, never an address from the page');
  assert(sent.every(m => m.subject === 'Please call them' && /Hi &lt;both&gt;<br>line two/.test(m.htmlBody)), 'the edited text, escaped');
  assert(sent.every(m => m.name === 'VIC Recruitment Bot'), 'a team mail');
  const rows = run('ss_().getSheetByName("Alerts").getDataRange().getValues()');
  assert(ids.every(id => people.every(p => rows.find(r => r[0] === id)[7].includes(p))), 'Emailed To records it');
  assert(ids.every(id => open().some(a => a.id === id)), 'a nudge does not close the alerts');
}

// ---- a binome sheet that refuses the write: the Master change is kept and said, never shown as a failure ----
{
  run(`(function () { master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 9e3), 'late.phone@g.enp.edu.dz', 'Late', 'Phone', 'late.phone@g.enp.edu.dz', '01/03/2005', '999', 'IT', 'HR')); })()`);
  call('webRun', 'sync');
  const a = find('BAD_PHONE', x => x.q && x.q.iv && x.q.iv.first === 'Late');
  run('var __bs = binomeSheet_; binomeSheet_ = function () { throw new Error("The sheet is protected"); }');
  let out;
  try { out = quick('edit', a.id, { values: { Phone: '0555 12 34 99' } }); } finally { run('binomeSheet_ = __bs'); }
  assert(/"999" → "0555123499", but not written into the sheet of B\.\d\d/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(ivRow(x => x[IV['First Name']] === 'Late')[IV.Phone], '0555123499', 'the Master keeps it');
  const fe = find('FILE_ERROR', x => /0555123499" saved in the Master but not written/.test(x.msg));
  assert(fe && fe.q.repair === '' && !find('BAD_PHONE', x => x.id === a.id), 'an alert to type it by hand, no Repair; the phone alert closed');
  call('webRun', 'resolve', { ids: [fe.id] });
  // the same through "take the new registration's answers"
  run(`(function () { var reg = master.getSheetByName('Registration Responses'), t = Date.now() + 2e4;
    reg.cells.push(regRow(new Date(t), 'again.dup@g.enp.edu.dz', 'Again', 'Dup', 'again.dup@g.enp.edu.dz', '01/03/2005', '0555777111', 'IT', 'HR'));
    reg.cells.push(regRow(new Date(t + 1e3), 'again.dup@g.enp.edu.dz', 'Again', 'Dup', 'again.dup@g.enp.edu.dz', '01/03/2005', '0555777222', 'IT', 'HR')); })()`);
  call('webRun', 'sync');
  const d = find('DUPLICATE_REGISTRATION', x => /Again Dup/.test(x.msg));
  run('binomeSheet_ = function () { throw new Error("The sheet is protected"); }');
  try { out = quick('dupNew', d.id); } finally { run('binomeSheet_ = __bs'); }
  assert(/Phone taken from the new registration, but not written into the sheet of B\.\d\d/.test(out.messages[0]), out.messages[0]);
  const fe2 = find('FILE_ERROR', x => /Phone from the new registration saved in the Master but not written/.test(x.msg));
  assert(fe2 && fe2.q.repair === '', 'an alert to type it by hand');
  call('webRun', 'resolve', { ids: [fe2.id] });

  // a form linked by hand whose sheet refuses the mark: the link stands and the alert's Repair writes the mark again
  const st = call('webState'), it = st.interviewees.find(i => i.status === 'ASSIGNED'), b = st.binomes.find(x => x.code === it.binome);
  run(`(function () { master.getSheetByName('Interview Responses').cells.push([new Date(Date.now() + 9e3), '${b.people[0].email}', '${b.code}', 'XX.98', 'intro', 'IT', 'IT', '']); })()`);
  call('webRun', 'sync');
  const u = find('UNKNOWN_INTERVIEWEE', x => /"XX\.98"/.test(x.msg));
  run('var __mk = markInterviewInFile_; markInterviewInFile_ = function () { throw new Error("The sheet is protected"); }');
  try { out = quick('pickCandidate', u.id, { code: it.code }); } finally { run('markInterviewInFile_ = __mk'); }
  assert(/now interviewed; the mark in the sheet of B\.\d\d failed/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(call('webState').interviewees.find(i => i.code === it.code).status, 'INTERVIEWED');
  const mk = find('FILE_ERROR', x => x.code === it.code && /^Cannot mark/.test(x.msg));
  assert(mk && mk.q.repair === 'retry', JSON.stringify(mk));
  quick('repair', mk.id);
  assert.strictEqual(sheetRow(b.code, it.code)[BFI['Interview Done']], true, 'Repair wrote the mark');
  // "keep the latest form" on a second form, same sheet refusing: the choice stands, the alert retries the mark
  run(`(function () { master.getSheetByName('Interview Responses').cells.push([new Date(Date.now() + 2e4), '${b.people[0].email}', '${b.code}', '${it.code}', 'intro', 'IT', 'IT', '']); })()`);
  call('webRun', 'sync');
  const dup = find('DUPLICATE_INTERVIEW', x => x.code === it.code);
  run('markInterviewInFile_ = function () { throw new Error("The sheet is protected"); }');
  try { out = quick('keepForm', dup.id, { which: 'latest' }); } finally { run('markInterviewInFile_ = __mk'); }
  assert(/latest form \(row \d+\) counts.*the mark in the sheet of B\.\d\d failed/.test(out.messages[0]), out.messages[0]);
  assert(find('FILE_ERROR', x => x.code === it.code && /^Cannot mark/.test(x.msg)), 'an alert to retry the mark');
}

// ---- edit a candidate's data (webRun editCandidate): twelve fields, the checks, the log, the registration check again ----
{
  const edit = (code, values) => call('webRun', 'editCandidate', { code: code, values: values });
  const log = () => run('master.getSheetByName("Interviewee Changes").getDataRange().getValues().slice(1)');
  const edited = code => log().filter(l => l[2] === code && /^Edited /.test(l[3]));
  const ivs = call('webState').interviewees.filter(i => i.binome && i.status !== 'DECLINED');
  const it = ivs[0], other = ivs[1];
  const row = () => ivRow(x => x[IV.Code] === it.code);
  // free text and dropdown fields: Master, one log row each, no MANUAL_EDIT
  const out = edit(it.code, { Facebook: ' fb.me/x ', Discord: '', Year: '2nd', Field: 'DATA', Availability: 'monday, Sunday' });
  assert(/Facebook .*→ "fb\.me\/x".*Year .*→ "2ND".*Field .*→ "DATA".*Availability .*→ "Monday, Sunday"/.test(out.messages[0]), out.messages[0]);
  const r = row();
  assert.deepStrictEqual(Array.from([r[IV.Facebook], r[IV.Year], r[IV.Field], r[IV.Availability]]), ['fb.me/x', '2ND', 'DATA', 'Monday, Sunday']);
  assert.deepStrictEqual(Array.from(edited(it.code).map(l => l[3]).sort()), ['Edited Availability', 'Edited Facebook', 'Edited Field', 'Edited Year'], 'one row per changed field (a blank kept blank is no change)');
  assert.strictEqual(edited(it.code).find(l => l[3] === 'Edited Year')[5], '2ND');
  const got = call('webRun', 'candidateGet', { code: it.code }).result;
  assert.deepStrictEqual([got.values.Year, got.values.Facebook, got.values['Birth Date'].length, got.days.length], ['2ND', 'fb.me/x', 10, 7], 'the form reads the Master');
  call('webRun', 'sync');
  noEdits();
  // refused: not a form option, an email another live candidate has, nothing changed; the Master stays as it was
  assert.throws(() => edit(it.code, { Year: '4TH' }), /Year must be one of 1ST, 2ND, 3RD/);
  assert.throws(() => edit(it.code, { Availability: 'Someday' }), /days of the week/);
  assert.throws(() => edit(it.code, { Email: ivRow(x => x[IV.Code] === other.code)[IV.Email] }), new RegExp('already belongs to ' + other.code.replace('.', '\\.')));
  assert.throws(() => edit(it.code, { Year: '2ND' }), /nothing to change/);
  assert.strictEqual(row()[IV.Year], '2ND');
  assert.strictEqual(edited(it.code).length, 4, 'a refusal logs nothing');
  // the registration check again: a new problem opens, fixing it closes it
  const bd = edit(it.code, { 'Birth Date': '01/01/1980' });
  assert(/New: .*birth date.*age of/.test(bd.messages[0]), bd.messages[0]);
  assert(find('BAD_BIRTHDATE', x => x.code === it.code), 'opened');
  const fix = edit(it.code, { 'Birth Date': '01/03/2005' });
  assert(/Closed: bad birthdate/.test(fix.messages[0]), fix.messages[0]);
  assert(!find('BAD_BIRTHDATE', x => x.code === it.code), 'closed');
  // an alert closed with Mark resolved stays closed when another field is edited; a fixed email stays fixed
  const ext = edit(it.code, { Email: 'someone.ext@gmail.com' });
  assert(/New: .*non-@/.test(ext.messages[0]), ext.messages[0]);
  assert.strictEqual(row()[IV['Typed Email']], 'someone.ext@gmail.com', 'the typed copy follows the email');
  call('webRun', 'resolve', { ids: [find('EXTERNAL_EMAIL', x => x.code === it.code).id] });
  edit(it.code, { Discord: 'someone#1' });
  assert(!find('EXTERNAL_EMAIL', x => x.code === it.code), 'a resolved alert does not come back');
  // the alert's Fix leaves its alert open when the problem is still there (the other name is still junk)
  run(`(function () { master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 9e3), 'junk.name@g.enp.edu.dz', 'Junk', '.', 'junk.name@g.enp.edu.dz', '01/03/2005', '0555999077', 'IT', 'HR')); })()`);
  call('webRun', 'sync');
  const mn = find('MISSING_NAME');
  assert(mn, 'opened');
  quick('edit', mn.id, { values: { 'First Name': 'Amine' } }); // only the first name differs
  assert(find('MISSING_NAME'), 'still open: the family name is junk');
  // the alert's edit carries the Move offer too, as the Edit form does
  const jr = ivRow(x => x[IV['First Name']] === 'Amine' && x[IV['Family Name']] === '.');
  const jtag = call('webState').binomes.find(b => b.code === jr[IV.Binome]).tag;
  const jdep = ['IT', 'COMM', 'FLER', 'HR'].find(d => !/\ball\b/i.test(jtag) && !new RegExp('\\b' + d + '\\b', 'i').test(jtag));
  if (jdep) {
    const mo = quick('edit', mn.id, { values: { '1st Choice': jdep } });
    assert.deepStrictEqual([mo.result.moves.length, mo.result.moves[0].binome, mo.result.moves[0].dep], [1, jr[IV.Binome], jdep]);
  }
  quick('edit', mn.id, { values: { 'Family Name': 'Belkacem' } });
  assert(!find('MISSING_NAME'), 'closed once both are real');
  // a new 1st choice is saved either way; a binome that does not take it is named, and nothing moves
  const tag = call('webState').binomes.find(b => b.code === it.binome).tag;
  const dep = ['IT', 'COMM', 'FLER', 'HR'].find(d => !/\ball\b/i.test(tag) && !new RegExp('\\b' + d + '\\b', 'i').test(tag));
  if (dep) {
    const mv = edit(it.code, { '1st Choice': dep });
    assert(new RegExp(it.binome.replace('.', '\\.') + ' does not take ' + dep + ': use Move interviewee').test(mv.messages[0]), mv.messages[0]);
    assert.deepStrictEqual([mv.result.move.binome, mv.result.move.dep, row()[IV.Binome], row()[IV['1st Choice']]], [it.binome, dep, it.binome, dep]);
  }
}

// ---- alert IDs: numbered from the highest one there is (rows deleted by hand never free an ID), and past A-9999 ----
{
  const raise = ids => run(`(function () { var sh = master.getSheetByName('Alerts');
    sh.cells = [sh.cells[0]].concat(${JSON.stringify(ids)}.map(function (id, i) { var r = sh.cells[1].slice(); r[0] = id; r[10] = 'OLD|' + i; return r; }));
    var ctx = loadCtx_(); ctx.alerts.add({ severity: 'INFO', type: 'ODD_VALUE', msg: 'test', key: 'ID-TEST|' + Math.random() }); ctx.alerts.flush();
    return sh.cells[sh.cells.length - 1][0]; })()`);
  assert.strictEqual(raise(['A-0100', 'A-0051']), 'A-0101', 'after A-0001 to A-0050 were deleted');
  assert.strictEqual(raise(['A-9999']), 'A-10000');
}

console.log('QUICK OK');
