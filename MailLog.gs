/* ---------- email and notification status (docs/admin-features.md): the Mail Log, MAIL_FAILED, Resend ---------- */
// Google reports nothing about delivery, so the script records what it tried. mail_() collects rows in memory; mailLogFlush_ writes them
// once at the end of the run (withLock_ and the sync do it), so a run that sends gains one write. A run that dies mid-way loses its
// unwritten rows; the execution log still has its failures.
// No row cap: vic.rh sends at most 1,500 mails a day (Google blocks it past that), so the log grows by at most that, plus test mode's Held rows.

let _mailBy = 'the sync'; // who triggered what mail_() sends now: the sync, the digest, or an admin's email (webRun sets it)
let _mailRows = [];       // [{when, kind, to, concerns, by, outcome, error, subject, stored}] not written yet
let _mailAlerting = false; // inside mailLogFlush_'s own alert: a failure there is logged and raises nothing new

const ML_STORED_MAX = 45000;      // a cell holds 50,000 characters
const ML_CANDIDATE_KINDS = ['CONFIRM', 'REJECT', 'QUICKFIX_CAND']; // sent under the candidate-facing sender name
const ML_NO_RESEND = ['DROP'];    // the next cycle retries these

/** Called by mail_() for every send: held (test mode) and failed ones too. */
function mailLogAdd_(to, subject, html, meta, outcome, error) {
  meta = meta || {};
  _mailRows.push({ when: new Date(), kind: String(meta.kind || 'MAIL'), to: String(to || ''), concerns: [].concat(meta.concerns || []).filter(Boolean).join(', '),
    by: _mailBy, outcome: outcome, error: error || '', subject: String(subject || ''), stored: outcome === 'Failed' ? String(html || '').slice(0, ML_STORED_MAX) : '' });
}

function mailLogRow_(r) {
  return [r.when, r.kind, r.to, r.concerns, r.by, r.outcome, r.error, r.subject, r.stored].map(plain_);
}

