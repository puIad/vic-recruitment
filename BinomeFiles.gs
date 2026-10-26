/* ---------- binome files ---------- */

const BF_ROWS = 400; // rows formatted (validations, banding, protection) in every binome sheet
const BF_BACKUP = ' (old layout, kept until the upgrade ends)'; // name suffix of the copy kept during a rebuild

function bfCol_(key) { return BF_COL + BF_H.indexOf(key); } // sheet column of a binome-file key

/** The first tab of a binome's file. A sheet still in the first layout is rebuilt in the current one on the way. */
function binomeSheet_(ctx, b) {
  if (!b || !b.fileId) return null;
  if (!ctx.files[b.fileId]) {
    const book = ctx.books[b.fileId] = ctx.books[b.fileId] || SpreadsheetApp.openById(b.fileId), sh = book.getSheets()[0];
    const layout = bfLayout_(sh);
    // a rebuild that stopped half-way left its copy of the old tab: start again from that copy
    // (even under a current header: it may have stopped before Interview Done was ticked back)
    const backup = book.getSheets().filter(x => x !== sh && x.getName().slice(-BF_BACKUP.length) === BF_BACKUP)[0];
    if (backup && bfLayout_(backup) === 'v1') upgradeBinomeSheet_(ctx, b, sh, backup);
    else if (layout === 'v1') upgradeBinomeSheet_(ctx, b, sh);
    ctx.files[b.fileId] = sh;
  }
  return ctx.files[b.fileId];
}

/** 'v2' (current), 'v1' (first layout) or '' (header row changed by hand: left alone, the integrity check reports it). */
function bfLayout_(sh) {
  const width = Math.min(sh.getMaxColumns(), BF_COL - 1 + BF_H.length); // a narrow first-layout sheet has fewer columns
  const row = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(v => String(v).trim());
  if (row.slice(BF_COL - 1).join('|') === BF_HEAD.join('|')) return 'v2';
  if (row.slice(0, BF_H_V1.length).join('|') === BF_H_V1.join('|')) return 'v1';
  return '';
}

/** Last row holding an interviewee (the banner in column A also has text, so getLastRow alone is not enough). */
function bfLastRow_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const codes = sh.getRange(2, BF_COL, n - 1, 1).getValues();
  for (let i = codes.length - 1; i >= 0; i--) if (String(codes[i][0]).trim()) return i + 2;
  return 1;
}

function ivToFileRow_(ctx, r, carry) {
  const I = ctx.iv.I;
  carry = carry || {};
  const done = carry.done === true || String(carry.done).toUpperCase() === 'TRUE';
  const v = { Code: r[I.Code], Registered: r[I['Registered At']], Phone: String(r[I.Phone]), 'Why this department': r[I.Motivation],
    Contacted: carry.contacted || 'Not yet', 'Interview Date': carry.date || '', 'Interview Time': carry.time || '',
    'Interview Done': done, Rating: carry.rating === undefined ? '' : carry.rating, 'Final Affectation': carry.affect || '',
    'Interview Form': carry.form || '', Notes: carry.notes || '' };
  ['First Name', 'Family Name', 'Email', 'Birth Date', 'Facebook', 'Discord', 'Field', 'Year', 'Discovered VIC', 'Why VIC',
    'Other Clubs', '1st Choice', '2nd Choice', 'Department Questions', 'Availability', 'Anything to add'].forEach(h => { v[h] = r[I[h]]; });
  return BF_H.map(h => (v[h] === undefined || v[h] === null ? '' : v[h]));
}

/** What the binome typed for an interviewee in the Master, as a carry for ivToFileRow_ (moves keep it). */
function ivCarry_(ctx, r) {
  const I = ctx.iv.I;
  return { contacted: r[I.Contacted], date: r[I['Interview Date']], time: r[I['Interview Time']], notes: r[I['Binome Notes']],
    done: r[I['Interview Done']], rating: r[I.Rating], affect: r[I['Final Affectation']] };
}

