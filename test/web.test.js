// Drives every dashboard action through webState/webRun under web-app conditions (no UI, no active sheet)
const assert = require('assert');
const PHOTO = 'https://lh3.googleusercontent.com/a/test=s128-c'; // mockgas Drive.About, sized up by photo_
const { run, call, addRegistrations, backdateAssignments } = require('./seed')();

let st = call('webState');
assert.strictEqual(st.team.total, 0);
assert(st.links.master && st.links.registrationForm, 'links present');

let out = call('webRun', 'importTeam', { link: '' });
assert(/Imported 13 members/.test(out.messages[0]), out.messages[0]);
out = call('webRun', 'importTeam', { link: '' });
assert.deepStrictEqual([out.result.confirm, out.result.existing, out.messages.length], [true, 13, 0], 'asks before replacing');
out = call('webRun', 'importTeam', { link: '', replace: true });
assert(/Imported 13/.test(out.messages[0]));

out = call('webRun', 'newBinome', { emailA: 'a@x.dz', emailB: 'b@x.dz', dryRun: true });
assert(/not locked yet/.test(out.result.errors[0]), 'no new binome before Lock');

out = call('webRun', 'draft');
assert(/Drafted \d+ binomes/.test(out.messages[0]), out.messages[0]);
out = call('webRun', 'lockCheck');
assert(out.result.drafts > 0 && out.result.share === false, 'TEST_MODE (default) means no sharing');
const drafts = out.result.drafts;
{ // Change department on a DRAFT binome: the cell only (no sheet yet, no history); Lock then uses it
  const dr = call('webState').binomes.find(b => b.status === 'DRAFT'), was = run('tagDepts(' + JSON.stringify(dr.tag) + ')');
  const hist = () => run("ss_().getSheetByName('Member Changes') ? ss_().getSheetByName('Member Changes').getLastRow() : 1");
  out = call('webRun', 'binomeTag', { binome: dr.code, depts: ['COMM'] });
  assert.deepStrictEqual([out.messages[0], call('webState').binomes.find(b => b.code === dr.code).tag, hist()], [dr.code + ': ' + dr.tag + ' → COMM', 'COMM', 1]);
  call('webRun', 'binomeTag', { binome: dr.code, depts: was });
}
out = call('webRun', 'lock');
assert(/Locked \d+ binomes/.test(out.messages[0]), out.messages[0]);
st = call('webState');
assert.strictEqual(st.binomes.filter(b => b.status === 'ACTIVE').length, drafts);
assert.strictEqual(call('webRun', 'lockCheck').result.drafts, 0);

// after lock: no more automatic pairing, free members are flagged for the admins instead
assert.strictEqual(st.locked, true);
assert.deepStrictEqual(st.unpaired, [], 'everyone drafted is in a locked binome');
out = call('webRun', 'draft');
assert(/already locked/.test(out.messages[0]), out.messages[0]);
assert.strictEqual(call('webState').binomes.length, st.binomes.length, 'draft refused: no new binomes');
run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,1,6).setValues([['Late Member','late@g.enp.edu.dz','IT','IT',false,'']]);})()");
call('webRun', 'sync');
st = call('webState');
assert.deepStrictEqual(st.unpaired.map(m => m.email), ['late@g.enp.edu.dz']);
assert(st.alerts.some(a => a.type === 'UNPAIRED_MEMBER' && /late@g.enp.edu.dz/.test(a.msg)), 'UNPAIRED_MEMBER alert');
call('webRun', 'sync');
assert.strictEqual(call('webState').alerts.filter(a => a.type === 'UNPAIRED_MEMBER').length, 1, 'no duplicate alert');
run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow(),5).setValue(true);})()");
call('webRun', 'sync');
st = call('webState');
assert.deepStrictEqual([st.unpaired.length, st.alerts.some(a => a.type === 'UNPAIRED_MEMBER')], [0, false], 'Exclude closes it');

// ---- change / swap members after lock ----
{
  const bins = st.binomes, two = bins.filter(b => b.people.length === 2);
  const b1 = two[0], b2 = two[1], solo = bins.find(b => b.people.length === 1);
  const fileOf = b => b.fileUrl.split('/d/')[1];
  const changes = () => run("ss_().getSheetByName('Member Changes') ? ss_().getSheetByName('Member Changes').getLastRow() - 1 : 0");
  const ppl = code => call('webState').binomes.find(b => b.code === code).people.map(p => p.email);
  const leaving = b1.people[0].email;
  out = call('webRun', 'changeMember', { binome: b1.code, outEmail: leaving, inEmail: b2.people[0].email, dryRun: true });
  assert(/already in B\./.test(out.result.errors[0]) && /Swap/.test(out.result.errors[0]), 'someone already in a locked binome is refused');
  out = call('webRun', 'changeMember', { binome: solo.code, outEmail: solo.people[0].email });
  assert(/no member left/.test(out.messages[0]), out.messages[0]);
  out = call('webRun', 'changeMember', { binome: b1.code, outEmail: leaving, inEmail: 'ext@g.enp.edu.dz', dryRun: true });
  assert(/Give the name/.test(out.result.errors[0]), 'outsider needs a name');
  out = call('webRun', 'changeMember', { binome: b1.code, outEmail: leaving, inName: 'Outside Person', inEmail: 'EXT@g.enp.edu.dz', dryRun: true });
  assert.deepStrictEqual([out.result.errors.length, out.messages.length], [0, 0]);
  assert(out.result.warnings.some(w => /outside the OT/.test(w)), out.result.warnings);
  assert.strictEqual(changes(), 0, 'dry run writes nothing');
  // TEST_MODE shares nothing, so the change never touches Drive (a Drive API that is off can't break it)
  run('var __gf = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error("Permission denied while enabling APIs: drive for GCP project 1.") }');
  out = call('webRun', 'changeMember', { binome: b1.code, outEmail: leaving, inName: 'Outside Person', inEmail: 'EXT@g.enp.edu.dz', reason: 'left the club' });
  run('DriveApp.getFileById = __gf');
  assert(/→ Outside Person/.test(out.messages[0]), out.messages[0]);
  assert(ppl(b1.code).includes('ext@g.enp.edu.dz') && !ppl(b1.code).includes(leaving));
  assert(/Outside/.test(run('__files["' + fileOf(b1) + '"].obj.title')), 'file renamed');
  assert(/Outside Person/.test(run('__files["' + fileOf(b1) + '"].obj.sheets[0].notes["1:1"]')), 'file note updated');
  assert.strictEqual(changes(), 1);
  assert.strictEqual(run("ss_().getSheetByName('Member Changes').getRange(2, 10).getValue()"), 'left the club');
  const h0 = call('webState').history[0];
  assert.deepStrictEqual([h0.type, h0.binome, h0.inn, h0.reason, h0.status], ['PERMANENT', b1.code, 'Outside Person', 'left the club', 'DONE'], 'history lists the change');
  assert(/^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(h0.at) && h0.by, 'history carries a formatted time and who did it');
  call('webRun', 'sync');
  assert.deepStrictEqual(call('webState').unpaired.map(m => m.email), [leaving], 'the member who left is flagged, not re-paired');

  out = call('webRun', 'swapMembers', { binomeA: b1.code, emailA: 'ext@g.enp.edu.dz', binomeB: b2.code, emailB: b2.people[0].email });
  assert(out.result.done && out.result.done.length === 2, out.messages[0]);
  assert(ppl(b1.code).includes(b2.people[0].email) && ppl(b2.code).includes('ext@g.enp.edu.dz'), 'swapped');
  assert.strictEqual(changes(), 3);
  out = call('webRun', 'swapMembers', { binomeA: b1.code, emailA: b2.people[0].email, binomeB: b1.code, emailB: b1.people[1].email });
  assert(/two different binomes/.test(out.messages[0]));

  // a binome sheet that can't be opened: refused before anything is written
  const binSh = "ss_().getSheetByName('Binomes')", rowOf = code => run(binSh + ".getDataRange().getValues().findIndex(r => r[0] === '" + code + "') + 1");
  const realId = run(binSh + '.getRange(' + rowOf(solo.code) + ', 9).getValue()');
  run(binSh + '.getRange(' + rowOf(solo.code) + ', 9).setValue("gone")');
  out = call('webRun', 'changeMember', { binome: solo.code, inEmail: leaving, dryRun: true });
  assert(/Cannot edit the sheet/.test(out.result.errors[0]), out.result.errors);
  run(binSh + '.getRange(' + rowOf(solo.code) + ', 9).setValue("' + realId + '")');
  // can open it but not edit it (e.g. an admin the Binome Sheets folder isn't shared with): refused too
  run('__files["' + realId + '"].obj.rename = () => { throw new Error("You do not have permission") }');
  out = call('webRun', 'changeMember', { binome: solo.code, inEmail: leaving, dryRun: true });
  assert(/Cannot edit the sheet/.test(out.result.errors[0]), out.result.errors);
  run('delete __files["' + realId + '"].obj.rename');
  // a swap whose second row write fails leaves both rows as they were
  const before = JSON.stringify([ppl(b1.code), ppl(b2.code)]), nChanges = changes();
  run("var __sv = MockRange.prototype.setValues, __n = 0; MockRange.prototype.setValues = function (v) { if (this.sh.name === 'Binomes' && ++__n === 2) throw new Error('Service unavailable'); return __sv.call(this, v); }");
  assert.throws(() => call('webRun', 'swapMembers', { binomeA: b1.code, emailA: ppl(b1.code)[0], binomeB: b2.code, emailB: ppl(b2.code)[0] }), /Nothing changed/);
  run('MockRange.prototype.setValues = __sv');
  assert.deepStrictEqual([JSON.stringify([ppl(b1.code), ppl(b2.code)]), changes()], [before, nChanges], 'swap rolled back, no history row');

  out = call('webRun', 'changeMember', { binome: solo.code, inEmail: leaving });
  assert(/\(empty seat\) →/.test(out.messages[0]), out.messages[0]);
  call('webRun', 'sync');
  assert.deepStrictEqual(call('webState').unpaired, [], 'placed again: nobody unpaired');
  assert(run('formerMembers_()["' + b1.code + '"].includes("' + leaving + '")'), 'the interview check knows who left');
}

st = call('webState');
st = call('webState');

addRegistrations(12, 3);
out = call('webRun', 'sync');
assert.deepStrictEqual(out.messages, ['Everything is up to date.'], 'Sync now runs no sheet check');
assert.deepStrictEqual(call('webRun', 'integrity', {}).messages, ['Sheet check: 7 of 7 binome sheets checked, 0 problems found.']);
// Sync now again within FORCE_FRESH_S: only sheets Drive calls changed are read (each read is a Sheets API call, 60/min per user)
call('webRun', 'sync');
let apiBefore = run('__apiCalls');
call('webRun', 'sync');
assert.strictEqual(run('__apiCalls') - apiBefore, 0, 'a repeated Sync now reads no sheet read moments ago');
run('__touch(loadCtx_().binomes.filter(function (b) { return b.fileId; })[0].fileId)');
apiBefore = run('__apiCalls');
call('webRun', 'sync');
assert.strictEqual(run('__apiCalls') - apiBefore, 1, 'a sheet Drive calls changed is still read');
// the prefetch's dates: a serial is wall time in the sheet's zone (the mock's +01:00)
assert.strictEqual(run('serialDate_(46321.5, "Africa/Algiers").toISOString()'), '2026-10-26T11:00:00.000Z');
assert.deepStrictEqual(call('webState').alerts.filter(a => /MANUAL_EDIT|INTEGRITY/.test(a.type)), [], 'the script never flags its own writes');
backdateAssignments(3);
call('webRun', 'sync');
st = call('webState');
assert(st.alerts.some(a => a.type === 'NOT_CONTACTED'), 'timing alerts show up');
const reg = Object.keys(st.counts.byStatus).reduce((n, k) => n + (k === 'DUPLICATE' ? 0 : st.counts.byStatus[k]), 0);
assert.strictEqual(reg, 12);
assert.strictEqual(st.interviewees.length, 12);
assert(st.alerts.length > 0 && st.alerts.every(a => a.id && a.severity), 'open alerts listed');
assert(st.binomes.some(b => b.assigned > 0));
assert.strictEqual(st.team.source, '', 'registration responses are never mistaken for a team list');

// ---- temporary cover, linked by interviewee code ----
{
  const ivs = call('webState').interviewees.filter(i => ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status) && i.binome);
  const bin = ivs.find(i => ivs.filter(j => j.binome === i.binome).length >= 2).binome, mine = ivs.filter(i => i.binome === bin).slice(0, 2);
  const b = call('webState').binomes.find(x => x.code === bin), member = b.people[0].email;
  const cb = call('webState').binomes.find(x => x.code !== bin && x.people.length), coverer = cb.people[0];
  const other = ivs.find(i => i.binome !== bin && i.binome !== cb.code);
  // an alert reaches each person once, even if they are admin and cover the same interviewee twice
  run("(function(){ var c = loadCtx_(); c.coverMap = {}; c.coverMap['" + mine[0].code + "'] = ['admin@g.enp.edu.dz', 'admin@g.enp.edu.dz']; __outbox.length = 0;" +
    " c.alerts.add({ severity: 'HIGH', type: 'DEDUP_TEST', code: '" + mine[0].code + "', binome: '" + bin + "', msg: 'dedup-probe', key: 'DEDUP', notifyBinome: true }); c.alerts.flush(); })()");
  assert.strictEqual(run("__outbox.filter(m => m.to === 'admin@g.enp.edu.dz').map(m => m.htmlBody.split('dedup-probe').length - 1).join()"), '1', 'one copy per recipient');
  run("(function(){ var c = loadCtx_(); c.alerts.resolveWhere(function (r) { return r[c.alerts.table.I.Key] === 'DEDUP'; }, 'RESOLVED'); c.alerts.flush(); })()");
  // a binome without a sheet: cover allowed, with a warning that no view access is given
  const binSh2 = "ss_().getSheetByName('Binomes')", brow = run(binSh2 + ".getDataRange().getValues().findIndex(r => r[0] === '" + bin + "') + 1");
  const fid = run(binSh2 + '.getRange(' + brow + ', 9).getValue()');
  run(binSh2 + '.getRange(' + brow + ', 9).setValue("")');
  out = call('webRun', 'addCover', { codes: mine[0].code, inEmail: coverer.email, dryRun: true });
  assert(out.result.errors.length === 0 && out.result.warnings.some(w => /no binome sheet/.test(w)), JSON.stringify(out.result));
  run(binSh2 + '.getRange(' + brow + ', 9).setValue("' + fid + '")');
  out = call('webRun', 'addCover', { codes: 'XX.99', inEmail: coverer.email, dryRun: true });
  assert(/Unknown interviewee code/.test(out.result.errors[0]));
  out = call('webRun', 'addCover', { codes: mine[0].code + 'x, 5' + mine[0].code, inEmail: coverer.email, dryRun: true });
  assert.deepStrictEqual(out.result.errors, ['Unknown interviewee code "' + mine[0].code + 'x".'], 'a suffix is not trimmed to a valid code; "5IT.01" is no code');
  out = call('webRun', 'addCover', { codes: mine[0].code, inEmail: member, dryRun: true });
  assert(/already in/.test(out.result.errors[0]), 'a member cannot cover their own binome');
  out = call('webRun', 'addCover', { codes: mine.map(i => i.code.toLowerCase().replace('.', ' ')).join(', ') + ' ' + other.code, inEmail: coverer.email, outEmail: member, dryRun: true });
  assert(out.result.errors.some(e => /is not in/.test(e)), 'the unavailable member must be in every covered binome: ' + JSON.stringify(out.result.errors));
  out = call('webRun', 'addCover', { codes: mine.map(i => i.code).join(', ') + ', ' + other.code, inEmail: coverer.email, dryRun: true });
  assert.deepStrictEqual([out.result.errors.length, out.result.groups.length], [0, 2], 'grouped per binome');
  assert(out.result.warnings.some(w => /2 binomes/.test(w)));
  out = call('webRun', 'addCover', { codes: mine.map(i => i.code).join(' '), inEmail: coverer.email, outEmail: member, reason: 'exams' });
  assert(/covers .* for /.test(out.messages[0]), out.messages[0]);
  let st2 = call('webState');
  assert.deepStrictEqual(st2.covers.map(c => [c.binome, c.email, c.codes.join(',')]), [[bin, coverer.email, mine.map(i => i.code).join(',')]]);
  assert.deepStrictEqual(call('webState').binomes.find(x => x.code === bin).people, b.people, 'the Binomes row is untouched');
  const hc = st2.history[0];
  assert.deepStrictEqual([hc.type, hc.binome, hc.codes.join(','), hc.reason], ['TEMPORARY', bin, mine.map(i => i.code).join(','), 'exams'], 'history lists the cover, newest first');
  assert(run('coverMap_(loadCtx_())["' + mine[0].code + '"][0]') === coverer.email);
  // the cover person sends the interview form for a covered code: accepted as a member, no MEDIUM alert
  run("ss_().getSheetByName('Interview Responses') || null");
  const ir = run("(function(){ var s = ss_().getSheets().filter(function(x){ return x.formUrl && x.formUrl.indexOf(CONFIG.INTERVIEW_FORM_ID) >= 0; })[0]; return s.name; })()");
  run("ss_().getSheetByName('" + ir + "').cells.push([new Date(), '" + coverer.email + "', '" + bin + "', '" + mine[0].code + "', 'intro', 'IT', 'IT', ''])");
  call('webRun', 'sync');
  const logRow = run("ss_().getSheetByName('Interview Log').getDataRange().getValues().slice(-1)[0]");
  assert.deepStrictEqual([logRow[5], logRow[6]], [mine[0].code, 'OK'], 'cover interview logged OK: ' + logRow[7]);
  st2 = call('webState');
  assert.deepStrictEqual(st2.covers[0].live, [mine[1].code], 'one covered interview left');
  out = call('webRun', 'endCover', { row: st2.covers[0].row });
  assert(/no longer covers/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual(call('webState').covers, []);
  out = call('webRun', 'endCover', { row: st2.covers[0].row });
  assert(/not active any more/.test(out.messages[0]));
  // auto-end: a cover whose interviewee is moved to another binome ends at the next sync
  call('webRun', 'addCover', { codes: mine[1].code, inEmail: coverer.email });
  call('webRun', 'reassign', { code: mine[1].code, binome: other.binome });
  call('webRun', 'sync');
  assert.deepStrictEqual(call('webState').covers, [], 'cover ended by itself');
  assert(/ENDED .*interviews done/.test(run("ss_().getSheetByName('Member Changes').getDataRange().getValues().slice(-1)[0][10]")));
}
st = call('webState');

