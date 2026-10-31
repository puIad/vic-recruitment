/* ---------- pause and resume a binome (docs/admin-features.md › Pause and resume a binome) ---------- */

/** The Binomes tab has its Paused Until column. Loading the tab writes that header into an empty cell, never over another one. */
const hasPausedCol_ = ctx => ctx.bin.head[ctx.bin.I['Paused Until']] === 'Paused Until';
const NO_PAUSED_COL = 'The Binomes tab has no Paused Until column yet (its last column holds something else). Run Setup first, from the ' +
  'Master: VIC Recruitment › Run setup again, as vic.rh. Nothing was changed.';
// a call stops starting moves after this, saves, and the retry goes on: scripts.run is cut at 6 min, the consumer waits 280 s
const MOVES_BUDGET_MS = 200000;

/** Pause, resume or change the resume date of one binome, judged against the tab: {end: applied | met | dropped, reason?}.
 *  c: {binome, op, note, until (ms or null)}. The caller saves the baseline and sends the mails queued here. */
function setBinomeStatus_(ctx, c) {
  const code = String(c.binome || '').trim(), b = ctx.binByCode[code], op = c.op, note = String(c.note || '').trim();
  const drop = reason => ({ end: 'dropped', reason: reason });
  if (['pause', 'resume', 'date'].indexOf(op) < 0) return drop('Not a change this entry knows.');
  if (!hasPausedCol_(ctx)) return drop(NO_PAUSED_COL);
  if (!b) return drop(code + ' is not in the Binomes tab any more.');
  const until = op !== 'resume' && c.until ? new Date(Number(c.until)) : null;
  if (until && isNaN(until)) return drop('That resume date is not a date.');
  const was = b.status, to = op === 'resume' ? 'ACTIVE' : 'PAUSED';
  if (op === 'date') {
    if (was !== 'PAUSED') return drop(code + ' is ' + was + ' now: it has no resume date to change.');
    if (+(b.pausedUntil || 0) === +(until || 0)) return { end: 'met' };
  } else {
    if (was === to) return { end: 'met' };
    if (was !== (op === 'pause' ? 'ACTIVE' : 'PAUSED')) return drop(code + ' is ' + was + ' now.');
  }
  if (op === 'pause' && !note) return drop('A pause needs a reason.');
  const B = ctx.bin.I, row = ctx.bin.data.indexOf(b.row) + 2, by = Session.getActiveUser().getEmail();
  ctx.bin.sh.getRange(row, B.Status + 1).setValue(to);
  ctx.bin.sh.getRange(row, B['Paused Until'] + 1).setValue(until || '');
  b.row[B.Status] = to; b.row[B['Paused Until']] = until || '';
  indexCtx_(ctx);
  ctx.statusWrote = true;
  const nb = ctx.binByCode[code], when = until ? ' until ' + fmt_(until, 'dd/MM/yyyy HH:mm') : '';
  try { changesSheet_().appendRow([ctx.now, by, 'STATUS', code, was, '', to + when, '', '', note, 'DONE'].map(plain_)); }
  catch (e) { console.warn('Member Changes not written: ' + e.message); } // a failed history write never undoes the change
  if (op === 'date') return { end: 'applied' };
  ctx.alerts.add({ severity: 'INFO', type: 'BINOME_STATUS', status: 'AUTO-FIXED', code: '', binome: code, key: '',
    msg: code + (op === 'pause' ? ' paused' + when : ' resumed') + ' by ' + by + (note ? ' (' + note + ')' : '') });
  (ctx.statusMails = ctx.statusMails || []).push({ b: nb, id: op === 'pause' ? 'BINOME_PAUSED' : 'BINOME_RESUMED', until: until ? ' until ' + fmt_(until, 'dd/MM HH:mm') : '' });
  return { end: 'applied' };
}

/** Both members of each binome paused or resumed this run. */
function sendBinomeStatusMails_(ctx) {
  (ctx.statusMails || []).forEach(x => x.b.members.forEach(m => {
    if (m.email) mailSend_(m.email, mailFrom_(x.id, { first: (m.name || '').split(' ')[0], binome: x.b.code, until: x.until }, { cta: mailDashboardCta_(), footer: mailTeamFooter_(x.b.fileUrl) }));
  }));
  ctx.statusMails = [];
}

/** A change's baseline, alert and mails, at once: a retry finds it met, so anything left for later would never go out. */
function tellBinomeStatus_(ctx) {
  if (!(ctx.statusMails || []).length && !ctx.statusWrote) return;
  ctx.statusWrote = false;
  commitBase_(ctx);
  ctx.alerts.flush();
  sendBinomeStatusMails_(ctx);
}

/** The first sync after a PAUSED binome's date resumes it, as a manual Resume does. Never fails the sync. */
function resumeDue_(ctx) {
  ctx.binomes.filter(b => b.status === 'PAUSED' && b.pausedUntil && b.pausedUntil <= ctx.now).forEach(b => {
    try { setBinomeStatus_(ctx, { binome: b.code, op: 'resume', note: 'Resume date reached' }); tellBinomeStatus_(ctx); }
    catch (e) { console.warn('Resume of ' + b.code + ': ' + e.message); }
  });
}

