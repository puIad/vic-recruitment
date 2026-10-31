/* ---------- 2) interview forms: the Google Form (Interview Responses) and the dashboard's (Interview Answers tabs) ---------- */

function intHeaders_(headers) {
  const n = headers.map(normText);
  const find = (pred) => { for (let i = 0; i < n.length; i++) if (pred(n[i])) return i; return -1; };
  return {
    ts: find(h => h === 'timestamp' || h.indexOf('horodateur') === 0),
    collected: find(h => h === 'email address' || h === 'adresse e mail'),
    binome: find(h => h.indexOf('binome code') >= 0 || h.indexOf('binome') === 0 || h.indexOf('your binome') >= 0),
    interviewee: find(h => h.indexOf('interviewee code') >= 0 || h.indexOf('interviewee') >= 0),
    c1: find(h => h.indexOf('1st department choice') >= 0 || h.indexOf('first department choice') >= 0),
    finalDep: find(h => h.indexOf('final main department') >= 0),
  };
}

function resolverCtx_(ctx) {
  const I = ctx.iv.I;
  const interviewed = {};
  ctx.iv.data.forEach(r => { if (r[I.Code] && r[I['Interview Submitted At']]) interviewed[r[I.Code]] = true; });
  return {
    binomes: ctx.binomes.filter(b => b.status === 'ACTIVE' || b.status === 'PAUSED'),
    interviewees: ctx.iv.data.filter(r => r[I.Code] && !isOut_(r[I.Status])).map(r => ({
      code: String(r[I.Code]).trim(), binome: String(r[I.Binome]).trim(),
      name: r[I['First Name']] + ' ' + r[I['Family Name']], firstChoice: String(r[I['1st Choice']]).trim() })),
    interviewed: interviewed,
    nameByEmail: ctx.nameByEmail,
    former: formerMembers_(),
    covers: ctx.coverMap,
    trustedBackups: String(S_().TRUSTED_BACKUPS || '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => /@/.test(e)),
  };
}

function processInterviews_(ctx) {
  const sh = responseSheet_('INT');
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const H = intHeaders_(data[0]), Q = questionCols_(data[0]);
  const get = (row, i) => (i >= 0 ? row[i] : '');
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const ts = get(row, H.ts);
    if (!ts) continue;
    const sub = String(get(row, H.collected)).trim().toLowerCase();
    const key = responseKey_(ts, sub, r + 1);
    if (ctx.logKeys[key]) continue;
    const got = logInterview_(ctx, { ts: ts, sub: sub, typedBinome: get(row, H.binome), typedIv: get(row, H.interviewee),
      c1: get(row, H.c1), finalDep: get(row, H.finalDep), key: key, redo: -1 });
    if (!got.b) continue;
    // its answers, read-only in the binome's dashboard, and the two cells every form fills; a sheet that refuses never holds up the log
    const vals = Q.map(i => get(row, i));
    try { copyFormToTab_(ctx, got.b, got.code, ts, sub, vals); fillFromForm_(ctx, got.b, got.code, vals, {}); }
    catch (e) { console.warn('Interview form of ' + got.code + ' not copied to the sheet of ' + got.b.code + ': ' + e); }
  }
}

/** One interview form into the Interview Log: a new row, or row f.redo again (an edited dashboard form, same key). Resolved and
 *  checked, its alerts raised, the candidate INTERVIEWED and their sheet row marked.
 *  f: {ts, sub, typedBinome, typedIv, c1, finalDep, key, redo (-1 = new), dash}. Returns {code, b: the candidate's binome now, or null}. */