const iv = st.interviewees[0];
const target = st.binomes.find(b => b.code !== iv.binome && b.status === 'ACTIVE' && (b.tag === 'ALL' || b.tag.includes(iv.code.split('.')[0])));
const __log = console.log, lines = []; console.log = (...x) => lines.push(x.join(' ')); // the action's timing line
try { out = call('webRun', 'reassign', { code: iv.code, binome: target.code }); } finally { console.log = __log; }
const act = lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(x => x && x.at === 'action');
assert.deepStrictEqual(act.map(x => [x.action, x.outcome]), [['reassign', 'ok']], 'one action line');
assert.deepStrictEqual(Object.keys(act[0]), ['at', 'action', 'outcome', 'total', 'lockWait', 'load', 'writes', 'tracker', 'publish', 'snapT', 'mailsSent']);
assert(['lockWait', 'load', 'writes', 'tracker', 'publish'].every(k => act[0][k] >= 0) && act[0].total >= act[0].lockWait + act[0].load + act[0].tracker + act[0].publish, JSON.stringify(act[0]));
assert(/moved to/.test(out.messages[0]), out.messages[0]);
assert.strictEqual(call('webState').interviewees.find(x => x.code === iv.code).binome, target.code);
out = call('webRun', 'reassign', { code: 'XX.99', binome: target.code });
assert(/Unknown code/.test(out.messages[0]));
{ // the move is in Change history (Interviewee Changes); the refused one is not
  const h = call('webState').ivHistory;
  assert.deepStrictEqual([h[0].code, h[0].what, h[0].from, h[0].to, h[0].by], [iv.code, 'Moved', iv.binome, target.code, 'admin@g.enp.edu.dz'], JSON.stringify(h));
  assert(/^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(h[0].at), h[0].at);
  // Schedule fields: times as ms, the zone they are shown in
  const st2 = call('webState'), x = st2.interviewees.find(y => y.code === iv.code);
  assert.deepStrictEqual([st2.settings.tz, typeof x.assignedAt, x.at, x.dept, typeof x.avail], ['Africa/Algiers', 'number', null, iv.code.split('.')[0], 'string'], JSON.stringify(x));
}
{ // Analytics: one row per registration, no phone / Facebook / Discord, birth dates checked
  const an = call('webAnalytics'), r = an.rows.find(y => y.code === iv.code);
  assert.deepStrictEqual([an.v, an.tz, an.rows.length >= call('webState').interviewees.length, r.binome, typeof r.registered], [3, 'Africa/Algiers', true, target.code, 'number']);
  assert(['phone', 'facebook', 'discord'].every(k => !(k in r)) && !/0555\d{6}/.test(JSON.stringify(an)), 'no contact details beyond the email');
  assert(/^2005-03-0\d$/.test(r.birth.date) && !r.birth.suspect && r.birth.guess === '', JSON.stringify(r.birth));
}

{ // Delete an application: gone from the Master, its binome sheet and Registration Responses; its code is never reused
  const num = c => Number(c.split('.')[1]);
  const its = call('webState').interviewees.filter(x => x.code.startsWith('IT.') && x.binome).sort((a, b) => num(b.code) - num(a.code));
  const del = its[0], regRows = () => run("ss_().getSheetByName('Registration Responses').getLastRow()");
  const inSheet = code => run(`(function () { var ctx = loadCtx_(); return findFileRow_(binomeSheet_(ctx, ctx.binByCode[${JSON.stringify(del.binome)}]), ${JSON.stringify(code)}); })()`);
  assert(inSheet(del.code) > 0, 'in its binome sheet before');
  const before = regRows();
  run('__outbox.length = 0');
  out = call('webRun', 'deleteApplication', { code: del.code });
  assert(new RegExp(del.code.replace('.', '\\.') + ' .* deleted everywhere').test(out.messages[0]), out.messages[0]);
  st = call('webState');
  assert(!st.interviewees.some(x => x.code === del.code), 'gone from Interviewees');
  assert.deepStrictEqual([inSheet(del.code), regRows(), run('__outbox.length')], [-1, before - 1, 0], 'out of the sheet and the responses, nobody mailed');
  assert.deepStrictEqual([st.ivHistory[0].code, st.ivHistory[0].what, st.ivHistory[0].from], [del.code, 'Deleted', del.binome]);
  assert.throws(() => call('webRun', 'deleteApplication', { code: del.code }), /Unknown code/, 'twice: unknown');
  // the next IT registration does not get the deleted code, after a sync too (the baseline forgets the deleted row)
  call('webRun', 'sync');
  run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(), 'new.it@g.enp.edu.dz', 'Nadia', 'Kerroum', 'new.it@g.enp.edu.dz', '01/03/2005', '0555999999', 'IT', 'HR'))`);
  call('webRun', 'sync');
  const fresh = call('webState').interviewees.find(x => x.name === 'Nadia Kerroum');
  assert(fresh && num(fresh.code) > num(del.code), 'a new code, not ' + del.code + ': ' + (fresh && fresh.code));
  assert(!call('webState').interviewees.some(x => x.code === del.code), 'not re-imported');
  // an answer without an email below it is keyed by its row number: the deleted one's answer stays, and nothing comes back twice
  run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(), '', 'Sans', 'Mail', '', '01/03/2005', '0555999998', 'IT', 'HR'))`);
  call('webRun', 'sync');
  const count = () => call('webState').interviewees.length, n = count(), rows = regRows();
  out = call('webRun', 'deleteApplication', { code: fresh.code });
  assert(/raw answers stay in the Registration Responses tab/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([regRows(), count()], [rows, n - 1], 'answer kept, interviewee gone');
  call('webRun', 'sync');
  const st3 = call('webState');
  assert.deepStrictEqual([st3.interviewees.length, st3.interviewees.filter(x => x.name === 'Sans Mail').length, st3.interviewees.some(x => x.name === 'Nadia Kerroum')], [n - 1, 1, false], 'nobody imported again');
}

const ids = st.alerts.slice(0, 2).map(a => a.id);
out = call('webRun', 'resolve', { ids });
assert.deepStrictEqual(out.messages, ['2 alert(s) marked as resolved']);
assert(!call('webState').alerts.some(a => ids.includes(a.id)));

run('__outbox.length = 0');
out = call('webRun', 'digest');
assert(/Daily summary sent to admin@g.enp.edu.dz/.test(out.messages[0]));
assert(run('__outbox.some(m => /digest/.test(m.subject))'));

