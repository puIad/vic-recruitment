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
  say_(msg || 'Another update is already running. Please try again in a minute.');
}

/** Move an interviewee to another binome's sheet, carrying Contacted/Date/Notes. The caller saves. Throws the reason it can't. */
function moveInterviewee_(ctx, code, binomeText) {
  const I = ctx.iv.I, r = ctx.ivByCode[code], pb = parseBinomeCode(binomeText), target = pb && ctx.binByCode[pb.code];
  if (!r) throw new Error('Unknown code ' + code);
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
  (ctx.mailNew[target.code] = ctx.mailNew[target.code] || []).push(r);
  indexCtx_(ctx);
  ctx.alerts.add({ severity: 'INFO', type: 'REASSIGNED', status: 'AUTO-FIXED', code: code, binome: target.code,
    msg: code + ' moved from ' + (old ? old.code : 'nobody') + ' to ' + target.code + ' by ' + Session.getActiveUser().getEmail(), key: '' });
  return code + ' moved to ' + target.code;
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
  const ctx = runCycle_({ pull: true, timing: true, tracker: true, wait: 120000, integrity: 200000 }) || loadCtx_();
  const I = ctx.iv.I, A = ctx.alerts.table.I;
  const count = {}; ctx.iv.data.forEach(r => { count[r[I.Status]] = (count[r[I.Status]] || 0) + 1; });
  const open = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN')
    .sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0));
  const yesterday = new Date(ctx.now.getTime() - 24 * 3.6e6);
  const newRegs = ctx.iv.data.filter(r => r[I['Registered At']] instanceof Date && r[I['Registered At']] > yesterday).length;
  const newInts = ctx.iv.data.filter(r => r[I['Interview Submitted At']] instanceof Date && r[I['Interview Submitted At']] > yesterday).length;
  const perBinome = {}; open.forEach(r => { if (r[A.Binome]) perBinome[r[A.Binome]] = (perBinome[r[A.Binome]] || 0) + 1; });
  const lag = Object.keys(perBinome).sort((a, b) => perBinome[b] - perBinome[a]).slice(0, 8);
  const statusLine = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED, ST.WITHDRAWN, ST.UNASSIGNED, ST.DUPLICATE]
    .map(s => s.charAt(0) + s.slice(1).toLowerCase() + ': <b>' + (count[s] || 0) + '</b>').join(' · ');
  const html = '<div style="font-family:Arial;font-size:13px">' +
    '<h3 style="margin:0 0 8px">VIC Recruitment · daily digest (' + fmt_(ctx.now, 'EEE dd/MM') + ')</h3>' +
    '<p>Last 24h: <b>' + newRegs + '</b> new registrations · <b>' + newInts + '</b> interviews submitted</p>' +
    '<p>' + statusLine + '</p>' +
    (lag.length ? '<p><b>Binomes with the most open alerts:</b> ' + lag.map(b => b + ' (' + perBinome[b] + ')').join(', ') + '</p>' : '') +
    '<h4 style="margin:12px 0 4px">Open alerts (' + open.length + ')</h4>' +
    (open.length ? '<table cellpadding="5" style="border-collapse:collapse">' + open.slice(0, 60).map(r =>
      '<tr style="border-bottom:1px solid #ddd"><td>' + esc_(r[A.ID]) + '</td><td><b style="color:' + (r[A.Severity] === 'HIGH' ? '#c62828' : r[A.Severity] === 'MEDIUM' ? '#ef6c00' : '#555') + '">' +
      esc_(r[A.Severity]) + '</b></td><td>' + esc_(r[A.Type]) + '</td><td>' + esc_(r[A.Binome]) + '</td><td>' + esc_(r[A.Message]) + '</td></tr>').join('') +
      '</table>' + (open.length > 60 ? '<p>…and ' + (open.length - 60) + ' more.</p>' : '') : '<p>Nothing open 🎉</p>') +
    '<p><a href="' + ss_().getUrl() + '">Open the master sheet</a></p></div>';
  adminEmails_().forEach(e => mail_(e, '[VIC Recruitment] Daily digest: ' + open.length + ' open alert' + (open.length === 1 ? '' : 's'), html));
}