function appendToBinomeFile_(ctx, b, r, carry) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  if (findFileRow_(sh, String(r[ctx.iv.I.Code]).trim()) > 0) return; // already there: a run that died after placing them must not add a blank twin
  sh.getRange(bfLastRow_(sh) + 1, BF_COL, 1, BF_H.length).setValues(plainRows_([ivToFileRow_(ctx, r, carry)], BF_H));
}

function findFileRow_(sh, code) {
  const n = bfLastRow_(sh);
  if (n < 2) return -1;
  const codes = sh.getRange(2, BF_COL, n - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) if (String(codes[i][0]).trim() === code) return i + 2;
  return -1;
}

/** The binome's own cells of one sheet row ({contacted, date, time, done, rating, affect, form, notes}). */
function fileCarry_(vals, disp, F) {
  return { contacted: disp[F.Contacted], date: disp[F['Interview Date']], time: disp[F['Interview Time']], done: vals[F['Interview Done']],
    rating: vals[F.Rating], affect: disp[F['Final Affectation']], form: disp[F['Interview Form']], notes: disp[F.Notes] };
}

/** Run fn (which finds rows of b's sheet and deletes some) holding the members' lock too: memberSet_ finds and writes a row
 *  under it, and a row deleted meanwhile would shift its target onto the next candidate. The caller holds the script lock;
 *  members take it only when there is no document lock, and then it is held here already, so this can't deadlock. */
function withMemberLock_(b, fn) {
  let doc = null;
  try { doc = LockService.getDocumentLock(); } catch (e) { /* no document */ }
  if (doc && !doc.tryLock(10000)) throw new Error('A member is saving in the sheet of ' + b.code + ': nothing was changed, try again.');
  try { return fn(); } finally { if (doc) doc.releaseLock(); }
}

function removeFromBinomeFile_(ctx, b, code) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return {};
  return withMemberLock_(b, () => {
    const row = findFileRow_(sh, code);
    if (row < 0) return {};
    const rng = sh.getRange(row, BF_COL, 1, BF_H.length);
    const carry = fileCarry_(rng.getValues()[0], rng.getDisplayValues()[0], idx_(BF_H));
    sh.deleteRow(row);
    return carry;
  });
}

/** The interview form arrived: show it in the sheet and tick Interview Done. */
function markInterviewInFile_(ctx, b, code, text) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  const row = findFileRow_(sh, code);
  if (row < 0) return;
  sh.getRange(row, bfCol_('Interview Form')).setValue(text);
  sh.getRange(row, bfCol_('Interview Done')).setValue(true);
}

function binomeFileTitle_(b, members) {
  const first = n => String(n || '').trim().split(/\s+/)[0] || '?';
  return '[' + b.code + '] ' + members.map(m => first(m.name)).join(' & ');
}
function binomeFileNote_(b, members) {
  return 'Binome ' + b.code + ' (' + b.tag + ')\n' + members.map(m => m.name).join(' & ') +
    '\n\nGold columns are yours: Contacted, Interview Day (date picker), Time (HH:mm), Interview Done, Rating /10, ' +
    'Final Affectation, Your Notes.\nEverything else is filled automatically.';
}

function houseOf_(tag) {
  const d = String(tag || '').toUpperCase().split(/[^A-Z]+/).filter(x => HOUSE[x] && x !== 'HR')[0];
  return HOUSE[d || 'HR'];
}

/** Column A: who the binome is (row 1), its code (rows 2-7) and its house (row 8). Also used after a member change. */
function setBinomeBanner_(sh, b, members) {
  const h = houseOf_(b.tag);
  sh.getRange(1, 1).setValue(members.map(m => String(m.name || '').trim()).filter(Boolean).join(' & '))
    .setNote(binomeFileNote_(b, members)).setBackground(h.main).setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(2, 1).setValue(b.code); // top cell of the merged block
  sh.getRange(2, 1, 6, 1).merge().setBackground(h.main).setFontColor(h.accent).setFontSize(24)
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(8, 1).setValue(h.name + ' · ' + b.tag).setBackground(h.accent).setFontColor(h.main).setFontWeight('bold')
    .setFontSize(9).setHorizontalAlignment('center').setWrap(true);
}