assert(run("__outbox.every(m => m.to === 'admin@g.enp.edu.dz')"), 'TEST_MODE: only admins get email');
assert(run("Object.keys(__files).every(id => (__files[id].editors || []).every(e => e === 'admin@g.enp.edu.dz'))"), 'TEST_MODE: binome files not shared');
out = call('webRun', 'reshare');
assert(/Test mode is on/.test(out.messages[0]), out.messages[0]);
assert(call('webState').settings.testMode === true);
assert(call('webState').settingsAll.length > 10, 'settingsAll listed');
out = call('webRun', 'saveSettings', { values: { HOURS_NOT_CONTACTED: '30', ASSIGNMENTS_OPEN: false, DIGEST_HOUR: 9 } });
assert(/HOURS_NOT_CONTACTED/.test(out.messages[0]) && /run Setup/.test(out.messages[0]), out.messages[0]);
assert(call('webState').settings.assignmentsOpen === false && call('webState').settingsAll.find(s => s.key === 'HOURS_NOT_CONTACTED').value === 30);
assert.throws(() => call('webRun', 'saveSettings', { values: { BALANCE_BY: 'NOPE' } }));
call('webRun', 'saveSettings', { values: { ASSIGNMENTS_OPEN: true } });
run("(function(){var sh=ss_().getSheetByName('Settings'),v=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();v.forEach(function(r,i){if(r[0]==='TEST_MODE')sh.getRange(i+2,2).setValue(false);});_settings=null;})()");
out = call('webRun', 'reshare');
assert(/new share/.test(out.messages[0]), out.messages[0]);
{ // sharing on: the newcomer becomes an editor, the leaver loses edit access
  const b = call('webState').binomes.find(x => x.people.length === 2), id = b.fileUrl.split('/d/')[1], gone = b.people[1].email;
  assert(run('__files["' + id + '"].editors.includes("' + gone + '")'));
  call('webRun', 'changeMember', { binome: b.code, outEmail: gone, inName: 'New Person', inEmail: 'newp@g.enp.edu.dz' });
  assert(run('__files["' + id + '"].editors.includes("newp@g.enp.edu.dz") && !__files["' + id + '"].editors.includes("' + gone + '")'), 'editors follow the change');
  // Drive API off in the Cloud project: the change is saved, the message names the real fix, no warning icon
  run('var __gf = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error("Permission denied while enabling APIs: drive for GCP project 1.") }');
  out = call('webRun', 'changeMember', { binome: b.code, outEmail: 'newp@g.enp.edu.dz', inName: 'Other Person', inEmail: 'other@g.enp.edu.dz' });
  assert(/Google Drive API is off/.test(out.messages[0]), out.messages[0]);
  assert(call('webState').alerts.some(a => a.type === 'FILE_ERROR' && /Drive API is off/.test(a.msg)), 'alert names the Drive API');
  const sheets = run("loadCtx_().binomes.filter(x => x.fileId && x.status !== 'DRAFT').length"); // the set reshareBinomeFiles tries
  out = call('webRun', 'reshare');
  assert(new RegExp(sheets + ' sheet\\(s\\) could not be reached').test(out.messages[0]) && /Drive API is off/.test(out.messages[0]), 'every sheet tried: ' + out.messages[0]);
  run('DriveApp.getFileById = __gf');
  run('__files["' + id + '"].editors = __files["' + id + '"].editors.filter(e => e !== "newp@g.enp.edu.dz")'); // what the admin would do in Drive
  call('webRun', 'reshare');
  // Drive refuses to remove the leaver: reported, and Repair is not offered (it would only add the newcomer and close the alert)
  run('var __gf2 = DriveApp.getFileById; DriveApp.getFileById = fid => Object.assign(__gf2(fid), { removeEditor() { throw new Error("Drive refused") } })');
  out = call('webRun', 'changeMember', { binome: b.code, outEmail: 'other@g.enp.edu.dz', inName: 'Keep Person', inEmail: 'keep@g.enp.edu.dz' });
  run('DriveApp.getFileById = __gf2');
  assert(/could not remove other@g\.enp\.edu\.dz/.test(out.messages[0]), out.messages[0]);
  const kept = call('webState').alerts.find(a => a.type === 'FILE_ERROR' && /could not remove other@/.test(a.msg));
  assert(kept && kept.q && kept.q.repair === '', 'no Repair for a failed removal: ' + JSON.stringify(kept));
  assert(run('__files["' + id + '"].editors.includes("other@g.enp.edu.dz")'), 'Drive kept them: the alert says so');
  run('__files["' + id + '"].editors = __files["' + id + '"].editors.filter(e => e !== "other@g.enp.edu.dz")'); // the admin removes them by hand
  call('webRun', 'resolve', { ids: [kept.id] });
}
{ // sharing on: a cover person gets view-only access for the cover, taken back when it ends
  const iv = call('webState').interviewees.find(i => ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status) && i.binome);
  const id = call('webState').binomes.find(x => x.code === iv.binome).fileUrl.split('/d/')[1];
  call('webRun', 'addCover', { codes: iv.code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
  assert(run('(__files["' + id + '"].viewers || []).includes("standin@g.enp.edu.dz") && !__files["' + id + '"].editors.includes("standin@g.enp.edu.dz")'), 'view-only');
  call('webRun', 'endCover', { row: call('webState').covers[0].row });
  assert(!run('(__files["' + id + '"].viewers || []).includes("standin@g.enp.edu.dz")'), 'access taken back');
  const viewers = () => run('(__files["' + id + '"].viewers || []).filter(e => e === "standin@g.enp.edu.dz").length');
  // access that predates the cover is kept
  run('__files["' + id + '"].viewers.push("standin@g.enp.edu.dz")');
  call('webRun', 'addCover', { codes: iv.code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
  call('webRun', 'endCover', { row: call('webState').covers[0].row });
  assert.strictEqual(viewers(), 1, 'pre-existing view access left alone');
  run('__files["' + id + '"].viewers = []');
  // two covers by the same person in one binome: the access lives until the last one ends
  const two = call('webState').interviewees.filter(i => i.binome === iv.binome && ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status));
  assert(two.length >= 2, 'test data: two pending interviewees in one binome'); {
    call('webRun', 'addCover', { codes: two[0].code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
    call('webRun', 'addCover', { codes: two[1].code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
    let cs = call('webState').covers;
    call('webRun', 'endCover', { row: cs[0].row });
    assert.strictEqual(viewers(), 1, 'kept while another cover still needs it');
    call('webRun', 'endCover', { row: call('webState').covers[0].row });
    assert.strictEqual(viewers(), 0, 'taken back with the last cover (the mark was handed over)');
  }
  // Drive refuses the removal: the cover stops applying at once, the removal is retried each sync until it works
  call('webRun', 'addCover', { codes: iv.code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
  const row = call('webState').covers[0].row;
  run('var __rv = DriveApp.getFileById; DriveApp.getFileById = function (x) { var f = __rv(x); f.removeViewer = function () { throw new Error("Service error: Drive"); }; return f; }');
  out = call('webRun', 'endCover', { row: row });
  assert(/could not be removed yet/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([call('webState').covers.length, viewers()], [0, 1], 'cover over, access still there');
  const status = () => run("ss_().getSheetByName('Member Changes').getRange(" + row + ", 11).getValue()");
  assert.strictEqual(status(), 'ENDING · view access still to remove');
  const revokeAlert = () => call('webState').alerts.some(a => a.type === 'FILE_ERROR' && /could not be removed yet/.test(a.msg));
  call('webRun', 'sync');
  assert(revokeAlert() && viewers() === 1, 'still refused: alert open, access still there');
  run('DriveApp.getFileById = __rv');
  call('webRun', 'sync');
  assert.deepStrictEqual([viewers(), revokeAlert()], [0, false], 'retried: access removed, alert closed');
  assert(/^ENDED .*view access removed/.test(status()), status());
  // auto-end in a sync where Drive fails once then would work: the alert is kept for the next sync, never left open on an ENDED row
  call('webRun', 'addCover', { codes: iv.code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
  const row2 = call('webState').covers[0].row, other = call('webState').binomes.find(x => x.code !== iv.binome && x.status === 'ACTIVE').code;
  run('var __fails = 1; DriveApp.getFileById = function (x) { var f = __rv(x), rv = f.removeViewer; f.removeViewer = function (e) { if (__fails-- > 0) throw new Error("Service error: Drive"); return rv(e); }; return f; }');
  call('webRun', 'reassign', { code: iv.code, binome: other });
  call('webRun', 'sync');
  const st2 = () => run("ss_().getSheetByName('Member Changes').getRange(" + row2 + ", 11).getValue()");
  assert.deepStrictEqual([st2(), revokeAlert()], ['ENDING · view access still to remove', true], 'failed in this sync: alert saved, retry waits');
  call('webRun', 'sync');
  run('DriveApp.getFileById = __rv');
  assert.deepStrictEqual([/^ENDED/.test(st2()), revokeAlert(), viewers()], [true, false, 0], 'next sync: removed, alert closed');
}
// ---- Phase D: hand edits against the baseline, odd values, full check of the binome sheets ----
{
  const J = JSON.stringify;
  const ivRows = () => run("ss_().getSheetByName('Interviewees').getDataRange().getValues().slice(1)");
  const IVI = run('idx_(IV_H)');
  const ivRow = code => ivRows().find(r => r[IVI.Code] === code);
  const ivSet = (code, col, v) => run(`(function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(code)}) sh.getRange(i+1,${IVI[col] + 1}).setValue(${J(v)});})()`);
  const open = type => call('webState').alerts.filter(a => a.type === (type || 'MANUAL_EDIT'));
  const fix = (mode, ids) => call('webRun', 'edit' + mode, { ids: ids });
  const fileOf = code => call('webState').binomes.find(b => b.code === code).fileUrl.split('/d/')[1];
  const fileCodes = code => run(`__files[${J(fileOf(code))}].obj.sheets[0].cells.slice(1).map(function(r){return r[BFI.Code];}).filter(String)`);
  const BI = run('idx_(BIN_H)');
  const binSet = (code, col, v) => run(`(function(){var sh=ss_().getSheetByName('Binomes'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][0]===${J(code)}) sh.getRange(i+1,${BI[col] + 1}).setValue(${J(v)});})()`);
  const active = call('webState').binomes.filter(b => b.status === 'ACTIVE');
  const ivs = call('webState').interviewees.filter(x => x.status === 'ASSIGNED');

  // an interviewee moved by hand in the Interviewees tab: flagged, then Apply moves the sheet rows properly
  const x = ivs[0], to = active.find(b => b.code !== x.binome);
  ivSet(x.code, 'Binome', to.code);
  call('webRun', 'sync');
  let a = open().find(e => e.code === x.code);
  assert(a && /moved from .* by hand/.test(a.msg) && J(a.fix) === J(['apply', 'revert', 'accept']), J(open()));
  assert(fileCodes(x.binome).includes(x.code) && !fileCodes(to.code).includes(x.code), 'the sheets were not touched');
  out = fix('Apply', [a.id]);
  assert(/moved to/.test(out.messages[0]), out.messages[0]);
  assert(!fileCodes(x.binome).includes(x.code) && fileCodes(to.code).includes(x.code), 'Apply moved the sheet row');
  call('webRun', 'sync');
  assert.deepStrictEqual(open(), [], 'applied: nothing left to flag');

  // a hand edit typed while a sync runs is kept, not overwritten, and flagged at the next sync
  const h = ivs[3], hTo = active.find(b => b.code !== h.binome);
  run(`var __pull = pullBinomeFiles_; pullBinomeFiles_ = function (c, f) { (function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(h.code)}) sh.getRange(i+1,${IVI.Binome + 1}).setValue(${J(hTo.code)});})(); return __pull(c, f); }`);
  call('webRun', 'sync');
  run('pullBinomeFiles_ = __pull');
  assert.strictEqual(ivRow(h.code)[IVI.Binome], hTo.code, 'the edit made during the sync was overwritten');
  call('webRun', 'sync');
  a = open().find(e => e.code === h.code);
  assert(a && /moved from .* by hand/.test(a.msg), J(open()));
  fix('Revert', [a.id]);
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRow(h.code)[IVI.Binome], open().length], [h.binome, 0], 'reverted');

  // a row deleted while a sync runs stays deleted (not written back from memory) and is flagged at the next sync
  const n1 = ivRows().length;
  run(`var __pull = pullBinomeFiles_; pullBinomeFiles_ = function (c, f) { (function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(h.code)}) { sh.deleteRow(i+1); return; }})(); return __pull(c, f); }`);
  call('webRun', 'sync');
  run('pullBinomeFiles_ = __pull');
  assert.deepStrictEqual([ivRows().length, !!ivRow(h.code)], [n1 - 1, false], 'the row deleted during the sync came back');
  call('webRun', 'sync');
  a = open().find(e => e.code === h.code);
  assert(a && /deleted from the Interviewees tab/.test(a.msg), J(open()));
  fix('Revert', [a.id]);
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRows().length, ivRow(h.code)[IVI.Binome], open().length], [n1, h.binome, 0], 'restored');

  // a status typed by hand is put back (it is computed), a cleared binome is put back instead of re-assigned
  const y = ivs[1];
  ivSet(y.code, 'Status', 'INTERVIEWED'); ivSet(y.code, 'Binome', '');
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRow(y.code)[IVI.Status], ivRow(y.code)[IVI.Binome], open().length], ['ASSIGNED', y.binome, 0], 'both put back, nothing left open');
  assert(fileCodes(y.binome).includes(y.code));

  // a name edited in the Interviewees tab: one MANUAL_EDIT, no INTEGRITY alert for the name on top (an unrelated Email
  // change in the sheet is still raised); Apply copies name and email to the sheet
  const p = ivs[4];
  ivSet(p.code, 'First Name', 'Renamed');
  run(`(function(){var c=__files[${J(fileOf(p.binome))}].obj.sheets[0].cells,F=BFI;
    for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(p.code)}) c[i][F.Email]='other@g.enp.edu.dz';})()`);
  call('webRun', 'integrity', {});
  a = open().find(e => e.code === p.code && e.type === 'MANUAL_EDIT');
  assert(a && /Name\/email of/.test(a.msg) && a.fix.includes('apply'), J(open()));
  const ig4 = open('INTEGRITY').filter(e => e.code === p.code);
  assert(ig4.length === 1 && /: Email in its sheet differ/.test(ig4[0].msg), 'only the Email mismatch: ' + J(ig4));
  fix('Apply', [a.id]);
  call('webRun', 'integrity', {});
  assert.deepStrictEqual([open().length, open('INTEGRITY').length], [0, 0], 'applied: nothing open');
  assert(run(`__files[${J(fileOf(p.binome))}].obj.sheets[0].cells.some(function(r){return r[BFI.Code]===${J(p.code)} && r[BFI['First Name']]==='Renamed';})`), 'copied to the sheet');

  // a row deleted by hand is not re-imported with a new code; Revert restores it, Accept forgets it for good
  const n0 = ivRows().length, del = code => run(`(function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(code)}) { sh.deleteRow(i+1); return; }})()`);
  const z = ivs[2], zAt = () => ivRow(z.code)[IVI['Assigned At']].toISOString(), assignedAt = zAt();
  // an interviewed candidate: Revert keeps the interview too (Submitted At, Log Row, Screening)
  run(`(function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(z.code)}) { sh.getRange(i+1,${IVI['Interview Submitted At']+1}).setValue(new Date(2026,9,1,10,0)); sh.getRange(i+1,${IVI['Interview Log Row']+1}).setValue(7); sh.getRange(i+1,${IVI.Screening+1}).setValue('checked'); return; }})()`);
  call('webRun', 'sync');
  const zKeep = () => { const r = ivRow(z.code); return [r[IVI['Interview Submitted At']].getTime(), r[IVI['Interview Log Row']], r[IVI.Screening], r[IVI.Status]]; }, kept = zKeep();
  assert.strictEqual(kept[3], 'INTERVIEWED');
  del(z.code);
  call('webRun', 'sync');
  a = open().find(e => e.code === z.code);
  assert(a && /deleted from the Interviewees tab/.test(a.msg), J(open()));
  assert.strictEqual(ivRows().length, n0 - 1, 'not re-imported under a new code');
  out = fix('Revert', [a.id]);
  assert(/restored/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([ivRows().length, ivRow(z.code)[IVI.Binome]], [n0, z.binome], 'same code, same binome');
  assert.strictEqual(zAt(), assignedAt, 'Assigned At kept');
  assert.deepStrictEqual(zKeep(), kept, 'interview fields kept');
  del(z.code);
  call('webRun', 'sync');
  fix('Accept', [open().find(e => e.code === z.code).id]);
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRows().length, open().length], [n0 - 1, 0], 'accepted: stays deleted, never re-imported');
  const acc = call('webState').ivHistory[0];
  assert.deepStrictEqual([acc.code, acc.what, acc.from, acc.to], [z.code, 'Edit accepted', 'Binome: ' + z.binome, 'row deleted'], J(acc));

  // Binomes tab: a member swapped by hand → Apply runs Change members (history row, file title); a tag / code edit → Revert
  const c = active.find(b => b.people.length === 2 && b.code !== to.code);
  const nChanges = run("ss_().getSheetByName('Member Changes').getLastRow()");
  binSet(c.code, 'Member 2', 'Late Member'); binSet(c.code, 'Email 2', 'late@g.enp.edu.dz');
  call('webRun', 'sync');
  a = open().find(e => e.binome === c.code && /Member 2 of/.test(e.msg));
  assert(a && a.severity === 'MEDIUM', J(open()));
  out = fix('Apply', [a.id]);
  assert(/→ Late Member/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(run("ss_().getSheetByName('Member Changes').getLastRow()"), nChanges + 1, 'logged like a Change members');
  assert(/Late/.test(run(`__files[${J(fileOf(c.code))}].obj.title`)), 'file renamed');
  call('webRun', 'sync');
  assert.deepStrictEqual(open(), [], 'applied, and brought in by Change members: not "missing from Team"');
  binSet(c.code, 'Tag', c.tag === 'ALL' ? 'IT & HR' : 'ALL'); binSet(c.code, 'Binome', 'B.99');
  call('webRun', 'sync');
  const ed = open();
  assert.deepStrictEqual(ed.map(e => e.severity).sort(), ['HIGH', 'MEDIUM'], J(ed));
  out = fix('Revert', ed.map(e => e.id));
  assert.strictEqual(out.messages[0].split('\n').length, 2, out.messages[0]);
  call('webRun', 'sync');
  const back = call('webState').binomes.find(b => b.code === c.code);
  assert.deepStrictEqual([!!back, back && back.tag, open().length], [true, c.tag, 0], 'code and tag back, nothing open');
  // a Binomes row deleted by hand: Revert rebuilds it, Created date included
  const binRow = () => run(`(function(){var d=ss_().getSheetByName('Binomes').getDataRange().getValues();for(var i=1;i<d.length;i++) if(d[i][0]===${J(c.code)}) return d[i];})()`);
  const created = run(`(function(){var d=ss_().getSheetByName('Binomes').getDataRange().getValues();for(var i=1;i<d.length;i++) if(d[i][0]===${J(c.code)}) return d[i][${BI.Created}].toISOString();})()`);
  run(`(function(){var sh=ss_().getSheetByName('Binomes'),d=sh.getDataRange().getValues();for(var i=1;i<d.length;i++) if(d[i][0]===${J(c.code)}) { sh.deleteRow(i+1); return; }})()`);
  call('webRun', 'sync');
  a = open().find(e => e.binome === c.code && /deleted from the Binomes tab/.test(e.msg));
  assert(a && a.severity === 'HIGH', J(open()));
  fix('Revert', [a.id]);
  assert.strictEqual(run(`(function(){var d=ss_().getSheetByName('Binomes').getDataRange().getValues();for(var i=1;i<d.length;i++) if(d[i][0]===${J(c.code)}) return d[i][${BI.Created}].toISOString();})()`), created, 'Created kept');
  assert(binRow(), 'row back');
  call('webRun', 'sync');
  assert.deepStrictEqual(open(), [], 'restored: nothing open');
  binSet(c.code, 'Status', 'PAUSED');
  call('webRun', 'sync');
  assert.strictEqual(open().length, 0, 'ACTIVE ↔ PAUSED is taken as intended');
  binSet(c.code, 'Status', 'ACTIVE');
  call('webRun', 'sync');

  // Change department (Binomes › ⋯ › Change department…): preview, refusals, then the tag, the sheet's house, the history, no
  // manual-edit alert, and the routing; a Tag typed by hand gets Apply, which does the same
  {
    const pending = code => call('webState').interviewees.filter(v => v.binome === code && /^(ASSIGNED|CONTACTED|SCHEDULED)$/.test(v.status));
    const d = active.find(b => b.tag !== 'FLER' && pending(b.code).length);
    const tagOf = code => call('webState').binomes.find(b => b.code === code).tag;
    const nCh = () => run("ss_().getSheetByName('Member Changes').getLastRow()");
    const banner = () => run(`__files[${J(fileOf(d.code))}].obj.sheets[0].cells[7][0]`);
    const tag = (depts, more) => call('webRun', 'binomeTag', Object.assign({ binome: d.code, depts: depts }, more));
    assert(/not found/.test(call('webRun', 'binomeTag', { binome: 'B.98', depts: ['IT'], dryRun: true }).result.errors[0]));
    assert(/at least one department/.test(tag([], { dryRun: true }).result.errors[0]));
    assert(/Unknown department: XX/.test(tag(['IT', 'xx'], { dryRun: true }).result.errors[0]));
    const n0 = nCh();
    out = tag(['fler'], { dryRun: true });
    const stranded = pending(d.code).filter(v => !/^FLER\./.test(v.code)).map(v => v.code).sort();
    assert(stranded.length, 'the test needs interviewees the new tag no longer covers');
    assert.deepStrictEqual([out.result.errors, out.result.from, out.result.to, out.result.stranded.map(x => x.code).sort(), out.messages],
      [[], d.tag, 'FLER', stranded, []], J(out));
    assert(out.result.stranded.every(x => x.name && x.dept !== 'FLER'), J(out.result.stranded));
    assert.deepStrictEqual([tagOf(d.code), nCh()], [d.tag, n0], 'the dry run writes nothing');
    run(`__files[${J(fileOf(d.code))}].obj.rename = () => { throw new Error("You do not have permission") }`);
    assert(/Cannot edit the sheet/.test(tag(['FLER']).messages[0]), 'a sheet the admin cannot edit: refused');
    run(`delete __files[${J(fileOf(d.code))}].obj.rename`);
    assert.deepStrictEqual([tagOf(d.code), nCh()], [d.tag, n0], 'refused: nothing written');

    out = tag(['FLER'], { reason: 'more FLER applicants' });
    assert(/→ FLER/.test(out.messages[0]), out.messages[0]);
    assert.deepStrictEqual([tagOf(d.code), banner(), nCh()], ['FLER', 'Hufflepuff · FLER', n0 + 1], 'tag written, sheet repainted, one history row');
    assert(/\(FLER\)/.test(run(`__files[${J(fileOf(d.code))}].obj.sheets[0].notes["1:1"]`)), 'banner note names the new tag');
    const h = call('webState').history[0];
    assert.deepStrictEqual([h.type, h.binome, h.out, h.inn, h.codes.slice().sort(), h.reason, h.status],
      ['TAG', d.code, d.tag, 'FLER', stranded, 'more FLER applicants', 'DONE'], J(h));
    assert(/already receives FLER/.test(tag(['FLER'], { dryRun: true }).result.errors[0]));
    call('webRun', 'sync');
    assert.deepStrictEqual([open(), tagOf(d.code)], [[], 'FLER'], 'its own write is not a manual edit');
    // the next FLER registration goes to it (every other binome that takes FLER paused for the check)
    const others = call('webState').binomes.filter(b => b.code !== d.code && b.status === 'ACTIVE' && run(`tagDepts(${J(b.tag)})`).includes('FLER'));
    others.forEach(b => binSet(b.code, 'Status', 'PAUSED'));
    run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(), 'fler.route@g.enp.edu.dz', 'Farida', 'Route', 'fler.route@g.enp.edu.dz', '01/03/2005', '0555123987', 'FLER', 'HR'))`);
    call('webRun', 'sync');
    assert.strictEqual(ivRows().find(r => r[IVI.Email] === 'fler.route@g.enp.edu.dz')[IVI.Binome], d.code, 'routed by the new tag');
    others.forEach(b => binSet(b.code, 'Status', 'ACTIVE'));
    call('webRun', 'sync');

    // typed by hand: Apply keeps the typed tag and repaints like the dialog; Revert / Accept stay
    binSet(d.code, 'Tag', 'COMM & HR');
    call('webRun', 'sync');
    a = open().find(e => e.binome === d.code && /Tag of/.test(e.msg));
    assert(a && J(a.fix) === J(['apply', 'revert', 'accept']), J(open()));
    out = fix('Apply', [a.id]);
    assert(/FLER → COMM & HR/.test(out.messages[0]), out.messages[0]);
    assert.deepStrictEqual([tagOf(d.code), banner(), call('webState').history[0].reason], ['COMM & HR', 'Gryffindor · COMM & HR', 'manual edit applied']);
    binSet(d.code, 'Tag', 'ALL');
    assert(/already receives ALL/.test(tag(['IT', 'COMM', 'FLER', 'HR'], { dryRun: true }).result.errors[0]), 'four ticks on an ALL binome change nothing');
    binSet(d.code, 'Tag', 'HR & COMM');
    assert(/already receives HR & COMM/.test(tag(['COMM', 'HR'], { dryRun: true }).result.errors[0]), 'same departments, other spelling: no change');
    binSet(d.code, 'Tag', d.tag);
    call('webRun', 'sync');
    fix('Apply', open().filter(e => e.binome === d.code).map(e => e.id));
    call('webRun', 'sync');
    assert.deepStrictEqual([tagOf(d.code), open()], [d.tag, []], 'back to its first tag, nothing open');
  }

  // Team tab: a duplicated email is flagged, and closes itself once fixed
  run("(function(){var sh=ss_().getSheetByName('Team');sh.appendRow(['Copy','nawel@g.enp.edu.dz','IT','IT',false,'']);})()");
  call('webRun', 'sync');
  assert(open().some(e => /twice in the Team tab/.test(e.msg) && !e.fix.length), J(open()));
  run("(function(){var sh=ss_().getSheetByName('Team');sh.deleteRow(sh.getLastRow());})()");
  call('webRun', 'sync');
  assert.strictEqual(open().length, 0);

  // odd values typed by the binome: a year typo is flagged to them, and closes once corrected
  const w = call('webState').interviewees.find(v => v.status === 'ASSIGNED' && v.binome === to.code);
  const fileSet = (code, col, v) => run(`(function(){var c=__files[${J(fileOf(to.code))}].obj.sheets[0].cells,F=BFI;
    for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(code)}) c[i][F[${J(col)}]]=${J(v)}; __touch(${J(fileOf(to.code))});})()`);
  // a week ahead, typed with last year's number (a fixed date went stale once it passed)
  const wk = new Date(Date.now() + 7 * 864e5), day = String(wk.getDate()).padStart(2, '0') + '/' + String(wk.getMonth() + 1).padStart(2, '0') + '/';
  fileSet(w.code, 'Contacted', 'Yes'); fileSet(w.code, 'Interview Date', day + (wk.getFullYear() - 1)); fileSet(w.code, 'Interview Time', '14:00');
  call('webRun', 'sync');
  assert(open('ODD_VALUE').some(e => e.code === w.code && /typo in the year/.test(e.msg)), J(open('ODD_VALUE')));
  fileSet(w.code, 'Interview Date', day + wk.getFullYear());
  call('webRun', 'sync');
  assert(!open('ODD_VALUE').some(e => e.code === w.code), 'corrected: closed');

  // an edit Drive has not dated yet: the trigger skips it while the sheet was read recently, re-read once that is REREAD_MINUTES old
  const fid = fileOf(to.code), wTime = () => ivRow(w.code)[IVI['Interview Time']];
  run(`(function(){var c=__files[${J(fid)}].obj.sheets[0].cells,F=BFI;
    for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(w.code)}) c[i][F['Interview Time']]='16:00';})()`);
  run('syncAll()'); // the trigger, not Sync now (which reads every sheet)
  assert.strictEqual(wTime(), '14:00', 'read recently: skipped');
  run(`(function(){var r=JSON.parse(__props.FILE_READ||'{}');r[${J(fid)}]=Date.now()-16*60000;__props.FILE_READ=JSON.stringify(r);})()`);
  run('syncAll()');
  assert.strictEqual(wTime(), '16:00', 'stale: re-read although Drive says unchanged');

  // full check of the sheets: a row missing from a sheet, protection removed, a tab put in front
  const book = `__files[${J(fileOf(to.code))}].obj`;
  run(`${book}.sheets[0].cells = ${book}.sheets[0].cells.filter(function(r){return r[BFI.Code]!==${J(w.code)};})`);
  run(`${book}.sheets[0].protections = []`);
  call('webRun', 'integrity', {});
  let ig = open('INTEGRITY').filter(e => e.binome === to.code);
  assert(ig.some(e => e.severity === 'HIGH' && /missing from its sheet/.test(e.msg)) && ig.some(e => /no longer protected/.test(e.msg)), J(ig));
  out = call('webRun', 'reassign', { code: w.code, binome: to.code });
  assert(/put back in the sheet/.test(out.messages[0]), out.messages[0]);
  assert(fileCodes(to.code).includes(w.code));
  run(`${book}.sheets[0].protect()`);
  run(`${book}.sheets.unshift(new MockSheet(${book}, 'Notes'))`);
  call('webRun', 'integrity', {});
  ig = open('INTEGRITY').filter(e => e.binome === to.code);
  assert(ig.length === 1 && /put in front of/.test(ig[0].msg), J(ig));
  run(`${book}.sheets.shift()`);
  call('webRun', 'integrity', {});
  assert.deepStrictEqual(open('INTEGRITY'), [], 'all fixed: the check closes its alerts');
  // the cursor is a binome code: if the binome it points to is gone, the check resumes at the next one, never skips it
  run('__props.INTEG_NEXT = "B.035"');
  assert(/0 of 7/.test(run('integrityCheck_(loadCtx_(), 0)')));
  assert.strictEqual(run('__props.INTEG_NEXT'), 'B.04');

  // a move whose target sheet refuses the row: nothing moves, the row stays in the old sheet
  const mv = call('webState').interviewees.find(v => v.status === 'ASSIGNED' && v.binome !== to.code);
  // a declined or duplicate row is refused before anything is written (its binome would interview someone the Master keeps out)
  ['DECLINED', 'DUPLICATE'].forEach(s => {
    const why = run(`(function(){var ctx=loadCtx_();ctx.ivByCode[${J(mv.code)}][ctx.iv.I.Status]=${J(s)};try{return moveInterviewee_(ctx,${J(mv.code)},${J(to.code)});}catch(e){return e.message;}})()`);
    assert.strictEqual(why, mv.code + ' is ' + s.toLowerCase() + ': restore it first.');
    assert(!fileCodes(to.code).includes(mv.code), 'not written into ' + to.code);
  });
  run(`var __ap = appendToBinomeFile_; appendToBinomeFile_ = function (c, b, r, carry) { if (b.code === ${J(to.code)}) throw new Error('quota'); return __ap(c, b, r, carry); }`);
  out = call('webRun', 'reassign', { code: mv.code, binome: to.code });
  run('appendToBinomeFile_ = __ap');
  assert(/Nothing moved/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([ivRow(mv.code)[IVI.Binome], fileCodes(mv.binome).includes(mv.code), fileCodes(to.code).includes(mv.code)], [mv.binome, true, false]);

  // the rollback fails too: the row is in neither sheet, so what the binome wrote is kept in the Master and the row can be rebuilt
  const mvFile = `__files[${J(fileOf(mv.binome))}].obj.sheets[0].cells`;
  run(`(function(){var c=${mvFile},F=BFI;for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(mv.code)}) { c[i][F.Contacted]='Yes'; c[i][F.Notes]='call after 18h'; }})()`);
  run('appendToBinomeFile_ = function () { throw new Error("quota"); }');
  out = call('webRun', 'reassign', { code: mv.code, binome: to.code });
  run('appendToBinomeFile_ = __ap');
  assert(/missing from both binome sheets/.test(out.messages[0]) && (out.messages[0].match(/quota/g) || []).length === 2, out.messages[0]);
  assert.deepStrictEqual([ivRow(mv.code)[IVI.Binome], ivRow(mv.code)[IVI.Contacted], ivRow(mv.code)[IVI['Binome Notes']], fileCodes(mv.binome).includes(mv.code)],
    [mv.binome, 'Yes', 'call after 18h', false], 'data kept in the Master');
  assert(open('FILE_ERROR').some(e => e.severity === 'HIGH' && e.code === mv.code), 'HIGH alert saved');
  out = call('webRun', 'reassign', { code: mv.code, binome: mv.binome });
  assert(/put back in the sheet/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(run(`(function(){var c=${mvFile},F=BFI;for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(mv.code)}) return c[i][F.Contacted] + '|' + c[i][F.Notes];})()`), 'Yes|call after 18h', 'row rebuilt with its data');
  call('webRun', 'resolve', { ids: open('FILE_ERROR').map(e => e.id) });
  assert.deepStrictEqual(open(), [], 'no hand edits left');

  // the baseline spans several script properties (9 KB each, accents count double) and shrinks cleanly
  run('var __b0 = loadBaseline_(), __n0 = __props.BASELINE_N');
  run(`(function(){ var b = loadBaseline_(); for (var i = 0; i < 400; i++) b.iv['k' + i] = { Code: 'IT.' + i, Binome: 'B.01', Status: 'ASSIGNED',
    'First Name': 'Éloïse Zoé', 'Family Name': 'Bénédicte', Email: 'e' + i + '@g.enp.edu.dz', 'Assigned At': '2026-10-01T08:00:00.000Z', 'Interview Submitted At': '', 'Interview Log Row': '', Screening: '' }; saveBaseline_(b); })()`);
  const n = Number(run('__props.BASELINE_N'));
  assert(n > 3, 'split in ' + n);
  for (let i = 0; i < n; i++) assert(Buffer.byteLength(run('__props.BASELINE_' + i)) <= 9216, 'chunk ' + i + ' fits');
  assert.strictEqual(J(run('loadBaseline_().iv.k399')), J({ Code: 'IT.399', Binome: 'B.01', Status: 'ASSIGNED', 'First Name': 'Éloïse Zoé', 'Family Name': 'Bénédicte', Email: 'e399@g.enp.edu.dz', 'Assigned At': '2026-10-01T08:00:00.000Z', 'Interview Submitted At': '', 'Interview Log Row': '', Screening: '' }));
  assert.strictEqual(run('(function(){ var iv = loadBaseline_().iv; return Object.keys(iv).filter(function(k){ return iv[k] === 0; }).length; })()'), 2, 'the accepted deletion and the deleted application whose answer stayed are remembered');
  run('saveBaseline_(__b0)');
  assert.deepStrictEqual([run('__props.BASELINE_N'), run('"BASELINE_" + (' + n + ' - 1) in __props')], [run('__n0'), false], 'old chunks deleted');
  call('webRun', 'sync');
  assert.deepStrictEqual(open(), [], 'baseline intact after the round trip');
}
// ---- the dashboard served from a cached snapshot (load-test task 5) ----
const shared = st => { const o = Object.assign({}, st); ['user', 'owner', 'updated', 'built', 'pending'].forEach(k => delete o[k]); return o; };
const liveOf = r => shared(JSON.parse(JSON.stringify(r('liveState_(freshCtx_())'))));
{
  const ver = () => call('webPulse'), cached = () => run('readSnap_() !== null');
  call('webRun', 'sync');
  const v0 = ver();
  assert(cached(), 'the sync published the snapshot');
  st = call('webState');
  assert.deepStrictEqual(shared(st), liveOf(run), 'from the cache = a live build');
  assert(/^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(st.updated) && st.user && st.owner === true, 'per-request fields added');
  call('webRun', 'sync');
  assert.strictEqual(ver(), v0, 'a sync with nothing new keeps the version: no screen reloads');

  const regs = x => Object.keys(x.counts.byStatus).reduce((t, k) => t + x.counts.byStatus[k], 0), n = regs(st);
  addRegistrations(1, 0);
  assert.strictEqual(regs(call('webState')), n, 'a hand change shows after the next sync, not before');
  call('webRun', 'sync');
  assert.deepStrictEqual([ver(), regs(call('webState'))], [v0 + 1, n + 1], 'a change: version +1, shown');

  call('webRun', 'changeMember', { binome: st.binomes[0].code, outEmail: st.binomes[0].people[0].email, inName: 'X Y', inEmail: 'xy@g.enp.edu.dz', dryRun: true });
  assert.strictEqual(ver(), v0 + 1, 'a dry run publishes nothing');
  const hour = st.settingsAll.find(x => x.key === 'DIGEST_HOUR').value;
  call('webRun', 'saveSettings', { values: { DIGEST_HOUR: hour === 9 ? 10 : 9 } });
  assert.deepStrictEqual([ver(), call('webState').settingsAll.find(x => x.key === 'DIGEST_HOUR').value], [v0 + 2, hour === 9 ? 10 : 9], 'an action publishes in the same call');
  call('webRun', 'saveSettings', { values: { DIGEST_HOUR: hour } });
  const v1 = ver();

  run('__cacheClear()');
  assert.deepStrictEqual(shared(call('webState')), liveOf(run), 'cache emptied: built live, still right');
  assert(cached() && ver() === v1, 'and published again, with no new version');
  run('__cacheClear(); __lockBusy = true');
  assert.deepStrictEqual(shared(call('webState')), liveOf(run), 'cache emptied and the lock taken: built live without publishing');
  assert(!cached());
  run('__lockBusy = false');
  call('webState');
  run('__lockBusy = true; publishFresh_(); __lockBusy = false');
  assert(!cached() && ver() === v1 + 1, 'an action whose publish finds the lock taken drops the snapshot: screens reload from a live build');
  assert.deepStrictEqual(shared(call('webState')), liveOf(run));
  assert(cached(), 'the next webState publishes it again');
  run('var __old = freshCtx_(); dropSnap_(); publishState_(__old)');
  assert(!cached(), 'a run that loaded before a drop never restores its older snapshot');
  call('webState');
  assert(cached(), 'a fresh read publishes it');
}
{
  // a few hundred interviewees: over 100 KB, so several cache values (Google allows 100 KB each)
  const big = require('./seed')();
  ['importTeam', 'draft', 'lock'].forEach(a => big.call('webRun', a, { link: '' }));
  big.addRegistrations(900, 1);
  big.call('webRun', 'sync');
  const meta = JSON.parse(big.run('__props.SNAP_HASH'));
  assert(big.run('JSON.stringify(buildState_(freshCtx_())).length') > 100 * 1024 && meta.n > 1, 'big state in ' + meta.n + ' chunks');
  assert(big.run('readSnap_() !== null'));
  assert.deepStrictEqual(shared(big.call('webState')), liveOf(big.run), 'round trip through the chunks');
}

// ---- members: their binome only (load-test task 6). Own project, so nothing above leaks in ----
{
  const m = require('./seed')(), J = JSON.stringify;
  ['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
  m.addRegistrations(30, 3);
  m.call('webRun', 'sync');
  m.backdateAssignments(3);
  m.call('webRun', 'sync');
  m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
  const as = e => m.run('__as(' + J(e) + ')');
  const admin = m.call('webState');
  const ivOf = code => admin.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
  const b1 = admin.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 2 && admin.alerts.some(a => a.binome === b.code));
  const b2 = admin.binomes.find(b => b.code !== b1.code && ivOf(b.code).length >= 2);
  assert(b1 && b2, 'two binomes with candidates, one with alerts');
  const mem = b1.people[0].email, partner = b1.people[1].email;
  const tabs = () => m.run('JSON.stringify(master.sheets.map(s => s.cells)) + __outbox.length');
  const fileOf = code => admin.binomes.find(b => b.code === code).fileUrl.split('/d/')[1];
  const roleOn = (code, e) => m.run(`__roleOf(${J(fileOf(code))}, ${J(e)})`);

  // the dashboard follows the binome sheet: in a binome but the sheet isn't shared (TEST_MODE) = no dashboard
  m.run('__acl = true');
  as(mem);
  assert.deepStrictEqual(m.call('webAccess'), { ok: false, role: '', email: mem, reason: 'NOT_SHARED', owner: false, binome: b1.code, cover: false, v: 3, photo: PHOTO });
  assert.throws(() => m.call('webState'), /Not allowed/);
  assert.throws(() => m.call('webPulse'), /Not allowed/);
  // an admin opens the binome: both members, silently, in TEST_MODE; reading it first changes nothing
  as('admin@g.enp.edu.dz');
  const out0 = m.run('__outbox.length'), pub0 = m.run('__props.SNAP_VER');
  const read = m.call('webRun', 'binomeAccess', { binome: b1.code }).result;
  assert.deepStrictEqual([read.level, read.members.map(x => x.email).sort(), read.members.map(x => x.now)], ['', [mem, partner].sort(), ['none', 'none']]);
  assert.strictEqual(m.run('__props.SNAP_VER'), pub0, 'a read neither writes nor republishes');
  const opened = m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
  assert(/its members can now edit their sheet.*No email was sent/.test(opened.messages[0]), opened.messages[0]);
  assert.deepStrictEqual([opened.result.level, opened.result.members.map(x => x.now)], ['edit', ['edit', 'edit']]);
  assert.deepStrictEqual([JSON.parse(m.run('JSON.stringify(__silent)')).sort(), m.run('__notified.length'), m.run('__outbox.length')], [[mem, partner].sort(), 0, out0], 'no Drive email, no mail');
  assert.deepStrictEqual([roleOn(b1.code, mem), roleOn(b1.code, partner)], ['writer', 'writer']);
  assert.strictEqual(m.call('webState').binomes.find(b => b.code === b1.code).access, 'edit', 'the admin snapshot shows the level');
  assert.throws(() => m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'owner' }), /Access must be one of/);
  assert.throws(() => m.call('webRun', 'binomeAccess', { binome: 'B.99', level: 'view' }), /not a locked binome/);

  // a member: their binome, nothing else
  as(mem);
  assert.deepStrictEqual(m.call('webAccess'), { ok: true, role: 'member', email: mem, reason: '', owner: false, binome: b1.code, cover: false, v: 3, photo: PHOTO });
  let st = m.call('webState');
  assert.deepStrictEqual(Object.keys(st).sort(), ['alerts', 'binome', 'candidates', 'cover', 'edit', 'fileUrl', 'fromSheet', 'interviewForm', 'members', 'pausedUntil', 'pending', 'role', 'status', 'tag', 'user', 'v'],
    'no settings, team, history, other binomes or admin lists');
  assert.strictEqual(st.edit, true);
  assert.deepStrictEqual([st.binome, st.role, st.fromSheet, st.candidates.map(c => c.Code).sort()], [b1.code, 'member', false, ivOf(b1.code)]);
  assert(st.candidates.every(c => c.Status && 'Notes' in c && 'Phone' in c && /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(c.Registered)), J(st.candidates[0]));
  assert(st.alerts.length && st.alerts.every(a => ivOf(b1.code).includes(a.code) && ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'ODD_VALUE'].includes(a.type)), J(st.alerts));
  ivOf(b2.code).forEach(c => assert(!J(st).includes('"' + c + '"'), 'nothing of ' + b2.code + ': ' + c));
  assert.strictEqual(typeof m.call('webPulse'), 'number');
  assert.strictEqual(m.run('isAdmin_()'), false);

  // every admin action: Not allowed, and nothing written
  const before = tabs(), props0 = m.run('JSON.stringify(__props)');
  [['sync'], ['integrity'], ['editApply', { ids: ['A-0001'] }], ['editRevert', { ids: ['A-0001'] }], ['editAccept', { ids: ['A-0001'] }],
    ['importTeam', { link: '', replace: true }], ['draft'], ['lockCheck'], ['lock'], ['reshare'], ['resetBinomes', { phrase: m.run('RESET_PHRASE') }], ['digest'],
    ['reassign', { code: ivOf(b1.code)[0], binome: b2.code }], ['changeMember', { binome: b1.code, outEmail: partner, inName: 'X', inEmail: 'x@g.enp.edu.dz' }],
    ['swapMembers', { binomeA: b1.code, emailA: partner, binomeB: b2.code, emailB: b2.people[0].email }], ['newBinome', { emailA: 'a@g.enp.edu.dz', emailB: 'b@g.enp.edu.dz' }],
    ['addCover', { codes: ivOf(b2.code)[0], inEmail: mem }], ['endCover', { row: 2 }], ['quick', { op: 'snooze', ids: ['A-0001'], for: '4h' }],
    ['resolve', { ids: st.alerts.map(a => a.id) }], ['saveSettings', { values: { TEST_MODE: false } }], ['setup'],
    ['binomeAccess', { binome: b2.code, level: 'edit' }], ['binomeAccess', { binome: b1.code }], ['draft', { keep: true }],
    ['draftPair', { emailA: mem, emailB: partner }], ['draftUnpair', { binome: b1.code }], ['teamSet', { email: mem, experienced: true }],
    ['binomeTag', { binome: b1.code, depts: ['FLER'] }]].forEach(([action, args]) =>
    assert.throws(() => m.call('webRun', action, args), /^Error: Not allowed$/, action + ' must be refused'));
  assert.deepStrictEqual([tabs(), m.run('JSON.stringify(__props)')], [before, props0], 'a member changed nothing');

  // an ENP account in no binome; an admin who is also a member
  as('nobody@g.enp.edu.dz');
  assert.deepStrictEqual([m.call('webAccess').ok, m.call('webAccess').role], [false, '']);
  assert.throws(() => m.call('webState'), /Not allowed/);
  assert.throws(() => m.call('webPulse'), /Not allowed/);
  assert(!('member' in (as('admin@g.enp.edu.dz'), m.call('webState'))), 'an admin in no binome gets no My binome');
  assert(!('bv' in m.call('webPulse', true)), 'nor a binome version');
  m.run('master.addEditor(' + J(partner) + ')'); as(partner);
  {
    // an admin in a binome (docs/interview-form.md part 1): the dashboard plus their binome, with member rules
    const ast = m.call('webState'), code = ivOf(b1.code)[0], c = ast.member.candidates.find(x => x.Code === code);
    assert.deepStrictEqual([m.call('webAccess').role, !!ast.settings, ast.member.binome, ast.member.edit, ast.member.cover, ast.member.candidates.map(x => x.Code).sort()],
      ['admin', true, b1.code, true, false, ivOf(b1.code)], 'an editor of the Master is an admin, and their binome comes along');
    const pulse = m.call('webPulse', true);
    assert.deepStrictEqual(Object.keys(pulse).sort(), ['bv', 'pending', 'v']);
    m.run('var __dfg0 = Drive.Files.get, __dfgN = 0; Drive.Files.get = function () { __dfgN++; return __dfg0.apply(this, arguments); }');
    m.call('webPulse', true);
    assert.strictEqual(m.run('__dfgN'), 0, 'the 2 s poll makes no Drive call');
    m.run('Drive.Files.get = __dfg0');
    m.run('Drive.Files.get = () => { throw new Error("API call to drive.files.get failed with error: User Rate Limit Exceeded (403)"); }');
    const hic = m.call('webState');
    assert.deepStrictEqual([!!hic.settings, hic.member], [true, false], 'a Drive hiccup: the dashboard, and member false (the page keeps the last one)');
    m.run('Drive.Files.get = __dfg0');
    assert.deepStrictEqual(m.call('webRun', 'memberSet', { code: code, field: 'Rating', value: 6, seen: c.Rating }).result, { code: code, field: 'Rating', value: 6 });
    assert.strictEqual(m.call('webPulse', true).bv, pulse.bv + 1, "their own save moves bv, as a partner's would");
    const ap = m.call('webApply', { v: 1, changes: [{ id: 'f1', kind: 'field', code: code, field: 'Rating', value: '', seen: 6, at: Date.now() }] });
    assert.deepStrictEqual(ap.results.map(r => r.end), ['applied'], 'a pending field change applies for them too: ' + J(ap));
    assert.strictEqual(m.call('webState').member.candidates.find(x => x.Code === code).Rating, '');
    // view access only: read-only, and both save paths refuse
    m.run(`__files[${J(fileOf(b1.code))}].editors = __files[${J(fileOf(b1.code))}].editors.filter(e => e !== ${J(partner)}); __files[${J(fileOf(b1.code))}].viewers = [${J(partner)}]`);
    assert.strictEqual(m.call('webState').member.edit, false);
    assert.throws(() => m.call('webRun', 'memberSet', { code: code, field: 'Rating', value: 6, seen: '' }), /can view your binome sheet but not edit it/);
    const ap2 = m.call('webApply', { v: 1, changes: [{ id: 'f2', kind: 'field', code: code, field: 'Rating', value: 6, seen: '', at: Date.now() }] });
    assert.deepStrictEqual([ap2.results[0].end, /members/.test(ap2.results[0].reason)], ['dropped', true], J(ap2));
    // no access at all: no My binome, still the dashboard
    m.run(`__files[${J(fileOf(b1.code))}].viewers = []`);
    const none = m.call('webState');
    assert.deepStrictEqual([!!none.settings, 'member' in none], [true, false]);
    assert.throws(() => m.call('webRun', 'memberSet', { code: code, field: 'Rating', value: 6, seen: '' }), /^Error: Not allowed$/);
    m.run(`__files[${J(fileOf(b1.code))}].editors.push(${J(partner)})`);
  }
  m.run('__files[master.id].editors = __files[master.id].editors.filter(e => e !== ' + J(partner) + ')');

  // only the binome whose slice changed gets a new version; a quiet sync rewrites nothing
  as('admin@g.enp.edu.dz');
  const vers = () => JSON.parse(m.run('__props.SNAP_BIN'));
  const v0 = vers(), code1 = ivOf(b1.code)[0];
  m.run(`(function(){var c=__files[${J(fileOf(b1.code))}].obj.sheets[0].cells; for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(code1)}) c[i][BFI.Notes]='called twice'; __touch(${J(fileOf(b1.code))});})()`);
  m.run('var __mm = 0, __spc = savePropChunks_; savePropChunks_ = function (n, s) { if (n === "MEMBER_MAP") __mm++; return __spc(n, s); }');
  m.call('webRun', 'sync');
  const v1 = vers();
  assert.deepStrictEqual([v1[b1.code].v, v1[b2.code].v, m.run('__mm')], [v0[b1.code].v + 1, v0[b2.code].v, 0], 'B1 +1, B2 kept, MEMBER_MAP not rewritten');
  as(mem);
  assert.deepStrictEqual([m.call('webPulse'), m.call('webState').candidates.find(c => c.Code === code1).Notes], [v1[b1.code].v, 'called twice']);

  // cache empty: rebuilt from their own sheet; not shared: a clear error
  m.run('__cacheClear()');
  // members can't open the Master (load-test run 3, 2026-10-19): every read below runs with it refused
  m.run('var __mgo = SpreadsheetApp.openById, __mga = SpreadsheetApp.getActive; SpreadsheetApp.getActive = () => null; SpreadsheetApp.openById = id => { if (id === __props.MASTER_ID) throw new Error("Exception: You do not have permission to access the requested document."); return __mgo.call(SpreadsheetApp, id); }; _settings = null; _ssOpened = null');
  st = m.call('webState');
  assert.deepStrictEqual([st.fromSheet, st.candidates.map(c => c.Code).sort(), st.candidates.find(c => c.Code === code1).Notes, st.alerts], [true, ivOf(b1.code), 'called twice', []]);
  m.run('var __obi = SpreadsheetApp.openById; SpreadsheetApp.openById = id => { if (id !== __props.MASTER_ID) throw new Error("You do not have permission"); return __obi.call(SpreadsheetApp, id); }');
  assert.throws(() => m.call('webState'), /Your binome sheet isn't shared with you yet\./);
  m.run('SpreadsheetApp.openById = __obi');
  // load-test run 1 (2026-10-19): openById answered, the first read behind it was refused: one refusal is retried; one that stays gives
  // the same clear answer, never Google's own text
  m.run('var __refused = 1; SpreadsheetApp.openById = id => { const b = __obi.call(SpreadsheetApp, id); if (id === __props.MASTER_ID) return b; const o = Object.create(b); o.getSheets = () => { if (__refused-- > 0) throw new Error("You do not have permission to access the requested document."); return b.getSheets(); }; return o; }');
  assert.strictEqual(m.call('webState').fromSheet, true, 'one refused read is retried');
  m.run('__refused = 99');
  assert.throws(() => m.call('webState'), /Your binome sheet isn't shared with you yet\./, 'a read that stays refused never shows Google text');
  m.run('SpreadsheetApp.openById = __mgo; SpreadsheetApp.getActive = __mga; _settings = null; _ssOpened = null');

  // load-test task 10: the owner drops one binome's cached slice, so its members read their sheet (the read above) until the next sync
  as('admin@g.enp.edu.dz'); m.call('webRun', 'sync');
  as(mem);
  const pvd = m.call('webPulse');
  assert.strictEqual(m.call('webState').fromSheet, false, 'cached before the drop');
  assert.throws(() => m.call('webRun', 'dropSlice', { binome: b1.code }), /Not allowed/, 'not for members');
  as('admin@g.enp.edu.dz');
  const vd = m.run('__props.SNAP_VER');
  assert.deepStrictEqual(m.call('webRun', 'dropSlice', { binome: b1.code }).result, { binome: b1.code, v: pvd + 1 });
  assert.strictEqual(m.run('__props.SNAP_VER'), vd, 'no publish after it (one would put the slice back), and admins keep their screens');
  assert.throws(() => m.call('webRun', 'dropSlice', { binome: 'B.99' }), /No cached slice for B\.99/);
  as(mem);
  assert.deepStrictEqual([m.call('webPulse'), m.call('webState').fromSheet], [pvd + 1, true], 'the pulse moves and the next refresh reads the sheet');
  as('admin@g.enp.edu.dz'); m.call('webRun', 'sync');
  as(mem);
  assert.strictEqual(m.call('webState').fromSheet, false, 'the next sync republishes it');
  m.run('master.addEditor("other.admin@g.enp.edu.dz")'); as('other.admin@g.enp.edu.dz');
  assert.throws(() => m.call('webRun', 'dropSlice', { binome: b1.code }), /Only the owner/, 'an admin who is not the owner cannot');
  m.run('__files[master.id].editors = __files[master.id].editors.filter(e => e !== "other.admin@g.enp.edu.dz")');
  as('admin@g.enp.edu.dz');
  m.run('var __S0 = S_; S_ = () => Object.assign({}, __S0(), { TEST_MODE: false })');
  assert.throws(() => m.call('webRun', 'dropSlice', { binome: b1.code }), /Only in TEST_MODE/, 'never with TEST_MODE off');
  m.run('S_ = __S0');

  // a cover sees only the codes they cover
  as('admin@g.enp.edu.dz');
  m.call('webRun', 'addCover', { codes: ivOf(b2.code)[0], inEmail: 'stand.in@g.enp.edu.dz', inName: 'Stand In' });
  as('stand.in@g.enp.edu.dz');
  assert.strictEqual(m.call('webAccess').reason, 'NOT_SHARED', 'a cover too needs their view access to the sheet');
  m.run(`__files[${J(fileOf(b2.code))}].viewers = ['stand.in@g.enp.edu.dz']`); // shared by hand (TEST_MODE gives covers nothing)
  assert.deepStrictEqual([m.call('webAccess').cover, m.call('webState').candidates.map(c => c.Code), m.call('webState').edit], [true, [ivOf(b2.code)[0]], false]);
  m.run('__cacheClear()');
  assert.deepStrictEqual(m.call('webState').candidates.map(c => c.Code), [ivOf(b2.code)[0]], 'from the sheet too');
  // an admin who is a live cover: a read-only slice of the covered codes
  m.run('master.addEditor("stand.in@g.enp.edu.dz")');
  const cst = m.call('webState');
  assert.deepStrictEqual([!!cst.settings, cst.member.cover, cst.member.edit, cst.member.candidates.map(c => c.Code)], [true, true, false, [ivOf(b2.code)[0]]]);
  assert.throws(() => m.call('webRun', 'memberSet', { code: ivOf(b2.code)[0], field: 'Contacted', value: 'Yes', seen: 'Not yet' }), /^Error: Not allowed$/, 'a cover is read-only');
  m.run('__files[master.id].editors = __files[master.id].editors.filter(e => e !== "stand.in@g.enp.edu.dz")');

  // members edit their own sheet (load-test task 8)
  {
    const fid = fileOf(b1.code), code2 = ivOf(b1.code)[1];
    const cell = (code, k) => m.run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0], r=sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(k)}));
      var v=r.getValue(); return JSON.stringify([v instanceof Date ? 'Date' : v, r.getDisplayValue()]);})()`);
    const sheet = () => m.run(`JSON.stringify(__files[${J(fid)}].obj.sheets[0].cells)`);
    const set = (code, field, value, seen) => m.call('webRun', 'memberSet', { code, field, value, seen });
    as('admin@g.enp.edu.dz'); m.call('webRun', 'sync'); // a warm slice, published by a sync
    as(mem);
    const c0 = m.call('webState').candidates.find(c => c.Code === code2), pv0 = m.call('webPulse');
    assert.strictEqual(m.call('webState').fromSheet, false);
    assert.deepStrictEqual(set(code2, 'Contacted', 'Yes', c0.Contacted), { messages: [], result: { code: code2, field: 'Contacted', value: 'Yes' } });
    assert.deepStrictEqual(JSON.parse(cell(code2, 'Contacted')), ['Yes', 'Yes'], 'written into their sheet');
    // the partner's next poll: a new version, and the cached slice already holds the value
    as(partner);
    assert.strictEqual(m.call('webPulse'), pv0 + 1);
    st = m.call('webState');
    assert.deepStrictEqual([st.fromSheet, st.candidates.find(c => c.Code === code2).Contacted], [false, 'Yes'], 'patched slice, not a sheet read');
    // an admin action that doesn't pull (a no-op settings save) republishes: the unread write must survive it
    as('admin@g.enp.edu.dz'); m.call('webRun', 'saveSettings', { values: {} });
    as(partner);
    assert.strictEqual(m.call('webState').candidates.find(c => c.Code === code2).Contacted, 'Yes', 'a publish without a pull keeps the dirty slice');

    // every kind of field, typed the way a person would
    assert.deepStrictEqual(set(code2, 'Interview Date', '15/10/2026', c0['Interview Date']).result.value, '15/10/2026');
    assert.deepStrictEqual(JSON.parse(cell(code2, 'Interview Date')), ['Date', '15/10/2026'], 'a real date, not text');
    assert.strictEqual(set(code2, 'Interview Time', '14:30', '').result.value, '14:30');
    assert.strictEqual(set(code2, 'Interview Done', true, false).result.value, true);
    assert.strictEqual(set(code2, 'Rating', '7,5', '').result.value, 7.5);
    assert.strictEqual(set(code2, 'Rating', 8, 7.5).result.value, 8, 'seen as the slice holds it (a number)');
    assert.strictEqual(set(code2, 'Final Affectation', 'IT', '').result.value, 'IT');
    assert.strictEqual(set(code2, 'Notes', '=1+1, called twice', c0.Notes).result.value, '=1+1, called twice');
    assert.deepStrictEqual(JSON.parse(cell(code2, 'Notes')), ['=1+1, called twice', '=1+1, called twice'], 'notes stay text');
    assert.strictEqual(set(code2, 'Interview Date', '', '15/10/2026').result.value, '', 'a date can be cleared');
    // a member can't open the Master (its Settings tab holds TIMEZONE): a date still saves, on the binome sheet's timezone
    m.run('var __sobm = SpreadsheetApp.openById, __sga = SpreadsheetApp.getActive; SpreadsheetApp.getActive = () => null; SpreadsheetApp.openById = id => { if (id === __props.MASTER_ID) throw new Error("Exception: You do not have permission to access the requested document."); return __sobm.call(SpreadsheetApp, id); }; _settings = null; _ssOpened = null');
    assert.strictEqual(set(code2, 'Interview Date', '15/10/2026', '').result.value, '15/10/2026', 'no Master read for a date');
    m.run('SpreadsheetApp.openById = __sobm; SpreadsheetApp.getActive = __sga');
    // a binome sheet in a daylight-saving zone: a day on either side of the change is still that day's local midnight
    m.run(`var __ufd = Utilities.formatDate; Utilities.formatDate = (d, tz, p) => {
      const o = {}; new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', timeZoneName: 'longOffset' })
        .formatToParts(d).forEach(x => { o[x.type] = x.value; });
      return p === 'XXX' ? (o.timeZoneName.replace('GMT', '') || '+00:00') : o.day + '/' + o.month + '/' + o.year; }`);
    assert.deepStrictEqual(JSON.parse(m.run(`JSON.stringify(['15/01/2027', '15/07/2027'].map(s => memberValue_('Interview Date', s, 'Europe/Paris').toISOString()))`)),
      ['2027-01-14T23:00:00.000Z', '2027-07-14T22:00:00.000Z'], 'winter +01:00 and summer +02:00, whatever today is');
    m.run('Utilities.formatDate = __ufd');

    // refused, and nothing written
    const before = sheet();
    [['Contacted', 'Maybe', /Contacted must be one of/], ['Final Affectation', 'MATH', /Final Affectation must be/], ['Rating', 11, /from 0 to 10/],
      ['Rating', 'abc', /from 0 to 10/], ['Interview Done', 'yes', /ticked or not/], ['Interview Date', '31/02/2026', /real date/],
      ['Interview Date', '2026-10-15', /real date/], ['Interview Time', '25:00', /HH:mm/], ['Interview Time', '9:30', /HH:mm/],
      ['Notes', 'x'.repeat(2001), /2,000 characters/], ['Email', 'a@b.dz', /^Error: Not allowed$/], ['Status', 'INTERVIEWED', /^Error: Not allowed$/]]
      .forEach(([field, value, re]) => assert.throws(() => set(code2, field, value, ''), re, field + ' ' + String(value).slice(0, 20)));
    assert.throws(() => set(ivOf(b2.code)[0], 'Contacted', 'Yes', 'Not yet'), /no longer in your binome/, 'a code of another binome');
    // the partner changed the cell meanwhile: CONFLICT with its value, nothing written; Use mine resends with that value as seen
    assert.throws(() => set(code2, 'Contacted', 'No answer', 'Not yet'), /^Error: CONFLICT: Yes$/);
    assert.throws(() => set(code2, 'Rating', 3, 7.5), /^Error: CONFLICT: 8$/);
    assert.throws(() => set(code2, 'Interview Done', false, false), /^Error: CONFLICT: true$/);
    as('stand.in@g.enp.edu.dz');
    assert.throws(() => set(ivOf(b2.code)[0], 'Contacted', 'Yes', 'Not yet'), /^Error: Not allowed$/, 'a cover is read-only');
    as('admin@g.enp.edu.dz');
    assert.throws(() => set(code2, 'Contacted', 'Yes', 'Yes'), /^Error: Not allowed$/, 'admins edit the Master, not through memberSet');
    as('nobody@g.enp.edu.dz');
    assert.throws(() => set(code2, 'Contacted', 'Yes', 'Yes'), /^Error: Not allowed$/);
    as(partner);
    m.run('__docLockBusy = true');
    assert.throws(() => set(code2, 'Contacted', 'No answer', 'Yes'), /^Error: BUSY: /);
    m.run('__docLockBusy = false');
    m.run('var __sobi = SpreadsheetApp.openById; SpreadsheetApp.openById = id => { if (id !== __props.MASTER_ID) throw new Error("You do not have permission"); return __sobi.call(SpreadsheetApp, id); }');
    assert.throws(() => set(code2, 'Contacted', 'No answer', 'Yes'), /isn't shared with you yet/);
    m.run('SpreadsheetApp.openById = __sobi');
    assert.strictEqual(sheet(), before, 'nothing written by any refused edit');
    assert.strictEqual(set(code2, 'Contacted', 'No answer', 'Yes').result.value, 'No answer', 'Use mine');
    m.run('var __gdl = LockService.getDocumentLock; LockService.getDocumentLock = () => null');
    assert.strictEqual(set(code2, 'Contacted', 'Yes', 'No answer').result.value, 'Yes', 'no document lock: the script lock');
    m.run('LockService.getDocumentLock = __gdl');

    // several fields in one call (one Save): each answers on its own; a stale seen or a bad value stops only that field
    const setMany = fields => m.call('webRun', 'memberSet', { code: code2, fields: fields });
    const many = setMany([{ field: 'Contacted', value: 'No answer', seen: 'Yes' }, { field: 'Rating', value: 9, seen: 3 },
      { field: 'Interview Time', value: '16:00', seen: '14:30' }, { field: 'Final Affectation', value: 'MATH', seen: 'IT' }]);
    assert.strictEqual(J(many.result), J({ code: code2, fields: [{ field: 'Contacted', value: 'No answer' }, { field: 'Rating', conflict: '8' },
      { field: 'Interview Time', value: '16:00' }, { field: 'Final Affectation', error: 'Final Affectation must be one of: IT, COMM, FLER, HR, Not accepted, or empty.' }] }));
    assert.deepStrictEqual([cell(code2, 'Contacted'), cell(code2, 'Rating'), cell(code2, 'Interview Time'), cell(code2, 'Final Affectation')].map(c => JSON.parse(c)[1]),
      ['No answer', '8', '16:00', 'IT'], 'the two written, the conflict and the bad value left as they were');
    assert.strictEqual(m.call('webState').candidates.find(c => c.Code === code2).Contacted, 'No answer', 'slice patched');
    assert.throws(() => setMany([{ field: 'Contacted', value: 'Yes', seen: 'No answer' }, { field: 'Email', value: 'a@b.dz', seen: '' }]), /^Error: Not allowed$/,
      'a field members may not edit refuses the whole call');
    assert.throws(() => setMany([]), /^Error: Not allowed$/);
    assert.throws(() => setMany([{ field: 'Contacted', value: 'Yes', seen: 'No answer' }, { field: 'Contacted', value: 'Withdrew', seen: 'No answer' }]), /^Error: Not allowed$/,
      'the same field twice');
    assert.strictEqual(JSON.parse(cell(code2, 'Contacted'))[1], 'No answer', 'nothing written by a refused call');
    const pvBatch = m.call('webPulse');
    assert.strictEqual(J(setMany([{ field: 'Contacted', value: 'Yes', seen: 'No answer' }, { field: 'Interview Time', value: '14:30', seen: '16:00' }]).result.fields),
      J([{ field: 'Contacted', value: 'Yes' }, { field: 'Interview Time', value: '14:30' }]), 'both written back');
    assert.strictEqual(m.call('webPulse'), pvBatch + 1, 'one new version for the whole save, not one per field');

    // opened View: the page is read-only and a write is refused; closed: the dashboard goes at the next poll
    as('admin@g.enp.edu.dz'); m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'view' });
    as(partner);
    assert.strictEqual(m.call('webState').edit, false);
    assert.throws(() => set(code2, 'Contacted', 'Withdrew', 'Yes'), /can view your binome sheet but not edit it/);
    const pv = m.call('webPulse');
    as('admin@g.enp.edu.dz'); m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'none' });
    assert.deepStrictEqual([roleOn(b1.code, mem), roleOn(b1.code, partner)], ['', '']);
    as(partner);
    assert.throws(() => m.call('webPulse'), /Not allowed/);
    assert.strictEqual(m.call('webAccess').reason, 'NOT_SHARED');
    as('admin@g.enp.edu.dz'); m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
    as(partner);
    assert(m.call('webPulse') > pv, 'reopened: a new version, so the page reloads with edit on');
    assert.strictEqual(m.run('__notified.length'), 0, 'never Drive\'s email');
    as('admin@g.enp.edu.dz'); // the sync runs as the trigger's account

    // the next sync reads a dirty sheet even when Drive's "last updated" didn't move, and only then drops the mark
    const ivVal = k => m.run(`(function(){var sh=ss_().getSheetByName('Interviewees'), I=idx_(IV_H); for (var i=1;i<sh.cells.length;i++) if (sh.cells[i][I.Code]===${J(code2)}) return String(sh.cells[i][I[${J(k)}]]);})()`);
    const lag = () => m.run(`(function(){var s=JSON.parse(__props.FILE_SEEN), r=JSON.parse(__props.FILE_READ); s[${J(fid)}]=__files[${J(fid)}].lastUpdated.getTime(); r[${J(fid)}]=Date.now();
      __props.FILE_SEEN=JSON.stringify(s); __props.FILE_READ=JSON.stringify(r);})()`);
    const dirtyAt = m.run(`__cache['dirty:${b1.code}']`), binV = () => JSON.parse(m.run('__props.SNAP_BIN'))[b1.code].v, vw = binV();
    assert(dirtyAt, 'the write marked the binome');
    lag(); m.run(`delete __cache['dirty:${b1.code}']`); m.run('syncAll()');
    assert.deepStrictEqual([ivVal('Contacted'), ivVal('Rating')], ['Not yet', ''], 'control: without the mark, a lagging Drive hides the edit');
    lag(); m.run(`__cache['dirty:${b1.code}'] = ${J(dirtyAt)}`); m.run('syncAll()');
    assert.deepStrictEqual([ivVal('Contacted'), ivVal('Interview Date'), ivVal('Interview Time'), ivVal('Interview Done'), ivVal('Rating'), ivVal('Final Affectation'), ivVal('Binome Notes'), ivVal('Status')],
      ['Yes', '15/10/2026', '14:30', 'true', '8', 'IT', '=1+1, called twice', 'SCHEDULED'], 'the Master has every edit');
    assert.strictEqual(m.run(`'dirty:${b1.code}' in __cache`), false, 'read: the mark goes');
    assert(binV() > vw, 'the slice version went up');
    as(mem);
    assert.strictEqual(m.call('webState').candidates.find(c => c.Code === code2).Status, 'SCHEDULED');
    // a write landing after the read started stays dirty, and its patched slice is kept until a sync reads it
    as('admin@g.enp.edu.dz');
    lag(); m.run(`__cache['dirty:${b1.code}'] = String(Date.now() + 60000)`);
    const meta = m.run('__props.SNAP_BIN');
    m.run('syncAll()');
    assert.strictEqual(m.run(`'dirty:${b1.code}' in __cache`), true, 'a write during the read stays dirty');
    assert.deepStrictEqual(JSON.parse(m.run('__props.SNAP_BIN'))[b1.code], JSON.parse(meta)[b1.code], 'its slice is not republished from an older read');
    m.run(`delete __cache['dirty:${b1.code}']`);
  }

  // review of #30: a quota 403 isn't a revoke; every permissions page is read; a partial failure records nothing; a leaver loses a hand share
  {
    as(partner);
    m.run('var __dfg = Drive.Files.get; Drive.Files.get = () => { throw new Error("API call to drive.files.get failed with error: User Rate Limit Exceeded (403)"); }');
    assert.throws(() => m.call('webPulse'), /User Rate Limit Exceeded/, 'thrown (the page retries quietly), not read as no access');
    m.run('Drive.Files.get = __dfg');
    as('admin@g.enp.edu.dz');
    m.run('__permPage = 1');
    assert.deepStrictEqual(m.call('webRun', 'binomeAccess', { binome: b1.code }).result.members.map(x => x.now), ['edit', 'edit'], 'members on later pages are found');
    m.run('var __pu = Drive.Permissions.update; Drive.Permissions.update = (p, id, pid) => { if (pid.indexOf(' + J(partner) + ') >= 0) throw new Error("Drive refused"); return __pu(p, id, pid); }');
    const bad = m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'view' });
    m.run('Drive.Permissions.update = __pu; __permPage = 0');
    assert.deepStrictEqual([bad.result.errors.length, bad.result.level, /Not done for/.test(bad.messages[0])], [1, 'edit', true], 'the recorded level stays on a partial failure');
    m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
    // a binome never opened from here: its leaver still loses a sheet shared by hand, the newcomer gets nothing
    const out2 = b2.people[0].email;
    m.run(`__files[${J(fileOf(b2.code))}].editors.push(${J(out2)})`);
    m.call('webRun', 'changeMember', { binome: b2.code, outEmail: out2, inName: 'Other Comer', inEmail: 'other.comer@g.enp.edu.dz' });
    assert.deepStrictEqual([roleOn(b2.code, out2), roleOn(b2.code, 'other.comer@g.enp.edu.dz'), m.run('__notified.length')], ['', '', 0]);
    // a removal Drive refuses is reported (a FILE_ERROR alert and the history row), never swallowed
    m.run(`__files[${J(fileOf(b2.code))}].editors.push('other.comer@g.enp.edu.dz')`);
    m.run('var __pr = Drive.Permissions.remove; Drive.Permissions.remove = () => { throw new Error("Drive refused"); }');
    const ch = m.call('webRun', 'changeMember', { binome: b2.code, outEmail: 'other.comer@g.enp.edu.dz', inName: 'Third Comer', inEmail: 'third.comer@g.enp.edu.dz' });
    m.run('Drive.Permissions.remove = __pr');
    assert(/could not remove other\.comer@g\.enp\.edu\.dz from the sheet/.test(ch.messages.join(' ')), ch.messages.join(' '));
    assert(m.call('webState').alerts.some(a => a.type === 'FILE_ERROR' && a.binome === b2.code && /could not remove other\.comer/.test(a.msg)), 'FILE_ERROR alert');
  }

  // removed with Change members: the next poll says Not allowed; Reset all binomes empties the map
  as('admin@g.enp.edu.dz');
  m.call('webRun', 'changeMember', { binome: b1.code, outEmail: mem, inName: 'New Comer', inEmail: 'new.comer@g.enp.edu.dz' });
  as(mem);
  assert.throws(() => m.call('webPulse'), /Not allowed/);
  assert.throws(() => m.call('webRun', 'memberSet', { code: ivOf(b1.code)[0], field: 'Contacted', value: 'Yes', seen: 'Not yet' }), /^Error: Not allowed$/, 'a removed member edits nothing');
  assert.strictEqual(roleOn(b1.code, mem), '', 'the leaver loses the sheet the binome was opened at');
  as('new.comer@g.enp.edu.dz');
  assert.deepStrictEqual([m.call('webState').binome, m.call('webState').edit, roleOn(b1.code, 'new.comer@g.enp.edu.dz')], [b1.code, true, 'writer'],
    'the newcomer gets the binome\'s level at once');
  assert.strictEqual(m.run('__notified.length'), 0);
  as('admin@g.enp.edu.dz');
  m.call('webRun', 'resetBinomes', { phrase: m.run('RESET_PHRASE') });
  assert.deepStrictEqual([m.run('JSON.stringify(savedMemberMap_())'), m.run('__props.BIN_ACCESS')], ['{}', undefined]);
  m.run('__acl = false');
  as(partner);
  assert.throws(() => m.call('webPulse'), /Not allowed/);
}

