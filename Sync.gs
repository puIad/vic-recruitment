/* ---------- 3) read what binomes wrote ---------- */

// Drive can take minutes to bump a sheet's "last updated" time, so a sheet it calls unchanged is still re-read once it
// has not been read for REREAD_MINUTES; at most REREAD_MAX of those per run, the longest unread first.
const REREAD_MINUTES = 15, REREAD_MAX = 3, UPGRADE_PER_RUN = 6, FORCE_FRESH_S = 60; // ponytail: fixed knobs; move to Settings if a sheet still lags or runs get slow

function pullBinomeFiles_(ctx, force) {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('FILE_SEEN') || '{}'), readAt = JSON.parse(props.getProperty('FILE_READ') || '{}');
  const updated = {};
  try {
    const it = DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID).getFiles();
    while (it.hasNext()) { const f = it.next(); updated[f.getId()] = f.getLastUpdated().getTime(); }
  } catch (e) { console.warn('Folder listing failed: ' + e); }
  const I = ctx.iv.I, F = idx_(BF_H), offset = tzOffset_();
  const files = ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT');
  // dirty:<code> = a member wrote that sheet from the dashboard (memberSet_): read it whatever Drive's "last updated" says
  const cache = CacheService.getScriptCache(), dirty = cache.getAll(files.map(b => 'dirty:' + b.code)), edited = b => !!dirty['dirty:' + b.code];
  // force (Sync now) reads every sheet, except one already read in the last FORCE_FRESH_S that Drive and the dirty marks call
  // unchanged: each read is a Sheets API call, and presses close together ran out of its 60 reads/min per user (a read older
  // than a minute no longer counts against it, so the window where an edit Drive has not reported yet waits is kept to that)
  const fresh = b => ctx.now.getTime() - (readAt[b.fileId] || 0) < FORCE_FRESH_S * 1000;
  const unchanged = b => (!force || fresh(b)) && !edited(b) && updated[b.fileId] && seen[b.fileId] && updated[b.fileId] <= seen[b.fileId];
  const upgrade = {}, reread = {};
  // sheets not yet read in the current layout: opening them rebuilds them (binomeSheet_), a few per run
  files.filter(b => !seen['v2|' + b.fileId]).slice(0, UPGRADE_PER_RUN).forEach(b => { upgrade[b.fileId] = true; });
  files.filter(b => unchanged(b) && ctx.now.getTime() - (readAt[b.fileId] || 0) > REREAD_MINUTES * 60000)
    .sort((a, b) => (readAt[a.fileId] || 0) - (readAt[b.fileId] || 0)).slice(0, REREAD_MAX).forEach(b => { reread[b.fileId] = true; });
  ctx.opened = {}; // binome code -> why its sheet was opened this run (logged by runCycle_)
  const toRead = files.filter(b => !unchanged(b) || upgrade[b.fileId] || reread[b.fileId]);
  let pre = {};
  try { pre = prefetchBinomeFiles_(ctx, toRead); } catch (e) { console.warn('Prefetch failed, opening the sheets one by one: ' + e); }
  toRead.forEach(b => {
    const lu = updated[b.fileId], p = pre[b.fileId];
    // rebuilding a first-layout sheet takes seconds: at most UPGRADE_PER_RUN per run, the rest wait for the next ones
    if (!p && !seen['v2|' + b.fileId] && (ctx.upgraded || 0) >= UPGRADE_PER_RUN) return;
    ctx.opened[b.code] = force ? 'forced' : edited(b) ? 'edited' : upgrade[b.fileId] ? 'upgrade' : reread[b.fileId] ? 'reread' : 'changed';
    const readFrom = p ? p.at : Date.now(); // a prefetched sheet was read as of the fetch: a save after it stays dirty
    let sh = null, vals = [], disp = [];
    if (p) { vals = p.vals; disp = p.disp; } else {
      try { sh = binomeSheet_(ctx, b); } catch (e) {
        ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', binome: b.code, msg: 'Cannot open the file of ' + b.code + ': ' + e, key: 'FILE|' + b.code });
        return;
      }
      const n = bfLastRow_(sh);
      if (n >= 2) { const rng = sh.getRange(2, BF_COL, n - 1, BF_H.length); vals = rng.getValues(); disp = rng.getDisplayValues(); }
    }
    if (vals.length) {
      const read = {};
      vals.forEach((v, k) => {
        const code = String(v[F.Code]).trim();
        const r = ctx.ivByCode[code];
        if (!r || r[I.Binome] !== b.code || read[code]) return; // a code on two rows: the first counts, as for findFileRow_
        read[code] = true;
        const contacted = String(v[F.Contacted]).trim();
        if (contacted && contacted !== 'Not yet' && !r[I['Contacted Seen At']]) r[I['Contacted Seen At']] = ctx.now;
        r[I.Contacted] = contacted;
        const dStr = disp[k][F['Interview Date']].trim(), tStr = disp[k][F['Interview Time']].trim();
        r[I['Interview Date']] = dStr; r[I['Interview Time']] = tStr;
        const at = buildInterviewAt(dStr, tStr, offset);
        r[I['Interview At']] = at === null ? '' : at;
        r[I['Binome Notes']] = String(v[F.Notes]);
        r[I['Interview Done']] = v[F['Interview Done']] === true;
        r[I.Rating] = typeof v[F.Rating] === 'number' ? v[F.Rating] : String(v[F.Rating]).trim();
        r[I['Final Affectation']] = String(v[F['Final Affectation']]).trim();
        r[I.Status] = statusOf_(ctx, r);
      });
    }
    (ctx.readAt = ctx.readAt || {})[b.code] = readFrom; // publishBins_: this sheet is read as of now, whatever the answers read does
    // a dashboard save marks its binome dirty: its interview forms are read too (Sync now reads every sheet's)
    let answers = true;
    if (edited(b) || force) try { syncAnswers_(ctx, b, sh && sh.getParent(), p && p.ia); } catch (e) { answers = false; console.warn('Interview Answers of ' + b.code + ': ' + e); }
    // read: the mark goes, unless a member wrote again after the read started (then the next run reads it again)
    if (edited(b) && answers) { const t = Number(cache.get('dirty:' + b.code) || 0); if (t && t <= readFrom) cache.remove('dirty:' + b.code); }
    seen[b.fileId] = lu || ctx.now.getTime();
    if (p || bfLayout_(sh) === 'v2') seen['v2|' + b.fileId] = 1;
    readAt[b.fileId] = ctx.now.getTime();
  });
  props.setProperties({ FILE_SEEN: JSON.stringify(seen), FILE_READ: JSON.stringify(readAt) });
}

