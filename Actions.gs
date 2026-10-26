/* ---------- interviewees & alerts ---------- */

function reassignSelected() {
  const ui = SpreadsheetApp.getUi();
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== TAB.IV) return say_('Select the interviewee\'s row in the "Interviewees" tab first.');
  const rowNum = sh.getActiveRange().getRow();
  const code = String(sh.getRange(rowNum, 1).getValue()).trim();
  if (rowNum < 2 || !code) return say_('This row has no interviewee code.');
  const resp = ui.prompt('Reassign ' + code, 'Move ' + code + ' to which binome? (e.g. B.07)\nTheir Contacted/Date/Notes are carried over.', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  reassignCore_(code, resp.getResponseText());
}

function reassignCore_(code, binomeText) {
  code = String(code || '').trim();
  const msg = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    let done;
    try { done = moveInterviewee_(ctx, code, binomeText); } catch (e) {
      if (ctx.ivDirty) { saveTable_(ctx.iv); commitBase_(ctx); ctx.alerts.flush(); } // the row was lost from both sheets: keep its data and the alert
      return e.message;
    }
    saveTable_(ctx.iv);
    commitBase_(ctx);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    buildTracker_(ctx);
    return done;
  }, 60000);
  if (msg) say_(msg); else busy_();
}

/** Move an interviewee to another binome's sheet, carrying Contacted/Date/Notes. The caller saves. Throws the reason it can't. */
function moveInterviewee_(ctx, code, binomeText) {
  const I = ctx.iv.I, r = ctx.ivByCode[code], pb = parseBinomeCode(binomeText), target = pb && ctx.binByCode[pb.code];
  if (!r) throw new Error('Unknown code ' + code);
  if (r[I.Status] === ST.HELD) throw new Error(code + ' is on hold: approve it first.'); // a move would skip the review and its confirmation
  // declined or a duplicate: the binome would interview someone the Master keeps out (and Send rejections still lists)
  if (isOut_(r[I.Status])) throw new Error(code + ' is ' + String(r[I.Status]).toLowerCase() + ': restore it first.');
  if (!target || target.status === 'DRAFT') throw new Error('Binome "' + binomeText + '" not found or not locked yet.');
  if (r[I.Binome] === target.code) {
    // already there: only puts back a row missing from its sheet (the integrity check reports those)
    const sh = binomeSheet_(ctx, target);
    if (!sh || findFileRow_(sh, code) > 0) throw new Error(code + ' is already in ' + target.code);
    appendToBinomeFile_(ctx, target, r, Object.assign(ivCarry_(ctx, r), {
      form: r[I['Interview Submitted At']] ? '✅ ' + fmt_(r[I['Interview Submitted At']], 'dd/MM HH:mm') : '' }));
    return code + ' put back in the sheet of ' + target.code;
  }
  const old = ctx.binByCode[r[I.Binome]], before = { binome: r[I.Binome], at: r[I['Assigned At']] };
  const removed = old ? removeFromBinomeFile_(ctx, old, code) : {};
  // no row in the old sheet: what the Master knows is the carry, so Rating / Final Affectation are not wiped
  const carry = Object.keys(removed).length ? removed : Object.assign(ivCarry_(ctx, r),
    { form: r[I['Interview Submitted At']] ? '✅ ' + fmt_(r[I['Interview Submitted At']], 'dd/MM HH:mm') : '' });
  r[I.Binome] = target.code;
  r[I['Assigned At']] = ctx.now;
  try { appendToBinomeFile_(ctx, target, r, carry); } catch (e) {
    // the target sheet refused the row: put everything back where it was, then report
    r[I.Binome] = before.binome; r[I['Assigned At']] = before.at;
    let lost = '';
    if (old) { try { appendToBinomeFile_(ctx, old, r, carry); } catch (e2) { lost = e2.message; } }
    if (lost) {
      // in neither sheet now: keep what the binome had written in the Master, so the row can be rebuilt from it
      r[I.Contacted] = carry.contacted || ''; r[I['Interview Date']] = carry.date || ''; r[I['Interview Time']] = carry.time || ''; r[I['Binome Notes']] = carry.notes || '';
      r[I['Interview Done']] = carry.done === true; r[I.Rating] = carry.rating === undefined ? '' : carry.rating; r[I['Final Affectation']] = carry.affect || '';
      ctx.ivDirty = true;
      const msg = code + ' is missing from both binome sheets: the sheet of ' + target.code + ' refused it (' + e.message + ') and putting it back in ' + old.code +
        ' failed (' + lost + '). Their Contacted / Date / Notes are kept in the Interviewees tab: Move interviewee ' + code + ' to ' + old.code + ' to rebuild the row.';
      ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', code: code, binome: old.code, key: '', msg: msg });
      throw new Error('Nothing moved, but ' + msg);
    }
    throw new Error('Nothing moved: could not write the sheet of ' + target.code + ' (' + e.message + ').');
  }
  r[I.Status] = statusOf_(ctx, r);
  let kept = '';
  if (old) try { moveAnswers_(ctx, old, target, code); } catch (e) { kept = '. Its interview answers stayed in the sheet of ' + old.code + ' (' + e.message + ').'; }
  (ctx.mailNew[target.code] = ctx.mailNew[target.code] || []).push(r);
  indexCtx_(ctx);
  ctx.alerts.add({ severity: 'INFO', type: 'REASSIGNED', status: 'AUTO-FIXED', code: code, binome: target.code,
    msg: code + ' moved from ' + (old ? old.code : 'nobody') + ' to ' + target.code + ' by ' + Session.getActiveUser().getEmail() + kept, key: '' });
  logIvChange_(ctx, code, 'Moved', old ? old.code : '', target.code);
  return code + ' moved to ' + target.code + kept;
}

