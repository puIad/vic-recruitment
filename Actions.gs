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
  const pb = parseBinomeCode(binomeText);
  const msg = withLock_(() => {
    const ctx = loadCtx_();
    const I = ctx.iv.I;
    const r = ctx.ivByCode[code];
    const target = pb && ctx.binByCode[pb.code];
    if (!r) return 'Unknown code ' + code;
    if (!target || target.status === 'DRAFT') return 'Binome "' + binomeText + '" not found or not locked yet.';
    if (r[I.Binome] === target.code) return code + ' is already in ' + target.code;
    const old = ctx.binByCode[r[I.Binome]];
    const carry = old ? removeFromBinomeFile_(ctx, old, code) : {};
    r[I.Binome] = target.code;
    r[I['Assigned At']] = ctx.now;
    appendToBinomeFile_(ctx, target, r, carry);
    r[I.Status] = statusOf_(ctx, r);
    ctx.mailNew[target.code] = [r];
    ctx.alerts.add({ severity: 'INFO', type: 'REASSIGNED', status: 'AUTO-FIXED', code: code, binome: target.code,
      msg: code + ' moved from ' + (old ? old.code : 'nobody') + ' to ' + target.code + ' by ' + Session.getActiveUser().getEmail(), key: '' });
    saveTable_(ctx.iv);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    buildTracker_(ctx);
    return code + ' moved to ' + target.code + ' ✅';
  }, 60000);
  say_(msg || 'Busy, try again in a minute.');
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
    if (cell.getValue() === 'OPEN') { cell.setValue('RESOLVED'); sh.getRange(r, I['Resolved At'] + 1).setValue(new Date()); n++; }
  });
  return n;
}

/* ---------- daily digest ---------- */

function sendDailyDigest() {
  const ctx = runCycle_({ pull: true, timing: true, tracker: true, wait: 120000 }) || loadCtx_();
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