/** The house colours of a binome sheet, from its tag: banner, header row, gold header cells, code column. Also after a tag change. */
function paintHouse_(sh, b, members) {
  const h = houseOf_(b.tag);
  setBinomeBanner_(sh, b, members);
  sh.getRange(1, BF_COL, 1, BF_H.length).setBackground(h.main).setFontColor('#FFFFFF');
  BF_EDITABLE.forEach(k => sh.getRange(1, bfCol_(k)).setBackground(h.accent).setFontColor(h.main));
  sh.getRange(2, bfCol_('Code'), BF_ROWS - 1, 1).setFontColor(h.main);
}

/** Lay out a blank sheet as a binome sheet: banner, header, formats, validations, colours and protection. */
function formatBinomeSheet_(sh, b, members) {
  const cols = BF_COL - 1 + BF_H.length, F = idx_(BF_H);
  if (sh.getMaxRows() < BF_ROWS) sh.insertRowsAfter(sh.getMaxRows(), BF_ROWS - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  sh.setName(b.code);
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, BF_ROWS, cols).setFontFamily(THEME.font).setFontSize(10).setFontColor(THEME.ink).setVerticalAlignment('middle');
  sh.setColumnWidth(1, 150);

  sh.getRange(1, BF_COL, 1, BF_H.length).setValues([BF_HEAD]).setFontWeight('bold').setWrap(true).setHorizontalAlignment('center');
  sh.setRowHeight(1, 46);
  sh.setFrozenRows(1); sh.setFrozenColumns(BF_COL);

  const body = sh.getRange(2, BF_COL, BF_ROWS - 1, BF_H.length);
  sh.getBandings().forEach(x => x.remove());
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false).setFirstRowColor(THEME.band1).setSecondRowColor(THEME.band2);
  body.setBorder(null, null, true, null, true, true, THEME.line, SpreadsheetApp.BorderStyle.SOLID).setWrap(false);
  const col = k => sh.getRange(2, bfCol_(k), BF_ROWS - 1, 1);
  col('Code').setFontWeight('bold').setHorizontalAlignment('center');
  paintHouse_(sh, b, members);
  ['Year', '1st Choice', '2nd Choice', 'Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation']
    .forEach(k => col(k).setHorizontalAlignment('center'));
  col('Registered').setNumberFormat('dd/mm/yyyy HH:mm');
  col('Birth Date').setNumberFormat('dd/mm/yyyy');
  BF_TEXT_COLS.forEach(k => col(k).setNumberFormat('@'));
  col('Interview Date').setNumberFormat('dd/mm/yyyy').setDataValidation(SpreadsheetApp.newDataValidation().requireDate()
    .setAllowInvalid(false).setHelpText('Double-click to open the date picker').build());
  col('Interview Time').setNumberFormat('HH:mm');
  col('Contacted').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CONTACT_OPTIONS, true).setAllowInvalid(false).build());
  col('Interview Done').insertCheckboxes();
  col('Rating').setNumberFormat('0.#').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 10)
    .setAllowInvalid(false).setHelpText('A mark from 0 to 10').build());
  col('Final Affectation').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(AFFECTATION_OPTIONS, true)
    .setAllowInvalid(false).build());
  const wide = ['Why VIC', 'Other Clubs', 'Why this department', 'Department Questions', 'Anything to add', 'Notes'];
  wide.forEach(k => { col(k).setWrap(true); sh.setColumnWidth(bfCol_(k), 300); });
  const widths = { Code: 80, Registered: 120, 'First Name': 120, 'Family Name': 120, Email: 240, 'Birth Date': 95, Phone: 105,
    Facebook: 180, Discord: 130, Field: 90, Year: 70, 'Discovered VIC': 170, '1st Choice': 80, '2nd Choice': 80, Availability: 170,
    Contacted: 105, 'Interview Date': 105, 'Interview Time': 70, 'Interview Done': 85, Rating: 80, 'Final Affectation': 120, 'Interview Form': 170 };
  Object.keys(widths).forEach(k => sh.setColumnWidth(bfCol_(k), widths[k]));

  const rule = () => SpreadsheetApp.newConditionalFormatRule();
  const cf = [
    rule().whenTextEqualTo('Yes').setBackground('#DCEBDF').setFontColor('#1A472A').setRanges([col('Contacted')]).build(),
    rule().whenTextEqualTo('Not yet').setBackground('#FBEFC8').setFontColor('#6B4E00').setRanges([col('Contacted')]).build(),
    rule().whenTextEqualTo('No answer').setBackground('#F5DCDC').setFontColor('#740001').setRanges([col('Contacted')]).build(),
    rule().whenTextEqualTo('Withdrew').setBackground('#E6E1D8').setFontColor(THEME.muted).setRanges([col('Contacted')]).build(),
    rule().whenTextEqualTo('Not accepted').setBackground('#E6E1D8').setFontColor(THEME.muted).setRanges([col('Final Affectation')]).build(),
    rule().setGradientMinpointWithValue('#F5DCDC', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setGradientMidpointWithValue('#FBEFC8', SpreadsheetApp.InterpolationType.NUMBER, '5')
      .setGradientMaxpointWithValue('#DCEBDF', SpreadsheetApp.InterpolationType.NUMBER, '10').setRanges([col('Rating')]).build(),
  ];
  DEPTS.forEach(d => cf.push(rule().whenTextEqualTo(d).setBackground(HOUSE[d].light).setFontColor(HOUSE[d].main)
    .setRanges([col('1st Choice'), col('2nd Choice'), col('Final Affectation')]).build()));
  sh.setConditionalFormatRules(cf);
  protectBinomeSheet_(sh);
  return F;
}

