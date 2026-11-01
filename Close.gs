/* ---------- closing the interview phase (docs/admin-features.md › Closing the interview phase) ---------- */

const CLOSE_KEY = 'INTERVIEW_CLOSE'; // script property {at (ms), by}: set while the phase is closed; Reset clears it
const LOCKED_FIELDS = ['Rating', 'Final Affectation'];
const CLOSE_MSG = 'The interview phase is closed: this interview form, Rating and Final Affectation are locked. Ask an admin to correct them.';

function closeState_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(CLOSE_KEY) || 'null'); } catch (e) { return null; } }
const interviewClosed_ = () => !!closeState_();

/** The reminder date (Settings, Algiers time) as a Date, or null when blank. Throws on text that is not a date. */
function parseCloseDate_(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/), d = m && new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + (m[4] || '23') + ':' + (m[5] || '59') + ':00' + tzOffset_());
  if (!d || isNaN(d) || +m[2] > 12 || +m[3] > 31 || +(m[4] || 0) > 23 || +(m[5] || 0) > 59) throw new Error('INTERVIEW_CLOSE_DATE must be YYYY-MM-DD or YYYY-MM-DD HH:mm, or empty.');
  return d;
}
function closeDate_() { try { return parseCloseDate_(S_().INTERVIEW_CLOSE_DATE); } catch (e) { return null; } }

/** What pages show: {on, at, by, date (ms or null)}. A closed phase shows its date as a past reminder only. date: a member's, from
 *  their slice: their call must not open the Master, Google fails it even when the refusal is caught (live, 1 Nov 2026). */
function closeInfo_(date) {
  const c = closeState_(), d = date === undefined ? closeDate_() : date;
  return { on: !!c, at: c ? c.at : null, by: c ? c.by : '', date: d ? +d : null };
}

/** Is this candidate's form on file? The Interview Form mark in the row, or (an unsynced dashboard form has no mark yet) a row
 *  of the Interview Answers tab. Only asked while closed. */
function formOnFile_(book, sh, row, code) {
  return !!String(sh.getRange(row, bfCol_('Interview Form')).getValue()).trim() || !!answersRow_(book.getSheetByName(IA_TAB), code);
}

/** Rating / Final Affectation of this row refused while closed with a form on file: the reason, or ''. */
function closeLock_(book, sh, row, code, field) {
  return LOCKED_FIELDS.indexOf(field) >= 0 && interviewClosed_() && formOnFile_(book, sh, row, code) ? CLOSE_MSG : '';
}

/** Counts for the close dialog, from the Master: forms that will lock, Interview Done ticked without a form (named), not interviewed yet. */
function closePreview_(ctx) {
  const I = ctx.iv.I, out = { forms: 0, doneNoForm: [], notInterviewed: 0 };
  ctx.iv.data.forEach(r => {
    if (!r[I.Code] || !r[I.Binome] || isOut_(r[I.Status])) return;
    if (r[I['Interview Submitted At']]) out.forms++;
    else if (r[I['Interview Done']] === true) out.doneNoForm.push(String(r[I.Code]));
    else if (PENDING_STATUSES.indexOf(r[I.Status]) >= 0) out.notInterviewed++;
  });
  return out;
}

/** The sync's view of what is locked: {codes: those with a form on file when it started, bins: binome code -> its sheet was last read after
 *  the close, at}. A sheet is guarded only from then on, so a form logged or an edit typed before the close is copied once as usual. */
function closeGuard_(ctx) {
  const c = closeState_();
  if (!c) return null;
  const I = ctx.iv.I, codes = {};
  ctx.iv.data.forEach(r => { if (r[I.Code] && r[I.Binome] && r[I['Interview Submitted At']]) codes[String(r[I.Code])] = true; });
  return { codes: codes, bins: {}, at: c.at };
}
/** Is this candidate's row of binome b guarded in this sync? */
const guarded_ = (ctx, b, code) => !!(ctx.guard && ctx.guard.codes[code] && ctx.guard.bins[b.code]);

/** A locked row's Rating / Final Affectation read from the sheet differ from the Master's copy: write the Master's back with a note, one
 *  LOCKED_EDIT alert. Returns true when the row was restored (the Master keeps its values). v: the sheet row's cells, row: its sheet row. */
function restoreLocked_(ctx, b, r, v, row) {
  const I = ctx.iv.I, F = idx_(BF_H), code = String(r[I.Code]), sh = binomeSheet_(ctx, b);
  let hit = false;
  LOCKED_FIELDS.forEach(k => {
    const typed = goldText_(k, v[F[k]]), kept = goldText_(k, r[I[k]]);
    if (typed === kept) return;
    hit = true;
    const cell = sh.getRange(row, bfCol_(k));
    cell.setValue(r[I[k]] === undefined ? '' : r[I[k]]);
    cell.setNote('The interview phase is closed: ' + k + ' is locked. Ask an admin to change it from the dashboard.');
    ctx.alerts.add({ severity: 'MEDIUM', type: 'LOCKED_EDIT', code: code, binome: b.code, key: 'LOCKED|' + code + '|' + k + '|' + typed,
      msg: code + ' (binome ' + b.code + '): "' + typed + '" was typed in ' + k + ' of the sheet while the interview phase is closed. Put back to "' + kept +
        '". Corrections go through an admin, from the dashboard.' });
  });
  return hit;
}

