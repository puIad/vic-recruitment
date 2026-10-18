/* ---------- binome members after lock: permanent change, swap, temporary cover ---------- */
// The Binomes row stays the single source of truth; these tools also fix what a hand edit would leave
// behind: the file title/note, who can edit the file, the history (Member Changes tab) and the emails.

/** The Member Changes tab, created on first use (Setup creates it too). */
function changesSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(TAB.CHANGES);
  if (!sh) {
    sh = ss.insertSheet(TAB.CHANGES);
    sh.getRange(1, 1, 1, MC_H.length).setValues([MC_H]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Rows of the Member Changes tab ([] while the tab does not exist yet: never crash a sync over it). */
function loadChanges_() {
  return ss_().getSheetByName(TAB.CHANGES) ? loadTable_(TAB.CHANGES, MC_H).data : [];
}

/** binome code -> emails of people who permanently left it. */
function formerMembers_() {
  const C = idx_(MC_H), out = {};
  loadChanges_().forEach(r => {
    const e = String(r[C['Out Email']]).trim().toLowerCase(), code = String(r[C.Binome]).trim();
    const stayed = e === String(r[C['In Email']]).trim().toLowerCase(); // a name/email fix, not a departure
    if (r[C.Type] === 'PERMANENT' && e && !stayed) (out[code] = out[code] || []).push(e);
  });
  return out;
}

const lc_ = s => String(s || '').trim().toLowerCase();

/** '' if this account can edit the binome's sheet, else the reason. A no-op edit (same title) proves it. */
function editCheck_(b) {
  if (!b.fileId) return '';
  try { const f = SpreadsheetApp.openById(b.fileId); f.rename(f.getName()); return ''; }
  catch (e) { return 'Cannot edit the sheet of ' + b.code + ' (' + e.message + '): fix its File ID, or ask the owner of the Binome Sheets folder to give you edit access.'; }
}

/** Warnings when a binome's members no longer fit its tag (only judged when every member is in the Team tab). */
function tagWarnings_(ctx, b, members) {
  const side = {}; teamMembers_(ctx).forEach(m => { side[m.email] = m.pairAs; });
  if (!members.length || members.some(m => !side[m.email])) return [];
  const has = p => members.some(m => side[m.email] === p);
  if (/\ball\b/.test(normText(b.tag))) return has('ALL') ? [] : [b.code + ' is tagged "ALL" but no member is a board lead (Pair As ALL).'];
  const missing = tagDepts(b.tag).filter(d => !has(d));
  return missing.length ? [b.code + ' tagged "' + b.tag + '" has no member on the ' + missing.join(' / ') + ' side (Pair As).'] : [];
}

/**
 * Check one seat change in a locked binome. Writes nothing.
 * outEmail = who leaves (empty: fill the empty seat) ; inEmail = who joins (empty: only remove) ; swapWith = the other binome of a swap.
 * returns {errors[], warnings[], b, slot, out, inn}
 */
function memberPlan_(ctx, binomeText, outEmail, inName, inEmail, swapWith) {
  const errors = [], warnings = [];
  const pb = parseBinomeCode(binomeText), b = pb && ctx.binByCode[pb.code];
  if (!b || (b.status !== 'ACTIVE' && b.status !== 'PAUSED')) {
    return { errors: ['Binome "' + binomeText + '" not found or not locked (DRAFT rows are edited in the Binomes tab).'], warnings: warnings };
  }
  const B = ctx.bin.I;
  outEmail = lc_(outEmail); inEmail = lc_(inEmail);
  const seat = k => ({ name: String(b.row[B['Member ' + k]]).trim(), email: lc_(b.row[B['Email ' + k]]) });
  const used = k => !!(seat(k).name || seat(k).email);
  let slot = 0;
  if (outEmail) { slot = [1, 2].filter(k => seat(k).email === outEmail)[0] || 0; if (!slot) errors.push(outEmail + ' is not in ' + b.code + '.'); }
  else { slot = [1, 2].filter(k => !used(k))[0] || 0; if (!slot) errors.push(b.code + ' already has two members: choose who leaves.'); }
  const out = slot && used(slot) ? seat(slot) : null;
  let inn = null;
  if (inEmail) {
    const name = String(inName || '').trim() || ctx.nameByEmail[inEmail] || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inEmail)) errors.push('Invalid email "' + inEmail + '".');
    if (!name) errors.push('Give the name of ' + inEmail + ' (not in the Team tab).');
    inn = { name: name, email: inEmail };
    if (inEmail !== outEmail && b.members.some(m => m.email === inEmail)) errors.push(inEmail + ' is already in ' + b.code + '.');
    const other = activeOrPaused_(ctx).filter(x => x.code !== b.code && x.code !== swapWith && x.members.some(m => m.email === inEmail))[0];
    if (other) errors.push(inEmail + ' is already in ' + other.code + ': use Swap to exchange two members.');
    if (!errors.length && !teamMembers_(ctx).some(m => m.email === inEmail)) warnings.push(name + ' (' + inEmail + ') is not in the Team tab (outside the OT).');
  } else if (!outEmail) errors.push('Nothing to change: give who leaves, who joins, or both.');
  else if (b.members.length < 2) errors.push(b.code + ' would have no member left: give a replacement.');
  if (!errors.length) { const e = editCheck_(b); if (e) errors.push(e); }
  if (!errors.length) {
    const after = [1, 2].map(k => (k === slot ? inn : used(k) ? seat(k) : null)).filter(Boolean);
    tagWarnings_(ctx, b, after).forEach(w => warnings.push(w + ' It keeps receiving those interviewees until you change its department (Binomes › ⋯ › Change department…).'));
  }
  return { errors: errors, warnings: warnings, b: b, slot: slot, out: out, inn: inn };
}

