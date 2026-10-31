// The lean apply entry (webApply, Pending.gs) for the four alert actions, the owner's switch and the snapshot's build time
const assert = require('assert');
const { run, call, addRegistrations } = require('./seed')();

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
addRegistrations(8, 3);
run(`(function () { var reg = master.getSheetByName('Registration Responses'), t = Date.now();
  for (var i = 0; i < 6; i++) reg.cells.push(regRow(new Date(t + i * 1e3), 'bad' + i + '@g.enp.edu.dz', 'Bad' + i, 'Phone', 'bad' + i + '@g.enp.edu.dz', '01/03/2005', '12345', 'IT', 'HR'));
})()`);
call('webRun', 'sync');

const ids = call('webState').alerts.filter(a => a.type === 'BAD_PHONE').map(a => a.id);
assert(ids.length >= 6, 'six open alerts to work on');
const A = run('idx_(ALERT_H)');
const rowOf = id => run(`master.getSheetByName('Alerts').getDataRange().getValues()`).find(r => r[A.ID] === id);
const status = id => rowOf(id)[A.Status];
const setRow = (id, st, end) => run(`(function () { var sh = master.getSheetByName('Alerts'), d = sh.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) if (d[i][${A.ID}] === '${id}') sh.getRange(i + 1, ${A.Status + 1}, 1, 2).setValues([['${st}', ${end ? 'new Date(' + end + ')' : "''"}]]); })()`);
const apply = (...changes) => call('webApply', { v: 1, changes: changes.map((c, i) => Object.assign({ id: 'c' + i, kind: 'alert', at: Date.now() }, c)) });
const ends = out => out.results.map(r => r.end + (r.sheet ? ':' + r.sheet : ''));
const H = 3.6e6;

// ---- Resolve: OPEN → applied with Resolved At = the click; again → met; no publish ----
{
  const ver = run('__props.SNAP_VER'), click = Date.now() - 60000;
  let out = apply({ alert: ids[0], op: 'resolve', seen: 'OPEN', at: click });
  assert.deepStrictEqual(ends(out), ['applied']);
  assert(out.results[0].at >= click && out.v === 1, 'the write time comes back');
  assert.deepStrictEqual([status(ids[0]), +new Date(rowOf(ids[0])[A['Resolved At']])], ['RESOLVED', click]);
  assert.deepStrictEqual(ends(apply({ alert: ids[0], op: 'resolve', seen: 'OPEN' })), ['met'], 'a retry finds its own value');
  assert.strictEqual(run('__props.SNAP_VER'), ver, 'no publish: other admins see it after the next sync');
  assert.deepStrictEqual(ends(apply({ alert: 'A-9999', op: 'resolve', seen: 'OPEN' })), ['met'], 'a row that is gone');
}

// ---- Snooze, then the others against a snooze ----
{
  const until = Date.now() + 4 * H;
  assert.deepStrictEqual(ends(apply({ alert: ids[1], op: 'snooze', seen: 'OPEN', until })), ['applied']);
  assert.deepStrictEqual([status(ids[1]), +new Date(rowOf(ids[1])[A['Resolved At']])], ['SNOOZED', until], "the end fixed at the click");
  assert.deepStrictEqual(ends(apply({ alert: ids[1], op: 'resolve', seen: 'OPEN' }, { alert: ids[1], op: 'mute', seen: 'OPEN' },
    { alert: ids[1], op: 'unmute', seen: 'MUTED' }, { alert: ids[1], op: 'snooze', seen: 'OPEN', until })),
    ['dropped:SNOOZED', 'dropped:SNOOZED', 'dropped:SNOOZED', 'met'], 'another admin snoozed it');
  assert.deepStrictEqual(ends(apply({ alert: ids[1], op: 'unmute', seen: 'SNOOZED' })), ['applied']);
  assert.deepStrictEqual([status(ids[1]), rowOf(ids[1])[A['Resolved At']]], ['OPEN', '']);
  assert.deepStrictEqual(ends(apply({ alert: ids[1], op: 'unmute', seen: 'SNOOZED' })), ['met'], 'open again: already met');
}

