/* ---------- add, edit and remove Team members (docs/admin-features.md › Add, edit and remove Team members) ---------- */
// The Binomes row stays the source of truth for who is in a binome: only Correct name or email reaches past the Team tab.

const PAIR_AS = ['HR', 'IT', 'COMM', 'FLER', 'ALL', 'SKIP'];
/** The Team cells a pending change (kind 'team', field) or teamSet may write. */
const TEAM_CELLS = ['Experienced', 'Exclude', 'Full Name', 'Department', 'Pair As'];

/** A Team cell's value as the tab stores it; throws on one it refuses. */
function teamCellValue_(field, v) {
  if (TEAM_CELLS.indexOf(field) < 0) throw new Error('Not a Team column this knows.');
  if (field === 'Experienced' || field === 'Exclude') {
    if (typeof v !== 'boolean') throw new Error(field + ' must be true or false.');
    return v;
  }
  v = String(v == null ? '' : v).trim();
  if (field === 'Pair As') v = v.toUpperCase();
  if (field === 'Pair As' && PAIR_AS.indexOf(v) < 0) throw new Error('Pair As is one of ' + PAIR_AS.join(', ') + '.');
  if (!v || v.length > 100) throw new Error('Give a ' + (field === 'Full Name' ? 'name' : 'department') + ' (100 characters at most).');
  return v;
}
/** A Team cell (or seen value) as text to compare. */
const teamCellText_ = (field, v) => (field === 'Experienced' || field === 'Exclude' ? String(bool_(v))
  : field === 'Pair As' ? String(v == null ? '' : v).trim().toUpperCase() : String(v == null ? '' : v).trim());

/** The Notes of Team row i, rechecked as the import writes them (an email fix clears its own warning). */
function teamNotes_(ctx, i) {
  const T = ctx.team.I, r = ctx.team.data[i], e = lc_(r[T.Email]), name = String(r[T['Full Name']]).trim();
  const twin = ctx.team.data.filter((x, j) => j !== i && e && lc_(x[T.Email]) === e)[0];
  return [emailNote_(e, name), twin ? 'Same email as ' + String(twin[T['Full Name']]).trim() : ''].filter(Boolean).join('; ');
}

/** The locked binome holding this email, and the DRAFT rows holding it. */
function teamSeats_(ctx, e) {
  const B = ctx.bin.I;
  return { b: activeOrPaused_(ctx).filter(x => x.members.some(m => m.email === e))[0] || null,
    drafts: draftRows_(ctx).filter(r => lc_(r[B['Email 1']]) === e || lc_(r[B['Email 2']]) === e) };
}

/** Drop these DRAFT rows (their partners are free again). Returns the warning. */
function dropDrafts_(ctx, rows, name) {
  if (!rows.length) return '';
  const B = ctx.bin.I;
  writeDrafts_(ctx, draftRows_(ctx).filter(r => rows.indexOf(r) < 0));
  keepHand_(ctx);
  return name + ' left draft ' + rows.map(r => String(r[B.Binome])).join(', ') + ': ' +
    rows.map(r => [r[B['Member 1']], r[B['Member 2']]].map(String).filter(n => n.trim() && n.trim() !== name).join(' & ')).filter(Boolean).join(', ') +
    ' ' + 'free again (the later drafts moved up a code).';
}

/** Runs fn(ctx) in the script lock with hand edits checked first and the baseline saved after. */
function teamEdit_(fn) {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const out = fn(ctx);
    ctx.alerts.flush();
    commitBase_(ctx);
    return out;
  }, 60000);
  if (!res) busy_();
  return res;
}

/** webRun('teamAdd', {name, email, dept, pairAs?, experienced?, dryRun?}): one new row in the Team tab, logged in Member Changes.
 *  dryRun: the suggested Pair As and Experienced (in the 2025 team) and the warnings, writing nothing. No mail. */
function teamAdd_(a) {
  a = a || {};
  const name = String(a.name || '').trim(), email = lc_(a.email), dept = String(a.dept || '').trim();
  const pairAs = a.pairAs ? teamCellValue_('Pair As', a.pairAs) : sectionToPair_(dept).pairAs;
  const warnings = email && name && !emailMatchesName_(email, name) ? ['The email does not look like this person\'s (' + email + ').'] : [];
  const past = typeof a.experienced === 'boolean' ? null : pastTeam_(); // opens the 2025 database: outside the lock
  const experienced = typeof a.experienced === 'boolean' ? a.experienced : !!(past && past[email]);
  if (a.dryRun) return { pairAs: pairAs, experienced: experienced, warnings: warnings };
  if (!name || name.length > 100) throw new Error('Give the name (100 characters at most).');
  if (!EMAIL_RE.test(email)) throw new Error('Give a valid email.');
  teamCellValue_('Department', dept);
  return teamEdit_(ctx => {
    const T = ctx.team.I;
    if (!hasExpCol_(ctx)) throw new Error(NO_EXP_COL);
    if (ctx.team.data.some(r => lc_(r[T.Email]) === email)) throw new Error(email + ' is already in the Team tab.');
    const row = [name, email, dept, pairAs, false, emailNote_(email, name), experienced];
    ctx.team.sh.getRange(ctx.team.sh.getLastRow() + 1, 1, 1, TEAM_H.length).setValues([row]);
    ctx.team.data.push(row);
    changesSheet_().appendRow([ctx.now, Session.getActiveUser().getEmail(), 'TEAM_ADD', '', '', '', name, email, '', a.reason || '', 'DONE']);
    return { name: name, email: email, pairAs: pairAs, experienced: experienced, warnings: warnings };
  });
}

