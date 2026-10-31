// Telling candidates their result (docs/admin-features.md): the three mails, Send results, Result Told, the vic-enp push and the join
// link, corrections, Resend and the timed sync's link push.
const assert = require('assert'), crypto = require('crypto');
const J = JSON.stringify, ADMIN = 'admin@g.enp.edu.dz', SECRET = 'join-secret-test';
const m = require('./seed')();
['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
m.addRegistrations(12, 3);
m.call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
m.call('webRun', 'sync');
const run = m.run, call = (a, args) => m.call('webRun', a, args).result, R = c => JSON.parse(run('JSON.stringify(' + c + ')'));
const I = run('idx_(IV_H)');
const ivTab = () => R(`master.getSheetByName('Interviewees').getDataRange().getValues().slice(1)`);
const colOf = (code, h) => ivTab().find(r => r[I.Code] === code)[I[h]];
const setMaster = (code, h, v) => run(`(function(){var sh=master.getSheetByName('Interviewees'),d=sh.getDataRange().getValues(),i=d.findIndex(function(r){return r[${I.Code}]===${J(code)}}); sh.getRange(i+1,${I[h] + 1}).setValue(${J(v)});})()`);
const mailLog = () => { const d = R(`master.getSheetByName('Mail Log').getDataRange().getValues()`), h = d[0]; return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
run('var __send = MailApp.sendEmail');
const failMail = pattern => run(`MailApp.sendEmail = function (o) { if (${pattern}.test(o.to)) throw new Error("quota"); return __send(o); }`);
const okMail = () => run('MailApp.sendEmail = __send');
const box = () => R('__outbox');

// a fake vic-enp: remembers the pushes, and can refuse
run(`var __joinCalls = [], __joinOK = true;
__fetch = function (url, o) {
  if (/\\/api\\/join-sync$/.test(url)) { if (o.headers.Authorization !== 'Bearer ${SECRET}') return { code: 401, body: {} }; __joinCalls.push(JSON.parse(o.payload)); return { code: __joinOK ? 200 : 500, body: { ok: true } }; }
  if (/\\/api\\/join-clicks$/.test(url)) return { code: 200, body: { clicks: { 'IT.1': 1700000000000 } } };
  throw new Error('no network in the mock: ' + url);
}`);
const calls = () => R('__joinCalls');

const codes = ivTab().filter(r => r[I.Code] && r[I.Binome]).map(r => r[I.Code]);
assert(codes.length >= 8, 'seed has candidates');
// proposals: departments in turn, one Not accepted who was interviewed, one Not accepted who was not
const dept = ['IT', 'COMM', 'FLER', 'HR'];
codes.forEach((c, i) => { setMaster(c, 'Final Affectation', dept[i % 4]); setMaster(c, 'Status', 'ASSIGNED'); setMaster(c, 'Email', c.toLowerCase().replace('.', '_') + '@g.enp.edu.dz'); });
const [niv, nni, gone, badAddr] = codes.slice(-4);
setMaster(niv, 'Final Affectation', 'Not accepted'); setMaster(niv, 'Status', 'INTERVIEWED');
setMaster(nni, 'Final Affectation', 'Not accepted');
setMaster(gone, 'Status', 'DECLINED'); setMaster(gone, 'Final Affectation', '');
setMaster(badAddr, 'Email', 'not-an-address');
const owner = run('lc_(ss_().getOwner().getEmail())');

// nothing before the results are final
let pv = call('resultsMail', { op: 'preview' });
assert(pv.refusals.some(x => /not final/.test(x)), 'refused while the results are not final');
assert.strictEqual(pv.total, 0);
assert.throws(() => call('resultsMail', { op: 'send' }), /Only vic\.rh|not final/);

// go final
run(`master.getOwner = function(){ return { getEmail: function(){ return ${J(ADMIN)}; } }; }`);
call('interviewClose', { op: 'close' });
call('p1Final', { op: 'final' });
pv = call('resultsMail', { op: 'preview' });
assert.strictEqual(pv.final, true);
const eligible = codes.filter(c => c !== gone && c !== badAddr);
assert.strictEqual(pv.total, eligible.length, 'everyone with a result and an address; not DECLINED, not a bad address');
assert.deepStrictEqual(pv.skipped.map(x => x.code), [badAddr], 'the bad address is listed; a candidate with no result is not');
assert.deepStrictEqual(pv.counts.RESULT_YES.IT + pv.counts.RESULT_YES.COMM + pv.counts.RESULT_YES.FLER + pv.counts.RESULT_YES.HR + pv.counts.RESULT_NO + pv.counts.RESULT_NO_NI, pv.total);
assert.strictEqual(pv.counts.RESULT_NO, 1); assert.strictEqual(pv.counts.RESULT_NO_NI, 1);
assert.deepStrictEqual(pv.notInterviewed.map(x => x.code), [nni], 'a not-interviewed candidate with a binome proposal is listed, to check their form first');
assert.strictEqual(pv.samples.length, 6, 'four accepted and two not accepted, drawn with real data');
assert.deepStrictEqual(pv.samples.map(s => s.kind), ['RESULT_YES', 'RESULT_YES', 'RESULT_YES', 'RESULT_YES', 'RESULT_NO', 'RESULT_NO_NI']);
assert(pv.samples.every(s => /<!DOCTYPE html>/.test(s.html) && s.subject));
assert(!/interview/i.test(pv.samples[5].html), 'the not-interviewed text never mentions an interview');
// refused until each department has a next step and a group link, and the join secret is set
assert(pv.refusals.some(x => /IT has accepted candidates and no next step/.test(x)) && pv.refusals.some(x => /no group link/.test(x)));
assert(pv.refusals.some(x => /JOIN_URL and JOIN_SECRET/.test(x)));
assert.throws(() => call('resultsMail', { op: 'send' }), /no next step/);
// settings: group links are checked
assert.throws(() => call('saveSettings', { values: { RESULT_GROUP_IT: 'http://insecure.example' } }), /https link/);
const settings = {}; dept.forEach(d => { settings['RESULT_NEXT_' + d] = 'Next for ' + d + ': say hello in the group.'; settings['RESULT_GROUP_' + d] = 'https://m.me/j/' + d + 'group'; });
call('saveSettings', { values: settings });
run(`__props.JOIN_URL = 'https://join.test'; __props.JOIN_SECRET = ${J(SECRET)}`);
pv = call('resultsMail', { op: 'preview' });
assert.deepStrictEqual(pv.refusals, [], 'ready to send');

// test: one copy of each mail to the presser, nobody marked, the push not made
let n0 = box().length;
let t = call('resultsMail', { op: 'test' });
const testMails = box().slice(n0);
assert.strictEqual(testMails.length, 6);
assert(testMails.every(x => x.to === ADMIN && /^\[TEST\]/.test(x.subject)));
assert(testMails.slice(0, 4).every(x => /join\.test\/join\/TEST~[\w-]{22}/.test(x.htmlBody)), 'a test link carries the TEST token');
assert.strictEqual(ivTab().filter(r => r[I['Result Told']]).length, 0, 'test mode marks nobody');
assert.strictEqual(calls().length, 0);
assert.strictEqual(call('p1View', {}).mails, false, 'test rows are not the first result mail: Reopen stays available');

// send: vic.rh only
assert.throws(() => run(`resultsMailCore_({ email: 'someone.else@g.enp.edu.dz' }, { op: 'send' })`), /Only vic.rh/);

// a failed push sends nothing
run('__joinOK = false');
n0 = box().length;
assert.throws(() => call('resultsMail', { op: 'send' }), /push to vic-enp failed/);
assert.strictEqual(box().length, n0, 'nothing was sent');
assert.strictEqual(ivTab().filter(r => r[I['Result Told']]).length, 0);
run('__joinOK = true; __joinCalls.length = 0');

// the words typed in the dialog are saved before the first mail, as a logged direct write
const texts = { RESULT_NO: { text: 'Hi {first}, thank you. We are sorry.' } };
// one address fails: it gets a Failed row, no Result Told, and Send again reaches it
const failing = eligible[1];
failMail(`/${failing.toLowerCase().replace('.', '_')}@/`);
n0 = box().length;
let s = call('resultsMail', { op: 'send', texts: texts, nexts: { IT: 'Next for IT: say hello in the group, edited.' } });
assert.deepStrictEqual([s.sent, s.failed, s.left], [eligible.length - 1, 1, 0]);
const sentMails = box().slice(n0).filter(x => x.name === 'VIC Recruitment');
assert.strictEqual(sentMails.length, eligible.length - 1);
assert.strictEqual(colOf(failing, 'Result Told'), '', 'a failed mail is not marked');
eligible.filter(c => c !== failing).forEach(c => assert(/^(IT|COMM|FLER|HR|Not accepted) \d\d\/\d\d$/.test(colOf(c, 'Result Told')), c + ' marked'));
assert.strictEqual(colOf(eligible[0], 'Result Told').split(' ')[0], colOf(eligible[0], 'Phase 1 Result'), 'the mark holds the result');
assert.strictEqual(colOf(badAddr, 'Result Told'), '');
assert.strictEqual(colOf(gone, 'Result Told'), '');
const push = calls()[0];
assert.strictEqual(push.links.IT, 'https://m.me/j/ITgroup');
assert.strictEqual(push.told[eligible[0]], colOf(eligible[0], 'Phase 1 Result'), 'vic-enp gets each candidate\'s department');
assert.strictEqual(push.told[failing], colOf(failing, 'Phase 1 Result'), 'the candidate about to be told too');
// the token: code ~ the first 22 characters of HMAC('join:' + code)
const accepted = sentMails.find(x => x.to === eligible[0].toLowerCase().replace('.', '_') + '@g.enp.edu.dz');
const tok = /join\.test\/join\/([^"]+)"/.exec(accepted.htmlBody)[1], [tc, ts] = tok.split('~');
assert.strictEqual(tc, eligible[0]);
assert.strictEqual(ts, crypto.createHmac('sha256', SECRET).update('join:' + eligible[0]).digest('base64url').slice(0, 22));
assert(/Next for IT: say hello in the group, edited\./.test(sentMails.map(x => x.htmlBody).find(h => /Next for IT/.test(h))), 'the edited next step went out');
assert(sentMails.some(x => /We are sorry/.test(x.htmlBody)), 'the edited text went out');
assert.strictEqual(call('p1View', {}).mails, true, 'the first result mail has gone');
assert.strictEqual(R(`S_().MAIL_RESULT_NO_TEXT`), texts.RESULT_NO.text, 'the edit was saved to Settings');
// the mail log rows carry the code and the result; the failed one is stored
const rows = mailLog().filter(r => /^RESULT_/.test(r.Kind));
assert.strictEqual(rows.filter(r => r.Outcome === 'Sent').length, eligible.length - 1);
const fr = rows.find(r => r.Outcome === 'Failed');
assert(fr && fr.Concerns.split(', ')[0] === failing && fr['Stored mail'], 'the failed mail is stored with its code and result');
assert(call('p1View', {}).send.left === 1 && call('p1View', {}).send.told === eligible.length - 1);
// Send again reaches only the failed one
okMail(); run('__joinCalls.length = 0');
n0 = box().length;
s = call('resultsMail', { op: 'send' });
assert.deepStrictEqual([s.sent, s.failed, s.left], [1, 0, 0]);
assert.strictEqual(box().slice(n0).length, 1);
assert(colOf(failing, 'Result Told'), 'now marked');
assert.throws(() => call('resultsMail', { op: 'send' }), /Nobody is left/);

// corrections: a changed result is a mail owed; the dialog previews it, with the replaces line for someone told
const [c1, c2] = [eligible[2], eligible[3]];
const was = colOf(c1, 'Phase 1 Result'), to = was === 'IT' ? 'HR' : 'IT';
call('p1Final', { op: 'correct', code: c1, value: to, reason: 'club decision' });
let view = call('p1View', {});
assert.strictEqual(view.rows.find(x => x.code === c1).owed, true, 'Mail owed');
assert.strictEqual(view.rows.find(x => x.code === c2).owed, false);
assert.strictEqual(view.send.owed, 1);
assert.strictEqual(call('resultsMail', { op: 'preview' }).total, 0, 'Send results never picks up owed corrections');
assert.throws(() => call('resultMailOne', { op: 'preview', code: c2 }), /already told/);
const one = call('resultMailOne', { op: 'preview', code: c1 });
assert.strictEqual(one.result, to);
assert(/replaces the one we sent you earlier/.test(one.html) && one.replaces, 'the replaces line for someone already told');
const edited = call('resultMailOne', { op: 'preview', code: c1, replaces: 'Ignore the first mail.' });
assert(/Ignore the first mail\./.test(edited.html));
assert.throws(() => run(`resultMailOneCore_({ email: 'someone.else@g.enp.edu.dz' }, { op: 'send', code: '${c1}' })`), /Only vic.rh/);
run('__joinCalls.length = 0'); n0 = box().length;
const ro = call('resultMailOne', { op: 'send', code: c1, replaces: 'Ignore the first mail.' });
assert.strictEqual(ro.sent, true);
assert.strictEqual(box().slice(n0).length, 1);
assert.strictEqual(calls()[0].told[c1], to, 'vic-enp is told the new department before the mail goes');
assert.strictEqual(colOf(c1, 'Result Told').split(' ')[0], to);
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === c1).owed, false);
assert.throws(() => call('resultMailOne', { op: 'send', code: c1 }), /already told/);
// a correction to Not accepted for someone told as accepted: the not-accepted mail, and vic-enp is told
const c3 = eligible[4], c3was = colOf(c3, 'Phase 1 Result');
call('p1Final', { op: 'correct', code: c3, value: 'Not accepted', reason: 'withdrew from the club' });
run('__joinCalls.length = 0');
call('resultMailOne', { op: 'send', code: c3 });
assert.strictEqual(calls()[0].told[c3], 'Not accepted');
assert.strictEqual(colOf(c3, 'Result Told').indexOf('Not accepted'), 0);
// a late first result (no result at final): decided through a correction, normal mail, no replaces line
setMaster(gone, 'Status', 'ASSIGNED'); setMaster(gone, 'Email', 'late_one@g.enp.edu.dz');
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === gone).needs, true, 'shows as Needs a decision');
call('p1Final', { op: 'correct', code: gone, value: 'FLER', reason: 'late interview' });
assert.strictEqual(call('p1View', {}).rows.find(x => x.code === gone).owed, true);
const late = call('resultMailOne', { op: 'preview', code: gone });
assert(!/replaces the one we sent/.test(late.html) && late.replaces === '' && late.told === '');
call('resultMailOne', { op: 'send', code: gone });
assert(/^FLER /.test(colOf(gone, 'Result Told')));

