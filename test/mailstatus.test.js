// Email and notification status (docs/admin-features.md): the Mail Log, MAIL_FAILED, the reads and Resend. Made-up people only.
const assert = require('assert');
const { run, call, addRegistrations } = require('./seed')();
const J = JSON.stringify;
const R = code => JSON.parse(JSON.stringify(run(code)));
const web = (a, args) => call('webRun', a, args);
const sync = () => web('sync');
const settings = v => web('saveSettings', { values: v });
const ML = R('ML_H'), IV = run('idx_(IV_H)'), AL = run('idx_(ALERT_H)');
const log = () => (R('master.getSheetByName("Mail Log") ? master.getSheetByName("Mail Log").getDataRange().getValues().slice(1) : []'))
  .map(r => { const o = {}; ML.forEach((h, i) => { o[h] = r[i]; }); return o; });
const alerts = type => R('master.getSheetByName("Alerts").getDataRange().getValues().slice(1)').filter(r => r[AL.Type] === type);
run('var __send = MailApp.sendEmail');
const failMail = pattern => run(`MailApp.sendEmail = function (o) { if (${pattern}.test(o.to)) throw new Error("quota"); return __send(o); }`);
const okMail = () => run('MailApp.sendEmail = __send');
const ADMIN = 'admin@g.enp.edu.dz';

web('importTeam', { link: '' }); web('draft'); web('lock');

// ---- every mail is a row: Held in test mode, Sent live, with kind, address, concerns and who triggered it ----
assert.strictEqual(log().length > 0, true, 'the lock mails (PAIRED) are logged');
assert(log().every(r => r.Outcome === 'Held' || r.To === ADMIN || r.Outcome === 'Sent'), 'test mode: Held unless an admin');
assert(log().some(r => r.Kind === 'PAIRED' && r['Triggered by'] === ADMIN && /^B\.\d+$/.test(r.Concerns)), 'PAIRED: concerns the binome, triggered by the admin');
assert(log().every(r => r.Subject && r['Stored mail'] === ''), 'a subject on every row, a stored body only on a failed one');

settings({ TEST_MODE: false });
addRegistrations(6, 0);
sync();
const conf = log().filter(r => r.Kind === 'CONFIRM');
assert.strictEqual(conf.length, 6, 'one CONFIRM per registrant');
assert(conf.every(r => r.Outcome === 'Sent' && /^[A-Z]+\.\d+$/.test(r.Concerns) && /@g\.enp\.edu\.dz$/.test(r.To)), JSON.stringify(conf[0]));
assert(log().some(r => r.Kind === 'NEW_IV' && r['Triggered by'] === ADMIN), 'a dashboard sync keeps the admin');
assert.strictEqual(alerts('MAIL_FAILED').length, 0, 'nothing failed, no alert');

// ---- the timed sync triggers as "the sync" ----
addRegistrations(1, 0); // same people again are duplicates; a distinct one:
run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 99000), 'solo.one@g.enp.edu.dz', 'Solo', 'One', 'solo.one@g.enp.edu.dz', '01/03/2005', '0555999999', 'IT', 'HR'))`);
call('syncAll');
const solo = log().filter(r => r.To === 'solo.one@g.enp.edu.dz');
assert(solo.length === 1 && solo[0].Kind === 'CONFIRM' && solo[0]['Triggered by'] === 'the sync', JSON.stringify(solo));

// ---- the digest, outside any lock: its own rows, triggered by "the digest" ----
web('digest');
assert(log().some(r => r.Kind === 'DIGEST' && r.To === ADMIN && r['Triggered by'] === 'the digest' && r.Outcome === 'Sent'), 'the digest is logged');

// ---- a failed send: a Failed row with the error and the stored body, one HIGH MAIL_FAILED listing it, mailed to admins ----
run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 120000), 'bad.address@g.enp.edu.dz', 'Bad', 'Address', 'bad.address@g.enp.edu.dz', '01/03/2005', '0555999998', 'IT', 'HR'))`);
failMail('/bad\\.address/');
let box = run('__outbox.length');
sync();
let failed = log().filter(r => r.Outcome === 'Failed');
assert.strictEqual(failed.length, 1);
assert(failed[0].Kind === 'CONFIRM' && failed[0].To === 'bad.address@g.enp.edu.dz' && /mailer refused/.test(failed[0].Error) && /^<!DOCTYPE html>/.test(failed[0]['Stored mail']), JSON.stringify(failed[0]).slice(0, 300));
let mf = alerts('MAIL_FAILED');
assert.strictEqual(mf.length, 1, 'one alert for the run');
assert(mf[0][AL.Severity] === 'HIGH' && mf[0][AL.Status] === 'OPEN' && /bad\.address@g\.enp\.edu\.dz/.test(mf[0][AL.Message]) && /^MAIL_FAILED\|\d+-\d+$/.test(mf[0][AL.Key]), mf[0].join(' | '));
const toAdmin = R('__outbox.slice(' + box + ')').filter(m => m.to === ADMIN && /alert/.test(m.subject));
assert(toAdmin.length >= 1 && /bad\.address/.test(toAdmin[0].htmlBody), 'the alert is mailed to the admin');
assert(!R('__outbox.slice(' + box + ')').some(m => m.to !== ADMIN && /alert/.test(m.subject)), 'never to binomes');
assert(log().some(r => r.Kind === 'ALERT' && r.To === ADMIN && r.Outcome === 'Sent'), 'the alert mail is a row too');
sync();
assert.strictEqual(alerts('MAIL_FAILED').length, 1, 'a later sync does not raise it again');

