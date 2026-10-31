// How a phase-1 result is decided (docs/admin-features.md): the proposal and the override, the needs-a-decision list, the bulk
// Not accepted, going final (vic.rh, closed phase), reopening, corrections, and what binomes see.
const assert = require('assert');
const J = JSON.stringify, ADMIN = 'admin@g.enp.edu.dz';
const m = require('./seed')();
['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
m.addRegistrations(12, 3);
m.call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
m.call('webRun', 'sync');
const run = m.run, call = (a, args) => m.call('webRun', a, args).result;
const I = run('idx_(IV_H)'), C = run('idx_(IC_H)');
const ivTab = () => JSON.parse(run(`JSON.stringify(master.getSheetByName('Interviewees').getDataRange().getValues().slice(1))`));
const colOf = (code, h) => ivTab().find(r => r[I.Code] === code)[I[h]];
const setMaster = (code, h, v) => run(`(function(){var sh=master.getSheetByName('Interviewees'),d=sh.getDataRange().getValues(),i=d.findIndex(function(r){return r[${I.Code}]===${J(code)}}); sh.getRange(i+1,${I[h] + 1}).setValue(${J(v)});})()`);
const changes = () => JSON.parse(run(`JSON.stringify(master.getSheetByName('Interviewee Changes').getDataRange().getValues().slice(1))`));
const codes = ivTab().filter(r => r[I.Code] && r[I.Binome]).map(r => r[I.Code]);
assert(codes.length >= 6, 'seed has candidates');
const [a, b, c, d, e] = codes;

// the proposal is the result until someone overrides it
setMaster(a, 'Final Affectation', 'IT'); setMaster(a, '1st Choice', 'IT');
setMaster(b, 'Final Affectation', 'HR'); setMaster(b, '1st Choice', 'IT'); setMaster(b, '2nd Choice', 'COMM');
let v = call('p1View', {});
let row = x => v.rows.find(r => r.code === x);
assert.strictEqual(row(a).result, 'IT');
assert.strictEqual(row(a).warn, false);
assert.strictEqual(row(b).warn, true, 'HR is neither choice');
assert.strictEqual(row(c).needs, true, 'no proposal, no override');
assert(v.counts.IT >= 1 && v.needs >= 1);

// what the results view shows beside the result: name, choices, rating, the binome's notes, whether they were interviewed
setMaster(b, 'Rating', 7.5); setMaster(b, 'Binome Notes', 'Strong on the practical questions');
v = call('p1View', {});
assert.deepStrictEqual([row(b).c1, row(b).c2, row(b).rating, row(b).notes], ['IT', 'COMM', 7.5, 'Strong on the practical questions']);
assert(row(b).name && row(b).name === [colOf(b, 'First Name'), colOf(b, 'Family Name')].join(' ').trim(), 'name = first + family name');
assert.strictEqual(row(c).rating, null, 'no rating yet');
assert.strictEqual(typeof row(c).interviewed, 'boolean');

// an override, with a note, logged; the proposal later changing is shown
let r = call('p1Set', { code: a, value: 'COMM', note: 'better fit', seen: '' });
assert.strictEqual(r.end, 'applied');
assert.strictEqual(colOf(a, 'Phase 1 Result'), 'COMM');
assert.strictEqual(call('p1Set', { code: a, value: 'COMM' }).end, 'met');
assert(changes().some(x => x[C.Code] === a && /^Phase 1 Result set \(proposal: IT\): better fit/.test(x[C.What])), 'logged with the note');
setMaster(a, 'Final Affectation', 'FLER');
v = call('p1View', {});
assert.strictEqual(row(a).result, 'COMM', 'an override stays');
assert.strictEqual(row(a).changed, true, 'the view shows the proposal changed');
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === a).note, 'better fit', 'the override note comes with the row (admins only)');
// a stale seen is dropped with the sheet's value; a bad value is refused
assert.deepStrictEqual(JSON.parse(J(call('p1Set', { code: a, value: 'IT', seen: 'HR' }))), { end: 'dropped', sheet: 'COMM' });
assert.throws(() => call('p1Set', { code: a, value: 'NOPE' }), /must be one of/);
// clearing goes back to following the proposal
assert.strictEqual(call('p1Set', { code: a, value: '', seen: 'COMM' }).end, 'applied');
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === a).result, 'FLER');
setMaster(a, 'Final Affectation', 'IT');

// the pending path: the apply entry's 'result' kind, judged against the column as it is
const apply = (...cs) => m.call('webApply', { v: 1, changes: cs.map((c, i) => Object.assign({ id: 'r' + i, kind: 'result', at: Date.now() }, c)) }).results;
let ap = apply({ code: e, value: 'IT', seen: '', note: 'x' }, { code: e, value: 'IT', seen: '' }, { code: 'NOPE.1', value: 'IT', seen: '' }, { code: e, value: 'XX', seen: '' });
assert.deepStrictEqual(ap.map(x => x.end), ['applied', 'met', 'dropped', 'dropped']);
assert.strictEqual(colOf(e, 'Phase 1 Result'), 'IT');
ap = apply({ code: e, value: 'HR', seen: '' });
assert.deepStrictEqual([ap[0].end, ap[0].sheet], ['dropped', 'IT'], 'someone set it since the author saw it');
apply({ code: e, value: '', seen: 'IT' });
assert.strictEqual(colOf(e, 'Phase 1 Result'), '');
const P = require('../web/lib/pending');
assert(P.valid({ kind: 'result', code: 'IT.12', value: 'HR', seen: '', at: 1 }) && !P.valid({ kind: 'result', code: 'x y', value: 'HR', seen: '', at: 1 }));