// ---- a snooze that ran out counts as OPEN ----
{
  setRow(ids[2], 'SNOOZED', Date.now() - H);
  assert.deepStrictEqual(ends(apply({ alert: ids[2], op: 'unmute', seen: 'SNOOZED' })), ['met']);
  assert.deepStrictEqual(ends(apply({ alert: ids[2], op: 'mute', seen: 'OPEN' })), ['applied']);
  assert.strictEqual(status(ids[2]), 'MUTED');
  // against a mute
  assert.deepStrictEqual(ends(apply({ alert: ids[2], op: 'resolve', seen: 'OPEN' }, { alert: ids[2], op: 'mute', seen: 'OPEN' },
    { alert: ids[2], op: 'snooze', seen: 'OPEN', until: Date.now() + H }, { alert: ids[2], op: 'unmute', seen: 'SNOOZED' })),
    ['met', 'met', 'met', 'dropped:MUTED']);
  assert.deepStrictEqual(ends(apply({ alert: ids[2], op: 'unmute', seen: 'MUTED' })), ['applied']);
  assert.strictEqual(status(ids[2]), 'OPEN');
}

// ---- a sync that loaded the row before the write does not overwrite it when it saves ----
{
  setRow(ids[2], 'SNOOZED', Date.now() - H);
  run('var __ctx = freshCtx_()'); // the sync's load: it already reopened the ran-out snooze in memory
  assert.deepStrictEqual(ends(apply({ alert: ids[2], op: 'mute', seen: 'OPEN' })), ['applied']);
  run('__ctx.alerts.flush()');
  assert.strictEqual(status(ids[2]), 'MUTED', 'the applied change stays');
  setRow(ids[2], 'OPEN', 0);
}

// ---- closed by the sync: met for all four ----
{
  setRow(ids[3], 'AUTO-RESOLVED', Date.now());
  assert.deepStrictEqual(ends(apply({ alert: ids[3], op: 'resolve', seen: 'OPEN' }, { alert: ids[3], op: 'snooze', seen: 'OPEN', until: Date.now() + H },
    { alert: ids[3], op: 'mute', seen: 'OPEN' }, { alert: ids[3], op: 'unmute', seen: 'MUTED' })), ['met', 'met', 'met', 'met']);
  assert.strictEqual(status(ids[3]), 'AUTO-RESOLVED', 'nothing written');
}

// ---- one call, several changes on one cell: each judged against the sheet as the one before left it ----
{
  assert.deepStrictEqual(ends(apply({ alert: ids[4], op: 'snooze', seen: 'OPEN', until: Date.now() + H }, { alert: ids[4], op: 'unmute', seen: 'SNOOZED' },
    { alert: ids[4], op: 'resolve', seen: 'OPEN' })), ['applied', 'applied', 'applied']);
  assert.strictEqual(status(ids[4]), 'RESOLVED');
}

// ---- seen = the author's own earlier value (merged by the accept step): their cell, so it applies; reopened since: dropped ----
{
  setRow(ids[4], 'MUTED', Date.now());
  assert.deepStrictEqual(ends(apply({ alert: ids[4], op: 'resolve', seen: 'MUTED' })), ['applied']);
  setRow(ids[4], 'OPEN', 0);
  assert.deepStrictEqual(ends(apply({ alert: ids[4], op: 'resolve', seen: 'MUTED' }, { alert: ids[4], op: 'unmute', seen: 'MUTED' })), ['dropped:OPEN', 'met']);
  setRow(ids[4], 'RESOLVED', Date.now());
}

// ---- refused values drop at once, with a reason ----
{
  const out = apply({ alert: ids[5], op: 'delete', seen: 'OPEN' }, { alert: ids[5], op: 'snooze', seen: 'OPEN' },
    { alert: ids[5], op: 'resolve', seen: 'RESOLVED' }, { alert: ids[5], op: 'snooze', seen: 'OPEN', at: Date.now() - 2 * H, until: Date.now() - H });
  assert.deepStrictEqual(out.results.map(r => r.end), ['dropped', 'dropped', 'dropped', 'met']);
  assert(out.results.slice(0, 3).every(r => r.reason), 'each says why');
  assert.strictEqual(status(ids[5]), 'OPEN');
  run(`(function () { var sh = master.getSheetByName('Alerts'), d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) if (d[i][${A.ID}] === '${ids[5]}') sh.getRange(i + 1, ${A.Type + 1}).setValue('MANUAL_EDIT'); })()`);
  const me = apply({ alert: ids[5], op: 'mute', seen: 'OPEN' });
  assert(me.results[0].end === 'dropped' && /Apply \/ Revert/.test(me.results[0].reason), 'a manual edit is not muted');
}

