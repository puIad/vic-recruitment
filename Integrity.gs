/* ---------- manual edits: a baseline of what the script last wrote, and a full check of the binome sheets ---------- */
// Script properties keep what the script last wrote in the Binomes tab (locked rows) and the Interviewees tab. Every run
// that writes there first compares the tabs with it: whatever differs was done by hand and becomes a MANUAL_EDIT alert for
// the admins (never the binomes), with Apply properly / Revert / Accept on the dashboard. A flagged value keeps its old
// baseline until someone acts on it, so Revert always has something to go back to. The run then saves the new baseline
// in the same lock, so the script never flags its own writes. No baseline yet (first run after deploy): taken silently.

// Columns compared together (one alert per group). An alert on group '*' = the whole row was deleted.
const EDIT_GROUPS = {
  bin: { Binome: ['Binome'], seat1: ['Member 1', 'Email 1'], seat2: ['Member 2', 'Email 2'], Tag: ['Tag'], Status: ['Status'], File: ['File', 'File ID'] },
  iv: { Code: ['Code'], Binome: ['Binome'], Status: ['Status'], Person: ['First Name', 'Family Name', 'Email'] },
};
// Stored but never compared: only needed to rebuild a deleted row on Revert (dates kept as ISO text)
const BASE_KEEP = { bin: ['Created'], iv: ['Assigned At', 'Interview Submitted At', 'Interview Log Row', 'Screening'] };
const BASE_F = { bin: [].concat.apply([], Object.keys(EDIT_GROUPS.bin).map(g => EDIT_GROUPS.bin[g])).concat(BASE_KEEP.bin),
  iv: [].concat.apply([], Object.keys(EDIT_GROUPS.iv).map(g => EDIT_GROUPS.iv[g])).concat(BASE_KEEP.iv) };

/** {bin: {code: entry}, iv: {responseKey: entry | 0}} (0 = a row deleted on purpose: its registration is not re-imported), or null. */
function loadBaseline_() {
  const s = loadPropChunks_('BASELINE');
  if (s === null) return null;
  try {
    const raw = JSON.parse(s), out = { bin: {}, iv: {} };
    ['bin', 'iv'].forEach(kind => Object.keys(raw[kind] || {}).forEach(id => {
      const a = raw[kind][id];
      if (a === 0) { out[kind][id] = 0; return; }
      const e = {}; BASE_F[kind].forEach((f, i) => { e[f] = a[i]; });
      out[kind][id] = e;
    }));
    return out;
  } catch (e) { console.warn('Baseline unreadable, taken again from the tabs: ' + e); return null; }
}

function saveBaseline_(base) {
  const raw = { bin: {}, iv: {} };
  ['bin', 'iv'].forEach(kind => Object.keys(base[kind]).forEach(id => {
    const e = base[kind][id];
    raw[kind][id] = e === 0 ? 0 : BASE_F[kind].map(f => e[f]);
  }));
  savePropChunks_('BASELINE', JSON.stringify(raw));
}

/** The compared values of one row, trimmed (emails lower-case, binome Status upper-case). */
function editEntry_(kind, row, H) {
  const e = {};
  BASE_F[kind].forEach(f => {
    const raw = row[H[f]];
    let v = raw instanceof Date ? (isNaN(raw) ? '' : raw.toISOString()) : String(raw == null ? '' : raw).trim();
    if (/^Email/.test(f)) v = v.toLowerCase();
    if (kind === 'bin' && f === 'Status') v = v.toUpperCase();
    e[f] = v;
  });
  return e;
}

const editKey_ = (kind, group, id) => 'EDIT|' + kind + '|' + group + '|' + id;
function parseEditKey_(key) {
  const p = String(key || '').split('|');
  return p[0] === 'EDIT' && p.length >= 4 ? { kind: p[1], group: p[2], id: p.slice(3).join('|') } : null;
}
const lockedStatus_ = st => st === 'ACTIVE' || st === 'PAUSED';

/**
 * Pairs each baseline entry with its row now: [{kind, id, prev, row, dup}]. Binomes pair by code, and a row whose code was
 * changed by hand is found again by its File ID. New locked rows come with prev undefined; dup = a second row with a code
 * already used. Interviewees pair by Response Key.
 */