// ---- the alert's own mail failing is logged and raises nothing new ----
failMail('/^(admin@|bad\.two)/');
run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 130000), 'bad.two@g.enp.edu.dz', 'Bad', 'Two', 'bad.two@g.enp.edu.dz', '01/03/2005', '0555999997', 'IT', 'HR'))`);
sync();
assert.strictEqual(alerts('MAIL_FAILED').length, 2, 'one more alert, not a loop');
assert(log().filter(r => r.Kind === 'ALERT' && r.Outcome === 'Failed').length >= 1, 'the failed alert mail is logged');
okMail();

// ---- the reads: a candidate, an alert, a binome ----
const codeBad = R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Email] === 'bad.address@g.enp.edu.dz')[IV.Code];
let g = web('mailLog', { code: codeBad }).result;
assert(g.rows.some(r => r.kind === 'CONFIRM' && r.outcome === 'Failed' && r.to === 'bad.address@g.enp.edu.dz'), 'the candidate sees the failed confirmation');
const mfId = mf[0][AL.ID];
g = web('mailLog', { alertId: mfId }).result;
assert(g.rows.length >= 1 && g.rows.every(r => r.concerns.split(', ').indexOf(mfId) >= 0), 'the alert: who was mailed and the outcome');
const b1 = web('mailLog', { binome: 'B.01' }).result;
assert(b1.rows.length >= 1 && b1.last && b1.last.kind, 'a binome: its rows and the last mail');
assert(b1.older.every(o => o.text === 'told'), 'a PAIRED mark from before the log reads "told"');
assert.throws(() => web('mailLog', {}), /Say whose mails/);
assert.throws(() => web('mailLog', { code: 'XX.99' }), /Unknown code/);
// an alert older than the log falls back to Emailed To, labelled intended
run(`(function () { var sh = master.getSheetByName('Alerts'), I = idx_(ALERT_H); sh.cells.push(['A-9001', new Date(2000, 0, 1), 'MEDIUM', 'OLD', '', '', 'old', 'old.admin@x.dz', 'OPEN', '', '']); })()`);
assert.strictEqual(web('mailLog', { alertId: 'A-9001' }).result.intended, 'old.admin@x.dz');

// ---- Resend: the preview lists the failed mails; resending sends the stored body to the address on the row ----
let pv = web('mailResendPreview').result;
assert.deepStrictEqual(pv.mails.map(m => m.to).sort(), [ADMIN, 'bad.address@g.enp.edu.dz', 'bad.two@g.enp.edu.dz'], 'the alert mail that failed is listed too');
assert(pv.mails.every(m => m.stale === '' && !m.retrying && m.error));
const stored = failed[0]['Stored mail'];
box = run('__outbox.length');
let res = web('mailResend', { send: [pv.mails.find(m => m.to === 'bad.address@g.enp.edu.dz').id] }).result;
assert.deepStrictEqual([res.sent, res.failed], [1, 0]);
const sentMail = R('__outbox.slice(' + box + ')').find(m => m.to === 'bad.address@g.enp.edu.dz');
assert(sentMail && sentMail.htmlBody === stored && sentMail.name === 'VIC Recruitment', 'the stored subject and body, as the candidate sender');
let rows = log();
const old = rows.find(r => r.To === 'bad.address@g.enp.edu.dz' && r.Outcome === 'Resent'), added = rows.filter(r => r.To === 'bad.address@g.enp.edu.dz' && r.Outcome === 'Sent' && r['Triggered by'] === ADMIN);
assert(old && old['Stored mail'] === '' && added.length === 1 && added[0].Kind === 'CONFIRM', 'the old row is Resent, a new Sent row is the admin\'s');
assert.strictEqual(alerts('MAIL_FAILED').find(r => r[AL.ID] === mfId)[AL.Status], 'AUTO-RESOLVED', 'the alert resolves once its mail is resent');
assert.deepStrictEqual(web('mailResendPreview').result.mails.map(m => m.to).sort(), [ADMIN, 'bad.two@g.enp.edu.dz'], 'the others are left');
// a wrong address is fixed first: the row takes the new address
failMail('/fixme/');
pv = web('mailResendPreview').result;
res = web('mailResend', { send: [{ id: pv.mails.find(m => m.to === 'bad.two@g.enp.edu.dz').id, to: 'fixed.two@g.enp.edu.dz' }] }).result;
assert.strictEqual(res.sent, 1);
assert(log().some(r => r.To === 'fixed.two@g.enp.edu.dz' && r.Outcome === 'Resent'), 'the fixed address is on the old row');
okMail();

// ---- a resend that fails again keeps the row and adds a Failed row ----
run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 140000), 'again.one@g.enp.edu.dz', 'Again', 'One', 'again.one@g.enp.edu.dz', '01/03/2005', '0555999996', 'IT', 'HR'))`);
failMail('/again\\.one/');
sync();
pv = web('mailResendPreview').result;
const againId = pv.mails.find(m => m.to === 'again.one@g.enp.edu.dz').id;
res = web('mailResend', { send: [againId] }).result;
assert.deepStrictEqual([res.sent, res.failed], [0, 1]);
assert.strictEqual(log().filter(r => r.To === 'again.one@g.enp.edu.dz' && r.Outcome === 'Failed').length, 2, 'the old row stays, the new failure is a row');
okMail();

