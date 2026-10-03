// Drives every dashboard action through webState/webRun under web-app conditions (no UI, no active sheet)
const assert = require('assert');
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

out = call('webRun', 'draft');
assert(/Drafted \d+ binomes/.test(out.messages[0]), out.messages[0]);
out = call('webRun', 'lockCheck');
assert(out.result.drafts > 0 && out.result.share === false, 'TEST_MODE (default) means no sharing');
const drafts = out.result.drafts;
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
  assert(/→ Outside Person ✅/.test(out.messages[0]), out.messages[0]);
  assert(ppl(b1.code).includes('ext@g.enp.edu.dz') && !ppl(b1.code).includes(leaving));
  assert(/Outside/.test(run('__files["' + fileOf(b1) + '"].obj.title')), 'file renamed');
  assert(/Outside Person/.test(run('__files["' + fileOf(b1) + '"].obj.sheets[0].notes["1:1"]')), 'file note updated');
  assert.strictEqual(changes(), 1);
  assert.strictEqual(run("ss_().getSheetByName('Member Changes').getRange(2, 10).getValue()"), 'left the club');
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
assert.deepStrictEqual(out.messages, ['Full sync done ✅\nIntegrity check: 7 of 7 binome sheets checked, 0 problems found.']);
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
out = call('webRun', 'reassign', { code: iv.code, binome: target.code });
assert(/moved to/.test(out.messages[0]), out.messages[0]);
assert.strictEqual(call('webState').interviewees.find(x => x.code === iv.code).binome, target.code);
out = call('webRun', 'reassign', { code: 'XX.99', binome: target.code });
assert(/Unknown code/.test(out.messages[0]));

const ids = st.alerts.slice(0, 2).map(a => a.id);
out = call('webRun', 'resolve', { ids });
assert.deepStrictEqual(out.messages, ['2 alert(s) marked resolved']);
assert(!call('webState').alerts.some(a => ids.includes(a.id)));

run('__outbox.length = 0');
out = call('webRun', 'digest');
assert(/Digest sent to admin@g.enp.edu.dz/.test(out.messages[0]));
assert(run('__outbox.some(m => /digest/.test(m.subject))'));