/** Write the planned seats, then fix files, sharing, history, alerts and emails. plans: [{b, slot, out, inn}] */
function applyMemberPlans_(ctx, plans, reason) {
  const B = ctx.bin.I, s = S_(), by = Session.getActiveUser().getEmail();
  // All seats or none: if a write fails (e.g. the second row of a swap), put back the rows already written.
  const touched = [];
  try {
    plans.forEach(p => {
      touched.push({ row: p.b.row, before: p.b.row.slice(), at: ctx.bin.data.indexOf(p.b.row) + 2 });
      p.b.row[B['Member ' + p.slot]] = p.inn ? p.inn.name : '';
      p.b.row[B['Email ' + p.slot]] = p.inn ? p.inn.email : '';
      ctx.bin.sh.getRange(touched[touched.length - 1].at, 1, 1, BIN_H.length).setValues([p.b.row]);
    });
  } catch (e) {
    touched.forEach(t => {
      t.before.forEach((v, i) => { t.row[i] = v; });
      try { ctx.bin.sh.getRange(t.at, 1, 1, BIN_H.length).setValues([t.before]); } catch (e2) { console.error('Rollback of row ' + t.at + ' failed: ' + e2); }
    });
    throw new Error('Nothing changed: could not write the Binomes tab (' + e.message + ').');
  }
  indexCtx_(ctx);
  saveMemberMap_(ctx);
  const share = bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE);
  const I = ctx.iv.I, lines = [];
  plans.forEach(p => {
    const b = ctx.binByCode[p.b.code];
    const same = p.out && p.inn && p.out.email === p.inn.email;
    const fileIssues = [];
    if (b.fileId) {
      try {
        const sh = binomeSheet_(ctx, b); // a first-layout sheet is rebuilt first, so the banner lands in column A of the new one
        ctx.books[b.fileId].rename(binomeFileTitle_(b, b.members));
        setBinomeBanner_(sh, b, b.members);
      } catch (e) { fileIssues.push('title/note not updated (' + e.message + ')'); }
    }
    // Sharing off (TEST_MODE): nothing was shared with Drive's email. Silently, like the dashboard's own control: the member who
    // leaves loses the sheet however they got it (opened from the dashboard or shared by hand), and the newcomer gets the level
    // the binome was opened at (BIN_ACCESS), if any
    if (!share && !same && b.fileId) {
      const level = (binAccess_()[b.code] || {}).level;
      try {
        const roles = sheetRoles_(b.fileId);
        if (p.out && p.out.email) {
          // reported, not swallowed: they would keep their binome's candidates (an access the sheet inherits from the Binome Sheets
          // folder can't be removed here either: then the admin takes them off the folder)
          try { setSheetAccess_(b.fileId, p.out.email, 'none', roles); } catch (e) { fileIssues.push('could not remove ' + p.out.email + ' from the sheet (' + driveErr_(e) + ')'); }
        }
        if (p.inn && level && level !== 'none') setSheetAccess_(b.fileId, p.inn.email, level, roles);
      } catch (e) { fileIssues.push('access not carried over (' + driveErr_(e) + ')'); }
    }
    if (b.fileId && share && !same) {
      let f = null;
      try { f = DriveApp.getFileById(b.fileId); } catch (e) { fileIssues.push('sharing not updated (' + driveErr_(e) + ')'); }
      // the owner (who ran Lock) can't be removed: that just fails quietly
      if (f && p.out && p.out.email) { try { f.removeEditor(p.out.email); } catch (e) { console.warn('removeEditor ' + p.out.email + ': ' + e); } }
      if (f && p.inn) { try { f.addEditor(p.inn.email); } catch (e) { fileIssues.push('could not share with ' + p.inn.email + ' (' + driveErr_(e) + ')'); } }
    }
    changesSheet_().appendRow([ctx.now, by, 'PERMANENT', b.code, p.out ? p.out.name : '', p.out ? p.out.email : '',
      p.inn ? p.inn.name : '', p.inn ? p.inn.email : '', '', reason || '', fileIssues.length ? 'FILE NOT UPDATED: ' + fileIssues.join('; ') : 'DONE']);
    const what = b.code + ': ' + (p.out ? p.out.name || p.out.email : '(empty seat)') + ' → ' + (p.inn ? p.inn.name : '(nobody)');
    lines.push(what + (fileIssues.length ? ' (binome sheet: ' + fileIssues.join('; ') + ')' : ''));
    if (fileIssues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b.code,
      msg: 'Member change in ' + b.code + ' saved, but the binome sheet was not fully updated: ' + fileIssues.join('; ') + '. Fix access, then Re-share.', key: '' });
    ctx.alerts.add({ severity: 'INFO', type: 'MEMBER_CHANGED', status: 'AUTO-FIXED', code: '', binome: b.code,
      msg: what + ' by ' + by + (reason ? ' (' + reason + ')' : ''), key: '' });
    if (same) return;
    const pending = ctx.iv.data.filter(r => r[I.Binome] === b.code && PENDING_STATUSES.indexOf(r[I.Status]) >= 0);
    if (p.inn) mail_(p.inn.email, '[VIC Recruitment] You joined binome ' + b.code, mailHtml_({ title: 'You joined binome ' + b.code,
      intro: 'Hi ' + p.inn.name.split(' ')[0] + ',\n\nYou are now a member of binome **' + b.code + '** (' + b.members.map(m => m.name).join(' & ') + ').',
      blocks: (pending.length ? [mailP_('Interviewees still in progress:'), mailList_(pending.map(r => [r[I.Code],
        r[I['First Name']] + ' ' + r[I['Family Name']] + ' · ' + String(r[I.Status]).toLowerCase() +
        (r[I['Interview Date']] ? ' · ' + r[I['Interview Date']] + ' ' + r[I['Interview Time']] : '')]))] : [])
        .concat(mailP_('In the interview form, use the binome code **' + b.code + '**.')),
      cta: { label: 'Open the binome sheet', url: b.fileUrl }, footer: mailTeamFooter_(b.fileUrl) }));
    if (p.out && p.out.email) mail_(p.out.email, '[VIC Recruitment] You left binome ' + b.code, mailHtml_({ title: 'You left binome ' + b.code,
      intro: 'Hi ' + (p.out.name || '').split(' ')[0] + ',\n\nYou are no longer a member of binome **' + b.code + '**' +
        (p.inn ? ' (replaced by ' + p.inn.name + ')' : '') + '. Thanks for your help!', footer: mailTeamFooter_() }));
  });
  ctx.alerts.flush();
  buildTracker_(ctx);
  return lines;
}