out = call('webRun', 'setup');
assert(/Setup complete/.test(out.messages[0]), 'setup works without an active spreadsheet');

assert.throws(() => call('webRun', 'nope'), /Unknown action/);
assert.strictEqual(run('_webOut'), null, 'buffer reset after a throw');

// access control: the web app runs as the visitor, so access = can this account edit the Master
// the old web app URL only links to the Vercel dashboard, for anyone (it reads nothing)
assert(/href="https:\/\/vic-recruitment\.vercel\.app" target="_top"/.test(run('doGet()._html')), 'link to the dashboard');
assert(!('switchUrl' in call('webState')), 'no switch-account link any more');
run('var __realSession = Session; var __as = e => { Session = { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }; __as("stranger@g.enp.edu.dz")');
assert.throws(() => call('webState'), /Not allowed/);
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
assert.throws(() => call('webAnalytics'), /Not allowed/, 'Analytics: admins only');
assert.deepStrictEqual(run('JSON.stringify(access_())'), JSON.stringify({ ok: false, role: '', email: 'stranger@g.enp.edu.dz', reason: 'READ_ONLY', owner: false }));
assert(/vic-recruitment\.vercel\.app/.test(run('doGet()._html')), 'the same link page for an account without access');
run('var __open = SpreadsheetApp.openById; SpreadsheetApp.openById = () => { throw new Error("You do not have permission to access the requested document.") }; _ssOpened = null');
assert.strictEqual(run('access_().reason'), 'NO_PROJECT', 'an account that cannot open the Master');
run('SpreadsheetApp.openById = __open; _ssOpened = null');
run('var __drive = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error("No item with the given ID could be found.") }');
assert.strictEqual(run('access_().reason'), 'NO_PROJECT', 'bound Master handed back to an account Drive says has no access → not "view only"');
run('DriveApp.getFileById = __drive');
run('ss_().addEditor("helper@g.enp.edu.dz"); __as("Helper@g.enp.edu.dz")');
assert.strictEqual(call('webState').user, 'Helper@g.enp.edu.dz', 'any editor of the Master gets in, no extra deployment');

