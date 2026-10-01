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

addRegistrations(12, 3);
out = call('webRun', 'sync');
assert.deepStrictEqual(out.messages, ['Full sync done ✅']);
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
run("(function(){var sh=ss_().getSheetByName('Settings'),v=sh.getRange(2,1,sh.getLastRow()-1,1).getValues();v.forEach(function(r,i){if(r[0]==='TEST_MODE')sh.getRange(i+2,2).setValue(false);});_settings=null;})()");
out = call('webRun', 'reshare');
assert(/new share/.test(out.messages[0]), out.messages[0]);
out = call('webRun', 'setup');
assert(/Setup done/.test(out.messages[0]), 'setup works without an active spreadsheet');

assert.throws(() => call('webRun', 'nope'), /Unknown action/);
assert.strictEqual(run('_webOut'), null, 'buffer reset after a throw');

// access control
run('var __realSession = Session; Session = { getEffectiveUser: () => ({ getEmail: () => "admin@g.enp.edu.dz" }), getActiveUser: () => ({ getEmail: () => "stranger@g.enp.edu.dz" }) }');
assert.throws(() => call('webState'), /Not allowed/);
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
run('Session.getActiveUser = () => ({ getEmail: () => "" })');
assert.throws(() => call('webState'), /Not allowed/, 'hidden email is denied');
run('Session = __realSession');

console.log('WEB OK');
