/* =============================================================================
 * GOOGLE SHEETS PLUMBING
 * ===========================================================================*/

function ss_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) { /* no active */ }
  if (!ss) {
    const id = PropertiesService.getScriptProperties().getProperty('MASTER_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  return ss;
}

let _settings = null;
function S_() {
  if (_settings) return _settings;
  const o = {};
  SETTINGS_DEFAULTS.forEach(r => { o[r[0]] = r[1]; });
  const sh = ss_().getSheetByName(TAB.SETTINGS);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      if (String(r[0]).trim() && r[1] !== '') o[String(r[0]).trim()] = r[1];
    });
  }
  o.TIMEZONE = String(o.TIMEZONE || 'Africa/Algiers');
  _settings = o;
  return o;
}
function bool_(v) { return v === true || /^(true|yes|oui|1|vrai)$/i.test(String(v).trim()); }
function num_(v, d) { const n = Number(v); return isNaN(n) || v === '' ? d : n; }
function adminEmails_() {
  return String(S_().ADMIN_EMAIL || '').split(/[,;\s]+/).map(e => e.trim()).filter(e => /@/.test(e));
}
function tzOffset_() { return Utilities.formatDate(new Date(), S_().TIMEZONE, 'XXX'); }
function fmt_(d, pattern) {
  if (!(d instanceof Date) || isNaN(d)) return String(d || '');
  return Utilities.formatDate(d, S_().TIMEZONE, pattern || 'dd/MM/yyyy HH:mm');
}
/** FNV-1a (32 bits) plus the length: tells two snapshots apart (publishState_); not for anything secret. */
function hash_(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + '.' + s.length;
}
const PROP_CHUNK = 4000; // characters per script property: a value holds 9 KB and accented letters take 2 bytes
/** A long string kept in script properties <name>_0..n-1, with <name>_N = n (the baseline, the member map). */
function savePropChunks_(name, s) {
  const p = PropertiesService.getScriptProperties();
  const oldN = Number(p.getProperty(name + '_N') || 0), n = Math.max(1, Math.ceil(s.length / PROP_CHUNK));
  const vals = {}; vals[name + '_N'] = String(n);
  for (let i = 0; i < n; i++) vals[name + '_' + i] = s.slice(i * PROP_CHUNK, (i + 1) * PROP_CHUNK);
  p.setProperties(vals);
  for (let i = n; i < oldN; i++) p.deleteProperty(name + '_' + i);
}
/** The string savePropChunks_ kept, or null when there is none. */
function loadPropChunks_(name) {
  const all = PropertiesService.getScriptProperties().getProperties(), n = Number(all[name + '_N'] || 0);
  if (!n) return null;
  let s = '';
  for (let i = 0; i < n; i++) s += all[name + '_' + i] || '';
  return s;
}
function txt_(v) { const s = String(v == null ? '' : v); return s === '' ? '' : "'" + s; } // force plain text
/** A Drive error, readable. "enabling APIs" = the Drive API is off in the script's Cloud project: no sharing fix helps. */
function driveErr_(e) {
  const m = String(e && e.message || e);
  return /enabling APIs/i.test(m) ? 'the Google Drive API is off in the Cloud project of the script: its owner must enable it' +
    ' (Cloud Console › APIs & Services › Library › Google Drive API) — ' + m : m;
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function idx_(headers) { const o = {}; headers.forEach((h, i) => { o[h] = i; }); return o; }

/** Load a script-managed tab as {sh, H, I, data} (data = rows below the header). */
function loadTable_(name, headers) {
  const sh = ss_().getSheetByName(name);
  addMissingColumns_(sh, headers);
  const n = sh.getLastRow();
  const data = n > 1 ? sh.getRange(2, 1, n - 1, headers.length).getValues() : [];
  return { sh: sh, H: headers, I: idx_(headers), data: data, originalLength: data.length, orig: data.map(r => r.slice()) };
}
/** Columns added to a tab's headers in a later version: give the tab room and their header cells, at the end. */
function addMissingColumns_(sh, headers) {
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  const have = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const from = have.findIndex((v, i) => String(v).trim() !== headers[i]);
  if (from >= 0 && have.slice(from).every(v => v === '')) sh.getRange(1, from + 1, 1, headers.length - from).setValues([headers.slice(from)]);
}
function sameVal_(a, b) { return a === b || (a instanceof Date && b instanceof Date && a.getTime() === b.getTime()); }
/** v (about to be written) equals cell (read from the tab) only when sure: sameVal_, or text forced with txt_ against that text
 *  read back. A number against the same number as text is different: a doubt costs a useless write, never a lost one. */
function sameCell_(v, cell) {
  return sameVal_(v, cell) || (typeof v === 'string' && typeof cell === 'string' && v[0] === "'" && v.slice(1) === cell);
}
/** Write the table back, matching rows by key (Response Key, else the first column) and writing only the cells the script
 *  changed: a cell typed while the run was going keeps the hand value, a row deleted meanwhile stays deleted and a row
 *  inserted meanwhile stays (the baseline still has the old state, so the next run flags them). New rows go at the end.
 *  Only the rows that differ from the tab are written, in contiguous blocks: nothing changed, no write. */
function saveTable_(t) {
  if (!t.data.length) return;
  const kc = t.I['Response Key'] !== undefined ? t.I['Response Key'] : 0;
  const key = r => String(r[kc]);
  const n = t.sh.getLastRow() - 1;
  const now = n > 0 ? t.sh.getRange(2, 1, n, t.H.length).getValues() : [];
  const at = {};
  now.forEach((r, i) => { const k = key(r); if (k) at[k] = k in at ? -1 : i; }); // -1: the key is on several rows
  const out = now.slice(), added = [];
  t.data.forEach((r, i) => {
    const o = i < t.orig.length ? t.orig[i] : null, k = key(o || r), p = k ? at[k] : undefined;
    // a loaded row that is gone was deleted by hand meanwhile; one without a key (typed by hand) or whose key was
    // copied onto another row is left as it is
    if (p === undefined) { if (!o) added.push(r); return; }
    if (p < 0) return;
    out[p] = o ? r.map((v, j) => (sameVal_(v, o[j]) ? now[p][j] : v)) : r;
  });
  const all = out.concat(added);
  let from = -1;
  for (let i = 0; i <= all.length; i++) {
    const differs = i < all.length && (i >= now.length || all[i].some((v, j) => !sameCell_(v, now[i][j])));
    if (differs && from < 0) from = i;
    if (!differs && from >= 0) { t.sh.getRange(2 + from, 1, i - from, t.H.length).setValues(all.slice(from, i)); from = -1; }
  }
}

let _lockWait = 0; // ms the last withLock_ waited for the lock (runCycle_ logs it)
function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock(), t0 = Date.now();
  const got = lock.tryLock(waitMs || 30000);
  _lockWait = Date.now() - t0;
  if (!got) { console.warn('Busy: another run holds the lock (waited ' + _lockWait + ' ms)'); return null; }
  try { return fn(); } finally { lock.releaseLock(); }
}