/** webRun('deleteApplication', {code}): an application erased for good (owner, 2026-10-26). Nobody is emailed. */
function deleteApplicationCore_(code) {
  code = String(code || '').trim();
  if (!code) throw new Error('No interviewee given.');
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const msg = deleteApplication_(ctx, code);
    saveTable_(ctx.iv);
    commitBase_(ctx);
    ctx.alerts.flush();
    buildTracker_(ctx);
    return msg;
  }, 60000);
  if (!res) { busy_(); return null; }
  say_(res);
  return res;
}

/** Its Interviewees row, its rows in the binome sheet (and Interview Answers) and its answer in Registration Responses go;
 *  its code is held so it is never handed out again. Throws only before anything is written. */
function deleteApplication_(ctx, code) {
  const I = ctx.iv.I, r = ctx.ivByCode[code];
  if (!r) throw new Error('Unknown code ' + code);
  const key = String(r[I['Response Key']]).trim(), name = (r[I['First Name']] + ' ' + r[I['Family Name']]).trim();
  const b = ctx.binByCode[r[I.Binome]], kept = [];
  holdCode_(code);
  // the Master's row: found again by key (by code for a row typed by hand), as rows may have moved since the load
  const n = ctx.iv.sh.getLastRow() - 1, cells = n > 0 ? ctx.iv.sh.getRange(2, 1, n, IV_H.length).getValues() : [];
  const at = cells.findIndex(x => (key ? String(x[I['Response Key']]).trim() === key : String(x[I.Code]).trim() === code));
  if (at >= 0) ctx.iv.sh.deleteRow(at + 2);
  const i = ctx.iv.data.indexOf(r);
  ctx.iv.data.splice(i, 1); ctx.iv.orig.splice(i, 1);
  indexCtx_(ctx);
  if (b) {
    try {
      removeFromBinomeFile_(ctx, b, code);
      const sh = binomeSheet_(ctx, b), tab = sh ? sh.getParent().getSheetByName(IA_TAB) : null;
      if (tab) withMemberLock_(b, () => { const a = answersRow_(tab, code); if (a) tab.deleteRow(a.row); });
    } catch (e) { kept.push('their row is still in the sheet of ' + b.code + ' (' + e.message + '): delete it there'); }
  }
  const reg = key ? responseSheet_('REG') : null;
  if (reg && reg.getLastRow() > 1) {
    const data = reg.getDataRange().getValues(), H = regHeaders_(data[0]), get = (row, j) => (j >= 0 ? row[j] : '');
    let found = false;
    for (let k = data.length - 1; k >= 1 && !found; k--) {
      const ts = get(data[k], H.ts), email = String(get(data[k], H.collected)).trim().toLowerCase() || String(get(data[k], H.typed)).trim();
      if (ts && (responseKey_(ts, email, k + 1) === key || serialKey_(ts, email) === key)) { reg.deleteRow(k + 1); found = true; }
    }
    if (!found) kept.push('their answer was not found in Registration Responses');
    else if (ctx.base) delete ctx.base.iv[key]; // nothing left to re-import: the baseline need not remember it
  }
  const A = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(x => String(x[A.Interviewee]) === code || (!!key && String(x[A.Key]).indexOf(key) >= 0), 'RESOLVED');
  const by = Session.getActiveUser().getEmail();
  ctx.alerts.add({ severity: 'INFO', type: 'DELETED', status: 'AUTO-FIXED', code: code, binome: b ? b.code : '', key: '',
    msg: code + ' (' + name + ') deleted by ' + by + (kept.length ? ', but ' + kept.join('; ') : '') + '. The code is not handed out again.' });
  logIvChange_(ctx, code, 'Deleted', b ? b.code : '', '');
  return code + ' (' + name + ') deleted' + (kept.length ? ', but ' + kept.join('; ') : ' everywhere') + '.';
}