function editPairs_(ctx, base) {
  const out = [], B = ctx.bin.I, I = ctx.iv.I;
  const code = r => String(r[B.Binome]).trim();
  const rows = ctx.bin.data.filter(r => code(r)), byCode = {}, used = [];
  rows.forEach(r => { if (!byCode[code(r)]) byCode[code(r)] = r; });
  Object.keys(base.bin).forEach(id => {
    const prev = base.bin[id];
    let r = byCode[id];
    if (!r && prev['File ID']) r = rows.filter(x => used.indexOf(x) < 0 && !base.bin[code(x)] && String(x[B['File ID']]).trim() === prev['File ID'])[0];
    if (r) used.push(r);
    out.push({ kind: 'bin', id: id, prev: prev, row: r || null });
  });
  rows.forEach(r => {
    if (used.indexOf(r) >= 0 || !lockedStatus_(String(r[B.Status]).trim().toUpperCase())) return;
    out.push({ kind: 'bin', id: code(r), prev: undefined, row: r, dup: byCode[code(r)] !== r || !!base.bin[code(r)] });
  });
  const byKey = {};
  ctx.iv.data.forEach(r => { const k = String(r[I['Response Key']]).trim(); if (k && !byKey[k]) byKey[k] = r; });
  Object.keys(base.iv).forEach(id => out.push({ kind: 'iv', id: id, prev: base.iv[id], row: byKey[id] || null }));
  Object.keys(byKey).forEach(id => { if (!(id in base.iv)) out.push({ kind: 'iv', id: id, prev: undefined, row: byKey[id] }); });
  return out;
}

/** Compare the tabs with the baseline: alerts for hand edits, and two edits put back at once (see ivEdits_). Run first, in the lock. */
function detectEdits_(ctx) {
  ctx.base = loadBaseline_();
  ctx.editSeen = {};
  if (ctx.base) {
    let ivFixed = false;
    editPairs_(ctx, ctx.base).forEach(p => { if (p.kind === 'bin') binEdits_(ctx, p); else if (ivEdits_(ctx, p)) ivFixed = true; });
    if (ivFixed) { saveTable_(ctx.iv); indexCtx_(ctx); }
  }
  teamEdits_(ctx);
  // an edit undone by hand closes its alert
  const KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(a => a[KI.Type] === 'MANUAL_EDIT' && /^EDIT\|/.test(a[KI.Key]) && !ctx.editSeen[a[KI.Key]]);
}

function flagEdit_(ctx, key, severity, code, binome, msg) {
  ctx.editSeen[key] = true;
  ctx.alerts.add({ severity: severity, type: 'MANUAL_EDIT', code: code || '', binome: binome || '', msg: msg, key: key });
}

const seat_ = (e, k) => (e['Member ' + k] || e['Email ' + k] ? (e['Member ' + k] || '?') + (e['Email ' + k] ? ' (' + e['Email ' + k] + ')' : '') : '(empty)');

function binEdits_(ctx, p) {
  const B = ctx.bin.I, I = ctx.iv.I, prev = p.prev, cur = p.row && editEntry_('bin', p.row, B);
  const flag = (group, sev, msg) => flagEdit_(ctx, editKey_('bin', group, p.id), sev, '', p.id, msg);
  if (!prev) {
    if (p.dup) return flag('dup', 'HIGH', 'Binome code ' + p.id + ' appears twice in the Binomes tab: rename or delete the copy.');
    if (!cur['File ID']) flag('File', 'HIGH', p.id + ' is ' + cur.Status + ' but has no binome sheet (File ID empty). Set its Status back to DRAFT and run Lock to create its sheet.');
    return;
  }
  if (!cur) {
    const n = ctx.iv.data.filter(r => r[I.Binome] === p.id).length;
    return flag('*', 'HIGH', 'The row of ' + p.id + ' (' + [seat_(prev, 1), seat_(prev, 2)].join(' & ') + ') was deleted from the Binomes tab by hand. ' +
      (n ? n + ' interviewee(s) still point to it and are no longer read from its sheet. ' : '') + 'Revert puts the row back; Accept forgets the binome.');
  }
  const differs = g => EDIT_GROUPS.bin[g].some(f => prev[f] !== cur[f]);
  const code = cur.Binome;
  if (differs('Binome')) flag('Binome', 'HIGH', 'Binome code changed by hand in the Binomes tab: ' + prev.Binome + ' → ' + cur.Binome +
    '. Its interviewees, alerts and covers still say ' + prev.Binome + '. Revert puts ' + prev.Binome + ' back.');
  [1, 2].forEach(k => {
    if (!differs('seat' + k)) return;
    if (prev['Email ' + k] && prev['Email ' + k] === cur['Email ' + k]) {
      return flag('seat' + k, 'INFO', 'Name of a member of ' + code + ' changed by hand: "' + prev['Member ' + k] + '" → "' + cur['Member ' + k] +
        '". Apply also renames the binome sheet; Accept keeps it as is.');
    }
    flag('seat' + k, 'MEDIUM', 'Member ' + k + ' of ' + code + ' changed by hand: ' + seat_(prev, k) + ' → ' + seat_(cur, k) +
      '. Its sheet, sharing and the Member Changes history were not updated. Apply does it properly (as Change members would); Revert puts the old member back.');
  });
  if (differs('Tag')) flag('Tag', 'MEDIUM', 'Tag of ' + code + ' changed by hand: "' + prev.Tag + '" → "' + cur.Tag +
    '". It decides which interviewees ' + code + ' receives from now on. Apply keeps it and repaints its sheet in the new house ' +
    '(as Change department would); Accept keeps it as is; Revert puts the old tag back.');
  if (differs('Status')) {
    if (lockedStatus_(prev.Status) && lockedStatus_(cur.Status)) {
      ctx.alerts.add({ severity: 'INFO', type: 'MANUAL_EDIT', status: 'AUTO-FIXED', code: '', binome: code, key: '',
        msg: code + ' set to ' + cur.Status + ' in the Binomes tab' + (cur.Status === 'PAUSED' ? ': it keeps its interviewees but gets no new ones.' : ': it receives interviewees again.') });
    } else flag('Status', 'MEDIUM', 'Status of ' + code + ' changed by hand: ' + prev.Status + ' → ' + (cur.Status || '(empty)') +
      '. Only ACTIVE and PAUSED binomes are synced. Revert puts ' + prev.Status + ' back.');
  }
  if (differs('File')) flag('File', 'MEDIUM', 'Sheet link of ' + code + ' changed by hand (File ID ' + (prev['File ID'] || '(empty)') + ' → ' + (cur['File ID'] || '(empty)') +
    '): the script now reads and writes another sheet. Revert puts the previous one back.');
}