assert(run("__outbox.every(m => m.to === 'admin@g.enp.edu.dz')"), 'TEST_MODE: only admins get email');
assert(run("Object.keys(__files).every(id => (__files[id].editors || []).every(e => e === 'admin@g.enp.edu.dz'))"), 'TEST_MODE: binome files not shared');
out = call('webRun', 'reshare');
assert(/TEST_MODE is TRUE/.test(out.messages[0]), out.messages[0]);
assert(call('webState').settings.testMode === true);
assert(call('webState').settingsAll.length > 10, 'settingsAll listed');
out = call('webRun', 'saveSettings', { values: { HOURS_NOT_CONTACTED: '30', ASSIGNMENTS_OPEN: false, DIGEST_HOUR: 9 } });
assert(/HOURS_NOT_CONTACTED/.test(out.messages[0]) && /Run Setup/.test(out.messages[0]), out.messages[0]);
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
  // Drive API off in the Cloud project: the change is saved, the message names the real fix, no ✅
  run('var __gf = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error("Permission denied while enabling APIs: drive for GCP project 1.") }');
  out = call('webRun', 'changeMember', { binome: b.code, outEmail: 'newp@g.enp.edu.dz', inName: 'Other Person', inEmail: 'other@g.enp.edu.dz' });
  assert(/⚠️ .*Google Drive API is off/.test(out.messages[0]) && !/✅/.test(out.messages[0]), out.messages[0]);
  assert(call('webState').alerts.some(a => a.type === 'FILE_ERROR' && /Drive API is off/.test(a.msg)), 'alert names the Drive API');
  const sheets = run("loadCtx_().binomes.filter(x => x.fileId && x.status !== 'DRAFT').length"); // the set reshareBinomeFiles tries
  out = call('webRun', 'reshare');
  assert(new RegExp(sheets + ' sheet\\(s\\) not reached').test(out.messages[0]) && /Drive API is off/.test(out.messages[0]), 'every sheet tried: ' + out.messages[0]);
  run('DriveApp.getFileById = __gf');
  run('__files["' + id + '"].editors = __files["' + id + '"].editors.filter(e => e !== "newp@g.enp.edu.dz")'); // what the admin would do in Drive
  call('webRun', 'reshare');
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
  const fileCodes = code => run(`__files[${J(fileOf(code))}].obj.sheets[0].cells.slice(1).map(function(r){return r[0];}).filter(String)`);
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

  // a status typed by hand is put back (it is computed), a cleared binome is put back instead of re-assigned
  const y = ivs[1];
  ivSet(y.code, 'Status', 'INTERVIEWED'); ivSet(y.code, 'Binome', '');
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRow(y.code)[IVI.Status], ivRow(y.code)[IVI.Binome], open().length], ['ASSIGNED', y.binome, 0], 'both put back, nothing left open');
  assert(fileCodes(y.binome).includes(y.code));

  // a row deleted by hand is not re-imported with a new code; Revert restores it, Accept forgets it for good
  const n0 = ivRows().length, del = code => run(`(function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IVI.Code}]===${J(code)}) { sh.deleteRow(i+1); return; }})()`);
  const z = ivs[2], zAt = () => ivRow(z.code)[IVI['Assigned At']].toISOString(), assignedAt = zAt();
  del(z.code);
  call('webRun', 'sync');
  a = open().find(e => e.code === z.code);
  assert(a && /deleted from the Interviewees tab/.test(a.msg), J(open()));
  assert.strictEqual(ivRows().length, n0 - 1, 'not re-imported under a new code');
  out = fix('Revert', [a.id]);
  assert(/restored/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([ivRows().length, ivRow(z.code)[IVI.Binome]], [n0, z.binome], 'same code, same binome');
  assert.strictEqual(zAt(), assignedAt, 'Assigned At kept');
  del(z.code);
  call('webRun', 'sync');
  fix('Accept', [open().find(e => e.code === z.code).id]);
  call('webRun', 'sync');
  assert.deepStrictEqual([ivRows().length, open().length], [n0 - 1, 0], 'accepted: stays deleted, never re-imported');

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

  // Team tab: a duplicated email is flagged, and closes itself once fixed
  run("(function(){var sh=ss_().getSheetByName('Team');sh.appendRow(['Copy','sara@g.enp.edu.dz','IT','IT',false,'']);})()");
  call('webRun', 'sync');
  assert(open().some(e => /twice in the Team tab/.test(e.msg) && !e.fix.length), J(open()));
  run("(function(){var sh=ss_().getSheetByName('Team');sh.deleteRow(sh.getLastRow());})()");
  call('webRun', 'sync');
  assert.strictEqual(open().length, 0);

  // odd values typed by the binome: a year typo is flagged to them, and closes once corrected
  const w = call('webState').interviewees.find(v => v.status === 'ASSIGNED' && v.binome === to.code);
  const fileSet = (code, col, v) => run(`(function(){var c=__files[${J(fileOf(to.code))}].obj.sheets[0].cells,F=idx_(BF_H);
    for(var i=1;i<c.length;i++) if(c[i][0]===${J(code)}) c[i][F[${J(col)}]]=${J(v)}; __touch(${J(fileOf(to.code))});})()`);
  fileSet(w.code, 'Contacted', 'Yes'); fileSet(w.code, 'Interview Date', '15/10/2025'); fileSet(w.code, 'Interview Time', '14:00');
  call('webRun', 'sync');
  assert(open('ODD_VALUE').some(e => e.code === w.code && /typo in the year/.test(e.msg)), J(open('ODD_VALUE')));
  fileSet(w.code, 'Interview Date', '15/10/2026');
  call('webRun', 'sync');
  assert(!open('ODD_VALUE').some(e => e.code === w.code), 'corrected: closed');

  // full check of the sheets: a row missing from a sheet, protection removed, a tab put in front
  const book = `__files[${J(fileOf(to.code))}].obj`;
  run(`${book}.sheets[0].cells = ${book}.sheets[0].cells.filter(function(r){return r[0]!==${J(w.code)};})`);
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
  run(`var __ap = appendToBinomeFile_; appendToBinomeFile_ = function (c, b, r, carry) { if (b.code === ${J(to.code)}) throw new Error('quota'); return __ap(c, b, r, carry); }`);
  out = call('webRun', 'reassign', { code: mv.code, binome: to.code });
  run('appendToBinomeFile_ = __ap');
  assert(/Nothing moved/.test(out.messages[0]), out.messages[0]);
  assert.deepStrictEqual([ivRow(mv.code)[IVI.Binome], fileCodes(mv.binome).includes(mv.code), fileCodes(to.code).includes(mv.code)], [mv.binome, true, false]);

  // the rollback fails too: the row is in neither sheet, so what the binome wrote is kept in the Master and the row can be rebuilt
  const mvFile = `__files[${J(fileOf(mv.binome))}].obj.sheets[0].cells`;
  run(`(function(){var c=${mvFile},F=idx_(BF_H);for(var i=1;i<c.length;i++) if(c[i][0]===${J(mv.code)}) { c[i][F.Contacted]='Yes'; c[i][F.Notes]='call after 18h'; }})()`);
  run('appendToBinomeFile_ = function () { throw new Error("quota"); }');
  out = call('webRun', 'reassign', { code: mv.code, binome: to.code });
  run('appendToBinomeFile_ = __ap');
  assert(/missing from both binome sheets/.test(out.messages[0]) && (out.messages[0].match(/quota/g) || []).length === 2, out.messages[0]);
  assert.deepStrictEqual([ivRow(mv.code)[IVI.Binome], ivRow(mv.code)[IVI.Contacted], ivRow(mv.code)[IVI['Binome Notes']], fileCodes(mv.binome).includes(mv.code)],
    [mv.binome, 'Yes', 'call after 18h', false], 'data kept in the Master');
  assert(open('FILE_ERROR').some(e => e.severity === 'HIGH' && e.code === mv.code), 'HIGH alert saved');
  out = call('webRun', 'reassign', { code: mv.code, binome: mv.binome });
  assert(/put back in the sheet/.test(out.messages[0]), out.messages[0]);
  assert.strictEqual(run(`(function(){var c=${mvFile},F=idx_(BF_H);for(var i=1;i<c.length;i++) if(c[i][0]===${J(mv.code)}) return c[i][F.Contacted] + '|' + c[i][F.Notes];})()`), 'Yes|call after 18h', 'row rebuilt with its data');
  call('webRun', 'resolve', { ids: open('FILE_ERROR').map(e => e.id) });
  assert.deepStrictEqual(open(), [], 'no hand edits left');

  // the baseline spans several script properties (9 KB each, accents count double) and shrinks cleanly
  run('var __b0 = loadBaseline_(), __n0 = __props.BASELINE_N');
  run(`(function(){ var b = loadBaseline_(); for (var i = 0; i < 400; i++) b.iv['k' + i] = { Code: 'IT.' + i, Binome: 'B.01', Status: 'ASSIGNED',
    'First Name': 'Éloïse Zoé', 'Family Name': 'Bénédicte', Email: 'e' + i + '@g.enp.edu.dz', 'Assigned At': '2026-10-01T08:00:00.000Z' }; saveBaseline_(b); })()`);
  const n = Number(run('__props.BASELINE_N'));
  assert(n > 3, 'split in ' + n);
  for (let i = 0; i < n; i++) assert(Buffer.byteLength(run('__props.BASELINE_' + i)) <= 9216, 'chunk ' + i + ' fits');
  assert.strictEqual(J(run('loadBaseline_().iv.k399')), J({ Code: 'IT.399', Binome: 'B.01', Status: 'ASSIGNED', 'First Name': 'Éloïse Zoé', 'Family Name': 'Bénédicte', Email: 'e399@g.enp.edu.dz', 'Assigned At': '2026-10-01T08:00:00.000Z' }));
  assert.strictEqual(run('(function(){ var iv = loadBaseline_().iv; return Object.keys(iv).filter(function(k){ return iv[k] === 0; }).length; })()'), 1, 'the accepted deletion is remembered');
  run('saveBaseline_(__b0)');
  assert.deepStrictEqual([run('__props.BASELINE_N'), run('"BASELINE_" + (' + n + ' - 1) in __props')], [run('__n0'), false], 'old chunks deleted');
  call('webRun', 'sync');
  assert.deepStrictEqual(open(), [], 'baseline intact after the round trip');
}
out = call('webRun', 'setup');
assert(/Setup done/.test(out.messages[0]), 'setup works without an active spreadsheet');

