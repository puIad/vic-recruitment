/* ---------- team & binomes ---------- */

function titleCase_(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
}

function sectionToPair_(section) {
  const t = normText(section);
  if (t.indexOf('committ') >= 0) return { dep: 'Committee Board', pairAs: 'ALL' };
  if (t.indexOf('council') >= 0) return { dep: 'Council Board', pairAs: 'HR' };
  const d = normDept(section);
  return { dep: d || String(section).trim(), pairAs: d || 'SKIP' };
}

/** Pick the sheet that looks like a team database (has "First Name" + an email column in row 1). */
function findTeamSource_(ss) {
  const sheets = ss.getSheets().filter(sh => [TAB.TEAM, TAB.BINOMES, TAB.IV, TAB.REG_RESP, TAB.INT_RESP].indexOf(sh.getName()) < 0);
  const looks = sh => {
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 3) return false;
    const h = sh.getRange(1, 1, 1, Math.min(sh.getLastColumn(), 12)).getValues()[0].map(normText);
    return h.some(x => x.indexOf('first name') >= 0) && h.some(x => x.indexOf('mail') >= 0);
  };
  const named = sheets.filter(sh => /\b(ot|team|database|membres?)\b/i.test(sh.getName()) && looks(sh))[0];
  return named || sheets.filter(looks)[0] || null;
}

/** true if the email's local part plausibly belongs to that name (catches copy/paste mix-ups). */
function emailMatchesName_(email, name) {
  return !nameTokens(name).length || emailNameHits(email, name) >= 1;
}

function importTeam() {
  const ui = SpreadsheetApp.getUi();
  const local = findTeamSource_(ss_());
  const resp = ui.prompt('Import organizing team',
    'Paste the link of a team sheet laid out like "RECRUITMENT 2025 DATABASE"\n' +
    '(column A = section: Committee Board, Council Board, FLER, COMM, HR, IT; then First Name, Last Name, Email).\n\n' +
    'Leave empty to use ' + (local ? 'the "' + local.getName() + '" tab of this sheet.' : 'the 2025 database.'), ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const text = resp.getResponseText().trim();
  const res = importTeamCore_(text, false);
  if (!res.confirm) return;
  const ok = ui.alert('Replace the Team tab?', 'The Team tab already has ' + res.existing + ' members. Replace them with ' + res.incoming + ' imported members?', ui.ButtonSet.YES_NO);
  if (ok === ui.Button.YES) importTeamCore_(text, true);
}

/** Import without dialogs. If the Team tab has members and replace is false, writes nothing and returns {confirm:true,…}. */
function importTeamCore_(text, replace) {
  text = String(text || '').trim();
  const local = findTeamSource_(ss_());
  let src;
  if (!text && local) src = local;
  else {
    let id = text || CONFIG.TEAM_DB_DEFAULT_ID;
    const m = id.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m) id = m[1];
    const ext = SpreadsheetApp.openById(id);
    src = findTeamSource_(ext) || ext.getSheets()[0];
  }
  const rows = teamRowsFrom_(src.getDataRange().getValues());
  const sh = ss_().getSheetByName(TAB.TEAM);
  const used = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().filter(r => String(r[0]).trim() || String(r[1]).trim()).length : 0;
  if (used && !replace) return { confirm: true, existing: used, incoming: rows.length, source: src.getName() };
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TEAM_H.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, TEAM_H.length).setValues(rows);
  const count = {}; rows.forEach(r => { count[r[3]] = (count[r[3]] || 0) + 1; });
  const issues = rows.filter(r => r[5]).map(r => '• ' + r[0] + ': ' + r[5]);
  say_('Imported ' + rows.length + ' members from "' + src.getName() + '".\nPair As: ' + Object.keys(count).map(k => k + ' ' + count[k]).join(' · ') +
    (issues.length ? '\n\nPlease check these rows (see the Notes column):\n' + issues.join('\n') : '') +
    '\n\nReview "Pair As" (HR side / IT, COMM, FLER side / ALL = board lead / SKIP), tick "Exclude" for anyone not interviewing, then draft the binomes.');
  return { done: true };
}

