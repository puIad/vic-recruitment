/******************************************************************************
 * VIC RECRUITMENT 2026 — web dashboard
 * -----------------------------------------------------------------------------
 * Deployed (appsscript.json) as: Execute as the user accessing the web app ·
 * Who has access: anyone in the domain. Google asks each visitor for permission
 * once, then everything runs with *their* Drive access: an account that can edit
 * the Master sheet gets the dashboard, any other account gets NoAccess.html
 * with a switch-account button. One deployment serves every admin.
 ******************************************************************************/

function doGet() {
  const a = access_();
  if (!a.ok) {
    const t = HtmlService.createTemplateFromFile('NoAccess');
    t.email = a.email; t.reason = a.reason; t.switchUrl = switchUrl_(); t.appUrl = appUrl_();
    return t.evaluate()
      .setTitle('VIC Recruitment · no access')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('VIC Recruitment 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function appUrl_() { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } }
/** Google's account picker, coming back to this web app with the chosen account. */
function switchUrl_() { return 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(appUrl_()); }

/** Bumped when webAccess/webState/webRun change shape; the Vercel front (frontend/src/lib/vic/types.ts) checks it. */
const API_VERSION = 2;
const DOMAIN = 'g.enp.edu.dz';

/**
 * Can the signed-in account edit the Master? {ok, email, reason, owner}. The script runs as that account,
 * so opening the sheet is the real test: DOMAIN = not an @g.enp.edu.dz account, NO_PROJECT = can't open it,
 * READ_ONLY = can open, can't edit. owner = this account owns the Master (only the owner may run Setup).
 */
function access_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { ok: false, email: '', reason: 'NO_EMAIL', owner: false };
  if (email.split('@')[1] !== DOMAIN) return { ok: false, email: email, reason: 'DOMAIN', owner: false };
  let ss = null;
  try { ss = ss_(); } catch (e) { /* this account can't open the Master */ }
  if (!ss) return { ok: false, email: email, reason: 'NO_PROJECT', owner: false };
  try {
    const owner = ss.getOwner();
    const ownerEmail = owner ? String(owner.getEmail()).toLowerCase() : '';
    const editors = ss.getEditors().map(u => String(u.getEmail()).toLowerCase()).concat(ownerEmail ? [ownerEmail] : []);
    if (editors.indexOf(email) >= 0) return { ok: true, email: email, owner: email === ownerEmail };
  } catch (e) { /* viewers can't list the editors */ }
  // The bound script hands back its Master even to an account with no access at all: ask Drive whether it can see it.
  try { DriveApp.getFileById(ss.getId()); } catch (e) { return { ok: false, email: email, reason: 'NO_PROJECT', owner: false }; }
  return { ok: false, email: email, reason: 'READ_ONLY', owner: false };
}
function isAdmin_() { return access_().ok; }

/** First call of the Vercel front: never throws, so it can show the no-access view. */
function webAccess() {
  const a = access_();
  return { ok: a.ok, email: a.email, reason: a.reason || '', owner: !!a.owner, v: API_VERSION };
}

/** Cheap change detector for the dashboard's live refresh: when the Master was last edited (by anyone, the script included). */
function webPulse() {
  return DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
}

/** Everything the dashboard shows, read-only. Dates are pre-formatted (google.script.run can't return Date). */
function webState() {
  const a = access_();
  if (!a.ok) throw new Error('Not allowed');
  _settings = null;
  const s = S_();
  const ctx = loadCtx_();
  const I = ctx.iv.I, A = ctx.alerts.table.I, T = ctx.team.I;

  const byStatus = {}; Object.keys(ST).forEach(k => { byStatus[ST[k]] = 0; });
  const byDep = {}; DEPTS.forEach(d => { byDep[d] = 0; });
  const perBin = {};
  ctx.iv.data.forEach(r => {
    if (!r[I.Code] && !r[I['Response Key']]) return;
    byStatus[r[I.Status]] = (byStatus[r[I.Status]] || 0) + 1;
    if (r[I.Status] === ST.DUPLICATE) return;
    if (byDep[r[I['1st Choice']]] !== undefined) byDep[r[I['1st Choice']]]++;
    const p = r[I.Binome] && (perBin[r[I.Binome]] = perBin[r[I.Binome]] || { assigned: 0, interviewed: 0, withdrew: 0, open: 0 });
    if (!p) return;
    p.assigned++;
    if (r[I.Status] === ST.INTERVIEWED) p.interviewed++;
    if (r[I.Status] === ST.WITHDRAWN) p.withdrew++;
  });

  const open = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN');
  const base = open.some(r => r[A.Type] === 'MANUAL_EDIT') ? loadBaseline_() : null;
  open.forEach(r => { if (perBin[r[A.Binome]]) perBin[r[A.Binome]].open++; });
  const alertCounts = { HIGH: 0, MEDIUM: 0, INFO: 0 };
  open.forEach(r => { alertCounts[r[A.Severity]] = (alertCounts[r[A.Severity]] || 0) + 1; });

  const formUrl = id => { try { return FormApp.openById(id).getPublishedUrl(); } catch (e) { return ''; } };
  const teamSrc = findTeamSource_(ss_());

  return {
    user: Session.getActiveUser().getEmail(),
    owner: a.owner, v: API_VERSION,
    switchUrl: switchUrl_(),
    updated: fmt_(ctx.now, 'dd/MM/yyyy HH:mm'),
    links: {
      master: ss_().getUrl(),
      registrationForm: formUrl(CONFIG.REGISTRATION_FORM_ID),
      interviewForm: formUrl(CONFIG.INTERVIEW_FORM_ID),
      binomeFolder: 'https://drive.google.com/drive/folders/' + CONFIG.BINOME_FOLDER_ID,
    },
    settings: {
      assignmentsOpen: bool_(s.ASSIGNMENTS_OPEN), testMode: bool_(s.TEST_MODE),
      shareFiles: bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE),
      notifyBinome: bool_(s.NOTIFY_BINOME_ON_ALERT), notifyNew: bool_(s.NOTIFY_BINOME_ON_NEW_INTERVIEWEE),
      syncEvery: num_(s.SYNC_EVERY_MINUTES, 15), digestHour: num_(s.DIGEST_HOUR, 8), admins: adminEmails_(),
    },
    settingsAll: SETTINGS_DEFAULTS.map(r => ({ key: r[0], value: s[r[0]], help: r[2], kind: settingKind_(r) })),
    team: {
      total: ctx.team.data.filter(r => String(r[T['Full Name']]).trim() || String(r[T.Email]).trim()).length,
      excluded: ctx.team.data.filter(r => bool_(r[T.Exclude])).length,
      issues: ctx.team.data.filter(r => String(r[T.Notes]).trim()).length,
      source: teamSrc ? teamSrc.getName() : '',
    },
    counts: { byStatus: byStatus, byDep: byDep },
    locked: activeOrPaused_(ctx).length > 0,
    unpaired: activeOrPaused_(ctx).length ? unpairedMembers(teamMembers_(ctx), ctx.binomes) : [],
    covers: (ctx.covers || []).map(c => ({ row: c.row, binome: c.binome, name: c.name, email: c.email, outName: c.outName,
      codes: c.codes, live: coverLive_(ctx, c), reason: c.reason })),
    history: historyRows_(),
    teamList: teamMembers_(ctx).filter(m => !m.exclude).map(m => ({ name: m.name, email: m.email, pairAs: m.pairAs })),
    binomes: ctx.binomes.map(b => {
      const p = perBin[b.code] || { assigned: 0, interviewed: 0, withdrew: 0, open: 0 };
      return { code: b.code, tag: b.tag, status: b.status, fileUrl: b.fileUrl, members: b.members.map(m => m.name || m.email),
        people: b.members.map(m => ({ name: m.name, email: m.email })),
        assigned: p.assigned, interviewed: p.interviewed, withdrew: p.withdrew, open: p.open };
    }),
    alertCounts: alertCounts,
    alerts: open.sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0)).slice(0, 300).map(r => ({
      id: String(r[A.ID]), created: fmt_(r[A.Created], 'dd/MM HH:mm'), severity: r[A.Severity], type: r[A.Type],
      code: String(r[A.Interviewee]), binome: String(r[A.Binome]), msg: String(r[A.Message]),
      fix: r[A.Type] === 'MANUAL_EDIT' ? editFixes_(String(r[A.Key]), base) : [] })),
    interviewees: ctx.iv.data.filter(r => r[I.Code]).map(r => ({ code: String(r[I.Code]), binome: String(r[I.Binome]), status: r[I.Status],
      name: (String(r[I['First Name']]) + ' ' + String(r[I['Family Name']])).trim() })),
  };
}

