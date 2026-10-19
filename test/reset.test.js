// Reset all binomes and start over with a new team: guarded by a typed phrase, wipes what belongs to the old binomes only
const assert = require('assert');
const { run, call, addRegistrations } = require('./seed')();

call('webRun', 'importTeam', { link: '' });
call('webRun', 'draft');
call('webRun', 'lock');
addRegistrations(12, 3);
call('webRun', 'sync');
let st = call('webState');
const had = st.binomes.length, files = st.binomes.map(b => b.fileUrl.split('/d/')[1]);
assert(had > 0 && st.interviewees.some(i => i.binome), 'locked, with interviewees placed');
// a dashboard interview form (docs/interview-form.md part 2): its Master copy outlives the binome sheets the reset trashes
const ivA = st.interviewees.find(i => i.binome), memA = st.binomes.find(b => b.code === ivA.binome).people[0].email, dept = ivA.code.split('.')[0];
run(`var __adm = Session; Session = { getEffectiveUser: () => ({ getEmail: () => ${JSON.stringify(memA)} }), getActiveUser: () => ({ getEmail: () => ${JSON.stringify(memA)} }) };
  (function () { var a = {}; INTERVIEW_QUESTIONS.forEach(function (q) { if (['first', 'final', ${JSON.stringify(dept)}].indexOf(q.section) >= 0) a[q.id] = q.type === 'score' ? 5 : q.type === 'choice' ? q.options[0] : 'ok'; });
    a.firstChoice = ${JSON.stringify(dept)}; a.finalDep = ${JSON.stringify(dept)}; webRun('interviewSave', { code: ${JSON.stringify(ivA.code)}, answers: a, seen: '' }); })();
  Session = __adm;`);
call('webRun', 'sync');
const dashRows = () => run('master.getSheetByName("Dashboard Interviews").getDataRange().getValues().slice(1).map(function (r) { return r[3]; }).join()');
assert.strictEqual(dashRows(), ivA.code, 'the dashboard form is in the Master');
assert.strictEqual(call('webRun', 'draft').messages[0].includes('already locked'), true, 'this is the refusal the reset gets around');

assert.throws(() => call('webRun', 'resetBinomes', {}), /Type exactly/, 'no phrase');
assert.throws(() => call('webRun', 'resetBinomes', { phrase: 'i confirm to reset the binomes' }), /Type exactly/, 'case matters');
assert.strictEqual(call('webState').binomes.length, had, 'a refused reset changes nothing');

run(`__files[${JSON.stringify(files[0])}].editors.push('old.member@g.enp.edu.dz'); (__files[${JSON.stringify(files[0])}].viewers = __files[${JSON.stringify(files[0])}].viewers || []).push('old.cover@g.enp.edu.dz')`);
const out = call('webRun', 'resetBinomes', { phrase: 'I confirm to reset the binomes' });
assert.strictEqual(out.result.binomes, had);
assert.strictEqual(out.result.retired, had);
assert.deepStrictEqual(out.result.failed, []);
assert(/Binomes reset/.test(out.messages[0]), out.messages[0]);
const retiredId = run(`__folders.filter(function (f) { return f.name === 'Retired binomes'; }).map(function (f) { return f.id; }).join()`);
assert(retiredId && retiredId.indexOf(',') < 0, 'one Retired binomes folder, made by the reset');
assert.strictEqual(run(`__files[${JSON.stringify(files[0])}].editors.concat(__files[${JSON.stringify(files[0])}].viewers).filter(function (e) { return /^old\./.test(e); }).length`), 0, 'the old members lose access to the retired sheet');
files.forEach(id => {
  assert.strictEqual(run(`__files[${JSON.stringify(id)}].trashed`) === true, false, 'sheet kept, not trashed');
  assert.strictEqual(run(`__files[${JSON.stringify(id)}].parent`), retiredId, 'sheet moved to the Retired binomes folder');
  assert(/ \(retired \d{4}-\d\d-\d\d\)$/.test(run(`__files[${JSON.stringify(id)}].name`)), 'named with the reset date');
});
assert.strictEqual(dashRows(), ivA.code, 'Reset keeps the Master copy of the dashboard forms');