/** The sync: CLOSE_DUE when the reminder date has passed and the phase is still open; it clears once someone closes or moves the date. */
function closeAlerts_(ctx) {
  const d = closeDate_(), KI = ctx.alerts.table.I, key = d && !interviewClosed_() && ctx.now >= d ? 'CLOSE_DUE|' + (+d) : '';
  if (key) ctx.alerts.add({ severity: 'HIGH', type: 'CLOSE_DUE', code: '', binome: '', key: key,
    msg: 'The date to close the interview phase (' + fmt_(d, 'dd/MM/yyyy HH:mm') + ') has passed. Close it from Maintenance when the interviews are done.' });
  ctx.alerts.resolveWhere(r => r[KI.Type] === 'CLOSE_DUE' && r[KI.Key] !== key);
}

/** The members of every ACTIVE or PAUSED binome, mailed one template once each. Never fails the close. */
function closeMails_(ctx, id) {
  activeOrPaused_(ctx).forEach(b => b.members.forEach(m => {
    if (!m.email) return;
    try { mailSend_(m.email, mailFrom_(id, { first: (m.name || '').split(' ')[0], binome: b.code }, { cta: mailDashboardCta_(), footer: mailTeamFooter_(b.fileUrl) }), b.code); }
    catch (e) { console.warn('Mail to ' + m.email + ' not sent: ' + e.message); }
  }));
}

/** Members' pages reload at their next poll: new locked state. */
function bumpBinomes_() {
  const bins = binMeta_();
  Object.keys(bins).forEach(k => { bins[k].v++; });
  PropertiesService.getScriptProperties().setProperty('SNAP_BIN', JSON.stringify(bins));
}

/** webRun('interviewClose', {op: 'preview' | 'close' | 'reopen', reason?, date?}). Preview is a read. Close needs nothing else. Reopen
 *  needs a reason; date (YYYY-MM-DD[ HH:mm] or '') is the reminder's new value, and a reminder already passed is cleared when none is given.
 *  Direct writes under the script lock; one Member Changes row; the mails go to both members of every active or paused binome.
 *  Returns {on, preview} or {on, at}. */
function interviewCloseCore_(a, args) {
  const op = String(args.op || ''), by = a.email;
  if (['preview', 'close', 'reopen'].indexOf(op) < 0) throw new Error('Not a change this entry knows.');
  const reason = String(args.reason || '').trim();
  if (op === 'reopen' && !reason) throw new Error('A reopen needs a reason.');
  let date;
  if (op === 'reopen' && args.date !== undefined && args.date !== null) { date = String(args.date).trim(); parseCloseDate_(date); }
  const out = withLock_(() => {
    const ctx = loadCtx_(), now = closeState_();
    if (op === 'preview') return { on: !!now, preview: closePreview_(ctx) };
    if (op === 'close' ? !!now : !now) return { on: !!now, at: now ? now.at : null }; // a retry or a second click: already so
    const props = PropertiesService.getScriptProperties();
    if (op === 'close') props.setProperty(CLOSE_KEY, JSON.stringify({ at: ctx.now.getTime(), by: by }));
    else props.deleteProperty(CLOSE_KEY);
    const passed = closeDate_(), keep = date === undefined && passed && passed <= ctx.now ? '' : date; // a date that has passed would raise CLOSE_DUE at once
    if (keep !== undefined && op === 'reopen') saveSettings_({ INTERVIEW_CLOSE_DATE: keep });
    try { changesSheet_().appendRow([ctx.now, by, 'PHASE', '', op === 'close' ? 'OPEN' : 'CLOSED', '', op === 'close' ? 'CLOSED' : 'OPEN', '', '', reason, 'DONE'].map(plain_)); }
    catch (e) { console.warn('Member Changes not written: ' + e.message); } // a failed history write never undoes the change
    ctx.alerts.resolveWhere(r => r[ctx.alerts.table.I.Type] === 'CLOSE_DUE');
    ctx.alerts.flush();
    bumpBinomes_();
    closeMails_(ctx, op === 'close' ? 'INTERVIEW_CLOSED' : 'INTERVIEW_REOPENED');
    return { on: op === 'close', at: op === 'close' ? ctx.now.getTime() : null };
  }, 20000);
  if (!out) busy_();
  if (op !== 'preview') say_(op === 'close' ? 'The interview phase is closed. Members were told.' : 'The interview phase is open again. Members were told.');
  return out;
}
