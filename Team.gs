/* ---------- team & binomes ---------- */

function titleCase_(s) {
  return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
}

function sectionToPair_(section) {
  const t = normText(section);
  if (t.indexOf('committ') >= 0) return { dep: 'Committee Board', pairAs: 'ALL' };
  if (t.indexOf('council') >= 0) return { dep: 'Council Board', pairAs: 'HR' };
  const d = normDept(section);
  return { dep: d || String(section).trim(), pairAs: d || 'SKIP' };
}

/** Pick the sheet that looks like a team database (has "First Name" + an email column in row 1). */
function findTeamSource_(ss) {
  const sheets = ss.getSheets().filter(sh => [TAB.TEAM, TAB.BINOMES, TAB.IV, TAB.REG_RESP, TAB.INT_RESP].indexOf(sh.getName()) < 0);
  const looks = sh => {
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 3) return false;
    const h = sh.getRange(1, 1, 1, Math.min(sh.getLastColumn(), 12)).getValues()[0].map(normText);
    return h.some(x => x.indexOf('first name') >= 0) && h.some(x => x.indexOf('mail') >= 0);
  };
  const named = sheets.filter(sh => /\b(ot|team|database|membres?)\b/i.test(sh.getName()) && looks(sh))[0];
  return named || sheets.filter(looks)[0] || null;
}

/** true if the email's local part plausibly belongs to that name (catches copy/paste mix-ups). */
function emailMatchesName_(email, name) {
  return !nameTokens(name).length || emailNameHits(email, name) >= 1;
}

function importTeam() {
  const ui = SpreadsheetApp.getUi();
  const local = findTeamSource_(ss_());
  const resp = ui.prompt('Import organizing team',
    'Paste the link of a team sheet laid out like "RECRUITMENT 2025 DATABASE"\n' +
    '(column A = section: Committee Board, Council Board, FLER, COMM, HR, IT; then First Name, Last Name, Email).\n\n' +
    'Leave empty to use ' + (local ? 'the "' + local.getName() + '" tab of this sheet.' : 'the 2025 database.'), ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const text = resp.getResponseText().trim();
  const res = importTeamCore_(text, false);
  if (!res.confirm) return;
  const ok = ui.alert('Replace the Team tab?', 'The Team tab already has ' + res.existing + ' members. Replace them with ' + res.incoming + ' imported members?', ui.ButtonSet.YES_NO);
  if (ok === ui.Button.YES) importTeamCore_(text, true);
}

/** Import without dialogs. If the Team tab has members and replace is false, writes nothing and returns {confirm:true,…}. */
function importTeamCore_(text, replace) {
  text = String(text || '').trim();
  const local = findTeamSource_(ss_());
  let src;
  if (!text && local) src = local;
  else {
    let id = text || CONFIG.TEAM_DB_DEFAULT_ID;
    const m = id.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m) id = m[1];
    const ext = SpreadsheetApp.openById(id);
    src = findTeamSource_(ext) || ext.getSheets()[0];
  }
  const sh = ss_().getSheetByName(TAB.TEAM);
  // Import writes column G: refused while it is someone else's column, as teamSet is (hasExpCol_)
  if (addMissingColumns_(sh, TEAM_H)[TEAM_H.indexOf('Experienced')] !== 'Experienced') throw new Error(NO_EXP_COL);
  const used = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().filter(r => String(r[0]).trim() || String(r[1]).trim()).length : 0;
  if (used && !replace) return { confirm: true, existing: used, incoming: teamRowsFrom_(src.getDataRange().getValues()).length, source: src.getName() };
  const past = pastTeam_(), rows = teamRowsFrom_(src.getDataRange().getValues(), past);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TEAM_H.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, TEAM_H.length).setValues(rows);
  const count = {}; rows.forEach(r => { count[r[3]] = (count[r[3]] || 0) + 1; });
  const issues = rows.filter(r => r[5]).map(r => '• ' + r[0] + ': ' + r[5]);
  say_('Imported ' + rows.length + ' members from "' + src.getName() + '".\nPair As: ' + Object.keys(count).map(k => k + ' ' + count[k]).join(' · ') +
    '\n' + (past ? rows.filter(r => r[6]).length + ' marked Experienced (in the 2025 team).' : 'The 2025 database could not be read, so nobody is marked Experienced yet.') +
    (issues.length ? '\n\nPlease check these rows (see the Notes column):\n' + issues.join('\n') : '') +
    '\n\nReview "Pair As" (HR side / IT, COMM, FLER side / ALL = board lead / SKIP), tick "Exclude" for anyone not interviewing and ' +
    '"Experienced" for anyone else who has interviewed before, then pair the binomes.');
  return { done: true };
}

