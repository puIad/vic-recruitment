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

// ---- refused values drop at once, with a reason ----
{
  const out = apply({ alert: ids[5], op: 'delete', seen: 'OPEN' }, { alert: ids[5], op: 'snooze', seen: 'OPEN' },
    { alert: ids[5], op: 'resolve', seen: 'MUTED' }, { alert: ids[5], op: 'snooze', seen: 'OPEN', at: Date.now() - 2 * H, until: Date.now() - H });
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

console.log('apply tests passed');
