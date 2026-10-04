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
  sh.getRange(bfLastRow_(sh) + 1, BF_COL, 1, BF_H.length).setValues([ivToFileRow_(ctx, r, carry)]);
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

function removeFromBinomeFile_(ctx, b, code) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return {};
  const row = findFileRow_(sh, code);
  if (row < 0) return {};
  const rng = sh.getRange(row, BF_COL, 1, BF_H.length);
  const carry = fileCarry_(rng.getValues()[0], rng.getDisplayValues()[0], idx_(BF_H));
  sh.deleteRow(row);
  return carry;
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

/** Lay out a blank sheet as a binome sheet: banner, header, formats, validations, colours and protection. */
function formatBinomeSheet_(sh, b, members) {
  const h = houseOf_(b.tag), cols = BF_COL - 1 + BF_H.length, F = idx_(BF_H);
  if (sh.getMaxRows() < BF_ROWS) sh.insertRowsAfter(sh.getMaxRows(), BF_ROWS - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  sh.setName(b.code);
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, BF_ROWS, cols).setFontFamily(THEME.font).setFontSize(10).setFontColor(THEME.ink).setVerticalAlignment('middle');
  setBinomeBanner_(sh, b, members);
  sh.setColumnWidth(1, 150);

  sh.getRange(1, BF_COL, 1, BF_H.length).setValues([BF_HEAD]).setBackground(h.main).setFontColor('#FFFFFF').setFontWeight('bold')
    .setWrap(true).setHorizontalAlignment('center');
  BF_EDITABLE.forEach(k => sh.getRange(1, bfCol_(k)).setBackground(h.accent).setFontColor(h.main));
  sh.setRowHeight(1, 46);
  sh.setFrozenRows(1); sh.setFrozenColumns(BF_COL);

  const body = sh.getRange(2, BF_COL, BF_ROWS - 1, BF_H.length);
  sh.getBandings().forEach(x => x.remove());
  body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false).setFirstRowColor(THEME.band1).setSecondRowColor(THEME.band2);
  body.setBorder(null, null, true, null, true, true, THEME.line, SpreadsheetApp.BorderStyle.SOLID).setWrap(false);
  const col = k => sh.getRange(2, bfCol_(k), BF_ROWS - 1, 1);
  col('Code').setFontWeight('bold').setHorizontalAlignment('center').setFontColor(h.main);
  ['Year', '1st Choice', '2nd Choice', 'Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation']
    .forEach(k => col(k).setHorizontalAlignment('center'));
  col('Registered').setNumberFormat('dd/mm/yyyy HH:mm');
  col('Birth Date').setNumberFormat('dd/mm/yyyy');
  col('Phone').setNumberFormat('@');
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

  // Protect everything except the binome's own columns
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  const p = sh.protect().setDescription('Filled by the recruitment script');
  p.setUnprotectedRanges(BF_EDITABLE.map(k => sh.getRange(2, bfCol_(k), BF_ROWS - 1, 1)));
  const me = Session.getEffectiveUser();
  p.addEditor(me);
  p.removeEditors(p.getEditors().filter(u => u.getEmail() !== me.getEmail()));
  if (p.canDomainEdit()) p.setDomainEdit(false);
  return F;
}

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
  sh.getRange(2, bfCol_('Phone'), Math.max(rows.length, 1), 1).setNumberFormat('@'); // keep the leading 0 of the numbers
  if (rows.length) sh.getRange(2, BF_COL, rows.length, BF_H.length).setValues(rows);
  formatBinomeSheet_(sh, b, b.members);
  // inserting the checkboxes unticked every cell: tick back the interviews already done
  if (rows.length) sh.getRange(2, bfCol_('Interview Done'), rows.length, 1).setValues(rows.map(r => [r[BF_H.indexOf('Interview Done')]]));
  book.deleteSheet(backup);
  ctx.upgraded = (ctx.upgraded || 0) + 1;
  console.log('Binome sheet of ' + b.code + ' moved to the current layout (' + rows.length + ' interviewees)');
}