/** Emails of the 2025 organizing team (CONFIG.TEAM_DB_DEFAULT_ID), who have interviewed before; null when it can't be read. */
function pastTeam_() {
  try {
    const db = SpreadsheetApp.openById(CONFIG.TEAM_DB_DEFAULT_ID), out = {};
    teamRowsFrom_((findTeamSource_(db) || db.getSheets()[0]).getDataRange().getValues()).forEach(r => { if (r[1]) out[r[1]] = true; });
    return out;
  } catch (e) { console.warn('2025 database not read: ' + e); return null; }
}

/** Team rows [name, email, dept, pairAs, exclude, notes, experienced] from a 2025-style database; experienced = the email is in
 *  `past` (pastTeam_). */
function teamRowsFrom_(vals, past) {
  const hdr = vals[0].map(normText);
  const col = (re, d) => { const i = hdr.findIndex(h => re.test(h)); return i >= 0 ? i : d; };
  const cF = col(/first name/, 1), cL = col(/last name|family name/, 2), cE = col(/mail/, 3);
  let section = '';
  const rows = [], seen = {};
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][0]).trim()) section = String(vals[r][0]).trim();
    const email = String(vals[r][cE] || '').trim().toLowerCase();
    const name = titleCase_((String(vals[r][cF] || '').trim() + ' ' + String(vals[r][cL] || '').trim()).trim());
    if (!email && !name) continue;
    const p = sectionToPair_(section);
    const notes = [];
    if (!email) notes.push('Missing email: will not be paired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) notes.push('Invalid email');
    else if (!emailMatchesName_(email, name)) notes.push('Email does not look like this person\'s (' + email + ')');
    if (email && seen[email]) notes.push('Same email as ' + seen[email]);
    if (email) seen[email] = name;
    rows.push([name, email, p.dep, p.pairAs, false, notes.join('; '), !!(past && email && past[email])]);
  }
  return rows;
}

/** The Team tab has its Experienced column (column G says so). Loading the tab writes that header into an empty G1, never over
 *  another one: until Setup puts it there, column G is someone else's and nobody counts as experienced. */
const hasExpCol_ = ctx => ctx.team.head[ctx.team.I.Experienced] === 'Experienced';
const NO_EXP_COL = 'The Team tab has no Experienced column yet (its column G holds something else). Run Setup first, from the ' +
  'Master: VIC Recruitment › Run setup again, as vic.rh (the account that owns the triggers). Nothing was changed.';

/** Team tab as [{name, email, pairAs, exclude, experienced}]; an empty Pair As falls back to the department. */
function teamMembers_(ctx) {
  const T = ctx.team.I, exp = hasExpCol_(ctx);
  return ctx.team.data.filter(r => String(r[T.Email]).trim()).map(r => {
    let pairAs = String(r[T['Pair As']]).trim().toUpperCase();
    if (!pairAs) pairAs = sectionToPair_(r[T.Department]).pairAs;
    return { name: String(r[T['Full Name']]).trim(), email: String(r[T.Email]).trim().toLowerCase(), pairAs: pairAs,
      exclude: bool_(r[T.Exclude]), experienced: exp && bool_(r[T.Experienced]) };
  });
}

/* ---------- drafts: the random draw and the pairing panel, all before Lock ---------- */

function draftBinomes() { draftCore_(false); }

const isDraft_ = (r, B) => String(r[B.Status]).trim().toUpperCase() === 'DRAFT' && !!String(r[B.Binome]).trim();
/** The DRAFT rows, in sheet order. */
function draftRows_(ctx) { return ctx.bin.data.filter(r => isDraft_(r, ctx.bin.I)); }
/** Team members by email, excluded and SKIP too (a draft row typed by hand may hold anyone). */
function teamByEmail_(ctx) { const o = {}; teamMembers_(ctx).forEach(m => { o[m.email] = m; }); return o; }
/** A draft row as a pair (makePair), its members looked up in the Team tab; someone not in it counts as new, side unknown. */
function rowPair_(who, r, B) {
  const m = k => { const e = lc_(r[B['Email ' + k]]); return who[e] || { name: String(r[B['Member ' + k]]).trim(), email: e, pairAs: '', experienced: false }; };
  const a = m(1), b = String(r[B['Email 2']]).trim() || String(r[B['Member 2']]).trim() ? m(2) : null;
  return makePair(a, b);
}
/** The note on a draft's code cell: its warning, then "Both members are new". */
function draftNote_(p) { return [p.warning, p.bothNew ? 'Both members are new' : ''].filter(Boolean).join('. '); }
function noteCell_(range, notes) {
  range.setNotes(notes.map(n => [n ? '⚠️ ' + n : ''])).setBackgrounds(notes.map(n => [n ? '#fce5cd' : null]));
}

