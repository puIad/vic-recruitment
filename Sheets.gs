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
function txt_(v) { const s = String(v == null ? '' : v); return s === '' ? '' : "'" + s; } // force plain text
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function idx_(headers) { const o = {}; headers.forEach((h, i) => { o[h] = i; }); return o; }

/** Load a script-managed tab as {sh, H, I, data} (data = rows below the header). */
function loadTable_(name, headers) {
  const sh = ss_().getSheetByName(name);
  const n = sh.getLastRow();
  const data = n > 1 ? sh.getRange(2, 1, n - 1, headers.length).getValues() : [];
  return { sh: sh, H: headers, I: idx_(headers), data: data, originalLength: data.length };
}
function saveTable_(t) {
  if (!t.data.length) return;
  t.sh.getRange(2, 1, t.data.length, t.H.length).setValues(t.data);
}

function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 30000)) { console.warn('Busy: another run holds the lock'); return null; }
  try { return fn(); } finally { lock.releaseLock(); }
}

let _webOut = null; // set by the web dashboard: messages are collected and returned to the page instead of shown in a dialog
function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function say_(msg) { if (_webOut) { _webOut.push(msg); return; } const u = ui_(); if (u) u.alert(msg); else console.log(msg); }
function toast_(msg) { if (_webOut) { _webOut.push(msg); return; } try { ss_().toast(msg, 'VIC Recruitment', 6); } catch (e) { console.log(msg); } }

/* ---------- context: everything a run needs, loaded once ---------- */

function loadCtx_() {
  const ctx = {
    now: new Date(),
    iv: loadTable_(TAB.IV, IV_H),
    log: loadTable_(TAB.LOG, LOG_H),
    bin: loadTable_(TAB.BINOMES, BIN_H),
    team: loadTable_(TAB.TEAM, TEAM_H),
    files: {},          // fileId -> Sheet (cache)
    mailNew: {},        // binomeCode -> [iv rows] newly assigned this run
    alerts: null,
  };
  ctx.alerts = alertBuffer_(ctx);
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
}

function activeBinomes_(ctx) { return ctx.binomes.filter(b => b.status === 'ACTIVE'); }

/* ---------- alerts ---------- */

function alertBuffer_(ctx) {
  const t = loadTable_(TAB.ALERTS, ALERT_H);
  const I = t.I;
  const openKeys = {};
  t.data.forEach(r => { if (r[I.Status] === 'OPEN' && r[I.Key]) openKeys[r[I.Key]] = true; });
  const fresh = [];
  let dirty = false;
  return {
    table: t,
    openKeys: openKeys,
    /** a: {severity, type, code, binome, msg, key, notifyBinome, status} */
    add: function (a) {
      if (a.key && openKeys[a.key]) return false;
      if (a.key) openKeys[a.key] = true;
      fresh.push(a);
      return true;
    },
    resolveWhere: function (pred, status) {
      t.data.forEach(r => {
        if (r[I.Status] === 'OPEN' && pred(r)) { r[I.Status] = status || 'AUTO-RESOLVED'; r[I['Resolved At']] = ctx.now; delete openKeys[r[I.Key]]; dirty = true; }
      });
    },
    flush: function () {
      if (dirty) saveTable_(t);
      if (!fresh.length) return;
      const s = S_();
      const minRank = SEV_RANK[String(s.INSTANT_EMAIL_MIN_SEVERITY).toUpperCase()] || SEV_RANK.MEDIUM;
      const admins = adminEmails_();
      const perRecipient = {};
      const push = (email, a) => { (perRecipient[email] = perRecipient[email] || []).push(a); };
      let n = t.data.length;
      const rows = fresh.map(a => {
        n++;
        const to = [];
        const instant = SEV_RANK[a.severity] >= minRank && a.status !== 'AUTO-FIXED';
        if (instant) admins.forEach(e => { push(e, a); to.push(e); });
        if (instant && a.notifyBinome && bool_(s.NOTIFY_BINOME_ON_ALERT) && ctx.binByCode[a.binome]) {
          ctx.binByCode[a.binome].members.forEach(m => { if (m.email) { push(m.email, a); if (to.indexOf(m.email) < 0) to.push(m.email); } });
        }
        return ['A-' + ('0000' + n).slice(-4), ctx.now, a.severity, a.type, a.code || '', a.binome || '', a.msg,
          to.join(', '), a.status || 'OPEN', a.status && a.status !== 'OPEN' ? ctx.now : '', a.key || ''];
      });
      t.sh.getRange(t.sh.getLastRow() + 1, 1, rows.length, ALERT_H.length).setValues(rows);
      rows.forEach(r => t.data.push(r));
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

function mail_(to, subject, html) {
  if (bool_(S_().TEST_MODE) && adminEmails_().map(e => e.toLowerCase()).indexOf(String(to).trim().toLowerCase()) < 0) {
    console.log('TEST_MODE: email to ' + to + ' not sent: ' + subject);
    return;
  }
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'VIC Recruitment Bot' });
  } catch (e) { console.error('Mail to ' + to + ' failed: ' + e); }
}
