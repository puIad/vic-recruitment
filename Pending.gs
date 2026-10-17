/* ---------- pending changes: the lean apply entry and the owner's switch (docs/plans.md › Slice 2) ---------- */
// A dashboard save becomes a pending change on Vercel (accepted, queued, kept in Redis); the queue consumer applies it here,
// through scripts.run as its author. Only the consumer calls webApply: it is not in /api/run's allowlist.

/** Change format the consumer sends. A call in another format is refused whole (nothing read or written). */
const APPLY_FORMAT = 1;
/** What each alert action wants, and what it accepts as the author's screen (issue 50's table). */
const APPLY_ALERT = {
  resolve: { seen: ['OPEN'], to: 'RESOLVED' },
  snooze: { seen: ['OPEN'], to: 'SNOOZED' },
  mute: { seen: ['OPEN'], to: 'MUTED' },
  unmute: { seen: ['SNOOZED', 'MUTED'], to: 'OPEN' },
};

/** Is the owner's switch on? Off (or missing) = every save is a direct write. */
function pendingOn_() { return PropertiesService.getScriptProperties().getProperty('PENDING_CHANGES') === 'on'; }
/** webRun('pendingSwitch', {on}): the owner turns pending changes on or off. Pages see it at their next pulse. */
function pendingSwitch_(a, on) {
  if (!a.owner) throw new Error('Only the owner (the account that runs the triggers) can switch pending changes');
  const props = PropertiesService.getScriptProperties();
  if (on) props.setProperty('PENDING_CHANGES', 'on'); else props.deleteProperty('PENDING_CHANGES');
  return { pending: pendingOn_() };
}

/**
 * Apply one author's pending changes: {v, changes: [{id, kind: 'alert', alert, op, seen, at, until?}]}.
 * at = the click (ms): Resolved At for Resolve and Mute. until = Snooze's end (ms), fixed at the click.
 * Each change is judged against the sheet as it is when it applies (an earlier change of the same call included):
 * applied (written), met (the sheet already does it: no notice) or dropped (with the sheet's status, or a reason).
 * Answers {v, results: [{id, end, sheet?, reason?, at}]}; at = the write or check time (Google's clock, as the snapshot's
 * build time). Or per call: {v, lost} (not an admin any more: drop them all) or {v, retry} (the document lock was taken).
 * Anything thrown is a retry for the consumer too. Never the script lock, no loadCtx_, no publish: other admins see the
 * change at the next sync's publish.
 */
function webApply(call) {
  const v = call && call.v, changes = (call && Array.isArray(call.changes)) ? call.changes : [];
  if (v !== APPLY_FORMAT) return { v: APPLY_FORMAT, refused: 'Unknown change format ' + String(v).slice(0, 10) };
  const a = access_();
  if (a.role !== 'admin') return { v: APPLY_FORMAT, lost: a.reason || 'Not an admin' };
  const lock = LockService.getDocumentLock(); // shared by everyone (issue 59); the sync holds only the script lock
  if (!lock.tryLock(5000)) return { v: APPLY_FORMAT, retry: 'BUSY' };
  try {
    const sh = ss_().getSheetByName(TAB.ALERTS), I = idx_(ALERT_H), n = sh.getLastRow() - 1;
    const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0]).trim()) : [];
    const rows = {}; // row number -> its Status and Resolved At, as read once and as this call left them
    const results = changes.map(c => applyAlert_(sh, I, ids, rows, c || {}));
    if (results.some(r => r.end === 'applied')) SpreadsheetApp.flush();
    const t = Date.now();
    results.forEach(r => { r.at = t; });
    return { v: APPLY_FORMAT, results: results };
  } finally { lock.releaseLock(); }
}

/** One alert change, by issue 50's table. A snooze that ran out counts as OPEN, as the sync treats it. */
function applyAlert_(sh, I, ids, rows, c) {
  const id = String(c.id || ''), want = APPLY_ALERT[c.op], at = Number(c.at), until = Number(c.until);
  const drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (c.kind !== 'alert' || !want || want.seen.indexOf(c.seen) < 0 || !(at > 0)) return drop('Not a change this entry knows.');
  if (c.op === 'snooze' && !(until > at)) return drop('A snooze needs an end after the click.');
  const i = ids.indexOf(String(c.alert || '').trim());
  if (i < 0) return { id: id, end: 'met' }; // the row is gone
  const row = i + 2;
  if (!rows[row]) {
    const r = sh.getRange(row, 1, 1, ALERT_H.length).getValues()[0];
    rows[row] = { type: r[I.Type], status: String(r[I.Status]), end: r[I['Resolved At']] };
  }
  const x = rows[row], now = new Date();
  const cur = x.status === 'SNOOZED' && !(x.end > now) ? 'OPEN' : x.status;
  if (x.type === 'MANUAL_EDIT' && c.op !== 'unmute' && c.op !== 'resolve') return drop('Use Apply / Revert / Accept for a manual edit.');
  if (cur === want.to) return { id: id, end: 'met' }; // the author's own value: a retry, or someone else did it
  if (c.op === 'unmute') {
    if (cur === c.seen) return write_(sh, I, row, x, id, 'OPEN', '');
    if (HELD_STATUSES.indexOf(cur) >= 0) return { id: id, end: 'dropped', sheet: cur }; // the other hold
    return { id: id, end: 'met' }; // open again, or closed
  }
  if (cur === 'OPEN') {
    if (c.op === 'snooze' && !(until > now.getTime())) return { id: id, end: 'met' }; // the snooze would already be over
    return write_(sh, I, row, x, id, want.to, new Date(c.op === 'snooze' ? until : at));
  }
  if (cur === 'SNOOZED' && c.op !== 'snooze') return { id: id, end: 'dropped', sheet: cur }; // another admin snoozed it
  return { id: id, end: 'met' }; // closed or muted meanwhile
}

function write_(sh, I, row, x, id, status, end) {
  sh.getRange(row, I.Status + 1, 1, 2).setValues([[status, end]]); // Status and Resolved At sit side by side (ALERT_H)
  x.status = status; x.end = end;
  return { id: id, end: 'applied' };
}