/** Who a binome sheet's protection lists: whoever runs this, the trigger account (it writes these sheets every sync, and
 *  doesn't own the old ones), the Master's owner and its editors (the admins: the dashboard runs as them, so their Sync now
 *  and their actions write these sheets too). Lower case. */
function protectionEditors_() {
  const keep = [Session.getEffectiveUser().getEmail(), PropertiesService.getScriptProperties().getProperty('TRIGGER_OWNER')];
  try { keep.push(ss_().getOwner().getEmail()); } catch (e) { /* shared drive */ }
  try { ss_().getEditors().forEach(u => keep.push(u.getEmail())); } catch (e) { console.warn('Master editors: ' + e); }
  return keep.filter(Boolean).map(lc_).filter((e, i, a) => a.indexOf(e) === i);
}
/** The accounts of want that none of the sheet protections prots lists. When none can be read, the runner is not one of
 *  their editors, and that is all we know: just the runner. */
function protectionMissing_(prots, want) {
  const have = {}; let unread = false;
  prots.forEach(p => { try { p.getEditors().forEach(u => { have[lc_(u.getEmail())] = true; }); } catch (e) { unread = true; } });
  return unread && !Object.keys(have).length ? [lc_(Session.getEffectiveUser().getEmail())] : want.filter(e => !have[e]);
}

/** Protect everything except the binome's own columns; protectionEditors_ keep access. */
function protectBinomeSheet_(sh) {
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  const p = sh.protect().setDescription('Filled by the recruitment script');
  p.setUnprotectedRanges(BF_EDITABLE.map(k => sh.getRange(2, bfCol_(k), BF_ROWS - 1, 1)));
  const keepLc = protectionEditors_();
  // prune first: a new protection starts open to every editor of the file, so if an add below throws, the sheet is left closed, not open
  p.removeEditors(p.getEditors().filter(u => keepLc.indexOf(lc_(u.getEmail())) < 0));
  if (p.canDomainEdit()) p.setDomainEdit(false);
  keepLc.forEach(e => p.addEditor(e));
}

/** Menu, run as the sheets' owner (only a protection's owner can rewrite it): protect again every binome sheet whose protection
 *  misses the trigger account or an admin, so the sync and the dashboard can write the columns they fill. Run it again after
 *  adding an admin. Safe to repeat: sheets already fine are skipped. */