// the bulk action: never-interviewed candidates without a result go to Not accepted
let pv = call('p1Never', { op: 'preview' });
assert(pv.codes.includes(c) && !pv.codes.includes(a) && !pv.applied);
assert.strictEqual(colOf(c, 'Phase 1 Result'), '', 'a preview writes nothing');
pv = call('p1Never', { op: 'apply' });
assert.strictEqual(colOf(c, 'Phase 1 Result'), 'Not accepted');
assert.strictEqual(call('p1View', {}).needs, 0);
assert(changes().some(x => x[C.Code] === c && /Never interviewed/.test(x[C.What])));

// final: vic.rh only, closed phase only
const owner = run('lc_(ss_().getOwner().getEmail())');
let pr = call('p1Final', { op: 'preview' });
assert.strictEqual(pr.owner, owner === ADMIN);
assert(pr.refusals.some(x => /interview phase is still open/.test(x)));
if (owner !== ADMIN) assert.throws(() => call('p1Final', { op: 'final' }), /Only vic\.rh/);
run(`master.getOwner = function(){ return { getEmail: function(){ return ${J(ADMIN)}; } }; }`);
assert.throws(() => call('p1Final', { op: 'final' }), /still open/);
call('interviewClose', { op: 'close' });
assert.deepStrictEqual(call('p1Final', { op: 'preview' }).refusals, []);
setMaster(d, 'Final Affectation', ''); setMaster(d, 'Phase 1 Result', '');
if (call('p1View', {}).rows.find(x => x.code === d).needs) assert.throws(() => call('p1Final', { op: 'final' }), /still need a decision/);
call('p1Set', { code: d, value: 'HR' });
const pre = call('p1View', {}).rows.map(x => [x.code, x.result]);
const fin = call('p1Final', { op: 'final' });
assert.strictEqual(fin.final, true);
pre.forEach(([code, res]) => assert.strictEqual(colOf(code, 'Phase 1 Result'), res, code + ' copied'));
// later edits to Final Affectation change nothing; an override is refused
setMaster(b, 'Final Affectation', 'IT');
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === b).result, pre.find(x => x[0] === b)[1]);
assert.throws(() => call('p1Set', { code: b, value: 'IT' }), /final/);

// reopen: rows equal to their proposal go back to following it, the others stay overrides
setMaster(b, 'Final Affectation', 'HR');
setMaster(a, 'Final Affectation', 'IT');
call('p1Final', { op: 'reopen' });
assert.strictEqual(call('p1View', {}).final, null);
assert.strictEqual(colOf(a, 'Phase 1 Result'), '', 'equal to the proposal: follows it again');
assert.strictEqual(colOf(c, 'Phase 1 Result'), 'Not accepted', 'differs: stays an override');
call('p1Final', { op: 'final' });

// corrections: a reason is required; before the first mail, only for a row with no result
assert.throws(() => call('p1Final', { op: 'correct', code: d, value: 'IT', reason: '' }), /reason/);
assert.throws(() => call('p1Final', { op: 'correct', code: d, value: 'IT', reason: 'x' }), /reopen/);
// a mail has gone: a correction applies and is logged; binomes now see results
const told = run('IV_H.length') + 1;
run(`(function(){var sh=master.getSheetByName('Interviewees'); sh.getRange(1,${told}).setValue('Result Told'); sh.getRange(2,${told}).setValue('IT 12/11');})()`);
assert.throws(() => call('p1Final', { op: 'reopen' }), /first result mail/);
const fx = call('p1Final', { op: 'correct', code: b, value: 'COMM', reason: 'club decision' });
assert.strictEqual(fx.end, 'applied');
assert.strictEqual(colOf(b, 'Phase 1 Result'), 'COMM');
assert(changes().some(x => x[C.Code] === b && x[C.What] === 'Phase 1 Result correction: club decision' && x[C.To] === 'COMM'));
// binomes: results only once the first mail has gone
const slice = () => JSON.parse(run('JSON.stringify(binSlices_(loadCtx_()))'));
const mine = Object.values(slice()).flatMap(s => s.candidates).find(x => x.Code === b);
assert.strictEqual(mine.result, 'COMM');
run(`master.getSheetByName('Interviewees').getRange(2,${told}).setValue('')`);
assert(Object.values(slice()).flatMap(s => s.candidates).every(x => x.result === undefined), 'no result before the first mail');
console.log('phase1 ok');