// ---- per call: the lock refused, lost access, another format ----
{
  run('__docLockBusy = true');
  assert.deepStrictEqual(apply({ alert: ids[5], op: 'resolve', seen: 'OPEN' }), { v: 1, retry: 'BUSY' });
  run('__docLockBusy = false');
  assert.strictEqual(status(ids[5]), 'OPEN', 'nothing written while the lock was taken');
  run('var __admin = Session; var __as = e => { Session = { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
  run('__as("stranger@g.enp.edu.dz")');
  const lost = apply({ alert: ids[5], op: 'resolve', seen: 'OPEN' });
  run('Session = __admin');
  assert(lost.lost && !lost.results, 'not an admin: lost access, nothing applied');
  assert.strictEqual(status(ids[5]), 'OPEN');
  assert(call('webApply', { v: 2, changes: [] }).refused, 'another change format is refused whole');
}

// ---- the owner's switch: off at first, owner-only, in the pulse (asked for) and the state ----
{
  assert.strictEqual(call('webState').pending, false);
  assert.strictEqual(typeof call('webPulse'), 'number', 'pages before pending changes keep the bare version');
  assert.deepStrictEqual(Object.keys(call('webPulse', true)).sort(), ['pending', 'v']);
  run(`master.addEditor('helper@g.enp.edu.dz'); __as('helper@g.enp.edu.dz')`);
  assert.throws(() => call('webRun', 'pendingSwitch', { on: true }), /Only the owner/);
  run('Session = __admin');
  const ver = run('__props.SNAP_VER');
  assert.deepStrictEqual(call('webRun', 'pendingSwitch', { on: true }).result, { pending: true });
  assert.deepStrictEqual([call('webPulse', true).pending, call('webState').pending], [true, true]);
  assert.strictEqual(run('__props.SNAP_VER'), ver, 'flipping it publishes nothing');
  call('webRun', 'pendingSwitch', { on: false });
  assert.strictEqual(call('webPulse', true).pending, false);
}

// ---- the snapshot's precise build time: moves with the content, not with every sync ----
{
  call('webRun', 'sync');
  const b1 = call('webState').built;
  assert(typeof b1 === 'number' && b1 > 0, 'built is the ms of the read');
  call('webRun', 'sync');
  assert.strictEqual(call('webState').built, b1, 'same content: same build time');
  call('webRun', 'resolve', { ids: [ids[5]] });
  const b2 = call('webState').built;
  assert(b2 >= b1 && call('webState').alerts.every(a => a.id !== ids[5]), 'a change publishes a newer build');
  run('__cacheClear()');
  assert(call('webState').built > 0, 'a live build has one too');
}

// ---- settings (slice 3): compared after saveSettings_'s parsing, a missing row or blank value = the default ----
{
  const setting = k => call('webState').settingsAll.find(s => s.key === k).value;
  const cellOf = k => run(`(function () { var d = master.getSheetByName('Settings').getDataRange().getValues();
    for (var i = 1; i < d.length; i++) if (d[i][0] === '${k}') return JSON.stringify(d[i][1]); return 'none'; })()`);
  const setCell = (k, v) => run(`(function () { var sh = master.getSheetByName('Settings'), d = sh.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) if (d[i][0] === '${k}') sh.getRange(i + 1, 2).setValue(${JSON.stringify(v)}); _settings = null; })()`);
  const st = (key, value, seen) => ({ kind: 'setting', key, value, seen });
  const h0 = setting('HOURS_NOT_CONTACTED'), ver = run('__props.SNAP_VER');
  assert.deepStrictEqual(ends(apply(st('HOURS_NOT_CONTACTED', '30', h0))), ['applied']);
  assert.strictEqual(cellOf('HOURS_NOT_CONTACTED'), '30', 'written as a number');
  assert.strictEqual(run('S_().HOURS_NOT_CONTACTED'), 30, 'the next read in this run sees it');
  assert.strictEqual(run('__props.SNAP_VER'), ver, 'no publish');
  assert.deepStrictEqual(ends(apply(st('HOURS_NOT_CONTACTED', 30, h0))), ['met'], 'a retry finds its own value');
  setCell('HOURS_NOT_CONTACTED', 36);
  assert.deepStrictEqual(ends(apply(st('HOURS_NOT_CONTACTED', 40, 30), st('ASSIGNMENTS_OPEN', false, true))), ['dropped:36', 'applied'],
    'another admin changed one key: only that one drops');
  assert.strictEqual(cellOf('HOURS_NOT_CONTACTED'), '36');
  // a bool typed in the sheet as text, a blank cell, a missing row: read as S_() reads them
  setCell('ASSIGNMENTS_OPEN', 'TRUE');
  assert.deepStrictEqual(ends(apply(st('ASSIGNMENTS_OPEN', false, true))), ['applied']);
  setCell('BALANCE_BY', '');
  assert.deepStrictEqual(ends(apply(st('BALANCE_BY', 'TOTAL', 'ACTIVE'))), ['applied'], 'blank = the default');
  assert.deepStrictEqual(ends(apply(st('BALANCE_BY', 'ACTIVE', 'TOTAL'))), ['applied']);
  run(`(function () { var sh = master.getSheetByName('Settings'), d = sh.getDataRange().getValues();
    for (var i = d.length - 1; i >= 1; i--) if (d[i][0] === 'SCREEN_HOLD_AT') sh.deleteRow(i + 1); _settings = null; })()`);
  assert.strictEqual(cellOf('SCREEN_HOLD_AT'), 'none');
  assert.deepStrictEqual(ends(apply(st('SCREEN_HOLD_AT', 60, 50))), ['applied'], 'a missing row is the default');
  assert.strictEqual(cellOf('SCREEN_HOLD_AT'), '60', 'its row appended');
  // values the sheet refuses drop at once, with saveSettings_'s reason
  const bad = apply(st('DIGEST_HOUR', 25, 8), st('HOURS_NO_INTERVIEW_DATE', 'abc', 48), st('BALANCE_BY', 'NOPE', 'ACTIVE'),
    st('ADMIN_EMAIL', 'not an email', ''), st('NOT_A_KEY', 1, 1));
  assert.deepStrictEqual(bad.results.map(r => r.end), ['dropped', 'dropped', 'dropped', 'dropped', 'dropped']);
  assert(/0 to 23/.test(bad.results[0].reason) && /number/.test(bad.results[1].reason) && /one of/.test(bad.results[2].reason) &&
    /invalid email/.test(bad.results[3].reason) && bad.results[4].reason, bad.results.map(r => r.reason).join(' | '));
  assert.deepStrictEqual([cellOf('DIGEST_HOUR'), cellOf('BALANCE_BY')], ['8', '"ACTIVE"'], 'nothing written');
  setCell('ASSIGNMENTS_OPEN', true); setCell('HOURS_NOT_CONTACTED', 24);
}

// ---- My binome fields (slice 3): a member's own sheet, as memberSet_ compares; the partner sees it at their next poll ----
{
  const J = JSON.stringify, admin = call('webState');
  const b = admin.binomes.find(x => x.people.length === 2 && admin.interviewees.filter(i => i.binome === x.code).length >= 2);
  const codes = admin.interviewees.filter(i => i.binome === b.code).map(i => i.code).sort();
  const other = admin.interviewees.find(i => i.binome && i.binome !== b.code).code;
  const mem = b.people[0].email, partner = b.people[1].email, fid = b.fileUrl.split('/d/')[1];
  run('var __adminS = Session; var __asM = e => { Session = e ? { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) } : __adminS; }');
  const as = e => run('__asM(' + J(e || '') + ')');
  const cell = (code, k) => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; return sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(k)})).getDisplayValue();})()`);
  const setCell = (code, k, v) => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(k)})).setValue(${J(v)});})()`);
  const fd = (code, field, value, seen) => ({ kind: 'field', code, field, value, seen });
  call('webRun', 'sync'); // a warm slice
  as(mem);
  const c0 = call('webState').candidates.find(c => c.Code === codes[0]), pv0 = call('webPulse');
  as(partner);
  const ppv = call('webPulse');
  as(mem);
  let out = apply(fd(codes[0], 'Contacted', 'Yes', c0.Contacted), fd(codes[0], 'Rating', '7,5', c0.Rating), fd(codes[0], 'Notes', '=1+1 called', c0.Notes),
    fd(codes[1], 'Interview Date', '15/11/2026', ''));
  assert.deepStrictEqual(ends(out), ['applied', 'applied', 'applied', 'applied']);
  assert.deepStrictEqual([cell(codes[0], 'Contacted'), cell(codes[0], 'Rating'), cell(codes[0], 'Notes'), cell(codes[1], 'Interview Date')],
    ['Yes', '7.5', '=1+1 called', '15/11/2026'], 'written into their sheet, notes as text');
  assert(run(`CacheService.getScriptCache().get('dirty:${b.code}')`) > 0, 'the next sync reads this sheet');
  as(partner);
  assert(call('webPulse') > ppv, 'the partner gets a new version');
  const seen = call('webState').candidates.find(c => c.Code === codes[0]);
  assert.deepStrictEqual([seen.Contacted, seen.Rating, seen.Notes], ['Yes', 7.5, '=1+1 called'], 'from the patched slice');
  as(mem);
  assert(call('webPulse') > pv0);
  // an admin's mark on a field goes when the binome's own edit reaches the sheet through this entry
  as('');
  call('webRun', 'adminSet', { code: codes[1], fields: [{ field: 'Contacted', value: 'Yes', seen: 'Not yet' }] });
  as(mem);
  assert.strictEqual(typeof call('webState').candidates.find(c => c.Code === codes[1]).setBy.Contacted.by, 'string', 'the slice carries the admin mark');
  assert.deepStrictEqual(ends(apply(fd(codes[1], 'Contacted', 'No answer', 'Yes'))), ['applied']);
  assert.strictEqual(call('webState').candidates.find(c => c.Code === codes[1]).setBy, undefined, 'an edit by the binome takes the mark off');
  // a retry, the partner typing the same, the partner typing something else
  assert.deepStrictEqual(ends(apply(fd(codes[0], 'Contacted', 'Yes', c0.Contacted))), ['met']);
  setCell(codes[0], 'Final Affectation', 'IT');
  assert.deepStrictEqual(ends(apply(fd(codes[0], 'Final Affectation', 'IT', ''), fd(codes[0], 'Rating', 9, 7.5), fd(codes[0], 'Contacted', 'No answer', 'Not yet'))),
    ['met', 'applied', 'dropped:Yes'], 'the partner set the same: met; changed it: dropped with the sheet value');
  // gone from the binome, values the sheet refuses, fields members may not edit
  const gone = apply(fd(other, 'Contacted', 'Yes', 'Not yet'), fd(codes[0], 'Rating', 11, 9), fd(codes[0], 'Interview Time', '25:00', ''), fd(codes[0], 'Email', 'a@b.dz', ''));
  assert.deepStrictEqual(gone.results.map(r => r.end), ['dropped', 'dropped', 'dropped', 'dropped']);
  assert(/no longer in your binome/.test(gone.results[0].reason) && /0 to 10/.test(gone.results[1].reason) && /HH:mm/.test(gone.results[2].reason) &&
    gone.results[3].reason, gone.results.map(r => r.reason).join(' | '));
  assert.strictEqual(cell(codes[0], 'Rating'), '9');
  // a member's alert or setting change, an admin's field change: dropped with a reason
  const odd = apply({ alert: ids[0], op: 'resolve', seen: 'OPEN' }, { kind: 'setting', key: 'TEST_MODE', value: false, seen: true });
  assert(odd.results.every(r => r.end === 'dropped' && /Only an admin/.test(r.reason)));
  // the switch reaches members, in the pulse (asked for) and the state
  assert.deepStrictEqual([typeof call('webPulse'), Object.keys(call('webPulse', true)).sort(), call('webState').pending], ['number', ['pending', 'v'], false]);
  as('');
  call('webRun', 'pendingSwitch', { on: true });
  as(mem);
  assert.deepStrictEqual([call('webPulse', true).pending, call('webState').pending], [true, true]);
  as('');
  call('webRun', 'pendingSwitch', { on: false });
  const af = apply(fd(codes[0], 'Contacted', 'Yes', 'Yes'));
  assert(/Only the binome's members/.test(af.results[0].reason), 'an admin edits the Master, not a binome sheet');
  // Drive failing on the open (after access_ saw edit access): thrown, so the consumer retries; nothing dropped
  as(mem);
  run("var __obf = SpreadsheetApp.openById; SpreadsheetApp.openById = id => { if (id !== __props.MASTER_ID) throw new Error('Service Spreadsheets timed out'); return __obf.call(SpreadsheetApp, id); }");
  assert.throws(() => apply(fd(codes[0], 'Rating', 5, 9)), /timed out/);
  run('SpreadsheetApp.openById = __obf');
  as('');
  // lost: view only, a cover, not shared
  call('webRun', 'binomeAccess', { binome: b.code, level: 'view' });
  run('__acl = true');
  as(mem);
  assert(apply(fd(codes[0], 'Rating', 5, 9)).lost, 'view access only');
  as('');
  call('webRun', 'binomeAccess', { binome: b.code, level: 'none' });
  as(mem);
  assert(apply(fd(codes[0], 'Rating', 5, 9)).lost, 'not shared any more');
  run('__acl = false');
  as('');
  assert.strictEqual(cell(codes[0], 'Rating'), '9', 'nothing written');
}

