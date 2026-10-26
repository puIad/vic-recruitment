/* ---------- pending changes: the lean apply entry and the owner's switch (docs/plans.md › Slices 2 to 4) ---------- */
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
 *  - {id, kind: 'field', code, field, value, seen, at} (a member, or an admin in a binome, who can edit their binome sheet): one gold cell of one
 *    candidate, compared as memberSet_ does (goldText_); then the dirty:<binome> mark and patchSlice_, so the partner sees it
 *    at their next poll.
 *  - {id, kind: 'team', email, value, seen, at} (admins): the Team tab's Experienced tick of one member (teamSet_'s cell),
 *    true or false; the drafts holding them get their note again.
 *  - {id, kind: 'bfield', binome, code, field, value, seen, at} (admins): Contacted, Interview Date or Interview Time of one
 *    candidate in that binome's sheet (the alerts' Fix, setCell_), compared and written as a member's field; the Master takes
 *    it at the next sync, which reads that sheet (dirty).
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
  const a = access_(), admin = a.role === 'admin', fields = changes.some(c => c && c.kind === 'field');
  const mv = a.role === 'member' || (admin && fields) ? asMember_(a) : null, member = !!mv && !mv.cover && !!mv.edit; // an admin's Drive call only for field changes
  if (!admin && !member) return { v: APPLY_FORMAT, lost: a.reason || (a.role === 'member' ? 'Not an editing member of the binome' : 'Not an admin') };
  const w = { admin: admin, member: member, a: member ? mv : a, wrote: [] }; // what this call has read, filled as its changes need it
  if (member && fields) {
    const book = SpreadsheetApp.openById(mv.m.f); // access_ just saw edit access: a failure here is Drive, and a throw is a retry
    w.mine = sheetTarget_(mv.m.b, book); // opened before the lock, as memberSet_
  }
  const bf = admin ? changes.filter(c => c && c.kind === 'bfield').map(c => String(c.binome || '').trim()) : [];
  if (bf.length) w.bins = binomeTargets_(bf);
  const lock = LockService.getDocumentLock(); // shared by everyone (issue 59); the sync holds only the script lock
  if (!lock.tryLock(5000)) return { v: APPLY_FORMAT, retry: 'BUSY' };
  try {
    const results = changes.map(c => applyOne_(w, c || {}));
    if (results.some(r => r.end === 'applied')) { SpreadsheetApp.flush(); _settings = null; }
    w.wrote.forEach(f => Object.keys(f.wrote).forEach(code => goldPatch_(f.b, f.sh, f.rows[code].row, code, f.wrote[code])));
    if (w.team && w.team.wrote.length) teamNotes_(w.team);
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
  if (c.kind === 'field') return w.member ? applyField_(w, w.mine, c, id, 'This candidate is no longer in your binome.') : drop("Only the binome's members fill in its sheet from here.");
  if (c.kind === 'team' || c.kind === 'bfield') {
    if (!w.admin) return drop('Only an admin can make this change.');
    if (c.kind === 'team') return applyTeam_(w.team || (w.team = { t: loadTable_(TAB.TEAM, TEAM_H), wrote: [] }), c, id);
    const code = String(c.binome || '').trim(), f = w.bins[code];
    if (ADMIN_FIELDS.indexOf(String(c.field)) < 0) return drop('Not a change this entry knows.');
    return f.gone ? drop(f.gone) : applyField_(w, f, c, id, 'This candidate is no longer in ' + code + '.');
  }
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

/** One gold cell of one candidate in a binome sheet (f: sheetTarget_). The candidate's row is read once (values and display
 *  values), before this call writes to it. gone = the drop's reason when their row is not in that sheet. */
function applyField_(w, f, c, id, gone) {
  const field = String(c.field || ''), code = String(c.code || '').trim(), drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (BF_EDITABLE.indexOf(field) < 0) return drop('Not a change this entry knows.');
  let v;
  try { v = memberValue_(field, c.value, f.tz); } catch (e) { return drop(e.message); }
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
  if (x.row < 0) return drop(gone);
  const cur = x.text[field];
  if (cur === goldText_(field, c.value)) return { id: id, end: 'met' }; // a retry, or the partner typed the same
  if (cur !== goldText_(field, c.seen)) return { id: id, end: 'dropped', sheet: cur }; // the partner changed it
  goldWrite_(f.sh, x.row, field, v);
  x.text[field] = goldText_(field, c.value);
  if (!Object.keys(f.wrote).length) w.wrote.push(f); // after the flush: the next sync reads the sheet, its cached slice takes the values
  (f.wrote[code] = f.wrote[code] || []).push(field);
  return { id: id, end: 'applied' };
}
/** A binome sheet as applyField_ works on it. */
function sheetTarget_(b, book) { return { b: b, sh: book.getSheets()[0], tz: book.getSpreadsheetTimeZone(), rows: {}, wrote: {} }; }

/** The cells an admin's bfield may set: what the alerts' Fix writes (setCell_). */
const ADMIN_FIELDS = ['Contacted', 'Interview Date', 'Interview Time'];
/** code -> sheetTarget_ of each binome named, or {gone: reason}; opened before the lock. Drive failing on an open throws (a retry). */
function binomeTargets_(codes) {
  const t = loadTable_(TAB.BINOMES, BIN_H), B = t.I, out = {};
  codes.forEach(code => {
    if (out[code]) return;
    const r = t.data.filter(x => String(x[B.Binome]).trim() === code)[0], fid = r ? String(r[B['File ID']]).trim() : '';
    if (!fid) { out[code] = { gone: r ? code + ' has no sheet.' : code + ' is not in the Binomes tab any more.' }; return; }
    try { out[code] = sheetTarget_(code, SpreadsheetApp.openById(fid)); } catch (e) {
      if (!/permission|access/i.test(e && e.message)) throw e;
      out[code] = { gone: 'You cannot open the sheet of ' + code + '.' };
    }
  });
  return out;
}

/** The Experienced tick of one Team member: written only while it still shows what the author saw. */
function applyTeam_(tw, c, id) {
  const t = tw.t, T = t.I, e = lc_(c.email), drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (typeof c.value !== 'boolean') return drop('Experienced must be true or false.');
  if (t.head[T.Experienced] !== 'Experienced') return drop(NO_EXP_COL);
  const i = t.data.findIndex(r => lc_(r[T.Email]) === e);
  if (i < 0) return drop(e + ' is not in the Team tab any more.');
  const cur = bool_(t.data[i][T.Experienced]);
  if (cur === c.value) return { id: id, end: 'met' };
  if (cur !== (c.seen === true)) return { id: id, end: 'dropped', sheet: String(cur) }; // another admin changed it (as text, like the other kinds)
  t.sh.getRange(i + 2, T.Experienced + 1).setValue(c.value);
  t.data[i][T.Experienced] = c.value;
  tw.wrote.push(e);
  return { id: id, end: 'applied' };
}
/** The drafts holding a member whose tick changed get their note again ("Both members are new"), as teamSet_ does.
 *  shortcut: outside the script lock, so a Pair or Redraw rewriting the drafts in the same seconds may keep its own note. */
function teamNotes_(tw) {
  const ctx = { team: tw.t, bin: loadTable_(TAB.BINOMES, BIN_H) }, B = ctx.bin.I, who = teamByEmail_(ctx);
  ctx.bin.data.forEach((r, j) => {
    if (isDraft_(r, B) && tw.wrote.some(e => lc_(r[B['Email 1']]) === e || lc_(r[B['Email 2']]) === e)) noteCell_(ctx.bin.sh.getRange(j + 2, 1), [draftNote_(rowPair_(who, r, B))]);
  });
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

/* ---------- dropped changes away from the page (docs/plans.md › Slice 4) ---------- */
// Each timed cycle asks Vercel's api/drops (it holds the Redis records): which drops no page showed (email their author),
// which authors left one unanswered (alert DROPPED|<email>), who has any left (the others' alert resolves). The secret is the
// script property DROPS_SECRET, the same value as Vercel's; unset = no call. What this cycle mailed is kept in DROPS_MAILED
// and reported by the next call, so a lost answer means one more email, never none.
const DROP_REASON = { // the consumer's reasons; the script's own come as sentences
  'lost access': 'You can no longer edit the Master, so it could not be written as you.',
  'sign-in ended before it was saved': 'Your sign-in ended before it reached the sheet.',
  'retries ran out': 'Google kept refusing it until your sign-in ran out.',
};
const DROP_STATUS = { OPEN: 'Open', SNOOZED: 'Snoozed', MUTED: 'Muted', RESOLVED: 'Resolved', 'AUTO-RESOLVED': 'Closed by the script' };
const DROP_OP = { resolve: 'Resolve', snooze: 'Snooze', mute: 'Mute', unmute: 'Unmute' };

function dropsSync_(ctx) {
  const props = PropertiesService.getScriptProperties(), secret = props.getProperty('DROPS_SECRET');
  if (!secret) return;
  let out;
  try {
    const r = UrlFetchApp.fetch(DASHBOARD_URL + '/api/drops', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ mailed: JSON.parse(props.getProperty('DROPS_MAILED') || '[]') }), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return console.warn('Drops: api/drops answered ' + r.getResponseCode());
    out = JSON.parse(r.getContentText());
  } catch (e) { return console.warn('Drops: ' + e); }
  const mailed = [];
  (out.mail || []).forEach(m => {
    const n = m.drops.length;
    if (mail_(m.email, '[VIC Recruitment] ' + (n === 1 ? 'Your change was' : n + ' of your changes were') + ' not applied', dropsMail_(ctx, m.drops)))
      mailed.push({ email: m.email, cells: m.drops.map(d => d.cell), at: Date.now() });
  });
  if (mailed.length) props.setProperty('DROPS_MAILED', JSON.stringify(mailed)); else props.deleteProperty('DROPS_MAILED');
  (out.alert || []).forEach(email => ctx.alerts.add({ severity: 'MEDIUM', type: 'DROPPED', code: '', binome: '', key: 'DROPPED|' + email,
    msg: email + ' has dashboard changes that never reached the sheet and has not answered them. They are asked on their next visit; check with them.' }));
  const open = out.open || [], KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(r => /^DROPPED\|/.test(r[KI.Key]) && open.indexOf(String(r[KI.Key]).slice(8)) < 0);
}

/** The email listing an author's drops (the prototype's draft, issue 51). */
function dropsMail_(ctx, drops) {
  const KI = ctx.alerts.table.I, rows = {};
  ctx.alerts.table.data.forEach(r => { rows[r[KI.ID]] = r; });
  const text = v => (v === true ? 'Yes' : v === false ? 'No' : v === undefined || v === null || v === '' ? 'empty' : String(v).length > 200 ? String(v).slice(0, 200) + '…' : String(v));
  const blocks = drops.map(d => {
    const a = d.kind === 'alert' ? rows[d.alert] : null;
    const what = d.kind === 'alert' ? 'Alert ' + d.alert + (a ? ' · ' + a[KI.Type] + (a[KI.Interviewee] ? ' · ' + a[KI.Interviewee] : '') : '')
      : d.kind === 'setting' ? 'Setting ' + d.key : d.kind === 'team' ? 'Team · ' + d.email + ' · Experienced' : d.code + ' · ' + d.field;
    const mine = d.kind === 'alert' ? DROP_OP[d.op] || d.op : text(d.value);
    const sheet = d.kind === 'alert' ? DROP_STATUS[d.sheet] || d.sheet : text(d.sheet);
    return mailH_(what) + mailList_([['You asked', mine], d.reason ? ['Why', DROP_REASON[d.reason] || d.reason] : ['The sheet now', sheet]]);
  });
  const n = drops.length;
  return mailHtml_({
    title: (n === 1 ? 'Your change was' : n + ' of your changes were') + ' not applied',
    intro: 'The sheet changed before your changes reached it, or they could not be written, so the sheet kept its value. Nothing is lost: open the dashboard to keep the sheet\'s value or apply yours anyway.',
    blocks: blocks.concat([mailP_('If nobody answers within **24 hours**, the admins get an alert about these changes.')]),
    cta: { label: 'Review my changes', url: DASHBOARD_URL + '/?review=dropped' },
    footer: mailTeamFooter_(),
  });
}