/** Rewrite the Binomes tab: the rows that are not DRAFT stay first as they are, then `drafts` (rows), coded B.NN upwards from
 *  the highest code above them, so the codes have no gaps (nothing points at a DRAFT code until Lock). Each draft's code cell
 *  gets its note. ctx follows (bin.data, binomes). */
function writeDrafts_(ctx, drafts) {
  const B = ctx.bin.I, sh = ctx.bin.sh, who = teamByEmail_(ctx);
  const kept = ctx.bin.data.filter(r => !isDraft_(r, B) && String(r[B.Binome]).trim());
  let max = 0; kept.forEach(r => { const n = codeNum(r[B.Binome]); if (n > max) max = n; });
  drafts.forEach((r, i) => { r[B.Binome] = 'B.' + pad2(max + i + 1); });
  const all = kept.concat(drafts), n = sh.getLastRow() - 1;
  if (n > 0) { sh.getRange(2, 1, n, BIN_H.length).clearContent(); sh.getRange(2, 1, n, 1).clearNote().setBackground(null); }
  if (all.length) sh.getRange(2, 1, all.length, BIN_H.length).setValues(all);
  if (drafts.length) noteCell_(sh.getRange(kept.length + 2, 1, drafts.length, 1), drafts.map(r => draftNote_(rowPair_(who, r, B))));
  ctx.bin.data = all;
  indexCtx_(ctx);
}

/** A new DRAFT row for a pair from makePair / draftPairs. */
function draftRow_(p, B) {
  const row = new Array(BIN_H.length).fill('');
  row[B['Member 1']] = p.a.name; row[B['Email 1']] = p.a.email;
  row[B['Member 2']] = p.b ? p.b.name : ''; row[B['Email 2']] = p.b ? p.b.email : '';
  row[B.Tag] = p.tag; row[B.Status] = 'DRAFT';
  return row;
}

/** Drafts made by hand on the pairing panel, kept as their members' emails ('a|b', sorted) in DRAFT_HAND: Redraw all asks before
 *  it loses them, and the panel marks them. Pairs drawn by the draft are not in it. */
const handKey_ = emails => emails.map(lc_).filter(Boolean).sort().join('|');
function handDrafts_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('DRAFT_HAND') || '[]'); } catch (e) { return []; } }
/** Save the hand-made keys that still match a DRAFT row, plus `add`. */
function keepHand_(ctx, add) {
  const B = ctx.bin.I, live = draftRows_(ctx).map(r => handKey_([r[B['Email 1']], r[B['Email 2']]]));
  PropertiesService.getScriptProperties().setProperty('DRAFT_HAND', JSON.stringify(handDrafts_().filter(k => live.indexOf(k) >= 0).concat(add ? [add] : [])));
}

/** "28 binomes, 26 with an experienced member, 2 without one (12 experienced for 30 new)." */
function mixText_(m) {
  return m.binomes + ' binome' + (m.binomes === 1 ? '' : 's') + ', ' + m.withExp + ' with an experienced member, ' + m.without + ' without one (' +
    m.experienced + ' experienced for ' + m.fresh + ' new).';
}

const DRAFTS_CLOSED = 'Binomes are already locked, so drafts are closed. Members without a binome are listed on the Binomes page: place them with Change members or Pair two….';

/** Runs fn(ctx) on a fresh context in the script lock, for the draft actions: refused once anything is locked, hand edits
 *  checked first and the baseline saved after, so the drafts' own writes never show as hand edits. fn throws to refuse. */
function draftEdit_(fn) {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    if (activeOrPaused_(ctx).length) throw new Error(DRAFTS_CLOSED);
    detectEdits_(ctx);
    const out = fn(ctx);
    ctx.alerts.flush();
    commitBase_(ctx);
    return out;
  });
  if (!res) busy_();
  return res;
}

