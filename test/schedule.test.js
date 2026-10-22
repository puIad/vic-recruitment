// The Schedule's pure logic (frontend/src/app/calendar/schedule-data.ts, docs/plans.md › Schedule): clashes, the Master's
// zone, and reading the dates binomes type. Node strips the TypeScript types, so the UI's own module is tested as it ships.
const assert = require('assert');
const S = require('../frontend/src/app/calendar/schedule-data.ts');
const { sheetTime } = require('../frontend/src/lib/vic/format.ts');

let n = 0;
const t = (name, fn) => { fn(); n++; };

const TZ = 'Africa/Algiers'; // UTC+1, no summer time
const algiers = (iso) => Date.parse(iso + '+01:00');
const iv = (code, binome, at, extra) => Object.assign({ code, binome, status: 'SCHEDULED', name: 'First ' + code, dept: code.split('.')[0], contacted: 'Yes', at, assignedAt: 0, avail: '' }, extra);
const state = (interviewees, alerts = []) => ({ settings: { tz: TZ }, alerts, interviewees });
const byCode = (items) => Object.fromEntries(items.map((x) => [x.code, x]));
const hhmm = (d) => d && S.hhmm(d);

t('wallTime shows ms in the Master zone, whatever the browser zone', () => {
  const d = S.wallTime(Date.UTC(2026, 9, 23, 9, 30), TZ);
  assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate(), hhmm(d)], [2026, 9, 23, '10:30']);
});

t('two interviews of one binome 30 min apart clash; 45 min apart, or in two binomes, they do not', () => {
  const items = byCode(S.fromWebState(state([
    iv('IT.01', 'B.01', algiers('2026-10-23T10:00')), iv('IT.02', 'B.01', algiers('2026-10-23T10:30')),
    iv('HR.01', 'B.02', algiers('2026-10-23T10:00')), iv('HR.02', 'B.02', algiers('2026-10-23T10:45')),
    iv('FLER.01', 'B.03', algiers('2026-10-23T10:00')),
  ])));
  assert.deepStrictEqual(['IT.01', 'IT.02', 'HR.01', 'HR.02', 'FLER.01'].map((c) => items[c].clash), [true, true, false, false, false]);
});

t('a day typed without a time (the Master stores 23:59) waits in No date yet, with the day as its note', () => {
  const items = S.fromWebState(state([iv('IT.03', 'B.01', algiers('2026-10-24T23:59')), iv('IT.04', 'B.01', null, { assignedAt: 5 })]));
  const it = byCode(items)['IT.03'];
  assert.strictEqual(it.start, null);
  assert.strictEqual(it.note, '24/10/2026, no time yet');
  assert.deepStrictEqual(S.noDateYet(items).map((x) => x.code), ['IT.03', 'IT.04'], 'oldest assignment first');
});

t('marks: Done from INTERVIEWED, Late from OVERDUE, Unreadable from BAD_DATE with no time', () => {
  const items = byCode(S.fromWebState(state(
    [iv('IT.05', 'B.04', algiers('2026-10-20T09:00'), { status: 'INTERVIEWED' }), iv('IT.06', 'B.04', algiers('2026-10-21T09:00')), iv('IT.07', 'B.04', null)],
    [{ code: 'IT.06', type: 'OVERDUE' }, { code: 'IT.07', type: 'BAD_DATE' }]
  )));
  assert.deepStrictEqual(['IT.05', 'IT.06', 'IT.07'].map((c) => items[c].state), ['done', 'late', 'unreadable']);
});

t('an older script (no at, tz, dept, contacted) still reads: everyone waits for a date', () => {
  const items = S.fromWebState({ settings: {}, alerts: [], interviewees: [{ code: 'COMM.01', binome: 'B.01', status: 'ASSIGNED', name: 'X' }] });
  assert.deepStrictEqual([items[0].start, items[0].dept, items[0].contacted], [null, 'COMM', '']);
});

t('sheetTime reads the forms the script reads (Rules.gs buildInterviewAt), and NaN for a time it cannot', () => {
  const at = (d, h) => { const x = new Date(sheetTime(d, h)); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()} ${S.hhmm(x)}`; };
  assert.strictEqual(at('9/11/2026', '14h30'), '2026-11-9 14:30');
  assert.strictEqual(at('09.11.26', '14h'), '2026-11-9 14:00');
  assert.strictEqual(at('2026-11-09', '14'), '2026-11-9 14:00');
  assert.strictEqual(at('9-11-2026', ''), '2026-11-9 00:00');
  assert.ok(Number.isNaN(sheetTime('next Sunday', '10:00')));
  assert.ok(Number.isNaN(sheetTime('9/11/2026', 'after lunch')));
  assert.ok(Number.isNaN(sheetTime('32/11/2026')));
});

t('My binome: 14h30 is a time, a day alone waits in No date yet, text that is no date is Unreadable', () => {
  const cand = (code, date, time) => ({ Code: code, 'First Name': 'A', 'Family Name': code, 'Interview Date': date, 'Interview Time': time, '1st Choice': 'IT', Contacted: 'Yes', Status: 'SCHEDULED' });
  const items = byCode(S.fromMember({ binome: 'B.01', alerts: [], candidates: [
    cand('IT.01', '09/11/2026', '14h30'), cand('IT.02', '09/11/2026', '15:00'), cand('IT.03', '2026-11-10', ''),
    cand('IT.04', 'next Sunday', '10:00'), cand('IT.05', '10/11/2026', 'later'),
  ] }));
  assert.strictEqual(hhmm(items['IT.01'].start), '14:30');
  assert.deepStrictEqual([items['IT.01'].clash, items['IT.02'].clash], [true, true], '30 min apart');
  assert.deepStrictEqual([items['IT.03'].start, items['IT.03'].note, items['IT.03'].state], [null, '2026-11-10, no time yet', 'booked']);
  assert.deepStrictEqual([items['IT.04'].state, items['IT.05'].state], ['unreadable', 'unreadable']);
});

console.log(`schedule.test.js: ${n} passed`);