assert.throws(() => call('webRun', 'nope'), /Unknown action/);
assert.strictEqual(run('_webOut'), null, 'buffer reset after a throw');

// access control: the web app runs as the visitor, so access = can this account edit the Master
assert.strictEqual(run('doGet()._file'), 'Index', 'owner gets the dashboard');
assert(/AccountChooser\?continue=https%3A%2F%2Fscript.google.com/.test(call('webState').switchUrl), 'switch-account link');
run('var __realSession = Session; var __as = e => { Session = { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }; __as("stranger@g.enp.edu.dz")');
assert.throws(() => call('webState'), /Not allowed/);
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
assert.deepStrictEqual(run('JSON.stringify(access_())'), JSON.stringify({ ok: false, email: 'stranger@g.enp.edu.dz', reason: 'READ_ONLY', owner: false }));
let page = run('doGet()');
assert.deepStrictEqual([page._file, page._vars.email, page._vars.reason], ['NoAccess', 'stranger@g.enp.edu.dz', 'READ_ONLY'], 'no-access screen');
run('var __open = SpreadsheetApp.openById; SpreadsheetApp.openById = () => { throw new Error("You do not have permission to access the requested document.") }');
assert.strictEqual(run('access_().reason'), 'NO_PROJECT', 'an account that cannot open the Master');
assert.strictEqual(run('doGet()._vars.reason'), 'NO_PROJECT');
run('SpreadsheetApp.openById = __open');
run('var __drive = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error("No item with the given ID could be found.") }');
assert.strictEqual(run('access_().reason'), 'NO_PROJECT', 'bound Master handed back to an account Drive says has no access → not "view only"');
run('DriveApp.getFileById = __drive');
run('ss_().addEditor("helper@g.enp.edu.dz"); __as("Helper@g.enp.edu.dz")');
assert.strictEqual(call('webState').user, 'Helper@g.enp.edu.dz', 'any editor of the Master gets in, no extra deployment');
assert.strictEqual(run('doGet()._file'), 'Index');