/** true if it changed the row in memory (the caller saves the tab). */
function ivEdits_(ctx, p) {
  if (!p.prev) return false; // a new registration, or a row deleted on purpose (0)
  const I = ctx.iv.I, prev = p.prev, name = (prev['First Name'] + ' ' + prev['Family Name']).trim();
  const flag = (group, sev, msg) => flagEdit_(ctx, editKey_('iv', group, p.id), sev, prev.Code, prev.Binome, msg);
  if (!p.row) {
    flag('*', 'MEDIUM', (prev.Code || name) + ' (' + name + ') was deleted from the Interviewees tab by hand. Their registration is kept aside (not given a new code). ' +
      'Revert restores the row with the same code and binome; Accept drops them for good.');
    return false;
  }
  const cur = editEntry_('iv', p.row, I), label = prev.Code || name;
  const differs = g => EDIT_GROUPS.iv[g].some(f => prev[f] !== cur[f]);
  let fixed = false;
  if (differs('Code')) flag('Code', 'HIGH', 'Interviewee code changed by hand: ' + prev.Code + ' → ' + (cur.Code || '(empty)') + ' (' + name +
    '). Their binome sheet and the interview forms still use ' + prev.Code + '. Revert puts ' + prev.Code + ' back.');
  if (differs('Binome')) {
    if (!cur.Binome && prev.Binome) { // left empty, the next step would give them a brand-new binome
      p.row[I.Binome] = prev.Binome; fixed = true;
      ctx.alerts.add({ severity: 'INFO', type: 'MANUAL_EDIT', status: 'AUTO-FIXED', code: label, binome: prev.Binome, key: '',
        msg: 'Binome of ' + label + ' was cleared by hand in the Interviewees tab: put back to ' + prev.Binome + ' (they would have been given a new binome). Use Move interviewee to change it.' });
    } else flag('Binome', 'MEDIUM', label + ' moved from ' + (prev.Binome || 'no binome') + ' to ' + cur.Binome + ' by hand in the Interviewees tab: the binome sheets were not updated (' +
      label + ' is still in the sheet of ' + (prev.Binome || 'nobody') + ', not in ' + cur.Binome + '\'s). Apply moves them properly (Move interviewee); Revert puts ' + (prev.Binome || 'it') + ' back.');
  }
  if (differs('Status')) { // computed by the script: a typed status would be lost silently, or stick (DUPLICATE)
    p.row[I.Status] = prev.Status; fixed = true;
    ctx.alerts.add({ severity: 'INFO', type: 'MANUAL_EDIT', status: 'AUTO-FIXED', code: label, binome: prev.Binome, key: '',
      msg: 'Status of ' + label + ' typed by hand ("' + cur.Status + '") is computed by the script, so it was put back to ' + prev.Status +
        '. To record a withdrawal, set Contacted = Withdrew in the binome sheet.' });
  }
  if (differs('Person')) flag('Person', 'INFO', 'Name/email of ' + label + ' edited by hand in the Interviewees tab: "' + [prev['First Name'], prev['Family Name'], prev.Email].join(' ') +
    '" → "' + [cur['First Name'], cur['Family Name'], cur.Email].join(' ') + '". Apply copies it to their binome sheet; Accept leaves the sheet as is.');
  return fixed;
}