function logInterview_(ctx, f) {
  const I = ctx.iv.I, rctx = ctx.rctx || (ctx.rctx = resolverCtx_(ctx)), typed = String(f.typedIv);
  // an edited form is not a second interview of its candidate
  const mine = ctx.ivByCode[typed.trim()], own = f.redo >= 0 && !!mine && Number(mine[I['Interview Log Row']]) === f.redo + 2;
  if (own) delete rctx.interviewed[typed.trim()];
  const res = resolveInterview({ submitter: f.sub, typedBinome: f.typedBinome,
    typedInterviewee: f.typedIv, typedFirstChoice: f.c1 }, rctx);

  const logRow = [f.ts, f.sub, String(f.typedBinome), typed, res.binome, res.interviewee,
    res.result, res.notes.concat(res.alerts.map(a => a.type + ': ' + a.msg)).join(' | '), f.finalDep, f.key];
  if (f.redo >= 0) { ctx.log.data[f.redo] = logRow; (ctx.logRedo = ctx.logRedo || {})[f.redo] = true; }
  else ctx.log.data.push(logRow);
  ctx.logKeys[f.key] = true;
  const logRowNumber = f.redo >= 0 ? f.redo + 2 : ctx.log.data.length + 1;

  const ivRow = res.interviewee ? ctx.ivByCode[res.interviewee] : null;
  const odd = (check, msg) => ctx.alerts.add({ severity: 'INFO', type: 'ODD_VALUE', code: res.interviewee || typed,
    binome: res.binome, msg: msg + ' [Interview Log row ' + logRowNumber + ']', key: 'INT|' + check + '|' + f.key });
  if (ivRow && String(ivRow[I.Contacted]).trim() === 'Withdrew') odd('WITHDREW', 'Interview form received for ' + res.interviewee + ', who is marked "Withdrew" in the binome sheet');
  const finalDep = String(f.finalDep).trim();
  if (finalDep && !formAffect_(finalDep)) odd('FINAL_DEP', 'Final department "' + finalDep + '" on the interview form is not IT, COMM, FLER, HR or 7ECHOH');
  if (ivRow) {
    const first = !ivRow[I['Interview Submitted At']];
    if (first) {
      ivRow[I['Interview Submitted At']] = f.ts;
      ivRow[I['Interview Log Row']] = logRowNumber;
      ivRow[I.Status] = ST.INTERVIEWED;
    }
    rctx.interviewed[res.interviewee] = true;
    // the form that counts marks the sheet: the first one, or the first one edited
    const b = first || Number(ivRow[I['Interview Log Row']]) === logRowNumber ? ctx.binByCode[ivRow[I.Binome]] : null;
    const bad = ctx.badBinomes || (ctx.badBinomes = {});
    // a sheet that refuses the mark never stops the log: the candidate stays INTERVIEWED, the sheet is skipped for this run
    if (b && !bad[b.code]) try {
      markInterviewInFile_(ctx, b, res.interviewee, (res.result === 'FLAGGED' ? '⚠️ ' : '✅ ') + fmt_(f.ts, 'dd/MM HH:mm') +
        (res.result === 'AUTOCORRECTED' ? ' (auto-corrected)' : '') + (f.dash ? ' (dashboard)' : ''));
    } catch (e) {
      bad[b.code] = true;
      ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', code: res.interviewee, binome: b.code, msg: 'Cannot mark ' + res.interviewee + ' in the file of ' + b.code + ': ' + e, key: 'FILE|' + b.code + '|' + res.interviewee });
    }
  }
  res.alerts.forEach(a => ctx.alerts.add({ severity: a.severity, type: a.type, code: res.interviewee || typed,
    binome: a.binome || res.binome, msg: a.msg + ' [Interview Log row ' + logRowNumber + ']', notifyBinome: a.notifyBinome,
    key: 'INT|' + a.type + '|' + f.key }));
  if (res.result === 'AUTOCORRECTED' && res.substantive) {
    ctx.alerts.add({ severity: 'INFO', type: 'AUTOCORRECTED', code: res.interviewee, binome: res.binome, status: 'AUTO-FIXED',
      msg: res.notes.join(' | ') + ' [Interview Log row ' + logRowNumber + ']', key: 'INT|AUTOCORRECTED|' + f.key });
  }
  return { code: res.interviewee, b: ivRow ? ctx.binByCode[ivRow[I.Binome]] || null : null };
}

/* ---------- the answers themselves: Rating and Final Affectation, the binome sheet's Interview Answers tab ---------- */

/** For each of INTERVIEW_QUESTIONS, the column of a response header row that holds it (-1: none). Questions whose titles read
 *  the same (the fluency ones of COMM and FLER) take those columns in form order. */