/** Draft (keep false: Redraw all) clears every DRAFT row and draws everyone; keep true (Draw the rest) keeps the drafts there are
 *  and draws only the members still free. Closed once binomes are locked: free members show up as UNPAIRED_MEMBER alerts. */
function draftCore_(keep) {
  let res;
  try {
    res = draftEdit_(ctx => {
      const B = ctx.bin.I, held = keep ? draftRows_(ctx) : [], taken = {};
      held.forEach(r => { [r[B['Email 1']], r[B['Email 2']]].forEach(e => { if (lc_(e)) taken[lc_(e)] = true; }); });
      const members = teamMembers_(ctx).filter(m => !m.exclude && m.pairAs !== 'SKIP' && !taken[m.email]);
      const pairs = draftPairs(members, Math.random);
      writeDrafts_(ctx, held.concat(pairs.map(p => draftRow_(p, B))));
      if (keep) keepHand_(ctx); else PropertiesService.getScriptProperties().deleteProperty('DRAFT_HAND');
      const who = teamByEmail_(ctx), tags = {};
      pairs.forEach(p => { tags[p.tag] = (tags[p.tag] || 0) + 1; });
      return { n: pairs.length, held: held.length, members: members.length, tags: tags, mix: draftMix(draftRows_(ctx).map(r => rowPair_(who, r, B))),
        warnings: draftRows_(ctx).slice(held.length).map((r, i) => pairs[i].warning ? r[B.Binome] + ': ' + pairs[i].warning : '').filter(Boolean) };
    });
  } catch (e) {
    if (e.message !== DRAFTS_CLOSED) throw e;
    return say_(DRAFTS_CLOSED); // a message, not an error: the menu shows it as a dialog
  }
  if (!res) return;
  say_((keep ? 'Drew ' + res.n + ' more binomes from the ' + res.members + ' free members; the ' + res.held + ' pairs already made stay.\n'
    : 'Drafted ' + res.n + ' binomes from ' + res.members + ' available members.\n') +
    Object.keys(res.tags).map(k => k + ': ' + res.tags[k]).join(' · ') + '\nDrafts now: ' + mixText_(res.mix) +
    (res.warnings.length ? '\n\nPlease check:\n' + res.warnings.join('\n') : '') +
    '\n\nLock them when you are happy.');
}

/** webRun('draftPair', {emailA, emailB}): two free members (in the Team tab, not excluded, not SKIP, in no draft) become a
 *  DRAFT row at the end, tagged as Pair two… would (pairTag), board lead or HR member first. No confirmation: drafts are scratch. */
function draftPair_(args) {
  const ea = lc_(args.emailA), eb = lc_(args.emailB);
  if (!ea || !eb) throw new Error('Choose two members.');
  if (ea === eb) throw new Error('Choose two different members.');
  return draftEdit_(ctx => {
    const B = ctx.bin.I, who = teamByEmail_(ctx), inDraft = {};
    draftRows_(ctx).forEach(r => { [r[B['Email 1']], r[B['Email 2']]].forEach(e => { if (lc_(e)) inDraft[lc_(e)] = r[B.Binome]; }); });
    const [x, y] = [ea, eb].map(e => {
      const m = who[e], name = m ? m.name || e : e;
      if (!m) throw new Error(e + ' is not in the Team tab.');
      if (m.exclude) throw new Error(name + ' is excluded in the Team tab.');
      if (m.pairAs === 'SKIP') throw new Error(name + ' is set to SKIP (not interviewing) in the Team tab.');
      if (inDraft[e]) throw new Error(name + ' is already in draft ' + inDraft[e] + '.');
      return m;
    });
    const rank = m => (m.pairAs === 'ALL' ? 0 : m.pairAs === 'HR' ? 1 : 2);
    const p = rank(y) < rank(x) ? makePair(y, x) : makePair(x, y);
    if (!tagDepts(p.tag).length) throw new Error('No department to receive from (Pair As ' + x.pairAs + ' / ' + y.pairAs + ').');
    writeDrafts_(ctx, draftRows_(ctx).concat([draftRow_(p, B)]));
    keepHand_(ctx, handKey_([x.email, y.email]));
    const rows = draftRows_(ctx), code = rows[rows.length - 1][B.Binome];
    return { binome: code, tag: p.tag, warning: p.warning, bothNew: p.bothNew };
  });
}

