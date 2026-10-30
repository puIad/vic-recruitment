// The email template (Mail.gs) and the registrant's confirmation. Made-up people only.
// test/gs.js also fails any suite whose mail did not come out of mailHtml_.
const assert = require('assert');
const { run, call } = require('./seed')();
const J = JSON.stringify;
const R = code => JSON.parse(JSON.stringify(run(code))); // out of the vm's realm, so deepStrictEqual compares plain values
const IV = run('idx_(IV_H)');
const settings = v => call('webRun', 'saveSettings', { values: v });
const sync = () => call('webRun', 'sync');
const ivRow = email => R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Email] === email);
const outbox = () => R('__outbox.slice()');
const confirms = () => outbox().filter(m => m.subject === run("mailDef_('CONFIRM').fields[0][1]")).map(m => m.to).sort();
let n = 0;
const apply = (collected, first, fam, typed) => run(`master.getSheetByName('Registration Responses').cells.push(regRow(new Date(Date.now() + ${++n} * 1000),
  ${J(collected)}, ${J(first)}, ${J(fam)}, ${J(typed === undefined ? collected : typed)}, '01/03/2005', '0555${200000 + n}', 'IT', 'HR'))`);

// ---- the template: email-client safe, every value escaped ----
const BAD = '<script>"x"&', ESC = '&lt;script&gt;&quot;x&quot;&amp;';
let html = run(`mailHtml_({ title: ${J(BAD)}, intro: ${J(BAD + ' **bold**')}, blocks: [mailH_(${J(BAD)}), mailList_([[${J(BAD)}, ${J(BAD)}]]),
  mailAlerts_([['HIGH', ${J(BAD)}, ${J(BAD)}], ['MEDIUM', 'm'], ['INFO', 'i']]), mailStats_([[${J(BAD)}, 3]]), mailCode_(${J(BAD)}, ${J(BAD)})],
  cta: { label: ${J(BAD)}, url: 'https://x.dz/?a="b"' }, footer: mailTeamFooter_('https://docs.google.com/spreadsheets/d/abc') })`);
