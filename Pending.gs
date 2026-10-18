/* ---------- pending changes: the lean apply entry and the owner's switch (docs/plans.md › Slices 2 and 3) ---------- */
// A dashboard save becomes a pending change on Vercel (accepted, queued, kept in Redis); the queue consumer applies it here,
// through scripts.run as its author. Only the consumer calls webApply: it is not in /api/run's allowlist.

/** Change format the consumer sends. A call in another format is refused whole (nothing read or written). */
const APPLY_FORMAT = 1;
/** What each alert action wants, and what it accepts as the author's screen. seen is OPEN (SNOOZED or MUTED for Unmute), or
 *  the author's own earlier value when the accept step merged the change with theirs (issue 61). */
const APPLY_ALERT = {
  resolve: { seen: ['OPEN', 'SNOOZED', 'MUTED'], to: 'RESOLVED' },
  snooze: { seen: ['OPEN', 'SNOOZED', 'MUTED'], to: 'SNOOZED' },
  mute: { seen: ['OPEN', 'SNOOZED', 'MUTED'], to: 'MUTED' },
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
 * Apply one author's pending changes: {v, changes: [...]}, each one cell:
 *  - {id, kind: 'alert', alert, op, seen, at, until?} (admins): at = the click (ms), Resolved At for Resolve and Mute; until =
 *    Snooze's end (ms), fixed at the click.
 *  - {id, kind: 'setting', key, value, seen, at} (admins): the Settings tab's column B, compared after saveSettings_'s parsing
 *    (a missing row or a blank value = the default); a missing key gets its row appended.
 *  - {id, kind: 'field', code, field, value, seen, at} (a member who can edit their binome sheet): one gold cell of one
 *    candidate, compared as memberSet_ does (goldText_); then the dirty:<binome> mark and patchSlice_, so the partner sees it
 *    at their next poll.
 * Each change is judged against the sheet as it is when it applies (an earlier change of the same call included):
 * applied (written), met (the sheet already does it: no notice) or dropped (with the sheet's value, or a reason: a value the
 * sheet refuses, a candidate gone from the binome; no retry for those).
 * Answers {v, results: [{id, end, sheet?, reason?, at}]}; at = the write or check time (Google's clock, as the snapshot's
 * build time). Or per call: {v, lost} (not an admin, or not an editing member, any more: drop them all) or {v, retry} (the
 * document lock was taken). Anything thrown is a retry for the consumer too. Never the script lock, no loadCtx_, no publish:
 * other admins see alerts and settings at the next sync's publish.
 */
function webApply(call) {
  const v = call && call.v, changes = (call && Array.isArray(call.changes)) ? call.changes : [];
  if (v !== APPLY_FORMAT) return { v: APPLY_FORMAT, refused: 'Unknown change format ' + String(v).slice(0, 10) };
  const a = access_(), admin = a.role === 'admin', member = a.role === 'member' && !a.cover && !!a.edit;
  if (!admin && !member) return { v: APPLY_FORMAT, lost: a.reason || (a.role === 'member' ? 'Not an editing member of the binome' : 'Not an admin') };
  const w = { admin: admin, member: member, a: a }; // what this call has read, filled as its changes need it
  if (member && changes.some(c => c && c.kind === 'field')) {
    w.book = SpreadsheetApp.openById(a.m.f); // access_ just saw edit access: a failure here is Drive, and a throw is a retry
    w.tz = w.book.getSpreadsheetTimeZone(); // opened before the lock, as memberSet_
  }
  const lock = LockService.getDocumentLock(); // shared by everyone (issue 59); the sync holds only the script lock
  if (!lock.tryLock(5000)) return { v: APPLY_FORMAT, retry: 'BUSY' };
  try {
    const results = changes.map(c => applyOne_(w, c || {}));
    if (results.some(r => r.end === 'applied')) { SpreadsheetApp.flush(); _settings = null; }
    if (w.fields) patchFields_(w);
    const t = Date.now();
    results.forEach(r => { r.at = t; });
    return { v: APPLY_FORMAT, results: results };
  } finally { lock.releaseLock(); }
}

function applyOne_(w, c) {
  const id = String(c.id || ''), drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (c.kind === 'alert' || c.kind === 'setting') {
    if (!w.admin) return drop('Only an admin can make this change.');
    if (c.kind === 'setting') return applySetting_(w.settings || (w.settings = readSettings_()), c, id);
    if (!w.alerts) {
      const sh = ss_().getSheetByName(TAB.ALERTS), n = sh.getLastRow() - 1;
      w.alerts = { sh: sh, I: idx_(ALERT_H), ids: n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0]).trim()) : [], rows: {} };
    }
    return applyAlert_(w.alerts, c);
  }
  if (c.kind === 'field') return w.member ? applyField_(w, c, id) : drop("Only the binome's members fill in its sheet from here.");
  return drop('Not a change this entry knows.');
}

