// Unit tests for the pure logic (Matching.gs, Rules.gs)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console });
require('./gs')(ctx);
vm.runInContext('globalThis.__x = {parseBinomeCode,parseIntervieweeCode,resolveInterview,draftPairs,pickBinome,nextCode,checkRegistration,buildInterviewAt,timingIssues,tagDepts,normPhone,bestNameMatch};', ctx);
const X = ctx.__x;
const D = iso => vm.runInContext('new Date("' + iso + '")', ctx);
let pass = 0; const t = (name, fn) => { try { fn(); pass++; } catch (e) { console.log('FAIL', name, '\n ', e.message); process.exitCode = 1; } };

t('binome codes', () => {
  const cases = { 'B.05': 'B.05', 'b5': 'B.05', 'B 5': 'B.05', 'B-05': 'B.05', '5': 'B.05', 'Binome 12': 'B.12', 'binôme 7': 'B.07', 'B.47': 'B.47', 'b.3 ': 'B.03' };
  for (const k in cases) assert.strictEqual(X.parseBinomeCode(k).code, cases[k], k);
  assert.strictEqual(X.parseBinomeCode('B.05').exact, true);
  assert.strictEqual(X.parseBinomeCode('Djamila & Sara'), null);
});
t('interviewee codes', () => {
  const cases = { 'IT.58': 'IT.58', 'it58': 'IT.58', 'IT 58': 'IT.58', 'It-058': 'IT.58', 'COMM.07': 'COMM.07', 'com 7': 'COMM.07', 'RH.3': 'HR.03', 'fler12': 'FLER.12', 'Interviewee IT 5': 'IT.05' };
  for (const k in cases) assert.strictEqual(X.parseIntervieweeCode(k).code, cases[k], k);
  const n = X.parseIntervieweeCode('58'); assert.strictEqual(n.dep, ''); assert.strictEqual(n.num, 58);
  assert.strictEqual(X.parseIntervieweeCode('Besmala Khellaf'), null);
});
t('tags', () => {
  assert.deepStrictEqual(Array.from(X.tagDepts('IT & HR')), ['IT', 'HR']);
  assert.strictEqual(X.tagDepts('ALL').length, 4);
  assert.deepStrictEqual(Array.from(X.tagDepts('FLER & HR')), ['FLER', 'HR']);
});

const binomes = [
  { code: 'B.05', tag: 'IT & HR', members: [{ name: 'Djamila Cherifi', email: 'dj@x' }, { name: 'Sara Bouznad', email: 'sara.b@x' }] },
  { code: 'B.44', tag: 'IT & HR', members: [{ name: 'Dhiaa Djouallah', email: 'dhia@x' }, { name: 'Ammar Temtaoui', email: 'ammar@x' }] },
  { code: 'B.47', tag: 'FLER & HR', members: [{ name: 'Abderaouf Douihasni', email: 'abd@x' }, { name: 'Zineddine Labed', email: 'zine@x' }] },
  { code: 'B.03', tag: 'COMM & HR', members: [{ name: 'Rami Ahmane', email: 'rami@x' }, { name: 'Aya Gharbi', email: 'aya@x' }] },
];
const ivs = [
  { code: 'IT.147', binome: 'B.05', name: 'Djaafar Darem', firstChoice: 'IT' },
  { code: 'IT.52', binome: 'B.05', name: 'Besmala Khellaf', firstChoice: 'IT' },
  { code: 'IT.46', binome: 'B.44', name: 'Ali Benali', firstChoice: 'IT' },
  { code: 'HR.06', binome: 'B.03', name: 'Naima Benarab', firstChoice: 'HR' },
  { code: 'COMM.10', binome: 'B.03', name: 'Farouk Dahlouk', firstChoice: 'COMM' },
];
const R = (inp, interviewed) => X.resolveInterview(inp, { binomes, interviewees: ivs, interviewed: interviewed || {}, nameByEmail: { 'dj@x': 'Djamila Cherifi', 'dhia@x': 'Dhiaa Djouallah' } });

