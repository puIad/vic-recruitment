/* ---------- 3) read what binomes wrote ---------- */

function pullBinomeFiles_(ctx, force) {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('FILE_SEEN') || '{}');
  const updated = {};
  try {
    const it = DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID).getFiles();
    while (it.hasNext()) { const f = it.next(); updated[f.getId()] = f.getLastUpdated().getTime(); }
  } catch (e) { console.warn('Folder listing failed: ' + e); }
  const I = ctx.iv.I, F = idx_(BF_H), offset = tzOffset_();
  ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
    const lu = updated[b.fileId];
    if (!force && lu && seen[b.fileId] && lu <= seen[b.fileId]) return;
    let sh;
    try { sh = binomeSheet_(ctx, b); } catch (e) {
      ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', binome: b.code, msg: 'Cannot open the file of ' + b.code + ': ' + e, key: 'FILE|' + b.code });
      return;
    }
    const n = sh.getLastRow();
    if (n >= 2) {
      const rng = sh.getRange(2, 1, n - 1, BF_H.length);
      const vals = rng.getValues(), disp = rng.getDisplayValues();
      vals.forEach((v, k) => {
        const code = String(v[F.Code]).trim();
        const r = ctx.ivByCode[code];
        if (!r || r[I.Binome] !== b.code) return;
        const contacted = String(v[F.Contacted]).trim();
        if (contacted && contacted !== 'Not yet' && !r[I['Contacted Seen At']]) r[I['Contacted Seen At']] = ctx.now;
        r[I.Contacted] = contacted;
        const dStr = disp[k][F['Interview Date']].trim(), tStr = disp[k][F['Interview Time']].trim();
        r[I['Interview Date']] = dStr; r[I['Interview Time']] = tStr;
        const at = buildInterviewAt(dStr, tStr, offset);
        r[I['Interview At']] = at === null ? '' : at;
        r[I['Binome Notes']] = String(v[F.Notes]);
        r[I.Status] = statusOf_(ctx, r);
      });
    }
    seen[b.fileId] = lu || ctx.now.getTime();
  });
  props.setProperty('FILE_SEEN', JSON.stringify(seen));
}

function statusOf_(ctx, r) {
  const I = ctx.iv.I, c = String(r[I.Contacted]).trim();
  if (r[I.Status] === ST.DUPLICATE) return ST.DUPLICATE;
  if (!r[I.Binome]) return ST.UNASSIGNED;
  if (r[I['Interview Submitted At']]) return ST.INTERVIEWED;
  if (c === 'Withdrew') return ST.WITHDRAWN;
  if (r[I['Interview At']] instanceof Date) return ST.SCHEDULED;
  if (c === 'Yes' || c === 'No answer') return ST.CONTACTED;
  return ST.ASSIGNED;
}

/* ---------- 4) timing alerts ---------- */

function timingAlerts_(ctx) {
  const s = S_(), I = ctx.iv.I;
  const lim = { contactH: num_(s.HOURS_NOT_CONTACTED, 24), dateH: num_(s.HOURS_NO_INTERVIEW_DATE, 48), afterH: num_(s.HOURS_AFTER_INTERVIEW_NO_FORM, 12) };
  const current = {};
  const noneActive = !activeBinomes_(ctx).length;
  ctx.iv.data.forEach(r => {
    const code = String(r[I.Code]).trim();
    if (r[I.Status] === ST.UNASSIGNED && DEPTS.indexOf(String(r[I['1st Choice']])) >= 0 && bool_(s.ASSIGNMENTS_OPEN)) {
      current[noneActive ? 'NO_BINOME|ALL' : 'NO_BINOME|' + r[I['Response Key']]] = true;
    }
    if (!code || !(r[I['Registered At']] instanceof Date)) return;
    const at = r[I['Interview At']];
    const issues = timingIssues({ code: code, status: r[I.Status], registeredAt: r[I['Registered At']], assignedAt: r[I['Assigned At']], contacted: r[I.Contacted],
      interviewAt: at === '' ? null : at, interviewLabel: fmt_(at), submittedAt: r[I['Interview Submitted At']] }, ctx.now, lim);
    issues.forEach(x => {
      const key = 'TIME|' + x.type + '|' + code;
      current[key] = true;
      ctx.alerts.add({ severity: 'MEDIUM', type: x.type, code: code, binome: r[I.Binome], msg: x.msg + ' (binome ' + r[I.Binome] + ')',
        key: key, notifyBinome: true });
    });
  });
  if (activeOrPaused_(ctx).length) unpairedMembers(teamMembers_(ctx), ctx.binomes).forEach(m => {
    const key = 'UNPAIRED|' + m.email;
    current[key] = true;
    ctx.alerts.add({ severity: 'MEDIUM', type: 'UNPAIRED_MEMBER', code: '', binome: '', key: key,
      msg: m.name + ' (' + m.email + ', Pair As ' + m.pairAs + ') is in no locked binome' +
        (m.draft ? ' (only in DRAFT row ' + m.draft + ': run Lock)' : '') +
        '. Place them in a binome, or tick Exclude in the Team tab if they are not interviewing.' });
  });
  const KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(row => AUTO_RESOLVING.indexOf(row[KI.Type]) >= 0 && !current[row[KI.Key]]);
}

