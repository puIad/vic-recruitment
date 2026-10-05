/* =============================================================================
 * SETUP, MENU AND MANUAL ACTIONS
 * ===========================================================================*/

function onOpen() {
  SpreadsheetApp.getUi().createMenu('VIC Recruitment')
    .addItem('1 · Import organizing team…', 'importTeam')
    .addItem('2 · Draft binomes (random, for review)', 'draftBinomes')
    .addItem('3 · Lock binomes & create their sheets', 'lockBinomes')
    .addSeparator()
    .addItem('Sync now', 'syncAllForce')
    .addItem('Check integrity of the binome sheets', 'integrityCheck')
    .addItem('Reassign selected interviewee…', 'reassignSelected')
    .addItem('Mark selected alerts as resolved', 'resolveSelectedAlerts')
    .addItem('Re-share binome sheets with current members', 'reshareBinomeFiles')
    .addItem('Send me the digest now', 'sendDailyDigest')
    .addSeparator()
    .addItem('Run setup again (safe)', 'setup')
    .addToUi();
}

function setup() {
  const ss = ss_();
  triggerOwner_(); // refuse before touching anything: a half-run Setup from the wrong account would leave the Master half-built
  PropertiesService.getScriptProperties().setProperty('MASTER_ID', ss.getId());
  ensureTabs_(ss);
  _settings = null;
  ss.setSpreadsheetTimeZone(S_().TIMEZONE);
  const formNotes = linkForms_(ss);
  installTriggers_(ss);
  cleanupAndOrder_(ss);
  styleMaster_(ss);
  runCycle_({ kind: 'setup', pull: false, timing: false, tracker: true });
  say_('Setup complete.\n\n' + formNotes.join('\n') +
    '\n\nNext steps:\n1. Check the Settings tab (ADMIN_EMAIL etc.).\n2. VIC Recruitment › 1 · Import organizing team (or fill the Team tab).\n' +
    '3. VIC Recruitment › 2 · Draft binomes, review/edit them in the Binomes tab.\n4. VIC Recruitment › 3 · Lock binomes.\n5. Open the registration form.');
}