/** One row in the Interviewee Changes tab (created on first write) for Change history. A failed write never undoes the change. */
function logIvChange_(ctx, code, what, from, to) {
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(TAB.IV_CHANGES);
    if (!sh) {
      sh = ss.insertSheet(TAB.IV_CHANGES);
      sh.getRange(1, 1, 1, IC_H.length).setValues([IC_H]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
    sh.appendRow([ctx.now, Session.getActiveUser().getEmail(), String(code), what, String(from), String(to)].map(plain_));
  } catch (e) { console.warn('Interviewee Changes not written: ' + e.message); }
}

/** code's Interview Answers row goes along to the new binome's sheet, as its gold cells do: written there first, then removed from
 *  the old tab (under the members' lock, as a row deletion in their sheet). */
function moveAnswers_(ctx, from, to, code) {
  const a = binomeSheet_(ctx, from), tab = a ? a.getParent().getSheetByName(IA_TAB) : null;
  if (!tab) return;
  withMemberLock_(from, () => {
    const src = answersRow_(tab, code);
    if (!src) return;
    const dest = answersTab_(binomeSheet_(ctx, to).getParent(), true), have = answersRow_(dest, code);
    dest.getRange(have ? have.row : dest.getLastRow() + 1, 1, 1, IA_H.length).setValues([answersCells_(src.v.slice(0, 6), src.v.slice(6))]);
    tab.deleteRow(src.row);
  });
}

function resolveSelectedAlerts() {
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== TAB.ALERTS) return say_('Select one or more rows in the "Alerts" tab first.');
  const rows = [];
  sh.getActiveRangeList().getRanges().forEach(rg => { for (let r = Math.max(2, rg.getRow()); r <= rg.getLastRow(); r++) rows.push(r); });
  toast_(resolveAlertRows_(sh, rows) + ' alert(s) marked resolved');
}

/** Web: resolve alerts by ID (e.g. "A-0012"). */
function resolveAlertsById_(ids) {
  const sh = ss_().getSheetByName(TAB.ALERTS);
  const want = {}; (ids || []).forEach(id => { want[String(id).trim()] = true; });
  const rows = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach((r, i) => { if (want[String(r[0]).trim()]) rows.push(i + 2); });
  return resolveAlertRows_(sh, rows);
}

function resolveAlertRows_(sh, rows) {
  const I = idx_(ALERT_H);
  let n = 0;
  rows.forEach(r => {
    const cell = sh.getRange(r, I.Status + 1);
    if (cell.getValue() === 'OPEN' || cell.getValue() === 'SNOOZED') { cell.setValue('RESOLVED'); sh.getRange(r, I['Resolved At'] + 1).setValue(new Date()); n++; }
  });
  return n;
}

/* ---------- daily digest ---------- */

function sendDailyDigest() {
  const ctx = runCycle_({ kind: 'digest', pull: true, timing: true, tracker: true, wait: 120000, integrity: 200000 }) || loadCtx_();
  const I = ctx.iv.I, A = ctx.alerts.table.I;
  const count = {}; ctx.iv.data.forEach(r => { count[r[I.Status]] = (count[r[I.Status]] || 0) + 1; });
  const open = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN')
    .sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0));
  const yesterday = new Date(ctx.now.getTime() - 24 * 3.6e6);
  const newRegs = ctx.iv.data.filter(r => r[I['Registered At']] instanceof Date && r[I['Registered At']] > yesterday).length;
  const newInts = ctx.iv.data.filter(r => r[I['Interview Submitted At']] instanceof Date && r[I['Interview Submitted At']] > yesterday).length;
  const perBinome = {}; open.forEach(r => { if (r[A.Binome]) perBinome[r[A.Binome]] = (perBinome[r[A.Binome]] || 0) + 1; });
  const lag = Object.keys(perBinome).sort((a, b) => perBinome[b] - perBinome[a]).slice(0, 8);
  const statuses = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED, ST.WITHDRAWN, ST.UNASSIGNED, ST.HELD, ST.DECLINED, ST.DUPLICATE]
    .map(s => [s.charAt(0) + s.slice(1).toLowerCase(), count[s] || 0]);
  const html = mailHtml_({ title: 'Daily digest · ' + fmt_(ctx.now, 'EEE dd/MM'),
    blocks: [mailH_('Last 24h'), mailStats_([['New registrations', newRegs], ['Interviews submitted', newInts]]),
      mailH_('Interviewees'), mailStats_(statuses)]
      .concat(lag.length ? [mailP_('**Binomes with the most open alerts:** ' + lag.map(b => b + ' (' + perBinome[b] + ')').join(', '))] : [])
      .concat(mailH_('Open alerts (' + open.length + ')'))
      .concat(open.length ? [mailAlerts_(open.slice(0, 60).map(r => [r[A.Severity], r[A.ID], r[A.Type], r[A.Binome], r[A.Message]]))]
        .concat(open.length > 60 ? [mailP_('…and ' + (open.length - 60) + ' more.')] : []) : [mailP_('Nothing open 🎉')]),
    cta: { label: 'Open the master sheet', url: ss_().getUrl() }, footer: mailTeamFooter_() });
  _mailsSent = 0; // the cycle line above was logged before these mails: count them in their own line
  adminEmails_().forEach(e => mail_(e, '[VIC Recruitment] Daily digest: ' + open.length + ' open alert' + (open.length === 1 ? '' : 's'), html));
  console.log(JSON.stringify({ at: 'digest', mailsSent: _mailsSent }));
}