// Resend: a failed result mail resent writes its Result Told; a result changed since can only be dismissed
const c4 = eligible[5], c5 = eligible[6];
const mark = c => run(`(function(){var sh=master.getSheetByName('Interviewees'),d=sh.getDataRange().getValues(),i=d.findIndex(function(r){return r[${I.Code}]===${J(c)}}); sh.getRange(i+1,${I['Result Told'] + 1}).setValue('');})()`);
[c4, c5].forEach(c => { call('p1Final', { op: 'correct', code: c, value: colOf(c, 'Phase 1 Result') === 'HR' ? 'COMM' : 'HR', reason: 'test' }); });
failMail('/' + c4.toLowerCase().replace('.', '_') + '|' + c5.toLowerCase().replace('.', '_') + '/');
mark(c4); mark(c5);
call('resultMailOne', { op: 'send', code: c4 }); call('resultMailOne', { op: 'send', code: c5 });
okMail();
assert.strictEqual(colOf(c4, 'Result Told'), '', 'failed: not marked');
let rp = call('mailResendPreview', {});
const f4 = rp.mails.find(x => x.concerns.split(', ')[0] === c4), f5 = rp.mails.find(x => x.concerns.split(', ')[0] === c5);
assert(f4 && f5 && f4.stale === '');
// c5's result changes before the resend
const c5now = colOf(c5, 'Phase 1 Result');
call('p1Final', { op: 'correct', code: c5, value: c5now === 'IT' ? 'FLER' : 'IT', reason: 'changed again' });
rp = call('mailResendPreview', {});
assert(/result changed since/.test(rp.mails.find(x => x.concerns.split(', ')[0] === c5).stale), 'a changed result can only be dismissed');
const rs = call('mailResend', { send: [f4.id], dismiss: [] });
assert.strictEqual(rs.sent, 1);
assert(/^(IT|COMM|FLER|HR) \d\d\/\d\d$/.test(colOf(c4, 'Result Told')), 'Resend wrote the Result Told');