/** Team tab: duplicate emails; locked binome members missing from it (unless brought in by Change members). Closes itself. */
function teamEdits_(ctx) {
  const T = ctx.team.I, names = {};
  ctx.team.data.forEach(r => {
    const e = lc_(r[T.Email]), n = String(r[T['Full Name']]).trim();
    if (!e) return;
    if (names[e] !== undefined) flagEdit_(ctx, 'EDIT|team|dup|' + e, 'MEDIUM', '', '', e + ' appears twice in the Team tab (' + names[e] + ' and ' + n + '): keep one row.');
    else names[e] = n;
  });
  const locked = activeOrPaused_(ctx);
  if (!locked.length) return;
  const C = idx_(MC_H), brought = {};
  loadChanges_().forEach(r => { if (r[C['In Email']]) brought[lc_(r[C['In Email']])] = true; });
  locked.forEach(b => b.members.forEach(m => {
    if (m.email && names[m.email] === undefined && !brought[m.email]) flagEdit_(ctx, 'EDIT|team|missing|' + m.email, 'INFO', '', b.code,
      (m.name || m.email) + ' (' + m.email + ') is in ' + b.code + ' but no longer in the Team tab. Put them back in the Team tab (unpaired-member checks rely on it).');
  }));
}

/** The baseline to save: the tabs as they are now, except flagged values, which keep their old baseline until acted on. */
function editSnapshot_(ctx) {
  const base = ctx.base || { bin: {}, iv: {} }, open = ctx.alerts.openKeys, out = { bin: {}, iv: {} };
  editPairs_(ctx, base).forEach(p => {
    const isOpen = g => !!open[editKey_(p.kind, g, p.id)];
    if (p.kind === 'iv' && p.prev === 0) { out.iv[p.id] = 0; return; }
    if (!p.row) { // deleted: kept while flagged; afterwards a deleted interviewee is remembered so it is not re-imported
      if (p.prev && isOpen('*')) out[p.kind][p.id] = p.prev;
      else if (p.kind === 'iv' && p.prev) out.iv[p.id] = 0;
      return;
    }
    if (p.dup) return;
    const groups = Object.keys(EDIT_GROUPS[p.kind]);
    if (!p.prev && groups.some(isOpen)) return; // a flagged new row (e.g. ACTIVE without a sheet) waits until fixed
    const e = editEntry_(p.kind, p.row, p.kind === 'bin' ? ctx.bin.I : ctx.iv.I);
    if (p.prev) groups.forEach(g => { if (isOpen(g)) EDIT_GROUPS[p.kind][g].forEach(f => { e[f] = p.prev[f]; }); });
    if (p.kind === 'bin') { if (lockedStatus_(e.Status)) out.bin[e.Binome] = e; }
    else out.iv[p.id] = e;
  });
  return out;
}

/** Save the baseline at the end of a run that called detectEdits_ (never otherwise: it would swallow unseen hand edits). */
function commitBase_(ctx) {
  if (ctx.base === undefined) return;
  saveBaseline_(editSnapshot_(ctx));
}

/** Which buttons the dashboard shows on a MANUAL_EDIT alert. */
function editFixes_(key, base) {
  const k = parseEditKey_(key);
  if (!k || k.kind === 'team' || k.group === 'dup' || !base || !base[k.kind] || !base[k.kind][k.id]) return [];
  const apply = (k.kind === 'bin' && /^(seat[12]|Tag)$/.test(k.group)) || (k.kind === 'iv' && (k.group === 'Binome' || k.group === 'Person'));
  return (apply ? ['apply'] : []).concat(['revert', 'accept']);
}

/** Web: apply / revert / accept MANUAL_EDIT alerts by ID. mode: 'apply' | 'revert' | 'accept' */
function editFixCore_(mode, ids) {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const A = ctx.alerts.table.I, lines = [];
    (ids || []).forEach(id => {
      id = String(id).trim();
      const a = ctx.alerts.table.data.filter(r => String(r[A.ID]) === id)[0];
      if (!a || a[A.Status] !== 'OPEN' || a[A.Type] !== 'MANUAL_EDIT') return lines.push(id + ': no longer an open manual edit (refresh the page).');
      try { lines.push(id + ': ' + fixEdit_(ctx, mode, String(a[A.Key]))); }
      catch (e) { lines.push(id + ': ' + e.message); }
    });
    saveTable_(ctx.iv);
    commitBase_(ctx);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    buildTracker_(ctx);
    return lines;
  }, 60000);
  if (res) say_(res.join('\n')); else busy_();
  return res;
}