/** What the binome's own sheet says of its candidates: code -> contacted or dated? The Master only knows since the last sync. */
function sheetContacted_(ctx, b) {
  const sh = binomeSheet_(ctx, b), n = sh ? bfLastRow_(sh) : 0, F = idx_(BF_H), out = {};
  if (n >= 2) sh.getRange(2, BF_COL, n - 1, BF_H.length).getDisplayValues().forEach(v => {
    const c = String(v[F.Contacted]).trim();
    out[String(v[F.Code]).trim()] = (!!c && c !== 'Not yet') || !!String(v[F['Interview Date']]).trim();
  });
  return out;
}

/** The ticked codes leave the paused binome, each to the least-loaded ACTIVE binome taking its 1st choice; one that can't is
 *  dropped alone. {moves: the drops as [{code, reason}], more: out of time}. */
function movesOut_(ctx, c, deadline) {
  const I = ctx.iv.I, code = String(c.binome).trim(), drops = [], s = S_(), bad = ctx.badBinomes || (ctx.badBinomes = {});
  let sheet = {};
  try { sheet = sheetContacted_(ctx, ctx.binByCode[code]); } catch (e) { console.warn('Sheet of ' + code + ' not read: ' + e.message); } // each move then says why
  const list = Array.isArray(c.codes) ? c.codes.map(x => String(x).trim()) : [];
  for (let i = 0; i < list.length; i++) {
    if (Date.now() > deadline) return { moves: drops, more: true };
    const iv = list[i], r = ctx.ivByCode[iv], drop = reason => drops.push({ code: iv, reason: reason });
    if (!r) { drop('no longer registered'); continue; }
    const dep = String(r[I['1st Choice']]).trim();
    if (r[I.Binome] !== code) { // a retry: already moved
      const now = ctx.binByCode[r[I.Binome]];
      if (!now || now.status !== 'ACTIVE' || tagDepts(now.tag).indexOf(dep) < 0) drop('no longer in ' + code);
      continue;
    }
    const contacted = String(r[I.Contacted]).trim();
    if (sheet[iv] || (contacted && contacted !== 'Not yet') || [ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED].indexOf(r[I.Status]) >= 0) { drop('already contacted'); continue; }
    if (r[I.Status] !== ST.ASSIGNED) { drop(String(r[I.Status]).toLowerCase()); continue; }
    const load = loads_(ctx), pick = pickBinome(dep, activeBinomes_(ctx).filter(b => !bad[b.code]).map(b => ({ code: b.code, tag: b.tag, load: load[b.code] || 0 })),
      num_(s.ALL_BINOME_WEIGHT, 1), num_(s.HR_ONLY_WEIGHT, 1));
    if (!pick) { drop('no other ' + dep + ' binome'); continue; }
    try { moveInterviewee_(ctx, iv, pick.code); } catch (e) {
      if (/try again/.test(e.message)) return { moves: drops, more: true }; // a member saving in the sheet: nothing moved, the retry goes on
      if (/^Nothing moved/.test(e.message)) bad[pick.code] = true;
      drop(e.message);
    }
    saveTable_(ctx.iv); commitBase_(ctx); // the sheets have changed: the Master and the baseline follow before anything can cut the run
  }
  return { moves: drops };
}

/** Apply changes in the script lock, each pause first and then its moves. [{id, end, reason?, moves?}]; one out of time has no entry,
 *  and null = the lock is busy (nothing written). A retry finds the pause met and goes on with the codes still in the binome. */
function binomeChanges_(changes) {
  const deadline = Date.now() + MOVES_BUDGET_MS;
  return withLock_(() => {
    const ctx = loadCtx_(), out = [];
    detectEdits_(ctx);
    changes.forEach(c => {
      if (Date.now() > deadline) return;
      const r = Object.assign({ id: String(c.id || '') }, setBinomeStatus_(ctx, c));
      tellBinomeStatus_(ctx);
      if (c.op === 'pause' && r.end !== 'dropped') {
        const m = movesOut_(ctx, c, deadline);
        r.moves = m.moves;
        if (m.more) return;
      }
      out.push(r);
    });
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    buildTracker_(ctx);
    return out;
  }, 20000);
}

/** webRun('binomeStatus', {binome, op, note, until, codes}): the same write with the owner's switch off. */
function binomeStatusCore_(a) {
  const res = binomeChanges_([Object.assign({}, a, { id: 'direct' })]);
  if (!res) { busy_(); return null; }
  const r = res[0], code = String(a.binome || '').trim();
  if (!r) { say_(code + ' is paused, but not every move was made: move the rest with Move interviewee.'); return { end: 'applied', moves: [] }; }
  if (r.end === 'dropped') { say_(r.reason); return r; }
  say_(code + (a.op === 'pause' ? ' is paused.' : a.op === 'resume' ? ' is active again.' : ': resume date saved.') +
    ((r.moves || []).length ? ' Not moved: ' + r.moves.map(m => m.code + ' (' + m.reason + ')').join(', ') + '.' : ''));
  return r;
}
