// Pause and resume a binome (docs/admin-features.md): the apply entry, the direct write, the date, the moves, the log, the mails.
const assert = require('assert');
const { run, call, addRegistrations } = require('./seed')();

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
addRegistrations(30, 3);
call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
call('webRun', 'sync');

const B = run('idx_(BIN_H)'), C = run('idx_(MC_H)'), I = run('idx_(IV_H)'), A = run('idx_(ALERT_H)');
const rows = tab => run(`master.getSheetByName('${tab}').getDataRange().getValues()`).slice(1);
const bin = code => rows('Binomes').find(r => r[B.Binome] === code);
const state = () => call('webState');
const apply = (...changes) => call('webApply', { v: 1, changes: changes.map((c, i) => Object.assign({ id: 'c' + i, kind: 'binome', at: Date.now() }, c)) });
const ends = out => out.results.map(r => r.end);
const setCell = (code, h, js) => run(`(function () { var sh = master.getSheetByName('Binomes'), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (d[i][${B.Binome}] === '${code}') sh.getRange(i + 1, ${B[h] + 1}).setValue(${js}); })()`);
const mailsTo = () => JSON.parse(run('JSON.stringify(__outbox)'));
const statusRows = code => rows('Member Changes').filter(r => r[C.Type] === 'STATUS' && r[C.Binome] === code);
const alerts = (type, code) => rows('Alerts').filter(r => r[A.Type] === type && r[A.Binome] === code);
const DAY = 864e5, takes = (tag, dept) => /ALL/.test(tag) || tag.includes(dept);

const binomes = state().binomes;
// a binome with someone waiting, whose first choice another binome also takes
const withWaiting = binomes.find(b => state().interviewees.some(i => i.binome === b.code && i.status === 'ASSIGNED' &&
  binomes.some(o => o.code !== b.code && o.status === 'ACTIVE' && takes(o.tag, i.dept))));
assert(withWaiting, 'the seed has a binome with a movable interviewee');
const code = binomes.find(b => b.code !== withWaiting.code).code;

// ---- the column: Setup put it last, the header check expects it ----
assert.strictEqual(rows('Binomes') && run(`master.getSheetByName('Binomes').getRange(1, ${B['Paused Until'] + 1}).getValue()`), 'Paused Until');
assert.strictEqual(B['Paused Until'], B.Created + 1, 'after the old last column');

// ---- Pause: the Status cell, the date, the log row, the mail, the INFO alert with no instant mail ----
{
  const until = Date.now() + 3 * DAY, sent = mailsTo().length;
  const out = apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', until });
  assert.deepStrictEqual(ends(out), ['applied']);
  assert(out.results[0].at > 0, 'the write time comes back');
  const r = bin(code);
  assert.strictEqual(r[B.Status], 'PAUSED');
  assert.strictEqual(+new Date(r[B['Paused Until']]), until);
  const log = statusRows(code);
  assert.strictEqual(log.length, 1);
  assert.deepStrictEqual([log[0][C['Out Name']], log[0][C.Reason], log[0][C.Status]], ['ACTIVE', 'exams', 'DONE']);
  assert(/^PAUSED until \d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(log[0][C['In Name']]), log[0][C['In Name']]);
  const members = binomes.find(b => b.code === code).people.map(p => p.email).sort();
  const mails = mailsTo().slice(sent).filter(m => /paused/i.test(m.subject));
  assert.deepStrictEqual(mails.map(m => m.to).sort(), members, 'both members are told');
  assert.strictEqual(alerts('BINOME_STATUS', code).length, 1);
  assert.strictEqual(alerts('BINOME_STATUS', code)[0][A['Emailed To']], '', 'no instant mail');
  // a retry: already met, no second mail, no second log row
  const n = mailsTo().length;
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', until })), ['met']);
  assert.strictEqual(mailsTo().length, n);
  assert.strictEqual(statusRows(code).length, 1);
  // the baseline holds it: no manual-edit alert at the next sync
  call('webRun', 'sync');
  assert.strictEqual(alerts('MANUAL_EDIT', code).length, 0, 'its own write is not a hand edit');
  const b = state().binomes.find(x => x.code === code);
  assert.deepStrictEqual([b.status, b.pausedUntil], ['PAUSED', until]);
}