const planView_ = p => ({ errors: p.errors, warnings: p.warnings,
  binome: p.b ? p.b.code : '', out: p.out, inn: p.inn });

/** Replace, remove or add one member of a locked binome. a: {binome, outEmail, inName, inEmail, reason, dryRun} */
function changeMemberCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const p = memberPlan_(ctx, a.binome, a.outEmail, a.inName, a.inEmail, '');
    if (p.errors.length || a.dryRun) return planView_(p);
    const done = applyMemberPlans_(ctx, [p], a.reason);
    commitBase_(ctx);
    return { done: done };
  }, 60000);
  return report_(res);
}

/** Exchange two members of two locked binomes in one go. a: {binomeA, emailA, binomeB, emailB, reason, dryRun} */
function swapMembersCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const ca = parseBinomeCode(a.binomeA), cb = parseBinomeCode(a.binomeB);
    if (ca && cb && ca.code === cb.code) return { errors: ['Choose two different binomes.'], warnings: [] };
    const pa = memberPlan_(ctx, a.binomeA, a.emailA, '', a.emailB, cb ? cb.code : '');
    const pb = memberPlan_(ctx, a.binomeB, a.emailB, '', a.emailA, ca ? ca.code : '');
    if (!lc_(a.emailA) || !lc_(a.emailB)) pa.errors.unshift('Choose one member in each binome.');
    const view = { errors: pa.errors.concat(pb.errors), warnings: pa.warnings.concat(pb.warnings), plans: [planView_(pa), planView_(pb)] };
    if (view.errors.length || a.dryRun) return view;
    const done = applyMemberPlans_(ctx, [pa, pb], a.reason || ('swap ' + pa.b.code + ' ↔ ' + pb.b.code));
    commitBase_(ctx);
    return { done: done };
  }, 60000);
  return report_(res);
}