/** The binome sheets of list read in one parallel round of Sheets API calls (opened one by one, 32 sheets took ~36 s):
 *  fileId -> {at (when the fetch started), vals, disp (rows 2+ of the main tab from column BF_COL, as getValues / getDisplayValues), ia (Interview Answers
 *  rows 2+, Submitted At / Edited At as Dates)}. A sheet left out (API error, not the current layout, a rebuild to finish)
 *  is opened the usual way. ctx.pre: what it did, for the cycle line. */
function prefetchBinomeFiles_(ctx, list) {
  const out = {}, t0 = Date.now(), codes = {};
  if (!list.length) return out;
  const fields = 'properties.timeZone,sheets(properties.title,data.rowData.values(effectiveValue,formattedValue))', token = ScriptApp.getOAuthToken();
  const res = UrlFetchApp.fetchAll(list.map(b => ({ url: 'https://sheets.googleapis.com/v4/spreadsheets/' + b.fileId + '?includeGridData=true&fields=' +
    encodeURIComponent(fields), headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true })));
  // cells c..c+w-1 of each row: v as getValues (a date is its serial number), d as getDisplayValues
  const rows = (s, c, w) => ((s.data && s.data[0] && s.data[0].rowData) || []).map(r => {
    const v = [], d = [];
    for (let j = c; j < c + w; j++) {
      const x = (r.values || [])[j] || {}, e = x.effectiveValue || {};
      v.push('numberValue' in e ? e.numberValue : 'boolValue' in e ? e.boolValue : 'stringValue' in e ? e.stringValue : x.formattedValue || '');
      d.push(x.formattedValue || '');
    }
    return { v: v, d: d };
  });
  list.forEach((b, i) => {
    const code = res[i].getResponseCode();
    codes[code] = (codes[code] || 0) + 1;
    if (code !== 200) return;
    const j = JSON.parse(res[i].getContentText()), tabs = j.sheets || [], title = s => s.properties.title;
    if (!tabs.length || tabs.some(s => title(s).slice(-BF_BACKUP.length) === BF_BACKUP)) return;
    const main = rows(tabs[0], BF_COL - 1, BF_H.length);
    if (!main.length || main[0].d.map(x => x.trim()).join('|') !== BF_HEAD.join('|')) return; // not 'v2': binomeSheet_ deals with it
    const tab = tabs.filter(s => title(s) === IA_TAB)[0], tz = j.properties.timeZone;
    out[b.fileId] = { at: t0, vals: main.slice(1).map(r => r.v), disp: main.slice(1).map(r => r.d),
      ia: tab ? rows(tab, 0, IA_H.length).slice(1).map(r => r.v.map((x, c) => (c === 2 || c === 4) && typeof x === 'number' ? serialDate_(x, tz) : x)) : [] };
  });
  ctx.pre = { asked: list.length, read: Object.keys(out).length, http: codes, ms: Date.now() - t0 };
  return out;
}

