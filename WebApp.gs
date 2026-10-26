/******************************************************************************
 * VIC RECRUITMENT 2026 — web dashboard
 * -----------------------------------------------------------------------------
 * Deployed (appsscript.json) as: Execute as the user accessing the web app ·
 * Who has access: anyone in the domain. Google asks each visitor for permission
 * once, then everything runs with *their* Drive access: an account that can edit
 * the Master sheet is an admin and gets the dashboard; a member of a locked binome
 * (or a live cover) who can at least view their binome sheet gets only their binome
 * (MEMBER_MAP + Drive, through the Vercel front);
 * any other account is refused. The dashboard is the Vercel one: this web app's own page only links to it.
 ******************************************************************************/

const DASHBOARD_URL = 'https://vic-recruitment.vercel.app';
/** The old Apps Script dashboard is retired: its URL now links to the Vercel one (target _top: the web app runs in an iframe). */
function doGet() {
  return HtmlService.createHtmlOutput('<p style="font-family:Arial,sans-serif">The VIC Recruitment dashboard has moved: <a href="' +
    DASHBOARD_URL + '" target="_top">' + DASHBOARD_URL + '</a></p>')
    .setTitle('VIC Recruitment 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Bumped when webAccess/webState/webRun change shape; the Vercel front (frontend/src/lib/vic/types.ts) checks it. */
const API_VERSION = 3;
const DOMAIN = 'g.enp.edu.dz';

/**
 * Who is the signed-in account? {ok, role, email, reason, owner} (+ binome, cover, m, edit for a member). The script runs as
 * that account, so opening the sheet is the real test: an editor of the Master is an admin (role 'admin'; owner = the
 * account that runs the triggers, TRIGGER_OWNER, or the Master's owner while that is unset; only the owner may run Setup). Otherwise an email in MEMBER_MAP whose binome sheet Drive lets them open is a member
 * (role 'member': their binome only; edit = they can edit that sheet; cover = a live cover, who sees only the codes they
 * cover); in MEMBER_MAP but not shared yet = NOT_SHARED (an admin opens a binome with binomeAccess). Else DOMAIN = not an
 * @g.enp.edu.dz account, NO_PROJECT = can't open the Master, READ_ONLY = can open it, can't edit it. Admin entry points check
 * role === 'admin', never ok. Throws only when Drive fails for another reason than "no access" (the page retries).
 */
function access_() {
  const email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return { ok: false, role: '', email: '', reason: 'NO_EMAIL', owner: false };
  if (email.split('@')[1] !== DOMAIN) return { ok: false, role: '', email: email, reason: 'DOMAIN', owner: false };
  let ss = null;
  try { ss = ss_(); } catch (e) { /* this account can't open the Master */ }
  if (ss) {
    try {
      const owner = ss.getOwner();
      const ownerEmail = owner ? String(owner.getEmail()).toLowerCase() : '';
      const editors = ss.getEditors().map(u => String(u.getEmail()).toLowerCase()).concat(ownerEmail ? [ownerEmail] : []);
      // owner = whoever Setup accepts (triggerOwner_): the trigger owner, else the Master's owner before the first Setup
      const setupBy = String(PropertiesService.getScriptProperties().getProperty('TRIGGER_OWNER') || ownerEmail).toLowerCase();
      if (editors.indexOf(email) >= 0) return { ok: true, role: 'admin', email: email, owner: email === setupBy };
    } catch (e) { /* viewers can't list the editors */ }
  }
  const m = savedMemberMap_()[email];
  if (m) {
    const can = sheetAccess_(m.f); // the dashboard follows the sheet: no access to it, no dashboard
    if (can) return { ok: true, role: 'member', email: email, owner: false, binome: m.b, cover: !!m.cover, m: m, edit: can === 'edit' };
    return { ok: false, role: '', email: email, reason: 'NOT_SHARED', owner: false, binome: m.b, cover: !!m.cover };
  }
  if (!ss) return { ok: false, role: '', email: email, reason: 'NO_PROJECT', owner: false };
  // The bound script hands back its Master even to an account with no access at all: ask Drive whether it can see it.
  try { DriveApp.getFileById(ss.getId()); } catch (e) { return { ok: false, role: '', email: email, reason: 'NO_PROJECT', owner: false }; }
  return { ok: false, role: '', email: email, reason: 'READ_ONLY', owner: false };
}
function isAdmin_() { return access_().role === 'admin'; }
/** The member view of an access answer: a member as is; an admin in MEMBER_MAP who can open that binome sheet gets
 *  {binome, cover, m, edit} (one Drive call, so never from webPulse: admins poll it every 2 s); anyone else null. */
function asMember_(a) {
  if (a.role === 'member') return a;
  const m = a.role === 'admin' ? savedMemberMap_()[a.email] : null, can = m ? sheetAccess_(m.f) : '';
  return can ? { binome: m.b, cover: !!m.cover, m: m, edit: can === 'edit' } : null;
}

/** First call of the Vercel front: shows the no-access view rather than throwing (a Drive hiccup on a member's sheet throws). */
function webAccess() {
  const a = access_();
  return { ok: a.ok, role: a.role || '', email: a.email, reason: a.reason || '', owner: !!a.owner,
    binome: a.binome || '', cover: !!a.cover, v: API_VERSION, photo: a.email ? photo_() : '' };
}

/** The signed-in account's Google profile picture URL ('' if none or Drive fails), via the Drive scope we already hold.
 *  Cached per user for 6h so the first call stays cheap. */
function photo_() {
  const cache = CacheService.getUserCache(), hit = cache.get('photo');
  if (hit !== null) return hit;
  let url = '';
  try { url = String((Drive.About.get({ fields: 'user(photoLink)' }).user || {}).photoLink || '').replace(/=s\d+(-c)?$/, '=s128-c'); } catch (e) { /* initials instead */ }
  cache.put('photo', url, 21600);
  return url;
}

/** Cheap change detector for the dashboard's live refresh. Admins: the version of the cached dashboard (SNAP_VER), which goes
 *  up only when what the dashboard shows changed (publishState_); a hand edit in the Master shows after the next sync.
 *  Members: their binome's version (SNAP_BIN). Someone no longer in MEMBER_MAP gets "Not allowed" at the next poll.
 *  withSwitch: {v, pending} (the owner's switch, Pending.gs) instead of the bare version, for admins and members. */
function webPulse(withSwitch) {
  const a = access_();
  if (a.role === 'admin') {
    const ver = Number(PropertiesService.getScriptProperties().getProperty('SNAP_VER') || 0);
    if (!withSwitch) return ver; // pages before pending changes take the bare number
    const out = { v: ver, pending: pendingOn_() }, m = savedMemberMap_()[a.email], b = m && binMeta_()[m.b];
    if (b) out.bv = b.v; // an admin in a binome: a partner's edit refreshes their My binome (no Drive call here)
    return out;
  }
  if (a.role === 'member') { const b = binMeta_()[a.binome], ver = b ? b.v : 0; return withSwitch ? { v: ver, pending: pendingOn_() } : ver; }
  throw new Error('Not allowed');
}

/** Everything the dashboard shows, read-only: the cached snapshot plus who is asking. Dates are pre-formatted
 *  (google.script.run can't return Date). The cache may lose entries at any time: then it is built live, and published
 *  when the lock is free (otherwise whoever holds it publishes, or the next sync does). A member gets their binome only. */
function webState() {
  const a = access_();
  if (a.role === 'member') return memberState_(a);
  if (a.role !== 'admin') throw new Error('Not allowed');
  const st = readSnap_() || withLock_(() => publishState_(freshCtx_()), 1) || liveState_(freshCtx_());
  let member = null;
  // an admin in a binome also gets My binome; a Drive hiccup there never costs them the dashboard: member false = keep the last one
  try { const mv = asMember_(a); if (mv) member = memberState_(mv); } catch (e) { member = false; console.warn('My binome for ' + a.email + ': ' + e); }
  return Object.assign(st, { user: Session.getActiveUser().getEmail(), owner: a.owner, pending: pendingOn_() }, member !== null ? { member: member } : {});
}

/* ---------- members: MEMBER_MAP (who may see which binome) and their slice of the snapshot ---------- */

/** email -> {b: binome code, f: sheet id} for every member of a locked binome (ACTIVE or PAUSED), plus each live cover as
 *  {b, f, cover: true, codes: [the codes still covered]}. A member's own binome wins over a cover. */
function memberMap_(ctx) {
  const map = {};
  (ctx.covers || []).forEach(c => {
    const b = ctx.binByCode[c.binome], codes = coverLive_(ctx, c), had = map[c.email];
    if (!c.email || !b || !codes.length) return;
    // ponytail: one binome per cover; someone covering in two binomes sees the first until it ends (per-binome entries if it happens)
    if (!had) map[c.email] = { b: b.code, f: b.fileId, cover: true, codes: codes };
    else if (had.b === b.code) codes.forEach(k => { if (had.codes.indexOf(k) < 0) had.codes.push(k); });
  });
  activeOrPaused_(ctx).forEach(b => b.members.forEach(m => { if (m.email) map[m.email] = { b: b.code, f: b.fileId }; }));
  return map;
}
/** Rewrite MEMBER_MAP from ctx (indexed, covers current) when it differs. Every run that changes who is in a binome calls it in
 *  the same run, inside its lock: the sync, Lock, change / swap members, new binome, add / end cover, reset (empties it). */
function saveMemberMap_(ctx) {
  const s = JSON.stringify(memberMap_(ctx));
  if (s !== loadPropChunks_('MEMBER_MAP')) savePropChunks_('MEMBER_MAP', s);
}
function savedMemberMap_() { try { return JSON.parse(loadPropChunks_('MEMBER_MAP') || '{}'); } catch (e) { return {}; } }

// The alerts the script mails to a binome (notifyBinome: timing and odd values); every other type is for the admins only.
const MEMBER_ALERTS = ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'ODD_VALUE'];
/** A sheet cell as the dashboard shows it (scripts.run can't return a Date). tz: the sheet's own timezone when the caller is a
 *  member, who can't open the Master that holds TIMEZONE. */
function cell_(v, k, tz) { return v instanceof Date ? fmt_(v, k === 'Interview Time' ? 'HH:mm' : k === 'Registered' ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy', tz) : v; }
/** One candidate of a binome: its binome-sheet fields (BF_H keys) and its status. */
function candidate_(row, status, tz) { const c = { Status: status || '' }; BF_H.forEach((k, i) => { c[k] = cell_(row[i], k, tz); }); return c; }

/** code -> what a member of that binome sees: its candidates, its open MEMBER_ALERTS, its members' names. */
function binSlices_(ctx) {
  const I = ctx.iv.I, A = ctx.alerts.table.I, out = {};
  activeOrPaused_(ctx).forEach(b => {
    out[b.code] = { v: API_VERSION, binome: b.code, tag: b.tag, status: b.status, fileUrl: b.fileUrl,
      members: b.members.map(m => m.name || m.email), candidates: [], alerts: [], fromSheet: false };
  });
  const L = ctx.log.I;
  ctx.iv.data.forEach(r => {
    const s = out[String(r[I.Binome]).trim()];
    if (!s || !r[I.Code] || isOut_(r[I.Status])) return;
    const c = candidate_(ivToFileRow_(ctx, r, ivCarry_(ctx, r)), r[I.Status]), at = r[I['Interview Submitted At']];
    // the form that counts: a dashboard one (log key DASH|…) is edited from My binome, a Google Form one only viewed there
    const lr = at ? ctx.log.data[Number(r[I['Interview Log Row']]) - 2] : null;
    if (at) c.interview = { at: fmt_(at, 'dd/MM HH:mm'), by: lr ? lc_(lr[L.Submitter]) : '',
      source: lr && /^DASH\|/.test(String(lr[L['Response Key']])) ? 'Dashboard' : 'Google Form' };
    s.candidates.push(c);
  });
  ctx.alerts.table.data.forEach(r => {
    const s = out[String(r[A.Binome]).trim()];
    if (s && r[A.Status] === 'OPEN' && MEMBER_ALERTS.indexOf(r[A.Type]) >= 0) s.alerts.push({ id: String(r[A.ID]),
      created: fmt_(r[A.Created], 'dd/MM HH:mm'), severity: r[A.Severity], type: r[A.Type], code: String(r[A.Interviewee]), msg: String(r[A.Message]) });
  });
  return out;
}
function binMeta_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SNAP_BIN') || '{}'); } catch (e) { return {}; } }
/** Cache the slices that changed or went missing (snap:bin:<code>). Returns {meta: the SNAP_BIN to save, code -> {h, v},
 *  changed}; v goes up only when that slice's hash moved. A slice the cache refuses (over 100 KB) is left out: that member
 *  reads their sheet instead. */
function publishBins_(ctx) {
  const lap = snapLap_();
  const old = binMeta_(); lap('binMeta');
  const slices = binSlices_(ctx), codes = Object.keys(slices), cache = CacheService.getScriptCache(); lap('binSlices');
  const have = cache.getAll(codes.map(c => 'snap:bin:' + c)), dirty = cache.getAll(codes.map(c => 'dirty:' + c)), meta = {}; lap('binGet');
  let changed = Object.keys(old).length !== codes.length;
  codes.forEach(c => {
    // a member wrote and no sync has read that sheet yet (any publish that didn't pull, or ctx loaded before the write): ctx
    // misses it, so their patched slice stays until a pull has read the sheet after the write
    if (old[c] && Number(dirty['dirty:' + c] || 0) > ((ctx.readAt || {})[c] || 0)) { meta[c] = old[c]; return; }
    const json = JSON.stringify(slices[c]), h = hash_(json), o = old[c];
    meta[c] = { h: h, v: !o ? 1 : o.h === h ? o.v : o.v + 1 };
    if (!o || o.h !== h) changed = true;
    if (have['snap:bin:' + c] === json) return;
    const p0 = Date.now();
    try { cache.put('snap:bin:' + c, json, 21600); } catch (e) { console.warn('Slice of ' + c + ' not cached: ' + e); cache.remove('snap:bin:' + c); }
    _snapT.binPuts = (_snapT.binPuts || 0) + 1; _snapT.binPutMs = (_snapT.binPutMs || 0) + Date.now() - p0;
  });
  lap('binLoop');
  return { meta: meta, changed: changed };
}

/** A member's webState: their binome's slice from the cache (a cover: only the codes they cover). Not cached → read from their
 *  binome sheet, which their own sharing lets them open (then no statuses and no alerts: those live in the Master). */
function memberState_(a) {
  const m = a.m, meta = binMeta_()[m.b];
  let sl = null;
  if (meta && meta.h) {
    const json = CacheService.getScriptCache().get('snap:bin:' + m.b);
    if (typeof json === 'string' && hash_(json) === meta.h) { sl = JSON.parse(json); if (sl.v !== API_VERSION) sl = null; }
  }
  if (!sl) sl = sliceFromSheet_(m);
  if (m.cover) {
    sl.candidates = sl.candidates.filter(c => m.codes.indexOf(String(c.Code)) >= 0);
    sl.alerts = sl.alerts.filter(x => m.codes.indexOf(x.code) >= 0);
  }
  return Object.assign(sl, { role: 'member', cover: !!m.cover, edit: !!a.edit && !m.cover, user: Session.getActiveUser().getEmail(), pending: pendingOn_(),
    interviewForm: interviewFormUrl_(m.b) });
}
/** The binome sheet of a member view (asMember_), opened with the signed-in account's own access. */
function memberBook_(m) {
  let book = null;
  // openById can answer and the first read behind it still be refused (Drive lagging behind a share, load test run 1): read once
  // here, retry once, and a refusal that stays is the "not shared" answer, never Google's own text
  for (let i = 0; i < 2 && !book && m.f; i++) {
    try { const b = SpreadsheetApp.openById(m.f); b.getSheets(); book = b; } catch (e) { console.warn('memberBook_ ' + m.f + ' try ' + i + ': ' + e); if (i === 0) Utilities.sleep(1000); }
  }
  if (!book) throw new Error("Your binome sheet isn't shared with you yet.");
  return book;
}
function sliceFromSheet_(m) {
  const book = memberBook_(m), sh = book.getSheets()[0], n = bfLastRow_(sh), done = tabInterviews_(book), tz = book.getSpreadsheetTimeZone();
  const rows = n < 2 ? [] : sh.getRange(2, BF_COL, n - 1, BF_H.length).getValues().filter(r => String(r[0]).trim());
  return { v: API_VERSION, binome: m.b, tag: '', status: '', fileUrl: book.getUrl(), members: [], alerts: [], fromSheet: true,
    candidates: rows.map(r => {
      const c = candidate_(r, '', tz), x = done[String(r[0]).trim()];
      // a form logged before the tab existed has no row there, only its mark in the Interview Form cell
      if (x || String(c['Interview Form']).trim()) c.interview = x || { at: '', by: '', source: 'Google Form' };
      return c;
    }) };
}

/* ---------- an admin opens a binome to its members: their sheet and the dashboard together, silently ---------- */

const ACCESS_LEVELS = ['none', 'view', 'edit'];
/** webRun('binomeAccess', {binome, level?}). Without level: what each member can do in the binome sheet now, read from Drive.
 *  With level 'none' | 'view' | 'edit': give both members exactly that on their sheet without Drive's email (TEST_MODE too: a
 *  deliberate click on one binome; the bulk Re-share and the automatic shares keep their email and their TEST_MODE gate). The
 *  dashboard follows at the member's next poll (access_). Members only: covers keep the view access their cover gave them.
 *  Returns {binome, level (as last set from here), members: [{email, now}]}. */
function binomeAccessCore_(code, level, by) {
  if (level !== undefined && level !== null && ACCESS_LEVELS.indexOf(level) < 0) throw new Error('Access must be one of: ' + ACCESS_LEVELS.join(', '));
  const map = savedMemberMap_(), emails = Object.keys(map).filter(e => map[e].b === code && !map[e].cover);
  if (!emails.length) throw new Error(code + ' is not a locked binome with members.');
  const f = map[emails[0]].f, errs = [];
  let roles;
  try { roles = sheetRoles_(f); } catch (e) { throw new Error('Could not read who can open the ' + code + ' sheet: ' + driveErr_(e)); }
  if (level) {
    emails.forEach(e => { try { setSheetAccess_(f, e, level, roles); } catch (x) { errs.push(e + ': ' + driveErr_(x)); } });
    const props = PropertiesService.getScriptProperties(), all = binAccess_();
    // recorded only when every member got it: the badge and a later member change rely on it (on a failure the old level stays)
    if (!errs.length) { all[code] = { level: level, at: fmt_(new Date(), 'dd/MM/yyyy HH:mm'), by: by }; props.setProperty('BIN_ACCESS', JSON.stringify(all)); }
    const bins = binMeta_(); // the members' pages reload at their next poll and pick up view / edit
    if (bins[code]) { bins[code].v++; props.setProperty('SNAP_BIN', JSON.stringify(bins)); }
    say_(code + ': ' + (level === 'none' ? 'closed. Its members no longer open their sheet or the dashboard.' :
      'its members can now ' + level + ' their sheet' + (level === 'edit' ? ' and fill it in from the dashboard.' : ' and see it on the dashboard.')) +
      ' No email was sent.' + (errs.length ? '\nNot done for: ' + errs.join('; ') : ''));
  }
  return { binome: code, level: (binAccess_()[code] || {}).level || '',
    members: emails.map(e => ({ email: e, now: roles[e] ? roles[e].level : 'none' })), errors: errs };
}

/* ---------- members edit their own binome sheet (load-test task 8) ---------- */

/** A member's value for one gold column, checked like the sheet's own validations (a script write skips them). Returns what to
 *  write: a Date for Interview Date (lands as a real date whatever the sheet's locale), a number or '' for Rating.
 *  tz = the binome sheet's own timezone: a member can't open the Master, so S_() (TIMEZONE) is out of reach here. */
function memberValue_(field, value, tz) {
  const raw = value === null || value === undefined ? '' : value, s = String(raw).trim();
  switch (field) {
    case 'Contacted':
      if (CONTACT_OPTIONS.indexOf(s) < 0) throw new Error('Contacted must be one of: ' + CONTACT_OPTIONS.join(', ') + '.');
      return s;
    case 'Final Affectation':
      if (s && AFFECTATION_OPTIONS.indexOf(s) < 0) throw new Error('Final Affectation must be one of: ' + AFFECTATION_OPTIONS.join(', ') + ', or empty.');
      return s;
    case 'Rating': {
      if (!s) return '';
      const n = Number(s.replace(',', '.'));
      if (isNaN(n) || n < 0 || n > 10) throw new Error('Rating must be a number from 0 to 10, or empty.');
      return n;
    }
    case 'Interview Done':
      if (raw === true || /^true$/i.test(s)) return true;
      if (raw === false || /^false$/i.test(s)) return false;
      throw new Error('Interview Done must be ticked or not.');
    case 'Interview Date': {
      if (!s) return '';
      // midnight at today's offset, then again at that day's own offset (a daylight-saving zone: they differ for half the year)
      const off = d => Utilities.formatDate(d, tz, 'XXX'), guess = /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? buildInterviewAt(s, '00:00', off(new Date())) : null;
      const at = guess instanceof Date ? buildInterviewAt(s, '00:00', off(guess)) : guess;
      if (!(at instanceof Date) || Utilities.formatDate(at, tz, 'dd/MM/yyyy') !== s) throw new Error('Interview Day must be a real date, dd/MM/yyyy.'); // 31/02 rolls over
      return at;
    }
    case 'Interview Time':
      if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error('Time must be HH:mm, from 00:00 to 23:59.');
      return s;
    case 'Notes':
      if (s.length > 2000) throw new Error('Notes are limited to 2,000 characters.');
      return s;
  }
  throw new Error('Not allowed'); // not one of the binome's columns (BF_EDITABLE)
}
/** A gold cell in the slice's own form, as pullBinomeFiles_ reads it: dates and times as displayed, Done a boolean, Rating a
 *  number or text. */
function goldOf_(k, v, d) {
  if (k === 'Interview Done') return v === true;
  if (k === 'Rating') return typeof v === 'number' ? v : String(v).trim();
  if (k === 'Notes') return String(v);
  return String(k === 'Interview Date' || k === 'Interview Time' ? d : v).trim();
}
/** One gold value as text, so the page's `seen` (from the slice: boolean, number or string) compares with the cell. */
function goldText_(k, x) {
  if (k === 'Interview Done') return String(x === true || /^true$/i.test(String(x)));
  const s = String(x === null || x === undefined ? '' : x).trim(), n = Number(s.replace(',', '.'));
  return k === 'Rating' && s && !isNaN(n) ? String(n) : s;
}
/** Members' edits take the document lock, not the script lock the sync holds for seconds; if there is none, the script lock. */
function memberLock_() { let l = null; try { l = LockService.getDocumentLock(); } catch (e) { /* no document */ } return l || LockService.getScriptLock(); }

/** webRun('memberSet', {code, fields: [{field, value, seen}]}): a member (not a cover) sets gold cells of one candidate in their
 *  own binome sheet, with their own access, the way typing would; one access check, one open, one lock for all of them.
 *  seen = the value their screen showed: if the cell holds something else, the partner changed it meanwhile and that field is
 *  not written. Each field answers on its own: {field, value} written, {field, conflict: <current>} or {field, error}.
 *  Then the binome is marked dirty (the next sync reads its sheet whatever Drive says) and its cached slice takes the values,
 *  so the partner's next poll shows them. The one-field form {code, field, value, seen} (pages loaded before the batch) answers
 *  {code, field, value} and throws CONFLICT: <current> or the field's error, as it always did. */
function memberSet_(a, args) {
  const mv = asMember_(a); // a member, or an admin in a binome
  if (!mv || mv.cover) throw new Error('Not allowed');
  if (!mv.edit) throw new Error('You can view your binome sheet but not edit it. Ask an admin for edit access.');
  const m = mv.m, code = String(args.code || '').trim(), batch = Array.isArray(args.fields);
  const list = (batch ? args.fields : [args]).map(x => ({ field: String((x && x.field) || ''), value: x && x.value, seen: x && x.seen }));
  // a field twice would be checked against the row as read before the first write: refused, like an unknown field
  if (!list.length || list.some((x, i) => BF_EDITABLE.indexOf(x.field) < 0 || list.findIndex(y => y.field === x.field) !== i)) throw new Error('Not allowed');
  const file = memberBook_(m), sh = file.getSheets()[0], tz = file.getSpreadsheetTimeZone();
  list.forEach(x => { try { x.v = memberValue_(x.field, x.value, tz); } catch (e) { x.error = e.message; } });
  if (!batch && list[0].error) throw new Error(list[0].error);
  const lock = memberLock_();
  if (!lock.tryLock(10000)) throw new Error('BUSY: Your sheet is busy with another edit. Nothing was changed: try again.');
  try {
    if (bfLayout_(sh) !== 'v2') throw new Error("Your binome sheet's header was changed by hand: ask an admin to repair it before editing from here.");
    const row = findFileRow_(sh, code);
    if (row < 0) throw new Error('This candidate is no longer in your binome.');
    // the row read once before the writes and once after them: a read between two writes would flush each one
    const rng = sh.getRange(row, BF_COL, 1, BF_H.length), F = idx_(BF_H), was = rng.getValues()[0], wasShown = rng.getDisplayValues()[0];
    list.forEach(x => {
      if (x.error) return;
      const cur = goldText_(x.field, goldOf_(x.field, was[F[x.field]], wasShown[F[x.field]]));
      if (cur !== goldText_(x.field, x.seen)) { x.conflict = cur; return; }
      goldWrite_(sh, row, x.field, x.v);
    });
    const written = list.filter(x => !x.error && x.conflict === undefined);
    if (written.length) {
      SpreadsheetApp.flush();
      const vals = goldPatch_(m.b, sh, row, code, written.map(x => x.field));
      written.forEach(x => { x.now = vals[x.field]; });
    }
    if (!batch) {
      if (list[0].conflict !== undefined) throw new Error('CONFLICT: ' + list[0].conflict);
      return { code: code, field: list[0].field, value: list[0].now };
    }
    return { code: code, fields: list.map(x => (x.error ? { field: x.field, error: x.error }
      : x.conflict !== undefined ? { field: x.field, conflict: x.conflict } : { field: x.field, value: x.now })) };
  } finally { lock.releaseLock(); }
}
/** One gold cell written as typing would; the apostrophe keeps notes as text (no formula, no date). */
function goldWrite_(sh, row, field, v) { sh.getRange(row, bfCol_(field)).setValue(field === 'Notes' && v ? "'" + v : v); }
/** After a member's write is flushed: the next sync reads binome b's sheet (dirty), and its cached slice takes the cells as
 *  written (read back from the row). Returns {field: value} in the slice's form. memberSet_ and the apply entry share it. */
function goldPatch_(b, sh, row, code, fields) {
  CacheService.getScriptCache().put('dirty:' + b, String(Date.now()), 21600);
  const rng = sh.getRange(row, BF_COL, 1, BF_H.length), F = idx_(BF_H), now = rng.getValues()[0], shown = rng.getDisplayValues()[0], vals = {};
  fields.forEach(k => { vals[k] = goldOf_(k, now[F[k]], shown[F[k]]); });
  patchSlice_(b, code, vals);
  return vals;
}
/** The binome's cached slice takes the member's values ({field: value}, one candidate) and one new version. A slice not cached as published only gets a new
 *  version and no hash: the next webState reads the sheet. Under the member lock, so two members' patches never cross.
 *  ponytail: not under the script lock, so a publish in the same few ms can overwrite this SNAP_BIN entry; the page then shows
 *  the sheet or the older slice until the next sync, which reads this binome (dirty) and publishes it. */
function patchSlice_(b, code, vals) {
  const bins = binMeta_(), o = bins[b];
  if (!o) return;
  const cache = CacheService.getScriptCache(), json = o.h ? cache.get('snap:bin:' + b) : null;
  let h = '';
  if (typeof json === 'string' && hash_(json) === o.h) {
    const sl = JSON.parse(json), c = sl.candidates.filter(x => String(x.Code) === code)[0];
    if (c) {
      Object.assign(c, vals);
      const out = JSON.stringify(sl);
      try { cache.put('snap:bin:' + b, out, 21600); h = hash_(out); } catch (e) { cache.remove('snap:bin:' + b); }
    }
  }
  bins[b] = { h: h, v: o.v + 1 };
  PropertiesService.getScriptProperties().setProperty('SNAP_BIN', JSON.stringify(bins));
}
/** webRun('dropSlice', {binome}), load-test task 10: binome b's cached slice counts as gone, as dropSnap_ does to every binome
 *  after a failed publish, so its members' next webState reads their sheet (memberBook_) until the next sync republishes it.
 *  Owner only, TEST_MODE only; under the script lock, so no publish crosses it. */
function dropSlice_(a, b) {
  if (!a.owner) throw new Error('Only the owner (the account that runs the triggers) can drop a cached slice');
  if (!bool_(S_().TEST_MODE)) throw new Error('Only in TEST_MODE: dropping a cached slice is for the load test');
  const out = withLock_(() => {
    const bins = binMeta_(), o = bins[b];
    if (!o) throw new Error('No cached slice for ' + b);
    bins[b] = { h: '', v: o.v + 1 };
    PropertiesService.getScriptProperties().setProperty('SNAP_BIN', JSON.stringify(bins));
    return { binome: b, v: bins[b].v };
  }, 30000);
  if (!out) busy_();
  return out;
}

/* ---------- the interview form in the dashboard (docs/interview-form.md part 2) ---------- */

/** The Google Form prefilled with binome code b; the page appends the interviewee code. '' while its URL is unknown (an admin's
 *  page load looks it up). */
function interviewFormUrl_(b) {
  const url = formUrl_(CONFIG.INTERVIEW_FORM_ID);
  return url ? url + '?usp=pp_url&' + INTERVIEW_ENTRY.binome + '=' + encodeURIComponent(b) + '&' + INTERVIEW_ENTRY.code + '=' : '';
}
/** code -> {at (dd/MM HH:mm), by, source} for every row of a binome sheet's Interview Answers tab (the slice read from the sheet). */
function tabInterviews_(book) {
  const tab = book.getSheetByName(IA_TAB), n = tab ? tab.getLastRow() : 0, tz = book.getSpreadsheetTimeZone(), out = {};
  if (n >= 2) tab.getRange(2, 1, n - 1, 4).getValues().forEach(v => {
    if (String(v[0]).trim()) out[String(v[0]).trim()] = { at: v[2] instanceof Date ? Utilities.formatDate(v[2], tz, 'dd/MM HH:mm') : '', by: lc_(v[3]), source: String(v[1]).trim() };
  });
  return out;
}
/** One row of an Interview Answers tab as the page reads it: answers by question id, its source, who and when (dd/MM/yyyy HH:mm in
 *  the sheet's timezone: a member can't read the Master's TIMEZONE), and stamp, the `seen` a save sends back (saveToken_). */
function answersView_(v, tz) {
  const when = d => (d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm') : '');
  const answers = {};
  INTERVIEW_QUESTIONS.forEach((q, i) => { const x = v[6 + i]; answers[q.id] = x instanceof Date ? when(x) : x; });
  return { answers: answers, source: String(v[1]).trim(), submittedAt: when(v[2]), submittedBy: lc_(v[3]), editedAt: when(v[4]),
    editedBy: String(v[5]).trim(), stamp: saveToken_(v[4], v[5], v[2], v[3]) };
}
/** The answers a page sent, checked like the Google Form: the 1st choice picks the department section (the other sections'
 *  answers are dropped), the required questions of the sections in play need an answer, a score is a whole number from 1 to 10,
 *  a choice one of its options, a paragraph text up to 5,000 characters. Returns the cells in INTERVIEW_QUESTIONS order. */
function interviewAnswers_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not allowed');
  const s = x => String(x === null || x === undefined ? '' : x).trim(), dept = s(raw[INTERVIEW_BRANCH]);
  const name = q => '"' + q.title.trim().replace(/\s+/g, ' ') + '"';
  return INTERVIEW_QUESTIONS.map(q => {
    if (q.section !== 'first' && q.section !== 'final' && q.section !== dept) return '';
    const v = s(raw[q.id]);
    if (!v) { if (q.required) throw new Error(name(q) + ' needs an answer.'); return ''; }
    if (q.type === 'score') { if (!/^([1-9]|10)$/.test(v)) throw new Error(name(q) + ' takes a score from 1 to 10.'); return Number(v); }
    if (q.type === 'choice') { if (q.options.indexOf(v) < 0) throw new Error(name(q) + ' must be one of: ' + q.options.join(', ') + '.'); return v; }
    if (v.length > 5000) throw new Error(name(q) + ' is limited to 5,000 characters.');
    return v;
  });
}

/** webRun('interviewGet', {code}): the interview form of one candidate of the caller's binome, read with their own access: a
 *  member, an admin in a binome, or a cover for the codes they cover. The questions, the candidate (name, 1st choice from the
 *  registration), the answers row if there is one (answers null if not), the prefilled Google Form. edit = they may save here
 *  (edit access, not a cover); a Google Form row stays read-only for everyone. No lock. */
function interviewGet_(a, args) {
  const mv = asMember_(a);
  if (!mv) throw new Error('Not allowed');
  const m = mv.m, code = String(args.code || '').trim();
  if (mv.cover && (m.codes || []).indexOf(code) < 0) throw new Error('Not allowed');
  const book = memberBook_(m), sh = book.getSheets()[0], row = findFileRow_(sh, code);
  if (row < 0) throw new Error('This candidate is no longer in your binome.');
  const F = idx_(BF_H), v = sh.getRange(row, BF_COL, 1, BF_H.length).getValues()[0], got = answersRow_(book.getSheetByName(IA_TAB), code);
  // no row but a mark in Interview Form: a Google Form logged before the tab existed, read-only
  const old = !got && String(v[F['Interview Form']]).trim() ? { answers: null, source: 'Google Form', stamp: '' } : null;
  return Object.assign({ code: code, binome: m.b, name: (String(v[F['First Name']]) + ' ' + String(v[F['Family Name']])).trim(),
    firstChoice: String(v[F['1st Choice']]).trim(), edit: !!mv.edit && !mv.cover, sections: INTERVIEW_SECTIONS, questions: INTERVIEW_QUESTIONS,
    formUrl: interviewFormUrl_(m.b) }, got ? answersView_(got.v, book.getSpreadsheetTimeZone()) : old || { answers: null, source: '', stamp: '' });
}

/** webRun('interviewSave', {code, answers: {questionId: value}, seen}): a member with edit access (an admin in a binome too, never
 *  a cover) saves one candidate's interview form into their binome sheet's Interview Answers tab (made on the first save), with
 *  their own access, under the members' lock; the codes are never typed. Checked by interviewAnswers_. seen = the stamp the page
 *  loaded ('': no row then): a row saved since, by the partner, refuses with CONFLICT; a Google Form row is never saved over. Then
 *  the binome is marked dirty (the next sync logs it) and its cached slice shows the interview, so the partner sees Submitted at
 *  their next poll. A direct write with pending changes on too: an answer set is not a one-cell change. */
function interviewSave_(a, args) {
  const mv = asMember_(a);
  if (!mv || mv.cover) throw new Error('Not allowed');
  if (!mv.edit) throw new Error('You can view your binome sheet but not edit it. Ask an admin for edit access.');
  const m = mv.m, code = String(args.code || '').trim(), vals = interviewAnswers_(args.answers), me = lc_(a.email), seen = String(args.seen || '');
  const book = memberBook_(m), sh = book.getSheets()[0], tz = book.getSpreadsheetTimeZone();
  const lock = memberLock_();
  if (!lock.tryLock(10000)) throw new Error('BUSY: Your sheet is busy with another edit. Nothing was saved: try again.');
  try {
    const row = findFileRow_(sh, code);
    if (row < 0) throw new Error('This candidate is no longer in your binome.');
    const tab = answersTab_(book, true), got = answersRow_(tab, code), had = got ? answersView_(got.v, tz) : null;
    // no row but a mark in Interview Form: a Google Form logged before the tab existed
    const marked = !got && String(sh.getRange(row, bfCol_('Interview Form')).getValue()).trim();
    if ((had && had.source !== 'Dashboard') || marked) throw new Error('These answers came from the Google Form: they can only be viewed here.');
    if (!had && seen) throw new Error('CONFLICT: These answers were removed from your sheet meanwhile.');
    if (had && had.stamp !== seen) throw new Error('CONFLICT: ' + (had.editedBy || had.submittedBy) + ' saved this form at ' + (had.editedAt || had.submittedAt) + '.');
    const now = new Date(stamp_(new Date()) * 1000), first = had && got.v[2] instanceof Date ? got.v[2] : now;
    const head = had ? [code, 'Dashboard', got.v[2], got.v[3], now, me] : [code, 'Dashboard', now, me, '', ''];
    tab.getRange(got ? got.row : tab.getLastRow() + 1, 1, 1, IA_H.length).setValues([answersCells_(head, vals)]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().put('dirty:' + m.b, String(Date.now()), 21600);
    const interview = { at: Utilities.formatDate(first, tz, 'dd/MM HH:mm'), by: had ? had.submittedBy : me, source: 'Dashboard' };
    patchSlice_(m.b, code, { interview: interview });
    return Object.assign({ code: code, interview: interview }, answersView_(answersRow_(tab, code).v, tz));
  } finally { lock.releaseLock(); }
}

function freshCtx_() { _settings = null; return loadCtx_(); }
function liveState_(ctx) { return Object.assign(buildState_(ctx), { updated: fmt_(ctx.now, 'dd/MM/yyyy HH:mm'), built: ctx.now.getTime() }); }

/* ---------- the cached snapshot: CacheService chunks, checked against SNAP_HASH (script properties persist, the cache doesn't) ---------- */

const SNAP_CHUNK = 25000; // chars per cache value: under the 100 KB limit even at 3 bytes a character
function snapMeta_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('SNAP_HASH')); } catch (e) { return null; } }
/** The snapshot as cached, or null when a chunk is gone, the hash doesn't match, or it was built for another API_VERSION. */
function readSnap_() {
  const meta = snapMeta_();
  if (!meta || !meta.n) return null;
  const keys = []; for (let i = 0; i < meta.n; i++) keys.push('snap:admin:' + i);
  const got = CacheService.getScriptCache().getAll(keys);
  if (keys.some(k => typeof got[k] !== 'string')) return null;
  const json = keys.map(k => got[k]).join('');
  if (hash_(json) !== meta.h) return null;
  const st = JSON.parse(json);
  if (st.v !== API_VERSION) return null;
  st.updated = meta.at; st.built = meta.ms || 0;
  return st;
}
/** Build the snapshot from ctx; when it differs from the cached one, cache it and add 1 to SNAP_VER (the pulse). A cache that
 *  lost entries is refilled without a new version. Call it inside the script lock, so two publishers never cross. Not published
 *  when the snapshot was dropped since ctx was loaded (SNAP_VER moved, and only dropSnap_ moves it outside the lock): ctx may miss
 *  the write that dropped it. Returns the state. */
/** A stopwatch into _snapT: lap('x') adds the ms since the previous lap (or since this call) to _snapT.x. */
const snapLap_ = () => { let t = Date.now(); return k => { const n = Date.now(); _snapT[k] = (_snapT[k] || 0) + n - t; t = n; }; };
let _snapT = {}; // ms per step of the last publishState_ (the cycle and action lines log it: the run-3 stall had no breakdown)
function publishState_(ctx) {
  _snapT = {};
  const lap = snapLap_();
  const st = buildState_(ctx); lap('build');
  const json = JSON.stringify(st), h = hash_(json); lap('hash');
  const meta = snapMeta_(); lap('meta');
  const same = !!meta && meta.h === h, cached = same && !!readSnap_(); lap('readSnap');
  const bins = publishBins_(ctx); lap('bins');
  if (cached && !bins.changed) return Object.assign(st, { updated: meta.at, built: meta.ms || 0 });
  // built = the ms the data was read (ctx.now): a pending change's screen gives way to a snapshot built at or after its write
  const at = same ? meta.at : fmt_(ctx.now, 'dd/MM/yyyy HH:mm'), ms = same ? meta.ms || 0 : ctx.now.getTime(), chunks = {};
  let n = 0;
  for (let i = 0; i < json.length; n++) {
    let j = Math.min(i + SNAP_CHUNK, json.length);
    const c = json.charCodeAt(j - 1);
    if (j < json.length && c >= 0xd800 && c <= 0xdbff) j--; // never split a surrogate pair
    chunks['snap:admin:' + n] = json.slice(i, j); i = j;
  }
  if (!cached) CacheService.getScriptCache().putAll(chunks, 21600);
  lap('putAll');
  const props = PropertiesService.getScriptProperties(), ver = Number(props.getProperty('SNAP_VER') || 0); lap('getVer');
  // ponytail: check then set, not atomic; a drop in the few ms between them is lost until the next change is published
  if (ver !== ctx.snapVer) return Object.assign(st, { updated: fmt_(ctx.now, 'dd/MM/yyyy HH:mm'), built: ctx.now.getTime() });
  props.setProperties({ SNAP_HASH: JSON.stringify({ h: h, n: n, at: at, ms: ms }), SNAP_VER: String(same ? ver : ver + 1), SNAP_BIN: JSON.stringify(bins.meta) }); lap('setProps');
  return Object.assign(st, { updated: at, built: ms });
}
/** The cache can no longer be trusted (a publish failed or could not run): the next webState builds live (a member's from
 *  their sheet), every screen reloads. */
function dropSnap_() {
  const props = PropertiesService.getScriptProperties(), bins = binMeta_();
  Object.keys(bins).forEach(c => { bins[c] = { h: '', v: bins[c].v + 1 }; });
  props.deleteProperty('SNAP_HASH');
  props.setProperties({ SNAP_VER: String(Number(props.getProperty('SNAP_VER') || 0) + 1), SNAP_BIN: JSON.stringify(bins) });
}
/** After a dashboard action that wrote: publish from a fresh read (the action's own context is not re-indexed after its writes).
 *  It waits for the lock rather than dropping at once: a sync that loaded before a lock-free write (resolve, saveSettings…)
 *  publishes its older view, and only a publish after it can overwrite that. Still taken after 30 s → drop the snapshot
 *  (the next sync's fresh read republishes it). Never throws. */
function publishFresh_() {
  try { if (!withLock_(() => publishState_(freshCtx_()), 30000)) dropSnap_(); }
  catch (e) { console.warn('Snapshot not published: ' + e); try { dropSnap_(); } catch (e2) { /* the next sync publishes */ } }
}

/** Form URLs never change: looked up once per form ID, then kept in script property FORM_URLS. */
function formUrl_(id) {
  const props = PropertiesService.getScriptProperties();
  let urls = {}; try { urls = JSON.parse(props.getProperty('FORM_URLS') || '{}'); } catch (e) { /* looked up again */ }
  if (urls[id]) return urls[id];
  let url = '';
  try { url = FormApp.openById(id).getPublishedUrl(); } catch (e) { return ''; }
  if (url) { urls[id] = url; props.setProperty('FORM_URLS', JSON.stringify(urls)); }
  return url;
}

/** The dashboard as every admin sees it: no per-request fields and no clock, so its hash only moves when the data does. */
function buildState_(ctx) {
  const lap = snapLap_(); // the slow calls of publishState_'s build, by name
  const s = S_(); lap('bSettings');
  const I = ctx.iv.I, A = ctx.alerts.table.I, T = ctx.team.I;

  const byStatus = {}; Object.keys(ST).forEach(k => { byStatus[ST[k]] = 0; });
  const byDep = {}; DEPTS.forEach(d => { byDep[d] = 0; });
  const perBin = {};
  lap('bPre'); const loadOf = loads_(ctx); // the load pickBinome compares (BALANCE_BY), for Settings › General
  ctx.iv.data.forEach(r => {
    if (!r[I.Code] && !r[I['Response Key']]) return;
    byStatus[r[I.Status]] = (byStatus[r[I.Status]] || 0) + 1;
    if (isOut_(r[I.Status])) return;
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

  const look = quickLookups_(ctx), opened = binAccess_(), hand = ctx.binomes.some(b => b.status === 'DRAFT') ? handDrafts_() : [];
  lap('bLookups'); const teamSrc = findTeamSource_(ss_()); lap('bTeamSrc');
  const history = historyRows_(), ivHistory = ivHistoryRows_(); lap('bHistory');
  const masterUrl = ss_().getUrl(); lap('bMasterUrl');

  return {
    v: API_VERSION,
    links: {
      master: masterUrl,
      registrationForm: formUrl_(CONFIG.REGISTRATION_FORM_ID),
      interviewForm: formUrl_(CONFIG.INTERVIEW_FORM_ID),
      binomeFolder: 'https://drive.google.com/drive/folders/' + CONFIG.BINOME_FOLDER_ID,
    },
    settings: {
      assignmentsOpen: bool_(s.ASSIGNMENTS_OPEN), testMode: bool_(s.TEST_MODE),
      shareFiles: bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE),
      notifyBinome: bool_(s.NOTIFY_BINOME_ON_ALERT), notifyNew: bool_(s.NOTIFY_BINOME_ON_NEW_INTERVIEWEE),
      syncEvery: num_(s.SYNC_EVERY_MINUTES, 15), digestHour: num_(s.DIGEST_HOUR, 8), admins: adminEmails_(), tz: String(s.TIMEZONE),
    },
    mails: MAILS.map(m => ({ id: m.id, name: m.name, to: m.to, vars: m.vars,
      fields: m.fields.map(f => ({ key: 'MAIL_' + m.id + '_' + f[0].toUpperCase(), field: f[0], def: f[1] })) })),
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
    history: history,
    ivHistory: ivHistory,
    teamList: teamMembers_(ctx).filter(m => !m.exclude).map(m => ({ name: m.name, email: m.email, pairAs: m.pairAs, experienced: m.experienced })),
    binomes: ctx.binomes.map(b => {
      const p = perBin[b.code] || { assigned: 0, interviewed: 0, withdrew: 0, open: 0 };
      return { code: b.code, tag: b.tag, status: b.status, fileUrl: b.fileUrl, members: b.members.map(m => m.name || m.email),
        people: b.members.map(m => ({ name: m.name, email: m.email })), access: (opened[b.code] || {}).level || '',
        byHand: b.status === 'DRAFT' && hand.indexOf(handKey_(b.members.map(m => m.email))) >= 0,
        assigned: p.assigned, interviewed: p.interviewed, withdrew: p.withdrew, open: p.open,
        load: loadOf[b.code] || 0 };
    }),
    alertCounts: alertCounts,
    alerts: open.sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0) || (+new Date(b[A.Created]) || 0) - (+new Date(a[A.Created]) || 0)).map(r => ({
      id: String(r[A.ID]), created: fmt_(r[A.Created], 'dd/MM HH:mm'), severity: r[A.Severity], type: r[A.Type],
      code: String(r[A.Interviewee]), binome: String(r[A.Binome]), msg: String(r[A.Message]),
      fix: r[A.Type] === 'MANUAL_EDIT' ? editFixes_(String(r[A.Key]), base) : [], q: quickInfo_(ctx, r, look) })),
    muted: heldAlerts_(ctx),
    interviewees: ctx.iv.data.filter(r => r[I.Code]).map(r => ({ code: String(r[I.Code]), binome: String(r[I.Binome]), status: r[I.Status],
      name: (String(r[I['First Name']]) + ' ' + String(r[I['Family Name']])).trim(), risk: r[I.Risk] === '' ? null : Number(r[I.Risk]),
      // Schedule (docs/plans.md): the interview time the sync read from the binome sheet ('' typed or unreadable = null)
      dept: String(r[I['1st Choice']]), contacted: String(r[I.Contacted]), at: ms_(r[I['Interview At']]),
      assignedAt: ms_(r[I['Assigned At']]), avail: String(r[I.Availability]) })),
    screening: { on: screenOn_(), holdAt: num_(s.SCREEN_HOLD_AT, 50), linked: !!String(s.VIC_MEMBERS_SHEET || '').trim(), members: membersStatus_() },
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

/** The Interviewee Changes tab (moves, accepted hand edits) for Change history, newest first (last 300); [] before its first row. */
function ivHistoryRows_() {
  const sh = ss_().getSheetByName(TAB.IV_CHANGES);
  if (!sh) return [];
  const C = idx_(IC_H), s = v => String(v == null ? '' : v).trim();
  return loadTable_(TAB.IV_CHANGES, IC_H).data.slice(-300).reverse().map(r => ({
    at: fmt_(r[C.When], 'dd/MM/yyyy HH:mm'), by: s(r[C.By]), code: s(r[C.Code]), what: s(r[C.What]), from: s(r[C.From]), to: s(r[C.To]) }));
}

/** Analytics (docs/plans.md › Analytics): one row per registration in Interviewees, duplicates included (their status says so),
 *  admins only. Read-only, no lock, and never on a poll: the page asks when Analytics or a profile opens. No phone, Facebook or
 *  Discord. Times are ms, shown in tz. */
function webAnalytics() {
  if (access_().role !== 'admin') throw new Error('Not allowed');
  const t = loadTable_(TAB.IV, IV_H), I = t.I, s = v => String(v == null ? '' : v).trim();
  return { v: API_VERSION, tz: String(S_().TIMEZONE), rows: t.data.filter(r => r[I.Code] || r[I['Response Key']]).map(r => ({
    code: s(r[I.Code]), binome: s(r[I.Binome]), status: s(r[I.Status]), flags: s(r[I.Flags]), risk: r[I.Risk] === '' ? null : Number(r[I.Risk]),
    registered: ms_(r[I['Registered At']]), assignedAt: ms_(r[I['Assigned At']]), contactedAt: ms_(r[I['Contacted Seen At']]),
    interviewAt: ms_(r[I['Interview At']]), submittedAt: ms_(r[I['Interview Submitted At']]),
    first: s(r[I['First Name']]), family: s(r[I['Family Name']]), email: s(r[I.Email]), typedEmail: s(r[I['Typed Email']]),
    field: s(r[I.Field]), year: s(r[I.Year]), c1: s(r[I['1st Choice']]), c2: s(r[I['2nd Choice']]),
    birth: birthInfo(r[I['Birth Date']], r[I['Registered At']], r[I.Year], r[I.Field]),
    discovered: s(r[I['Discovered VIC']]), whyVic: s(r[I['Why VIC']]), motivation: s(r[I.Motivation]), clubs: s(r[I['Other Clubs']]),
    deptQuestions: s(r[I['Department Questions']]), avail: s(r[I.Availability]), anything: s(r[I['Anything to add']]),
    contacted: s(r[I.Contacted]), notes: s(r[I['Binome Notes']]), finalDep: s(r[I['Final Affectation']]),
  })) };
}

const SETTING_ENUMS ={ INSTANT_EMAIL_MIN_SEVERITY: ['HIGH', 'MEDIUM', 'INFO'], BALANCE_BY: ['ACTIVE', 'TOTAL'], SYNC_EVERY_MINUTES: [1, 5, 10, 15, 30],
  HR_ONLY_WEIGHT: [1, 1.5, 2, 2.5, 3, 4] };
/** How the dashboard edits a setting: bool (switch), enum (dropdown), number or text. Types come from the defaults. */
function settingKind_(r) {
  if (SETTING_ENUMS[r[0]]) return { type: 'enum', options: SETTING_ENUMS[r[0]] };
  return { type: typeof r[1] === 'boolean' ? 'bool' : typeof r[1] === 'number' ? 'number' : 'text' };
}

/** A setting's value as it is written (bool, number, enum, trimmed text); throws why a value is refused. r = its SETTINGS_DEFAULTS row. */
function settingValue_(r, raw) {
  const k = r[0], kind = settingKind_(r);
  let v = raw;
  if (kind.type === 'bool') v = bool_(v);
  else if (kind.type === 'number') { v = Number(v); if (String(raw).trim() === '' || isNaN(v)) throw new Error(k + ' must be a number'); }
  else { v = String(v).trim(); if (kind.type === 'enum' && kind.options.map(String).indexOf(v) < 0) throw new Error(k + ' must be one of ' + kind.options.join(', ')); if (typeof r[1] === 'number') v = Number(v); }
  if (/^MAIL_/.test(k)) { mailCheck_(k, v); if (v === mailKey_(k).f[1]) v = ''; } // a text equal to the script's is saved blank, so a new default still reaches it
  if (k === 'ADMIN_EMAIL' && v && !String(v).split(/[,;\s]+/).filter(Boolean).every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new Error('ADMIN_EMAIL: invalid email address');
  if (k === 'DIGEST_HOUR' && (v < 0 || v > 23 || v % 1)) throw new Error('DIGEST_HOUR must be a whole number from 0 to 23');
  return v;
}

/** webRun('mailPreview', {id, texts, send}): one editable mail drawn with sample data from the texts as typed (checked like a save),
 *  {subject, html}. With send, also mailed to the caller as "[TEST] ...", saved or not; in TEST_MODE that works only for an admin
 *  in ADMIN_EMAIL, since mail_ holds the rest. Writes nothing. */
function mailPreviewCore_(a, args) {
  const id = String(args.id || ''), m = mailDef_(id), texts = args.texts || {};
  if (!m) throw new Error('Unknown mail ' + id);
  m.fields.forEach(f => { if (texts[f[0]] != null) mailCheck_('MAIL_' + id + '_' + f[0].toUpperCase(), texts[f[0]]); });
  const out = mailSample_(id, texts);
  if (args.send) {
    out.sent = mail_(a.email, '[TEST] ' + out.subject, out.html, out.from);
    _webOut.push(out.sent ? 'Test mail sent to ' + a.email : 'Not sent: test mode is on and ' + a.email + ' is not in ADMIN_EMAIL');
  }
  return { subject: out.subject, html: out.html, sent: !!out.sent };
}

/** Writes changed values into the Settings tab (the single source of truth, still editable in the sheet). */
function saveSettings_(values) {
  const sh = ss_().getSheetByName(TAB.SETTINGS);
  const rows = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => String(r[0]).trim());
  const cur = S_(), changed = [];
  SETTINGS_DEFAULTS.forEach(r => {
    const k = r[0];
    if (!values || !(k in values)) return;
    const v = settingValue_(r, values[k]);
    if (v === cur[k] || (v === '' && cur[k] === r[1])) return;
    let i = rows.indexOf(k);
    if (i < 0) { sh.appendRow([k, '', r[2]]); rows.push(k); i = rows.length - 1; }
    sh.getRange(i + 2, 2).setValue(v);
    changed.push(k);
  });
  _settings = null;
  if (!changed.length) return 'Nothing to save: no changes were made.';
  return 'Settings saved: ' + changed.join(', ') + (changed.some(k => k === 'SYNC_EVERY_MINUTES' || k === 'DIGEST_HOUR') ? '\nThe sheet owner needs to run Setup for the new schedule to take effect.' : '');
}

/** One line per dashboard action, like the sync's cycle line (Apps Script › Executions › Cloud logs): total = lockWait + load +
 *  writes (everything else the action did: sheets opened and written, mails) + tracker + publish (the snapshot after it). */
function logAction_(action, outcome, t0, tp, ph) {
  const lockWait = ph.lockWait || 0, load = ph.load || 0, tracker = ph.tracker || 0, end = Date.now();
  console.log(JSON.stringify({ at: 'action', action: String(action).slice(0, 30), outcome: outcome, total: end - t0, lockWait: lockWait, load: load,
    writes: Math.max(0, tp - t0 - lockWait - load - tracker), tracker: tracker, publish: end - tp, snapT: _snapT, mailsSent: _mailsSent }));
}

/** One entry point for every dashboard button. Returns {messages[], result}. args.budgetMs (lock): the Vercel front sends
 *  ~200s so the run ends before its 300s function limit; the old dashboard and the menu keep 270s. */
function webRun(action, args) {
  const a = access_();
  // members and admins in a binome; no script lock, no publish
  if (action === 'memberSet') return { messages: [], result: memberSet_(a, args || {}) };
  if (action === 'interviewGet') return { messages: [], result: interviewGet_(a, args || {}) };
  if (action === 'interviewSave') return { messages: [], result: interviewSave_(a, args || {}) };
  if (a.role !== 'admin') throw new Error('Not allowed');
  if (action === 'setup' && !a.owner) throw new Error('Only the owner (the account that runs the triggers) can run Setup');
  args = args || {};
  // what may have written the Master: published at the end. sync / integrity / digest publish inside their own cycle
  // dropSlice: a publish would put the dropped slice straight back
  const wrote = ['sync', 'integrity', 'digest', 'lockCheck', 'membersRefresh', 'pendingSwitch', 'dropSlice', 'mailPreview'].indexOf(action) < 0 && !args.dryRun &&
    !(action === 'rejections' && !args.send) &&
    !(action === 'quick' && ['locate', 'draft'].indexOf(String(args.op)) >= 0) && !(action === 'binomeAccess' && !args.level);
  let refused = false, outcome = 'ok'; // BUSY: nothing was changed, and the lock holder publishes
  _webOut = [];
  _act = {};
  const t0 = Date.now();
  try {
    let result = null;
    switch (action) {
      // no full sheet check here: it doubled the run (~40 s for 32 sheets) and held the lock; Check integrity and the digest run it
      case 'sync': { const c = runCycle_({ kind: 'dashboard', pull: true, force: true, timing: true, tracker: true });
        if (!c) busy_();
        _webOut.push('Everything is up to date.'); break; }
      // budgetMs: the full sheet check stops in time to end before the Vercel function limit (300s); the next run carries on
      case 'integrity': { const c = runCycle_({ kind: 'dashboard', pull: true, timing: true, tracker: true, integrity: Number(args.budgetMs) || 200000 });
        if (!c) busy_();
        _webOut.push(c.integrityMsg); break; }
      case 'editApply': result = editFixCore_('apply', args.ids); break;
      case 'editRevert': result = editFixCore_('revert', args.ids); break;
      case 'editAccept': result = editFixCore_('accept', args.ids); break;
      case 'importTeam': result = importTeamCore_(args.link, !!args.replace); break;
      case 'draft': draftCore_(!!args.keep); break; // keep: Draw the rest; without: Redraw all
      case 'draftPair': result = draftPair_(args); break;
      case 'draftUnpair': result = draftUnpair_(args); break;
      case 'teamSet': result = teamSet_(args); break;
      case 'lockCheck': result = lockCheck_(); break;
      case 'lock': lockBinomesCore_(args.budgetMs); break;
      case 'reshare': reshareBinomeFiles(); break;
      case 'resetBinomes': { result = resetBinomesCore_(args.phrase);
        if (!result) busy_();
        _webOut.push('Binomes reset. ' + result.binomes + ' binomes removed, ' + result.retired + ' sheets moved to the Retired binomes folder, ' +
          result.interviewees + ' interviewees back to Unassigned, the team list was cleared.\nImport the new team to start again.' +
          (result.failed.length ? '\nNote: ' + result.failed.length + ' sheet(s) could not be moved. Please move them to the Retired binomes folder by hand:\n' + result.failed.slice(0, 5).join('\n') : '')); break; }
      case 'digest': sendDailyDigest(); _webOut.push('Daily summary sent to ' + (adminEmails_().join(', ') || 'nobody yet: add an admin email in Settings')); break;
      case 'reassign': reassignCore_(args.code, args.binome); break;
      case 'changeMember': result = changeMemberCore_(args); break;
      case 'swapMembers': result = swapMembersCore_(args); break;
      case 'newBinome': result = newBinomeCore_(args); break;
      case 'binomeTag': result = binomeTagCore_(args); break;
      case 'addCover': result = addCoverCore_(args); break;
      case 'endCover': result = endCoverCore_(args); break;
      case 'quick': result = quickCore_(String(args.op || ''), args); break;
      case 'binomeAccess': result = binomeAccessCore_(String(args.binome || ''), args.level, a.email); break;
      case 'restore': result = restoreCore_(args.codes); break;
      case 'deleteApplication': result = deleteApplicationCore_(args.code); break;
      case 'membersRefresh': result = membersRefreshCore_(); break;
      case 'rejections': result = rejectionsCore_(args); break;
      case 'mailPreview': result = mailPreviewCore_(a, args); break;
      case 'resolve': _webOut.push(resolveAlertsById_(args.ids) + ' alert(s) marked as resolved'); break;
      case 'saveSettings': _webOut.push(saveSettings_(args.values)); break;
      case 'setup': setup(); break;
      case 'pendingSwitch': result = pendingSwitch_(a, !!args.on); break;
      case 'dropSlice': result = dropSlice_(a, String(args.binome || '')); break;
      default: throw new Error('Unknown action: ' + action);
    }
    return { messages: _webOut.slice(), result: result };
  } catch (e) {
    refused = /^BUSY:/.test(e && e.message);
    outcome = refused ? 'busy' : 'error';
    throw e;
  } finally {
    _webOut = null;
    const tp = Date.now(), ph = _act || {};
    _act = null; // the publish's own lock wait and load count in publish
    if (wrote && !refused) publishFresh_(); // also after a failure halfway: what was written shows
    logAction_(action, outcome, t0, tp, ph);
  }
}