function questionCols_(headers) {
  const n = headers.map(normText), next = {};
  return INTERVIEW_QUESTIONS.map(q => {
    const t = normText(q.title), i = n.indexOf(t, next[t] || 0);
    next[t] = i < 0 ? n.length : i + 1;
    return i;
  });
}
const qIndex_ = id => INTERVIEW_QUESTIONS.findIndex(q => q.id === id);
/** Rating: the average of the scores answered, one decimal ('' when none is). vals: in INTERVIEW_QUESTIONS order. */
function formRating_(vals) {
  let sum = 0, k = 0;
  INTERVIEW_QUESTIONS.forEach((q, i) => {
    const v = vals[i];
    if (q.type === 'score' && v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) { sum += Number(v); k++; }
  });
  return k ? Math.round(sum / k * 10) / 10 : '';
}
/** Final Affectation from the final department: the department, Not accepted for 7ECHOH, '' for anything else. */
function formAffect_(v) {
  const s = String(v == null ? '' : v).trim();
  return DEPTS.indexOf(s.toUpperCase()) >= 0 ? s.toUpperCase() : normText(s) === '7echoh' ? 'Not accepted' : normDept(s);
}

/** A form fills Rating and Final Affectation of its candidate's sheet row (and the Master row) where the cell is empty, or still
 *  holds what this same form filled last time (prev: {Rating, 'Final Affectation'}). A value someone typed stays. Returns what
 *  the form holds in each cell now ('' where it holds nothing): the next edit's prev. */
function fillFromForm_(ctx, b, code, vals, prev) {
  const out = { Rating: '', 'Final Affectation': '' }, sh = binomeSheet_(ctx, b), row = sh ? findFileRow_(sh, code) : -1;
  if (row < 0) return out;
  const t = x => String(x == null ? '' : x).trim(), r = ctx.ivByCode[code], I = ctx.iv.I;
  const want = { Rating: formRating_(vals), 'Final Affectation': formAffect_(vals[qIndex_(INTERVIEW_FINAL)]) };
  Object.keys(want).forEach(k => {
    const cell = sh.getRange(row, bfCol_(k)), cur = t(cell.getValue()), v = want[k];
    if (cur === t(v)) { out[k] = v; return; }
    const marked = (goldMarks_()[code] || {})[k];
    if (cur && (cur !== t(prev[k]) || marked)) { // typed by a person, or set by an admin (even to what the form filled before): it stays
      if (marked) logIvChange_(ctx, code, 'Form kept ' + k, cur, t(v));
      return;
    }
    cell.setValue(v);
    SpreadsheetApp.flush(); // a refused write throws here, before the Master copies it (see appendToBinomeFile_)
    if (r) r[I[k]] = v;
    out[k] = v;
  });
  return out;
}