/**
 * Pair two unpaired Team members into a new locked binome (next B.NN code, its own sheet, tag as the draft would give it).
 * a: {emailA, emailB, reason, dryRun}
 */
function newBinomeCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const errors = [], free = {};
    if (!activeOrPaused_(ctx).length) errors.push('Binomes are not locked yet: pair people in the Binomes tab (DRAFT rows), then Lock.');
    unpairedMembers(teamMembers_(ctx), ctx.binomes).forEach(m => { free[m.email] = m; });
    const ea = lc_(a.emailA), eb = lc_(a.emailB);
    if (!ea || !eb) errors.push('Choose two members.');
    else if (ea === eb) errors.push('Choose two different members.');
    const members = [ea, eb].filter(Boolean).map(e => {
      const m = free[e];
      if (!m) errors.push(e + ' is not an unpaired Team member (already in a locked binome, excluded, or not in the Team tab).');
      else if (m.draft) errors.push((m.name || e) + ' is in DRAFT row ' + m.draft + ': run Lock, or clear that row first.');
      return m;
    });
    let max = 0; ctx.binomes.forEach(b => { const n = codeNum(b.code); if (n > max) max = n; });
    const b = { code: 'B.' + pad2(max + 1), tag: errors.length ? '' : pairTag(members[0].pairAs, members[1].pairAs) };
    if (!errors.length && !tagDepts(b.tag).length) errors.push('No department to receive from (Pair As ' + members.map(m => m.pairAs).join(' / ') + ').');
    const view = { errors: errors, warnings: [], binome: b.code, tag: b.tag, members: errors.length ? [] : members.map(m => ({ name: m.name, email: m.email })) };
    if (errors.length || a.dryRun) return view;
    const file = createBinomeFile_(b, view.members);
    const B = ctx.bin.I, row = new Array(BIN_H.length).fill('');
    row[B.Binome] = b.code; row[B.Tag] = b.tag; row[B.Status] = 'ACTIVE'; row[B.Created] = ctx.now;
    row[B['Member 1']] = members[0].name; row[B['Email 1']] = members[0].email;
    row[B['Member 2']] = members[1].name; row[B['Email 2']] = members[1].email;
    row[B.File] = file.getUrl(); row[B['File ID']] = file.getId();
    try { ctx.bin.sh.getRange(ctx.bin.data.length + 2, 1, 1, BIN_H.length).setValues([row]); }
    catch (e) {
      try { DriveApp.getFileById(file.getId()).setTrashed(true); } catch (e2) { console.error('Could not trash ' + file.getId() + ': ' + e2); }
      throw new Error('Nothing changed: could not write the Binomes tab (' + e.message + ').');
    }
    ctx.bin.data.push(row);
    indexCtx_(ctx);
    saveMemberMap_(ctx);
    const by = Session.getActiveUser().getEmail(), names = members.map(m => m.name).join(' & ');
    // The binome exists from here on: a failed history write or email is reported, never thrown (a retry would refuse the pair)
    const issues = [];
    try {
      const sh = changesSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, 2, MC_H.length).setValues(members.map(m =>
        [ctx.now, by, 'PERMANENT', b.code, '', '', m.name, m.email, '', a.reason || 'new binome', 'DONE']));
    } catch (e) { issues.push('Member Changes history not written (' + e.message + ')'); }
    members.forEach(m => {
      try {
        mail_(m.email, '[VIC Recruitment] You are in binome ' + b.code, mailHtml_({ title: 'You are in binome ' + b.code,
          intro: 'Hi ' + m.name.split(' ')[0] + ',\n\nYou are now a member of binome **' + b.code + '** (' + names + ').\n\n' +
            'In the interview form, use the binome code **' + b.code + '**.',
          cta: { label: 'Open the binome sheet', url: file.getUrl() }, footer: mailTeamFooter_(file.getUrl()) }));
      } catch (e) { issues.push('email to ' + m.email + ' not sent (' + e.message + ')'); }
    });
    const what = b.code + ' created (' + b.tag + '): ' + names;
    ctx.alerts.add({ severity: 'INFO', type: 'MEMBER_CHANGED', status: 'AUTO-FIXED', code: '', binome: b.code,
      msg: what + ' by ' + by + (a.reason ? ' (' + a.reason + ')' : ''), key: '' });
    if (issues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b.code, key: '',
      msg: b.code + ' was created, but: ' + issues.join('; ') + '. Add the missing row / tell them by hand.' });
    ctx.alerts.flush();
    buildTracker_(ctx);
    commitBase_(ctx);
    return { done: [what + (issues.length ? ' (note: ' + issues.join('; ') + ')' : '')] };
  }, 60000);
  return report_(res);
}