let _webOut = null; // set by the web dashboard: messages are collected and returned to the page instead of shown in a dialog
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function say_(msg) { if (_webOut) { _webOut.push(msg); return; } const u = ui_(); if (u) u.alert(msg); else console.log(msg); }
/** A refused lock (withLock_ returned null; nothing was changed). From the dashboard it is an error the page shows as one: the
 *  proxy turns the BUSY: prefix into code 'BUSY'. From the menu it stays a dialog. */
function busy_() {
  if (_webOut) throw new Error('BUSY: Another update is running. Nothing was changed: try again in a minute.');
  say_('Another update is already running. Please try again in a minute.');
}
function toast_(msg) { if (_webOut) { _webOut.push(msg); return; } try { ss_().toast(msg, 'VIC Recruitment', 6); } catch (e) { console.log(msg); } }

/* ---------- context: everything a run needs, loaded once ---------- */

function loadCtx_() {
  const ctx = {
    now: new Date(),
    iv: loadTable_(TAB.IV, IV_H),
    log: loadTable_(TAB.LOG, LOG_H),
    bin: loadTable_(TAB.BINOMES, BIN_H),
    team: loadTable_(TAB.TEAM, TEAM_H),
    files: {},          // fileId -> first Sheet (cache)
    books: {},          // fileId -> Spreadsheet (cache)
    mailNew: {},        // binomeCode -> [iv rows] newly assigned this run
    alerts: null,
    snapVer: Number(PropertiesService.getScriptProperties().getProperty('SNAP_VER') || 0), // publishState_: was it dropped since?
  };
  ctx.alerts = alertBuffer_(ctx);
  ctx.covers = loadCovers_();
  indexCtx_(ctx);
  return ctx;
}