assert(!/<script>|"x"/.test(html), 'every value escaped');
assert.strictEqual(html.split(ESC).length - 1, 12, 'title (twice), intro, heading, key, value, alert detail and message, stat, code label and value, button');
assert(/<b>bold<\/b>/.test(html), '**x** is bold');
assert(html.includes('href="https://x.dz/?a=&quot;b&quot;"'), 'a link stays inside its attribute');
assert(/^<!DOCTYPE html>/.test(html) && html.includes('width="600"') && !/<style|class=/.test(html), '600 px table, inline styles only');
assert(/<img src="https:\/\/vic-recruitment\.vercel\.app\/brand\/vic-logo-white\.png"[^>]*alt="VIC"/.test(html), 'PNG logo, alt VIC');
['#127dbb', '#69c4af', '#141e27', '#efefef', 'Gilroy,'].forEach(c => assert(html.includes(c), c));
assert(/#ffece5;color:#c11e00[^>]*>HIGH</.test(html) && /#fff0c5;color:#915200[^>]*>MEDIUM</.test(html) && /#e2f3ff;color:#005b91[^>]*>INFO</.test(html), 'severity chips');
assert(/<td bgcolor="#0075b2"[^>]*><a href=/.test(html), 'the call to action is a table-cell button');
assert(html.includes('href="https://vic-recruitment.vercel.app"') && html.includes('href="https://docs.google.com/spreadsheets/d/abc"'), 'team footer: dashboard + binome sheet');
assert(!/<a /.test(run(`mailHtml_({ title: 't', blocks: [mailP_('x')] })`)), 'candidate footer: no link');
const conf = run(`mailFrom_('CONFIRM', { first: 'Lina', code: 'IT.07' }).html`);
assert(/Thanks for registering, Lina!/.test(conf) && />IT\.07</.test(conf) && /We will get back to you by phone or email/.test(conf), 'thanks, the code, we will get back to them');
assert(!/binome/i.test(conf), 'no binome: a held or declined applicant never gets one');
assert(!/<a /.test(conf), 'no internal link to a candidate');
assert(!/interview/i.test(conf), 'never promises an interview');

// ---- which registrations get one: a code, waiting / assigned (not held), a usable email and first name ----
const picked = () => R(`(function () {
  var I = idx_(IV_H), mk = function (st, code, first, email) { var r = new Array(IV_H.length).fill(''); r[I.Status] = st; r[I.Code] = code; r[I['First Name']] = first; r[I.Email] = email; return r; };
  var ctx = { iv: { I: I }, now: new Date(), confirm: [mk('UNASSIGNED', 'IT.90', 'A', 'a@x.dz'), mk('ASSIGNED', 'IT.91', 'B', 'b@x.dz'), mk('HELD', 'IT.92', 'C', 'c@x.dz'),
    mk('DUPLICATE', 'IT.93', 'D', 'd@x.dz'), mk('DECLINED', 'IT.94', 'E', 'e@x.dz'), mk('UNASSIGNED', '', 'F', 'f@x.dz'), mk('ASSIGNED', 'IT.95', ' ', 'g@x.dz'),
    mk('ASSIGNED', 'IT.96', 'H', 'not an email'), mk('ASSIGNED', 'IT.97', 'K', ''), mk('ASSIGNED', 'IT.98', 'ليلى', 'l@x.dz')] };
  stampConfirmations_(ctx);
  return ctx.confirm.map(function (r) { return r[I.Code] + ' ' + r[I.Flags]; }); })()`);
const p = picked();
assert.deepStrictEqual(p.map(x => x.split(' ')[0]), ['IT.90', 'IT.91', 'IT.98'], 'not held, duplicates, declined (VIC members), no code, no name, no email; any script');
assert(p.every(x => /CONFIRMED \d\d\/\d\d\/\d{4}$/.test(x)), 'stamped in Flags: ' + J(p));

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');

// ---- PAIRED after a lock in TEST_MODE: only admins were told, so the catch-up tells the rest, once ----
const paired = () => outbox().filter(m => /You are in binome B\.\d\d$/.test(m.subject));
const locked = R('activeOrPaused_(loadCtx_()).reduce(function (n, b) { return n + b.members.length; }, 0)');
settings({ TEST_MODE: false });
run('__outbox.length = 0');
const todo = R('pairedTodo_(loadCtx_()).length');
assert(todo > 0 && todo <= locked, 'members not told by the test-mode lock: ' + todo + ' of ' + locked);
assert.deepStrictEqual(R('mailPaired_(loadCtx_())'), { sent: todo, failed: [] });
assert.strictEqual(paired().length, todo, 'one PAIRED per untold member');
assert(paired().every(m => /Open the dashboard/.test(m.htmlBody)), 'with the dashboard button');
run('__outbox.length = 0');
assert.deepStrictEqual([R('mailPaired_(loadCtx_())').sent, R('pairedTodo_(loadCtx_()).length'), paired().length], [0, 0, 0], 'never twice');

// ---- PAIRED from a live lock: every member of every locked binome, nothing left for the catch-up ----
{
  const w = require('./seed')();
  w.call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
  w.call('webRun', 'importTeam', { link: '' }); w.call('webRun', 'draft');
  w.run('__outbox.length = 0');
  w.call('webRun', 'lock');
  const want = JSON.parse(JSON.stringify(w.run('activeOrPaused_(loadCtx_()).reduce(function (a, b) { return a.concat(b.members.map(function (m) { return m.email + " " + b.code; })); }, [])'))).sort();
  const got = JSON.parse(JSON.stringify(w.run('__outbox.slice()'))).filter(m => /You are in binome/.test(m.subject)).map(m => m.to + ' ' + m.subject.split(' ').pop()).sort();
  assert(want.length > 0, 'binomes locked');
  assert.deepStrictEqual(got, want, 'lock emails each member their own binome');
  assert.strictEqual(w.run('pairedTodo_(loadCtx_()).length'), 0, 'nothing left for the catch-up');
}

// ---- through the sync: sent once, after the save, escaped ----
run('__outbox.length = 0');
apply('lina.amrani@g.enp.edu.dz', 'Lina', 'Amrani');
apply('ines.kaci@g.enp.edu.dz', 'Ines<i>"', 'Kaci');
sync();
assert.deepStrictEqual(confirms(), ['ines.kaci@g.enp.edu.dz', 'lina.amrani@g.enp.edu.dz']);
const lina = ivRow('lina.amrani@g.enp.edu.dz');
assert(lina[IV.Code] && /CONFIRMED \d\d\/\d\d\/\d{4}/.test(lina[IV.Flags]), 'the sent mark is saved: ' + lina[IV.Flags]);
const mine = outbox().find(m => m.to === 'lina.amrani@g.enp.edu.dz');
assert(mine.htmlBody.includes('>' + lina[IV.Code] + '<'), 'their code');
assert.strictEqual(mine.name, 'VIC Recruitment', 'a candidate mail');
assert(mine.htmlBody.includes('<td bgcolor="#FF6A5E" style="background:#FF6A5E;height:4px;'), 'a Google Form registrant whose 1st choice is IT: the Gryffindor stripe');
const ines = outbox().find(m => m.to === 'ines.kaci@g.enp.edu.dz').htmlBody;
assert(ines.includes('Ines&lt;i&gt;&quot;') && !ines.includes('Ines<i>'), 'the name is escaped');
const binMail = outbox().find(m => /New interviewee/.test(m.subject));
assert(binMail && binMail.htmlBody.includes(lina[IV.Code]) && binMail.htmlBody.includes('Open the dashboard') && binMail.htmlBody.includes('vercel.app/my-binome'), 'the binome mail, through the template');
assert.strictEqual(binMail.name, 'VIC Recruitment Bot', 'a team mail');
run('__outbox.length = 0');
sync(); sync();
assert.deepStrictEqual(confirms(), [], 'a re-run never sends it again');

// ---- skipped: a duplicate, no usable email, no name ----
apply('lina.amrani@g.enp.edu.dz', 'Lina', 'Amrani');
apply('', 'Nomail', 'Person', 'not-an-email');
apply('noname.person@g.enp.edu.dz', '', 'Person');
sync();
assert.deepStrictEqual(confirms(), []);
assert(R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').some(r => r[IV.Status] === 'DUPLICATE' && r[IV.Email] === 'lina.amrani@g.enp.edu.dz'), 'the duplicate was read');

// ---- the setting off ----
settings({ CONFIRM_REGISTRANTS: false });
apply('setting.off@g.enp.edu.dz', 'Setting', 'Off');
sync();
assert.deepStrictEqual(confirms(), []);
assert(ivRow('setting.off@g.enp.edu.dz')[IV.Code] && !/CONFIRMED/.test(ivRow('setting.off@g.enp.edu.dz')[IV.Flags]), 'off: no mail, no mark');
settings({ CONFIRM_REGISTRANTS: true });

// ---- TEST_MODE: through mail_, so only an admin really gets one ----
settings({ TEST_MODE: true });
apply('test.mode@g.enp.edu.dz', 'Test', 'Mode');
apply('admin@g.enp.edu.dz', 'Admin', 'Person');
sync();
assert.deepStrictEqual(confirms(), ['admin@g.enp.edu.dz'], 'test mode: the admin only');
settings({ TEST_MODE: false });

// ---- the other senders go through the template too (test/gs.js checks every mail; here each one is sent for real) ----
const st = call('webState'), [b1, b2] = st.binomes.filter(b => b.people.length === 2);
run('__outbox.length = 0');
call('webRun', 'changeMember', { binome: b1.code, outEmail: b1.people[0].email, inName: 'Outside Person', inEmail: 'outside.person@g.enp.edu.dz', reason: 'test' });
const code = R('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').find(r => r[IV.Binome] === b2.code)[IV.Code];
call('webRun', 'addCover', { codes: code, inEmail: b1.people[1].email });
call('webRun', 'digest');
const subjects = outbox().map(m => m.subject);
['You joined binome', 'You left binome', 'You cover', ' covers ', 'Daily digest'].forEach(s => assert(subjects.some(x => x.includes(s)), s + ': ' + J(subjects)));
const digest = outbox().find(m => /Daily digest/.test(m.subject)).htmlBody;
assert(/Daily digest · /.test(digest) && /New registrations <b/.test(digest) && /Open the master sheet/.test(digest), 'the digest: title, stat line, button');
// ---- dropped changes away from the page (slice 4): api/drops, the email, DROPPED|<email> ----
{
  const answer = a => run(`__fetch = function (url, o) { var c = { url: url, auth: o.headers.Authorization, body: JSON.parse(o.payload) }; __calls.push(c); return ${J(a)}; }`);
  run('var __calls = []');
  const fetched = () => R('__calls.slice()');
  const dropAlerts = () => R(`master.getSheetByName('Alerts').getDataRange().getValues().filter(function (r) { return /^DROPPED\\|/.test(r[10]); })`);
  answer({ code: 200, body: { mail: [], alert: [], open: [] } });
  sync();
  assert.strictEqual(fetched().length, 0, 'no DROPS_SECRET: no call');
  run(`__props.DROPS_SECRET = 'S3'`);
  const anAlert = call('webState').alerts[0];
  answer({ code: 200, body: { mail: [{ email: 'away@g.enp.edu.dz', drops: [
    { cell: 'alert:' + anAlert.id, kind: 'alert', alert: anAlert.id, op: 'resolve', value: 'RESOLVED', seen: 'OPEN', sheet: 'SNOOZED' },
    { cell: 'setting:DIGEST_HOUR', kind: 'setting', key: 'DIGEST_HOUR', value: 9, seen: 8, reason: 'retries ran out' }] }],
    alert: ['left@g.enp.edu.dz'], open: ['away@g.enp.edu.dz', 'left@g.enp.edu.dz'] } });
  run('__outbox.length = 0');
  sync();
  let c = fetched()[0];
  assert.deepStrictEqual([c.url, c.auth, c.body], ['https://vic-recruitment.vercel.app/api/drops', 'Bearer S3', { mailed: [] }], 'the call: secret, nothing mailed yet');
  const m = outbox().find(x => x.to === 'away@g.enp.edu.dz');
  assert.strictEqual(m.subject, '[VIC Recruitment] 2 of your changes were not applied');
  assert(m.htmlBody.includes('Alert ' + anAlert.id + ' · ' + anAlert.type) && /Snoozed/.test(m.htmlBody) && /kept refusing it/.test(m.htmlBody) && /\/\?review=dropped/.test(m.htmlBody), 'each drop with the sheet now or why');
  assert.deepStrictEqual(dropAlerts().map(r => [r[3], r[8], r[10]]), [['DROPPED', 'OPEN', 'DROPPED|left@g.enp.edu.dz']], 'unanswered: one admin alert');
  answer({ code: 200, body: { mail: [], alert: ['left@g.enp.edu.dz'], open: ['left@g.enp.edu.dz'] } });
  sync();
  c = fetched()[1];
  assert.deepStrictEqual([c.body.mailed.length, c.body.mailed[0].email, c.body.mailed[0].cells.length], [1, 'away@g.enp.edu.dz', 2], 'the next call reports what was mailed');
  assert.strictEqual(dropAlerts().length, 1, 'raised once');
  answer({ code: 200, body: { mail: [{ email: 'x@g.enp.edu.dz' }] } }); // a malformed answer: logged, the cycle goes on
  assert(sync().messages, 'a bad api/drops answer never fails the sync');
  answer({ code: 502, body: {} });
  sync();
  assert.strictEqual(dropAlerts()[0][8], 'OPEN', 'api/drops down: nothing resolved');
  answer({ code: 200, body: { mail: [], alert: [], open: [] } });
  sync();
  assert.deepStrictEqual([dropAlerts()[0][8], fetched().pop().body.mailed], ['AUTO-RESOLVED', []], 'every drop addressed: resolved; the report was taken');
  run(`delete __props.DROPS_SECRET; __fetch = function () { throw new Error('no network in the mock'); }`);
}

// ---- the sender: every mail goes through the mailer (vic.rh), whoever runs the code; nothing here can send as them ----
{
  const fs = require('fs');
  fs.readdirSync(__dirname + '/..').filter(f => f.endsWith('.gs')).forEach(f =>
    assert(!/\b(MailApp|GmailApp)\./.test(fs.readFileSync(__dirname + '/../' + f, 'utf8')), f + ' must not send as the account running it: use mail_()'));
  run('__outbox.length = 0');
  const html = R(`mailHtml_({ title: 'x' })`);
  assert.strictEqual(R(`mail_('a@g.enp.edu.dz', 'Hello', ${J(html)}, 'VIC Recruitment')`), true);
  assert.deepStrictEqual(outbox().map(m => [m.to, m.subject, m.htmlBody, m.name]), [['a@g.enp.edu.dz', 'Hello', html, 'VIC Recruitment']]);
  R(`mail_('a@g.enp.edu.dz', 'Team', ${J(html)})`);
  assert.strictEqual(outbox()[1].name, 'VIC Recruitment Bot', 'the team mails keep their sender name');
  run('__outbox.length = 0');
  // a refused or broken mailer answers false and never throws; the caller keeps its retry
  run(`var __mailer2 = __mailer; __mailer = function () { return { code: 200, body: { ok: false, reason: 'secret' } }; }`);
  assert.strictEqual(R(`mail_('a@g.enp.edu.dz', 'x', 'x')`), false, 'refused');
  // the test mail says why it did not leave: a mailer problem is not blamed on test mode
  assert(/the mailer did not take it/.test(call('webRun', 'mailPreview', { id: 'LEFT', send: true }).messages[0]), 'the mailer refused');
  settings({ TEST_MODE: true });
  assert(/test mode is on/.test(R(`_webOut = []; mailPreviewCore_({ email: 'not.admin@g.enp.edu.dz' }, { id: 'LEFT', send: true }); var __said = _webOut; _webOut = null; __said`)[0]), 'test mode held it');
  settings({ TEST_MODE: false });
  run(`__mailer = function () { return { code: 500, body: '<html>Service unavailable</html>' }; }`);
  assert.strictEqual(R(`mail_('a@g.enp.edu.dz', 'x', 'x')`), false, 'an error page');
  run(`__mailer = function () { throw new Error('network'); }`);
  assert.strictEqual(R(`mail_('a@g.enp.edu.dz', 'x', 'x')`), false, 'no answer');
  run(`__mailer = __mailer2`);
  assert.strictEqual(outbox().length, 0, 'none of them fell back to sending as the admin');
}

assert.strictEqual(run('__untemplated.length'), 0, J(run('__untemplated')));
console.log('MAIL OK');

// ---- editable mail texts (MAILS, Settings › Emails) ----
{
  const keys = R('SETTINGS_DEFAULTS.map(function (r) { return r[0]; })'), mk = R('MAILS.reduce(function (a, m) { return a.concat(m.fields.map(function (f) { return "MAIL_" + m.id + "_" + f[0].toUpperCase(); })); }, [])');
  assert.strictEqual(mk.length, 35, '35 fields');
  assert(mk.every(k => keys.includes(k) && k.length <= 41 && /^[A-Z_]+$/.test(k)), 'every field has its Settings row, within the pending key pattern');
  assert.strictEqual(new Set(keys).size, keys.length, 'keys unique');
  // blank rows = today's text; an edit reaches the mail, escaped
  assert(/Thanks for registering, Ann!/.test(run(`mailFrom_('CONFIRM', { first: 'Ann', code: 'IT.1' }).html`)), 'default');
  settings({ MAIL_CONFIRM_HEADING: 'Hello <b>{first}</b>, **welcome**' });
  const edited = run(`mailFrom_('CONFIRM', { first: 'Ann', code: 'IT.1' }).html`);
  assert(/Hello &lt;b&gt;Ann&lt;\/b&gt;, \*\*welcome\*\*/.test(edited), 'edit escaped, placeholders filled, no bold in a heading');
  assert.strictEqual(run(`mailFrom_('REJECT', { first: 'Ann' }, { texts: { subject: 'For you, {first}', text: 'x' } }).subject`), 'For you, Ann', 'a placeholder in the rejection subject is filled');
  assert(/Thanks for registering, Amina!/.test(run(`mailSample_('CONFIRM', { heading: '' })`).html), 'a blank field sent by the caller is the default, not the saved text');
  // refused: an unknown placeholder, too long; a text equal to the default is saved blank
  assert.throws(() => settings({ MAIL_CONFIRM_ABOVE: 'Hi {frist}' }), /unknown placeholder \{frist\}/);
  assert.throws(() => settings({ MAIL_CONFIRM_ABOVE: 'x'.repeat(2001) }), /over 2000/);
  settings({ MAIL_CONFIRM_HEADING: run("mailDef_('CONFIRM').fields[1][1]") });
  assert.strictEqual(call('webState').settingsAll.find(x => x.key === 'MAIL_CONFIRM_HEADING').value, '', 'default text saved blank');
  assert(call('webState').mails.length === 10, 'webState.mails');
  // preview: sample data, nothing written, send reaches only the caller
  run('__outbox.length = 0');
  const pv = call('webRun', 'mailPreview', { id: 'COVERED', texts: { text: 'Hi {first}, {cover} covers {codes}' } }).result;
  assert(/Hi Amina, Sara B\. covers IT\.12, IT\.15/.test(pv.html) && pv.subject.includes('Sara B.') && !outbox().length, 'preview');
  assert.throws(() => call('webRun', 'mailPreview', { id: 'COVERED', texts: { text: '{nope}' } }), /unknown placeholder/);
  const sent = call('webRun', 'mailPreview', { id: 'LEFT', send: true }).result;
  assert(outbox().every(m => /^\[TEST\] /.test(m.subject)), 'test subject');
  console.log('editable mails ok; test send', sent.sent);
}

// ---- the themed mails (docs/registration-form.md, The mails): the ticket and the confirmation ----
{
  const crypto = require('crypto');
  // hashes of each sample as it rendered before the theme (main at 86ae089): the theme never touches the rejection or a team
  // mail. A deliberate change to one of them: re-hash its mailSample_ (subject, from, html; sha256, 16 hex) and update it here
  const BEFORE = { REJECT: 'df5381a2244ef163', NEW_IV: 'a31054e011231f05', ALERT: 'b3d096dad95f609c', JOINED: 'eb6a9a2a25ad8fe8',
    LEFT: '6e36ae12140a8500', PAIRED: '31dffea7cc7729bb', COVER: '8fe9f9dbca94dfe0', COVERED: 'bc57dd0a5e217a29' };
  settings(Object.fromEntries(R('MAILS.reduce(function (a, m) { return a.concat(m.fields.map(function (f) { return "MAIL_" + m.id + "_" + f[0].toUpperCase(); })); }, [])').map(k => [k, ''])));
  Object.keys(BEFORE).forEach(id => {
    const m = R(`mailSample_('${id}')`);
    assert.strictEqual(crypto.createHash('sha256').update(m.subject + '\n' + m.from + '\n' + m.html).digest('hex').slice(0, 16), BEFORE[id], id + ' renders as before');
  });

  const NIGHT = '#141e27', SERIF = "Georgia,'Times New Roman',serif";
  const stripe = html => (html.match(/<td bgcolor="(#[0-9a-fA-F]{6})" style="background:\1;height:4px;/) || [])[1];
  const header = html => (html.match(/<tr><td bgcolor="(#[0-9a-fA-F]{6})"[^>]*><img src="https:\/\/vic-recruitment\.vercel\.app\/brand\/vic-logo-white\.png"/) || [])[1];
  const themed = (html, colour, label) => {
    assert.strictEqual(header(html), NIGHT, label + ': night header with the white logo');
    assert.strictEqual(stripe(html), colour, label + ': the stripe');
    assert(new RegExp('<h1 style="[^"]*font-family:' + SERIF.replace(/[()]/g, '\$&') + ';').test(html), label + ': a Georgia-fallback serif heading');
    assert(!/<img(?![^>]*vic-logo-white)/.test(html), label + ': no image beyond the logo');
  };

  // the ticket: aquamarine, the six digits in the code box, the spec's wording, from "VIC Recruitment"
  const t = R(`mailFrom_('CODE', { code: '482913' })`);
  assert.strictEqual(t.subject, 'Your ticket for Platform 9¾: 482913');
  assert.strictEqual(t.from, 'VIC Recruitment');
  themed(t.html, '#69c4af', 'ticket');
  assert(/>Your ticket is ready</.test(t.html) && /Type this ticket on the registration form to prove this ENP address is yours\. It works for 10 minutes\. If you did not ask for it, ignore this mail\./.test(t.html), 'the default wording');
  assert(/>Your ticket<\/div><div[^>]*>482913</.test(t.html), 'the six digits in the code box, under its label');
  assert.deepStrictEqual(R(`[mailDef_('CODE').name, mailDef_('CODE').to, mailDef_('CODE').vars]`), ['Registration ticket', 'candidate', ['code']]);
  assert.deepStrictEqual(R(`mailDef_('CODE').fields.map(function (f) { return f[0]; })`), ['subject', 'heading', 'above', 'codeLabel']);

  // the confirmation: same wording, the stripe in the 1st choice's house on the form
  const HOUSES = { IT: '#FF6A5E', COMM: '#7FB0FF', FLER: '#F4BB35', HR: '#46D392', '': '#69c4af', ART: '#69c4af' };
  Object.keys(HOUSES).forEach(dep => {
    const c = R(`mailFrom_('CONFIRM', { first: 'Lina', code: 'IT.07' }, { dept: ${J(dep)} })`);
    themed(c.html, HOUSES[dep], 'confirmation ' + (dep || 'blank'));
    assert(/Thanks for registering, Lina!/.test(c.html) && />IT\.07</.test(c.html), 'the wording stays');
  });
  assert.strictEqual(R("HOUSE.IT.name") + ' ' + R("HOUSE.COMM.name"), 'Ravenclaw Gryffindor', 'the sheets keep their own houses');
  assert.strictEqual(stripe(R(`mailSample_('CONFIRM')`).html), '#FF6A5E', 'the preview shows an IT registrant: Gryffindor');
  assert.strictEqual(stripe(R(`mailSample_('CODE')`).html), '#69c4af', 'the ticket preview');
  console.log('themed mails ok');
}

// ---- the ticket on Settings › Emails: {code} only, Preview and Send me a test, no switch, saved edits win ----
{
  const ticket = call('webState').mails.find(m => m.id === 'CODE');
  assert.deepStrictEqual([ticket.name, ticket.to, ticket.vars, ticket.fields.map(f => f.key)], ['Registration ticket', 'candidate', ['code'],
    ['MAIL_CODE_SUBJECT', 'MAIL_CODE_HEADING', 'MAIL_CODE_ABOVE', 'MAIL_CODE_CODELABEL']]);
  assert.throws(() => settings({ MAIL_CODE_ABOVE: 'Hi {first}' }), /unknown placeholder \{first\}\. This mail knows \{code\}/);
  run('__outbox.length = 0');
  const pv = call('webRun', 'mailPreview', { id: 'CODE', texts: { heading: 'Platform {code}' } }).result;
  assert(/>Platform 482913</.test(pv.html) && pv.subject === 'Your ticket for Platform 9¾: 482913' && !outbox().length, 'preview with sample digits, nothing sent');
  const sent = call('webRun', 'mailPreview', { id: 'CODE', send: true }).result;
  const got = outbox().pop();
  assert(sent.sent && got.subject === '[TEST] Your ticket for Platform 9¾: 482913' && got.name === 'VIC Recruitment' && got.htmlBody.includes('#141e27'), 'Send me a test: themed, from VIC Recruitment');
  run('__outbox.length = 0');
  call('webRun', 'mailPreview', { id: 'CONFIRM', send: true });
  assert(outbox().pop().htmlBody.includes('background:#FF6A5E;height:4px'), 'the confirmation test arrives themed in a house');
  settings({ MAIL_CONFIRM_HEADING: 'Welcome, {first}' });
  const c = R(`mailFrom_('CONFIRM', { first: 'Ann', code: 'HR.3' }, { dept: 'HR' })`).html;
  assert(/>Welcome, Ann</.test(c) && c.includes('background:#46D392;height:4px'), 'a saved confirmation edit keeps winning, in the house look');
  settings({ MAIL_CONFIRM_HEADING: '' });
  assert(!R('SETTINGS_DEFAULTS').some(r => /^CODE|TICKET/.test(r[0])), 'no On/Off setting for the ticket');
  console.log('ticket settings ok');
}

// ---- drift: the mailer (mailer/Code.gs) holds its own copy of the themed look; the same sample must give the same bytes ----
{
  const fs = require('fs'), vm = require('vm');
  const mailer = vm.createContext({ console, JSON, Math });
  vm.runInContext(fs.readFileSync(__dirname + '/../mailer/Code.gs', 'utf8'), mailer, { filename: 'mailer/Code.gs' });
  const viaMailer = (w, code) => JSON.parse(JSON.stringify(vm.runInContext(`ticketMail_(${J(w)}, ${J(code)})`, mailer)));
  const defaults = Object.fromEntries(R(`mailDef_('CODE').fields`));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext('MAILER.defaults', mailer))), defaults, 'the mailer has the Config.gs defaults');
  const viaScript = texts => { const m = R(`mailFrom_('CODE', { code: '073519' }, { texts: ${J(texts)} })`); return { subject: m.subject, html: m.html }; };
  assert.deepStrictEqual(viaMailer(defaults, '073519'), viaScript({}), 'the default ticket: byte-equal');
  const edited = { subject: 'Ticket {code} & more', heading: 'Hi <there> "{code}"', above: 'First **line**\nsame paragraph\n\nSecond {code} {other}', codeLabel: 'Ticket {code}' };
  assert.deepStrictEqual(viaMailer(edited, '073519'), viaScript(edited), 'edited wording: byte-equal');
  console.log('mailer drift ok');
}