/** webRun('teamSet', {email, field, value} or {email, experienced}): one Team cell, the direct write (the owner's switch off, or the
 *  cases a pending change can't do). Not interviewing (Exclude) for someone in a draft drops that draft and frees their partner.
 *  A name for someone in a binome goes through Correct name or email. */
function teamSet_(args) {
  const e = lc_(args.email), field = args.field || 'Experienced';
  const v = teamCellValue_(field, args.field ? args.value : args.experienced);
  return teamEdit_(ctx => {
    const T = ctx.team.I, i = ctx.team.data.findIndex(r => lc_(r[T.Email]) === e);
    if (field === 'Experienced' && !hasExpCol_(ctx)) throw new Error(NO_EXP_COL);
    if (i < 0) throw new Error((e || 'That member') + ' is not in the Team tab.');
    const seats = teamSeats_(ctx, e), name = String(ctx.team.data[i][T['Full Name']]).trim() || e;
    if (field === 'Full Name' && (seats.b || seats.drafts.length)) throw new Error(name + ' is in a binome: use Correct name or email.');
    ctx.team.data[i][T[field]] = v;
    ctx.team.sh.getRange(i + 2, T[field] + 1).setValue(v);
    const warning = field === 'Exclude' && v ? dropDrafts_(ctx, seats.drafts, name) : '';
    const who = field === 'Experienced' ? draftNotes_(ctx, [e]) : null;
    if (!args.field) return { email: e, experienced: v, name: who[e].name };
    return { email: e, field: field, value: v, name: name, warning: warning };
  });
}

/** Swap a live cover's address (In or Out) from e to ne, and its view access with it. Returns the problems. */
function coverFix_(ctx, e, ne, name) {
  const C = idx_(MC_H), sh = changesSheet_(), issues = [], s = S_();
  const share = bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE);
  (ctx.covers || []).forEach(c => {
    if (c.outEmail === e) sh.getRange(c.row, C['Out Name'] + 1, 1, 2).setValues([[name, ne]]);
    if (c.email !== e) return;
    sh.getRange(c.row, C['In Name'] + 1, 1, 2).setValues([[name, ne]]);
    const b = ctx.binByCode[c.binome];
    if (!c.shared || !share || !b || !b.fileId) return;
    try { const f = DriveApp.getFileById(b.fileId); f.removeViewer(e); f.addViewer(ne); }
    catch (x) { issues.push('cover access of ' + c.binome + ' not moved to ' + ne + ' (' + driveErr_(x) + ')'); }
  });
  ctx.covers = loadCovers_(); ctx.coverMap = coverMap_(ctx);
  return issues;
}

/**
 * webRun('teamFix', {email, newName?, newEmail?, reason?, dryRun?}): Correct name or email, for the same person. Works for someone
 * with no Team row who is in a binome. An email fix updates the Team row (Notes rechecked), the Binomes row, the sheet's sharing,
 * the member map and any live cover; in a locked binome the old address becomes a former member, the new one gets one short
 * notice and is marked told in PAIRED_SENT. A name fix in a binome goes to its row, sheet title and banner.
 */