// Vercel front (scripts.run): webAccess never throws, domain + owner rules, setup owner-only, trigger owner guard
assert.deepStrictEqual(call('webAccess'), { ok: true, role: 'admin', email: 'helper@g.enp.edu.dz', reason: '', owner: false, binome: '', cover: false, v: 3, photo: PHOTO });
assert.strictEqual(call('webState').owner, false);
assert.throws(() => call('webRun', 'setup'), /Only the owner/, 'an editor cannot run Setup');
assert.throws(() => run('installTriggers_(ss_())'), /triggers belong to admin@g.enp.edu.dz/, 'menu path: a second account cannot double the triggers');
run('ss_().addEditor("someone@gmail.com"); __as("someone@gmail.com")');
assert.deepStrictEqual(call('webAccess'), { ok: false, role: '', email: 'someone@gmail.com', reason: 'DOMAIN', owner: false, binome: '', cover: false, v: 3, photo: PHOTO }, 'non-ENP editor refused');
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
{
  run('__as("stranger@g.enp.edu.dz")');
  assert.strictEqual(call('webAccess').reason, 'READ_ONLY');
}
run('__as("admin@g.enp.edu.dz")');
assert.deepStrictEqual([call('webAccess').owner, call('webState').owner, call('webState').v], [true, true, 3]);
assert.strictEqual(run('__props.TRIGGER_OWNER'), 'admin@g.enp.edu.dz', 'setup records the trigger owner');
const before = run('__triggers.length');
call('webRun', 'setup');
assert.strictEqual(run('__triggers.length'), before + 3, 'owner can reinstall');
run('__props.TRIGGER_OWNER = "helper@g.enp.edu.dz"');
assert.throws(() => call('webRun', 'setup'), /Only the owner/, 'TRIGGER_OWNER wins over the Master owner');
assert.strictEqual(call('webAccess').owner, false, 'the Master owner is not the owner once the triggers belong to someone else');
run('__as("helper@g.enp.edu.dz")');
assert.deepStrictEqual([call('webAccess').owner, call('webState').owner], [true, true], 'the trigger owner is the owner, though only an editor of the Master');
run('__as("admin@g.enp.edu.dz"); __props.TRIGGER_OWNER = "admin@g.enp.edu.dz"');
// handover: property deleted, the club account (not the Master's owner) runs Setup and takes the triggers
run('delete __props.TRIGGER_OWNER; __as("vic.rh@g.enp.edu.dz"); installTriggers_(ss_())');
assert.strictEqual(run('__props.TRIGGER_OWNER'), 'vic.rh@g.enp.edu.dz', 'an editor who is not the Master owner takes the triggers when the property is unset');
run('__as("admin@g.enp.edu.dz")');
run('var __et = ensureTabs_, __etn = 0; ensureTabs_ = function (ss) { __etn++; return __et(ss); }');
const trig0 = run('__triggers.length'), masterId0 = run('__props.MASTER_ID');
run('var __ssPinned = ss_(), __ssReal = ss_; ss_ = function () { return __ssPinned; }; __props.MASTER_ID = "sentinel"'); // setup() rewrites MASTER_ID: a rejected one must not
assert.throws(() => run('setup()'), /triggers belong to vic.rh/, 'Setup from another account stops before changing anything');
assert.deepStrictEqual([run('__etn'), run('__triggers.length'), run('__props.MASTER_ID')], [0, trig0, 'sentinel'], 'rejected before the first setup step ran, no trigger touched, MASTER_ID kept');
run('ensureTabs_ = __et; ss_ = __ssReal'); run('__props.MASTER_ID = ' + JSON.stringify(masterId0));
run('__props.TRIGGER_OWNER = "admin@g.enp.edu.dz"');

