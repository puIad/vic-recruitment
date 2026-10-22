// The Overview's to-do (frontend/src/lib/vic/overview.ts, issue 144): what needs a person today, one row per kind, worst
// first, and the locked binomes falling behind. Node strips the TypeScript types, so the UI's own module is tested as it ships.
const assert = require('assert');
const O = require('../frontend/src/lib/vic/overview.ts');

let n = 0;
const t = (name, fn) => { fn(); n++; };

let seq = 0;
const alert = (type, severity = 'MEDIUM', code = '') => ({ id: 'A' + ++seq, created: '24/10 10:00', severity, type, code, binome: '', msg: '', fix: [] });
const state = (over = {}) => Object.assign({
  settings: { assignmentsOpen: true, testMode: false, shareFiles: true },
  counts: { byStatus: {}, byDep: {} },
  locked: true,
  unpaired: [],
}, over);
const keys = (rows) => rows.map((r) => r.key);

t('open alerts become one row per type with its count, worst first, each linking to the inbox filtered by type', () => {
  const alerts = [alert('NO_DATE'), alert('NOT_CONTACTED', 'HIGH'), alert('NO_DATE'), alert('BAD_EMAIL', 'INFO'), alert('NO_DATE'), alert('NOT_CONTACTED', 'HIGH')];
  const rows = O.todoRows(state(), alerts);
  assert.deepStrictEqual(rows.map((r) => [r.label, r.count, r.tone, r.to]), [
    ['Not contacted in time', 2, 'HIGH', '/alerts?type=NOT_CONTACTED'],
    ['No interview date', 3, 'MEDIUM', '/alerts?type=NO_DATE'],
    ['Email looks wrong', 1, 'INFO', '/alerts?type=BAD_EMAIL'],
  ]);
});

t('held screenings are one row counted from HELD registrants, standing in for their NEEDS_REVIEW alerts, opening the first', () => {
  const review = alert('NEEDS_REVIEW', 'MEDIUM', 'R-12');
  const rows = O.todoRows(state({ counts: { byStatus: { HELD: 3, ASSIGNED: 9 }, byDep: {} } }), [review, alert('NEEDS_REVIEW'), alert('NO_DATE')]);
  assert.deepStrictEqual(keys(rows), ['held', 'NO_DATE'], 'no separate NEEDS_REVIEW row');
  assert.deepStrictEqual([rows[0].count, rows[0].tone], [3, 'MEDIUM']);
  assert.strictEqual(rows[0].to, `/alerts?type=NEEDS_REVIEW&id=${review.id}`);
});

t('held registrants whose alert is not raised yet still show, linking to the filter alone', () => {
  const rows = O.todoRows(state({ counts: { byStatus: { HELD: 1 }, byDep: {} } }), []);
  assert.deepStrictEqual(rows.map((r) => [r.key, r.count, r.to]), [['held', 1, '/alerts?type=NEEDS_REVIEW']]);
});

t('members left without a binome after lock are one row linking to Binomes, standing in for their UNPAIRED_MEMBER alerts', () => {
  const unpaired = [{ email: 'a@g.enp.edu.dz' }, { email: 'b@g.enp.edu.dz' }];
  const rows = O.todoRows(state({ unpaired }), [alert('UNPAIRED_MEMBER'), alert('UNPAIRED_MEMBER')]);
  assert.deepStrictEqual(rows.map((r) => [r.key, r.count, r.tone, r.to]), [['unpaired', 2, 'MEDIUM', '/binomes']]);
});

t('before lock, free members are pairing work for the launch card, not a to-do row', () => {
  assert.deepStrictEqual(O.todoRows(state({ locked: false, unpaired: [{ email: 'a@g.enp.edu.dz' }] }), []), []);
});

