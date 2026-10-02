/* ---------- binome files ---------- */

function binomeSheet_(ctx, b) {
  if (!b || !b.fileId) return null;
  if (!ctx.files[b.fileId]) ctx.files[b.fileId] = SpreadsheetApp.openById(b.fileId).getSheets()[0];
  return ctx.files[b.fileId];
}

function ivToFileRow_(ctx, r, carry) {
  const I = ctx.iv.I;
  carry = carry || {};
  return [r[I.Code], r[I['First Name']], r[I['Family Name']], r[I.Email], String(r[I.Phone]), r[I.Facebook], r[I.Discord],
    r[I.Field], r[I.Year], r[I['1st Choice']], r[I['2nd Choice']], r[I.Availability], r[I.Motivation], r[I['Anything to add']],
    r[I['Registered At']], carry.contacted || 'Not yet', carry.date || '', carry.time || '', carry.form || '', carry.notes || ''];
}

function appendToBinomeFile_(ctx, b, r, carry) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, BF_H.length).setValues([ivToFileRow_(ctx, r, carry)]);
}

function findFileRow_(sh, code) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const codes = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) if (String(codes[i][0]).trim() === code) return i + 2;
  return -1;
}

function removeFromBinomeFile_(ctx, b, code) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return {};
  const row = findFileRow_(sh, code);
  if (row < 0) return {};
  const F = idx_(BF_H);
  const disp = sh.getRange(row, 1, 1, BF_H.length).getDisplayValues()[0];
  const carry = { contacted: disp[F.Contacted], date: disp[F['Interview Date']], time: disp[F['Interview Time']],
    form: disp[F['Interview Form']], notes: disp[F.Notes] };
  sh.deleteRow(row);
  return carry;
}

function markInterviewInFile_(ctx, b, code, text) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  const row = findFileRow_(sh, code);
  if (row > 0) sh.getRange(row, idx_(BF_H)['Interview Form'] + 1).setValue(text);
}

function binomeFileTitle_(b, members) {
  const first = n => String(n || '').trim().split(/\s+/)[0] || '?';
  return '[' + b.code + '] ' + members.map(m => first(m.name)).join(' & ');
}
function binomeFileNote_(b, members) {
  return 'Binome ' + b.code + ' (' + b.tag + ')\n' + members.map(m => m.name).join(' & ') +
    '\n\nGreen columns are yours: Contacted, Interview Date (date picker), Interview Time (HH:mm), Notes.\n' +
    'Everything else is filled automatically.';
}

function createBinomeFile_(b, members) {
  const s = S_();
  const file = SpreadsheetApp.create(binomeFileTitle_(b, members));
  try { file.setSpreadsheetLocale('fr_FR'); } catch (e) { /* ignore */ }
  file.setSpreadsheetTimeZone(s.TIMEZONE);
  DriveApp.getFileById(file.getId()).moveTo(DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID));
  const sh = file.getSheets()[0];
  sh.setName(b.code);
  const F = idx_(BF_H);
  sh.getRange(1, 1, 1, BF_H.length).setValues([BF_H]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
  BF_EDITABLE.forEach(h => sh.getRange(1, F[h] + 1).setBackground('#38761d'));
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  sh.getRange(1, 1).setNote(binomeFileNote_(b, members));
  const maxRows = 400;
  if (sh.getMaxRows() < maxRows) sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  sh.getRange(2, F.Contacted + 1, maxRows - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONTACT_OPTIONS, true).setAllowInvalid(false).build());
  sh.getRange(2, F['Interview Date'] + 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy').setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Double-click to open the date picker').build());
  sh.getRange(2, F['Interview Time'] + 1, maxRows - 1, 1).setNumberFormat('HH:mm');
  sh.getRange(2, F.Phone + 1, maxRows - 1, 1).setNumberFormat('@');
  sh.getRange(2, F.Registered + 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange(2, F['Why this department'] + 1, maxRows - 1, 2).setWrap(true);
  sh.setColumnWidth(F['Why this department'] + 1, 320);
  const cf = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Yes').setBackground('#d9ead3').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Not yet').setBackground('#fce5cd').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Withdrew').setBackground('#eeeeee').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
  ];
  sh.setConditionalFormatRules(cf);
  // Protect everything except the binome's own columns
  const p = sh.protect().setDescription('Filled by the recruitment script');
  p.setUnprotectedRanges(BF_EDITABLE.map(h => sh.getRange(2, F[h] + 1, maxRows - 1, 1)));
  const me = Session.getEffectiveUser();
  p.addEditor(me);
  p.removeEditors(p.getEditors().filter(u => u.getEmail() !== me.getEmail()));
  if (p.canDomainEdit()) p.setDomainEdit(false);
  if (bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE)) {
    members.forEach(m => { if (m.email) { try { file.addEditor(m.email); } catch (e) { console.warn('Share failed ' + m.email + ': ' + e); } } });
  }
  return file;
}