/** webRun('draftUnpair', {binome, email?}): remove a DRAFT row; its members are free again and the later drafts move up a code.
 *  email (one of the row's members, as the page showed it) guards against a code that moved meanwhile. */
function draftUnpair_(args) {
  const code = String(args.binome || '').trim(), e = lc_(args.email);
  return draftEdit_(ctx => {
    const B = ctx.bin.I, rows = draftRows_(ctx), r = rows.filter(x => x[B.Binome] === code)[0];
    if (!r) throw new Error(code + ' is not a draft binome.');
    if (e && lc_(r[B['Email 1']]) !== e && lc_(r[B['Email 2']]) !== e) throw new Error(code + ' changed meanwhile: nothing was removed. Look again and retry.');
    writeDrafts_(ctx, rows.filter(x => x !== r));
    keepHand_(ctx);
    return { removed: code, members: [r[B['Member 1']], r[B['Member 2']]].map(String).filter(s => s.trim()) };
  });
}

/** webRun('teamSet', {email, experienced}): tick or untick Experienced for one Team member (open after Lock too). A draft
 *  holding them gets its note again ("Both members are new"). */
function teamSet_(args) {
  const e = lc_(args.email), on = args.experienced === true;
  if (typeof args.experienced !== 'boolean') throw new Error('Experienced must be true or false.');
  const res = withLock_(() => {
    const ctx = loadCtx_(), T = ctx.team.I, i = ctx.team.data.findIndex(r => lc_(r[T.Email]) === e);
    if (!hasExpCol_(ctx)) throw new Error(NO_EXP_COL);
    if (i < 0) throw new Error((e || 'That member') + ' is not in the Team tab.');
    ctx.team.data[i][T.Experienced] = on;
    ctx.team.sh.getRange(i + 2, T.Experienced + 1).setValue(on);
    const who = draftNotes_(ctx, [e]);
    return { email: e, experienced: on, name: who[e].name };
  });
  if (!res) busy_();
  return res;
}

/** The drafts holding one of these members get their note again ("Both members are new"), after their Experienced tick
 *  changed (teamSet_, the apply entry). ctx needs team and bin. Returns teamByEmail_. */
function draftNotes_(ctx, emails) {
  const B = ctx.bin.I, who = teamByEmail_(ctx);
  ctx.bin.data.forEach((r, j) => {
    if (isDraft_(r, B) && emails.some(e => lc_(r[B['Email 1']]) === e || lc_(r[B['Email 2']]) === e)) noteCell_(ctx.bin.sh.getRange(j + 2, 1), [draftNote_(rowPair_(who, r, B))]);
  });
  return who;
}

function lockBinomes() {
  const ui = SpreadsheetApp.getUi();
  const chk = lockCheck_();
  if (!chk.drafts) return say_('There are no draft binomes to lock. Draft the binomes first.');
  const ok = ui.alert('Lock ' + chk.drafts + ' binomes?',
    'This creates one sheet per binome in "Binome Sheets"' + (chk.share ? ', shares it with both members (they get a Google share email)' : '') +
    ' and starts routing registrants to them.' + (chk.problems.length ? '\n\n⚠️ Problems found:\n' + chk.problems.join('\n') + '\n\nContinue anyway?' : ''), ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  lockBinomesCore_();
}

/** What locking would do: {drafts, share, problems[]}. Writes nothing. */
function lockCheck_() {
  const pre = loadCtx_();
  const B = pre.bin.I;
  const drafts = pre.bin.data.filter(r => String(r[B.Status]).toUpperCase() === 'DRAFT' && String(r[B.Binome]).trim());
  const seen = {}, problems = [];
  pre.bin.data.forEach(r => {
    [r[B['Email 1']], r[B['Email 2']]].forEach(e => {
      e = String(e).trim().toLowerCase(); if (!e) return;
      if (seen[e]) problems.push(e + ' is in both ' + seen[e] + ' and ' + r[B.Binome]); else seen[e] = r[B.Binome];
    });
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !String(r[B['Email 1']]).trim() && !String(r[B['Email 2']]).trim()) problems.push(r[B.Binome] + ' has no email');
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !tagDepts(r[B.Tag]).length) problems.push(r[B.Binome] + ' has an unreadable tag "' + r[B.Tag] + '"');
  });
  return { drafts: drafts.length, share: bool_(S_().SHARE_FILES_WITH_BINOME) && !bool_(S_().TEST_MODE), problems: problems };
}