function reprotectBinomeSheets() {
  const me = lc_(Session.getEffectiveUser().getEmail()), trig = lc_(PropertiesService.getScriptProperties().getProperty('TRIGGER_OWNER') || '');
  let owner = ''; try { owner = lc_(ss_().getOwner().getEmail()); } catch (e) { /* shared drive */ }
  if (me !== owner) return say_('Only the owner of the Master (' + (owner || 'unknown') + ') can re-protect the binome sheets.');
  if (!trig) return say_('TRIGGER_OWNER is not set: run Setup from the account that runs the triggers first, so it is kept as an editor.');
  const want = protectionEditors_(), listed = sh => !protectionMissing_(sh.getProtections(SpreadsheetApp.ProtectionType.SHEET), want).length;
  // under the script lock: a sync running between the old editors going and the trigger account coming back would fail on a permission error
  const msg = withLock_(() => {
    const ctx = loadCtx_(), t0 = Date.now(), errs = []; let done = 0, fine = 0;
    ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
      if (Date.now() - t0 > 240000) { errs.push(b.code + ': out of time, run it again'); return; }
      try { const sh = binomeSheet_(ctx, b); if (listed(sh)) fine++; else { protectBinomeSheet_(sh); done++; } } catch (e) { errs.push(b.code + ': ' + e.message); }
    });
    return 'Protection rewritten on ' + done + ' binome sheet(s); ' + fine + ' already listed ' + trig + ' and every admin.' + (errs.length ? '\n\nNot done:\n' + errs.join('\n') : '');
  });
  if (msg === null) return busy_();
  say_(msg);
}

/* ---------- who can open a binome sheet (Drive advanced service): the dashboard follows the sheet ---------- */

const SHEET_ROLE = { view: 'reader', edit: 'writer' };
// Drive answers "no access" with 404 / 403, but its rate and quota limits are 403s too: those are checked first and rethrown
const NO_ACCESS_RE = /not ?found|404|403|insufficient|permission|forbidden/i;
const DRIVE_BUSY_RE = /rate ?limit|quota|backend ?error|internal error|try again/i;
/** What the signed-in account can do in a sheet: 'edit', 'view', or '' (Drive says it can't open it). Another Drive error
 *  (a rate limit, a timeout, the API off) is thrown, so a hiccup never reads as a revoked member. */
function sheetAccess_(fileId) {
  if (!fileId) return '';
  try {
    const f = Drive.Files.get(fileId, { fields: 'capabilities(canEdit)', supportsAllDrives: true });
    return f.capabilities && f.capabilities.canEdit ? 'edit' : 'view';
  } catch (e) {
    const msg = String(e && e.message);
    if (!DRIVE_BUSY_RE.test(msg) && NO_ACCESS_RE.test(msg)) return '';
    throw e;
  }
}
/** email (lower case) -> {id, level: 'edit' | 'view' | 'owner'} for every person a sheet is shared with. */
function sheetRoles_(fileId) {
  const out = {};
  let token = '';
  do { // every page: a member missed on page 2 could not be found, nor removed
    const opt = { fields: 'nextPageToken,permissions(id,emailAddress,role,type)', supportsAllDrives: true };
    if (token) opt.pageToken = token;
    const page = Drive.Permissions.list(fileId, opt);
    (page.permissions || []).forEach(p => { if (p.type === 'user' && p.emailAddress) out[lc_(p.emailAddress)] = { id: p.id, level: p.role === 'owner' ? 'owner' : p.role === 'writer' ? 'edit' : 'view' }; });
    token = page.nextPageToken || '';
  } while (token);
  return out;
}
/** Give one person exactly `level` ('none' | 'view' | 'edit') on a sheet, without Drive's email. The owner is never touched.
 *  roles: sheetRoles_ of that sheet (kept up to date here). */
function setSheetAccess_(fileId, email, level, roles) {
  const e = lc_(email), p = roles[e], opt = { supportsAllDrives: true };
  if (p && p.level === 'owner') return;
  if (level === 'none') { if (p) { Drive.Permissions.remove(fileId, p.id, opt); delete roles[e]; } return; }
  if (p && p.level === level) return;
  if (p) Drive.Permissions.update({ role: SHEET_ROLE[level] }, fileId, p.id, opt);
  else Drive.Permissions.create({ role: SHEET_ROLE[level], type: 'user', emailAddress: e }, fileId, { sendNotificationEmail: false, supportsAllDrives: true });
  roles[e] = { id: p ? p.id : '', level: level };
}
/** The level an admin opened a binome at from the dashboard (BIN_ACCESS: code -> {level, at, by}). */
function binAccess_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('BIN_ACCESS') || '{}'); } catch (e) { return {}; } }

