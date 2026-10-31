// webRun interviewForms (admins read one candidate's interview forms) and the per-binome tracker counts of webState
const assert = require('assert');
const J = JSON.stringify, ADMIN = 'admin@g.enp.edu.dz';
const m = require('./seed')();
['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
m.addRegistrations(30, 3);
m.call('webRun', 'sync');
m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
const as = e => m.run('__as(' + J(e) + ')');
const st0 = m.call('webState');
const ivOf = code => st0.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
const b1 = st0.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 3), [mem] = b1.people.map(p => p.email);
const [c1, c2, c3] = ivOf(b1.code);
m.run('__acl = true');
m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
m.call('webRun', 'sync');
const Q = JSON.parse(m.run('JSON.stringify(INTERVIEW_QUESTIONS)'));
const full = (dept, extra) => {
  const a = {};
  Q.filter(q => ['first', 'final', dept].includes(q.section)).forEach(q => { a[q.id] = q.type === 'score' ? 7 : q.type === 'choice' ? q.options[0] : 'Calm and clear'; });
  return Object.assign(a, { firstChoice: dept, finalDep: dept }, extra || {});
};
const forms = args => m.call('webRun', 'interviewForms', args).result;
const dept = c => st0.interviewees.find(i => i.code === c).dept;

// a dashboard form by a member of the binome, an edit of it, then a Google Form for another candidate
as(mem);
const s1 = m.call('webRun', 'interviewSave', { code: c1, answers: full(dept(c1), { intro: 9, conclusion: 'Strong' }), seen: '' }).result;
m.call('webRun', 'interviewSave', { code: c1, answers: full(dept(c1), { intro: 5, conclusion: 'Strong' }), seen: s1.stamp });
as(ADMIN);
m.run(`master.getSheetByName('Interview Responses').cells.push([new Date(), ${J(mem)}, ${J(b1.code)}, ${J(c2)}, 8, ${J(dept(c2))}, ${J(dept(c2))}, 'great energy'])`);
m.run('onFormSubmitHandler({})');
m.call('webRun', 'sync');

const pulse = m.call('webPulse');
let f = forms({ code: c1 });
assert.deepStrictEqual([f.code, f.forms.length, f.forms[0].source, f.forms[0].counts, f.forms[0].result, f.forms[0].by, f.forms[0].answers.intro, String(f.forms[0].answers.conclusion).replace(/^'/, ''), !!f.forms[0].editedAt, f.forms[0].editedBy],
  [c1, 1, 'Dashboard', true, 'OK', mem, 5, 'Strong', true, mem], J(f.forms[0]));
assert(f.name && f.questions.length === Q.length && f.sections.length, 'the questions come with the read');
assert(typeof f.forms[0].rating === 'number', 'the average of its scores');
f = forms({ code: c2 });
assert.deepStrictEqual([f.forms.length, f.forms[0].source, f.forms[0].counts, f.forms[0].answers.intro, f.forms[0].answers.anything, f.forms[0].editedAt],
  [1, 'Google Form', true, 8, 'great energy', ''], J(f.forms[0]));
assert.strictEqual(m.call('webPulse'), pulse, 'a read publishes nothing');
assert.deepStrictEqual(forms({ code: c3 }).forms, [], 'no form yet');
assert.throws(() => forms({ code: 'NO.00' }), /Unknown code/);
assert.throws(() => forms({}), /Not allowed/);

// a second Google Form for c2: a duplicate, both listed, the first counts, and either alert key reaches both
m.run(`master.getSheetByName('Interview Responses').cells.push([new Date(Date.now() + 60000), ${J(mem)}, ${J(b1.code)}, ${J(c2)}, 3, ${J(dept(c2))}, ${J(dept(c2))}, 'second try'])`);
m.run('onFormSubmitHandler({})');
const dup = m.call('webState').alerts.find(a => a.type === 'DUPLICATE_INTERVIEW' && a.code === c2);
assert(dup, 'DUPLICATE_INTERVIEW');
f = forms({ code: c2 });
assert.deepStrictEqual([f.forms.length, f.forms.map(x => x.counts), f.forms.map(x => x.answers.intro), f.forms.map(x => x.result)], [2, [true, false], [8, 3], ['OK', 'FLAGGED']], J(f.forms.map(x => x.result)));
assert.deepStrictEqual(forms({ key: f.forms[1].key }).forms.map(x => x.key), f.forms.map(x => x.key));

// a form matching no candidate has no details to open: reached by its log key
m.run(`master.getSheetByName('Interview Responses').cells.push([new Date(Date.now() + 120000), ${J(mem)}, ${J(b1.code)}, 'XX.99', 6, 'IT', 'IT', 'who?'])`);
m.run('onFormSubmitHandler({})');
const unk = m.call('webState').alerts.find(a => a.type === 'UNKNOWN_INTERVIEWEE');
assert(unk, 'UNKNOWN_INTERVIEWEE');
const lk = m.run('(function () { var t = loadTable_(TAB.LOG, LOG_H); return String(t.data[t.data.length - 1][t.I["Response Key"]]); })()');
f = forms({ key: lk });
assert.deepStrictEqual([f.code, f.forms.length, f.forms[0].answers.intro, f.forms[0].counts], ['', 1, 6, false]);

// admins only
as(mem);
assert.throws(() => forms({ code: c1 }), /Not allowed/);
as(ADMIN);

// the Binomes table's counts: the same ones the Tracker tab carries
const row = m.call('webState').binomes.find(b => b.code === b1.code), tr = m.run('JSON.stringify(ss_().getSheetByName("Tracker").getDataRange().getValues())');
const trow = JSON.parse(tr).find(r => r[0] === b1.code);
assert.deepStrictEqual([row.contacted, row.scheduled, row.notContacted, row.noDate, row.overdue], [trow[4], trow[5], trow[8], trow[9], trow[10]], J([row, trow]));
console.log('FORMS OK');