// ---- Change resume date: mails nobody, no alert; cleared; same date = met; Resume on the wrong status drops ----
{
  const n = mailsTo().length, later = Date.now() + 5 * DAY;
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'date', value: 'PAUSED', seen: 'PAUSED', note: '', until: later })), ['applied']);
  assert.strictEqual(+new Date(bin(code)[B['Paused Until']]), later);
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'date', value: 'PAUSED', seen: 'PAUSED', note: '', until: later })), ['met']);
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'date', value: 'PAUSED', seen: 'PAUSED', note: '', until: null })), ['applied']);
  assert.strictEqual(bin(code)[B['Paused Until']], '');
  assert.strictEqual(mailsTo().length, n, 'no mail');
  assert.strictEqual(alerts('BINOME_STATUS', code).length, 1, 'no alert');
  assert.strictEqual(statusRows(code).length, 3, 'logged all the same');
}

// ---- Resume: clears the date, mails, logs; again = met; a pause needs a reason; a date on an ACTIVE binome drops ----
{
  setCell(code, 'Paused Until', 'new Date(Date.now() + 864e5)');
  call('webRun', 'sync'); // the hand-typed date on a paused binome: INFO, honoured
  assert(alerts('MANUAL_EDIT', code).some(a => a[A.Severity] === 'INFO' && a[A.Status] === 'AUTO-FIXED' && /resume date/i.test(a[A.Message])));
  const n = mailsTo().length;
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' })), ['applied']);
  const r = bin(code);
  assert.deepStrictEqual([r[B.Status], r[B['Paused Until']]], ['ACTIVE', '']);
  assert(mailsTo().slice(n).some(m => /active again|resumed/i.test(m.subject)));
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' })), ['met']);
  const drop = apply({ binome: code, op: 'date', value: 'PAUSED', seen: 'PAUSED', note: '', until: Date.now() + DAY }).results[0];
  assert.strictEqual(drop.end, 'dropped');
  assert(drop.reason);
  assert.strictEqual(apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: '  ' }).results[0].end, 'dropped', 'a pause needs a reason');
  assert.strictEqual(apply({ binome: 'B.99', op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'x' }).results[0].end, 'dropped');
}

// ---- a date on an ACTIVE binome: ignored, flagged INFO until it is cleared ----
{
  setCell(code, 'Paused Until', 'new Date(Date.now() - 1000)');
  call('webRun', 'sync');
  assert.strictEqual(bin(code)[B.Status], 'ACTIVE');
  const open = () => alerts('PAUSE_DATE', code).filter(a => a[A.Status] === 'OPEN');
  assert.strictEqual(open().length, 1);
  assert.strictEqual(open()[0][A.Severity], 'INFO');
  setCell(code, 'Paused Until', "''");
  call('webRun', 'sync');
  assert.strictEqual(open().length, 0, 'cleared: the alert closes');
}

// ---- Resume from the date: the first sync after it, as a manual Resume does ----
{
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'away', until: Date.now() + DAY })), ['applied']);
  call('webRun', 'sync');
  assert.strictEqual(bin(code)[B.Status], 'PAUSED', 'not yet');
  setCell(code, 'Paused Until', 'new Date(Date.now() - 1000)');
  const logs = statusRows(code).length, n = mailsTo().length;
  call('webRun', 'sync');
  const r = bin(code);
  assert.deepStrictEqual([r[B.Status], r[B['Paused Until']]], ['ACTIVE', '']);
  assert.strictEqual(statusRows(code).length, logs + 1);
  assert.strictEqual(statusRows(code).pop()[C['In Name']], 'ACTIVE');
  assert(mailsTo().slice(n).some(m => /active again|resumed/i.test(m.subject)));
}