// Vercel front (scripts.run): webAccess never throws, domain + owner rules, setup owner-only, trigger owner guard
assert.deepStrictEqual(call('webAccess'), { ok: true, email: 'helper@g.enp.edu.dz', reason: '', owner: false, v: 2 });
assert.strictEqual(call('webState').owner, false);
assert.throws(() => call('webRun', 'setup'), /Only the owner/, 'an editor cannot run Setup');
assert.throws(() => run('installTriggers_(ss_())'), /triggers belong to admin@g.enp.edu.dz/, 'menu path: a second account cannot double the triggers');
run('ss_().addEditor("someone@gmail.com"); __as("someone@gmail.com")');
assert.deepStrictEqual(call('webAccess'), { ok: false, email: 'someone@gmail.com', reason: 'DOMAIN', owner: false, v: 2 }, 'non-ENP editor refused');
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
{
  run('__as("stranger@g.enp.edu.dz")');
  assert.strictEqual(call('webAccess').reason, 'READ_ONLY');
}
run('__as("admin@g.enp.edu.dz")');
assert.deepStrictEqual([call('webAccess').owner, call('webState').owner, call('webState').v], [true, true, 2]);
assert.strictEqual(run('__props.TRIGGER_OWNER'), 'admin@g.enp.edu.dz', 'setup records the trigger owner');
const before = run('__triggers.length');
call('webRun', 'setup');
assert.strictEqual(run('__triggers.length'), before + 3, 'owner can reinstall');
run('__props.TRIGGER_OWNER = "helper@g.enp.edu.dz"');
assert.throws(() => call('webRun', 'setup'), /triggers belong to helper/, 'TRIGGER_OWNER wins over the Master owner');
run('__props.TRIGGER_OWNER = "admin@g.enp.edu.dz"');
run('__as("")');
assert.strictEqual(run('access_().reason'), 'NO_EMAIL', 'hidden email is denied');
assert.throws(() => call('webState'), /Not allowed/);
run('Session = __realSession');

console.log('WEB OK');
