/* ---------- phase-1 results (docs/admin-features.md › How a phase-1 result is decided) ---------- */
// A candidate's Final Affectation is a proposal. The Master's Phase 1 Result column holds overrides of it before final, and every
// candidate's result once final. Going final, reopening and corrections are vic.rh's (the Master's owner, as Re-protect).

const P1_KEY = 'PHASE1_FINAL'; // script property {at (ms), by}: set while the results are final
const P1_COL = 'Phase 1 Result';
const P1_NOTE_MAX = 300;

function p1Final_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(P1_KEY) || 'null'); } catch (e) { return null; } }
/** DUPLICATE, DECLINED and WITHDRAWN get no result and no results mail. */
const p1NoResult_ = st => st === ST.DUPLICATE || st === ST.DECLINED || st === ST.WITHDRAWN;
const p1Proposal_ = (I, r) => String(r[I['Final Affectation']] || '').trim();
/** What the Phase 1 Result column holds ('' = none). */
const p1Stored_ = (I, r) => String(r[I[P1_COL]] || '').trim();
/** The result shown: the column, else (before final) the proposal. '' = needs a decision. */
const p1Result_ = (I, r, final) => p1Stored_(I, r) || (final ? '' : p1Proposal_(I, r));
const p1Choices_ = (I, r) => [r[I['1st Choice']], r[I['2nd Choice']]].map(x => String(x || '').trim().toUpperCase());
/** Neither the 1st nor the 2nd choice (Not accepted never warns). */
const p1Warn_ = (I, r, res) => DEPTS.indexOf(res) >= 0 && p1Choices_(I, r).indexOf(res) < 0;

/** Has the first result mail gone? The first Result Told written (#178's column; absent until it exists). */
function resultMailsStarted_() {
  const sh = ss_().getSheetByName(TAB.IV);
  if (!sh || sh.getLastRow() < 2) return false;
  const c = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(v => String(v).trim()).indexOf('Result Told');
  return c >= 0 && sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues().some(r => String(r[0]).trim() !== '');
}
/** vic.rh: the account that owns the Master (the same check as Re-protect). */
function p1IsOwner_(a) {
  let owner = ''; try { owner = lc_(ss_().getOwner().getEmail()); } catch (e) { /* shared drive */ }
  return !!owner && lc_(a.email) === owner;
}

/** The last Phase 1 Result override row of each code in Interviewee Changes: code -> {proposal it was set against, its note}. */
function p1SetAgainst_() {
  const sh = ss_().getSheetByName(TAB.IV_CHANGES), out = {};
  if (!sh) return out;
  const t = loadTable_(TAB.IV_CHANGES, IC_H), C = t.I;
  t.data.forEach(r => { const m = /^Phase 1 Result set \(proposal: ([^)]*)\)(?:: ([\s\S]*))?$/.exec(String(r[C.What])); if (m) out[String(r[C.Code]).trim()] = { proposal: m[1], note: m[2] || '' }; else if (/^Phase 1 Result cleared/.test(String(r[C.What]))) delete out[String(r[C.Code]).trim()]; });
  return out;
}

/** webRun('p1View'): the candidates who need a result with their proposal, override and result, the accepted counts per department
 *  and what is left to decide; also what the results view shows beside them, as of the last sync (rating, choices, the binome's
 *  notes). Admins only (webRun). Returns {final, mails, counts, needs, rows: [{code, name, binome, status, c1, c2, rating (number or
 *  null), notes, interviewed, proposal, override, note (the override's, admins only), result, needs, warn, changed}]}. */
function p1View_() {
  const iv = loadTable_(TAB.IV, IV_H), I = iv.I, fin = p1Final_(), against = fin ? {} : p1SetAgainst_(), s = v => String(v == null ? '' : v).trim();
  const counts = {}; AFFECTATION_OPTIONS.forEach(o => { counts[o] = 0; });
  let needs = 0;
  const rows = [];
  iv.data.forEach(r => {
    const code = s(r[I.Code]);
    if (!code || p1NoResult_(r[I.Status])) return;
    const proposal = p1Proposal_(I, r), override = p1Stored_(I, r), result = p1Result_(I, r, !!fin), need = result === '', set = override ? against[code] : undefined;
    if (need) needs++; else counts[result]++;
    const rating = s(r[I.Rating]) === '' ? null : Number(r[I.Rating]);
    rows.push({ code: code, name: (s(r[I['First Name']]) + ' ' + s(r[I['Family Name']])).trim(), binome: s(r[I.Binome]), status: r[I.Status],
      c1: p1Choices_(I, r)[0], c2: p1Choices_(I, r)[1], rating: isNaN(rating) ? null : rating, notes: s(r[I['Binome Notes']]),
      interviewed: r[I.Status] === ST.INTERVIEWED || !!r[I['Interview Submitted At']], proposal: proposal, override: override, note: set ? set.note : '',
      result: result, needs: need, warn: p1Warn_(I, r, result), changed: !fin && !!set && set.proposal !== proposal });
  });
  return { final: fin ? { at: fin.at, by: fin.by } : null, mails: resultMailsStarted_(), counts: counts, needs: needs, rows: rows };
}