/** A sheet's date-time serial (days since 30/12/1899, wall time in the sheet's time zone tz) as a Date. */
function serialDate_(x, tz) {
  const wall = Math.round((x - 25569) * 864e5);
  const off = d => { const m = Utilities.formatDate(d, tz, 'XXX').match(/([+-])(\d\d):(\d\d)/); return m ? (m[1] === '-' ? -1 : 1) * (m[2] * 60 + +m[3]) * 6e4 : 0; };
  const d = new Date(wall - off(new Date(wall)));
  return new Date(wall - off(d)); // again from the guess: right across a DST change
}

function statusOf_(ctx, r) {
  const I = ctx.iv.I, c = String(r[I.Contacted]).trim();
  if (isOut_(r[I.Status])) return r[I.Status];
  if (!r[I.Binome]) return r[I.Status] === ST.HELD ? ST.HELD : ST.UNASSIGNED;
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
  if (hasPausedCol_(ctx)) ctx.binomes.filter(b => b.status === 'ACTIVE' && String(b.row[ctx.bin.I['Paused Until']]).trim()).forEach(b => {
    const key = 'PAUSEDATE|' + b.code;
    current[key] = true;
    ctx.alerts.add({ severity: 'INFO', type: 'PAUSE_DATE', code: '', binome: b.code, key: key,
      msg: b.code + ' is ACTIVE but has a date in Paused Until in the Binomes tab: it is ignored. Clear the cell.' });
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

/** The Tracker tab, timed for a dashboard action's line. */
function buildTracker_(ctx) {
  const t0 = Date.now();
  try { return writeTracker_(ctx); } finally { actTime_('tracker', Date.now() - t0); }
}
function writeTracker_(ctx) {
  const sh = ss_().getSheetByName(TAB.TRACKER);
  const I = ctx.iv.I, s = S_();
  const per = {};
  const blank = () => ({ assigned: 0, contacted: 0, scheduled: 0, interviewed: 0, withdrew: 0, notContacted: 0, noDate: 0, overdue: 0, open: 0 });
  activeOrPaused_(ctx).forEach(b => { per[b.code] = blank(); });
  const tot = blank(); let registered = 0, unassigned = 0, dups = 0, held = 0, declined = 0;
  const byDep = {}; DEPTS.forEach(d => { byDep[d] = 0; });
  ctx.iv.data.forEach(r => {
    const st = r[I.Status];
    if (st === ST.DUPLICATE) { dups++; return; }
    if (st === ST.DECLINED) { declined++; return; }
    registered++;
    if (byDep[r[I['1st Choice']]] !== undefined) byDep[r[I['1st Choice']]]++;
    if (st === ST.UNASSIGNED) { unassigned++; return; }
    if (st === ST.HELD) { held++; return; }
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
    ['VIC Recruitment 2026 — live tracker', '', 'Last change: ' + fmt_(ctx.now)],
    ['Registered', registered, 'IT ' + byDep.IT + ' · COMM ' + byDep.COMM + ' · FLER ' + byDep.FLER + ' · HR ' + byDep.HR],
    ['Contacted', tot.contacted, 'Scheduled ' + tot.scheduled + ' · Interviewed ' + tot.interviewed + ' · Withdrew ' + tot.withdrew],
    ['Waiting for a binome', unassigned, 'Duplicates ignored: ' + dups + (held || declined ? ' · On hold: ' + held + ' · Declined: ' + declined : '')],
    ['Open alerts', openAlerts.length, 'HIGH ' + openAlerts.filter(r => r[A.Severity] === 'HIGH').length + ' · MEDIUM ' + openAlerts.filter(r => r[A.Severity] === 'MEDIUM').length],
  ];
  const top = summary.length + 2;
  // the tab as it would be written (summary, a blank row, the head, the rows): already there → no write, no formatting.
  // only the label of "Last change" (C1) is compared, not its time, so it moves only when something else does.
  const grid = summary.map(r => r.concat(head.slice(3).map(() => ''))).concat([head.map(() => ''), head], rows);
  if (sh.getLastRow() === grid.length && sh.getLastColumn() === head.length &&
    sh.getRange(1, 1, grid.length, head.length).getValues().every((r, i) => r.every((v, j) =>
      i === 0 && j === 2 ? String(v).indexOf('Last change: ') === 0 : sameCell_(grid[i][j], v)))) return;
  sh.clear();
  sh.getRange(1, 1, top + Math.max(rows.length, 1), head.length).setFontFamily(THEME.font).setFontColor(THEME.ink).setVerticalAlignment('middle');
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, summary.length, 3).setValues(summary);
  sh.getRange(1, 1, 1, head.length).setBackground(THEME.head).setFontColor(THEME.headInk);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.getRange(2, 1, summary.length - 1, 1).setFontWeight('bold').setFontColor(THEME.head);
  sh.getRange(2, 2, summary.length - 1, 1).setFontWeight('bold').setFontSize(13).setHorizontalAlignment('left');
  sh.getRange(top, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground(THEME.head).setFontColor(THEME.headInk)
    .setWrap(true).setHorizontalAlignment('center');
  if (rows.length) {
    sh.getRange(top + 1, 1, rows.length, head.length).setValues(rows);
    const houses = rows.map(r => houseOf_(r[2]));
    sh.getRange(top + 1, 1, rows.length, 1).setBackgrounds(houses.map(h => [h.main])).setFontColors(houses.map(h => [h.accent])).setFontWeight('bold');
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
    const mail = mailFrom_('NEW_IV', { names: b.members.map(m => m.name.split(' ')[0]).join(' & '), binome: code, n: list.length, s: list.length > 1 ? 's' : '',
      hours: S_().HOURS_NOT_CONTACTED }, {
      blocks: [mailList_(list.map(r => [r[I.Code], r[I['First Name']] + ' ' + r[I['Family Name']] + ' · ' +
        String(r[I.Phone]).replace(/^'/, '') + ' · available: ' + r[I.Availability]]))],
      cta: mailDashboardCta_(), footer: mailTeamFooter_(b.fileUrl) });
    b.members.forEach(m => { if (m.email) mailSend_(m.email, mail); });
  });
  ctx.mailNew = {};
}

/* ---------- the main cycle ---------- */

function runCycle_(opts) {
  const t0 = Date.now(); // the integrity budget counts from here, so the wait for the lock is included
  const T = { total: 0, lockWait: 0, load: 0, edits: 0, regs: 0, forms: 0, pull: 0, statuses: 0, timing: 0, integrity: 0, save: 0, base: 0, drops: 0, alerts: 0, mails: 0, tracker: 0, snap: 0 };
  let ctx = null, loaded = null, outcome = 'error'; // 'error' stays if fn throws; loaded = the context so far, for the line of a failed run
  try { ctx = withLock_(() => {
    let last = Date.now();
    const lap = k => { const n = Date.now(); T[k] += n - last; last = n; }; // ms since the previous lap
    _mailsSent = 0;
    _snapT = {};
    _settings = null;
    const ctx = loaded = loadCtx_(); lap('load');
    detectEdits_(ctx); lap('edits');
    if (opts.timing) resumeDue_(ctx); // before the assignment: a binome back today can get today's registrants
    processRegistrations_(ctx);
    screenWaiting_(ctx); // before the assignment: a VIC member waiting for a binome is declined, not placed
    // placing gets 90 s, and ends 3 min after the call started (a long lock wait included): the writes after it need the rest
    assignUnassigned_(ctx, opts.assignBy !== undefined ? opts.assignBy : Math.min(Date.now() + 90000, t0 + 180000)); lap('regs');
    processInterviews_(ctx); lap('forms');
    if (opts.pull) pullBinomeFiles_(ctx, opts.force); lap('pull');
    ctx.iv.data.forEach(r => { if (r[ctx.iv.I.Code]) r[ctx.iv.I.Status] = statusOf_(ctx, r); });
    endFinishedCovers_(ctx); stampConfirmations_(ctx); lap('statuses');
    if (opts.timing) { timingAlerts_(ctx); oddValues_(ctx); } lap('timing');
    if (opts.integrity) ctx.integrityMsg = integrityCheck_(ctx, t0 + opts.integrity); lap('integrity');
    // the dashboard forms' Master copy last: one saved before its log row would never be logged
    saveTable_(ctx.iv); appendLog_(ctx); if (ctx.dash) saveTable_(ctx.dash); lap('save');
    commitBase_(ctx); lap('base'); // before the mails: if they fail, the tabs and the baseline still agree
    if (opts.timing) try { dropsSync_(ctx); } catch (e) { console.warn('Drops: ' + e); } lap('drops'); // dropped dashboard changes: emails and DROPPED| alerts (Pending.gs); never fails the sync
    if (opts.watch) watchdogAlert_(ctx);
    ctx.alerts.flush(); lap('alerts');
    sendNewIntervieweeMails_(ctx); sendConfirmations_(ctx); sendBinomeStatusMails_(ctx); lap('mails');
    if (opts.tracker) buildTracker_(ctx); lap('tracker');
    saveMemberMap_(ctx); // covers ended above, hand edits of the Binomes tab
    // the dashboard's snapshot; a failure must not fail the sync, and must not leave a snapshot that misses this run
    try { publishState_(ctx); } catch (e) { console.warn('Snapshot not published: ' + e); dropSnap_(); } lap('snap');
    return ctx;
  }, opts.wait || 30000); outcome = ctx ? 'ok' : 'busy'; } finally {
    console.log(JSON.stringify(Object.assign({ at: 'cycle', kind: opts.kind || 'other', outcome: outcome }, T,
      { total: Date.now() - t0, lockWait: _lockWait, opened: (loaded && loaded.opened) || {}, pre: (loaded && loaded.pre) || null, snapT: _snapT, mailsSent: _mailsSent })));
  }
  return ctx;
}

/** Trigger: any form linked to the master was submitted. */
function onFormSubmitHandler(e) { runCycle_({ kind: 'form', pull: false, timing: false, tracker: true, wait: 120000 }); }

/** Trigger: every N minutes. */
function syncAll() {
  runCycle_({ kind: 'trigger', pull: true, timing: true, tracker: true, watch: true });
  // past runCycle_ = ok or busy; a cycle that throws leaves the stamp behind, so it counts as stopped
  PropertiesService.getScriptProperties().setProperty('SYNC_STAMP', String(Date.now()));
}
function syncAllForce() { const c = runCycle_({ kind: 'sync-now', pull: true, force: true, timing: true, tracker: true }); toast_(c ? 'Everything is up to date.' : 'Busy, try again in a minute.'); }
/** Menu: a sync plus the full check of every binome sheet. Budgets leave ~2 min of the 6-min limit for the writes after the check. */
function integrityCheck() { const c = runCycle_({ kind: 'integrity', pull: true, timing: true, tracker: true, integrity: 200000 }); say_(c ? c.integrityMsg : 'Busy, try again in a minute.'); }

/* ---------- the sync watch (docs/admin-features.md, When the timed sync stops) ---------- */

const WATCHDOG_STALE_MS = 3 * 3.6e6;
const projectUrl_ = () => 'https://script.google.com/home/projects/' + ScriptApp.getScriptId() + '/edit';
const REAUTH_STEPS = 'open the project on script.google.com, pick reauthorize in the function list, press Run, tick every box.';

/** How long without a SYNC_STAMP means the timed sync has stopped. frontend/src/lib/vic/sync-watch.ts holds the same rule. */
function syncStaleMs_() { return Math.max(3 * num_(S_().SYNC_EVERY_MINUTES, 15), 15) * 60000; }

/** Run from the function list by whoever has to re-authorize: running anything shows the consent screen, and this changes nothing. */
function reauthorize() { console.log('Authorized as ' + Session.getEffectiveUser().getEmail()); }

/** Timed sync only: the watchdog stamps its runs, and a watchdog that stopped can't report itself. No stamp = not installed yet. */
function watchdogAlert_(ctx) {
  const ran = Number(PropertiesService.getScriptProperties().getProperty('WATCHDOG_STAMP')), KI = ctx.alerts.table.I;
  if (!ran) return;
  if (ctx.now.getTime() - ran < WATCHDOG_STALE_MS) { ctx.alerts.resolveWhere(r => r[KI.Key] === 'WATCHDOG'); return; }
  ctx.alerts.add({ severity: 'MEDIUM', type: 'WATCHDOG_STOPPED', code: '', binome: '', key: 'WATCHDOG',
    msg: 'The sync watchdog has not run since ' + fmt_(new Date(ran), 'dd/MM HH:mm') + ', so a stopped sync would mail nobody. The Master\'s owner re-authorizes it from their own account: ' + REAUTH_STEPS });
}

/** The mailer runs as vic.rh, so the lost grant this watches for can take it down too. The one mail allowed to send as the account running it: the Master's owner, on the watchdog's trigger. */
function watchdogOwnMail_(to, subject, html) {
  try { MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'VIC Recruitment Bot' }); return true; } catch (e) { console.error('Watchdog mail to ' + to + ' failed: ' + e); return false; }
}

/** The stop or recovery mail, to the Master's owner and vic.rh: through the mailer, else on the owner's grant (never one TEST_MODE held). True when it reached at least one of them. */
function watchdogMail_(stopped, stamp) {
  const since = fmt_(new Date(stamp), 'dd/MM HH:mm'), title = stopped ? 'The timed sync has stopped' : 'The timed sync is back';
  const html = mailHtml_({ title: title, blocks: stopped ? [
    mailP_('The timed sync has not finished a cycle since ' + since + '. New registrations and binome edits wait until someone presses Sync now, and the digest won\'t go out.'),
    mailP_('**vic.rh:** ' + REAUTH_STEPS + ' If it has still not finished a cycle after the next interval, run Setup from the Master\'s menu.'),
  ] : [mailP_('The timed sync finished a cycle at ' + since + '. Nothing more to do.')],
    cta: stopped ? { label: 'Open the project', url: projectUrl_() } : { label: 'Open the dashboard', url: DASHBOARD_URL },
    footer: mailTeamFooter_() });
  const owner = lc_(ss_().getOwner().getEmail()), rh = lc_(PropertiesService.getScriptProperties().getProperty('TRIGGER_OWNER') || '');
  const subject = '[VIC Recruitment] ' + title;
  return [owner, rh].filter((e, i, all) => e && all.indexOf(e) === i).map(e => mail_(e, subject, html) || (!mailHeld_(e) && watchdogOwnMail_(e, subject, html))).some(Boolean);
}

/** Trigger on the Master owner's account (installWatchdog), so a lost vic.rh grant doesn't stop it. A mail that reached nobody is retried at the next run. */
function syncWatchdog() {
  const props = PropertiesService.getScriptProperties(), stamp = Number(props.getProperty('SYNC_STAMP'));
  if (stamp) {
    const stopped = Date.now() - stamp >= syncStaleMs_();
    if (stopped !== !!props.getProperty('WATCHDOG_TOLD') && watchdogMail_(stopped, stamp)) {
      if (stopped) props.setProperty('WATCHDOG_TOLD', '1'); else props.deleteProperty('WATCHDOG_TOLD');
      console.log(JSON.stringify({ at: 'watchdog', stopped: stopped, stamp: stamp }));
    }
  }
  props.setProperty('WATCHDOG_STAMP', String(Date.now())); // last: a run that throws doesn't count, and the 3 h alert fires
}