/** 'code|email' of every member told by a PAIRED mail (Lock, Pair two…, the catch-up), in PAIRED_SENT: each is told once. */
function pairedSent_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('PAIRED_SENT') || '[]'); } catch (e) { return []; } }
function pairedMark_(keys) {
  PropertiesService.getScriptProperties().setProperty('PAIRED_SENT', JSON.stringify(pairedSent_().concat(keys)));
}
/** The members of locked binomes not told yet: [{b, m, key}]. */
function pairedTodo_(ctx) {
  const done = pairedSent_(), out = [];
  activeOrPaused_(ctx).forEach(b => b.members.forEach(m => {
    const key = b.code + '|' + m.email;
    if (m.email && done.indexOf(key) < 0) out.push({ b: b, m: m, key: key });
  }));
  return out;
}
/** The PAIRED mail for member m of binome `code` (names: both members), sent by Lock, the catch-up and Pair two…. */
function pairedMail_(code, m, names, url) { return mailSend_(m.email, pairedMailOf_(code, m, names, url), code); }
function pairedMailOf_(code, m, names, url) {
  return mailFrom_('PAIRED', { first: m.name.split(' ')[0], binome: code, members: names }, { cta: mailDashboardCta_(), footer: mailTeamFooter_(url) });
}
/** Send PAIRED to everyone pairedTodo_ lists. TEST_MODE skips non-admins and leaves them untold, so going live sends theirs.
 *  Returns {sent, failed[] (emails)}. */
function mailPaired_(ctx) {
  const keys = [], failed = [], test = bool_(S_().TEST_MODE);
  pairedTodo_(ctx).forEach(t => {
    const names = t.b.members.map(m => m.name).join(' & ');
    const ok = pairedMail_(t.b.code, t.m, names, t.b.fileUrl);
    if (ok) keys.push(t.key); else if (!test) failed.push(t.m.email);
  });
  if (keys.length) pairedMark_(keys);
  return { sent: keys.length, failed: failed };
}