function indexCtx_(ctx) {
  const I = ctx.iv.I, B = ctx.bin.I;
  ctx.ivByCode = {}; ctx.ivKeys = {};
  ctx.iv.data.forEach(r => {
    if (r[I.Code]) ctx.ivByCode[String(r[I.Code]).trim()] = r;
    if (r[I['Response Key']]) ctx.ivKeys[r[I['Response Key']]] = true;
  });
  ctx.logKeys = {};
  ctx.log.data.forEach(r => { if (r[ctx.log.I['Response Key']]) ctx.logKeys[r[ctx.log.I['Response Key']]] = true; });
  ctx.binomes = ctx.bin.data.filter(r => String(r[B.Binome]).trim()).map(r => ({
    code: String(r[B.Binome]).trim(), tag: String(r[B.Tag]).trim(), status: String(r[B.Status]).trim().toUpperCase(),
    fileId: String(r[B['File ID']]).trim(), fileUrl: String(r[B.File]).trim(),
    members: [[r[B['Member 1']], r[B['Email 1']]], [r[B['Member 2']], r[B['Email 2']]]]
      .filter(m => String(m[0]).trim() || String(m[1]).trim())
      .map(m => ({ name: String(m[0]).trim(), email: String(m[1]).trim().toLowerCase() })),
    row: r,
  }));
  ctx.binByCode = {}; ctx.binomes.forEach(b => { ctx.binByCode[b.code] = b; });
  ctx.nameByEmail = {};
  ctx.team.data.forEach(r => { const e = String(r[ctx.team.I.Email]).trim().toLowerCase(); if (e) ctx.nameByEmail[e] = String(r[ctx.team.I['Full Name']]).trim(); });
  ctx.binomes.forEach(b => b.members.forEach(m => { if (m.email && !ctx.nameByEmail[m.email]) ctx.nameByEmail[m.email] = m.name; }));
  ctx.coverMap = coverMap_(ctx);
}

function activeBinomes_(ctx) { return ctx.binomes.filter(b => b.status === 'ACTIVE'); }

/* ---------- alerts ---------- */