function report_(res) {
  if (!res) { busy_(); return null; }
  if (res.done) say_(res.done.join('\n'));
  else if (res.errors.length) say_(res.errors.join('\n'));
  return res;
}

/* ---------- a binome's department: its Tag decides which interviewees it receives (pickBinome) ---------- */

/** Check a tag change. Writes nothing. Interviewees in progress that the new tag doesn't cover stay with the binome (stranded). */
function tagPlan_(ctx, b, tag) {
  const errors = [], warnings = [], I = ctx.iv.I, takes = tagDepts(tag);
  if (!takes.length) errors.push('Choose at least one department.');
  else if (tag === b.tag) errors.push(b.code + ' already receives ' + tag + '.');
  if (!errors.length) { const e = editCheck_(b); if (e) errors.push(e); }
  if (!errors.length) tagWarnings_(ctx, { code: b.code, tag: tag }, b.members).forEach(w => warnings.push(w));
  const stranded = errors.length ? [] : ctx.iv.data.filter(r => r[I.Binome] === b.code && PENDING_STATUSES.indexOf(r[I.Status]) >= 0 &&
    takes.indexOf(String(r[I['1st Choice']]).trim()) < 0).map(r => ({ code: String(r[I.Code]).trim(),
    name: (r[I['First Name']] + ' ' + r[I['Family Name']]).trim(), dept: String(r[I['1st Choice']]).trim() }));
  return { errors: errors, warnings: warnings, b: b, from: b.tag, to: tag, stranded: stranded };
}

/** Write the new tag, repaint the binome sheet in its house, log it. The caller flushes alerts, rebuilds the Tracker, commits the base. */
function applyTag_(ctx, p, reason) {
  const b = p.b, B = ctx.bin.I, by = Session.getActiveUser().getEmail();
  b.row[B.Tag] = p.to;
  ctx.bin.sh.getRange(ctx.bin.data.indexOf(b.row) + 2, B.Tag + 1).setValue(p.to);
  indexCtx_(ctx);
  const nb = ctx.binByCode[b.code], issues = [], what = b.code + ': ' + (p.from || '(no tag)') + ' → ' + p.to;
  if (nb.status === 'DRAFT') return what; // a draft is scratch until Lock: no sheet, no history
  // the tag is written from here on: a sheet that can't be repainted is reported, never thrown
  if (nb.fileId) { try { paintHouse_(binomeSheet_(ctx, nb), nb, nb.members); } catch (e) { issues.push('sheet colours not updated (' + e.message + ')'); } }
  try {
    changesSheet_().appendRow([ctx.now, by, 'TAG', b.code, p.from, '', p.to, '', p.stranded.map(x => x.code).join(', '), reason || '',
      issues.length ? 'FILE NOT UPDATED: ' + issues.join('; ') : 'DONE']);
  } catch (e) { issues.push('Member Changes history not written (' + e.message + ')'); }
  ctx.alerts.add({ severity: 'INFO', type: 'TAG_CHANGED', status: 'AUTO-FIXED', code: '', binome: b.code,
    msg: what + ' by ' + by + (reason ? ' (' + reason + ')' : '') + '. It receives ' + p.to + ' interviewees from now on.', key: '' });
  if (issues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b.code, key: '',
    msg: 'Department of ' + b.code + ' changed, but ' + issues.join('; ') + '.' });
  return what + (issues.length ? ' (note: ' + issues.join('; ') + ')' : '');
}

/** Change which departments a binome receives. a: {binome, depts: ['IT', 'HR'], reason, dryRun}. DRAFT, ACTIVE and PAUSED binomes. */
function binomeTagCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const pb = parseBinomeCode(a.binome), b = pb && ctx.binByCode[pb.code];
    if (!b) return { errors: ['Binome "' + (a.binome || '') + '" not found.'], warnings: [] };
    const depts = [].concat(a.depts || []).map(d => String(d).trim().toUpperCase());
    const bad = depts.filter(d => DEPTS.indexOf(d) < 0);
    if (bad.length) return { errors: ['Unknown department: ' + bad.join(', ') + '.'], warnings: [] };
    const p = tagPlan_(ctx, b, tagFor(depts));
    if (p.errors.length || a.dryRun) return { errors: p.errors, warnings: p.warnings, binome: b.code, from: p.from, to: p.to, stranded: p.stranded };
    const done = applyTag_(ctx, p, a.reason);
    ctx.alerts.flush();
    buildTracker_(ctx);
    commitBase_(ctx);
    return { done: [done] };
  }, 60000);
  return report_(res);
}

