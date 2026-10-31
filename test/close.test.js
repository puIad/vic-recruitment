// Closing the interview phase (docs/admin-features.md): the preview, the close and reopen, what locks and what stays open, the
// refusals for members, the admin's way round, the sync's guard and its alert, the date's alert, the silenced timing alerts, the mails.
const assert = require('assert');
const J = JSON.stringify, ADMIN = 'admin@g.enp.edu.dz', DAY = 864e5;
const m = require('./seed')();
['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
m.addRegistrations(30, 3);
m.call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
m.call('webRun', 'sync');
m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
const as = e => m.run('__as(' + J(e) + ')');
const run = m.run, call = (a, args) => m.call('webRun', a, args);
const rows = tab => JSON.parse(run(`JSON.stringify(master.getSheetByName('${tab}').getDataRange().getValues().slice(1))`)); // out of the vm realm: deepStrictEqual compares prototypes
const A = run('idx_(ALERT_H)'), I = run('idx_(IV_H)'), C = run('idx_(MC_H)');
const alerts = (type, status) => rows('Alerts').filter(r => r[A.Type] === type && (status || 'OPEN') === r[A.Status]);
const outbox = () => JSON.parse(run('JSON.stringify(__outbox)'));
const st = m.call('webState');
const ivOf = code => st.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
const b1 = st.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 3);
const [mem] = b1.people.map(p => p.email), fid = b1.fileUrl.split('/d/')[1], [c1, c2, c3] = ivOf(b1.code);
run('__acl = true');
call('binomeAccess', { binome: b1.code, level: 'edit' });
call('sync');
const Q = JSON.parse(run('JSON.stringify(INTERVIEW_QUESTIONS)'));
const full = dept => { const a = {}; Q.filter(q => ['first', 'final', dept].includes(q.section)).forEach(q => { a[q.id] = q.type === 'score' ? 7 : q.type === 'choice' ? q.options[0] : 'Calm'; }); return Object.assign(a, { firstChoice: dept, finalDep: dept }); };
const cell = (code, h) => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; return sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(h)})).getValue();})()`);
const put = (code, h, v) => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(h)})).setValue(${J(v)});})()`);
const note = (code, h) => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; return sh.notes[findFileRow_(sh, ${J(code)}) + ':' + bfCol_(${J(h)})] || '';})()`);
const masterOf = (code, h) => rows('Interviewees').find(r => r[I.Code] === code)[I[h]];
const set = (code, fields) => call('memberSet', { code, fields }).result;
const save = (code, answers, seen) => call('interviewSave', { code, answers, seen }).result;
const get = code => call('interviewGet', { code }).result;

// c1 has a dashboard form, c2 has none; the sync logs c1's form and fills its two cells
as(mem);
save(c1, full('IT'), '');
as(ADMIN);
call('sync');
assert(masterOf(c1, 'Interview Submitted At'), 'the form is logged');
assert.strictEqual(masterOf(c1, 'Rating'), 7);

// ---- the reminder date: a setting, validated; once passed, one HIGH CLOSE_DUE alert and nothing locks ----
assert.throws(() => call('saveSettings', { values: { INTERVIEW_CLOSE_DATE: 'next week' } }), /INTERVIEW_CLOSE_DATE must be/);
const past = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
call('saveSettings', { values: { INTERVIEW_CLOSE_DATE: past } });
call('sync');
assert.strictEqual(alerts('CLOSE_DUE').length, 1);
assert.strictEqual(alerts('CLOSE_DUE')[0][A.Severity], 'HIGH');
assert.deepStrictEqual(m.call('webState').close.on, false);
assert(m.call('webState').close.date < Date.now());
call('sync');
assert.strictEqual(alerts('CLOSE_DUE').length, 1, 'raised once');

// ---- the preview: counts, nothing written ----
let pv = call('closePreview', {}).result;
assert.strictEqual(pv.on, false);
assert(pv.preview.forms >= 1 && pv.preview.notInterviewed >= 1, J(pv));
assert.deepStrictEqual(pv.preview.doneNoForm, []);
assert.strictEqual(m.call('webState').close.on, false, 'a preview closes nothing');
as(mem);
assert.throws(() => call('interviewClose', { op: 'close' }), /Not allowed/, 'members never close');
assert.throws(() => call('closePreview', {}), /Not allowed/);
as(ADMIN);

// ---- close: a direct write, one log row, the alert clears, both members of every binome are mailed once ----
const sent = outbox().length;
let out = call('interviewClose', { op: 'close' }).result;
assert.strictEqual(out.on, true);
const closed = m.call('webState').close;
assert.deepStrictEqual([closed.on, closed.by], [true, ADMIN]);
assert.strictEqual(alerts('CLOSE_DUE').length, 0, 'closing clears the due alert');
assert.strictEqual(alerts('CLOSE_DUE', 'AUTO-RESOLVED').length + alerts('CLOSE_DUE', 'RESOLVED').length, 1);
const mails = outbox().slice(sent).filter(x => /interview phase is closed/i.test(x.subject));
const people = m.call('webState').binomes.filter(b => b.status === 'ACTIVE' || b.status === 'PAUSED').reduce((n, b) => n + b.people.length, 0);
assert.strictEqual(mails.length, people, 'every member of every binome, once');
assert(/still be interviewed/.test(mails[0].htmlBody), 'the close mail says late interviews stay possible');
const log = rows('Member Changes').filter(r => r[C.Type] === 'PHASE');
assert.deepStrictEqual(log.map(r => [r[C.By], r[C['Out Name']], r[C['In Name']]]), [[ADMIN, 'OPEN', 'CLOSED']]);
assert.strictEqual(outbox().length - sent, mails.length);
assert.strictEqual(call('interviewClose', { op: 'close' }).result.on, true);
assert.strictEqual(outbox().length - sent, mails.length, 'a second close mails nobody');
assert.strictEqual(rows('Member Changes').filter(r => r[C.Type] === 'PHASE').length, 1);
pv = call('closePreview', {}).result;
assert.strictEqual(pv.on, true);

// ---- what locks for the binome: Rating and Final Affectation of a row with a form, and its form; the rest stays open ----
as(mem);
assert.throws(() => call('memberSet', { code: c1, field: 'Rating', value: 3, seen: '7' }), /interview phase is closed/);
let r = set(c1, [{ field: 'Rating', value: 3, seen: '7' }, { field: 'Final Affectation', value: 'HR', seen: 'IT' }, { field: 'Notes', value: 'still open', seen: '' }]);
assert.deepStrictEqual(r.fields.map(f => [f.field, f.error ? 'closed' : 'ok']), [['Rating', 'closed'], ['Final Affectation', 'closed'], ['Notes', 'ok']]);
assert.strictEqual(cell(c1, 'Rating'), 7);
r = set(c1, [{ field: 'Contacted', value: 'Yes', seen: cell(c1, 'Contacted') }]);
assert.strictEqual(r.fields[0].value, 'Yes', 'Contacted stays open');
const g = get(c1);
assert.deepStrictEqual([g.locked, g.edit], [true, false], 'the form reads only');
assert.throws(() => save(c1, full('IT'), g.stamp), /interview phase is closed/);
assert.strictEqual(call('interviewGet', { code: c2 }).result.locked, false);

// a late interview: c2 has no form, so everything is open until the form is saved, and it locks the two fields at once
r = set(c2, [{ field: 'Interview Done', value: true, seen: false }, { field: 'Rating', value: 5, seen: '' }]);
assert.deepStrictEqual(r.fields.map(f => f.value), [true, 5]);
const late = save(c2, full('IT'), '');
assert(late.stamp);
assert.throws(() => call('memberSet', { code: c2, field: 'Rating', value: 6, seen: '5' }), /interview phase is closed/, 'the saved form locks the row at once');
assert.throws(() => save(c2, full('IT'), late.stamp), /interview phase is closed/);

// an admin is locked too on My binome, and changes both through the binome columns, the Master following in the same call
as(ADMIN);
call('adminSet', { code: c1, fields: [{ field: 'Rating', value: 4, seen: '7' }] });
assert.strictEqual(masterOf(c1, 'Rating'), 4, 'the Master took it in the same call');
call('sync'); call('sync');
assert.deepStrictEqual([cell(c1, 'Rating'), masterOf(c1, 'Rating')], [4, 4], 'the guard does not undo an admin');
assert.strictEqual(alerts('LOCKED_EDIT').length, 0, JSON.stringify(alerts('LOCKED_EDIT').map(a => a[A.Message])));
// the admin edits the form from the candidate's details (their own access), closed or not; a form refills only what it filled
let ag = call('interviewGet', { code: c1, admin: true }).result;
assert.deepStrictEqual([ag.edit, ag.locked], [true, false]);
as(mem);
assert.throws(() => call('interviewGet', { code: c1, admin: true }), /Not allowed/, 'a member cannot use the admin entry');
as(ADMIN);
const edited = call('interviewSave', { code: c1, admin: true, answers: Object.assign(full('IT'), { intro: 2 }), seen: ag.stamp }).result;
assert.strictEqual(edited.editedBy, ADMIN, 'stamped as edited by them');
call('sync'); call('sync');
assert.strictEqual(cell(c1, 'Rating'), 4, 'an admin-set Rating stays when the form would put something else');

// ---- the guard: a hand edit of a locked row is put back with a note and one MEDIUM alert; the Master keeps its value ----
put(c1, 'Rating', 9);
call('sync');
assert.deepStrictEqual([cell(c1, 'Rating'), masterOf(c1, 'Rating')], [4, 4]);
assert(/interview phase is closed/i.test(note(c1, 'Rating')), 'a cell note says to ask an admin');
assert.strictEqual(alerts('LOCKED_EDIT').length, 1);
assert.strictEqual(alerts('LOCKED_EDIT')[0][A.Severity], 'MEDIUM');
assert(/"9"/.test(alerts('LOCKED_EDIT')[0][A.Message]) && /Rating/.test(alerts('LOCKED_EDIT')[0][A.Message]));
put(c1, 'Final Affectation', 'HR');
call('sync');
assert.strictEqual(cell(c1, 'Final Affectation'), masterOf(c1, 'Final Affectation'));
assert.strictEqual(alerts('LOCKED_EDIT').length, 2);
// a row with no form is not guarded
put(c3, 'Rating', 8);
call('sync');
assert.strictEqual(cell(c3, 'Rating'), 8);
assert.strictEqual(masterOf(c3, 'Rating'), 8);
// the Interview Answers tab: a hand edit is restored from Dashboard Interviews
const tabCell = () => run(`(function(){var t=__files[${J(fid)}].obj.getSheetByName(IA_TAB), n=t.getLastRow(), v=t.getRange(2,1,n-1,IA_H.length).getValues().filter(function(x){return x[0]===${J(c1)};})[0]; return v[6+qIndex_('intro')];})()`);
const was = tabCell();
run(`(function(){var t=__files[${J(fid)}].obj.getSheetByName(IA_TAB), n=t.getLastRow(), v=t.getRange(1,1,n,IA_H.length).getValues(); for (var i=1;i<n;i++) if (v[i][0]===${J(c1)}) t.getRange(i+1, 7+qIndex_('intro')).setValue(10);})()`);
assert.strictEqual(tabCell(), 10);
call('sync');
assert.strictEqual(tabCell(), was, 'put back from the Master copy');
assert(alerts('LOCKED_EDIT').some(a => /Interview Answers/.test(a[A.Message])));

// ---- timing alerts stop while closed, and come back on a reopen ----
m.backdateAssignments(6);
call('sync');
const timing = () => ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE'].reduce((n, t) => n + alerts(t).length, 0);
assert.strictEqual(timing(), 0, 'none while closed');

// ---- reopen: a reason, mails once, the passed date cleared, rows open again ----
as(mem);
assert.throws(() => call('interviewClose', { op: 'reopen', reason: 'x' }), /Not allowed/);
as(ADMIN);
assert.throws(() => call('interviewClose', { op: 'reopen' }), /needs a reason/);
assert.throws(() => call('interviewClose', { op: 'reopen', reason: 'x', date: 'soon' }), /INTERVIEW_CLOSE_DATE must be/);
const sent2 = outbox().length;
out = call('interviewClose', { op: 'reopen', reason: 'one score was wrong', date: '' }).result;
assert.strictEqual(out.on, false);
assert.strictEqual(m.call('webState').close.on, false);
assert.strictEqual(m.call('webState').close.date, null, 'the date was cleared');
assert.strictEqual(outbox().slice(sent2).filter(x => /open again/i.test(x.subject)).length, people);
assert.deepStrictEqual(rows('Member Changes').filter(r => r[C.Type] === 'PHASE').map(r => [r[C['In Name']], r[C.Reason]]), [['CLOSED', ''], ['OPEN', 'one score was wrong']]);
call('sync');
assert(timing() > 0, 'the timing alerts return on a reopen');
assert.strictEqual(alerts('CLOSE_DUE').length, 0, 'no due alert once the date is cleared');
as(mem);
assert.strictEqual(set(c1, [{ field: 'Rating', value: 6, seen: cell(c1, 'Rating') }]).fields[0].value, 6, 'rows unlock at once');
const g2 = get(c1);
assert.deepStrictEqual([g2.locked, g2.edit], [false, true]);
console.log('close.test.js ok');