/** Menu: send the PAIRED mail to the members of locked binomes who never got it (binomes locked before Lock sent it). */
function mailPairedBinomes() {
  const ui = SpreadsheetApp.getUi(), n = pairedTodo_(loadCtx_()).length;
  if (!n) return say_('Every member of a locked binome has already been emailed their binome.');
  if (ui.alert('Email ' + n + ' members their binome?', 'Each gets "You are in binome B.NN" with their partner and the sheet link.',
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  pairedSend_();
}
/** The catch-up's send (menu and Maintenance): only PAIRED_SENT changes, nothing in the Master. Returns {sent, failed} or null (busy). */
function pairedSend_() {
  const r = withLock_(() => mailPaired_(loadCtx_()), 60000); // one sender at a time: two runs would mail the same members
  if (!r) { busy_(); return null; }
  say_(r.sent || r.failed.length ? 'Sent ' + r.sent + ' email' + (r.sent === 1 ? '' : 's') + '.' +
    (r.failed.length ? '\n\nNot sent (run this again to retry them): ' + r.failed.join(', ') : '') +
    (bool_(S_().TEST_MODE) ? '\n\nTest mode is on: non-admins were skipped and stay untold.' : '')
    : 'Nobody was emailed: every member of a locked binome has been told' + (bool_(S_().TEST_MODE) ? ', or test mode skipped them.' : '.'));
  return r;
}
/** webRun('pairedMail') without send: the untold members by binome and the New binome mail as the first of them gets it. Reads only. */
function pairedPreview_() {
  const todo = pairedTodo_(loadCtx_()), by = {}, binomes = [];
  todo.forEach(t => {
    if (!by[t.b.code]) binomes.push(by[t.b.code] = { code: t.b.code, members: [] });
    by[t.b.code].members.push({ name: t.m.name, email: t.m.email });
  });
  const t = todo[0], m = t ? pairedMailOf_(t.b.code, t.m, t.b.members.map(x => x.name).join(' & '), t.b.fileUrl) : null;
  return { count: todo.length, binomes: binomes, subject: m ? m.subject : '', html: m ? m.html : '', testMode: bool_(S_().TEST_MODE) };
}

function lockBinomesCore_(budgetMs) {
  const t0 = Date.now(), budget = Math.max(30000, Math.min(270000, Number(budgetMs) || 270000));
  let created = 0, stopped = false, mailed;
  const held = withLock_(() => {
    const ctx = loadCtx_();
    const BI = ctx.bin.I;
    for (let i = 0; i < ctx.bin.data.length; i++) {
      const r = ctx.bin.data[i];
      if (String(r[BI.Status]).toUpperCase() !== 'DRAFT' || !String(r[BI.Binome]).trim()) continue;
      if (Date.now() - t0 > budget) { stopped = true; break; }
      const b = { code: String(r[BI.Binome]).trim(), tag: String(r[BI.Tag]).trim() };
      const members = [[r[BI['Member 1']], r[BI['Email 1']]], [r[BI['Member 2']], r[BI['Email 2']]]]
        .filter(m => String(m[0]).trim() || String(m[1]).trim()).map(m => ({ name: String(m[0]).trim(), email: String(m[1]).trim().toLowerCase() }));
      let file;
      if (r[BI['File ID']]) file = SpreadsheetApp.openById(r[BI['File ID']]);
      else file = createBinomeFile_(b, members);
      r[BI.File] = file.getUrl(); r[BI['File ID']] = file.getId(); r[BI.Status] = 'ACTIVE'; r[BI.Created] = new Date();
      ctx.bin.sh.getRange(i + 2, 1, 1, BIN_H.length).setValues([r]);
      created++;
    }
    indexCtx_(ctx);
    saveMemberMap_(ctx);
    mailed = mailPaired_(ctx);
    return true;
  }, 60000);
  if (!held) return busy_();
  // the sync after the sheets are created (creating them is not in its total); placing stops 4 min after this call started,
  // leaving 2 for the save, alerts, mails (one per member of each binome that got someone), tracker and snapshot
  const c = runCycle_({ kind: 'post-lock', pull: false, timing: false, tracker: true, wait: 60000, assignBy: t0 + 240000 });
  say_('Locked ' + created + ' binomes.' + (stopped ? '\n\nPaused before the time limit: lock again to finish the rest.' : '') +
    (mailed.failed.length ? '\n\nBinome email not sent to: ' + mailed.failed.join(', ') + ' (Maintenance › Email binome members their binome).' : '') +
    (c && c.leftWaiting ? '\n' + c.leftWaiting + ' waiting registrants will be assigned by the next sync.' : '\nAny waiting registrants have been assigned.'));
}

const RESET_PHRASE = 'I confirm to reset the binomes';
// Open alerts of these types belong to the old binomes (any alert with a Binome does too) and are closed by a reset
const RESET_ALERT_TYPES = ['MANUAL_EDIT', 'INTEGRITY', 'UNPAIRED_MEMBER', 'MEMBER_CHANGED', 'COVER_ADDED', 'REASSIGNED', 'FILE_ERROR'];

const RETIRED_FOLDER = 'Retired binomes';
/** The subfolder of the binome folder that keeps the sheets of retired binomes (made on first use). The sync lists only the
 *  files of the binome folder itself, so nothing in here is read. */
function retiredFolder_() {
  const root = DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID), it = root.getFoldersByName(RETIRED_FOLDER);
  return it.hasNext() ? it.next() : root.createFolder(RETIRED_FOLDER);
}

/**
 * Start over with a new organizing team (OT). Moves every binome sheet to the "Retired binomes" folder (named with the
 * reset date, so a second reset's [B.01] is not mistaken for the first, and no longer shared with the old members), empties Binomes, Team,
 * Member Changes and Interviewee Changes (the new binomes reuse the codes), sends every interviewee back to UNASSIGNED (codes and registration data stay; what the binomes had
 * written is cleared), closes the alerts of the old binomes and forgets what the script knew about them. Registrations
 * deleted by hand stay deleted. The phrase is checked here, not only in the dashboard. Returns null when the script is busy.
 */
function resetBinomesCore_(phrase) {
  if (String(phrase || '').trim() !== RESET_PHRASE) throw new Error('Type exactly: ' + RESET_PHRASE);
  return withLock_(() => {
    const ctx = loadCtx_();
    const I = ctx.iv.I, A = ctx.alerts.table.I;
    const failed = [], retired = retiredFolder_(), day = fmt_(ctx.now, 'yyyy-MM-dd'), staff = staffEmails_();
    let moved = 0;
    ctx.binomes.forEach(b => {
      if (!b.fileId) return;
      try {
        const f = DriveApp.getFileById(b.fileId);
        // the sheet holds applicants' contact details: the outgoing members lose it (staff and the owner stay)
        f.getEditors().forEach(u => { const e = lc_(u.getEmail()); if (staff.indexOf(e) < 0) try { f.removeEditor(e); } catch (x) { /* owner */ } });
        f.getViewers().forEach(u => { const e = lc_(u.getEmail()); if (staff.indexOf(e) < 0) try { f.removeViewer(e); } catch (x) { /* owner */ } });
        f.moveTo(retired); f.setName(f.getName() + ' (retired ' + day + ')'); moved++;
      } catch (e) { failed.push(b.code + ': ' + driveErr_(e)); }
    });
    const nBinomes = ctx.binomes.length, nTeam = ctx.team.data.filter(r => String(r[ctx.team.I.Email]).trim()).length;
    [[TAB.BINOMES, BIN_H], [TAB.TEAM, TEAM_H], [TAB.CHANGES, MC_H], [TAB.IV_CHANGES, IC_H], [TAB.MAIL_LOG, ML_H]].forEach(t => {
      const sh = ss_().getSheetByName(t[0]);
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, t[1].length).clearContent();
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).clearNote().setBackground(null);
    });
    let nIv = 0;
    ctx.iv.data.forEach(r => {
      // on hold and out stay as they are: a held row sent back to UNASSIGNED would be assigned at the next Lock
      if (isOut_(r[I.Status]) || r[I.Status] === ST.HELD || !(r[I.Binome] || r[I.Code])) return;
      ['Binome', 'Assigned At', 'Contacted', 'Contacted Seen At', 'Interview Date', 'Interview Time', 'Interview At',
        'Interview Submitted At', 'Interview Log Row', 'Binome Notes'].forEach(h => { r[I[h]] = ''; });
      r[I.Status] = ST.UNASSIGNED;
      nIv++;
    });
    saveTable_(ctx.iv);
    let nAlerts = 0;
    const alerts = ctx.alerts.table;
    alerts.data.forEach((r, i) => {
      if (r[A.Status] !== 'OPEN' || !(r[A.Binome] || RESET_ALERT_TYPES.indexOf(r[A.Type]) >= 0)) return;
      alerts.sh.getRange(i + 2, A.Status + 1).setValue('AUTO-RESOLVED');
      alerts.sh.getRange(i + 2, A['Resolved At'] + 1).setValue(ctx.now);
      nAlerts++;
    });
    // forget the old binomes; registrations deleted on purpose (iv entry 0) stay remembered so they are not re-imported
    const props = PropertiesService.getScriptProperties();
    ['FILE_SEEN', 'FILE_READ', 'INTEG_NEXT', 'BIN_ACCESS', 'DRAFT_HAND', 'PAIRED_SENT', CLOSE_KEY].forEach(k => props.deleteProperty(k));
    const old = loadBaseline_(), fresh = loadCtx_();
    fresh.base = { bin: {}, iv: {} };
    Object.keys((old && old.iv) || {}).forEach(k => { if (old.iv[k] === 0) fresh.base.iv[k] = 0; });
    saveBaseline_(editSnapshot_(fresh));
    saveMemberMap_(fresh); // nobody left: empty
    buildTracker_(fresh);
    return { retired: moved, failed: failed, binomes: nBinomes, team: nTeam, interviewees: nIv, alerts: nAlerts };
  }, 60000);
}

function reshareBinomeFiles() {
  if (bool_(S_().TEST_MODE)) { say_('Test mode is on in Settings, so sheets are not shared. Turn it off for the real launch.'); return; }
  const ctx = loadCtx_();
  let n = 0;
  const failed = [];
  ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
    let f, current;
    try { f = DriveApp.getFileById(b.fileId); current = f.getEditors().map(u => u.getEmail().toLowerCase()); }
    catch (e) { failed.push(b.code + ': ' + driveErr_(e)); return; }
    b.members.forEach(m => { if (m.email && current.indexOf(m.email) < 0) { try { f.addEditor(m.email); n++; } catch (e) { console.warn(e); } } });
  });
  say_('Sharing updated: ' + n + ' new share(s). People removed from a binome keep access until you remove them in Drive.' +
    (failed.length ? '\nNote: ' + failed.length + ' sheet(s) could not be reached:\n' + failed.slice(0, 5).join('\n') : ''));
}