function fixEdit_(ctx, mode, key) {
  const k = parseEditKey_(key);
  if (!k || k.kind === 'team' || k.group === 'dup') throw new Error('fix it in the ' + (k && k.kind === 'team' ? 'Team' : 'Binomes') + ' tab: the alert then closes by itself.');
  const p = editPairs_(ctx, ctx.base || { bin: {}, iv: {} }).filter(x => x.kind === k.kind && x.id === k.id)[0];
  if (!p || !p.prev) throw new Error('nothing to go back to: fix it in the tab, the alert then closes by itself.');
  let msg;
  if (mode === 'accept') {
    msg = k.kind === 'iv' && k.group === '*' ? dropInterviewee_(ctx, p.prev) : 'accepted as it is now.';
    const fs = k.group === '*' ? ['Binome'] : EDIT_GROUPS[k.kind][k.group], I = k.kind === 'iv' ? ctx.iv.I : ctx.bin.I;
    const was = fs.map(f => f + ': ' + p.prev[f]).join(', ');
    logIvChange_(ctx, k.kind === 'iv' ? p.prev.Code || p.id : p.id, 'Edit accepted', was,
      p.row ? fs.map(f => f + ': ' + p.row[I[f]]).join(', ') : 'row deleted');
  }
  else if (mode === 'revert') msg = revertEdit_(ctx, p, k.group);
  else if (mode === 'apply') msg = applyEdit_(ctx, p, k.group);
  else throw new Error('unknown fix ' + mode);
  const KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(r => r[KI.Key] === key, 'RESOLVED');
  return msg;
}

function revertEdit_(ctx, p, group) {
  if (p.kind === 'bin') {
    const B = ctx.bin.I;
    if (group === '*') {
      const row = BIN_H.map(h => (h === 'Created' ? (p.prev.Created ? new Date(p.prev.Created) : '') : h in p.prev ? p.prev[h] : ''));
      ctx.bin.sh.getRange(ctx.bin.sh.getLastRow() + 1, 1, 1, BIN_H.length).setValues([row]);
      ctx.bin.data.push(row);
    } else {
      EDIT_GROUPS.bin[group].forEach(f => { p.row[B[f]] = p.prev[f]; });
      ctx.bin.sh.getRange(ctx.bin.data.indexOf(p.row) + 2, 1, 1, BIN_H.length).setValues([p.row]);
    }
    indexCtx_(ctx);
    return 'the Binomes tab is back to ' + (group === '*' ? 'having the row of ' + p.id : EDIT_GROUPS.bin[group].map(f => f + ' "' + p.prev[f] + '"').join(', ')) + '.';
  }
  const I = ctx.iv.I;
  if (group === '*') {
    ctx.restore = {}; ctx.restore[p.id] = p.prev;
    try { processRegistrations_(ctx); } finally { ctx.restore = null; }
    if (!ctx.ivKeys[p.id]) throw new Error('their answer in Registration Responses is gone too: nothing to restore from.');
    const b = ctx.binByCode[p.prev.Binome];
    if (b && b.fileId) forgetSeen_(b.fileId); // the next sync reads Contacted / Date / Time back from their sheet
    return (p.prev.Code || p.id) + ' restored in the Interviewees tab (same code and binome).';
  }
  EDIT_GROUPS.iv[group].forEach(f => { p.row[I[f]] = p.prev[f]; });
  indexCtx_(ctx);
  return EDIT_GROUPS.iv[group].map(f => f + ' back to "' + p.prev[f] + '"').join(', ') + '.';
}

function applyEdit_(ctx, p, group) {
  if (p.kind === 'bin' && /^seat[12]$/.test(group)) {
    const B = ctx.bin.I, k = group.slice(4), fM = 'Member ' + k, fE = 'Email ' + k;
    const want = { name: String(p.row[B[fM]]).trim(), email: lc_(p.row[B[fE]]) };
    // back to the old seat in memory, then do the change the way the Change members card does
    p.row[B[fM]] = p.prev[fM]; p.row[B[fE]] = p.prev[fE];
    indexCtx_(ctx);
    const plan = memberPlan_(ctx, String(p.row[B.Binome]), p.prev[fE], want.name, want.email, '');
    if (plan.errors.length) {
      p.row[B[fM]] = want.name; p.row[B[fE]] = want.email; indexCtx_(ctx);
      throw new Error(plan.errors.join(' '));
    }
    return applyMemberPlans_(ctx, [plan], 'manual edit applied').join('; ');
  }
  if (p.kind === 'bin' && group === 'Tag') {
    const B = ctx.bin.I, want = String(p.row[B.Tag]).trim(); // kept as typed: an ALL typed by hand stays ALL
    p.row[B.Tag] = p.prev.Tag; // back to the old tag in memory, then do the change the way Change department does
    indexCtx_(ctx);
    const plan = tagPlan_(ctx, ctx.binomes.filter(b => b.row === p.row)[0], want);
    if (plan.errors.length) { p.row[B.Tag] = want; indexCtx_(ctx); throw new Error(plan.errors.join(' ')); }
    return applyTag_(ctx, plan, 'manual edit applied');
  }
  if (p.kind === 'iv' && group === 'Binome') {
    const I = ctx.iv.I, target = String(p.row[I.Binome]).trim();
    p.row[I.Binome] = p.prev.Binome; // where the binome sheets still have them
    try { return moveInterviewee_(ctx, String(p.row[I.Code]).trim(), target); }
    catch (e) { p.row[I.Binome] = target; throw e; }
  }
  if (p.kind === 'iv' && group === 'Person') {
    const I = ctx.iv.I, code = String(p.row[I.Code]).trim(), b = ctx.binByCode[p.row[I.Binome]];
    const sh = b && binomeSheet_(ctx, b), row = sh ? findFileRow_(sh, code) : -1;
    if (row < 0) throw new Error(code + ' has no row in a binome sheet to copy it to.');
    sh.getRange(row, bfCol_('First Name'), 1, 3).setValues(plainRows_([[p.row[I['First Name']], p.row[I['Family Name']], p.row[I.Email]]]));
    return 'name/email copied to the sheet of ' + b.code + '.';
  }
  throw new Error('there is no tool for this change: use Revert or Accept.');
}