function alertBuffer_(ctx) {
  const t = loadTable_(TAB.ALERTS, ALERT_H);
  const I = t.I;
  const openKeys = {}, held = {}; // held: keys of SNOOZED / MUTED alerts, never raised again while held
  let dirty = false;
  t.data.forEach(r => {
    // a snooze that ran out opens its alert again (Resolved At holds the snooze end)
    if (r[I.Status] === 'SNOOZED' && !(r[I['Resolved At']] > ctx.now)) { r[I.Status] = 'OPEN'; r[I['Resolved At']] = ''; dirty = true; }
    if (!r[I.Key]) return;
    if (r[I.Status] === 'OPEN') openKeys[r[I.Key]] = true;
    if (HELD_STATUSES.indexOf(r[I.Status]) >= 0) held[r[I.Key]] = true;
  });
  const fresh = [];
  return {
    table: t,
    openKeys: openKeys,
    /** a: {severity, type, code, binome, msg, key, notifyBinome, status} */
    add: function (a) {
      if (a.key && (openKeys[a.key] || held[a.key])) return false;
      if (a.key) openKeys[a.key] = true;
      fresh.push(a);
      return true;
    },
    /** Closes open alerts, and snoozed ones whose problem went away (a muted alert stays muted). */
    resolveWhere: function (pred, status) {
      t.data.forEach(r => {
        if ((r[I.Status] === 'OPEN' || r[I.Status] === 'SNOOZED') && pred(r)) {
          r[I.Status] = status || 'AUTO-RESOLVED'; r[I['Resolved At']] = ctx.now; delete openKeys[r[I.Key]]; delete held[r[I.Key]]; dirty = true;
        }
      });
    },
    /** OPEN, SNOOZED (at = until when) or MUTED, for one loaded row. */
    setStatus: function (r, status, at) {
      const k = r[I.Key];
      r[I.Status] = status; r[I['Resolved At']] = at || '';
      if (k) { delete openKeys[k]; delete held[k]; if (status === 'OPEN') openKeys[k] = true; else if (HELD_STATUSES.indexOf(status) >= 0) held[k] = true; }
      dirty = true;
    },
    touch: function () { dirty = true; },
    flush: function () {
      if (dirty) saveTable_(t);
      if (!fresh.length) return;
      const s = S_();
      const minRank = SEV_RANK[String(s.INSTANT_EMAIL_MIN_SEVERITY).toUpperCase()] || SEV_RANK.MEDIUM;
      const admins = adminEmails_();
      const perRecipient = {};
      // one copy of each alert per person, even if they are admin + member + cover, or cover the same interviewee twice
      const push = (email, a) => { const list = perRecipient[email] = perRecipient[email] || []; if (list.indexOf(a) < 0) list.push(a); };
      let n = t.data.length;
      const rows = fresh.map(a => {
        n++;
        const to = [];
        const instant = SEV_RANK[a.severity] >= minRank && a.status !== 'AUTO-FIXED';
        if (instant) admins.forEach(e => { push(e, a); to.push(e); });
        if (instant && a.notifyBinome && bool_(s.NOTIFY_BINOME_ON_ALERT) && ctx.binByCode[a.binome]) {
          ctx.binByCode[a.binome].members.forEach(m => { if (m.email) { push(m.email, a); if (to.indexOf(m.email) < 0) to.push(m.email); } });
          (ctx.coverMap[a.code] || []).forEach(e => { push(e, a); if (to.indexOf(e) < 0) to.push(e); }); // whoever covers that interviewee
        }
        return ['A-' + ('0000' + n).slice(-4), ctx.now, a.severity, a.type, a.code || '', a.binome || '', a.msg,
          to.join(', '), a.status || 'OPEN', a.status && a.status !== 'OPEN' ? ctx.now : '', a.key || ''];
      });
      t.sh.getRange(t.sh.getLastRow() + 1, 1, rows.length, ALERT_H.length).setValues(rows);
      rows.forEach(r => { t.data.push(r); t.orig.push(r.slice()); }); // written: a later save merges them like loaded rows
      Object.keys(perRecipient).forEach(email => {
        const list = perRecipient[email];
        const isAdmin = admins.indexOf(email) >= 0;
        const html = '<p>' + (isAdmin ? 'New recruitment alert(s):' : 'Hi! Something needs your attention in the recruitment process:') + '</p>' +
          '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:13px">' +
          list.map(a => '<tr style="border-bottom:1px solid #ddd"><td><b style="color:' + (a.severity === 'HIGH' ? '#c62828' : a.severity === 'MEDIUM' ? '#ef6c00' : '#555') + '">' +
            a.severity + '</b></td><td>' + esc_(a.type) + '</td><td>' + esc_(a.code || '') + '</td><td>' + esc_(a.msg) + '</td></tr>').join('') +
          '</table>' + (isAdmin ? '<p><a href="' + ss_().getUrl() + '">Open the master sheet</a></p>' :
          (ctx.binByCode[list[0].binome] && ctx.binByCode[list[0].binome].fileUrl ? '<p><a href="' + ctx.binByCode[list[0].binome].fileUrl + '">Open your binome sheet</a></p>' : ''));
        mail_(email, '[VIC Recruitment] ' + list.length + ' alert' + (list.length > 1 ? 's' : '') + (list.some(a => a.severity === 'HIGH') ? ' (HIGH)' : ''), html);
      });
      fresh.length = 0;
    },
  };
}

let _mailsSent = 0; // calls of mail_() since runCycle_ reset it (TEST_MODE skips count too)
function mail_(to, subject, html) {
  _mailsSent++;
  if (bool_(S_().TEST_MODE) && adminEmails_().map(e => e.toLowerCase()).indexOf(String(to).trim().toLowerCase()) < 0) {
    console.log('TEST_MODE: email to ' + to + ' not sent: ' + subject);
    return;
  }
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'VIC Recruitment Bot' });
  } catch (e) { console.error('Mail to ' + to + ' failed: ' + e); }
}
