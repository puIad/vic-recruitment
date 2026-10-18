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
const confirms = () => outbox().filter(m => m.subject === run('CONFIRM_MAIL.subject')).map(m => m.to).sort();
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
const conf = run(`confirmHtml_('Lina', 'IT.07')`);
assert(/Thanks for registering, Lina!/.test(conf) && />IT\.07</.test(conf) && /binome/.test(conf), 'thanks, the code, a binome will contact them');
assert(!/<a /.test(conf), 'no internal link to a candidate');
assert(!/interview/i.test(conf), 'never promises an interview');

// ---- which registrations get one: a code, waiting / assigned / held, a usable email and first name ----
const picked = () => R(`(function () {
  var I = idx_(IV_H), mk = function (st, code, first, email) { var r = new Array(IV_H.length).fill(''); r[I.Status] = st; r[I.Code] = code; r[I['First Name']] = first; r[I.Email] = email; return r; };
  var ctx = { iv: { I: I }, now: new Date(), confirm: [mk('UNASSIGNED', 'IT.90', 'A', 'a@x.dz'), mk('ASSIGNED', 'IT.91', 'B', 'b@x.dz'), mk('HELD', 'IT.92', 'C', 'c@x.dz'),
    mk('DUPLICATE', 'IT.93', 'D', 'd@x.dz'), mk('DECLINED', 'IT.94', 'E', 'e@x.dz'), mk('UNASSIGNED', '', 'F', 'f@x.dz'), mk('ASSIGNED', 'IT.95', ' ', 'g@x.dz'),
    mk('ASSIGNED', 'IT.96', 'H', 'not an email'), mk('ASSIGNED', 'IT.97', 'K', ''), mk('ASSIGNED', 'IT.98', 'ليلى', 'l@x.dz')] };
  stampConfirmations_(ctx);
  return ctx.confirm.map(function (r) { return r[I.Code] + ' ' + r[I.Flags]; }); })()`);
const p = picked();
assert.deepStrictEqual(p.map(x => x.split(' ')[0]), ['IT.90', 'IT.91', 'IT.92', 'IT.98'], 'not duplicates, declined (VIC members), no code, no name, no email; any script');
assert(p.every(x => /CONFIRMED \d\d\/\d\d\/\d{4}$/.test(x)), 'stamped in Flags: ' + J(p));

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');

// ---- through the sync: sent once, after the save, escaped ----
settings({ TEST_MODE: false });
run('__outbox.length = 0');
apply('lina.amrani@g.enp.edu.dz', 'Lina', 'Amrani');
apply('ines.kaci@g.enp.edu.dz', 'Ines<i>"', 'Kaci');
sync();
assert.deepStrictEqual(confirms(), ['ines.kaci@g.enp.edu.dz', 'lina.amrani@g.enp.edu.dz']);
const lina = ivRow('lina.amrani@g.enp.edu.dz');
assert(lina[IV.Code] && /CONFIRMED \d\d\/\d\d\/\d{4}/.test(lina[IV.Flags]), 'the sent mark is saved: ' + lina[IV.Flags]);
const mine = outbox().find(m => m.to === 'lina.amrani@g.enp.edu.dz');
assert(mine.htmlBody.includes('>' + lina[IV.Code] + '<'), 'their code');
const ines = outbox().find(m => m.to === 'ines.kaci@g.enp.edu.dz').htmlBody;
assert(ines.includes('Ines&lt;i&gt;&quot;') && !ines.includes('Ines<i>'), 'the name is escaped');
const binMail = outbox().find(m => /New interviewee/.test(m.subject));
assert(binMail && binMail.htmlBody.includes(lina[IV.Code]) && binMail.htmlBody.includes('Open your binome sheet'), 'the binome mail, through the template');
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

assert.strictEqual(run('__untemplated.length'), 0, J(run('__untemplated')));
console.log('MAIL OK');