/** Accept of a row deleted by hand: the interviewee is dropped, so their row leaves the binome sheet too. */
function dropInterviewee_(ctx, prev) {
  const b = ctx.binByCode[prev.Binome];
  if (!b || !prev.Code) return 'dropped for good.';
  try { removeFromBinomeFile_(ctx, b, prev.Code); } catch (e) { return 'dropped for good, but their row is still in the sheet of ' + b.code + ' (' + e.message + ').'; }
  return 'dropped for good, and removed from the sheet of ' + b.code + '.';
}

function forgetSeen_(fileId) {
  const props = PropertiesService.getScriptProperties(), seen = JSON.parse(props.getProperty('FILE_SEEN') || '{}');
  delete seen[fileId];
  props.setProperty('FILE_SEEN', JSON.stringify(seen));
}

/* ---------- values the binomes may type but are probably wrong (from the synced Interviewees tab, every sync) ---------- */

function oddValues_(ctx) {
  const I = ctx.iv.I, seen = {}, day = 864e5;
  const add = (sev, check, r, msg, notify) => {
    const key = 'ODD|' + check + '|' + r[I.Code];
    seen[key] = true;
    ctx.alerts.add({ severity: sev, type: 'ODD_VALUE', code: r[I.Code], binome: r[I.Binome], msg: msg + ' (binome ' + r[I.Binome] + ')', key: key, notifyBinome: notify });
  };
  ctx.iv.data.forEach(r => {
    const at = r[I['Interview At']], reg = r[I['Registered At']], st = r[I.Status], c = String(r[I.Contacted]).trim(), code = r[I.Code];
    if (!code || !r[I.Binome] || !(at instanceof Date) || isOut_(st)) return;
    const when = fmt_(at), year = fmt_(reg instanceof Date ? reg : ctx.now, 'yyyy');
    if (fmt_(at, 'yyyy') !== year) add('MEDIUM', 'YEAR', r, 'Interview of ' + code + ' set in ' + fmt_(at, 'yyyy') + ' (' + when + '): probably a typo in the year', true);
    else if (reg instanceof Date && at < reg) add('MEDIUM', 'BEFORE', r, 'Interview of ' + code + ' set on ' + when + ', before they registered (' + fmt_(reg) + ')', true);
    else if (st !== ST.INTERVIEWED && at.getTime() - ctx.now.getTime() > 30 * day) add('INFO', 'FAR', r, 'Interview of ' + code + ' set more than 30 days ahead (' + when + ')', false);
    const hm = fmt_(at, 'HH:mm'), mins = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
    if (String(r[I['Interview Time']]).trim() && (mins < 7 * 60 || mins > 23 * 60)) add('INFO', 'HOUR', r, 'Interview of ' + code + ' at ' + hm + ', outside 07:00-23:00: AM/PM mixed up?', false);
    if ((c === 'Not yet' || c === 'Withdrew') && st !== ST.INTERVIEWED) add('INFO', 'CONTACT', r, code + ' has an interview date (' + when + ') but Contacted says "' + c + '"', false);
  });
  const KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(a => a[KI.Type] === 'ODD_VALUE' && /^ODD\|/.test(a[KI.Key]) && !seen[a[KI.Key]]);
}

/* ---------- full check of every binome sheet (daily digest, Check integrity) ---------- */
// Opens each sheet, so it never runs on the frequent trigger. It stops at the deadline and the next run carries on where
// it stopped (script property INTEG_NEXT = the next binome code). Its alerts close themselves when a later check of that binome is clean.