/* ---------- 5) tracker ---------- */

function buildTracker_(ctx) {
  const sh = ss_().getSheetByName(TAB.TRACKER);
  const I = ctx.iv.I, s = S_();
  const per = {};
  const blank = () => ({ assigned: 0, contacted: 0, scheduled: 0, interviewed: 0, withdrew: 0, notContacted: 0, noDate: 0, overdue: 0, open: 0 });
  activeOrPaused_(ctx).forEach(b => { per[b.code] = blank(); });
  const tot = blank(); let registered = 0, unassigned = 0, dups = 0;
  const byDep = {}; DEPTS.forEach(d => { byDep[d] = 0; });
  ctx.iv.data.forEach(r => {
    const st = r[I.Status];
    if (st === ST.DUPLICATE) { dups++; return; }
    registered++;
    if (byDep[r[I['1st Choice']]] !== undefined) byDep[r[I['1st Choice']]]++;
    if (st === ST.UNASSIGNED) { unassigned++; return; }
    const p = per[r[I.Binome]] || (per[r[I.Binome]] = blank());
    [p, tot].forEach(x => {
      x.assigned++;
      if (st === ST.WITHDRAWN) x.withdrew++;
      if ([ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED].indexOf(st) >= 0) x.contacted++;
      if ([ST.SCHEDULED, ST.INTERVIEWED].indexOf(st) >= 0) x.scheduled++;
      if (st === ST.INTERVIEWED) x.interviewed++;
    });
  });
  const A = ctx.alerts.table.I;
  const openAlerts = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN');
  openAlerts.forEach(r => {
    const p = per[r[A.Binome]];
    [p, tot].forEach(x => {
      if (!x) return;
      x.open++;
      if (r[A.Type] === 'NOT_CONTACTED') x.notContacted++;
      if (r[A.Type] === 'NO_DATE') x.noDate++;
      if (r[A.Type] === 'OVERDUE') x.overdue++;
    });
  });
  const head = ['Binome', 'Members', 'Tag', 'Assigned', 'Contacted', 'Scheduled', 'Interviewed', 'Withdrew',
    'Not contacted > ' + s.HOURS_NOT_CONTACTED + 'h', 'No date > ' + s.HOURS_NO_INTERVIEW_DATE + 'h', 'Overdue interview form', 'Open alerts', 'Progress', 'File'];
  const rows = Object.keys(per).sort().map(code => {
    const p = per[code], b = ctx.binByCode[code] || { members: [], tag: '', fileUrl: '' };
    const denom = p.assigned - p.withdrew;
    return [code, b.members.map(m => m.name).join(' & '), b.tag, p.assigned, p.contacted, p.scheduled, p.interviewed, p.withdrew,
      p.notContacted, p.noDate, p.overdue, p.open, denom > 0 ? p.interviewed / denom : '', b.fileUrl];
  });
  const summary = [
    ['VIC Recruitment 2026 — live tracker', '', 'Last update: ' + fmt_(ctx.now)],
    ['Registered', registered, 'IT ' + byDep.IT + ' · COMM ' + byDep.COMM + ' · FLER ' + byDep.FLER + ' · HR ' + byDep.HR],
    ['Contacted', tot.contacted, 'Scheduled ' + tot.scheduled + ' · Interviewed ' + tot.interviewed + ' · Withdrew ' + tot.withdrew],
    ['Waiting for a binome', unassigned, 'Duplicates ignored: ' + dups],
    ['Open alerts', openAlerts.length, 'HIGH ' + openAlerts.filter(r => r[A.Severity] === 'HIGH').length + ' · MEDIUM ' + openAlerts.filter(r => r[A.Severity] === 'MEDIUM').length],
  ];
  sh.clear();
  sh.getRange(1, 1, summary.length, 3).setValues(summary);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1, summary.length - 1, 1).setFontWeight('bold');
  const top = summary.length + 2;
  sh.getRange(top, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
  if (rows.length) {
    sh.getRange(top + 1, 1, rows.length, head.length).setValues(rows);
    sh.getRange(top + 1, 13, rows.length, 1).setNumberFormat('0%');
    const flagCols = sh.getRange(top + 1, 9, rows.length, 4);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#f4cccc').setRanges([flagCols]).build(),
      SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#ffffff').setGradientMaxpoint('#b6d7a8').setRanges([sh.getRange(top + 1, 13, rows.length, 1)]).build(),
    ]);
  }
  sh.setFrozenRows(top);
}