// ---- stale: a deleted candidate's mail can be dismissed, not resent ----
const codeAgain = R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Email] === 'again.one@g.enp.edu.dz')[IV.Code];
web('deleteApplication', { code: codeAgain });
pv = web('mailResendPreview').result;
assert(pv.mails.filter(m => m.to === 'again.one@g.enp.edu.dz').every(m => /not in the Interviewees tab/.test(m.stale)), JSON.stringify(pv.mails.map(m => m.stale)));
res = web('mailResend', { dismiss: pv.mails.map(m => m.id) }).result;
assert.strictEqual(res.dismissed, pv.mails.length);
assert.strictEqual(log().filter(r => r.Outcome === 'Failed').length, 0, 'nothing left failed');
assert(log().some(r => r.Outcome === 'Dismissed' && r['Stored mail'] === ''), 'Dismissed, body cleared');
assert.throws(() => web('mailResend', {}), /No mail chosen/);

// ---- the rejection mark: Resend writes it, and a mail whose mark is set is hidden ----
settings({ SCREENING: true });
run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + 150000), 'junk.rej@g.enp.edu.dz', 'Junk', 'Rej', 'junk.rej@g.enp.edu.dz', '01/03/2005', '0555999995', 'IT', 'HR'))`);
run(`(function () { var s = master.getSheetByName('Registration Responses'), r = s.cells[s.cells.length - 1]; r[12] = '/'; r[16] = '/'; })()`);
sync();
const alertsOpen = () => call('webState').alerts;
const rev = alertsOpen().find(a => a.type === 'NEEDS_REVIEW');
assert(rev, 'the junk is held for review');
web('quick', { op: 'decline', ids: [rev.id] });
failMail('/junk\\.rej/');
web('rejections', { send: true, subject: 'Your application', body: 'Hi {first}, sorry.' });
okMail();
const rejRow = log().find(r => r.Kind === 'REJECT' && r.Outcome === 'Failed');
assert(rejRow && /^[A-Z]+\.\d+$/.test(rejRow.Concerns), 'a failed rejection is a row about the candidate');
const ivScreen = () => R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Email] === 'junk.rej@g.enp.edu.dz')[IV.Screening];
assert(!/Rejection sent/.test(ivScreen()));
pv = web('mailResendPreview').result;
assert.strictEqual(pv.mails.filter(m => m.kind === 'REJECT').length, 1);
web('mailResend', { send: [pv.mails.find(m => m.kind === 'REJECT').id] });
assert(/Rejection sent \d\d\/\d\d/.test(ivScreen()), 'Resend wrote the mark: ' + ivScreen());
assert.strictEqual(web('rejections', {}).result.count, 0, 'Send rejections never repeats it');
// the other way round: the mark already set (Send rejections got there first) hides the row and closes it
run(`(function () { var sh = master.getSheetByName('Mail Log'); sh.cells.push([new Date(), 'REJECT', 'junk.rej@g.enp.edu.dz', ${J(rejRow.Concerns)}, 'the sync', 'Failed', 'x', 'Your application', '<html>']); })()`);
assert.strictEqual(web('mailResendPreview').result.mails.filter(m => m.kind === 'REJECT').length, 0, 'the preview hides a mail whose mark is set');

// ---- DROP mails stay out of Resend: the next cycle retries them ----
run(`(function () { var sh = master.getSheetByName('Mail Log'); sh.cells.push([new Date(), 'DROP', 'm@g.enp.edu.dz', 'B.01', 'the sync', 'Failed', 'x', 'Not applied', '<html>']); })()`);
const dropRow = web('mailResendPreview').result.mails.find(m => m.kind === 'DROP');
assert(dropRow && dropRow.retrying, 'listed as retrying');
assert(/next cycle retries/.test(web('mailResend', { send: [dropRow.id] }).result.lines.join(' ')), 'not resendable');
run(`(function () { var sh = master.getSheetByName('Mail Log'); sh.cells.push([new Date(Date.now() + 1000), 'DROP', 'm@g.enp.edu.dz', 'B.01', 'the sync', 'Sent', '', 'Not applied', '']); })()`);
assert(!web('mailResendPreview').result.mails.some(m => m.kind === 'DROP'), 'a later Sent closes it');

// ---- Quick fix stops adding someone whose send failed to Emailed To ----
const AO = run('idx_(ALERT_H)');
run(`(function () { var sh = master.getSheetByName('Alerts'); sh.cells.push(['A-9100', new Date(), 'MEDIUM', 'NOT_CONTACTED', '', 'B.01', 'x (binome B.01)', '', 'OPEN', '', '']); })()`);
const emailsOf = R('loadCtx_().binByCode["B.01"].members.map(function (m) { return m.email; })');
failMail(`/${emailsOf[0].replace('.', '\\.')}/`);
web('quick', { op: 'send', ids: ['A-9100'], to: 'binome', drafts: [{ group: 'B.01', subject: 'Hello', body: 'Please update your sheet.' }] });
okMail();
const emailedTo = R('master.getSheetByName("Alerts").getDataRange().getValues().slice(1)').find(r => r[AO.ID] === 'A-9100')[AO['Emailed To']];
assert(emailedTo.indexOf(emailsOf[0]) < 0 && emailedTo.indexOf(emailsOf[1]) >= 0, 'only whoever the mail reached: ' + emailedTo);
assert(log().some(r => r.Kind === 'QUICKFIX' && r.To === emailsOf[0] && r.Outcome === 'Failed' && r.Concerns.indexOf('A-9100') >= 0), 'the failed quick-fix mail is a row about the alert');

// ---- Reset clears the log with the other logs ----
assert(log().length > 0);
web('resetBinomes', { phrase: 'I confirm to reset the binomes' });
assert.strictEqual(log().length, 0, 'Reset clears the Mail Log');
console.log('mailstatus ok');