function integrityCheck_(ctx, deadline) {
  const list = activeOrPaused_(ctx).filter(b => b.fileId).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  if (!list.length) return 'Sheet check: there are no binome sheets yet.';
  const props = PropertiesService.getScriptProperties(), s = S_(), I = ctx.iv.I;
  // the cursor is the code of the next binome to check, so rows added or removed in between never make it skip one
  const next = String(props.getProperty('INTEG_NEXT') || '');
  let start = list.findIndex(b => b.code >= next);
  if (start < 0) start = 0;
  const owed = {}; // binome -> codes the Master puts in its sheet
  ctx.iv.data.forEach(r => {
    if (r[I.Code] && r[I.Binome] && !isOut_(r[I.Status])) (owed[r[I.Binome]] = owed[r[I.Binome]] || []).push(String(r[I.Code]).trim());
  });
  const env = { share: bool_(s.SHARE_FILES_WITH_BINOME) && !bool_(s.TEST_MODE), staff: null };
  const seen = {}, checked = {};
  let n = 0, problems = 0;
  for (; n < list.length && Date.now() < deadline; n++) {
    const b = list[(start + n) % list.length];
    checked[b.code] = true;
    checkBinomeFile_(ctx, b, owed[b.code] || [], env).forEach(x => {
      const key = 'INTEG|' + b.code + '|' + x.id;
      seen[key] = true; problems++;
      ctx.alerts.add({ severity: x.sev, type: 'INTEGRITY', code: x.code || '', binome: b.code, msg: b.code + ': ' + x.msg, key: key });
    });
    // the sheet is open: its dashboard interview forms too (a lost dirty mark is caught here). The tab itself is never checked.
    if (ctx.books[b.fileId]) try { syncAnswers_(ctx, b, ctx.books[b.fileId]); } catch (e) { console.warn('Interview Answers of ' + b.code + ': ' + e); }
  }
  props.setProperty('INTEG_NEXT', list[(start + n) % list.length].code);
  const KI = ctx.alerts.table.I;
  const listed = {}; list.forEach(b => { listed[b.code] = true; });
  ctx.alerts.resolveWhere(a => a[KI.Type] === 'INTEGRITY' && (checked[a[KI.Binome]] ? !seen[a[KI.Key]] : !listed[a[KI.Binome]]));
  return 'Sheet check: ' + n + ' of ' + list.length + ' binome sheets checked, ' + problems + ' problem' + (problems === 1 ? '' : 's') + ' found' +
    (n < list.length ? '. Run it again to check the rest.' : '.');
}

/** Who may edit any binome sheet besides its members: admins, the Master's owner/editors, the Binome Sheets folder's. */
function staffEmails_() {
  const out = adminEmails_().map(lc_), push = u => { try { out.push(lc_(u.getEmail())); } catch (e) { /* hidden email */ } };
  try { const f = DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID); f.getEditors().forEach(push); push(f.getOwner()); } catch (e) { console.warn('Binome folder access: ' + e); }
  try { const ss = ss_(); ss.getEditors().forEach(push); push(ss.getOwner()); } catch (e) { console.warn('Master editors: ' + e); }
  return out;
}

