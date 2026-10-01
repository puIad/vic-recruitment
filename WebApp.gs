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

/**
 * Can the signed-in account edit the Master? {ok, email, reason}. The script runs as that account,
 * so opening the sheet is the real test: NO_PROJECT = can't open it, READ_ONLY = can open, can't edit.
 */
function access_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { ok: false, email: '', reason: 'NO_EMAIL' };
  let ss = null;
  try { ss = ss_(); } catch (e) { /* this account can't open the Master */ }
  if (!ss) return { ok: false, email: email, reason: 'NO_PROJECT' };
  try {
    const owner = ss.getOwner();
    const editors = ss.getEditors().map(u => u.getEmail()).concat(owner ? [owner.getEmail()] : []);
    if (editors.map(e => String(e).toLowerCase()).indexOf(email) >= 0) return { ok: true, email: email };
  } catch (e) { /* viewers can't list the editors */ }
  return { ok: false, email: email, reason: 'READ_ONLY' };
}
function isAdmin_() { return access_().ok; }

/** Everything the dashboard shows, read-only. Dates are pre-formatted (google.script.run can't return Date). */
function webState() {
  if (!isAdmin_()) throw new Error('Not allowed');
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
  open.forEach(r => { if (perBin[r[A.Binome]]) perBin[r[A.Binome]].open++; });
  const alertCounts = { HIGH: 0, MEDIUM: 0, INFO: 0 };
  open.forEach(r => { alertCounts[r[A.Severity]] = (alertCounts[r[A.Severity]] || 0) + 1; });

  const formUrl = id => { try { return FormApp.openById(id).getPublishedUrl(); } catch (e) { return ''; } };
  const teamSrc = findTeamSource_(ss_());

  return {
    user: Session.getActiveUser().getEmail(),
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
    team: {
      total: ctx.team.data.filter(r => String(r[T['Full Name']]).trim() || String(r[T.Email]).trim()).length,
      excluded: ctx.team.data.filter(r => bool_(r[T.Exclude])).length,
      issues: ctx.team.data.filter(r => String(r[T.Notes]).trim()).length,
      source: teamSrc ? teamSrc.getName() : '',
    },
    counts: { byStatus: byStatus, byDep: byDep },
    binomes: ctx.binomes.map(b => {
      const p = perBin[b.code] || { assigned: 0, interviewed: 0, withdrew: 0, open: 0 };
      return { code: b.code, tag: b.tag, status: b.status, fileUrl: b.fileUrl, members: b.members.map(m => m.name || m.email),
        assigned: p.assigned, interviewed: p.interviewed, withdrew: p.withdrew, open: p.open };
    }),
    alertCounts: alertCounts,
    alerts: open.sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0)).slice(0, 300).map(r => ({
      id: String(r[A.ID]), created: fmt_(r[A.Created], 'dd/MM HH:mm'), severity: r[A.Severity], type: r[A.Type],
      code: String(r[A.Interviewee]), binome: String(r[A.Binome]), msg: String(r[A.Message]) })),
    interviewees: ctx.iv.data.filter(r => r[I.Code]).map(r => ({ code: String(r[I.Code]), binome: String(r[I.Binome]), status: r[I.Status],
      name: (String(r[I['First Name']]) + ' ' + String(r[I['Family Name']])).trim() })),
  };
}

/** One entry point for every dashboard button. Returns {messages[], result}. */
function webRun(action, args) {
  if (!isAdmin_()) throw new Error('Not allowed');
  args = args || {};
  _webOut = [];
  try {
    let result = null;
    switch (action) {
      case 'sync': _webOut.push(runCycle_({ pull: true, force: true, timing: true, tracker: true }) ? 'Full sync done ✅' : 'Busy: another run is in progress, try again in a minute.'); break;
      case 'importTeam': result = importTeamCore_(args.link, !!args.replace); break;
      case 'draft': draftBinomes(); break;
      case 'lockCheck': result = lockCheck_(); break;
      case 'lock': lockBinomesCore_(); break;
      case 'reshare': reshareBinomeFiles(); break;
      case 'digest': sendDailyDigest(); _webOut.push('Digest sent to ' + (adminEmails_().join(', ') || 'nobody (ADMIN_EMAIL is empty)')); break;
      case 'reassign': reassignCore_(args.code, args.binome); break;
      case 'resolve': _webOut.push(resolveAlertsById_(args.ids) + ' alert(s) marked resolved'); break;
      case 'setup': setup(); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return { messages: _webOut.slice(), result: result };
  } finally {
    _webOut = null;
  }
}