/** The Settings tab's A:B, read once: keys and their cells. */
function readSettings_() {
  const sh = ss_().getSheetByName(TAB.SETTINGS), n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [];
  return { sh: sh, keys: rows.map(r => String(r[0]).trim()), vals: rows.map(r => r[1]) };
}
/** A setting's cell (or seen value) as text to compare, read as S_() reads it: blank = the default. */
function settingText_(r, v) {
  if (v === '' || v === null || v === undefined) v = r[1];
  if (typeof r[1] === 'boolean') return String(bool_(v));
  const s = String(v).trim();
  return typeof r[1] === 'number' && s !== '' && !isNaN(Number(s)) ? String(Number(s)) : s;
}
function applySetting_(st, c, id) {
  const r = SETTINGS_DEFAULTS.filter(x => x[0] === c.key)[0];
  if (!r) return { id: id, end: 'dropped', reason: 'Not a setting this entry knows.' };
  let v;
  try { v = settingValue_(r, c.value); } catch (e) { return { id: id, end: 'dropped', reason: e.message }; }
  const i = st.keys.indexOf(r[0]), cur = settingText_(r, i < 0 ? '' : st.vals[i]);
  if (cur === settingText_(r, v)) return { id: id, end: 'met' };
  if (cur !== settingText_(r, c.seen)) return { id: id, end: 'dropped', sheet: cur }; // someone changed it since the author saw it
  if (i < 0) { st.sh.appendRow([r[0], v, r[2]]); st.keys.push(r[0]); st.vals.push(v); }
  else { st.sh.getRange(i + 2, 2).setValue(v); st.vals[i] = v; }
  return { id: id, end: 'applied' };
}

/** One gold cell of one candidate in the member's own binome sheet. The candidate's row is read once (values and display
 *  values), before this call writes to it. */
function applyField_(w, c, id) {
  const field = String(c.field || ''), code = String(c.code || '').trim(), drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (BF_EDITABLE.indexOf(field) < 0) return drop('Not a change this entry knows.');
  let v;
  try { v = memberValue_(field, c.value, w.tz); } catch (e) { return drop(e.message); }
  const f = w.fields || (w.fields = { sh: w.book.getSheets()[0], rows: {}, wrote: {} });
  if (f.layout === undefined) f.layout = bfLayout_(f.sh);
  if (f.layout !== 'v2') return drop("The binome sheet's header was changed by hand: ask an admin to repair it.");
  let x = f.rows[code];
  if (!x) {
    x = f.rows[code] = { row: findFileRow_(f.sh, code), text: {} };
    if (x.row > 0) {
      const rng = f.sh.getRange(x.row, BF_COL, 1, BF_H.length), F = idx_(BF_H), was = rng.getValues()[0], shown = rng.getDisplayValues()[0];
      BF_EDITABLE.forEach(k => { x.text[k] = goldText_(k, goldOf_(k, was[F[k]], shown[F[k]])); });
    }
  }
  if (x.row < 0) return drop('This candidate is no longer in your binome.');
  const cur = x.text[field];
  if (cur === goldText_(field, c.value)) return { id: id, end: 'met' }; // a retry, or the partner typed the same
  if (cur !== goldText_(field, c.seen)) return { id: id, end: 'dropped', sheet: cur }; // the partner changed it
  goldWrite_(f.sh, x.row, field, v);
  x.text[field] = goldText_(field, c.value);
  (f.wrote[code] = f.wrote[code] || []).push(field);
  return { id: id, end: 'applied' };
}
/** After the flush: the next sync reads this binome's sheet, and its cached slice takes the written values. */
function patchFields_(w) {
  const f = w.fields;
  Object.keys(f.wrote).forEach(code => goldPatch_(w.a.m.b, f.sh, f.rows[code].row, code, f.wrote[code]));
}

/** One alert change: the cell still holds what the author saw = write their value; else issue 50's table (written for
 *  seen = OPEN, and for Unmute's seen hold). A snooze that ran out counts as OPEN, as the sync treats it. */
function applyAlert_(al, c) {
  const sh = al.sh, I = al.I, ids = al.ids, rows = al.rows;
  const id = String(c.id || ''), want = APPLY_ALERT[c.op], at = Number(c.at), until = Number(c.until);
  const drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (!want || want.seen.indexOf(c.seen) < 0 || !(at > 0)) return drop('Not a change this entry knows.');
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
  if (cur === c.seen) {
    if (c.op === 'snooze' && !(until > now.getTime())) return { id: id, end: 'met' }; // the snooze would already be over
    return write_(sh, I, row, x, id, want.to, c.op === 'unmute' ? '' : new Date(c.op === 'snooze' ? until : at));
  }
  // someone else changed the cell since the author saw it
  if (c.op === 'unmute') return HELD_STATUSES.indexOf(cur) >= 0 ? { id: id, end: 'dropped', sheet: cur } : { id: id, end: 'met' }; // the other hold; open or closed
  if (cur === 'OPEN' || (cur === 'SNOOZED' && c.op !== 'snooze')) return { id: id, end: 'dropped', sheet: cur }; // another admin snoozed it, or reopened it
  return { id: id, end: 'met' }; // closed or muted meanwhile
}

function write_(sh, I, row, x, id, status, end) {
  sh.getRange(row, I.Status + 1, 1, 2).setValues([[status, end]]); // Status and Resolved At sit side by side (ALERT_H)
  x.status = status; x.end = end;
  return { id: id, end: 'applied' };
}