t('interview: exact OK', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'IT.52', typedFirstChoice: 'IT' });
  assert.strictEqual(r.result, 'OK'); assert.strictEqual(r.binome, 'B.05'); assert.strictEqual(r.interviewee, 'IT.52');
});
t('interview: sloppy codes autocorrected', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'b5', typedInterviewee: 'it 52' });
  assert.strictEqual(r.result, 'AUTOCORRECTED'); assert.strictEqual(r.interviewee, 'IT.52'); assert.strictEqual(r.binome, 'B.05');
});
t('interview: names in binome field', () => {
  const r = R({ submitter: 'sara.b@x', typedBinome: 'Djamila & Sara', typedInterviewee: 'IT.147' });
  assert.strictEqual(r.result, 'AUTOCORRECTED'); assert.strictEqual(r.binome, 'B.05');
});
t('interview: interviewee name instead of code', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'besmala' });
  assert.strictEqual(r.result, 'AUTOCORRECTED'); assert.strictEqual(r.interviewee, 'IT.52');
});
t('interview: typo in code inside own binome', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'IT.147'.replace('147', '174') });
  // 174 vs 147 = distance 2 -> not a typo; number search fails; so FLAGGED
  assert.strictEqual(r.result, 'FLAGGED');
  const r2 = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'IT.14' }); // one char missing
  assert.strictEqual(r2.interviewee, 'IT.147'); assert.strictEqual(r2.result, 'AUTOCORRECTED');
});
t('interview: 2025 real case — B.44 member typed B.47', () => {
  const r = R({ submitter: 'dhia@x', typedBinome: 'B.47', typedInterviewee: 'IT.46' });
  assert.strictEqual(r.binome, 'B.44'); assert.strictEqual(r.result, 'AUTOCORRECTED');
});
t('interview: backup interviewer -> flag admin only', () => {
  const r = R({ submitter: 'rami@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' });
  assert.strictEqual(r.result, 'FLAGGED'); assert.strictEqual(r.alerts[0].type, 'BACKUP_INTERVIEWER'); assert.strictEqual(r.alerts[0].notifyBinome, false);
});
t('interview: someone else\'s candidate with own binome code -> flag admin only', () => {
  const r = R({ submitter: 'rami@x', typedBinome: 'B.03', typedInterviewee: 'IT.52' });
  assert.strictEqual(r.alerts[0].type, 'BINOME_MISMATCH'); assert.strictEqual(r.alerts[0].notifyBinome, false); assert.strictEqual(r.binome, 'B.05');
});
t('interview: unknown interviewee -> HIGH + notify binome', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'XYZ' });
  assert.strictEqual(r.result, 'FLAGGED'); assert.strictEqual(r.alerts[0].severity, 'HIGH'); assert.strictEqual(r.alerts[0].notifyBinome, true); assert.strictEqual(r.binome, 'B.05');
});
t('interview: personal gmail of a member is recognised', () => {
  const r = R({ submitter: 'djamilacherifi99@gmail.com', typedBinome: 'B.05', typedInterviewee: 'IT.52' });
  assert.strictEqual(r.result, 'AUTOCORRECTED'); assert.strictEqual(r.alerts.length, 0);
  const r2 = R({ submitter: 'random.person@gmail.com', typedBinome: 'B.05', typedInterviewee: 'IT.52' });
  assert.strictEqual(r2.result, 'FLAGGED');
});
t('interview: trusted backup is INFO only', () => {
  const r = X.resolveInterview({ submitter: 'rami@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' }, { binomes, interviewees: ivs, interviewed: {}, nameByEmail: {}, trustedBackups: ['rami@x'] });
  assert.strictEqual(r.result, 'OK'); assert.strictEqual(r.alerts[0].severity, 'INFO');
});
t('interview: duplicate', () => {
  const r = R({ submitter: 'dj@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' }, { 'IT.52': true });
  assert.strictEqual(r.alerts.some(a => a.type === 'DUPLICATE_INTERVIEW'), true);
});
t('interview: number only within binome', () => {
  const r = R({ submitter: 'rami@x', typedBinome: 'B.03', typedInterviewee: '10' });
  assert.strictEqual(r.interviewee, 'COMM.10'); assert.strictEqual(r.result, 'AUTOCORRECTED');
});
t('interview: dept mismatch = INFO only', () => {
  const r = R({ submitter: 'rami@x', typedBinome: 'B.03', typedInterviewee: 'HR.06', typedFirstChoice: 'COMM' });
  assert.strictEqual(r.result, 'OK'); assert.strictEqual(r.alerts[0].type, 'CHOICE_MISMATCH');
});