// ---- team: the Experienced tick (admins); bfield: an admin's Contacted / interview date in any binome sheet ----
{
  const J = JSON.stringify, T = run('idx_(TEAM_H)'), st = call('webState');
  const m = st.teamList[0], e = m.email, was = !!m.experienced;
  const exp = () => run(`master.getSheetByName('Team').getDataRange().getValues()`).find(r => String(r[T.Email]).toLowerCase() === e)[T.Experienced];
  const tm = (value, seen, email = e) => ({ kind: 'team', email, value, seen });
  assert.deepStrictEqual(ends(apply(tm(!was, was))), ['applied']);
  assert.strictEqual(exp(), !was, 'written into the Team tab');
  assert.deepStrictEqual(ends(apply(tm(!was, was), tm(was, was), tm(true, false, 'nobody@g.enp.edu.dz'), tm('yes', false))),
    ['met', 'dropped:' + !was, 'dropped', 'dropped'], 'a retry, another admin changed it, gone from the tab, not a boolean');
  assert.strictEqual(exp(), !was);

  const b = st.binomes.find(x => x.fileUrl && st.interviewees.some(i => i.binome === x.code));
  const code = st.interviewees.find(i => i.binome === b.code).code, fid = b.fileUrl.split('/d/')[1];
  const other = st.binomes.find(x => x.code !== b.code && x.fileUrl).code;
  const cell = k => run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; return sh.getRange(findFileRow_(sh, ${J(code)}), bfCol_(${J(k)})).getDisplayValue();})()`);
  const bf = (field, value, seen, binome = b.code) => ({ kind: 'bfield', binome, code, field, value, seen });
  const c0 = cell('Contacted');
  run(`CacheService.getScriptCache().remove('dirty:${b.code}')`);
  let out = apply(bf('Contacted', 'No answer', c0), bf('Interview Date', '20/11/2026', cell('Interview Date')), bf('Interview Time', '14:30', cell('Interview Time')));
  assert.deepStrictEqual(ends(out), ['applied', 'applied', 'applied']);
  assert.deepStrictEqual([cell('Contacted'), cell('Interview Date'), cell('Interview Time')], ['No answer', '20/11/2026', '14:30'], 'written into that binome sheet');
  assert(run(`CacheService.getScriptCache().get('dirty:${b.code}')`) > 0, 'the next sync reads this sheet into the Master');
  out = apply(bf('Contacted', 'No answer', c0), bf('Contacted', 'Yes', c0), bf('Contacted', 'Yes', 'No answer', other), bf('Contacted', 'Yes', 'No answer', 'B.99'),
    bf('Rating', 5, ''), bf('Interview Time', '25:00', '14:30'));
  assert.deepStrictEqual(out.results.map(r => r.end + (r.sheet ? ':' + r.sheet : '')), ['met', 'dropped:No answer', 'dropped', 'dropped', 'dropped', 'dropped']);
  assert(/no longer in B\./.test(out.results[2].reason) && /not in the Binomes tab/.test(out.results[3].reason) && /HH:mm/.test(out.results[5].reason),
    out.results.map(r => r.reason).join(' | '));
  // a member's team or bfield change: dropped with a reason
  const mem = b.people[0].email;
  run('var __adminS2 = Session; Session = { getEffectiveUser: () => ({ getEmail: () => ' + J(mem) + ' }), getActiveUser: () => ({ getEmail: () => ' + J(mem) + ' }) }');
  const byMember = apply(tm(was, !was), bf('Contacted', 'Yes', 'No answer'));
  run('Session = __adminS2');
  assert(byMember.lost || byMember.results.every(r => r.end === 'dropped' && /Only an admin/.test(r.reason)), J(byMember));
}

console.log('apply tests passed');