function teamFix_(a) {
  a = a || {};
  const e = lc_(a.email), ne = lc_(a.newEmail) || e, nn = String(a.newName || '').trim();
  if (!e) throw new Error('Choose a member.');
  if (ne !== e && !EMAIL_RE.test(ne)) throw new Error('Invalid email "' + ne + '".');
  if (nn.length > 100) throw new Error('A name has 100 characters at most.');
  return teamEdit_(ctx => {
    const T = ctx.team.I, B = ctx.bin.I, ti = ctx.team.data.findIndex(r => lc_(r[T.Email]) === e), seats = teamSeats_(ctx, e), b = seats.b;
    if (ti < 0 && !b && !seats.drafts.length) throw new Error(e + ' is not in the Team tab or in a binome.');
    const d = seats.drafts[0], seat = b ? b.members.filter(m => m.email === e)[0] : null;
    const old = seat ? seat.name : ti >= 0 ? String(ctx.team.data[ti][T['Full Name']]).trim()
      : String(d[B[lc_(d[B['Email 1']]) === e ? 'Member 1' : 'Member 2']]).trim();
    const name = nn || old;
    if (ne === e && name === old) throw new Error('Nothing to change.');
    if (ne !== e) {
      if (ctx.team.data.some(r => lc_(r[T.Email]) === ne)) throw new Error(ne + ' is already in the Team tab.');
      const other = ctx.binomes.filter(x => x.members.some(m => m.email === ne))[0];
      if (other) throw new Error(ne + ' is already in ' + other.code + '.');
    }
    let plan = null;
    if (b) {
      plan = memberPlan_(ctx, b.code, e, name, ne, '');
      if (plan.errors.length) throw new Error(plan.errors.join(' '));
    }
    const view = { email: e, newEmail: ne, name: name, old: old, binome: b ? b.code : '', drafts: seats.drafts.map(r => String(r[B.Binome])),
      notice: !!b && ne !== e };
    if (a.dryRun) return view;
    // the binome first: its Binomes write is the one that can fail and roll back, before anything else is written
    let lines = b ? applyMemberPlans_(ctx, [plan], a.reason || 'correction', { fix: true }) : null;
    if (ti >= 0) {
      ctx.team.data[ti][T['Full Name']] = name; ctx.team.data[ti][T.Email] = ne;
      ctx.team.sh.getRange(ti + 2, 1, 1, 2).setValues([[name, ne]]);
      const notes = teamNotes_(ctx, ti);
      ctx.team.data[ti][T.Notes] = notes;
      ctx.team.sh.getRange(ti + 2, T.Notes + 1).setValue(notes);
    }
    seats.drafts.forEach(r => {
      const k = lc_(r[B['Email 1']]) === e ? 1 : 2, j = ctx.bin.data.indexOf(r);
      r[B['Member ' + k]] = name; r[B['Email ' + k]] = ne;
      ctx.bin.sh.getRange(j + 2, B['Member ' + k] + 1, 1, 2).setValues([[name, ne]]); // Member k and Email k sit side by side (BIN_H)
    });
    if (seats.drafts.length && ne !== e) {
      PropertiesService.getScriptProperties().setProperty('DRAFT_HAND', JSON.stringify(handDrafts_().map(k => handKey_(k.split('|').map(x => (x === e ? ne : x))))));
    }
    const issues = coverFix_(ctx, e, ne, name);
    saveMemberMap_(ctx); // the covers' new address
    if (!b) {
      changesSheet_().appendRow([ctx.now, Session.getActiveUser().getEmail(), 'TEAM_FIX', '', old, e, name, ne, '', a.reason || '', 'DONE']);
      lines = [old + (ne !== e ? ' (' + e + ' → ' + ne + ')' : '') + (name !== old ? ' → ' + name : '') + ' corrected in the Team tab' +
        (seats.drafts.length ? ' and draft ' + view.drafts.join(', ') : '') + '.'];
    }
    if (issues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b ? b.code : '', key: '',
      msg: 'Correction of ' + e + ' saved, but ' + issues.join('; ') + '.' });
    return Object.assign(view, { done: lines.concat(issues) });
  });
}

/** webRun('teamRemove', {email, reason?}): the Team row goes, logged in Member Changes (that row keeps the "no longer in the Team
 *  tab" alert quiet). A locked binome is not touched; a draft holding them is dropped and their partner is free again. */
function teamRemove_(a) {
  const e = lc_(a && a.email);
  return teamEdit_(ctx => {
    const T = ctx.team.I, i = ctx.team.data.findIndex(r => lc_(r[T.Email]) === e);
    if (i < 0) throw new Error((e || 'That member') + ' is not in the Team tab.');
    const name = String(ctx.team.data[i][T['Full Name']]).trim() || e, seats = teamSeats_(ctx, e);
    // the document lock too: the apply entry writes Team cells by row number under it, and a delete shifts the rows below
    const dl = LockService.getDocumentLock();
    if (!dl.tryLock(10000)) busy_();
    try { ctx.team.sh.deleteRow(i + 2); } finally { dl.releaseLock(); }
    ctx.team.data.splice(i, 1);
    const warning = dropDrafts_(ctx, seats.drafts, name);
    changesSheet_().appendRow([ctx.now, Session.getActiveUser().getEmail(), 'TEAM_REMOVED', seats.b ? seats.b.code : '', name, e, '', '', '', (a && a.reason) || '', 'DONE']);
    return { name: name, email: e, binome: seats.b ? seats.b.code : '', warning: warning };
  });
}

/** Emails removed from the Team tab (TEAM_REMOVED rows), for Import's "coming back". */
function removedEmails_() {
  const C = idx_(MC_H), out = {};
  loadChanges_().forEach(r => { if (r[C.Type] === 'TEAM_REMOVED') out[lc_(r[C['Out Email']])] = true; });
  return out;
}