const cellNorm_ = v => String(v == null ? '' : v).replace(/^'/, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Problems of one binome sheet: [{sev, id (stable, for the alert key), msg, code}] */
function checkBinomeFile_(ctx, b, owed, env) {
  const out = [], add = (sev, id, msg, code) => out.push({ sev: sev, id: id, msg: msg, code: code || '' });
  let book;
  try { book = ctx.books[b.fileId] || (ctx.books[b.fileId] = SpreadsheetApp.openById(b.fileId)); }
  catch (e) { add('HIGH', 'open', 'cannot open its binome sheet (' + e.message + '). Fix its File ID in the Binomes tab or the access to the file.'); return out; }
  const title = String(book.getName()), m = title.match(/^\s*\[([^\]]*)\]/), titled = m && parseBinomeCode(m[1]);
  if (!titled || titled.code !== b.code) add('MEDIUM', 'title', 'its sheet is titled "' + title + '", not [' + b.code + ']: the binome may be filling in the wrong sheet. Rename the file, or fix the File ID in the Binomes tab.');
  // a first-layout sheet is rebuilt on open, within the per-run limit; past it, the check waits for a later run
  if (!ctx.files[b.fileId] && (ctx.upgraded || 0) >= UPGRADE_PER_RUN && bfLayout_(book.getSheets()[0]) === 'v1') return out;
  try { binomeSheet_(ctx, b); } catch (e) { /* if the rebuild fails, the checks below say why */ }
  const sheets = book.getSheets(), sh = sheets[0], F = idx_(BF_H);
  const isOurs = x => bfLayout_(x) === 'v2';
  if (!isOurs(sh)) {
    const real = sheets.slice(1).filter(isOurs)[0];
    add('HIGH', 'layout', real ? 'the tab "' + sh.getName() + '" was put in front of "' + real.getName() + '": the sync only reads the first tab, so nothing the binome writes is seen. Move "' + real.getName() + '" back to the first place.'
      : 'the header row of its sheet was changed: the sync reads columns by position, so Contacted / Date / Time may be read wrong. Put the headers back (from column B) as: ' + BF_HEAD.join(', ') + '.');
    return out; // everything else would be read from the wrong tab
  }
  const prot = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET), trig = lc_(PropertiesService.getScriptProperties().getProperty('TRIGGER_OWNER') || '');
  if (!prot.length) add('MEDIUM', 'protect', 'its sheet is no longer protected: the binome can overwrite the columns the script fills. Protect the tab again, except the gold columns (' + BF_EDITABLE.map(k => BF_LABEL[k] || k).join(', ') + ').');
  // a protection made before the triggers moved, or before an admin was added, misses them: they are locked out of the columns the sync fills
  else {
    const want = [trig].concat(env.admins || (env.admins = protectionEditors_())).filter((e, i, a) => e && a.indexOf(e) === i), miss = protectionMissing_(prot, want);
    if (miss.length) add('MEDIUM', 'protect', 'the protection of its sheet does not list ' + miss.join(', ') + ' (or its editors cannot be read), so ' +
      (miss.indexOf(trig) >= 0 ? 'the sync cannot' : 'a Sync now or an action run by ' + (miss.length === 1 ? 'that admin' : 'those admins') + ' cannot') +
      ' write the columns it fills. Only the sheet\'s owner can protect the tab again: Repair, or Re-protect binome sheets, signed in as the owner.');
  }
  const I = ctx.iv.I, last = bfLastRow_(sh);
  const vals = last >= 2 ? sh.getRange(2, BF_COL, last - 1, BF_H.length).getValues() : [];
  const at = {};
  vals.forEach((v, k) => {
    const code = String(v[F.Code]).trim();
    if (!code) return;
    if (at[code]) return add('MEDIUM', 'twice|' + code, code + ' is listed twice in its sheet (rows ' + at[code] + ' and ' + (k + 2) + '): delete one.', code);
    at[code] = k + 2;
    const r = ctx.ivByCode[code];
    if (!r) return add('MEDIUM', 'unknown|' + code, 'row ' + (k + 2) + ' of its sheet has code ' + code + ', which is not in the Interviewees tab.', code);
    if (r[I.Binome] !== b.code) return add('MEDIUM', 'extra|' + code, code + ' is in its sheet but belongs to ' + (r[I.Binome] || 'no binome') + ' in the Master: delete that row from the sheet.', code);
    // a name/email edited by hand in the Master is already an open MANUAL_EDIT (Apply copies it here): those fields are not
    // raised twice; the others still are. No baseline entry: all three are skipped while the alert is open.
    const key = r[I['Response Key']], prev = ctx.base && ctx.base.iv[key], now = prev && editEntry_('iv', r, I);
    const person = !ctx.alerts.openKeys[editKey_('iv', 'Person', key)] ? []
      : EDIT_GROUPS.iv.Person.filter(f => !prev || now[f] !== prev[f]);
    const cols = ['First Name', 'Family Name', 'Email', 'Phone'].filter(h => person.indexOf(h) < 0 && cellNorm_(v[F[h]]) !== cellNorm_(r[I[h]]));
    if (cols.length) add('MEDIUM', 'cols|' + code, code + ': ' + cols.join(', ') + ' in its sheet differ from the Master (these columns are protected: edited by someone with owner access, or changed in the Master).', code);
  });
  const missing = owed.filter(c => !at[c]);
  if (missing.length) add('HIGH', 'missing', missing.join(', ') + (missing.length > 1 ? ' are' : ' is') + ' assigned to ' + b.code + ' in the Master but missing from its sheet, so the binome cannot see them. Move interviewee to ' + b.code + ' puts the row back.', missing.join(', '));
  if (env.share) {
    let f;
    try { f = DriveApp.getFileById(b.fileId); } catch (e) { add('MEDIUM', 'drive', 'cannot read who has access to its sheet (' + driveErr_(e) + ').'); return out; }
    const editors = f.getEditors().map(u => lc_(u.getEmail())), viewers = f.getViewers().map(u => lc_(u.getEmail()));
    const members = b.members.map(x => x.email).filter(Boolean), covers = (ctx.covers || []).filter(c => c.binome === b.code);
    const staff = env.staff || (env.staff = staffEmails_());
    let owner = ''; try { owner = lc_(f.getOwner().getEmail()); } catch (e) { /* shared drive */ }
    members.filter(e => editors.indexOf(e) < 0).forEach(e => add('MEDIUM', 'noedit|' + e, e + ' is a member but cannot edit the sheet: use Re-share binome sheets.'));
    editors.filter(e => e !== owner && members.indexOf(e) < 0 && staff.indexOf(e) < 0 && !covers.some(c => c.email === e))
      .forEach(e => add('MEDIUM', 'stranger|' + e, e + ' can edit the sheet but is not a member: remove their access in Drive if they left the binome.'));
    covers.filter(c => editors.concat(viewers).indexOf(c.email) < 0)
      .forEach(c => add('INFO', 'cover|' + c.email, c.name + ' covers ' + c.codes.join(', ') + ' but cannot open the sheet.'));
  }
  return out;
}
