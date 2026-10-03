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
assert.strictEqual(call('webRun', 'draft').messages[0].includes('already locked'), true, 'this is the refusal the reset gets around');

assert.throws(() => call('webRun', 'resetBinomes', {}), /Type exactly/, 'no phrase');
assert.throws(() => call('webRun', 'resetBinomes', { phrase: 'i confirm to reset the binomes' }), /Type exactly/, 'case matters');
assert.strictEqual(call('webState').binomes.length, had, 'a refused reset changes nothing');

const out = call('webRun', 'resetBinomes', { phrase: 'I confirm to reset the binomes' });
assert.strictEqual(out.result.binomes, had);
assert.strictEqual(out.result.trashed, had);
assert.deepStrictEqual(out.result.failed, []);
assert(/Binomes reset/.test(out.messages[0]), out.messages[0]);
files.forEach(id => assert.strictEqual(run(`__files[${JSON.stringify(id)}].trashed`), true, 'sheet trashed'));

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

// start over: new team, draft (no longer refused), lock; waiting interviewees are placed again
call('webRun', 'importTeam', { link: '' });
assert(/Drafted \d+ binomes/.test(call('webRun', 'draft').messages[0]));
call('webRun', 'lock');
st = call('webState');
assert(st.binomes.length > 0 && st.interviewees.filter(i => i.binome).length > 0, 'interviewees placed in the new binomes');
console.log('RESET OK');