/** The Mail Log tab, created on first write like Interviewee Changes. */
function mailLogSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(TAB.MAIL_LOG);
  if (!sh) {
    sh = ss.insertSheet(TAB.MAIL_LOG);
    sh.getRange(1, 1, 1, ML_H.length).setValues([ML_H]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function mailLogWrite_(rows) {
  if (!rows.length) return;
  const sh = mailLogSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, ML_H.length).setValues(rows.map(mailLogRow_));
}

/** Writes the rows mail_() collected, then raises one MAIL_FAILED for the run if any failed. ctx: the run's context, when it has one
 *  (its alert buffer then carries the alert into the snapshot); else a small one is made. Never throws: a log must not fail a run. */
function mailLogFlush_(ctx) {
  if (!_mailRows.length) return;
  const rows = _mailRows;
  _mailRows = [];
  try {
    mailLogWrite_(rows);
    const failed = rows.filter(r => r.outcome === 'Failed');
    if (!failed.length || _mailAlerting) return;
    _mailAlerting = true;
    try {
      const al = ctx ? ctx.alerts : alertBuffer_({ now: new Date(), binByCode: {}, coverMap: {} });
      const t = r => r.when.getTime(), list = failed.slice(0, 8).map(r => r.kind + ' to ' + r.to + (r.concerns ? ' (' + r.concerns + ')' : '') + ': ' +
        String(r.error).replace(/^Error:\s*/, '').slice(0, 120) + (ML_NO_RESEND.indexOf(r.kind) >= 0 ? ' [retrying]' : ''));
      al.add({ severity: 'HIGH', type: 'MAIL_FAILED', code: '', binome: '', key: 'MAIL_FAILED|' + t(failed[0]) + '-' + t(failed[failed.length - 1]),
        msg: failed.length + ' mail' + (failed.length === 1 ? '' : 's') + ' failed: ' + list.join('; ') + (failed.length > list.length ? '; and ' + (failed.length - list.length) + ' more' : '') +
          '. Open the Mail Log tab, or Resend from the alert.' });
      al.flush(); // its mail to the admins goes through mail_ and lands in _mailRows
      const own = _mailRows;
      _mailRows = [];
      mailLogWrite_(own);
    } finally { _mailAlerting = false; }
  } catch (e) { console.warn('Mail Log not written: ' + e); }
}

/** For a caller that sends outside any lock (the digest): the lock's release writes the log. A lock still busy after 60 s: the rows are
 *  appended one at a time (Sheets applies each append atomically, so a sync's rows are not overwritten) and no alert is raised, since
 *  its ID would be read outside the lock. The execution log still has any failure. */
function mailLogSettle_() {
  if (!_mailRows.length) return;
  if (withLock_(() => true, 60000) !== null) return;
  const rows = _mailRows;
  _mailRows = [];
  try { const sh = mailLogSheet_(); rows.forEach(r => sh.appendRow(mailLogRow_(r))); } catch (e) { console.warn('Mail Log not written: ' + e); }
}

/* ---------- reading ---------- */

function mailLogRows_() {
  const sh = ss_().getSheetByName(TAB.MAIL_LOG);
  const n = sh ? sh.getLastRow() : 0;
  return n > 1 ? sh.getRange(2, 1, n - 1, ML_H.length).getValues().map((r, i) => ({ row: i + 2, v: r })) : [];
}
function mailRowId_(x) { const w = x.v[0]; return x.row + ':' + (w instanceof Date ? w.getTime() : 0); }
function mailRowOut_(x) {
  const v = x.v, w = v[0] instanceof Date ? v[0] : null;
  return { id: mailRowId_(x), at: w ? w.getTime() : 0, when: w ? fmt_(w, 'dd/MM HH:mm') : '', kind: String(v[1]), to: String(v[2]), concerns: String(v[3]),
    by: String(v[4]), outcome: String(v[5]), error: String(v[6]), subject: String(v[7]) };
}
const mailTokens_ = s => String(s || '').split(/,\s*/).map(t => t.trim()).filter(Boolean);

/** webRun('mailLog', {code | binome | alertId}): the mails to or about a candidate, a binome's members, or an alert; newest first, with the
 *  older marks (before the log) and, for an alert older than the log, who it was meant to reach. A read. */
function mailLogGet_(args) {
  args = args || {};
  const all = mailLogRows_(), first = all.length ? all[0].v[0] : null;
  let match = () => false, older = [], intended = '', last = null;
  if (args.code) {
    const code = String(args.code).trim(), t = loadTable_(TAB.IV, IV_H), I = t.I, x = t.data.filter(r => String(r[I.Code]).trim() === code)[0];
    if (!x) throw new Error('Unknown code ' + code);
    const email = lc_(x[I.Email]);
    match = v => mailTokens_(v[3]).indexOf(code) >= 0 || (email && lc_(v[2]) === email);
    const conf = /CONFIRMED (\d\d\/\d\d\/\d{4})/.exec(String(x[I.Flags])), rej = /Rejection sent (\d\d\/\d\d)/.exec(String(x[I.Screening]));
    if (conf) older.push({ label: 'Confirmation', text: 'queued', date: conf[1] });
    if (rej) older.push({ label: 'Rejection', text: 'sent', date: rej[1] });
  } else if (args.binome) {
    const code = String(args.binome).trim(), b = loadCtx_().binByCode[code];
    if (!b) throw new Error('Unknown binome ' + code);
    const emails = b.members.map(m => m.email), done = pairedSent_();
    match = v => mailTokens_(v[3]).indexOf(code) >= 0 || emails.indexOf(lc_(v[2])) >= 0;
    b.members.forEach(m => { if (m.email && done.indexOf(code + '|' + m.email) >= 0) older.push({ label: 'New binome mail to ' + (m.name || m.email), text: 'told', date: '' }); });
  } else if (args.alertId) {
    const id = String(args.alertId).trim(), t = loadTable_(TAB.ALERTS, ALERT_H), A = t.I, r = t.data.filter(x => String(x[A.ID]) === id)[0];
    match = v => mailTokens_(v[3]).indexOf(id) >= 0;
    if (r && String(r[A['Emailed To']]).trim() && !all.some(x => match(x.v)) && (!first || r[A.Created] < first)) intended = String(r[A['Emailed To']]).trim();
  } else throw new Error('Say whose mails: a code, a binome or an alert.');
  const rows = all.filter(x => match(x.v)).sort((a, b) => b.v[0] - a.v[0]).slice(0, 200).map(mailRowOut_);
  if (args.binome && rows.length) last = { when: rows[0].when, kind: rows[0].kind, outcome: rows[0].outcome };
  return { rows: rows, older: older, intended: intended, last: last, since: first instanceof Date ? fmt_(first, 'dd/MM HH:mm') : '', testMode: bool_(S_().TEST_MODE) };
}

/* ---------- Resend ---------- */

/** Why a failed row can't be resent any more, or ''. */
function mailStale_(ctx, x) {
  const kind = String(x.v[1]), to = lc_(x.v[2]), tokens = mailTokens_(x.v[3]);
  const code = tokens.filter(t => ctx.ivByCode[t] !== undefined || /^[A-Z]+\.\d+$/.test(t))[0];
  if ((kind === 'CONFIRM' || kind === 'REJECT') && code && !ctx.ivByCode[code]) return code + ' is not in the Interviewees tab any more';
  const bin = tokens.filter(t => ctx.binByCode[t])[0];
  if (['PAIRED', 'JOINED', 'LEFT', 'COVER', 'COVERED', 'NEW_IV', 'BINOME_PAUSED', 'BINOME_RESUMED', 'INTERVIEW_CLOSED', 'INTERVIEW_REOPENED'].indexOf(kind) >= 0) {
    if (!bin) return 'the binome is gone';
    if (kind !== 'LEFT' && kind !== 'COVER' && kind !== 'COVERED' && ctx.binByCode[bin].members.map(m => m.email).indexOf(to) < 0) return to + ' is not in ' + bin + ' any more';
  }
  return '';
}

/** Already sent by the path that writes the mark (Send rejections, the binome email catch-up): nothing left to resend. */
function mailMarked_(ctx, x, paired) {
  const kind = String(x.v[1]), to = lc_(x.v[2]), tokens = mailTokens_(x.v[3]);
  if (kind === 'REJECT') {
    const r = tokens.map(t => ctx.ivByCode[t]).filter(Boolean)[0];
    return !!r && /Rejection sent/.test(String(r[ctx.iv.I.Screening]));
  }
  if (kind === 'PAIRED') return tokens.some(t => (paired || pairedSent_()).indexOf(t + '|' + to) >= 0);
  return false;
}

/** A failed DROP the next cycle sent, or a failed mail whose mark is set: closed as Resent. Returns the rows still failed. */
function mailFailedOpen_(ctx, rows, write) {
  const sent = {}, paired = pairedSent_();
  rows.forEach(x => { if (x.v[5] === 'Sent') sent[x.v[1] + '|' + lc_(x.v[2])] = x.v[0]; });
  const open = [];
  rows.forEach(x => {
    if (x.v[5] !== 'Failed') return;
    const later = sent[x.v[1] + '|' + lc_(x.v[2])];
    if ((ML_NO_RESEND.indexOf(String(x.v[1])) >= 0 && later && later > x.v[0]) || mailMarked_(ctx, x, paired)) {
      if (write) { x.v[5] = 'Resent'; x.v[8] = ''; mailLogPut_(x); }
      return;
    }
    open.push(x);
  });
  return open;
}
function mailLogPut_(x) {
  const sh = mailLogSheet_();
  sh.getRange(x.row, 6, 1, 1).setValue(x.v[5]);
  sh.getRange(x.row, 9, 1, 1).setValue(x.v[8]);
  sh.getRange(x.row, 3, 1, 1).setValue(plain_(x.v[2]));
}

/** MAIL_FAILED resolves itself once every mail it lists is resent, dismissed or retried. In the timed sync, and after Resend. */
function mailFailedSettle_(ctx) {
  const KI = ctx.alerts.table.I, openAlerts = ctx.alerts.table.data.filter(r => r[KI.Type] === 'MAIL_FAILED' && (r[KI.Status] === 'OPEN' || r[KI.Status] === 'SNOOZED'));
  if (!openAlerts.length) return;
  const open = mailFailedOpen_(ctx, mailLogRows_(), true);
  openAlerts.forEach(r => {
    const m = /^MAIL_FAILED\|(\d+)-(\d+)$/.exec(String(r[KI.Key]));
    if (!m) return;
    if (!open.some(x => x.v[0].getTime() >= Number(m[1]) - 1 && x.v[0].getTime() <= Number(m[2]) + 1)) ctx.alerts.resolveWhere(x => x === r);
  });
}

/** webRun('mailResendPreview'): the failed mails, each with its address, the error and what Resend would do. */
function mailResendPreview_() {
  const ctx = loadCtx_(), open = mailFailedOpen_(ctx, mailLogRows_(), false);
  return { testMode: bool_(S_().TEST_MODE), mails: open.slice().reverse().map(x => Object.assign(mailRowOut_(x), {
    stale: mailStale_(ctx, x), retrying: ML_NO_RESEND.indexOf(String(x.v[1])) >= 0 })) };
}

/** webRun('mailResend', {send: [id | {id, to}], dismiss: [id]}): sends the stored subject and body to the address on the row (or the one
 *  fixed in the preview), writes the mark the original would have, and dismisses the stale ones. Each resend adds its own row. */
function mailResendCore_(a, args) {
  args = args || {};
  const send = [].concat(args.send || []).map(s => (typeof s === 'object' ? { id: String(s.id), to: String(s.to || '').trim() } : { id: String(s), to: '' }));
  const dismiss = [].concat(args.dismiss || []).map(String);
  if (!send.length && !dismiss.length) throw new Error('No mail chosen.');
  const out = withLock_(() => {
    const ctx = loadCtx_(), rows = mailLogRows_(), by = {};
    rows.forEach(x => { by[mailRowId_(x)] = x; });
    const lines = [];
    let sent = 0, failed = 0, held = 0, marked = false;
    send.forEach(s => {
      const x = by[s.id];
      if (!x || x.v[5] !== 'Failed') return lines.push('A mail in the list was already handled (refresh the page).');
      if (ML_NO_RESEND.indexOf(String(x.v[1])) >= 0) return lines.push(x.v[2] + ': the next cycle retries it.');
      const stale = mailStale_(ctx, x);
      if (stale && !s.to) return lines.push(x.v[2] + ': ' + stale + '. Dismiss it instead.');
      if (mailMarked_(ctx, x)) { x.v[5] = 'Resent'; x.v[8] = ''; mailLogPut_(x); return lines.push(x.v[2] + ': already sent by another path.'); } // the mark was set since the preview
      const to = s.to || String(x.v[2]).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return lines.push(to + ' is not an email address.');
      if (!String(x.v[8])) return lines.push(x.v[2] + ': the mail was not stored, so it cannot be resent.');
      const kind = String(x.v[1]), tokens = mailTokens_(x.v[3]);
      const ok = mail_(to, String(x.v[7]), String(x.v[8]), ML_CANDIDATE_KINDS.indexOf(kind) >= 0 ? MAIL.candidateFrom : undefined, { kind: kind, concerns: tokens });
      if (!ok) { if (mailHeld_(to)) held++; else failed++; return; }
      sent++;
      if (to !== String(x.v[2]).trim()) x.v[2] = to;
      x.v[5] = 'Resent'; x.v[8] = ''; mailLogPut_(x);
      if (kind === 'REJECT') {
        const r = tokens.map(t => ctx.ivByCode[t]).filter(Boolean)[0];
        if (r && !/Rejection sent/.test(String(r[ctx.iv.I.Screening]))) { r[ctx.iv.I.Screening] = String(r[ctx.iv.I.Screening]).trim() + '; Rejection sent ' + fmt_(ctx.now, 'dd/MM'); marked = true; }
      }
      if (kind === 'PAIRED') tokens.filter(t => ctx.binByCode[t]).forEach(t => { if (pairedSent_().indexOf(t + '|' + lc_(to)) < 0) pairedMark_([t + '|' + lc_(to)]); });
    });
    dismiss.forEach(id => {
      const x = by[id];
      if (!x || x.v[5] !== 'Failed') return;
      x.v[5] = 'Dismissed'; x.v[8] = ''; mailLogPut_(x);
      lines.push('Dismissed ' + x.v[2] + '.');
    });
    if (marked) { saveTable_(ctx.iv); commitBase_(ctx); }
    mailLogFlush_(ctx); // the resends' rows (and an alert, if one failed again) before the alert is settled
    mailFailedSettle_(ctx);
    ctx.alerts.flush();
    return { sent: sent, failed: failed, held: held, dismissed: dismiss.length, lines: lines };
  }, 60000);
  if (!out) { busy_(); return null; }
  say_((out.sent ? out.sent + ' mail' + (out.sent === 1 ? '' : 's') + ' resent. ' : '') + (out.held ? out.held + ' held by test mode. ' : '') +
    (out.failed ? out.failed + ' failed again: see the new rows. ' : '') + (out.dismissed ? out.dismissed + ' dismissed. ' : '') + out.lines.join(' '));
  return out;
}