/** The Member Changes tab for the dashboard's Change history, newest first (last 300). A swap is two PERMANENT rows. */
function historyRows_() {
  const C = idx_(MC_H), s = v => String(v == null ? '' : v).trim();
  return loadChanges_().map(r => ({
    at: fmt_(r[C.At], 'dd/MM/yyyy HH:mm'), by: s(r[C.By]), type: s(r[C.Type]), binome: s(r[C.Binome]),
    out: s(r[C['Out Name']]) || s(r[C['Out Email']]), inn: s(r[C['In Name']]) || s(r[C['In Email']]),
    codes: splitCodes_(r[C.Interviewees]), reason: s(r[C.Reason]), status: s(r[C.Status]),
  })).filter(h => h.at || h.binome).reverse().slice(0, 300);
}

const SETTING_ENUMS ={ INSTANT_EMAIL_MIN_SEVERITY: ['HIGH', 'MEDIUM', 'INFO'], BALANCE_BY: ['ACTIVE', 'TOTAL'], SYNC_EVERY_MINUTES: [1, 5, 10, 15, 30] };
/** How the dashboard edits a setting: bool (switch), enum (dropdown), number or text. Types come from the defaults. */
function settingKind_(r) {
  if (SETTING_ENUMS[r[0]]) return { type: 'enum', options: SETTING_ENUMS[r[0]] };
  return { type: typeof r[1] === 'boolean' ? 'bool' : typeof r[1] === 'number' ? 'number' : 'text' };
}