function activeOrPaused_(ctx) { return ctx.binomes.filter(b => b.status === 'ACTIVE' || b.status === 'PAUSED'); }

function sendNewIntervieweeMails_(ctx) {
  if (!bool_(S_().NOTIFY_BINOME_ON_NEW_INTERVIEWEE)) return;
  const I = ctx.iv.I;
  Object.keys(ctx.mailNew).forEach(code => {
    const b = ctx.binByCode[code];
    if (!b) return;
    const list = ctx.mailNew[code];
    const html = '<p>Hi ' + esc_(b.members.map(m => m.name.split(' ')[0]).join(' & ')) + ',</p><p>' + list.length +
      ' new interviewee' + (list.length > 1 ? 's were' : ' was') + ' assigned to your binome <b>' + code + '</b>:</p><ul>' +
      list.map(r => '<li><b>' + esc_(r[I.Code]) + '</b>: ' + esc_(r[I['First Name']] + ' ' + r[I['Family Name']]) + ' · ' +
        esc_(String(r[I.Phone]).replace(/^'/, '')) + ' · available: ' + esc_(r[I.Availability]) + '</li>').join('') +
      '</ul><p>Please contact them within ' + S_().HOURS_NOT_CONTACTED + 'h and fill in <i>Contacted</i>, <i>Interview Date</i> and <i>Interview Time</i> in ' +
      (b.fileUrl ? '<a href="' + b.fileUrl + '">your binome sheet</a>' : 'your binome sheet') +
      '.</p><p>In the interview form, use your binome code <b>' + code + '</b> and the interviewee code.</p>';
    b.members.forEach(m => { if (m.email) mail_(m.email, '[VIC Recruitment] New interviewee(s) for ' + code, html); });
  });
  ctx.mailNew = {};
}

/* ---------- the main cycle ---------- */

function runCycle_(opts) {
  const t0 = Date.now(); // the integrity budget counts from here, so the wait for the lock is included
  return withLock_(() => {
    _settings = null;
    const ctx = loadCtx_();
    detectEdits_(ctx);
    processRegistrations_(ctx);
    assignUnassigned_(ctx);
    processInterviews_(ctx);
    if (opts.pull) pullBinomeFiles_(ctx, opts.force);
    ctx.iv.data.forEach(r => { if (r[ctx.iv.I.Code]) r[ctx.iv.I.Status] = statusOf_(ctx, r); });
    endFinishedCovers_(ctx);
    if (opts.timing) { timingAlerts_(ctx); oddValues_(ctx); }
    if (opts.integrity) ctx.integrityMsg = integrityCheck_(ctx, t0 + opts.integrity);
    saveTable_(ctx.iv);
    commitBase_(ctx); // before the mails: if they fail, the tabs and the baseline still agree
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    if (opts.tracker) buildTracker_(ctx);
    return ctx;
  }, opts.wait || 30000);
}

/** Trigger: any form linked to the master was submitted. */
function onFormSubmitHandler(e) { runCycle_({ pull: false, timing: false, tracker: true, wait: 120000 }); }

/** Trigger: every N minutes. Also available from the menu. */
function syncAll() { runCycle_({ pull: true, timing: true, tracker: true }); }
function syncAllForce() { const c = runCycle_({ pull: true, force: true, timing: true, tracker: true, integrity: 180000 }); toast_(c ? 'Full sync done. ' + c.integrityMsg : 'Busy, try again in a minute.'); }
/** Menu: a sync plus the full check of every binome sheet. Budgets leave ~2 min of the 6-min limit for the writes after the check. */
function integrityCheck() { const c = runCycle_({ pull: true, timing: true, tracker: true, integrity: 200000 }); say_(c ? c.integrityMsg : 'Busy, try again in a minute.'); }