/** Team rows [name, email, dept, pairAs, exclude, notes] from a 2025-style database. */
function teamRowsFrom_(vals) {
  const hdr = vals[0].map(normText);
  const col = (re, d) => { const i = hdr.findIndex(h => re.test(h)); return i >= 0 ? i : d; };
  const cF = col(/first name/, 1), cL = col(/last name|family name/, 2), cE = col(/mail/, 3);
  let section = '';
  const rows = [], seen = {};
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][0]).trim()) section = String(vals[r][0]).trim();
    const email = String(vals[r][cE] || '').trim().toLowerCase();
    const name = titleCase_((String(vals[r][cF] || '').trim() + ' ' + String(vals[r][cL] || '').trim()).trim());
    if (!email && !name) continue;
    const p = sectionToPair_(section);
    const notes = [];
    if (!email) notes.push('Missing email: will not be paired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) notes.push('Invalid email');
    else if (!emailMatchesName_(email, name)) notes.push('Email does not look like this person\'s (' + email + ')');
    if (email && seen[email]) notes.push('Same email as ' + seen[email]);
    if (email) seen[email] = name;
    rows.push([name, email, p.dep, p.pairAs, false, notes.join('; ')]);
  }
  return rows;
}

/** Team tab as [{name, email, pairAs, exclude}]; an empty Pair As falls back to the department. */
function teamMembers_(ctx) {
  const T = ctx.team.I;
  return ctx.team.data.filter(r => String(r[T.Email]).trim()).map(r => {
    let pairAs = String(r[T['Pair As']]).trim().toUpperCase();
    if (!pairAs) pairAs = sectionToPair_(r[T.Department]).pairAs;
    return { name: String(r[T['Full Name']]).trim(), email: String(r[T.Email]).trim().toLowerCase(), pairAs: pairAs, exclude: bool_(r[T.Exclude]) };
  });
}

function draftBinomes() {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    // Once binomes are locked nobody is auto-paired again: free members show up as UNPAIRED_MEMBER alerts for the admins.
    if (activeOrPaused_(ctx).length) return { refused: true };
    const B = ctx.bin.I;
    const members = teamMembers_(ctx).filter(m => !m.exclude && m.pairAs !== 'SKIP');
    const pairs = draftPairs(members, Math.random);
    const kept = ctx.bin.data.filter(r => String(r[B.Status]).toUpperCase() !== 'DRAFT' && String(r[B.Binome]).trim());
    let max = 0; kept.forEach(r => { const n = codeNum(r[B.Binome]); if (n > max) max = n; });
    const fresh = pairs.map((p, i) => {
      const row = new Array(BIN_H.length).fill('');
      row[B.Binome] = 'B.' + pad2(max + i + 1);
      row[B['Member 1']] = p.a.name; row[B['Email 1']] = p.a.email;
      row[B['Member 2']] = p.b ? p.b.name : ''; row[B['Email 2']] = p.b ? p.b.email : '';
      row[B.Tag] = p.tag; row[B.Status] = 'DRAFT';
      return { row: row, warning: p.warning };
    });
    const sh = ctx.bin.sh;
    if (sh.getLastRow() > 1) { sh.getRange(2, 1, sh.getLastRow() - 1, BIN_H.length).clearContent(); sh.getRange(2, 1, sh.getLastRow(), 1).clearNote().setBackground(null); }
    const all = kept.concat(fresh.map(f => f.row));
    if (all.length) sh.getRange(2, 1, all.length, BIN_H.length).setValues(all);
    fresh.forEach((f, i) => { if (f.warning) sh.getRange(kept.length + 2 + i, 1).setNote('⚠️ ' + f.warning).setBackground('#fce5cd'); else sh.getRange(kept.length + 2 + i, 1).setBackground(null); });
    const tags = {}; fresh.forEach(f => { tags[f.row[B.Tag]] = (tags[f.row[B.Tag]] || 0) + 1; });
    return { n: fresh.length, members: members.length, tags: tags, warnings: fresh.filter(f => f.warning).map(f => f.row[B.Binome] + ': ' + f.warning) };
  });
  if (!res) return say_('Another update is already running. Please try again in a minute.');
  if (res.refused) return say_('Binomes are already locked, so new drafts are closed.\n' +
    'Members without a binome appear in Alerts. Use Change members to place them, or exclude them in the Team tab.');
  say_('Drafted ' + res.n + ' binomes from ' + res.members + ' available members.\n' +
    Object.keys(res.tags).map(k => k + ': ' + res.tags[k]).join(' · ') +
    (res.warnings.length ? '\n\nPlease check:\n' + res.warnings.join('\n') : '') +
    '\n\nReview them in the Binomes tab. Draft again for a new random draw, or lock them when you are happy.');
}