/* ---------- overrides ---------- */

/** One override of one candidate, applied to w.p1 (the Master's table, loaded once per call; p1Flush_ writes it).
 *  c: {code, value ('' clears), seen (the override the author saw; undefined = not compared), note?}. Returns a change result. */
function p1Apply_(w, c, id) {
  const drop = reason => ({ id: id, end: 'dropped', reason: reason });
  if (p1Final_()) return drop('The results are final: corrections go through vic.rh.');
  const code = String(c.code || '').trim(), value = String(c.value === null || c.value === undefined ? '' : c.value).trim(), note = String(c.note || '').trim();
  if (value && AFFECTATION_OPTIONS.indexOf(value) < 0) return drop('A result must be one of: ' + AFFECTATION_OPTIONS.join(', ') + '.');
  if (note.length > P1_NOTE_MAX) return drop('The note is longer than ' + P1_NOTE_MAX + ' characters.');
  const t = w.p1 || (w.p1 = { t: loadTable_(TAB.IV, IV_H), log: [] }), I = t.t.I;
  const r = t.t.data.filter(x => String(x[I.Code]).trim() === code)[0];
  if (!r) return drop(code + ' is no longer a candidate.');
  if (p1NoResult_(r[I.Status])) return drop(code + ' gets no result (' + r[I.Status] + ').');
  const cur = p1Stored_(I, r);
  if (cur === value) return { id: id, end: 'met' };
  if (c.seen !== undefined && cur !== String(c.seen === null ? '' : c.seen).trim()) return { id: id, end: 'dropped', sheet: cur };
  const before = p1Result_(I, r, false);
  r[I[P1_COL]] = value;
  const after = p1Result_(I, r, false);
  t.log.push([code, value ? 'Phase 1 Result set (proposal: ' + p1Proposal_(I, r) + ')' + (note ? ': ' + note : '') : 'Phase 1 Result cleared', before, after]);
  return { id: id, end: 'applied' };
}
/** Write what p1Apply_ changed, and log it. */
function p1Flush_(w) {
  if (!w.p1 || !w.p1.log.length) return;
  saveTable_(w.p1.t);
  w.p1.log.forEach(l => logIvChange_({ now: new Date() }, l[0], l[1], l[2], l[3]));
}

/** webRun('p1Set', {code, value, note?, seen?}): the direct write of one override (the pending path is the apply entry's 'result'
 *  kind). Returns {end: 'applied' | 'met' | 'dropped', reason?, sheet?}. */
function p1SetCore_(args) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) busy_();
  try {
    const w = {}, r = p1Apply_(w, args || {}, '');
    if (r.end === 'dropped' && !r.sheet) throw new Error(r.reason);
    p1Flush_(w);
    return { end: r.end, sheet: r.sheet };
  } finally { lock.releaseLock(); }
}

/** webRun('p1Never', {op: 'preview' | 'apply'}): candidates who still need a result and were never interviewed (no form, not
 *  Interviewed) go to Not accepted. Preview lists them; apply sets each as an override with the note "Never interviewed". */
function p1NeverCore_(args) {
  const op = String(args.op || '');
  if (['preview', 'apply'].indexOf(op) < 0) throw new Error('Not a change this entry knows.');
  if (p1Final_()) throw new Error('The results are final: corrections go through vic.rh.');
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) busy_();
  try {
    const w = { p1: { t: loadTable_(TAB.IV, IV_H), log: [] } }, I = w.p1.t.I;
    const codes = w.p1.t.data.filter(r => String(r[I.Code]).trim() && !p1NoResult_(r[I.Status]) && p1Result_(I, r, false) === '' &&
      r[I.Status] !== ST.INTERVIEWED && !r[I['Interview Submitted At']]).map(r => String(r[I.Code]).trim());
    if (op === 'apply') { codes.forEach(code => p1Apply_(w, { code: code, value: 'Not accepted', note: 'Never interviewed' }, code)); p1Flush_(w); }
    return { codes: codes, applied: op === 'apply' };
  } finally { lock.releaseLock(); }
}

/* ---------- final, reopen, correction (vic.rh) ---------- */