t('draft pairs', () => {
  const m = [];
  for (let i = 0; i < 17; i++) m.push({ name: 'HR' + i, email: 'hr' + i, pairAs: 'HR' });
  for (let i = 0; i < 12; i++) m.push({ name: 'IT' + i, email: 'it' + i, pairAs: 'IT' });
  for (let i = 0; i < 6; i++) m.push({ name: 'FL' + i, email: 'fl' + i, pairAs: 'FLER' });
  for (let i = 0; i < 4; i++) m.push({ name: 'CO' + i, email: 'co' + i, pairAs: 'COMM' });
  for (let i = 0; i < 5; i++) m.push({ name: 'BD' + i, email: 'bd' + i, pairAs: 'ALL' });
  const p = X.draftPairs(m, Math.random);
  const used = new Set(); p.forEach(x => [x.a, x.b].forEach(y => { if (y) { assert(!used.has(y.email), 'dup ' + y.email); used.add(y.email); } }));
  assert.strictEqual(used.size, m.length);
  assert.strictEqual(p.filter(x => x.tag === 'ALL').length, 5);
  p.filter(x => /& HR/.test(x.tag)).forEach(x => assert.strictEqual(x.a.pairAs, 'HR'));
  const warn = p.filter(x => x.warning);
  assert.strictEqual(warn.length, 0, JSON.stringify(warn.map(w => w.tag)));
});
t('draft pairs uneven', () => {
  const m = [{ name: 'h1', email: 'h1', pairAs: 'HR' }, { name: 'h2', email: 'h2', pairAs: 'HR' }, { name: 'h3', email: 'h3', pairAs: 'HR' }, { name: 'i1', email: 'i1', pairAs: 'IT' }];
  const p = X.draftPairs(m, Math.random);
  assert.strictEqual(p.length, 2); assert(p.some(x => x.tag === 'HR' && x.warning));
});
t('pick binome balances + routes HR anywhere', () => {
  const bs = [{ code: 'B.01', tag: 'IT & HR', load: 3 }, { code: 'B.02', tag: 'IT & HR', load: 1 }, { code: 'B.03', tag: 'COMM & HR', load: 0 }, { code: 'B.04', tag: 'ALL', load: 1 }];
  assert.strictEqual(X.pickBinome('IT', bs, 1).code, 'B.02');
  assert.strictEqual(X.pickBinome('IT', bs, 2).code, 'B.02');
  assert.strictEqual(X.pickBinome('HR', bs, 1).code, 'B.03');
  assert.strictEqual(X.pickBinome('FLER', bs, 1).code, 'B.04');
  assert.strictEqual(X.pickBinome('FLER', bs.slice(0, 3), 1), null);
});
t('next code', () => {
  assert.strictEqual(X.nextCode('IT', ['IT.01', 'IT.09', 'COMM.12']), 'IT.10');
  assert.strictEqual(X.nextCode('HR', []), 'HR.01');
});
t('registration checks', () => {
  const ts = new Date(2026, 9, 20);
  const ok = X.checkRegistration({ ts, collected: 'a.b@g.enp.edu.dz', typedEmail: 'a.b@g.enp.edu.dz', first: 'A', family: 'B', birth: '12/06/2006', phone: '554781447', c1: 'IT', c1raw: 'IT', c2: 'HR' }, [], 'g.enp.edu.dz');
  assert.strictEqual(ok.alerts.length, 0, JSON.stringify(ok.alerts)); assert.strictEqual(ok.phone, '0554781447');
  const bad = X.checkRegistration({ ts, collected: 'kenza.a@g.enp.edu.dz', typedEmail: 'Kenza.a@g.enp edu.dz', first: 'K', family: 'A', birth: '27/10/2025', phone: '12', c1: 'IT', c1raw: 'IT', c2: 'IT' }, [], 'g.enp.edu.dz');
  const types = bad.alerts.map(a => a.type).sort();
  assert.deepStrictEqual(Array.from(types), ['BAD_BIRTHDATE', 'BAD_EMAIL', 'BAD_PHONE', 'SAME_CHOICES']);
  const mism = X.checkRegistration({ ts, collected: 'x@g.enp.edu.dz', typedEmail: 'y@g.enp.edu.dz', first: 'K', family: 'A', birth: '', phone: '0661000000', c1: 'HR', c2: 'IT' }, [], 'g.enp.edu.dz');
  assert.deepStrictEqual(Array.from(mism.alerts.map(a => a.type)), ['EMAIL_MISMATCH']);
  const dup = X.checkRegistration({ ts, collected: 'x@g.enp.edu.dz', typedEmail: 'x@g.enp.edu.dz', first: 'K', family: 'A', phone: '0661000000', c1: 'HR', c2: 'IT' }, [{ code: 'HR.02', email: 'x@g.enp.edu.dz' }], 'g.enp.edu.dz');
  assert.strictEqual(dup.duplicateOf, 'HR.02');
});
t('interview date parsing', () => {
  const d = X.buildInterviewAt('09/11/2026', '14:30', '+01:00');
  assert.strictEqual(d.toISOString(), '2026-11-09T13:30:00.000Z');
  assert.strictEqual(X.buildInterviewAt('09/11/2026', '14h', '+01:00').toISOString(), '2026-11-09T13:00:00.000Z');
  assert.strictEqual(X.buildInterviewAt('09/11/2026', '', '+01:00').toISOString(), '2026-11-09T22:59:00.000Z');
  assert.strictEqual(X.buildInterviewAt('tuesday', '', '+01:00'), 'INVALID');
  assert.strictEqual(X.buildInterviewAt('', '', '+01:00'), null);
});
t('timing issues', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const lim = { contactH: 24, dateH: 48, afterH: 12 };
  const reg = new Date('2026-11-07T12:00:00Z');
  const a = X.timingIssues({ code: 'IT.01', status: 'ASSIGNED', registeredAt: reg, contacted: 'Not yet', interviewAt: null }, now, lim);
  assert.deepStrictEqual(Array.from(a.map(x => x.type)), ['NOT_CONTACTED', 'NO_DATE']);
  const b = X.timingIssues({ code: 'IT.01', status: 'SCHEDULED', registeredAt: reg, contacted: 'Yes', interviewAt: D('2026-11-09T20:00:00Z'), interviewLabel: 'x' }, now, lim);
  assert.deepStrictEqual(Array.from(b.map(x => x.type)), ['OVERDUE']);
  const c = X.timingIssues({ code: 'IT.01', status: 'ASSIGNED', registeredAt: reg, assignedAt: D('2026-11-10T06:00:00Z'), contacted: '', interviewAt: null }, now, lim);
  assert.deepStrictEqual(Array.from(c.map(x => x.type)), []);
  assert.strictEqual(X.timingIssues({ code: 'IT.01', status: 'INTERVIEWED', registeredAt: reg }, now, lim).length, 0);
});
console.log(pass + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