function lockBinomes() {
  const ui = SpreadsheetApp.getUi();
  const chk = lockCheck_();
  if (!chk.drafts) return say_('There are no draft binomes to lock. Draft the binomes first.');
  const ok = ui.alert('Lock ' + chk.drafts + ' binomes?',
    'This creates one sheet per binome in "Binome Sheets"' + (chk.share ? ', shares it with both members (they get a Google share email)' : '') +
    ' and starts routing registrants to them.' + (chk.problems.length ? '\n\n⚠️ Problems found:\n' + chk.problems.join('\n') + '\n\nContinue anyway?' : ''), ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  lockBinomesCore_();
}

/** What locking would do: {drafts, share, problems[]}. Writes nothing. */
function lockCheck_() {
  const pre = loadCtx_();
  const B = pre.bin.I;
  const drafts = pre.bin.data.filter(r => String(r[B.Status]).toUpperCase() === 'DRAFT' && String(r[B.Binome]).trim());
  const seen = {}, problems = [];
  pre.bin.data.forEach(r => {
    [r[B['Email 1']], r[B['Email 2']]].forEach(e => {
      e = String(e).trim().toLowerCase(); if (!e) return;
      if (seen[e]) problems.push(e + ' is in both ' + seen[e] + ' and ' + r[B.Binome]); else seen[e] = r[B.Binome];
    });
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !String(r[B['Email 1']]).trim() && !String(r[B['Email 2']]).trim()) problems.push(r[B.Binome] + ' has no email');
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !tagDepts(r[B.Tag]).length) problems.push(r[B.Binome] + ' has an unreadable tag "' + r[B.Tag] + '"');
  });
  return { drafts: drafts.length, share: bool_(S_().SHARE_FILES_WITH_BINOME) && !bool_(S_().TEST_MODE), problems: problems };
}

function lockBinomesCore_(budgetMs) {
  const t0 = Date.now(), budget = Math.max(30000, Math.min(270000, Number(budgetMs) || 270000));
  let created = 0, stopped = false;
  withLock_(() => {
    const ctx = loadCtx_();
    const BI = ctx.bin.I;
    for (let i = 0; i < ctx.bin.data.length; i++) {
      const r = ctx.bin.data[i];
      if (String(r[BI.Status]).toUpperCase() !== 'DRAFT' || !String(r[BI.Binome]).trim()) continue;
      if (Date.now() - t0 > budget) { stopped = true; break; }
      const b = { code: String(r[BI.Binome]).trim(), tag: String(r[BI.Tag]).trim() };
      const members = [[r[BI['Member 1']], r[BI['Email 1']]], [r[BI['Member 2']], r[BI['Email 2']]]]
        .filter(m => String(m[0]).trim() || String(m[1]).trim()).map(m => ({ name: String(m[0]).trim(), email: String(m[1]).trim().toLowerCase() }));
      let file;
      if (r[BI['File ID']]) file = SpreadsheetApp.openById(r[BI['File ID']]);
      else file = createBinomeFile_(b, members);
      r[BI.File] = file.getUrl(); r[BI['File ID']] = file.getId(); r[BI.Status] = 'ACTIVE'; r[BI.Created] = new Date();
      ctx.bin.sh.getRange(i + 2, 1, 1, BIN_H.length).setValues([r]);
      created++;
    }
  }, 60000);
  runCycle_({ kind: 'post-lock', pull: false, timing: false, tracker: true, wait: 60000 }); // the sync after the sheets are created: creating them is not in its total
  say_('Locked ' + created + ' binomes.' + (stopped ? '\n\nPaused before the time limit: lock again to finish the rest.' : '') +
    '\nAny waiting registrants have been assigned.');
}

const RESET_PHRASE = 'I confirm to reset the binomes';
// Open alerts of these types belong to the old binomes (any alert with a Binome does too) and are closed by a reset
const RESET_ALERT_TYPES = ['MANUAL_EDIT', 'INTEGRITY', 'UNPAIRED_MEMBER', 'MEMBER_CHANGED', 'COVER_ADDED', 'REASSIGNED', 'FILE_ERROR'];

