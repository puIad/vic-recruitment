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
  out = call('webRun', 'changeMember', { binome: b1.code, outEmail: leaving, inName: 'Outside Person', inEmail: 'EXT@g.enp.edu.dz', reason: 'left the club' });
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

// ---- temporary cover, linked by interviewee code ----
{
  const ivs = call('webState').interviewees.filter(i => ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status) && i.binome);
  const bin = ivs.find(i => ivs.filter(j => j.binome === i.binome).length >= 2).binome, mine = ivs.filter(i => i.binome === bin).slice(0, 2);
  const b = call('webState').binomes.find(x => x.code === bin), member = b.people[0].email;
  const cb = call('webState').binomes.find(x => x.code !== bin && x.people.length), coverer = cb.people[0];
  const other = ivs.find(i => i.binome !== bin && i.binome !== cb.code);
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
}
{ // sharing on: a cover person gets view-only access for the cover, taken back when it ends
  const iv = call('webState').interviewees.find(i => ['ASSIGNED', 'CONTACTED', 'SCHEDULED'].includes(i.status) && i.binome);
  const id = call('webState').binomes.find(x => x.code === iv.binome).fileUrl.split('/d/')[1];
  call('webRun', 'addCover', { codes: iv.code, inName: 'Stand In', inEmail: 'standin@g.enp.edu.dz' });
  assert(run('(__files["' + id + '"].viewers || []).includes("standin@g.enp.edu.dz") && !__files["' + id + '"].editors.includes("standin@g.enp.edu.dz")'), 'view-only');
  call('webRun', 'endCover', { row: call('webState').covers[0].row });
  assert(!run('(__files["' + id + '"].viewers || []).includes("standin@g.enp.edu.dz")'), 'access taken back');
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