/* ---------- temporary cover: someone stands in for a few interviews, linked by interviewee code ---------- */
// A TEMPORARY row in Member Changes: In = the cover person, Out = who is unavailable (optional), Interviewees = the codes.
// The Binomes row is not touched. The cover person gets view-only access to the sheet (the binome stays responsible for it),
// counts as a member for those codes in the interview check, and the row ends itself once those interviews are done.

/** Code-like tokens of a free text: "IT.01 it 2, HR-03;comm4" -> ['IT.01', 'it 2', 'HR-03', 'comm4'] (each then read by parseIntervieweeCode).
 *  Whole tokens only: "HR-03x" stays "HR-03x" (then reported as unknown), never cut down to a valid-looking "HR-03". */
const splitCodes_ = s => String(s || '').match(/\b[A-Za-z]{2,13}[\s.\-_#:°]*\d{1,4}[A-Za-z0-9]*/g) || [];

// Status of an active cover that gave the view access itself (only that access is taken back when covers end)
const COVER_SHARED = 'ACTIVE · view access added by this cover';
// Status of an ended cover whose view access could not be removed yet: no longer applies, retried every cycle
const COVER_REVOKING = 'ENDING · view access still to remove';

/** ACTIVE covers: [{row (sheet row), binome, name, email, outName, outEmail, codes[], reason, shared}] */
function loadCovers_() {
  const C = idx_(MC_H), out = [];
  loadChanges_().forEach((r, i) => {
    const st = String(r[C.Status]);
    if (r[C.Type] !== 'TEMPORARY' || (st !== 'ACTIVE' && st !== COVER_SHARED)) return;
    out.push({ row: i + 2, binome: String(r[C.Binome]).trim(), name: String(r[C['In Name']]).trim(), email: lc_(r[C['In Email']]),
      outName: String(r[C['Out Name']]).trim(), outEmail: lc_(r[C['Out Email']]), codes: splitCodes_(r[C.Interviewees]), reason: String(r[C.Reason]),
      shared: st === COVER_SHARED });
  });
  return out;
}

/** The codes a cover still applies to: interviewee still in the covered binome and not done yet. */
function coverLive_(ctx, c) {
  const I = ctx.iv.I;
  return c.codes.filter(code => { const r = ctx.ivByCode[code]; return r && r[I.Binome] === c.binome && PENDING_STATUSES.indexOf(r[I.Status]) >= 0; });
}

/** interviewee code -> emails of the people covering it (only while it is still in the covered binome). */
function coverMap_(ctx) {
  const I = ctx.iv.I, out = {};
  (ctx.covers || []).forEach(c => c.codes.forEach(code => {
    const r = ctx.ivByCode[code];
    if (r && r[I.Binome] === c.binome) (out[code] = out[code] || []).push(c.email);
  }));
  return out;
}

/** Check a cover. a: {codes, inEmail, inName, outEmail}. Writes nothing. returns {errors, warnings, inn, groups:[{b, codes, out}]} */
function coverPlan_(ctx, a) {
  const errors = [], warnings = [], I = ctx.iv.I, codes = [];
  splitCodes_(a.codes).forEach(t => {
    const p = parseIntervieweeCode(t), code = p && p.code;
    if (!code || !ctx.ivByCode[code]) errors.push('Unknown interviewee code "' + t + '".');
    else if (codes.indexOf(code) < 0) codes.push(code);
  });
  if (!codes.length && !errors.length) errors.push('Give at least one interviewee code.');
  const email = lc_(a.inEmail), name = String(a.inName || '').trim() || ctx.nameByEmail[email] || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Give the email of the person who covers.');
  else if (!name) errors.push('Give the name of ' + email + ' (not in the Team tab).');
  const groups = {};
  codes.forEach(code => {
    const r = ctx.ivByCode[code], b = ctx.binByCode[r[I.Binome]];
    if (!b || (b.status !== 'ACTIVE' && b.status !== 'PAUSED')) return errors.push(code + ' is not in a locked binome.');
    if (PENDING_STATUSES.indexOf(r[I.Status]) < 0) return errors.push(code + ' is ' + String(r[I.Status]).toLowerCase() + ': nothing to cover.');
    if (b.members.some(m => m.email === email)) return errors.push((name || email) + ' is already in ' + b.code + ' (' + code + ').');
    if ((ctx.covers || []).some(c => c.email === email && c.binome === b.code && c.codes.indexOf(code) >= 0)) warnings.push((name || email) + ' already covers ' + code + '.');
    (groups[b.code] = groups[b.code] || { b: b, codes: [] }).codes.push(code);
  });
  const outEmail = lc_(a.outEmail);
  const list = Object.keys(groups).sort().map(k => groups[k]);
  list.forEach(g => {
    g.out = outEmail ? g.b.members.filter(m => m.email === outEmail)[0] || null : null;
    if (outEmail && !g.out) errors.push(outEmail + ' is not in ' + g.b.code + '.');
  });
  if (!errors.length) list.forEach(g => { const e = editCheck_(g.b); if (e) errors.push(e); });
  if (!errors.length) list.forEach(g => { if (!g.b.fileId) warnings.push(g.b.code + ' has no binome sheet (empty File ID): the cover still counts in the interview check, but ' + (name || email) + ' gets no view access.'); });
  if (!errors.length && !teamMembers_(ctx).some(m => m.email === email)) warnings.push(name + ' (' + email + ') is not in the Team tab (outside the OT).');
  if (list.length > 1) warnings.push('These interviewees belong to ' + list.length + ' binomes: one cover per binome is created.');
  return { errors: errors, warnings: warnings, inn: { name: name, email: email }, groups: list };
}

const coverView_ = p => ({ errors: p.errors, warnings: p.warnings, inn: p.inn,
  groups: (p.groups || []).map(g => ({ binome: g.b.code, codes: g.codes, out: g.out })) });

/** Start a temporary cover. a: {codes, inEmail, inName, outEmail, reason, dryRun} */
function addCoverCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    const p = coverPlan_(ctx, a);
    if (p.errors.length || a.dryRun) return coverView_(p);
    const s = S_(), by = Session.getActiveUser().getEmail(), I = ctx.iv.I, lines = [];
    const share = bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE);
    p.groups.forEach(g => {
      const b = g.b, issues = [];
      let shared = false; // true only if this cover gives the access: access someone already had is never taken back later
      if (share && b.fileId) {
        try {
          const f = DriveApp.getFileById(b.fileId);
          const has = f.getEditors().concat(f.getViewers()).some(u => lc_(u.getEmail()) === p.inn.email);
          if (!has) { f.addViewer(p.inn.email); shared = true; }
        } catch (e) { issues.push('could not share with ' + p.inn.email + ' (' + driveErr_(e) + ')'); }
      }
      changesSheet_().appendRow([ctx.now, by, 'TEMPORARY', b.code, g.out ? g.out.name : '', g.out ? g.out.email : '',
        p.inn.name, p.inn.email, g.codes.join(', '), a.reason || '', shared ? COVER_SHARED : 'ACTIVE']);
      const what = p.inn.name + ' covers ' + g.codes.join(', ') + ' for ' + b.code + (g.out ? ' (instead of ' + g.out.name + ')' : '');
      lines.push(what + (issues.length ? ' (note: ' + issues.join('; ') + ')' : ''));
      ctx.alerts.add({ severity: 'INFO', type: 'COVER_ADDED', status: 'AUTO-FIXED', code: g.codes.join(', '), binome: b.code,
        msg: what + ' · by ' + by + (a.reason ? ' (' + a.reason + ')' : ''), key: '' });
      if (issues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b.code, key: '',
        msg: 'Cover in ' + b.code + ' saved, but ' + issues.join('; ') + '. Fix access to the binome sheet.' });
      const rows = g.codes.map(c => ctx.ivByCode[c]);
      mail_(p.inn.email, '[VIC Recruitment] You cover ' + g.codes.join(', ') + ' for binome ' + b.code, mailHtml_({
        title: 'You cover ' + g.codes.join(', ') + ' for ' + b.code,
        intro: 'Hi ' + p.inn.name.split(' ')[0] + ',\n\nThanks for stepping in! You interview these candidates for binome **' + b.code +
          '** (' + b.members.map(m => m.name).join(' & ') + ')' + (g.out ? ' instead of ' + g.out.name : '') + ':',
        blocks: [mailList_(rows.map(r => [r[I.Code], r[I['First Name']] + ' ' + r[I['Family Name']] + ' · ' +
          String(r[I.Phone]).replace(/^'/, '') + ' · available: ' + r[I.Availability] +
          (r[I['Interview Date']] ? ' · interview ' + r[I['Interview Date']] + ' ' + r[I['Interview Time']] : '')])),
        mailP_((b.fileUrl ? 'You can view the binome sheet; ' : '') + 'the binome keeps filling it in. ' +
          'In the interview form, use the binome code **' + b.code + '** and the interviewee code.')],
        cta: { label: 'View the binome sheet', url: b.fileUrl }, footer: mailTeamFooter_(b.fileUrl) }));
      b.members.forEach(m => {
        if (m.email) mail_(m.email, '[VIC Recruitment] ' + p.inn.name + ' covers ' + g.codes.join(', ') + ' for ' + b.code, mailHtml_({
          title: p.inn.name + ' covers ' + g.codes.join(', '),
          intro: 'Hi ' + m.name.split(' ')[0] + ',\n\n**' + p.inn.name + '** (' + p.inn.email + ') covers **' + g.codes.join(', ') +
            '** for your binome' + (g.out ? ' instead of ' + g.out.name : '') + (a.reason ? ' (' + a.reason + ')' : '') +
            '. You stay responsible for the binome sheet: keep Contacted / Date / Time up to date for them.',
          cta: { label: 'Open the binome sheet', url: b.fileUrl }, footer: mailTeamFooter_(b.fileUrl) }));
      });
    });
    ctx.covers = loadCovers_(); ctx.coverMap = coverMap_(ctx);
    saveMemberMap_(ctx);
    ctx.alerts.flush();
    return { done: lines };
  }, 60000);
  return report_(res);
}