// clicks: read through the script from vic-enp; the secret is checked there
assert.deepStrictEqual(call('resultClicks', {}), { ok: true, clicks: { 'IT.1': 1700000000000 } });
run(`var __f = __fetch; __fetch = function () { throw new Error('down'); }`);
assert.strictEqual(call('resultClicks', {}).ok, false, 'vic-enp down: clicks are unavailable');
run('__fetch = __f');

// the timed sync keeps vic-enp's links current: a changed link goes with the next sync
run('__joinCalls.length = 0');
call('saveSettings', { values: { RESULT_GROUP_IT: 'https://m.me/j/ITnewgroup' } });
call('sync', {});
assert(calls().length >= 1 && calls().pop().links.IT === 'https://m.me/j/ITnewgroup', 'the new link was pushed');
const n = calls().length;
call('sync', {});
assert.strictEqual(calls().length, n, 'nothing changed, no push');

// binomes see results once a mail has gone
const slice = () => R('binSlices_(loadCtx_())');
assert(Object.values(slice()).flatMap(x => x.candidates).some(x => x.result), 'results are visible now');

// Reset clears Result Told and tells vic-enp
run('__joinCalls.length = 0');
call('resetBinomes', { phrase: 'I confirm to reset the binomes' });
assert.strictEqual(ivTab().filter(r => r[I['Result Told']]).length, 0, 'Reset clears Result Told');
assert(calls().some(c => c.reset === true), 'vic-enp is asked to forget');
console.log('results ok');
