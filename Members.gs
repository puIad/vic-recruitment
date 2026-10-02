/* ---------- binome members after lock: permanent change, swap ---------- */
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

/** Warnings when a binome's members no longer fit its tag (only judged when every member is in the Team tab). */
function tagWarnings_(ctx, b, members) {
  const side = {}; teamMembers_(ctx).forEach(m => { side[m.email] = m.pairAs; });
  if (!members.length || members.some(m => !side[m.email])) return [];
  const has = p => members.some(m => side[m.email] === p);
  if (/\ball\b/.test(normText(b.tag))) return has('ALL') ? [] : [b.code + ' is tagged "ALL" but no member is a board lead (Pair As ALL).'];
  const missing = tagDepts(b.tag).filter(d => !has(d));
  return missing.length ? [b.code + ' is tagged "' + b.tag + '" but no member is on the ' + missing.join(' / ') +
    ' side any more. It keeps receiving those interviewees until you change its Tag in the Binomes tab.'] : [];
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
  if (!errors.length && b.fileId) {
    // a no-op edit (same title) proves this account can edit the sheet, not just see it
    try { const f = SpreadsheetApp.openById(b.fileId); f.rename(f.getName()); }
    catch (e) { errors.push('Cannot edit the sheet of ' + b.code + ' (' + e.message + '): fix its File ID, or ask the owner of the Binome Sheets folder to give you edit access.'); }
  }
  if (!errors.length) {
    const after = [1, 2].map(k => (k === slot ? inn : used(k) ? seat(k) : null)).filter(Boolean);
    tagWarnings_(ctx, b, after).forEach(w => warnings.push(w));
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
  const share = bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE);
  const I = ctx.iv.I, lines = [];
  plans.forEach(p => {
    const b = ctx.binByCode[p.b.code];
    const same = p.out && p.inn && p.out.email === p.inn.email;
    const fileIssues = [];
    if (b.fileId) {
      try {
        const file = SpreadsheetApp.openById(b.fileId);
        file.rename(binomeFileTitle_(b, b.members));
        file.getSheets()[0].getRange(1, 1).setNote(binomeFileNote_(b, b.members));
      } catch (e) { fileIssues.push('title/note not updated (' + e.message + ')'); }
      let f = null;
      try { f = DriveApp.getFileById(b.fileId); } catch (e) { fileIssues.push('sharing not updated (' + e.message + ')'); }
      // the owner (who ran Lock) can't be removed: that just fails quietly
      if (f && p.out && p.out.email && !same) { try { f.removeEditor(p.out.email); } catch (e) { console.warn('removeEditor ' + p.out.email + ': ' + e); } }
      if (f && p.inn && share && !same) { try { f.addEditor(p.inn.email); } catch (e) { fileIssues.push('could not share with ' + p.inn.email + ' (' + e.message + ')'); } }
    }
    changesSheet_().appendRow([ctx.now, by, 'PERMANENT', b.code, p.out ? p.out.name : '', p.out ? p.out.email : '',
      p.inn ? p.inn.name : '', p.inn ? p.inn.email : '', '', reason || '', fileIssues.length ? 'FILE NOT UPDATED: ' + fileIssues.join('; ') : 'DONE']);
    const what = b.code + ': ' + (p.out ? p.out.name || p.out.email : '(empty seat)') + ' → ' + (p.inn ? p.inn.name : '(nobody)');
    lines.push(what + (fileIssues.length ? ' ⚠️ binome sheet: ' + fileIssues.join('; ') : ''));
    if (fileIssues.length) ctx.alerts.add({ severity: 'MEDIUM', type: 'FILE_ERROR', code: '', binome: b.code,
      msg: 'Member change in ' + b.code + ' saved, but the binome sheet was not fully updated: ' + fileIssues.join('; ') + '. Fix access, then Re-share.', key: '' });
    ctx.alerts.add({ severity: 'INFO', type: 'MEMBER_CHANGED', status: 'AUTO-FIXED', code: '', binome: b.code,
      msg: what + ' by ' + by + (reason ? ' (' + reason + ')' : ''), key: '' });
    if (same) return;
    const pending = ctx.iv.data.filter(r => r[I.Binome] === b.code && PENDING_STATUSES.indexOf(r[I.Status]) >= 0);
    if (p.inn) mail_(p.inn.email, '[VIC Recruitment] You joined binome ' + b.code,
      '<p>Hi ' + esc_(p.inn.name.split(' ')[0]) + ',</p><p>You are now a member of binome <b>' + b.code + '</b> (' + esc_(b.members.map(m => m.name).join(' & ')) + ').</p>' +
      (pending.length ? '<p>Interviewees still in progress:</p><ul>' + pending.map(r => '<li><b>' + esc_(r[I.Code]) + '</b>: ' +
        esc_(r[I['First Name']] + ' ' + r[I['Family Name']]) + ' · ' + esc_(String(r[I.Status]).toLowerCase()) +
        (r[I['Interview Date']] ? ' · ' + esc_(r[I['Interview Date']] + ' ' + r[I['Interview Time']]) : '') + '</li>').join('') + '</ul>' : '') +
      '<p>' + (b.fileUrl ? '<a href="' + b.fileUrl + '">Open the binome sheet</a>. ' : '') + 'In the interview form, use the binome code <b>' + b.code + '</b>.</p>');
    if (p.out && p.out.email) mail_(p.out.email, '[VIC Recruitment] You left binome ' + b.code,
      '<p>Hi ' + esc_((p.out.name || '').split(' ')[0]) + ',</p><p>You are no longer a member of binome <b>' + b.code + '</b>' +
      (p.inn ? ' (replaced by ' + esc_(p.inn.name) + ')' : '') + '. Thanks for your help!</p>');
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
    const p = memberPlan_(ctx, a.binome, a.outEmail, a.inName, a.inEmail, '');
    if (p.errors.length || a.dryRun) return planView_(p);
    return { done: applyMemberPlans_(ctx, [p], a.reason) };
  }, 60000);
  return report_(res);
}

/** Exchange two members of two locked binomes in one go. a: {binomeA, emailA, binomeB, emailB, reason, dryRun} */
function swapMembersCore_(a) {
  a = a || {};
  const res = withLock_(() => {
    const ctx = loadCtx_();
    const ca = parseBinomeCode(a.binomeA), cb = parseBinomeCode(a.binomeB);
    if (ca && cb && ca.code === cb.code) return { errors: ['Choose two different binomes.'], warnings: [] };
    const pa = memberPlan_(ctx, a.binomeA, a.emailA, '', a.emailB, cb ? cb.code : '');
    const pb = memberPlan_(ctx, a.binomeB, a.emailB, '', a.emailA, ca ? ca.code : '');
    if (!lc_(a.emailA) || !lc_(a.emailB)) pa.errors.unshift('Choose one member in each binome.');
    const view = { errors: pa.errors.concat(pb.errors), warnings: pa.warnings.concat(pb.warnings), plans: [planView_(pa), planView_(pb)] };
    if (view.errors.length || a.dryRun) return view;
    return { done: applyMemberPlans_(ctx, [pa, pb], a.reason || ('swap ' + pa.b.code + ' ↔ ' + pb.b.code)) };
  }, 60000);
  return report_(res);
}

function report_(res) {
  if (!res) { say_('Busy, try again in a minute.'); return null; }
  if (res.done) say_(res.done.join('\n') + ' ✅');
  else if (res.errors.length) say_(res.errors.join('\n'));
  return res;
}