/**
 * End a cover: it stops applying at once. The view access it gave is taken back, unless that person still covers
 * something else in the same binome (that cover then inherits it). Access the cover did not give is left alone.
 * If Drive refuses the removal, the row stays ENDING and every cycle retries it (MEDIUM alert until it works).
 * Returns '' or the reason the access is still there.
 */
function endCover_(ctx, c, why) {
  const C = idx_(MC_H), sh = changesSheet_();
  ctx.covers = (ctx.covers || []).filter(x => x.row !== c.row);
  ctx.coverMap = coverMap_(ctx);
  const ended = 'ENDED ' + fmt_(ctx.now, 'dd/MM HH:mm') + ': ' + why;
  const problem = c.shared ? revokeCoverAccess_(ctx, c) : '';
  sh.getRange(c.row, C.Status + 1).setValue(problem ? COVER_REVOKING : ended);
  if (problem) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: c.binome, key: 'REVOKE|' + c.row,
    msg: 'The cover of ' + c.name + ' in ' + c.binome + ' ended, but their view access could not be removed yet (' + problem + '). Retried at every sync.' });
  return problem;
}

/** Take back a cover's view access, or hand it to another active cover of the same person in that binome. '' or the error. */
function revokeCoverAccess_(ctx, c) {
  const C = idx_(MC_H);
  const heir = (ctx.covers || []).filter(x => x.email === c.email && x.binome === c.binome)[0];
  if (heir) {
    if (!heir.shared) { heir.shared = true; changesSheet_().getRange(heir.row, C.Status + 1).setValue(COVER_SHARED); }
    return '';
  }
  const b = ctx.binByCode[c.binome];
  if (!b || !b.fileId) return ''; // no sheet any more: nothing to take back
  try { DriveApp.getFileById(b.fileId).removeViewer(c.email); return ''; } catch (e) { return driveErr_(e); }
}