function ensureTabs_(ss) {
  const mk = (name, headers) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (headers) {
      if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
    return sh;
  };
  // Settings
  const st = mk(TAB.SETTINGS, ['Setting', 'Value', 'What it does']);
  const have = {};
  if (st.getLastRow() > 1) {
    // Descriptions belong to the code: refresh them, never touch the values
    const help = {}; SETTINGS_DEFAULTS.forEach(r => { help[r[0]] = r[2]; });
    const rows = st.getRange(2, 1, st.getLastRow() - 1, 3).getValues();
    rows.forEach(r => { have[r[0]] = true; });
    st.getRange(2, 3, rows.length, 1).setValues(rows.map(r => [help[r[0]] || r[2]]));
  }
  const add = SETTINGS_DEFAULTS.filter(r => !have[r[0]]).map(r => [r[0], r[0] === 'ADMIN_EMAIL' ? Session.getEffectiveUser().getEmail() : r[1], r[2]]);
  if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add);
  st.setColumnWidth(1, 260); st.setColumnWidth(2, 220); st.setColumnWidth(3, 620);

  // Team
  const tm = mk(TAB.TEAM, TEAM_H);
  tm.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['HR', 'IT', 'COMM', 'FLER', 'ALL', 'SKIP'], true).setAllowInvalid(false).build());
  tm.getRange('E2:E500').insertCheckboxes();
  tm.getRange(1, 5).setNote('Tick to leave this member out of the binomes (e.g. the president).');
  tm.getRange(1, 4).setNote('Pair As: HR = HR side of a binome; IT/COMM/FLER = other side; ALL = board member leading an "ALL" binome; SKIP = not interviewing.');
  // Binomes
  const bn = mk(TAB.BINOMES, BIN_H);
  bn.getRange('G2:G300').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['DRAFT', 'ACTIVE', 'PAUSED'], true).setAllowInvalid(false).build());
  bn.getRange(1, 7).setNote('DRAFT = not created yet · ACTIVE = receives interviewees · PAUSED = keeps its interviewees but gets no new ones.');
  bn.getRange(1, 6).setNote('Tag decides who they receive: "IT & HR" = IT and HR candidates, "ALL" = everyone.');
  // Interviewees (script-managed)
  const iv = mk(TAB.IV, IV_H);
  const I = idx_(IV_H);
  ['Code', 'Phone', 'Facebook', 'Discord', 'Year', 'Interview Date', 'Interview Time', 'Response Key'].forEach(h => {
    iv.getRange(2, I[h] + 1, iv.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  ['Registered At', 'Assigned At', 'Contacted Seen At', 'Interview At', 'Interview Submitted At'].forEach(h => {
    iv.getRange(2, I[h] + 1, iv.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  });
  iv.getRange(2, I['Birth Date'] + 1, iv.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
  iv.setFrozenColumns(3);
  if (!iv.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    iv.protect().setDescription('Managed by the script — use the menu to reassign').setWarningOnly(true);
  }
  // Interview log
  const lg = mk(TAB.LOG, LOG_H);
  lg.getRange('C2:D').setNumberFormat('@');
  lg.getRange('A2:A').setNumberFormat('dd/mm/yyyy HH:mm');
  lg.getRange('G2:G').clearDataValidations();
  lg.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('FLAGGED').setBackground('#f4cccc').setRanges([lg.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('AUTOCORRECTED').setBackground('#fff2cc').setRanges([lg.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('OK').setBackground('#d9ead3').setRanges([lg.getRange('G2:G')]).build(),
  ]);
  // Alerts
  const al = mk(TAB.ALERTS, ALERT_H);
  al.getRange('I2:I').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['OPEN', 'RESOLVED', 'AUTO-RESOLVED', 'AUTO-FIXED', 'SNOOZED', 'MUTED'], true).setAllowInvalid(true).build());
  al.getRange('B2:B').setNumberFormat('dd/mm/yyyy HH:mm'); al.getRange('J2:J').setNumberFormat('dd/mm/yyyy HH:mm');
  al.setColumnWidth(7, 520); al.getRange('G2:G').setWrap(true);
  al.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I2="OPEN",$C2="HIGH")').setBackground('#f4cccc').setRanges([al.getRange('A2:K')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I2="OPEN",$C2="MEDIUM")').setBackground('#fce5cd').setRanges([al.getRange('A2:K')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$I2<>"OPEN"').setFontColor('#999999').setRanges([al.getRange('A2:K')]).build(),
  ]);
  mk(TAB.CHANGES, MC_H);
  mk(TAB.TRACKER, null);
}

function linkForms_(ss) {
  const props = PropertiesService.getScriptProperties();
  const notes = [];
  [['REG', CONFIG.REGISTRATION_FORM_ID, TAB.REG_RESP], ['INT', CONFIG.INTERVIEW_FORM_ID, TAB.INT_RESP]].forEach(x => {
    const key = x[0] + '_SHEET_ID', id = x[1], name = x[2];
    const known = props.getProperty(key);
    if (known && ss.getSheets().some(sh => String(sh.getSheetId()) === known)) { notes.push('• ' + name + ': already linked'); return; }
    const form = FormApp.openById(id);
    try { if (/2025/.test(form.getTitle())) form.setTitle(form.getTitle().replace(/2025/g, '2026')); } catch (e) { /* ignore */ }
    if (x[0] === 'INT') {
      form.getItems().forEach(it => {
        const t = normText(it.getTitle());
        if (t.indexOf('binome code') >= 0) it.setHelpText('Your binome code, e.g. B.05 (it is in the title of your binome sheet).');
        if (t.indexOf('interviewee code') >= 0) it.setHelpText('The code in the "Their Code" column of your binome sheet, e.g. IT.58 or COMM.12.');
      });
    }
    let sheet = ss.getSheets().filter(sh => { const u = sh.getFormUrl(); return u && u.indexOf(id) >= 0; })[0];
    if (!sheet) {
      const before = ss.getSheets().map(sh => sh.getSheetId());
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
      SpreadsheetApp.flush();
      Utilities.sleep(1500);
      sheet = SpreadsheetApp.openById(ss.getId()).getSheets().filter(sh => before.indexOf(sh.getSheetId()) < 0)[0];
    }
    if (sheet) {
      sheet.setName(name);
      props.setProperty(key, String(sheet.getSheetId()));
      notes.push('• ' + name + ': linked to "' + form.getTitle() + '" → ' + form.getPublishedUrl());
    } else notes.push('• ' + name + ': could not find the response tab. Please run Setup again.');
  });
  return notes;
}

/**
 * Installable triggers belong to whoever installs them, and getProjectTriggers() only lists the caller's own, so a
 * second account running Setup would silently double every sync and digest. Only the trigger owner may (re)install:
 * script property TRIGGER_OWNER. Unset (first Setup, or a handover), the account running Setup takes it, so it need not
 * own the Master. Handover: delete the owner's three triggers and the property, then run Setup from the new account.
 */
function triggerOwner_() {
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const props = PropertiesService.getScriptProperties();
  const owner = String(props.getProperty('TRIGGER_OWNER') || me).toLowerCase();
  if (owner !== me) throw new Error('The triggers belong to ' + owner + ': run Setup from that account (to hand them over, delete the TRIGGER_OWNER script property, then run Setup).');
  props.setProperty('TRIGGER_OWNER', me);
  return me;
}

function installTriggers_(ss) {
  triggerOwner_();
  const s = S_();
  const mine = ['onFormSubmitHandler', 'syncAll', 'sendDailyDigest'];
  ScriptApp.getProjectTriggers().forEach(t => { if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmitHandler').forSpreadsheet(ss).onFormSubmit().create();
  const allowed = [1, 5, 10, 15, 30];
  const want = num_(s.SYNC_EVERY_MINUTES, 15);
  const every = allowed.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(every).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(Math.max(0, Math.min(23, num_(s.DIGEST_HOUR, 8))))
    .everyDays(1).inTimezone(s.TIMEZONE).create();
}

function cleanupAndOrder_(ss) {
  ss.getSheets().forEach(sh => {
    if (/^(Sheet1|Feuille 1|Feuille1)$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  [TAB.TRACKER, TAB.ALERTS, TAB.IV, TAB.BINOMES, TAB.CHANGES, TAB.TEAM, TAB.LOG, TAB.SETTINGS, TAB.REG_RESP, TAB.INT_RESP].forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  });
  ss.setActiveSheet(ss.getSheetByName(TAB.TRACKER));
}

/* ---------- the Master's look ---------- */

// Tab colours: one Hogwarts colour per tab family
const TAB_COLOR = { Tracker: '#D3A625', Alerts: '#740001', Interviewees: '#0E1A40', Binomes: '#1A472A', 'Member Changes': '#946B2D',
  Team: '#ECB939', 'Interview Log': '#5D5D5D', Settings: '#372E29', 'Registration Responses': '#B08D57', 'Interview Responses': '#B08D57' };

/** Montserrat, a scarlet-and-gold header row and parchment bands on one tab. Only formats: safe to re-run. */
function styleTab_(sh, nCols) {
  const rows = Math.max(sh.getMaxRows(), 2), cols = Math.max(nCols || sh.getLastColumn(), 1);
  sh.getRange(1, 1, rows, cols).setFontFamily(THEME.font).setFontSize(10).setFontColor(THEME.ink).setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, cols).setBackground(THEME.head).setFontColor(THEME.headInk).setFontWeight('bold').setWrap(true)
    .setHorizontalAlignment('center');
  sh.setRowHeight(1, 38);
  sh.getBandings().forEach(b => b.remove());
  sh.getRange(2, 1, rows - 1, cols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
    .setFirstRowColor(THEME.band1).setSecondRowColor(THEME.band2);
  sh.getRange(2, 1, rows - 1, cols).setBorder(null, null, null, null, true, null, THEME.line, SpreadsheetApp.BorderStyle.SOLID);
  sh.setHiddenGridlines(true);
  if (TAB_COLOR[sh.getName()]) sh.setTabColor(TAB_COLOR[sh.getName()]);
}

/** Every tab of the Master except the Tracker (rebuilt in the theme by buildTracker_ every run). */
function styleMaster_(ss) {
  const widths = { [TAB.IV]: IV_H.length, [TAB.BINOMES]: BIN_H.length, [TAB.TEAM]: TEAM_H.length, [TAB.LOG]: LOG_H.length,
    [TAB.ALERTS]: ALERT_H.length, [TAB.CHANGES]: MC_H.length, [TAB.SETTINGS]: 3 };
  ss.getSheets().forEach(sh => {
    if (sh.getName() === TAB.TRACKER) return;
    try { styleTab_(sh, widths[sh.getName()]); } catch (e) { console.warn('Style of ' + sh.getName() + ': ' + e); }
  });
  const iv = ss.getSheetByName(TAB.IV);
  if (iv) {
    const I = idx_(IV_H), rows = iv.getMaxRows() - 1, col = h => iv.getRange(2, I[h] + 1, rows, 1);
    const rule = () => SpreadsheetApp.newConditionalFormatRule();
    const cf = DEPTS.map(d => rule().whenTextEqualTo(d).setBackground(HOUSE[d].light).setFontColor(HOUSE[d].main)
      .setRanges([col('1st Choice'), col('2nd Choice'), col('Final Affectation')]).build());
    [[ST.INTERVIEWED, '#DCEBDF', '#1A472A'], [ST.SCHEDULED, '#DDE3F0', '#0E1A40'], [ST.CONTACTED, '#FBEFC8', '#6B4E00'],
      [ST.ASSIGNED, '#FFFDF7', THEME.ink], [ST.WITHDRAWN, '#E6E1D8', THEME.muted], [ST.DUPLICATE, '#E6E1D8', THEME.muted],
      [ST.UNASSIGNED, '#F5DCDC', '#740001']].forEach(x => cf.push(rule().whenTextEqualTo(x[0]).setBackground(x[1]).setFontColor(x[2])
      .setBold(true).setRanges([col('Status')]).build()));
    cf.push(rule().setGradientMinpointWithValue('#F5DCDC', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMidpointWithValue('#FBEFC8', SpreadsheetApp.InterpolationType.NUMBER, '5')
      .setGradientMaxpointWithValue('#DCEBDF', SpreadsheetApp.InterpolationType.NUMBER, '10').setRanges([col('Rating')]).build());
    iv.setConditionalFormatRules(cf);
    iv.getRange(1, I.Code + 1, rows + 1, 2).setFontWeight('bold');
  }
}