/** webRun('p1Final', {op: 'preview' | 'final' | 'reopen' | 'correct', code?, value?, reason?}). All but preview need vic.rh.
 *  preview: {final, owner, counts, needs, refusals: [why final is refused now]}.
 *  final: copies every candidate's result into the column (a candidate with no result gets '').
 *  reopen: until the first result mail; a row equal to its proposal goes back to following it, the others stay overrides.
 *  correct: one candidate, a reason required, logged; once final, for a row with no result yet or after the first result mail. */
function p1FinalCore_(a, args) {
  const op = String(args.op || '');
  if (['preview', 'final', 'reopen', 'correct'].indexOf(op) < 0) throw new Error('Not a change this entry knows.');
  if (op !== 'preview' && !p1IsOwner_(a)) throw new Error('Only vic.rh (the Master\'s owner) can ' + (op === 'correct' ? 'correct a result' : op + ' the results') + '.');
  // the document lock too (overrides hold only that one): an override can't land between the read and the write, or the final flag
  const out = withLock_(() => {
    const dl = LockService.getDocumentLock();
    if (op !== 'preview' && !dl.tryLock(10000)) return null;
    try { return p1FinalOp_(a, args, op); } finally { if (op !== 'preview') dl.releaseLock(); }
  }, 20000);
  if (!out) busy_();
  return out;
}
function p1FinalOp_(a, args, op) {
  {
    const iv = loadTable_(TAB.IV, IV_H), I = iv.I, fin = p1Final_(), props = PropertiesService.getScriptProperties();
    const view = () => { const counts = {}; AFFECTATION_OPTIONS.forEach(o => { counts[o] = 0; }); let needs = 0;
      iv.data.forEach(r => { if (!String(r[I.Code]).trim() || p1NoResult_(r[I.Status])) return; const x = p1Result_(I, r, !!fin); if (x) counts[x]++; else needs++; });
      return { counts: counts, needs: needs }; };
    const v = view();
    if (op === 'preview') {
      const refusals = [];
      if (fin) refusals.push('The results are already final.');
      if (!interviewClosed_()) refusals.push('The interview phase is still open.');
      if (v.needs) refusals.push(v.needs + ' candidate(s) still need a decision.');
      return { final: !!fin, owner: p1IsOwner_(a), counts: v.counts, needs: v.needs, refusals: refusals };
    }
    if (op === 'final') {
      if (fin) return { final: true, at: fin.at };
      if (!interviewClosed_()) throw new Error('The interview phase is still open: close it first.');
      if (v.needs) throw new Error(v.needs + ' candidate(s) still need a decision.');
      iv.data.forEach(r => { r[I[P1_COL]] = String(r[I.Code]).trim() && !p1NoResult_(r[I.Status]) ? p1Result_(I, r, false) : ''; });
      saveTable_(iv);
      props.setProperty(P1_KEY, JSON.stringify({ at: Date.now(), by: a.email }));
      logIvChange_({ now: new Date() }, '', 'Phase 1 Result final', '', AFFECTATION_OPTIONS.map(o => o + ' ' + v.counts[o]).join(', '));
      return { final: true, at: Date.now(), counts: v.counts };
    }
    if (op === 'reopen') {
      if (!fin) return { final: false };
      if (resultMailsStarted_()) throw new Error('The first result mail has gone: corrections are made one candidate at a time.');
      iv.data.forEach(r => { if (p1Stored_(I, r) === p1Proposal_(I, r)) r[I[P1_COL]] = ''; });
      saveTable_(iv);
      props.deleteProperty(P1_KEY);
      logIvChange_({ now: new Date() }, '', 'Phase 1 Result reopened', '', '');
      return { final: false };
    }
    // correct
    const reason = String(args.reason || '').trim(), code = String(args.code || '').trim(), value = String(args.value || '').trim();
    if (!fin) throw new Error('The results are not final: set it as an override.');
    if (!reason) throw new Error('A correction needs a reason.');
    if (AFFECTATION_OPTIONS.indexOf(value) < 0) throw new Error('A result must be one of: ' + AFFECTATION_OPTIONS.join(', ') + '.');
    const r = iv.data.filter(x => String(x[I.Code]).trim() === code)[0];
    if (!r) throw new Error(code + ' is not a candidate.');
    if (p1NoResult_(r[I.Status])) throw new Error(code + ' gets no result (' + r[I.Status] + ').');
    const was = p1Stored_(I, r);
    if (was && !resultMailsStarted_()) throw new Error('No result mail has gone yet: reopen the results to change ' + code + '.');
    if (was === value) return { code: code, value: value, end: 'met' };
    r[I[P1_COL]] = value;
    saveTable_(iv);
    logIvChange_({ now: new Date() }, code, 'Phase 1 Result correction: ' + reason, was, value);
    return { code: code, value: value, end: 'applied', remail: resultMailsStarted_() }; // the new mail is flagged by #178
  }
}