/** Run in every cycle: covers whose interviews are all done (or moved) end by themselves; failed removals are retried. */
function endFinishedCovers_(ctx) {
  const justEnded = {};
  (ctx.covers || []).slice().forEach(c => { if (!coverLive_(ctx, c).length) { endCover_(ctx, c, 'interviews done'); justEnded[c.row] = true; } });
  const C = idx_(MC_H), KI = ctx.alerts.table.I;
  loadChanges_().forEach((r, i) => {
    // rows that failed just now wait for the next cycle: their alert is not saved yet, so it could not be closed here
    if (r[C.Type] !== 'TEMPORARY' || String(r[C.Status]) !== COVER_REVOKING || justEnded[i + 2]) return;
    const c = { row: i + 2, binome: String(r[C.Binome]).trim(), email: lc_(r[C['In Email']]) };
    if (revokeCoverAccess_(ctx, c)) return; // still refused: the open alert stays, next cycle tries again
    changesSheet_().getRange(c.row, C.Status + 1).setValue('ENDED ' + fmt_(ctx.now, 'dd/MM HH:mm') + ': view access removed');
    ctx.alerts.resolveWhere(a => a[KI.Key] === 'REVOKE|' + c.row);
  });
}

/** Web: end a cover by hand. a: {row} */
function endCoverCore_(a) {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    const c = (ctx.covers || []).filter(x => x.row === Number(a && a.row))[0];
    if (!c) return { errors: ['This cover is not active any more (refresh the page).'], warnings: [] };
    const problem = endCover_(ctx, c, 'ended by ' + Session.getActiveUser().getEmail());
    saveMemberMap_(ctx);
    ctx.alerts.flush();
    return { done: [c.name + ' no longer covers ' + c.codes.join(', ') + ' (' + c.binome + ')' +
      (problem ? ' (their view access could not be removed yet: ' + problem + '. It will be retried automatically.)' : '')] };
  }, 60000);
  return report_(res);
}