t('assignments paused and sharing off lead the list, without a count, each linking to its Settings page', () => {
  const settings = { assignmentsOpen: false, testMode: false, shareFiles: false };
  const rows = O.todoRows(state({ settings }), [alert('NOT_CONTACTED', 'HIGH'), alert('NOT_CONTACTED', 'HIGH')]);
  assert.deepStrictEqual(rows.map((r) => [r.key, r.count, r.tone, r.to]), [
    ['paused', null, 'HIGH', '/settings/general'],
    ['sharing', null, 'HIGH', '/settings/sharing'],
    ['NOT_CONTACTED', 2, 'HIGH', '/alerts?type=NOT_CONTACTED'],
  ]);
});

t('test mode is listed whenever it is on, after everything else, and stands in for sharing off', () => {
  const settings = { assignmentsOpen: true, testMode: true, shareFiles: false }; // the script reports sharing off in test mode
  const rows = O.todoRows(state({ settings }), [alert('BAD_EMAIL', 'INFO'), alert('NO_DATE')]);
  assert.deepStrictEqual(keys(rows), ['NO_DATE', 'BAD_EMAIL', 'test']);
  assert.deepStrictEqual([rows[2].tone, rows[2].to], ['INFO', '/settings/sharing']);
  assert.deepStrictEqual(keys(O.todoRows(state({ settings }), [])), ['test'], 'listed even when nothing else is');
});

t('past six kinds of alert, the rest fold into one row linking to the whole inbox; held and blockers are never folded', () => {
  const types = ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'BAD_EMAIL', 'BAD_PHONE', 'MISSING_NAME', 'MANUAL_EDIT', 'INTEGRITY'];
  const alerts = [];
  types.forEach((ty, i) => { for (let k = 0; k < 10 - i; k++) alerts.push(alert(ty, i === 7 ? 'HIGH' : 'MEDIUM')); }); // MANUAL_EDIT: 3, HIGH
  const settings = { assignmentsOpen: true, testMode: true, shareFiles: false };
  const rows = O.todoRows(state({ settings, counts: { byStatus: { HELD: 1 }, byDep: {} } }), alerts);
  assert.deepStrictEqual(keys(rows), ['MANUAL_EDIT', 'NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'BAD_EMAIL', 'held', 'more', 'test']);
  const more = rows[7];
  assert.deepStrictEqual([more.label, more.count, more.tone, more.to], ['3 more kinds of alert', 5 + 4 + 2, 'MEDIUM', '/alerts']); // BAD_PHONE, MISSING_NAME, INTEGRITY
});

const binome = (code, open, interviewed, assigned, withdrew = 0, status = 'ACTIVE') => ({ code, status, open, interviewed, assigned, withdrew, members: [], people: [], tag: '', fileUrl: '' });

t('binomes behind: locked binomes by open alerts, then the lowest interviewed share of who is still in', () => {
  const list = [
    binome('B01', 0, 1, 10), // 10%
    binome('B02', 2, 9, 10),
    binome('B03', 0, 2, 4, 2), // 2 of 2 still in: done, nothing open
    binome('B04', 0, 3, 10), // 30%
    binome('B05', 5, 0, 0, 0, 'DRAFT'), // not locked
    binome('B06', 2, 1, 10),
    binome('B07', 0, 0, 0), // nothing assigned yet
    binome('B08', 0, 1, 5, 4), // 1 of 1: done
    binome('B09', 1, 5, 5, 0, 'PAUSED'), // locked, an alert open
  ];
  assert.deepStrictEqual(O.binomesBehind(list).map((b) => b.code), ['B06', 'B02', 'B09', 'B01', 'B04']);
});

t('binomes behind shows at most six', () => {
  const list = Array.from({ length: 9 }, (_, i) => binome('B0' + (i + 1), 0, i, 10));
  assert.deepStrictEqual(O.binomesBehind(list).map((b) => b.code), ['B01', 'B02', 'B03', 'B04', 'B05', 'B06']);
});

console.log(`overview: ${n} passed`);
