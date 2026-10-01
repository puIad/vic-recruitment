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
assert.deepStrictEqual(call('webAccess'), { ok: true, email: 'helper@g.enp.edu.dz', reason: '', owner: false, v: 1 });
assert.strictEqual(call('webState').owner, false);
assert.throws(() => call('webRun', 'setup'), /Only the owner/, 'an editor cannot run Setup');
assert.throws(() => run('installTriggers_(ss_())'), /triggers belong to admin@g.enp.edu.dz/, 'menu path: a second account cannot double the triggers');
run('ss_().addEditor("someone@gmail.com"); __as("someone@gmail.com")');
assert.deepStrictEqual(call('webAccess'), { ok: false, email: 'someone@gmail.com', reason: 'DOMAIN', owner: false, v: 1 }, 'non-ENP editor refused');
assert.throws(() => call('webRun', 'sync'), /Not allowed/);
{
  run('__as("stranger@g.enp.edu.dz")');
  assert.strictEqual(call('webAccess').reason, 'READ_ONLY');
}
run('__as("admin@g.enp.edu.dz")');
assert.deepStrictEqual([call('webAccess').owner, call('webState').owner, call('webState').v], [true, true, 1]);
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