/** Writes changed values into the Settings tab (the single source of truth, still editable in the sheet). */
function saveSettings_(values) {
  const sh = ss_().getSheetByName(TAB.SETTINGS);
  const rows = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]).trim());
  const cur = S_(), changed = [];
  SETTINGS_DEFAULTS.forEach(r => {
    const k = r[0];
    if (!values || !(k in values)) return;
    let v = values[k];
    const kind = settingKind_(r);
    if (kind.type === 'bool') v = bool_(v);
    else if (kind.type === 'number') { v = Number(v); if (String(values[k]).trim() === '' || isNaN(v)) throw new Error(k + ' must be a number'); }
    else { v = String(v).trim(); if (kind.type === 'enum' && kind.options.map(String).indexOf(v) < 0) throw new Error(k + ' must be one of ' + kind.options.join(', ')); if (typeof r[1] === 'number') v = Number(v); }
    if (k === 'ADMIN_EMAIL' && v && !String(v).split(/[,;\s]+/).filter(Boolean).every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new Error('ADMIN_EMAIL: invalid email address');
    if (k === 'DIGEST_HOUR' && (v < 0 || v > 23 || v % 1)) throw new Error('DIGEST_HOUR must be a whole number from 0 to 23');
    if (v === cur[k] || (v === '' && cur[k] === r[1])) return;
    let i = rows.indexOf(k);
    if (i < 0) { sh.appendRow([k, '', r[2]]); rows.push(k); i = rows.length - 1; }
    sh.getRange(i + 2, 2).setValue(v);
    changed.push(k);
  });
  _settings = null;
  if (!changed.length) return 'No changes';
  return 'Saved: ' + changed.join(', ') + (changed.some(k => k === 'SYNC_EVERY_MINUTES' || k === 'DIGEST_HOUR') ? '\nRun Setup (owner) to apply the new sync interval / digest hour.' : '');
}

/** One entry point for every dashboard button. Returns {messages[], result}. args.budgetMs (lock): the Vercel front sends
 *  ~200s so the run ends before its 300s function limit; the old dashboard and the menu keep 270s. */
function webRun(action, args) {
  const a = access_();
  if (!a.ok) throw new Error('Not allowed');
  if (action === 'setup' && !a.owner) throw new Error('Only the owner of the master sheet can run Setup');
  args = args || {};
  _webOut = [];
  try {
    let result = null;
    switch (action) {
      // budgetMs: the full sheet check stops in time to end before the Vercel function limit (300s); the next run carries on
      case 'sync': { const c = runCycle_({ pull: true, force: true, timing: true, tracker: true, integrity: Number(args.budgetMs) || 150000 });
        _webOut.push(c ? 'Full sync done ✅\n' + c.integrityMsg : 'Busy: another run is in progress, try again in a minute.'); break; }
      case 'integrity': { const c = runCycle_({ pull: true, timing: true, tracker: true, integrity: Number(args.budgetMs) || 200000 });
        _webOut.push(c ? c.integrityMsg : 'Busy: another run is in progress, try again in a minute.'); break; }
      case 'editApply': result = editFixCore_('apply', args.ids); break;
      case 'editRevert': result = editFixCore_('revert', args.ids); break;
      case 'editAccept': result = editFixCore_('accept', args.ids); break;
      case 'importTeam': result = importTeamCore_(args.link, !!args.replace); break;
      case 'draft': draftBinomes(); break;
      case 'lockCheck': result = lockCheck_(); break;
      case 'lock': lockBinomesCore_(args.budgetMs); break;
      case 'reshare': reshareBinomeFiles(); break;
      case 'resetBinomes': { result = resetBinomesCore_(args.phrase);
        _webOut.push(!result ? 'Busy: another run is in progress, try again in a minute.' : 'Binomes reset ✅ ' + result.binomes + ' binomes removed, ' + result.trashed + ' sheets trashed, ' +
          result.interviewees + ' interviewees back to Unassigned, Team emptied.\nImport the new team to start again.' +
          (result.failed.length ? '\n⚠️ ' + result.failed.length + ' sheet(s) could not be trashed, delete them in the Binome Sheets folder:\n' + result.failed.slice(0, 5).join('\n') : '')); break; }
      case 'digest': sendDailyDigest(); _webOut.push('Digest sent to ' + (adminEmails_().join(', ') || 'nobody (ADMIN_EMAIL is empty)')); break;
      case 'reassign': reassignCore_(args.code, args.binome); break;
      case 'changeMember': result = changeMemberCore_(args); break;
      case 'swapMembers': result = swapMembersCore_(args); break;
      case 'newBinome': result = newBinomeCore_(args); break;
      case 'addCover': result = addCoverCore_(args); break;
      case 'endCover': result = endCoverCore_(args); break;
      case 'resolve': _webOut.push(resolveAlertsById_(args.ids) + ' alert(s) marked resolved'); break;
      case 'saveSettings': _webOut.push(saveSettings_(args.values)); break;
      case 'setup': setup(); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return { messages: _webOut.slice(), result: result };
  } finally {
    _webOut = null;
  }
}