/** The Interview Answers tab of a binome sheet (book), made with its header after the main tab when create is set. */
function answersTab_(book, create) {
  const have = book.getSheetByName(IA_TAB);
  if (have || !create) return have;
  const t = book.insertSheet(IA_TAB, book.getSheets().length);
  if (t.getMaxColumns() < IA_H.length) t.insertColumnsAfter(t.getMaxColumns(), IA_H.length - t.getMaxColumns());
  t.getRange(1, 1, 1, IA_H.length).setValues([IA_H]).setFontWeight('bold').setWrap(true);
  [3, 5].forEach(c => t.getRange(2, c, t.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss')); // Submitted At, Edited At
  t.setFrozenRows(1);
  return t;
}
/** code's row in an Interview Answers tab: {row (sheet row), v (its cells)}, or null. */
function answersRow_(tab, code) {
  const n = tab ? tab.getLastRow() : 0;
  if (n < 2) return null;
  const all = tab.getRange(2, 1, n - 1, IA_H.length).getValues();
  for (let i = 0; i < all.length; i++) if (String(all[i][0]).trim() === code) return { row: i + 2, v: all[i] };
  return null;
}
/** A tab row: the six head cells, then the answers; a paragraph keeps a leading apostrophe, so it stays text. */
function answersCells_(head, vals) {
  return head.concat(INTERVIEW_QUESTIONS.map((q, i) => {
    const v = vals[i] === undefined || vals[i] === null ? '' : vals[i];
    return q.type === 'text' && String(v) !== '' ? "'" + v : v;
  }));
}
/** A Google Form response, copied into its candidate's binome tab (read-only there). A code that already has a row keeps it:
 *  the binome's own dashboard answers, or the first form. Under the members' lock: a member's save appends to the same tab,
 *  and two appends at once would land on the same row. */
function copyFormToTab_(ctx, b, code, ts, sub, vals) {
  const sh = binomeSheet_(ctx, b);
  if (!sh || findFileRow_(sh, code) < 0) return;
  withMemberLock_(b, () => {
    const tab = answersTab_(sh.getParent(), true);
    if (answersRow_(tab, code)) return;
    tab.getRange(tab.getLastRow() + 1, 1, 1, IA_H.length).setValues([answersCells_([code, 'Google Form', ts, sub, '', ''], vals)]);
  });
}

/* ---------- the dashboard's forms: Interview Answers tabs → Dashboard Interviews (Master) → the Interview Log ---------- */

const DQ = 2 + INTERVIEW_CODE_TITLES.length; // first question column of Dashboard Interviews; the two codes sit just before it
/** Dashboard Interviews, loaded once per run (made with its header if missing). */
function dashTable_(ctx) {
  if (!ctx.dash) {
    if (!ss_().getSheetByName(TAB.DASH)) ss_().insertSheet(TAB.DASH);
    ctx.dash = loadTable_(TAB.DASH, DASH_H);
  }
  return ctx.dash;
}
const stamp_ = x => (x instanceof Date && !isNaN(x) ? Math.floor(x.getTime() / 1000) : 0); // whole seconds
/** Who saved an answers row last and when (its Edited At / By, else Submitted At / By): the `seen` of a save. With the person, two
 *  partners saving within one second still differ. */
const saveToken_ = (editedAt, editedBy, at, by) => (stamp_(editedAt) || stamp_(at)) + '|' + lc_(stamp_(editedAt) ? editedBy : by);

/** The dashboard's interview forms of binome b (book: its open sheet): a Dashboard row of its tab that is new, or differs from its
 *  Master copy, is copied to Dashboard Interviews and logged like a form response (key DASH|binome|code; an edit redoes its log
 *  row and raises its checks again). Compared by content, so a row changed by hand in the tab is an edit "by hand". Every form
 *  fills Rating and Final Affectation (fillFromForm_). Read for dirty binomes and on the integrity pass, once per run.
 *  rows: the tab's rows 2+ already read (prefetchBinomeFiles_); the book is then opened only to stamp an edit by hand. */
function syncAnswers_(ctx, b, book, rows) {
  ctx.answersRead = ctx.answersRead || {};
  if (ctx.answersRead[b.code]) return;
  ctx.answersRead[b.code] = true;
  let tab = rows ? null : book.getSheetByName(IA_TAB);
  if (!rows) { const n = tab ? tab.getLastRow() : 0; rows = n < 2 ? [] : tab.getRange(2, 1, n - 1, IA_H.length).getValues(); }
  const I = ctx.iv.I, t = x => String(x == null ? '' : x).trim();
  const BIN = DQ - 2, CODE = DQ - 1, c1 = qIndex_(INTERVIEW_BRANCH), fin = qIndex_(INTERVIEW_FINAL);
  rows.forEach((v, k) => {
    const code = t(v[0]), r = ctx.ivByCode[code];
    if (t(v[1]) !== 'Dashboard' || !r || r[I.Binome] !== b.code) return; // a Google Form copy, or a row for someone else
    const d = dashTable_(ctx), D = d.I, vals = v.slice(6, 6 + INTERVIEW_QUESTIONS.length);
    const copy = d.data.filter(x => t(x[CODE]) === code)[0];
    const at = saveToken_(v[4], v[5], v[2], v[3]), was = copy ? saveToken_(copy[D['Edited At']], copy[D['Edited By']], copy[D.Timestamp], copy[D['Email Address']]) : '';
    // closed phase, a locked row changed in the tab and not saved from the dashboard (a hand edit): put back from the Master's copy
    if (copy && ctx.guard && ctx.guard[code] && at === was && !vals.every((x, j) => t(x) === t(copy[DQ + j]).replace(/^'/, ''))) { // the copy keeps a text's apostrophe
      try {
        if (!tab) tab = (ctx.books[b.fileId] = ctx.books[b.fileId] || SpreadsheetApp.openById(b.fileId)).getSheetByName(IA_TAB);
        tab.getRange(k + 2, 1, 1, IA_H.length).setValues([answersCells_([code, 'Dashboard', copy[D.Timestamp], copy[D['Email Address']], copy[D['Edited At']], copy[D['Edited By']]],
          copy.slice(DQ, DQ + INTERVIEW_QUESTIONS.length))]);
        ctx.alerts.add({ severity: 'MEDIUM', type: 'LOCKED_EDIT', code: code, binome: b.code, key: 'LOCKED|' + code + '|form|' + stamp_(ctx.now),
          msg: code + ' (binome ' + b.code + '): the interview form was changed by hand in the Interview Answers tab while the interview phase is closed. Put back. Corrections go through an admin, from the dashboard.' });
      } catch (e) { console.warn('Locked form of ' + code + ' not restored: ' + e); }
      return;
    }
    if (copy && vals.every((x, j) => t(x) === t(copy[DQ + j]))) {
      // same answers: only who saved last, or the binome after a move, catches up
      if (at !== was || t(copy[BIN]) !== b.code) { copy[D['Edited At']] = v[4]; copy[D['Edited By']] = v[5]; copy[BIN] = b.code; }
      return;
    }
    let editedAt = v[4], editedBy = v[5];
    if (copy && at === was) { // changed in the tab, not saved from the dashboard: stamped, so a page holding the old stamp gets CONFLICT
      editedAt = new Date(stamp_(ctx.now) * 1000); editedBy = 'by hand';
      if (!tab) tab = (ctx.books[b.fileId] = ctx.books[b.fileId] || SpreadsheetApp.openById(b.fileId)).getSheetByName(IA_TAB);
      tab.getRange(k + 2, 5, 1, 2).setValues([[editedAt, editedBy]]);
    }
    const out = copy || DASH_H.map(() => ''), key = copy ? t(copy[D['Response Key']]) : 'DASH|' + b.code + '|' + code;
    const prev = copy ? { Rating: copy[D['Filled Rating']], 'Final Affectation': copy[D['Filled Affectation']] } : {};
    out[D.Timestamp] = v[2] instanceof Date ? v[2] : ctx.now; out[D['Email Address']] = lc_(v[3]); out[BIN] = b.code; out[CODE] = code;
    vals.forEach((x, j) => { out[DQ + j] = INTERVIEW_QUESTIONS[j].type === 'text' && t(x) ? "'" + x : x; });
    out[D['Edited At']] = editedAt; out[D['Edited By']] = editedBy; out[D['Response Key']] = key;
    if (!copy) d.data.push(out);
    const got = logInterview_(ctx, { ts: out[D.Timestamp], sub: out[D['Email Address']], typedBinome: b.code, typedIv: code,
      c1: vals[c1], finalDep: vals[fin], key: key, redo: logIndex_(ctx, key), dash: true });
    if (got.b) {
      const f = fillFromForm_(ctx, got.b, code, vals, prev);
      out[D['Filled Rating']] = f.Rating; out[D['Filled Affectation']] = f['Final Affectation'];
    }
  });
}

/** The forms read this run, added to the Interview Log after Interviewees is saved: a run that fails before then reads them again
 *  (if this write fails instead, the next run reads them again and raises DUPLICATE_INTERVIEW: loud, not lost). An edited
 *  dashboard form rewrites its own row. */
function appendLog_(ctx) {
  const t = ctx.log;
  Object.keys(ctx.logRedo || {}).forEach(i => { if (+i < t.originalLength) t.sh.getRange(+i + 2, 1, 1, LOG_H.length).setValues(plainRows_([t.data[i]], LOG_H)); });
  ctx.logRedo = {};
  if (t.data.length <= t.originalLength) return;
  t.sh.getRange(t.originalLength + 2, 1, t.data.length - t.originalLength, LOG_H.length).setValues(t.data.slice(t.originalLength));
  t.originalLength = t.data.length;
}

/** webRun('interviewForms', {code | key}): an admin reads every interview form of one candidate, without opening a sheet: their
 *  Interview Log rows (result, notes, what was typed, who sent it), each with its answers from Dashboard Interviews (a DASH| key)
 *  or Interview Responses; counts marks the form their Interviewees row points at. key (an alert's Interview Log key) alone reaches
 *  a form that matched nobody, and a form of a known candidate brings all of theirs. Read only: no lock, no publish. */
function interviewForms_(args) {
  let code = String(args.code || '').trim();
  const key = String(args.key || '').trim();
  if (!code && !key) throw new Error('Not allowed');
  const iv = loadTable_(TAB.IV, IV_H), log = loadTable_(TAB.LOG, LOG_H), L = log.I, I = iv.I, t = x => String(x == null ? '' : x).trim();
  if (!code) {
    const k = log.data.filter(r => t(r[L['Response Key']]) === key)[0];
    if (!k) throw new Error('That form is not in the Interview Log any more.');
    code = t(k[L.Interviewee]);
  }
  const x = code ? iv.data.filter(r => t(r[I.Code]) === code)[0] : null;
  if (code && !x) throw new Error('Unknown code ' + code);
  const counted = x ? Number(x[I['Interview Log Row']]) : 0;
  const rows = log.data.map((r, i) => ({ r: r, n: i + 2 })).filter(o => (code ? t(o.r[L.Interviewee]) === code : t(o.r[L['Response Key']]) === key));
  const dash = {}, ss = ss_(), dsh = ss.getSheetByName(TAB.DASH), D = idx_(DASH_H);
  if (dsh && dsh.getLastRow() > 1) dsh.getRange(2, 1, dsh.getLastRow() - 1, DASH_H.length).getValues().forEach(r => { dash[t(r[D['Response Key']])] = r; });
  const isDashKey = k => /^DASH\|/.test(k);
  const gf = {}, ish = rows.some(o => !isDashKey(t(o.r[L['Response Key']]))) ? responseSheet_('INT') : null;
  if (ish && ish.getLastRow() > 1) {
    const data = ish.getDataRange().getValues(), H = intHeaders_(data[0]), Qc = questionCols_(data[0]);
    for (let k = 1; k < data.length; k++) {
      const ts = H.ts >= 0 ? data[k][H.ts] : '';
      if (ts) gf[responseKey_(ts, t(H.collected >= 0 ? data[k][H.collected] : '').toLowerCase(), k + 1)] = Qc.map(c => (c >= 0 ? data[k][c] : ''));
    }
  }
  const fmt = d => (d instanceof Date && !isNaN(d) ? fmt_(d, 'dd/MM/yyyy HH:mm') : '');
  const forms = rows.map(o => {
    const lk = t(o.r[L['Response Key']]), isDash = isDashKey(lk), d = isDash ? dash[lk] : null;
    const vals = isDash ? (d ? INTERVIEW_QUESTIONS.map((q, j) => d[DQ + j]) : null) : gf[lk] || null, answers = vals ? {} : null;
    if (vals) INTERVIEW_QUESTIONS.forEach((q, j) => { answers[q.id] = vals[j] instanceof Date ? fmt(vals[j]) : vals[j]; });
    return { key: lk, source: isDash ? 'Dashboard' : 'Google Form', at: fmt(o.r[L['Submitted At']]), by: lc_(o.r[L.Submitter]), result: t(o.r[L.Result]),
      notes: t(o.r[L.Notes]), typedBinome: t(o.r[L['Typed Binome']]), typedInterviewee: t(o.r[L['Typed Interviewee']]), binome: t(o.r[L.Binome]),
      finalDep: t(o.r[L['Final Dep']]), counts: !!counted && o.n === counted, answers: answers, rating: vals ? formRating_(vals) : '',
      editedAt: d ? fmt(d[D['Edited At']]) : '', editedBy: d ? t(d[D['Edited By']]) : '' };
  });
  return { code: code, name: x ? (t(x[I['First Name']]) + ' ' + t(x[I['Family Name']])).trim() : '', binome: x ? t(x[I.Binome]) : '', forms: forms,
    sections: INTERVIEW_SECTIONS, questions: INTERVIEW_QUESTIONS };
}