/**
 * Start over with a new organizing team (OT). Trashes every binome sheet (Drive keeps them 30 days), empties Binomes, Team
 * and Member Changes, sends every interviewee back to UNASSIGNED (codes and registration data stay; what the binomes had
 * written is cleared), closes the alerts of the old binomes and forgets what the script knew about them. Registrations
 * deleted by hand stay deleted. The phrase is checked here, not only in the dashboard. Returns null when the script is busy.
 */
function resetBinomesCore_(phrase) {
  if (String(phrase || '').trim() !== RESET_PHRASE) throw new Error('Type exactly: ' + RESET_PHRASE);
  return withLock_(() => {
    const ctx = loadCtx_();
    const I = ctx.iv.I, A = ctx.alerts.table.I;
    const failed = [];
    let trashed = 0;
    ctx.binomes.forEach(b => {
      if (!b.fileId) return;
      try { DriveApp.getFileById(b.fileId).setTrashed(true); trashed++; } catch (e) { failed.push(b.code + ': ' + driveErr_(e)); }
    });
    const nBinomes = ctx.binomes.length, nTeam = ctx.team.data.filter(r => String(r[ctx.team.I.Email]).trim()).length;
    [[TAB.BINOMES, BIN_H], [TAB.TEAM, TEAM_H], [TAB.CHANGES, MC_H]].forEach(t => {
      const sh = ss_().getSheetByName(t[0]);
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, t[1].length).clearContent();
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearNote().setBackground(null);
    });
    let nIv = 0;
    ctx.iv.data.forEach(r => {
      if (r[I.Status] === ST.DUPLICATE || !(r[I.Binome] || r[I.Code])) return;
      ['Binome', 'Assigned At', 'Contacted', 'Contacted Seen At', 'Interview Date', 'Interview Time', 'Interview At',
        'Interview Submitted At', 'Interview Log Row', 'Binome Notes'].forEach(h => { r[I[h]] = ''; });
      r[I.Status] = ST.UNASSIGNED;
      nIv++;
    });
    saveTable_(ctx.iv);
    let nAlerts = 0;
    const alerts = ctx.alerts.table;
    alerts.data.forEach((r, i) => {
      if (r[A.Status] !== 'OPEN' || !(r[A.Binome] || RESET_ALERT_TYPES.indexOf(r[A.Type]) >= 0)) return;
      alerts.sh.getRange(i + 2, A.Status + 1).setValue('AUTO-RESOLVED');
      alerts.sh.getRange(i + 2, A['Resolved At'] + 1).setValue(ctx.now);
      nAlerts++;
    });
    // forget the old binomes; registrations deleted on purpose (iv entry 0) stay remembered so they are not re-imported
    const props = PropertiesService.getScriptProperties();
    ['FILE_SEEN', 'FILE_READ', 'INTEG_NEXT'].forEach(k => props.deleteProperty(k));
    const old = loadBaseline_(), fresh = loadCtx_();
    fresh.base = { bin: {}, iv: {} };
    Object.keys((old && old.iv) || {}).forEach(k => { if (old.iv[k] === 0) fresh.base.iv[k] = 0; });
    saveBaseline_(editSnapshot_(fresh));
    buildTracker_(fresh);
    return { trashed: trashed, failed: failed, binomes: nBinomes, team: nTeam, interviewees: nIv, alerts: nAlerts };
  }, 60000);
}

function reshareBinomeFiles() {
  if (bool_(S_().TEST_MODE)) { say_('Test mode is on in Settings, so sheets are not shared. Turn it off for the real launch.'); return; }
  const ctx = loadCtx_();
  let n = 0;
  const failed = [];
  ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
    let f, current;
    try { f = DriveApp.getFileById(b.fileId); current = f.getEditors().map(u => u.getEmail().toLowerCase()); }
    catch (e) { failed.push(b.code + ': ' + driveErr_(e)); return; }
    b.members.forEach(m => { if (m.email && current.indexOf(m.email) < 0) { try { f.addEditor(m.email); n++; } catch (e) { console.warn(e); } } });
  });
  say_('Sharing updated: ' + n + ' new share(s). People removed from a binome keep access until you remove them in Drive.' +
    (failed.length ? '\nNote: ' + failed.length + ' sheet(s) could not be reached:\n' + failed.slice(0, 5).join('\n') : ''));
}
