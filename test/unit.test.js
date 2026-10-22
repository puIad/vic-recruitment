// Unit tests for the pure logic (Matching.gs, Rules.gs)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console });
require('./gs')(ctx);
vm.runInContext('globalThis.__x = {screenApplication,namesSwapped,parseBinomeCode,parseIntervieweeCode,resolveInterview,draftPairs,makePair,draftMix,pickBinome,nextCode,checkRegistration,buildInterviewAt,timingIssues,tagDepts,tagFor,normPhone,bestNameMatch,unpairedMembers,guessBirthYear,birthInfo};', ctx);
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
  assert.deepStrictEqual([['HR', 'IT'], ['COMM', 'IT'], ['HR'], ['HR', 'FLER', 'COMM', 'IT'], [], ['XX']].map(d => X.tagFor(d)),
    ['IT & HR', 'IT & COMM', 'HR', 'IT & COMM & FLER & HR', '', '']);
  assert.deepStrictEqual(Array.from(X.tagDepts(X.tagFor(['HR', 'FLER']))), ['FLER', 'HR'], 'tagDepts reads tagFor back');
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

t('interview: former member of the binome = INFO, wrong code corrected', () => {
  const RF = (inp, former) => X.resolveInterview(inp, { binomes, interviewees: ivs, interviewed: {}, nameByEmail: {}, former: former });
  let r = RF({ submitter: 'old@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' }, { 'B.05': ['old@x'] });
  assert.deepStrictEqual([r.result, r.alerts.length, r.alerts[0].severity, r.alerts[0].type], ['OK', 1, 'INFO', 'BACKUP_INTERVIEWER']);
  r = RF({ submitter: 'old@x', typedBinome: 'B.44', typedInterviewee: 'IT.52' }, { 'B.05': ['old@x'] });
  assert.deepStrictEqual([r.result, r.binome, r.alerts.length], ['AUTOCORRECTED', 'B.05', 0]);
  r = RF({ submitter: 'old@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' }, {});
  assert.strictEqual(r.alerts[0].severity, 'MEDIUM', 'a stranger is still MEDIUM');
});
t('interview: a cover person counts as a member for the covered codes only', () => {
  const RC = inp => X.resolveInterview(inp, { binomes, interviewees: ivs, interviewed: {}, nameByEmail: {}, covers: { 'IT.52': ['cov@x'] } });
  let r = RC({ submitter: 'cov@x', typedBinome: 'B.05', typedInterviewee: 'IT.52' });
  assert.deepStrictEqual([r.result, r.binome, r.alerts.length], ['OK', 'B.05', 0]);
  assert(/covers IT.52/.test(r.notes[0]), r.notes);
  r = RC({ submitter: 'cov@x', typedBinome: 'B.47', typedInterviewee: 'IT.52' }); // typed their own binome
  assert.deepStrictEqual([r.result, r.binome, r.alerts.length], ['AUTOCORRECTED', 'B.05', 0]);
  r = RC({ submitter: 'cov@x', typedBinome: 'B.05', typedInterviewee: 'IT.147' }); // not covered
  assert.deepStrictEqual([r.alerts[0].type, r.alerts[0].severity], ['BACKUP_INTERVIEWER', 'MEDIUM']);
});
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
// experience: a fixed rnd per seed, so a failure replays
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const team = spec => {
  const m = [];
  Object.keys(spec).forEach(k => { const [side, cls] = k.split(':'); for (let i = 0; i < spec[k]; i++) m.push({ name: k + i, email: (k + i).toLowerCase(), pairAs: side, experienced: cls === 'exp' }); });
  return m;
};
const plain = x => JSON.parse(JSON.stringify(x)); // the vm's arrays are another realm's
const once = p => { const used = new Set(); p.forEach(x => [x.a, x.b].forEach(y => { if (y) { assert(!used.has(y.email), 'twice: ' + y.email); used.add(y.email); } })); return used.size; };
t('draft pairs: each new member gets an experienced partner when there are enough', () => {
  for (let s = 1; s <= 40; s++) {
    const m = team({ 'HR:new': 6, 'HR:exp': 4, 'IT:exp': 4, 'IT:new': 3, 'FLER:exp': 2, 'COMM:new': 1 });
    const p = X.draftPairs(m, seeded(s));
    assert.strictEqual(once(p), m.length, 'everyone once');
    assert.strictEqual(p.length, 10);
    p.forEach(x => { assert.strictEqual(x.a.pairAs, 'HR'); assert.strictEqual(x.tag, x.b.pairAs + ' & HR'); assert.strictEqual(x.warning, ''); });
    assert.strictEqual(p.filter(x => x.bothNew).length, 0, 'seed ' + s + ': nobody new with new');
    p.filter(x => !x.a.experienced).forEach(x => assert(x.b.experienced, 'a new HR member gets an experienced partner'));
    p.filter(x => x.a.experienced).forEach(x => assert(!x.b.experienced, 'an experienced HR member gets a new one'));
    assert.deepStrictEqual(Object.assign({}, X.draftMix(p)), { binomes: 10, withExp: 10, without: 0, experienced: 10, fresh: 10 });
  }
});
t('draft pairs: experienced members go first to the biggest other-department pool', () => {
  const p = X.draftPairs(team({ 'HR:new': 2, 'IT:exp': 3, 'IT:new': 2, 'COMM:exp': 1 }), seeded(7));
  assert.deepStrictEqual(plain(p.filter(x => x.a.pairAs === 'HR').map(x => x.b.pairAs + ':' + x.b.experienced)), ['IT:true', 'IT:true'], 'IT (5) before COMM (1)');
});
t('draft pairs: both new only when forced, with a note', () => {
  for (let s = 1; s <= 20; s++) {
    const p = X.draftPairs(team({ 'HR:new': 5, 'IT:new': 4, 'IT:exp': 1 }), seeded(s));
    assert.strictEqual(p.length, 5);
    assert.strictEqual(p.filter(x => x.bothNew).length, 4, 'one experienced member for five binomes');
    assert(p.every(x => x.bothNew === (!x.a.experienced && !x.b.experienced)));
    assert.deepStrictEqual(Object.assign({}, X.draftMix(p)), { binomes: 5, withExp: 1, without: 4, experienced: 1, fresh: 9 });
  }
});
t('draft pairs: a class that runs out falls back to the other', () => {
  const p = X.draftPairs(team({ 'HR:exp': 3, 'IT:exp': 3 }), seeded(3));
  assert.deepStrictEqual([p.length, p.every(x => x.tag === 'IT & HR' && !x.bothNew)], [3, true], 'experienced with experienced rather than HR + HR');
});
t('draft pairs: board leads take a new member, a new lead an experienced one', () => {
  for (let s = 1; s <= 20; s++) {
    const p = X.draftPairs(team({ 'ALL:exp': 1, 'IT:exp': 1, 'IT:new': 1, 'HR:exp': 1 }), seeded(s));
    const lead = p.find(x => x.tag === 'ALL');
    assert.deepStrictEqual([lead.a.pairAs, lead.b.pairAs, lead.b.experienced], ['ALL', 'IT', false]);
    const q = X.draftPairs(team({ 'ALL:new': 1, 'IT:exp': 1, 'IT:new': 1, 'HR:new': 1 }), seeded(s));
    assert.strictEqual(q.find(x => x.tag === 'ALL').b.experienced, true);
  }
});
t('draft pairs: HR + HR and other leftovers mix new with experienced', () => {
  for (let s = 1; s <= 20; s++) {
    const hr = X.draftPairs(team({ 'HR:new': 2, 'HR:exp': 2 }), seeded(s));
    assert.deepStrictEqual(plain(hr.map(x => [x.tag, x.bothNew, !!x.warning])), [['HR', false, true], ['HR', false, true]]);
    const it = X.draftPairs(team({ 'IT:new': 2, 'COMM:exp': 2 }), seeded(s));
    assert(it.every(x => !x.bothNew && /No HR member/.test(x.warning)), JSON.stringify(it.map(x => x.tag)));
    const odd = X.draftPairs(team({ 'HR:new': 2, 'HR:exp': 1 }), seeded(s));
    assert.deepStrictEqual(plain(odd.map(x => [!!x.b, x.warning])), [[true, 'Two HR members (they only receive HR candidates)'], [false, 'No partner left']]);
    assert.strictEqual(odd[0].bothNew, false, 'the new HR members go first, so the first one gets the experienced one');
  }
});
t('makePair: tags and warnings for hand-made pairs', () => {
  const P = (a, b) => X.makePair({ pairAs: a.split(':')[0], experienced: a.endsWith(':exp') }, b && { pairAs: b.split(':')[0], experienced: b.endsWith(':exp') });
  assert.deepStrictEqual(plain(['HR:new|IT:exp', 'IT:new|HR:new', 'ALL:exp|HR:new', 'IT:new|COMM:new', 'HR:exp|HR:exp', 'ALL:exp|'].map(k => {
    const [a, b] = k.split('|'), p = P(a, b);
    return [p.tag, p.warning, p.bothNew];
  })), [['IT & HR', '', false], ['IT & HR', '', true], ['ALL', '', false], ['IT & COMM', 'No HR member available for this pair', true],
    ['HR', 'Two HR members (they only receive HR candidates)', false], ['ALL', 'No partner left for this board member', false]]);
  assert.strictEqual(P('HR:new', ':new').warning, '', 'someone not in the Team tab: no guess about the shape');
});
t('unpaired members: only locked binomes count; excluded and SKIP ignored', () => {
  const team = [{ name: 'A', email: 'a', pairAs: 'HR' }, { name: 'B', email: 'b', pairAs: 'IT' }, { name: 'C', email: 'c', pairAs: 'IT', exclude: true },
    { name: 'D', email: 'd', pairAs: 'SKIP' }, { name: 'E', email: 'e', pairAs: 'COMM' }, { name: 'F', email: 'f', pairAs: 'FLER' }];
  const bins = [{ code: 'B.01', status: 'ACTIVE', members: [{ email: 'a' }] }, { code: 'B.02', status: 'PAUSED', members: [{ email: 'f' }] },
    { code: 'B.03', status: 'DRAFT', members: [{ email: 'e' }, { email: '' }] }];
  assert.deepStrictEqual(X.unpairedMembers(team, bins).map(m => m.email + ':' + m.draft), ['b:', 'e:B.03']);
});
t('pick binome balances + routes HR anywhere', () => {
  const bs = [{ code: 'B.01', tag: 'IT & HR', load: 3 }, { code: 'B.02', tag: 'IT & HR', load: 1 }, { code: 'B.03', tag: 'COMM & HR', load: 0 }, { code: 'B.04', tag: 'ALL', load: 1 }];
  assert.strictEqual(X.pickBinome('IT', bs, 1).code, 'B.02');
  assert.strictEqual(X.pickBinome('IT', bs, 2).code, 'B.02');
  assert.strictEqual(X.pickBinome('HR', bs, 1).code, 'B.03');
  assert.strictEqual(X.pickBinome('FLER', bs, 1).code, 'B.04');
  assert.strictEqual(X.pickBinome('FLER', bs.slice(0, 3), 1), null);
});
t('pick binome: HR-only weight on the 32 production tags (launch-features section 5)', () => {
  const tagOf = n => n <= 10 || n >= 31 ? 'IT & HR' : n <= 19 ? 'COMM & HR' : n <= 28 ? 'FLER & HR' : 'HR';
  const fresh = () => Array.from({ length: 32 }, (_, i) => ({ code: 'B.' + String(i + 1).padStart(2, '0'), tag: tagOf(i + 1), load: 0 }));
  const run = (k, deps) => { const bs = fresh(); deps.forEach(d => { X.pickBinome(d, bs, 1, k).load++; }); return bs; };
  // a steady mix of departments, HR the biggest, as in 2025
  const stream = []; for (let i = 0; i < 40; i++) stream.push('HR', 'IT', 'HR', 'COMM', 'IT', 'HR', 'FLER');
  const hrOnly = bs => bs.filter(b => b.tag === 'HR').map(b => b.load), mixedMin = bs => Math.min(...bs.filter(b => b.tag !== 'HR').map(b => b.load));
  const k1 = run(1, stream);
  assert.ok(hrOnly(k1).every(l => l <= mixedMin(k1) + 1), 'K = 1: an HR-only binome gets the same share as the lightest mixed one');
  const k25 = run(2.5, stream);
  hrOnly(k25).forEach(l => { const r = l / mixedMin(k25); assert.ok(r > 2.2 && r < 2.8, 'K = 2.5: about 2.5 × the lightest mixed load, got ' + r); });
  // ties: HR-only first, then the lowest code; a non-HR candidate never sees the weight
  const bs = fresh();
  assert.deepStrictEqual(['HR', 'HR', 'HR'].map(d => { const b = X.pickBinome(d, bs, 1, 1); b.load++; return b.code; }), ['B.29', 'B.30', 'B.01']);
  assert.strictEqual(X.pickBinome('IT', fresh(), 1, 4).code, 'B.01');
  assert.strictEqual(X.pickBinome('HR', [{ code: 'B.01', tag: 'IT & HR', load: 2 }, { code: 'B.02', tag: 'HR', load: 4 }], 1, 2).code, 'B.02', '4 / 2 ties 2: HR-only wins');
  assert.strictEqual(X.pickBinome('HR', [{ code: 'B.01', tag: 'IT & HR', load: 2 }, { code: 'B.02', tag: 'HR', load: 5 }], 1, 2).code, 'B.01');
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
  assert.strictEqual(bad.alerts.find(a => a.type === 'SAME_CHOICES').severity, 'INFO', 'the same department twice is information, not a mistake');
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
t('screening: each signal, made-up answers', () => {
  const S = (whyVic, whyDept, anything) => X.screenApplication({ whyVic, whyDept, dept: 'IT', anything: anything || '' });
  const long = 'I want to learn design and meet people who build things together at school';
  let r = S(long, 'Because I already edit videos and want to get better at it with a team');
  assert.deepStrictEqual([r.score, r.reasons.length], [0, 0]);
  r = S('..', '.', ':)');
  assert.deepStrictEqual([r.score, Array.from(r.reasons)], [100, ['Why VIC: only ".."', 'Why IT: only "."', 'Under 10 words in all']]);
  r = S('/', long);
  assert.deepStrictEqual([r.score, Array.from(r.reasons)], [60, ['Why VIC: only "/"']], 'one strong sign holds by itself');
  r = S(long, 'Creativity');
  assert.deepStrictEqual([r.score, r.reasons[0]], [50, 'Why IT: one word, "Creativity"']);
  assert.strictEqual(S(long, '🔥🔥').reasons[0], 'Why IT: only "🔥🔥"', 'emoji only = no words');
  assert.strictEqual(S(long, '').reasons[0], 'Why IT: empty');
  ['I don’t know', 'idk', 'No idea.', 'rien', 'je sais pas', 'test test test', 'N/A'].forEach(x =>
    assert.strictEqual(S(long, x).score, 50, x + ' is a non-answer'));
  assert.strictEqual(S(long, 'I know nothing about IT yet but I want to learn it').score, 0, 'containing the words is fine');
  r = S('I love this club', 'I love technology');
  assert.deepStrictEqual([r.score, Array.from(r.reasons)], [10, ['Under 10 words in all']], 'short but sincere stays under 50');
  assert.strictEqual(S('Y3jbni bzff w endi bzf des amies tma alors bghit ndir haja jdida', 'Nbghu RH bzf').score, 0, 'Darija counts words like English');
  assert.strictEqual(S('أريد أن أتعلم أشياء جديدة مع الفريق', 'لأنني أحب التصميم والتواصل').score, 0, 'Arabic words count');
  assert.strictEqual(S('apprendre de nouvelles choses', 'Pour apprendre des choses').score, 10, 'French short = short, not junk');
  r = X.screenApplication({ whyVic: '.', whyDept: null, dept: 'IT', anything: '' });
  assert.deepStrictEqual(Array.from(r.reasons), ['Why VIC: only "."', 'Under 10 words in all'], 'no why-question for the department: not checked');
  assert.strictEqual(S('.', '.', '.').score, 100, 'capped at 100');
  assert.strictEqual(S(long, 'x'.repeat(60)).reasons[0], 'Why IT: one word, "' + 'x'.repeat(39) + '…"', 'long quotes are cut');
});
t('names typed the wrong way round', () => {
  assert.strictEqual(X.namesSwapped('Boureghda', 'Yasser', 'yasser.boureghda@g.enp.edu.dz'), true);
  assert.strictEqual(X.namesSwapped('Yasser', 'Boureghda', 'yasser.boureghda@g.enp.edu.dz'), false, 'right way round');
  assert.strictEqual(X.namesSwapped('Hadj Sadok', 'Wissam Amani', 'wissam_amani.hadj_sadok@g.enp.edu.dz'), true, 'several names');
  assert.strictEqual(X.namesSwapped('Ziad', 'Sarah', 'sarah_nadia.ziad@g.enp.edu.dz'), true, 'one of several');
  assert.strictEqual(X.namesSwapped('Sarah', 'Sarah', 'sarah.sarah@g.enp.edu.dz'), false, 'same name both sides: leave it');
  assert.strictEqual(X.namesSwapped('Ali', 'Benali', 'someone@gmail.com'), false, 'no first.family email');
  assert.strictEqual(X.namesSwapped('Benali', 'Ali', 'x.y.z@g.enp.edu.dz'), false, 'not two parts');
  assert.strictEqual(X.namesSwapped('Benali', '', 'ali.benali@g.enp.edu.dz'), false, 'an empty field');
  assert.strictEqual(X.namesSwapped('Bénali', 'Ali', 'ali.benali@g.enp.edu.dz'), true, 'accents');
});
t('birth year guessed from the year of study', () => {
  const reg = D('2025-10-26T10:00:00');
  assert.deepStrictEqual(['PREPA|1ST', 'prepa|2ND', 'DATA|1ST', 'ELT|3RD'].map(k => X.guessBirthYear(k.split('|')[1], k.split('|')[0], reg)), [2007, 2006, 2005, 2003]);
  assert.deepStrictEqual([X.guessBirthYear('', 'PREPA', reg), X.guessBirthYear('1ST', '', reg), X.guessBirthYear('1ST', 'PREPA', '')], [null, null, null]);
  const B = (b, y, f) => JSON.parse(JSON.stringify(X.birthInfo(b, reg, y, f)));
  assert.deepStrictEqual(B('14/05/2025', '1ST', 'PREPA'), { date: '2025-05-14', suspect: true, guess: '2007-05-14' }, 'the current year typed: guessed');
  assert.deepStrictEqual(B('14/05/2006', '1ST', 'PREPA'), { date: '2006-05-14', suspect: false, guess: '' }, 'a plausible date stays');
  assert.deepStrictEqual(B(D('1980-02-03T00:00:00'), '2ND', 'MECA'), { date: '1980-02-03', suspect: true, guess: '2004-02-03' }, 'a Date from the sheet');
  assert.deepStrictEqual(B('sometime', '1ST', 'PREPA'), { date: 'sometime', suspect: true, guess: '' }, 'unreadable: no day to keep');
  assert.deepStrictEqual(B('14/05/2025', '', 'PREPA'), { date: '2025-05-14', suspect: true, guess: '' }, 'no year of study: no guess');
  assert.deepStrictEqual(B('', '1ST', 'PREPA'), { date: '', suspect: false, guess: '' });
});
console.log(pass + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