st = call('webState');
assert.deepStrictEqual([st.binomes.length, st.team.total, st.locked, st.history.length], [0, 0, false, 0]);
assert(st.interviewees.length > 0 && st.interviewees.every(i => i.code && !i.binome && i.status === 'UNASSIGNED'), 'interviewees kept, back to Unassigned');
assert.deepStrictEqual(st.alerts.filter(a => a.binome || /MANUAL_EDIT|INTEGRITY|UNPAIRED/.test(a.type)), [], 'old-binome alerts closed');

// nothing flags the reset as a hand edit, and the same people are not re-imported under new codes
const codes = st.interviewees.map(i => i.code).sort();
call('webRun', 'sync');
st = call('webState');
assert.deepStrictEqual(st.alerts.filter(a => a.type === 'MANUAL_EDIT'), [], 'reset is not a hand edit');
assert.deepStrictEqual(st.interviewees.map(i => i.code).sort(), codes, 'same interviewees, same codes');

// start over as for production: import (pre-ticked), three pairs by hand, draw the rest, lock; waiting interviewees are placed again
call('webRun', 'importTeam', { link: '' });
st = call('webState');
assert(st.teamList.length === 13 && st.teamList.every(m => m.experienced), 'the 2025 team itself: everyone pre-ticked');
['romaissa', 'sabrina', 'aymene', 'yasmine'].forEach(n => call('webRun', 'teamSet', { email: n + '@g.enp.edu.dz', experienced: false }));
[['ikram', 'yasmine'], ['zineb', 'aya'], ['aymene', 'sara']].forEach(([a, b]) => call('webRun', 'draftPair', { emailA: a + '@g.enp.edu.dz', emailB: b + '@g.enp.edu.dz' }));
assert.deepStrictEqual(call('webState').binomes.map(b => b.code + ' ' + b.tag + ' ' + b.status), ['B.01 FLER & HR DRAFT', 'B.02 COMM & HR DRAFT', 'B.03 ALL DRAFT']);
let drew = call('webRun', 'draft', { keep: true }).messages[0];
assert(/^Drew \d+ more binomes from the 7 free members; the 3 pairs already made stay\./.test(drew), drew);
st = call('webState');
const drafted = st.binomes.flatMap(b => b.people.map(p => p.email));
assert.deepStrictEqual([drafted.length, new Set(drafted).size, st.binomes.slice(0, 3).map(b => b.people.map(p => p.email.split('@')[0]).join('+'))],
  [13, 13, ['ikram+yasmine', 'zineb+aya', 'aymene+sara']], 'everyone drafted once, the hand-made pairs first and as made');
// out of time after creating the sheets: nobody is placed by the Lock call, the next sync places each of them once
run('var __rc = runCycle_; runCycle_ = function (o) { return __rc(Object.assign({}, o, { assignBy: 0 })); };');
const waiting = call('webState').interviewees.filter(i => i.status === 'UNASSIGNED').length;
const locked = call('webRun', 'lock').messages.join(' ');
run('runCycle_ = __rc;');
assert(locked.includes(waiting + ' waiting registrants will be assigned by the next sync'), locked);
st = call('webState');
assert.deepStrictEqual([st.interviewees.filter(i => i.binome).length, st.binomes.every(b => b.status === 'ACTIVE')], [0, true], 'locked, nobody placed yet');
call('webRun', 'sync');
const sheetCodes = call('webState').binomes.flatMap(b => run(`__files["${b.fileUrl.split('/d/')[1]}"].obj.sheets[0].getDataRange().getValues()`)
  .slice(1).map(r => r[run('BFI').Code]).filter(Boolean));
assert.deepStrictEqual([sheetCodes.length, new Set(sheetCodes).size], [waiting, waiting], 'each placed once');
st = call('webState');
assert(st.binomes.length > 3 && st.binomes.every(b => b.status === 'ACTIVE' && /\/d\//.test(b.fileUrl)), 'Lock creates every sheet');
assert(st.interviewees.filter(i => i.binome).length > 0, 'interviewees placed in the new binomes');
console.log('RESET OK');
