// The standalone mailer (mailer/Code.gs, run as vic.rh): the site's ticket mail and the health check's ping.
// Google is faked here: script properties, the Master's Settings tab, the script cache, MailApp. Made-up addresses only.
const assert = require('assert'), crypto = require('crypto'), fs = require('fs'), vm = require('vm');

const sent = [], reads = { n: 0 }, store = {};
let settingsRows = [['Key', 'Value'], ['MAIL_CODE_SUBJECT', ''], ['MAIL_CODE_HEADING', '  '], ['ADMIN_EMAIL', 'x@g.enp.edu.dz']];
let clock = 0, masterFails = false, quotaFails = false;
const ctx = vm.createContext({
  console: { log() {}, error() {} }, JSON, Math, Date: { now: () => clock },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ MAILER_SECRET: 'long-secret', EMAIL_DOMAIN: 'g.enp.edu.dz', MASTER_ID: 'MASTER' })[k] || null }) },
  SpreadsheetApp: { openById: id => {
    if (masterFails || id !== 'MASTER') throw new Error('no access');
    return { getSheetByName: n => n !== 'Settings' ? null : { getDataRange: () => ({ getValues: () => { reads.n++; return settingsRows.map(r => r.slice()); } }) } };
  } },
  CacheService: { getScriptCache: () => ({
    get: k => (store[k] && store[k].until > clock ? store[k].v : null),
    put: (k, v, s) => { store[k] = { v: v, until: clock + s * 1000 }; },
  }) },
  MailApp: { sendEmail: o => sent.push(o), getRemainingDailyQuota: () => (quotaFails ? (() => { throw new Error('quota'); })() : 1294) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
  Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)) },
});
vm.runInContext(fs.readFileSync(__dirname + '/../mailer/Code.gs', 'utf8'), ctx, { filename: 'mailer/Code.gs' });
const post = body => vm.runInContext('doPost', ctx)({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).body;
const ok = { secret: 'long-secret', to: 'test.person@g.enp.edu.dz', code: '204816' };

// ---- the ping: answers, sends nothing, and needs the secret like a send ----
assert.deepStrictEqual(post({ secret: 'long-secret', ping: true }), { ok: true, quota: 1294 }, 'the ping says how many mails are left today');
quotaFails = true;
assert.deepStrictEqual(post({ secret: 'long-secret', ping: true }), { ok: true }, 'no quota when Google will not say, still ok');
quotaFails = false;
assert.deepStrictEqual(post({ secret: 'wrong', ping: true }), { ok: false, reason: 'secret' });
assert.strictEqual(sent.length, 0, 'a ping sends nothing');

// ---- refused: the secret, the address, the code, a body that is not JSON; nothing sent ----
[[{ ...ok, secret: 'long-secreT' }, 'secret'], [{ ...ok, secret: '' }, 'secret'], [{ ...ok, secret: undefined }, 'secret'],
  [{ ...ok, to: 'someone@gmail.com' }, 'to'], [{ ...ok, to: 'a@g.enp.edu.dz.evil.dz' }, 'to'], [{ ...ok, to: 'a@x.dz,b@g.enp.edu.dz' }, 'to'],
  [{ ...ok, to: 'a b@g.enp.edu.dz' }, 'to'], [{ ...ok, to: '@g.enp.edu.dz' }, 'to'], [{ ...ok, to: 42 }, 'to'],
  [{ ...ok, code: '12345' }, 'code'], [{ ...ok, code: '1234567' }, 'code'], [{ ...ok, code: '12a456' }, 'code'], [{ ...ok, code: 204816 }, 'code']]
  .forEach(([body, reason]) => assert.deepStrictEqual(post(body), { ok: false, reason: reason }, JSON.stringify(body)));
assert.deepStrictEqual(post('not json'), { ok: false, reason: 'bad request' });
assert.strictEqual(sent.length, 0, 'a refused call sends nothing');

// the secret is compared in constant time: digests, every byte, no early exit
const src = fs.readFileSync(__dirname + '/../mailer/Code.gs', 'utf8');
assert(/computeDigest/.test(src) && !/secret\s*[!=]==?\s*|[!=]==?\s*secret\b/.test(src.replace(/\/\/.*$/gm, '')), 'no plain comparison of the secret');

// ---- one mail, as "VIC Recruitment", the defaults where the Settings rows are blank ----
assert.deepStrictEqual(post(ok), { ok: true });
assert.strictEqual(sent.length, 1);
const m = sent[0];
assert.deepStrictEqual([m.to, m.name, m.subject], ['test.person@g.enp.edu.dz', 'VIC Recruitment', 'Your ticket for Platform 9¾: 204816']);
assert(/>Your ticket is ready</.test(m.htmlBody) && />204816</.test(m.htmlBody) && /It works for 10 minutes\./.test(m.htmlBody), 'blank or spaces: the default');
assert(!m.replyTo && !m.from, 'replies go to the sending account (vic.rh)');
assert.deepStrictEqual(post({ ...ok, to: 'Test.Person@G.ENP.EDU.DZ' }), { ok: true }, 'the domain is matched in any case');
assert.deepStrictEqual(post({ ...ok, to: "M'hamed.Ouali@g.enp.edu.dz" }), { ok: true }, 'an apostrophe in the address (an ENP one has it)');
assert.strictEqual(sent[sent.length - 1].to, "m'hamed.ouali@g.enp.edu.dz");

// ---- the wording comes from the Master, read at most once a minute ----
settingsRows[2][1] = 'Here is ticket {code}, <b>';
clock += 61000;
const before = reads.n;
post(ok);
assert.strictEqual(reads.n, before + 1, 'cache expired: read again');
assert(sent.pop().htmlBody.includes('>Here is ticket 204816, &lt;b&gt;<'), 'the edited heading, filled and escaped');
settingsRows[2][1] = 'Edited again';
clock += 30000;
post(ok);
assert.strictEqual(reads.n, before + 1, 'within 60 s: the cached wording');
assert(/Here is ticket/.test(sent.pop().htmlBody));
clock += 31000;
post(ok);
assert(/>Edited again</.test(sent.pop().htmlBody), 'after 60 s the new wording');

// ---- the Master unreadable: the defaults, the mail still goes ----
masterFails = true; clock += 61000;
assert.deepStrictEqual(post(ok), { ok: true });
assert(/>Your ticket is ready</.test(sent.pop().htmlBody), 'the defaults when the Master cannot be read');
masterFails = false;
post(ok);
assert(/>Edited again</.test(sent.pop().htmlBody), 'a failed read is not cached: the next mail reads the Master again');

// ---- a send that fails answers so ----
ctx.MailApp.sendEmail = () => { throw new Error('quota'); };
assert.deepStrictEqual(post(ok), { ok: false, reason: 'send' });

console.log('MAILER OK');