function createBinomeFile_(b, members) {
  const s = S_();
  const file = SpreadsheetApp.create(binomeFileTitle_(b, members));
  try { file.setSpreadsheetLocale('fr_FR'); } catch (e) { /* ignore */ }
  file.setSpreadsheetTimeZone(s.TIMEZONE);
  DriveApp.getFileById(file.getId()).moveTo(DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID));
  formatBinomeSheet_(file.getSheets()[0], b, members);
  if (bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE)) {
    members.forEach(m => { if (m.email) { try { file.addEditor(m.email); } catch (e) { console.warn('Share failed ' + m.email + ': ' + e); } } });
  }
  return file;
}

/** Rebuild a first-layout sheet in the current one: keep what the binome typed, take everything else from the Master,
 *  keep the sheet's row order, and add any interviewee of the binome that was missing from it. */
function upgradeBinomeSheet_(ctx, b, sh, from) {
  const src = from || sh, V = idx_(BF_H_V1), I = ctx.iv.I, n = src.getLastRow();
  const carry = {}, order = [];
  if (n >= 2) {
    const rng = src.getRange(2, 1, n - 1, BF_H_V1.length), disp = rng.getDisplayValues();
    disp.forEach(d => {
      const code = String(d[V.Code]).trim();
      if (!code || carry[code]) return;
      order.push(code);
      carry[code] = { contacted: d[V.Contacted], date: d[V['Interview Date']], time: d[V['Interview Time']], form: d[V['Interview Form']],
        notes: d[V.Notes], done: !!String(d[V['Interview Form']]).trim() };
    });
  }
  ctx.iv.data.forEach(r => { const c = String(r[I.Code]).trim(); if (c && r[I.Binome] === b.code && order.indexOf(c) < 0) order.push(c); });
  const rows = order.map(c => ctx.ivByCode[c]).filter(r => r && r[I.Binome] === b.code)
    .map(r => ivToFileRow_(ctx, r, carry[String(r[I.Code]).trim()] || ivCarry_(ctx, r)));
  // a copy of the old tab stays until the new rows are written: if anything below fails, what the binome typed is still there
  const book = sh.getParent(), backup = from || sh.copyTo(book).setName(b.code + BF_BACKUP);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  const all = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  all.breakApart().clearDataValidations().clearNote();
  sh.clear();
  sh.setConditionalFormatRules([]);
  if (sh.getMaxColumns() < BF_COL - 1 + BF_H.length) sh.insertColumnsAfter(sh.getMaxColumns(), BF_COL - 1 + BF_H.length - sh.getMaxColumns());
  BF_TEXT_COLS.forEach(k => sh.getRange(2, bfCol_(k), Math.max(rows.length, 1), 1).setNumberFormat('@')); // keep the leading 0 of the numbers
  if (rows.length) sh.getRange(2, BF_COL, rows.length, BF_H.length).setValues(plainRows_(rows, BF_H));
  formatBinomeSheet_(sh, b, b.members);
  // inserting the checkboxes unticked every cell: tick back the interviews already done
  if (rows.length) sh.getRange(2, bfCol_('Interview Done'), rows.length, 1).setValues(rows.map(r => [r[BF_H.indexOf('Interview Done')]]));
  // done: rename the copy first, so if deleting it fails it is never taken for an unfinished rebuild (and edits made
  // since in the new tab are never overwritten from it)
  backup.setName(b.code + ' (old layout, upgrade done: safe to delete)');
  book.deleteSheet(backup);
  ctx.upgraded = (ctx.upgraded || 0) + 1;
  console.log('Binome sheet of ' + b.code + ' moved to the current layout (' + rows.length + ' interviewees)');
}