// two unpaired members paired into a new locked binome
{
  assert.deepStrictEqual([run('pairTag("IT","HR")'), run('pairTag("HR","COMM")'), run('pairTag("HR","HR")'), run('pairTag("IT","ALL")'), run('pairTag("IT","FLER")')],
    ['IT & HR', 'COMM & HR', 'HR', 'ALL', 'IT & FLER']);
  run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,2,6).setValues([['Free One','free1@g.enp.edu.dz','IT','IT',false,''],['Free Two','free2@g.enp.edu.dz','HR','HR',false,'']]);})()");
  call('webRun', 'sync');
  const n = call('webState').binomes.length, nChanges = run("ss_().getSheetByName('Member Changes').getLastRow()");
  out = call('webRun', 'newBinome', { emailA: 'free1@g.enp.edu.dz', emailB: 'free1@g.enp.edu.dz', dryRun: true });
  assert(/two different/.test(out.result.errors[0]), out.result.errors);
  const placed = call('webState').binomes[0].people[0].email;
  out = call('webRun', 'newBinome', { emailA: 'free1@g.enp.edu.dz', emailB: placed, dryRun: true });
  assert(/not an unpaired/.test(out.result.errors[0]), out.result.errors);
  out = call('webRun', 'newBinome', { emailA: 'free1@g.enp.edu.dz', emailB: 'FREE2@g.enp.edu.dz', dryRun: true });
  assert.deepStrictEqual([out.result.errors, out.result.tag, call('webState').binomes.length], [[], 'IT & HR', n], 'dry run writes nothing');
  out = call('webRun', 'newBinome', { emailA: 'free1@g.enp.edu.dz', emailB: 'free2@g.enp.edu.dz' });
  assert(/created \(IT & HR\): Free One & Free Two/.test(out.messages[0]), out.messages[0]);
  call('webRun', 'sync');
  st = call('webState');
  const nb = st.binomes.find(b => b.code === out.result.done[0].split(' ')[0]);
  assert.deepStrictEqual([st.binomes.length, nb.status, !!nb.fileUrl, st.unpaired.some(m => /free/.test(m.email))], [n + 1, 'ACTIVE', true, false]);
  assert.strictEqual(run("ss_().getSheetByName('Member Changes').getLastRow()"), nChanges + 2, 'one history row per member');
  assert.deepStrictEqual(st.alerts.filter(a => a.type === 'MANUAL_EDIT' || (a.type === 'UNPAIRED_MEMBER' && /free/.test(a.msg))), [], 'not flagged as a hand edit; their unpaired alerts closed');
  // the history write fails after the binome exists: reported, not thrown, and the binome stays valid
  run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,2,6).setValues([['Free Three','free3@g.enp.edu.dz','HR','HR',false,''],['Free Four','free4@g.enp.edu.dz','HR','HR',false,'']]);})()");
  run("var __sv2 = MockRange.prototype.setValues; MockRange.prototype.setValues = function (v) { if (this.sh.name === 'Member Changes') throw new Error('Service unavailable'); return __sv2.call(this, v); }");
  out = call('webRun', 'newBinome', { emailA: 'free3@g.enp.edu.dz', emailB: 'free4@g.enp.edu.dz' });
  run('MockRange.prototype.setValues = __sv2');
  assert(/created \(HR\).*Member Changes history not written/.test(out.messages[0]), out.messages[0]);
  call('webRun', 'sync');
  st = call('webState');
  assert.deepStrictEqual([st.binomes.length, st.unpaired.some(m => /free[34]/.test(m.email))], [n + 2, false]);
  assert(st.alerts.some(a => a.type === 'FILE_ERROR' && /history not written/.test(a.msg)), 'MEDIUM alert for the missing history');
  assert(!st.alerts.some(a => a.type === 'MANUAL_EDIT'), 'baseline still saved');
  // the highest binome's row deleted by hand: its code is not handed out again (its interviewees and the baseline still name it)
  run("(function(){var sh=ss_().getSheetByName('Team');sh.getRange(sh.getLastRow()+1,1,2,6).setValues([['Free Five','free5@g.enp.edu.dz','IT','IT',false,''],['Free Six','free6@g.enp.edu.dz','HR','HR',false,'']]);})()");
  const top = run("(function(){var c=ss_().getSheetByName('Binomes').cells,i=c.length-1,r=c[i];c.splice(i,1);__cut=[i,r];return r[0];})()");
  out = call('webRun', 'newBinome', { emailA: 'free5@g.enp.edu.dz', emailB: 'free6@g.enp.edu.dz', dryRun: true });
  run("ss_().getSheetByName('Binomes').cells.splice(__cut[0], 0, __cut[1])");
  assert.strictEqual(out.result.binome, 'B.' + String(Number(top.split('.')[1]) + 1).padStart(2, '0'), 'not ' + top + ' again');
}
// ---- pairing before Lock: experience, pairs by hand, draw the rest, redraw (launch-features.md, section 1). Own project ----
{
  const p = require('./seed')();
  const E = n => n + '@g.enp.edu.dz';
  // this year's OT list in a tab of the Master: three of the 2025 team (seed DB), six new
  p.run(`master.insertSheet('OT 2026').cells = [["Section","First Name","Last Name","Email"],
    ["HR","Warda","Tebbal","warda@g.enp.edu.dz"],["","Nada","Rahmani","nada@g.enp.edu.dz"],["","Hiba","Saadi","hiba@g.enp.edu.dz"],["","Wafa","Djebbar","wafa@g.enp.edu.dz"],
    ["IT","Nawel","Chikhi","nawel@g.enp.edu.dz"],["","Ilyes","Hamdi","ilyes@g.enp.edu.dz"],["","Omar","Ferhat","omar@g.enp.edu.dz"],
    ["COMM","Nesma","Laribi","nesma@g.enp.edu.dz"],["","Lyna","Toumi","lyna@g.enp.edu.dz"]]`);
  let out = p.call('webRun', 'importTeam', { link: '' });
  assert(/Imported 9 members from "OT 2026"[\s\S]*\n3 marked Experienced \(in the 2025 team\)/.test(out.messages[0]), out.messages[0]);
  const st = () => p.call('webState');
  const exp = () => st().teamList.filter(m => m.experienced).map(m => m.email.split('@')[0]).sort();
  assert.deepStrictEqual(exp(), ['nawel', 'nesma', 'warda'], 'pre-ticked from the 2025 database');
  // by hand, both ways; written in the Team tab's Experienced column
  out = p.call('webRun', 'teamSet', { email: E('nada'), experienced: true });
  assert.deepStrictEqual(out.result, { email: E('nada'), experienced: true, name: 'Nada Rahmani' });
  p.call('webRun', 'teamSet', { email: E('Nesma'), experienced: false });
  assert.deepStrictEqual(exp(), ['nada', 'nawel', 'warda']);
  assert.strictEqual(p.run(`master.getSheetByName('Team').cells.find(r => r[1] === 'nada@g.enp.edu.dz')[TEAM_H.indexOf('Experienced')]`), true);
  assert.throws(() => p.call('webRun', 'teamSet', { email: E('ghost'), experienced: true }), /ghost@g\.enp\.edu\.dz is not in the Team tab/);
  assert.throws(() => p.call('webRun', 'teamSet', { email: E('nada'), experienced: 'yes' }), /true or false/);
  // Lyna excluded and Omar SKIP by hand in the Team tab
  p.run(`master.getSheetByName('Team').cells.forEach(r => { if (r[1] === 'lyna@g.enp.edu.dz') r[4] = true; if (r[1] === 'omar@g.enp.edu.dz') r[3] = 'SKIP'; })`);

  // pairs by hand: a DRAFT row at once, HR member first, tagged like Pair two…
  const rows = () => p.run(`JSON.stringify(master.getSheetByName('Binomes').cells.slice(1).filter(r => r[0]).map(r => [r[0], r[2], r[4], r[5], r[6]]))`);
  const note = r => p.run(`master.getSheetByName('Binomes').notes["${r}:1"] || ''`);
  out = p.call('webRun', 'draftPair', { emailA: E('ilyes'), emailB: E('nada') });
  assert.deepStrictEqual(out.result, { binome: 'B.01', tag: 'IT & HR', warning: '', bothNew: false });
  out = p.call('webRun', 'draftPair', { emailA: E('hiba'), emailB: E('nesma') });
  assert.deepStrictEqual(out.result, { binome: 'B.02', tag: 'COMM & HR', warning: '', bothNew: true });
  out = p.call('webRun', 'draftPair', { emailA: E('nawel'), emailB: E('wafa') });
  assert.deepStrictEqual(JSON.parse(rows()), [['B.01', E('nada'), E('ilyes'), 'IT & HR', 'DRAFT'], ['B.02', E('hiba'), E('nesma'), 'COMM & HR', 'DRAFT'],
    ['B.03', E('wafa'), E('nawel'), 'IT & HR', 'DRAFT']]);
  assert.deepStrictEqual([note(2), note(3), note(4)], ['', '⚠️ Both members are new', '']);
  // a tick changes the note of the draft holding them
  p.call('webRun', 'teamSet', { email: E('nesma'), experienced: true });
  assert.strictEqual(note(3), '');
  p.call('webRun', 'teamSet', { email: E('nesma'), experienced: false });
  assert.strictEqual(note(3), '⚠️ Both members are new');
  // refused: nobody twice, nobody excluded or SKIP, two different members, only the Team
  const before = rows();
  [[{ emailA: E('warda'), emailB: E('nada') }, /Nada Rahmani is already in draft B\.01/], [{ emailA: E('warda'), emailB: E('lyna') }, /Lyna Toumi is excluded/],
    [{ emailA: E('warda'), emailB: E('omar') }, /Omar Ferhat is set to SKIP/], [{ emailA: E('warda'), emailB: E('warda') }, /two different members/],
    [{ emailA: E('warda') }, /Choose two members/], [{ emailA: E('warda'), emailB: E('ghost') }, /ghost@g\.enp\.edu\.dz is not in the Team tab/]]
    .forEach(([args, re]) => assert.throws(() => p.call('webRun', 'draftPair', args), re));
  assert.strictEqual(rows(), before, 'a refused pair writes nothing');

  // remove: the row goes, the later drafts move up a code (and their notes with them)
  assert.throws(() => p.call('webRun', 'draftUnpair', { binome: 'B.09' }), /B\.09 is not a draft binome/);
  assert.throws(() => p.call('webRun', 'draftUnpair', { binome: 'B.01', email: E('hiba') }), /changed meanwhile/);
  out = p.call('webRun', 'draftUnpair', { binome: 'B.01', email: E('nada') });
  assert.deepStrictEqual(out.result, { removed: 'B.01', members: ['Nada Rahmani', 'Ilyes Hamdi'] });
  assert.deepStrictEqual(JSON.parse(rows()).map(r => r[0] + ' ' + r[1]), ['B.01 ' + E('hiba'), 'B.02 ' + E('wafa')]);
  assert.deepStrictEqual([note(2), note(3)], ['⚠️ Both members are new', '']);
  assert.deepStrictEqual(st().binomes.map(b => b.code + ':' + b.status + ':' + b.byHand), ['B.01:DRAFT:true', 'B.02:DRAFT:true'], 'the snapshot follows, made by hand');

  // Draw the rest: the hand-made pairs stay, the free members (Warda, Nada, Ilyes) are drawn, with the mix
  out = p.call('webRun', 'draft', { keep: true });
  assert(/^Drew 2 more binomes from the 3 free members; the 2 pairs already made stay\./.test(out.messages[0]), out.messages[0]);
  assert(/Drafts now: 4 binomes, 3 with an experienced member, 1 without one \(3 experienced for 4 new\)\./.test(out.messages[0]), out.messages[0]);
  let r = JSON.parse(rows());
  assert.deepStrictEqual(r.slice(0, 2).map(x => x[0] + ' ' + x[1] + ' ' + x[2]), ['B.01 ' + E('hiba') + ' ' + E('nesma'), 'B.02 ' + E('wafa') + ' ' + E('nawel')]);
  assert.deepStrictEqual(r.map(x => x[0]), ['B.01', 'B.02', 'B.03', 'B.04']);
  assert.deepStrictEqual(st().binomes.map(b => b.byHand), [true, true, false, false], 'drawn pairs are not marked as made by hand');
  const drawn = r.slice(2).map(x => [x[1], x[2]].filter(Boolean));
  assert(drawn.some(x => x.length === 2 && x[1] === E('ilyes') && [E('warda'), E('nada')].includes(x[0])) && drawn.some(x => x.length === 1),
    'new Ilyes goes to an experienced HR member, the other one is left alone: ' + JSON.stringify(drawn));
  assert.strictEqual(JSON.parse(p.run(`JSON.stringify(master.getSheetByName('Binomes').cells.slice(1).map(r => r[1] + r[3]).filter(String))`)).length, 4);
  // nothing of it is a hand edit
  p.call('webRun', 'sync');
  assert.deepStrictEqual(st().alerts.filter(a => a.type === 'MANUAL_EDIT'), [], 'no manual-edit alert after the draft actions');
  // Redraw all: every draft goes, everyone free is drawn again
  out = p.call('webRun', 'draft');
  assert(/^Drafted 4 binomes from 7 available members\./.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual(JSON.parse(rows()).map(x => x[0]), ['B.01', 'B.02', 'B.03', 'B.04']);
  assert(st().binomes.every(b => !b.byHand), 'Redraw all forgets the hand-made pairs');

  // Lock, then the pairing actions are closed; teamSet stays open
  p.call('webRun', 'lock');
  assert(st().locked);
  assert.throws(() => p.call('webRun', 'draftPair', { emailA: E('warda'), emailB: E('nada') }), /already locked/);
  assert.throws(() => p.call('webRun', 'draftUnpair', { binome: 'B.01' }), /already locked/);
  assert(/already locked/.test(p.call('webRun', 'draft', { keep: true }).messages[0]));
  assert.strictEqual(p.call('webRun', 'teamSet', { email: E('nesma'), experienced: true }).result.experienced, true);
  assert(st().unpaired.every(m => typeof m.experienced === 'boolean'));
}
// ---- a Team tab whose column G is someone else's (Setup not run since Experienced came): refused, nobody counts as experienced ----
{
  const q = require('./seed')();
  q.call('webRun', 'importTeam', { link: '' });
  q.run(`(function () { var c = master.getSheetByName('Team').cells; c[0][6] = 'Phone'; c[1][6] = '0555123456'; c[2][6] = true; })()`);
  const team = () => q.run(`JSON.stringify(master.getSheetByName('Team').cells)`), before = team();
  assert.throws(() => q.call('webRun', 'teamSet', { email: 'warda@g.enp.edu.dz', experienced: true }),
    /^Error: The Team tab has no Experienced column yet \(its column G holds something else\)\. Run Setup first, from the Master: VIC Recruitment › Run setup again, as vic\.rh .*Nothing was changed\.$/);
  assert.throws(() => q.call('webRun', 'importTeam', { link: '', replace: true }), /no Experienced column yet/, 'Import would write over that column');
  assert.strictEqual(team(), before, 'the Team tab is unchanged');
  assert(q.call('webState').teamList.every(m => m.experienced === false), 'the snapshot reads nobody as experienced');
  assert(/Drafted \d+ binomes/.test(q.call('webRun', 'draft').messages[0]), 'the draft still runs, everyone new');
  q.call('webRun', 'setup');
  assert.strictEqual(q.run(`master.getSheetByName('Team').cells[0][6]`), 'Experienced', 'Setup writes the header');
  assert.strictEqual(q.call('webRun', 'teamSet', { email: 'warda@g.enp.edu.dz', experienced: true }).result.experienced, true, 'then teamSet works');
}
// a refused lock is an error on the dashboard, never a message; nothing is changed
{
  const tabs = () => run('JSON.stringify(master.sheets.map(s => s.cells)) + __outbox.length');
  const before = tabs();
  const phrase = run('RESET_PHRASE');
  run('__lockBusy = true');
  [['sync'], ['integrity'], ['editApply', { ids: ['A-1'] }], ['editRevert', { ids: ['A-1'] }], ['editAccept', { ids: ['A-1'] }], ['draft'], ['lock'],
    ['resetBinomes', { phrase }], ['reassign', { code: 'IT.1', binome: 'B.01' }],
    ['changeMember', { binome: 'B.01', outEmail: 'a@x.dz', inEmail: 'b@x.dz' }], ['swapMembers', { binomeA: 'B.01', emailA: 'a@x.dz', binomeB: 'B.02', emailB: 'b@x.dz' }],
    ['newBinome', { emailA: 'a@x.dz', emailB: 'b@x.dz' }], ['addCover', { codes: ['IT.1'], inEmail: 'a@x.dz' }], ['endCover', { row: 2 }],
    ['quick', { op: 'snooze', ids: ['A-1'], for: '4h' }], ['draft', { keep: true }], ['draftPair', { emailA: 'a@x.dz', emailB: 'b@x.dz' }],
    ['draftUnpair', { binome: 'B.01' }], ['teamSet', { email: 'a@x.dz', experienced: true }], ['binomeTag', { binome: 'B.01', depts: ['IT'] }]].forEach(([action, args]) =>
    assert.throws(() => call('webRun', action, args), /^Error: BUSY: Another update is running\. Nothing was changed/, action + ' must fail with BUSY'));
  run('__lockBusy = false');
  assert.strictEqual(tabs(), before, 'a refused action changes nothing');
  run('__lockBusy = true; busy_(); __lockBusy = false'); // the menu keeps its dialog (here: the console)
  assert(/Everything is up to date/.test(call('webRun', 'sync').messages[0]), 'the same action works once the lock is free');
}
// ---- the interview form in the dashboard (docs/interview-form.md part 2): who may read and save, and what a save checks ----
{
  const m = require('./seed')(), J = JSON.stringify;
  ['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
  m.addRegistrations(30, 3);
  m.call('webRun', 'sync');
  m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
  const as = e => m.run('__as(' + J(e) + ')');
  const admin = m.call('webState');
  const ivOf = code => admin.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
  const b1 = admin.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 3), b2 = admin.binomes.find(b => b.code !== b1.code && ivOf(b.code).length);
  const [mem, partner] = b1.people.map(p => p.email), fid = b1.fileUrl.split('/d/')[1], [c1, c2, c3] = ivOf(b1.code);
  m.run('__acl = true');
  m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
  m.call('webRun', 'sync'); // a warm slice
  const Q = JSON.parse(m.run('JSON.stringify(INTERVIEW_QUESTIONS)')), H = JSON.parse(m.run('JSON.stringify(IA_H)'));
  // every question of the sections in play answered: scores 7, the first option, a sentence
  const full = (dept, extra) => {
    const a = {};
    Q.filter(q => ['first', 'final', dept].includes(q.section)).forEach(q => { a[q.id] = q.type === 'score' ? 7 : q.type === 'choice' ? q.options[0] : 'Calm and clear'; });
    return Object.assign(a, { firstChoice: dept, finalDep: dept }, extra || {});
  };
  const get = code => m.call('webRun', 'interviewGet', { code }).result;
  const save = (code, answers, seen) => m.call('webRun', 'interviewSave', { code, answers, seen }).result;
  const tab = () => JSON.parse(m.run(`JSON.stringify((__files[${J(fid)}].obj.getSheetByName(IA_TAB) || { cells: null }).cells)`));
  const cellOf = (row, id) => row[H.indexOf(Q.find(q => q.id === id).title)];

  as(mem);
  let g = get(c1);
  assert.deepStrictEqual([g.code, g.binome, g.edit, g.answers, g.source, g.stamp, g.questions.length, g.sections.map(s => s.id)],
    [c1, b1.code, true, null, '', '', Q.length, ['first', 'IT', 'COMM', 'HR', 'FLER', 'final']]);
  assert(g.name && ['IT', 'COMM', 'FLER', 'HR'].includes(g.firstChoice), 'the candidate and their registration 1st choice: ' + J([g.name, g.firstChoice]));
  assert(/[?&]entry\.1757583213=B\.\d+&entry\.1249446617=$/.test(g.formUrl), 'the prefilled Google Form: ' + g.formUrl);
  assert.deepStrictEqual(Q.filter(q => q.branch).map(q => [q.id, q.options.join(',')]), [['firstChoice', 'IT,HR,FLER,COMM']]);

  // refused before anything opens: no tab made
  [[full('IT', { intro: '' }), /^Error: "Introduce yourself" needs an answer\.$/], [full('IT', { intro: 11 }), /score from 1 to 10/],
    [full('IT', { intro: 7.5 }), /score from 1 to 10/], [full('COMM', { commTiktok: 'Maybe' }), /must be one of: Yes, No, No but I would create one/],
    [full('IT', { firstChoice: 'MATH' }), /must be one of: IT, HR, FLER, COMM/], [full('HR', { hrPurpose: '' }), /needs an answer/],
    [full('IT', { finalDep: '' }), /"Final Main Department Affectation" needs an answer/], [full('IT', { conclusion: 'x'.repeat(5001) }), /5,000 characters/],
    ['all good', /^Error: Not allowed$/]].forEach(([a, re]) => assert.throws(() => save(c1, a, ''), re, String(re)));
  assert.strictEqual(tab(), null, 'a refused save makes no tab');
  assert.throws(() => save(ivOf(b2.code)[0], full('IT'), ''), /no longer in your binome/, 'a code of another binome');
  assert.throws(() => get(ivOf(b2.code)[0]), /no longer in your binome/);

  // a save: the tab comes after the main sheet, paragraphs stay text, the department sections left behind are not saved
  const pv = m.call('webPulse');
  const s1 = save(c1, full('IT', { commTiktok: 'Yes', hrLeadership: 9, conclusion: '=1+1, strong', anything: '' }), '');
  assert.deepStrictEqual([s1.source, s1.submittedBy, s1.editedAt, s1.interview.source, s1.interview.by, /^\d+\|/.test(s1.stamp)],
    ['Dashboard', mem, '', 'Dashboard', mem, true], J(s1));
  assert.deepStrictEqual(JSON.parse(m.run(`JSON.stringify(__files[${J(fid)}].obj.getSheets().map(s => s.getName()))`)), [b1.code, 'Interview Answers']);
  let row = tab()[1];
  assert.deepStrictEqual([tab()[0].join('|'), row[0], row[1], row[3], cellOf(row, 'intro'), cellOf(row, 'itDesign'), cellOf(row, 'commTiktok'),
    cellOf(row, 'hrLeadership'), cellOf(row, 'conclusion'), cellOf(row, 'anything')], [H.join('|'), c1, 'Dashboard', mem, 7, 7, '', '', '=1+1, strong', '']);
  assert(!m.run('__formulas').some(f => /strong/.test(f)), 'the paragraph is written as text');
  assert(m.run(`!!__cache[${J('dirty:' + b1.code)}]`), 'dirty: the next sync reads it');
  // the partner sees it at their next poll; their save that started before it is refused
  as(partner);
  assert.strictEqual(m.call('webPulse'), pv + 1);
  assert.deepStrictEqual(m.call('webState').candidates.find(c => c.Code === c1).interview, s1.interview, 'Submitted, from the patched slice');
  assert.throws(() => save(c1, full('HR'), ''), /^Error: CONFLICT: .+ saved this form at /);
  g = get(c1);
  assert.deepStrictEqual([g.source, g.answers.intro, g.answers.conclusion, g.answers.firstChoice, g.stamp], ['Dashboard', 7, '=1+1, strong', 'IT', s1.stamp]);
  // an edit with the stamp it loaded: Submitted kept, Edited At / By set; the first author's old stamp is now stale
  const s2 = save(c1, full('HR', { hrLeadership: '' }), g.stamp);
  assert.deepStrictEqual([s2.submittedBy, s2.editedBy, !!s2.editedAt, s2.interview.by, s2.answers.firstChoice, s2.answers.itDesign, s2.answers.hrLeadership],
    [mem, partner, true, mem, 'HR', '', '']);
  assert.strictEqual(tab().length, 2, 'the same row, rewritten');
  as(mem);
  assert.throws(() => save(c1, full('IT'), s1.stamp), /^Error: CONFLICT: /, 'even within the same second as the first save');
  assert.strictEqual(save(c1, full('IT'), get(c1).stamp).editedBy, mem);
  m.run('__docLockBusy = true');
  assert.throws(() => save(c1, full('IT'), get(c1).stamp), /^Error: BUSY: /);
  m.run('__docLockBusy = false');

  // a Google Form row is read-only for everyone
  m.run(`(function () { var t = __files[${J(fid)}].obj.getSheetByName(IA_TAB);
    t.getRange(t.getLastRow() + 1, 1, 1, IA_H.length).setValues([answersCells_([${J(c2)}, 'Google Form', new Date(), 'someone@g.enp.edu.dz', '', ''], INTERVIEW_QUESTIONS.map(function () { return ''; }))]); })()`);
  g = get(c2);
  assert.deepStrictEqual([g.source, g.edit, g.submittedBy], ['Google Form', true, 'someone@g.enp.edu.dz']);
  assert.throws(() => save(c2, full('IT'), g.stamp), /came from the Google Form: they can only be viewed here/);
  // a row removed meanwhile is a conflict too, not a silent new row
  assert.throws(() => save(c3, full('IT'), '1|x@g.enp.edu.dz'), /^Error: CONFLICT: These answers were removed/);
  // a Google Form logged before the tab existed: no row, only its mark in Interview Form. Read-only too, also in the sheet slice
  const mark = v => m.run(`(function () { var sh = __files[${J(fid)}].obj.sheets[0]; sh.getRange(findFileRow_(sh, ${J(c3)}), bfCol_('Interview Form')).setValue(${J(v)}); })()`);
  mark('✅ 01/10 10:00');
  assert.deepStrictEqual([get(c3).source, get(c3).answers], ['Google Form', null]);
  assert.throws(() => save(c3, full('IT'), ''), /came from the Google Form/);
  m.run('__cacheClear()');
  assert.deepStrictEqual(m.call('webState').candidates.find(c => c.Code === c3).interview, { at: '', by: '', source: 'Google Form' }, 'from the sheet, without a tab row');
  mark('');

  // an admin in the binome: the same rules
  as('admin@g.enp.edu.dz'); m.run('master.addEditor(' + J(partner) + ')'); as(partner);
  assert.strictEqual(m.call('webAccess').role, 'admin');
  assert.strictEqual(save(c3, full('FLER'), '').submittedBy, partner, 'an admin in a binome saves for their binome');
  // view-only: reads, never saves
  m.run(`__files[${J(fid)}].editors = __files[${J(fid)}].editors.filter(e => e !== ${J(partner)}); __files[${J(fid)}].viewers = [${J(partner)}]`);
  assert.deepStrictEqual([get(c3).edit, get(c3).answers.firstChoice], [false, 'FLER']);
  assert.throws(() => save(c3, full('FLER'), get(c3).stamp), /can view your binome sheet but not edit it/);
  m.run(`__files[${J(fid)}].viewers = []; __files[${J(fid)}].editors.push(${J(partner)})`);
  // a cover: their codes only, read-only
  as('admin@g.enp.edu.dz');
  m.call('webRun', 'addCover', { codes: c1, inEmail: 'stand.in@g.enp.edu.dz', inName: 'Stand In' });
  m.run(`__files[${J(fid)}].viewers = ['stand.in@g.enp.edu.dz']`);
  as('stand.in@g.enp.edu.dz');
  assert.deepStrictEqual([get(c1).edit, get(c1).source], [false, 'Dashboard']);
  assert.throws(() => get(c3), /^Error: Not allowed$/, 'a code they do not cover');
  assert.throws(() => save(c1, full('IT'), get(c1).stamp), /^Error: Not allowed$/, 'a cover is read-only');
  as('nobody@g.enp.edu.dz');
  assert.throws(() => get(c1), /^Error: Not allowed$/);
  as('admin@g.enp.edu.dz');
  assert.throws(() => get(c1), /^Error: Not allowed$/, 'an admin in no binome reads the Master instead');
}

// ---- admins fill in a binome's columns (docs/admin-features.md): a direct write into the binome sheet, marked "set by" ----
{
  const m = require('./seed')(), J = JSON.stringify;
  ['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
  m.addRegistrations(30, 3);
  m.call('webRun', 'sync');
  m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
  const as = e => m.run('__as(' + J(e) + ')');
  const ADMIN = 'admin@g.enp.edu.dz';
  const admin = m.call('webState');
  const ivOf = code => admin.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
  const b1 = admin.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 3);
  const [mem] = b1.people.map(p => p.email), fid = b1.fileUrl.split('/d/')[1], [c1, c2] = ivOf(b1.code);
  m.run('__acl = true');
  m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
  m.call('webRun', 'sync');
  const set = (code, fields) => m.call('webRun', 'adminSet', { code, fields }).result;
  const get = code => m.call('webRun', 'binomeColumnsGet', { code }).result;
  const cell = (code, k) => JSON.parse(m.run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0], r=sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(k)})); return JSON.stringify(r.getDisplayValue());})()`));
  const logRows = () => JSON.parse(m.run(`JSON.stringify((ss_().getSheetByName('Interviewee Changes') || { cells: [] }).cells.slice(1))`));
  const changes = () => logRows().filter(r => /^Admin set /.test(r[3]));
  const slice = (e, code) => { as(e); try { return m.call('webState').candidates.find(c => c.Code === code); } finally { as(ADMIN); } };

  // the read: the sheet's values in the slice's form, no marks, no form yet
  let g = get(c1);
  assert.deepStrictEqual([g.candidate.Code, g.binome, g.setBy, g.candidate.Contacted, g.candidate['Interview Done'], g.candidate.Rating], [c1, b1.code, {}, 'Not yet', false, '']);

  // several fields in one call, each answered on its own; a refused value stops only itself
  const pv = (as(mem), m.call('webPulse'));
  as(ADMIN);
  const r1 = set(c1, [{ field: 'Contacted', value: 'Yes', seen: 'Not yet' }, { field: 'Rating', value: '7,5', seen: '' },
    { field: 'Notes', value: 'admin note', seen: '' }, { field: 'Final Affectation', value: 'MATH', seen: '' }]);
  assert.deepStrictEqual(r1.fields, [{ field: 'Contacted', value: 'Yes' }, { field: 'Rating', value: 7.5 }, { field: 'Notes', value: 'admin note' },
    { field: 'Final Affectation', error: 'Final Affectation must be one of: IT, COMM, FLER, HR, Not accepted, or empty.' }]);
  assert.deepStrictEqual([cell(c1, 'Contacted'), cell(c1, 'Rating'), cell(c1, 'Notes'), cell(c1, 'Final Affectation')], ['Yes', '7.5', 'admin note', ''], 'written into the binome sheet');
  assert.deepStrictEqual(Object.keys(r1.setBy).sort(), ['Contacted', 'Notes', 'Rating'], 'a mark for each field written');
  assert.deepStrictEqual([r1.setBy.Rating.by, /^\d\d\/\d\d \d\d:\d\d$/.test(r1.setBy.Rating.at)], [ADMIN, true]);
  assert.deepStrictEqual(changes().map(r => [r[1], r[2], r[3], r[4], r[5]]).sort(),
    [[ADMIN, c1, 'Admin set Contacted', 'Not yet', 'Yes'], [ADMIN, c1, 'Admin set Notes', '', 'admin note'], [ADMIN, c1, 'Admin set Rating', '', '7.5']].sort(), 'one row per changed field');
  assert(m.run(`!!__cache[${J('dirty:' + b1.code)}]`), 'dirty: the next sync reads the sheet');
  // the binome sees it at its next poll, with who set it
  as(mem);
  assert.strictEqual(m.call('webPulse'), pv + 1, 'one new version for the whole save');
  let sl = m.call('webState').candidates.find(c => c.Code === c1);
  assert.deepStrictEqual([sl.Contacted, sl.Rating, sl.setBy.Contacted.by, Object.keys(sl.setBy).length], ['Yes', 7.5, ADMIN, 3], 'the patched slice carries the marks');
  as(ADMIN);
  assert.deepStrictEqual(get(c1).setBy, r1.setBy, 'the read shows the marks');
  // marks survive a sync's republish
  m.call('webRun', 'sync');
  assert.deepStrictEqual(Object.keys(slice(mem, c1).setBy).sort(), ['Contacted', 'Notes', 'Rating'], 'a sync keeps the marks in the slice');

  // the binome changed a cell since the admin's screen: that field is refused with the new value, the others are written
  as(mem);
  m.call('webRun', 'memberSet', { code: c1, fields: [{ field: 'Contacted', value: 'No answer', seen: 'Yes' }] });
  sl = m.call('webState').candidates.find(c => c.Code === c1);
  assert.deepStrictEqual([sl.setBy.Contacted, Object.keys(sl.setBy).sort()], [undefined, ['Notes', 'Rating']], 'the binome editing a field again takes its mark away');
  as(ADMIN);
  const r2 = set(c1, [{ field: 'Contacted', value: 'Withdrew', seen: 'Yes' }, { field: 'Rating', value: 9, seen: 7.5 }]);
  assert.deepStrictEqual(r2.fields, [{ field: 'Contacted', conflict: 'No answer' }, { field: 'Rating', value: 9 }]);
  assert.deepStrictEqual([cell(c1, 'Contacted'), cell(c1, 'Rating')], ['No answer', '9'], 'the conflict left the cell, the other was written');
  assert.strictEqual(changes().filter(r => r[3] === 'Admin set Rating').length, 2, 'only the written field is logged');
  // a value the cell already holds is no change: no mark, no log row, and not a conflict
  const n0 = changes().length;
  assert.deepStrictEqual(set(c1, [{ field: 'Contacted', value: 'No answer', seen: 'No answer' }]).fields, [{ field: 'Contacted', value: 'No answer' }]);
  assert.strictEqual(changes().length, n0);
  // an emptied cell carries no mark
  assert.strictEqual(set(c1, [{ field: 'Notes', value: '', seen: 'admin note' }]).setBy.Notes, undefined, 'nothing is set by anyone in an empty cell');

  // refusals
  assert.throws(() => set('NOPE.99', [{ field: 'Contacted', value: 'Yes', seen: '' }]), /Unknown code NOPE\.99/);
  assert.throws(() => set(c1, [{ field: 'Email', value: 'a@b.dz', seen: '' }]), /^Error: Not allowed$/, 'only the binome\'s seven columns');
  assert.throws(() => set(c1, []), /^Error: Not allowed$/);
  assert.throws(() => set(c1, [{ field: 'Notes', value: 'a', seen: '' }, { field: 'Notes', value: 'b', seen: '' }]), /^Error: Not allowed$/, 'a field twice');
  as(mem);
  assert.throws(() => set(c1, [{ field: 'Contacted', value: 'Yes', seen: '' }]), /^Error: Not allowed$/, 'a member goes through memberSet');
  assert.throws(() => get(c1), /^Error: Not allowed$/);
  as(ADMIN);
  m.run('__docLockBusy = true');
  assert.throws(() => set(c1, [{ field: 'Contacted', value: 'Yes', seen: 'No answer' }]), /^Error: BUSY: /);
  m.run('__docLockBusy = false');
  m.run('var __sobi = SpreadsheetApp.openById; SpreadsheetApp.openById = id => { if (id === ' + J(fid) + ') throw new Error("You do not have permission to access the requested document."); return __sobi.call(SpreadsheetApp, id); }');
  assert.throws(() => set(c1, [{ field: 'Contacted', value: 'Yes', seen: 'No answer' }]), new RegExp('You cannot open the sheet of ' + b1.code.replace('.', '\\.')), 'an admin who cannot open that sheet gets an error naming it');
  assert.throws(() => get(c1), /You cannot open the sheet of /);
  m.run('SpreadsheetApp.openById = __sobi');
  assert.strictEqual(cell(c1, 'Contacted'), 'No answer', 'nothing written by a refused call');

  // the interview form: it keeps an admin's Rating, says so in the save's reply, and the skip is logged at the next sync
  const Q = JSON.parse(m.run('JSON.stringify(INTERVIEW_QUESTIONS)'));
  const full = dept => { const a = {}; Q.filter(q => ['first', 'final', dept].includes(q.section)).forEach(q => { a[q.id] = q.type === 'score' ? 7 : q.type === 'choice' ? q.options[0] : 'Calm'; }); return Object.assign(a, { firstChoice: dept, finalDep: dept }); };
  set(c2, [{ field: 'Rating', value: 3, seen: '' }]);
  as(mem);
  const sv = m.call('webRun', 'interviewSave', { code: c2, answers: full('IT'), seen: '' }).result;
  assert.deepStrictEqual(sv.kept, ['Rating'], 'Rating stays as the admin set it; Final Affectation was empty and the form fills it');
  as(ADMIN);
  m.call('webRun', 'sync');
  assert.deepStrictEqual([cell(c2, 'Rating'), cell(c2, 'Final Affectation')], ['3', 'IT'], 'the form filled the empty cell and left the admin\'s');
  assert.deepStrictEqual(logRows().filter(r => r[2] === c2 && /^Form kept /.test(r[3])).map(r => [r[3], r[4], r[5]]), [['Form kept Rating', '3', '7']], 'Interviewee Changes logs the skip');
  // Let the form fill it: the latest form's value, the mark goes, it is logged, later form saves update it again
  const f1 = m.call('webRun', 'adminFormFill', { code: c2, field: 'Rating' }).result;
  assert.deepStrictEqual([f1.value, cell(c2, 'Rating'), f1.setBy.Rating], [7, '7', undefined]);
  assert.deepStrictEqual(logRows().filter(r => r[2] === c2 && r[3] === 'Form filled Rating').map(r => [r[4], r[5]]), [['3', '7']]);
  assert.strictEqual(slice(mem, c2).setBy, undefined, 'the binome no longer sees a mark');
  as(mem);
  const edited = m.call('webRun', 'interviewGet', { code: c2 }).result;
  m.call('webRun', 'interviewSave', { code: c2, answers: Object.assign(full('IT'), { intro: 5 }), seen: edited.stamp });
  as(ADMIN); m.call('webRun', 'sync');
  assert.notStrictEqual(cell(c2, 'Rating'), '7', 'a later form save updates it again, as before an admin touched it');
  // an admin sets it to something else and back to what the form filled: the cell equals the form's own value, the mark stays and keeps it
  const filled = cell(c2, 'Rating');
  set(c2, [{ field: 'Rating', value: 2, seen: Number(filled) }]);
  assert.deepStrictEqual(set(c2, [{ field: 'Rating', value: Number(filled), seen: 2 }]).fields, [{ field: 'Rating', value: Number(filled) }]);
  as(mem);
  const again = m.call('webRun', 'interviewGet', { code: c2 }).result;
  const sv2 = m.call('webRun', 'interviewSave', { code: c2, answers: Object.assign(full('IT'), { intro: 1 }), seen: again.stamp }).result;
  assert.deepStrictEqual(sv2.kept, ['Rating'], 'the save says the admin value stays');
  as(ADMIN); m.call('webRun', 'sync');
  assert.strictEqual(cell(c2, 'Rating'), filled, 'the marked cell stays even though it equals what the form filled last');
  assert.strictEqual(logRows().filter(r => r[2] === c2 && r[3] === 'Form kept Rating' && r[4] === filled).length, 1, 'and the skip is logged');
  // no form yet: it empties the cell
  set(c1, [{ field: 'Rating', value: 4, seen: '9' }]);
  const f2 = m.call('webRun', 'adminFormFill', { code: c1, field: 'Rating' }).result;
  assert.deepStrictEqual([f2.value, cell(c1, 'Rating')], ['', ''], 'no form yet: blank');
  assert.throws(() => m.call('webRun', 'adminFormFill', { code: c1, field: 'Notes' }), /^Error: Not allowed$/, 'only Rating and Final Affectation');
}

run('__as("")');
assert.strictEqual(run('access_().reason'), 'NO_EMAIL', 'hidden email is denied');
assert.throws(() => call('webState'), /Not allowed/);
run('Session = __realSession');

assert.strictEqual(run('webAccess().photo'), PHOTO, 'profile picture from Drive, sized up');
run('__realAbout = Drive.About; Drive.About = { get() { throw new Error("quota"); } }');
assert.strictEqual(run('webAccess().photo'), '', 'a Drive failure falls back to initials');
run('Drive.About = __realAbout');

// fmt_ formats in plain JS: one offset lookup per zone and run, not a formatDate call per date (a slow Google made it 80 s)
{
  run('var __ufd = Utilities.formatDate, __n = 0; Utilities.formatDate = function (d, tz, p) { __n++; return __ufd(d, tz, p); }; _tzOff = {}');
  const pats = ['dd/MM/yyyy HH:mm', 'dd/MM HH:mm', 'dd/MM/yyyy', 'dd/MM', 'HH:mm', 'yyyy', 'yyyy-MM-dd'];
  const dates = [Date.UTC(2026, 9, 26, 17, 0), Date.UTC(2026, 11, 31, 23, 30), Date.UTC(2027, 1, 28, 22, 59), Date.UTC(2026, 0, 1, 0, 5)];
  const each = f => JSON.parse(run(`JSON.stringify(${JSON.stringify(dates)}.map(t => ${JSON.stringify(pats)}.map(p => ${f})))`));
  const js = each('fmt_(new Date(t), p)');
  assert(run('__n') <= 2, 'at most two offset lookups, got ' + run('__n'));
  assert.deepStrictEqual(js, each(`__ufd(new Date(t), 'Africa/Algiers', p)`), 'same text as formatDate');
  assert.strictEqual(run('fmt_(new Date(Date.UTC(2026, 11, 31, 23, 30)), "dd/MM/yyyy HH:mm", "Africa/Algiers")'), '01/01/2027 00:30', 'the zone shifts the day and year');
  assert.strictEqual(run('fmt_(new Date(Date.UTC(2026, 9, 26, 17, 0)))'), '26/10/2026 18:00', 'default pattern');
  assert.strictEqual(run('fmt_("x")'), 'x', 'not a date: as text');
  // a pattern it doesn't parse (day names are locale text), and a daylight-saving zone, still go to formatDate
  run('__n = 0'); run('fmt_(new Date(), "EEE dd/MM")'); assert.strictEqual(run('__n'), 1, 'unknown pattern falls back');
  run(`_tzOff = {}; Utilities.formatDate = function (d, tz, p) { __n++; return p === 'XXX' ? (d.getUTCMonth() < 6 ? '+01:00' : '+02:00') : 'fd'; }`);
  run('__n = 0'); assert.strictEqual(run('fmt_(new Date(), "dd/MM", "Europe/Paris") + fmt_(new Date(), "dd/MM", "Europe/Paris")'), 'fdfd', 'DST zone falls back');
  assert.strictEqual(run('__n'), 4, 'two lookups once, then one call per date');
  run('Utilities.formatDate = __ufd; _tzOff = {}');
}

console.log('WEB OK');