// ---- the moves: pause first, each move to the least-loaded other binome; contacted and impossible ones dropped alone ----
{
  const p = withWaiting.code, st = state(), waiting = st.interviewees.filter(i => i.binome === p && i.status === 'ASSIGNED');
  const movable = waiting.find(i => st.binomes.some(o => o.code !== p && o.status === 'ACTIVE' && takes(o.tag, i.dept)));
  const out = apply({ binome: p, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', codes: [movable.code, 'IT.999'] });
  assert.deepStrictEqual(ends(out), ['applied']);
  assert.deepStrictEqual(out.results[0].moves.map(m => m.code), ['IT.999'], 'that move alone is dropped');
  const row = rows('Interviewees').find(r => r[I.Code] === movable.code);
  assert.notStrictEqual(row[I.Binome], p, 'moved away');
  assert.strictEqual(bin(row[I.Binome])[B.Status], 'ACTIVE');
  assert(takes(bin(row[I.Binome])[B.Tag], movable.dept));
  // a retry: the pause is met, the code already in another ACTIVE binome of its tag is met
  const again = apply({ binome: p, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', codes: [movable.code] });
  assert.deepStrictEqual([ends(again), again.results[0].moves], [['met'], []]);
  assert.strictEqual(rows('Interviewees').find(r => r[I.Code] === movable.code)[I.Binome], row[I.Binome], 'not moved twice');
  // a dropped pause moves nothing and mails nobody
  const n = mailsTo().length;
  const other = waiting.find(i => i.code !== movable.code);
  const dropped = apply({ binome: p, op: 'date', value: 'PAUSED', seen: 'PAUSED', note: '', until: 'nonsense', codes: other ? [other.code] : [] });
  assert.strictEqual(dropped.results[0].end, 'dropped');
  assert.strictEqual(mailsTo().length, n);
  assert.deepStrictEqual(ends(apply({ binome: p, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' })), ['applied']);
}

// ---- a contacted candidate stays, however stale the Master: the sheet decides ----
{
  call('webRun', 'sync'); // the apply entry doesn't publish
  const st = state(), p = withWaiting.code;
  const i = st.interviewees.find(x => x.binome === p && x.status === 'ASSIGNED');
  assert(i, 'someone left to contact');
  {
    const fileId = run(`loadCtx_().binByCode['${p}'].fileId`);
    run(`(function () { var sh = SpreadsheetApp.openById('${fileId}').getSheets()[0], F = idx_(BF_H), n = bfLastRow_(sh), d = sh.getRange(2, BF_COL, n - 1, 1).getValues();
      for (var k = 0; k < d.length; k++) if (String(d[k][0]).trim() === '${i.code}') sh.getRange(k + 2, BF_COL + F.Contacted).setValue('Yes'); })()`);
    const out = apply({ binome: p, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', codes: [i.code] });
    assert.deepStrictEqual(out.results[0].moves.map(m => [m.code, m.reason]), [[i.code, 'already contacted']]);
    assert.strictEqual(rows('Interviewees').find(r => r[I.Code] === i.code)[I.Binome], p);
    apply({ binome: p, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' });
  }
}

// ---- the script lock busy: no result for it, so the consumer calls again; nothing written ----
{
  run('__lockBusy = true');
  let out;
  try { out = apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'later' }); } finally { run('__lockBusy = false'); }
  assert.deepStrictEqual(out.results, []);
  assert.strictEqual(bin(code)[B.Status], 'ACTIVE');
}

// ---- a crash mid-move: the pause is already told and in the baseline; what moved is saved; the retry goes on ----
const nextMovable = () => { call('webRun', 'sync'); const st = state(); return st.interviewees.find(x => x.binome === withWaiting.code && x.status === 'ASSIGNED' && (!x.contacted || x.contacted === 'Not yet') &&
  st.binomes.some(o => o.code !== withWaiting.code && o.status === 'ACTIVE' && takes(o.tag, x.dept))); };
const pauseMoving = code => apply({ binome: withWaiting.code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'exams', codes: [code] });
const resumeIt = () => apply({ binome: withWaiting.code, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' });
const ivBinome = c => rows('Interviewees').find(r => r[I.Code] === c)[I.Binome];
{
  const p = withWaiting.code, i = nextMovable(), n = mailsTo().length, told = alerts('BINOME_STATUS', p).length;
  assert(i, 'someone movable');
  run("var __loads = loads_; loads_ = function () { throw new Error('killed'); }");
  try { assert.throws(() => pauseMoving(i.code), /killed/); } finally { run('loads_ = __loads'); }
  assert.strictEqual(bin(p)[B.Status], 'PAUSED');
  assert(mailsTo().slice(n).some(m => /is paused/.test(m.subject)), 'mailed before the moves');
  assert.strictEqual(alerts('BINOME_STATUS', p).length, told + 1, 'alerted before the moves');
  call('webRun', 'sync');
  assert(!alerts('MANUAL_EDIT', p).some(a => /set to PAUSED/.test(a[A.Message])), 'the baseline holds it: not a hand edit');
  const sent = mailsTo().filter(m => /is paused/.test(m.subject)).length, out = pauseMoving(i.code);
  assert.deepStrictEqual([ends(out), out.results[0].moves], [['met'], []]);
  assert.notStrictEqual(ivBinome(i.code), p, 'the retry moved them');
  assert.strictEqual(mailsTo().filter(m => /is paused/.test(m.subject)).length, sent, 'no second mail');
  assert.deepStrictEqual(ends(resumeIt()), ['applied']);
}

// ---- a member saving in the sheet is a retry, not a lost move, and doesn't blame the target ----
{
  const p = withWaiting.code, i = nextMovable();
  assert(i, 'someone movable');
  run("var __ml = withMemberLock_; withMemberLock_ = function (b) { throw new Error('A member is saving in the sheet of ' + b.code + ': nothing was changed, try again.'); }");
  let out;
  try { out = pauseMoving(i.code); } finally { run('withMemberLock_ = __ml'); }
  assert.deepStrictEqual(out.results, [], 'no result: the consumer calls again');
  assert.strictEqual(ivBinome(i.code), p);
  const again = pauseMoving(i.code);
  assert.deepStrictEqual([ends(again), again.results[0].moves], [['met'], []]);
  assert.notStrictEqual(ivBinome(i.code), p);
  resumeIt();
}

// ---- a moved row is saved at once: the Master agrees with the sheets however the run ends ----
{
  const p = withWaiting.code, a = nextMovable();
  assert(a, 'someone movable');
  run("var __ti = sendNewIntervieweeMails_; sendNewIntervieweeMails_ = function () { throw new Error('killed'); }");
  try { assert.throws(() => pauseMoving(a.code), /killed/); } finally { run('sendNewIntervieweeMails_ = __ti'); }
  assert.notStrictEqual(ivBinome(a.code), p, 'saved before the end of the run');
  call('webRun', 'sync');
  assert(!alerts('MANUAL_EDIT', ivBinome(a.code)).some(x => x[A.Status] === 'OPEN' && x[A.Message].includes(a.code)), 'and in the baseline');
  resumeIt();
}

// ---- no Paused Until column of ours: refused, says to run Setup, writes nothing ----
{
  const K = B['Paused Until'] + 1, cell = v => run(`master.getSheetByName('Binomes').getRange(1, ${K}).setValue('${v}')`);
  cell('Notes');
  let r;
  try { r = apply({ binome: code, op: 'pause', value: 'PAUSED', seen: 'ACTIVE', note: 'x' }).results[0]; } finally { cell('Paused Until'); }
  assert.strictEqual(r.end, 'dropped');
  assert(/Setup/.test(r.reason));
  assert.strictEqual(bin(code)[B.Status], 'ACTIVE');
}

// ---- a date typed first, then PAUSED typed: honoured, and flagged like any typed date ----
{
  const n = alerts('MANUAL_EDIT', code).filter(a => /resume date/i.test(a[A.Message])).length;
  setCell(code, 'Paused Until', 'new Date(Date.now() + 864e5)');
  call('webRun', 'sync');
  setCell(code, 'Status', "'PAUSED'");
  call('webRun', 'sync');
  assert.strictEqual(alerts('MANUAL_EDIT', code).filter(a => /resume date/i.test(a[A.Message])).length, n + 1);
  assert.deepStrictEqual(ends(apply({ binome: code, op: 'resume', value: 'ACTIVE', seen: 'PAUSED', note: '' })), ['applied']);
  call('webRun', 'sync');
}

// ---- the switch off: the same write through webRun; a member can't ----
{
  const out = call('webRun', 'binomeStatus', { binome: code, op: 'pause', note: 'direct', until: Date.now() + DAY, codes: [] });
  assert.strictEqual(out.result.end, 'applied');
  assert.strictEqual(bin(code)[B.Status], 'PAUSED');
  const s = state().binomes.find(x => x.code === code);
  assert.strictEqual(s.status, 'PAUSED', 'published at once');
  call('webRun', 'binomeStatus', { binome: code, op: 'resume', note: '' });
  assert.strictEqual(bin(code)[B.Status], 'ACTIVE');
  const who = binomes.find(b => b.code === code).people[0].email;
  run(`var __real = Session; Session = { getEffectiveUser: () => ({ getEmail: () => '${who}' }), getActiveUser: () => ({ getEmail: () => '${who}' }) }`);
  try { assert.throws(() => call('webRun', 'binomeStatus', { binome: code, op: 'pause', note: 'x' }), /Not allowed/); } finally { run('Session = __real'); }
}

// ---- the digest lists the pauses ----
{
  const html = run(`(function () { var seen = []; var keep = mail_; mail_ = function (to, s, h) { seen.push(h); return true; }; sendDailyDigest(); mail_ = keep; return seen.filter(function (h) { return /Daily digest/.test(h); })[0]; })()`);
  assert(/paused or resumed/i.test(html), 'the digest lists them');
  assert(html.includes(code));
}

// ---- the UI's pure rules, as they ship ----
{
  const P = require('../frontend/src/lib/vic/pause.ts');
  const list = [
    { code: 'B.01', status: 'ACTIVE', tag: 'HR' }, { code: 'B.02', status: 'ACTIVE', tag: 'IT & HR' },
    { code: 'B.03', status: 'PAUSED', tag: 'COMM' }, { code: 'B.04', status: 'ACTIVE', tag: 'COMM & HR' }, { code: 'B.05', status: 'ACTIVE', tag: 'ALL' },
  ];
  assert.deepStrictEqual(P.lastFor(list.slice(0, 4), list[1]), ['IT'], 'nobody else takes IT');
  assert.deepStrictEqual(P.lastFor(list, list[1]), [], 'ALL takes everything');
  assert.deepStrictEqual(P.lastFor(list.slice(0, 3), list[0]), [], 'B.02 still takes HR');
  const ivs = [
    { code: 'HR.1', binome: 'B.02', status: 'ASSIGNED', contacted: '', dept: 'HR' }, { code: 'HR.2', binome: 'B.02', status: 'ASSIGNED', contacted: 'Not yet', dept: 'HR' },
    { code: 'HR.3', binome: 'B.02', status: 'ASSIGNED', contacted: 'Yes', dept: 'HR' }, { code: 'HR.4', binome: 'B.02', status: 'SCHEDULED', contacted: '', dept: 'HR' },
    { code: 'IT.5', binome: 'B.02', status: 'ASSIGNED', contacted: '', dept: 'IT' }, { code: 'HR.6', binome: 'B.01', status: 'ASSIGNED', contacted: '', dept: 'HR' },
  ];
  assert.deepStrictEqual(P.movable(ivs, list.slice(0, 4), list[1]).map(i => i.code), ['HR.1', 'HR.2'], 'IT.5 has nowhere to go');
  assert.strictEqual(P.resumeMs('2026-11-03', '08:00'), Date.UTC(2026, 10, 3, 7), 'Algiers is UTC+1');
  assert.strictEqual(P.resumeMs('', '08:00'), null);
  assert.strictEqual(P.pausedLabel(Date.UTC(2026, 10, 3, 7)), 'Paused until 3 Nov 08:00');
  assert.strictEqual(P.pausedLabel(null), 'Paused');
  assert.deepStrictEqual(P.resumeFields(Date.UTC(2026, 10, 3, 7)), { date: '2026-11-03', time: '08:00' });
}

console.log('pause: ok');
