/* ---------- quick actions on alerts (dashboard › Alerts) ---------- */
// One entry point, webRun('quick', {op, ids, …}). Each op fixes what an alert points at the way the matching tool would
// (Master, binome sheet and baseline stay in step, emails follow), then resolves the alert. Snooze and Mute put an alert
// aside: its key is not raised again while it is SNOOZED (until a time) or MUTED (for good). Links ('locate') open the
// exact row or cell. 'draft' + 'send' email the binome, the candidate or the form's sender, after an editable preview.

// ops that close their alert when they succeed
const QUICK_RESOLVES = { edit: 1, setCell: 1, exclude: 1, pickCandidate: 1, keepForm: 1, dupNew: 1, dupSeparate: 1, repair: 1, approve: 1, decline: 1 };
// the twelve registration fields an admin can edit (docs/admin-features.md > Edit a candidate's data)
const QUICK_EDITABLE = ['First Name', 'Family Name', 'Email', 'Phone', 'Birth Date', '1st Choice', '2nd Choice', 'Field', 'Year', 'Availability',
  'Facebook', 'Discord'];
// the registration form's own options (VIC-ENP src/apply/questions.ts); a value kept as it is is never refused
const FORM_FIELDS = ['PREPA', 'DATA', 'INDUS', 'AUTO', 'ELN', 'ELT', 'ELT-HV', 'GCHIM', 'GP-ENV', 'HYDRAU', 'GC', 'MTRX', 'MECA', 'GM-AUTO', 'MINIER', 'QHSE'];
const FORM_YEARS = ['1ST', '2ND', '3RD'];
const FORM_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// what checkRegistration can raise on one row: an edit closes the ones it fixed and opens the new ones
const REG_CHECKS = ['MISSING_NAME', 'INVALID_CHOICE', 'BAD_EMAIL', 'EMAIL_MISMATCH', 'EXTERNAL_EMAIL', 'SAME_CHOICES', 'BAD_PHONE', 'BAD_BIRTHDATE'];
const SNOOZE_HOURS = { '4h': 4, '24h': 24, '3d': 72 };
// what "Use the new answers" copies from a second registration onto the earlier one (+ REG_EXTRAS, declared in a later file)
const DUP_COPY = ['First Name', 'Family Name', 'Email', 'Typed Email', 'Phone', 'Facebook', 'Discord', 'Field', 'Year', '1st Choice',
  '2nd Choice', 'Availability', 'Motivation', 'Anything to add'];

/** What an alert's Key points at: {kind: reg | iv | log | integ | member | file | none, …}. */
function alertRef_(r, A) {
  const p = String(r[A.Key] || '').split('|'), rest = n => p.slice(n).join('|');
  if (r[A.Type] === 'FILE_ERROR') return { kind: 'file', binome: String(r[A.Binome]).trim(), row: p[0] === 'REVOKE' ? Number(p[1]) : 0 };
  switch (p[0]) {
    case 'REG': return { kind: 'reg', rk: rest(2) };
    case 'NO_BINOME': return p[1] === 'ALL' ? { kind: 'none' } : { kind: 'reg', rk: rest(1) };
    case 'REVIEW': case 'MEMBER': return { kind: 'reg', rk: rest(1) }; // screening: on hold, a VIC member with a binome
    case 'TIME': return { kind: 'iv', code: rest(2), check: '' };
    case 'ODD': return { kind: 'iv', code: rest(2), check: p[1] };
    case 'INT': return { kind: 'log', lk: rest(2), check: p[1] };
    case 'INTEG': return { kind: 'integ', binome: p[1], check: p[2] || '', subject: rest(3) };
    case 'UNPAIRED': return { kind: 'member', email: rest(1) };
    default: return { kind: 'none' };
  }
}

function ivByRk_(ctx, rk) { const I = ctx.iv.I; return ctx.iv.data.filter(r => String(r[I['Response Key']]) === rk)[0] || null; }
function logIndex_(ctx, lk) { const L = ctx.log.I; return ctx.log.data.findIndex(r => String(r[L['Response Key']]) === lk); }

/** The earlier registration a DUPLICATE row repeats (same rule as checkRegistration). */
function dupOriginal_(ctx, x, self) {
  const I = ctx.iv.I, name = r => normName(r[I['First Name']] + ' ' + r[I['Family Name']]);
  const e = lc_(x[I.Email]), t = lc_(x[I['Typed Email']]), n = name(x), ph = normPhone(x[I.Phone]);
  return ctx.iv.data.filter(o => o !== (self || x) && !isOut_(o[I.Status]) && (
    (e && (e === lc_(o[I.Email]) || e === lc_(o[I['Typed Email']]))) || (t && t === lc_(o[I.Email])) ||
    (n && n === name(o) && ph && ph === normPhone(o[I.Phone]))))[0] || null;
}

/* ---------- what the dashboard needs to show the actions (webState: alerts[].q) ---------- */

function quickLookups_(ctx) {
  const I = ctx.iv.I, L = ctx.log.I, rk = {}, log = {};
  ctx.iv.data.forEach(r => { if (r[I['Response Key']]) rk[String(r[I['Response Key']])] = r; });
  ctx.log.data.forEach((r, i) => { if (r[L['Response Key']]) log[String(r[L['Response Key']])] = i; });
  return { rk: rk, log: log };
}

function regView_(ctx, x) {
  const I = ctx.iv.I, s = h => String(x[I[h]] == null ? '' : x[I[h]]).replace(/^'/, '');
  const birth = parseLooseDate(x[I['Birth Date']]);
  return { code: s('Code'), binome: s('Binome'), status: s('Status'), first: s('First Name'), family: s('Family Name'), email: s('Email'),
    typed: s('Typed Email'), phone: s('Phone'), birth: birth instanceof Date ? fmt_(birth, 'dd/MM/yyyy') : s('Birth Date'),
    c1: s('1st Choice'), c2: s('2nd Choice'), field: s('Field'), year: s('Year'), availability: s('Availability'),
    registered: fmt_(x[I['Registered At']], 'dd/MM/yyyy HH:mm') };
}

/** The answers an admin reads to decide on a held application, with its screening score and reasons. */
function appView_(ctx, x) {
  const I = ctx.iv.I, s = h => String(x[I[h]] == null ? '' : x[I[h]]);
  return { whyVic: s('Why VIC'), motivation: s('Motivation'), deptQuestions: s('Department Questions'), anything: s('Anything to add'),
    clubs: s('Other Clubs'), risk: x[I.Risk] === '' ? null : Number(x[I.Risk]), screening: s('Screening') };
}

function formView_(ctx, i) {
  const L = ctx.log.I, r = ctx.log.data[i], sub = lc_(r[L.Submitter]);
  const own = activeOrPaused_(ctx).filter(b => b.members.some(m => m.email === sub))[0];
  return { row: i + 2, at: fmt_(r[L['Submitted At']], 'dd/MM/yyyy HH:mm'), submitter: sub, submitterName: ctx.nameByEmail[sub] || '',
    typedBinome: String(r[L['Typed Binome']]), typedIv: String(r[L['Typed Interviewee']]), binome: String(r[L.Binome]),
    interviewee: String(r[L.Interviewee]), result: String(r[L.Result]), finalDep: String(r[L['Final Dep']]), subBinome: own ? own.code : '' };
}

/** The automatic repair of an INTEGRITY alert ('' = only a link helps). */
function integRepair_(ref, msg) {
  switch (ref.check) {
    case 'title': return 'rename';
    case 'layout': return /was put in front of/.test(msg) ? 'reorder' : '';
    case 'protect': return 'protect';
    case 'twice': return 'dedupe';
    case 'extra': case 'unknown': return 'remove';
    case 'missing': return 'putback';
    case 'noedit': return 'reshare';
    case 'stranger': return 'unshare';
    default: return '';
  }
}
/** A FILE_ERROR the script can try again ('' = something only a person can do). */
// a removal, a carried-over access or a cover's share is not something the generic retry redoes: by hand, then Mark resolved
const fileRepair_ = msg => (/not written|not sent|could not remove|sharing not updated|access not carried over|^Cover in /.test(msg) ? '' : 'retry');

function quickInfo_(ctx, r, look) {
  const A = ctx.alerts.table.I, I = ctx.iv.I, ref = alertRef_(r, A), type = String(r[A.Type]);
  if (ref.kind === 'reg') {
    const x = look.rk[ref.rk];
    if (!x) return null;
    const q = { kind: 'reg', iv: regView_(ctx, x) };
    if (type === 'DUPLICATE_REGISTRATION') { const o = dupOriginal_(ctx, x); if (o) q.old = regView_(ctx, o); }
    if (type === 'NEEDS_REVIEW' || type === 'VIC_MEMBER') q.app = appView_(ctx, x);
    return q;
  }
  if (ref.kind === 'iv') {
    const x = ctx.ivByCode[ref.code];
    if (!x) return null;
    const at = x[I['Interview At']], reg = x[I['Registered At']], dated = at instanceof Date;
    return { kind: 'iv', check: ref.check, code: ref.code, contacted: String(x[I.Contacted]), date: dated ? fmt_(at, 'yyyy-MM-dd') : '',
      time: dated ? fmt_(at, 'HH:mm') : '', regYear: fmt_(reg instanceof Date ? reg : ctx.now, 'yyyy'), ahead: dated && at > ctx.now,
      atMs: dated ? at.getTime() : 0, // atMs: a pending "Until the interview" snooze fixes its end from it at the click
      // the binome sheet's own text (the sync copies it): a pending Fix is judged against it, not the parsed Interview At
      dateText: String(x[I['Interview Date']]).trim(), timeText: String(x[I['Interview Time']]).trim() };
  }
  if (ref.kind === 'log') {
    const i = look.log[ref.lk];
    if (i === undefined) return null;
    const q = { kind: 'log', check: ref.check, form: formView_(ctx, i) };
    if (type === 'DUPLICATE_INTERVIEW') {
      const x = ctx.ivByCode[q.form.interviewee], fi = x ? Number(x[I['Interview Log Row']]) - 2 : -1;
      if (fi >= 0 && fi !== i && ctx.log.data[fi]) q.first = formView_(ctx, fi);
    }
    return q;
  }
  if (ref.kind === 'integ') return { kind: 'integ', check: ref.check, subject: ref.subject, repair: integRepair_(ref, String(r[A.Message])) };
  if (ref.kind === 'member') return { kind: 'member', email: ref.email };
  if (ref.kind === 'file') return { kind: 'file', repair: fileRepair_(String(r[A.Message])) };
  return null;
}

/** Snoozed and muted alerts, for the dashboard's Muted filter (newest first). */
function heldAlerts_(ctx) {
  const A = ctx.alerts.table.I;
  return ctx.alerts.table.data.filter(r => HELD_STATUSES.indexOf(r[A.Status]) >= 0).reverse().map(r => ({
    id: String(r[A.ID]), created: fmt_(r[A.Created], 'dd/MM HH:mm'), severity: r[A.Severity], type: r[A.Type], code: String(r[A.Interviewee]),
    binome: String(r[A.Binome]), msg: String(r[A.Message]), status: r[A.Status], until: r[A.Status] === 'SNOOZED' ? fmt_(r[A['Resolved At']], 'dd/MM HH:mm') : '' }));
}

/* ---------- the entry point ---------- */

/** a: {ids, …op arguments, dryRun}. Returns {lines, done (ids acted on)} or, for locate / draft, their result. */
function quickCore_(op, a) {
  a = a || {};
  const ids = [].concat(a.ids || []).map(id => String(id).trim()).filter(Boolean);
  if (!ids.length) throw new Error('No alert given.');
  if (op === 'locate') return { url: locateAlert_(ids[0], String(a.target || '')) };
  if (op === 'draft') return mailDrafts_(loadCtx_(), ids, a.to);
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const A = ctx.alerts.table.I, lines = [], done = [];
    const rows = ids.map(id => ctx.alerts.table.data.filter(r => String(r[A.ID]) === id)[0]);
    if (op === 'send') {
      lines.push(sendMails_(ctx, rows.filter(r => r && r[A.Status] === 'OPEN'), a.to, a.drafts));
    } else {
      rows.forEach((r, k) => {
        const id = ids[k], held = r && HELD_STATUSES.indexOf(r[A.Status]) >= 0;
        if (!r || (op === 'unmute' ? !held : r[A.Status] !== 'OPEN')) return lines.push(id + ': ' + (op === 'unmute' ? 'not snoozed or muted' : 'no longer open') + ' (refresh the page).');
        try {
          const msg = quickOne_(ctx, op, r, a);
          // an edit closes a registration-check alert only if recheckRow_ found the problem gone
          if (!a.dryRun && QUICK_RESOLVES[op] && !(op === 'edit' && REG_CHECKS.indexOf(String(r[A.Type])) >= 0)) ctx.alerts.resolveWhere(x => x === r, 'RESOLVED');
          lines.push(id + ': ' + msg);
          done.push(id);
        } catch (e) { lines.push(id + ': ' + e.message); }
      });
    }
    if (a.dryRun) return { lines: lines, done: done };
    stampConfirmations_(ctx); // an approved application's confirmation
    saveTable_(ctx.iv);
    commitBase_(ctx);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx); sendConfirmations_(ctx);
    buildTracker_(ctx);
    return { lines: lines, done: done };
  }, 60000);
  if (!res) { busy_(); return null; }
  const text = (ids.length === 1 ? res.lines.map(l => l.replace(/^A-\d+: /, '')) : res.lines).join('\n');
  if (!res.done.length && op !== 'send') throw new Error(text); // nothing done: the page shows it as a failure
  if (!a.dryRun) say_(text.charAt(0).toUpperCase() + text.slice(1));
  return res;
}

function quickOne_(ctx, op, r, a) {
  const A = ctx.alerts.table.I, ref = alertRef_(r, A);
  if (r[A.Type] === 'MANUAL_EDIT' && op !== 'unmute') throw new Error('use Apply / Revert / Accept for a manual edit.');
  switch (op) {
    case 'snooze': return snooze_(ctx, r, ref, String(a.for || ''));
    case 'mute': ctx.alerts.setStatus(r, 'MUTED', ctx.now); return 'muted: it will not be raised again.';
    case 'unmute': ctx.alerts.setStatus(r, 'OPEN'); return 'back with the open alerts.';
    case 'edit': return editRow_(ctx, regRow_(ctx, ref), a.values || {}).text;
    case 'setCell': return setCell_(ctx, ivRow_(ctx, ref), a);
    case 'exclude': return exclude_(ctx, ref);
    case 'pickCandidate': return pickCandidate_(ctx, ref, a.code);
    case 'keepForm': return keepForm_(ctx, ref, a.which);
    case 'dupNew': return dupNew_(ctx, regRow_(ctx, ref));
    case 'dupSeparate': return dupSeparate_(ctx, regRow_(ctx, ref));
    case 'repair': return repair_(ctx, r, ref, !!a.dryRun);
    case 'approve': case 'decline':
      if (['NEEDS_REVIEW', 'VIC_MEMBER'].indexOf(r[A.Type]) < 0) throw new Error('only an application on hold or a VIC member can be ' + op + 'd here.');
      if (op === 'approve' && r[A.Type] !== 'NEEDS_REVIEW') throw new Error('a VIC member is declined or kept, not approved.');
      return reviewRow_(ctx, regRow_(ctx, ref), op, r[A.Type] === 'VIC_MEMBER');
    default: throw new Error('unknown quick action "' + op + '".');
  }
}

function regRow_(ctx, ref) {
  if (ref.kind !== 'reg') throw new Error('this alert has no registration to fix.');
  const x = ivByRk_(ctx, ref.rk);
  if (!x) throw new Error('their row is no longer in the Interviewees tab.');
  return x;
}
function ivRow_(ctx, ref) {
  const x = ref.kind === 'iv' && ctx.ivByCode[ref.code];
  if (!x) throw new Error('this alert has no interviewee to fix.');
  return x;
}
function logRow_(ctx, ref) {
  const i = ref.kind === 'log' ? logIndex_(ctx, ref.lk) : -1;
  if (i < 0) throw new Error('its Interview Log row is not there any more.');
  return i;
}
const ivLabel_ = (ctx, x) => String(x[ctx.iv.I.Code]).trim() || (x[ctx.iv.I['First Name']] + ' ' + x[ctx.iv.I['Family Name']]).trim();
const shown_ = v => (v instanceof Date ? fmt_(v, 'dd/MM/yyyy') : '"' + String(v == null ? '' : v).replace(/^'/, '') + '"');

/* ---------- snooze ---------- */

function snooze_(ctx, r, ref, dur) {
  let until;
  if (dur === 'interview') {
    const x = ref.kind === 'iv' && ctx.ivByCode[ref.code], at = x && x[ctx.iv.I['Interview At']];
    if (!(at instanceof Date) || at <= ctx.now) throw new Error('there is no interview date ahead to snooze until.');
    until = at;
  } else if (SNOOZE_HOURS[dur]) until = new Date(ctx.now.getTime() + SNOOZE_HOURS[dur] * 3.6e6);
  else throw new Error('unknown snooze length "' + dur + '".');
  ctx.alerts.setStatus(r, 'SNOOZED', until);
  return 'snoozed until ' + fmt_(until, 'dd/MM HH:mm') + '.';
}

/* ---------- registration values ---------- */

/** Rewrite a candidate's row in their binome sheet from the Master, keeping what the binome typed. ' and in …' or a note.
 *  The Master keeps the change either way (the caller saves it): a sheet that refuses it raises an alert naming what (the change
 *  in words), never a failure of the action. */
function refreshFileRow_(ctx, x, what) {
  const I = ctx.iv.I, b = ctx.binByCode[x[I.Binome]];
  try {
    const sh = b && binomeSheet_(ctx, b);
    if (!sh) return '';
    const row = findFileRow_(sh, String(x[I.Code]).trim());
    if (row < 0) return ' (they have no row in the sheet of ' + b.code + ')';
    const rng = sh.getRange(row, BF_COL, 1, BF_H.length);
    rng.setValues(plainRows_([ivToFileRow_(ctx, x, fileCarry_(rng.getValues()[0], rng.getDisplayValues()[0], idx_(BF_H)))], BF_H));
    return ', also in the sheet of ' + b.code;
  } catch (e) {
    ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', code: String(x[I.Code]), binome: b.code, key: '',
      msg: ivLabel_(ctx, x) + ': ' + what + ' saved in the Master but not written into the sheet of ' + b.code + ' (' + e.message + '). Type it there by hand.' });
    return ', but not written into the sheet of ' + b.code + ' (an alert says so)';
  }
}

const plainVal_ = v => (v instanceof Date ? fmt_(v, 'dd/MM/yyyy') : String(v == null ? '' : v).replace(/^'/, '').trim());

/** One field's new value, checked like the registration form accepts it; null = the same as now (kept, never refused). */
function editValue_(f, raw, cur) {
  const s = String(raw == null ? '' : raw).trim();
  const pick = list => { const o = list.filter(x => x.toLowerCase() === s.toLowerCase())[0]; if (!o) throw new Error(f + ' must be one of ' + list.join(', ') + '.'); return o; };
  if (f === 'First Name' || f === 'Family Name') { if (s === plainVal_(cur)) return null; if (!hasLetter(s)) throw new Error(f + ' needs letters.'); return s; }
  if (f === 'Email') {
    if (s.toLowerCase() === plainVal_(cur).toLowerCase()) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error('"' + s + '" is not an email address.');
    return s.toLowerCase();
  }
  if (f === 'Phone') {
    const p = normPhone(s);
    if (p === normPhone(cur)) return null;
    if (!/^0[5-7]\d{8}$/.test(p) && !/^0[2-4]\d{7}$/.test(p)) throw new Error('"' + s + '" is not an Algerian phone number.');
    return p;
  }
  if (f === 'Birth Date') {
    const d = parseLooseDate(s);
    if (!d) throw new Error('"' + s + '" is not a date (dd/mm/yyyy).');
    return plainVal_(d) === plainVal_(cur) ? null : d;
  }
  if (f === '1st Choice' || f === '2nd Choice') {
    if (s === plainVal_(cur)) return null;
    if (DEPTS.indexOf(s) < 0) throw new Error(f + ' must be IT, COMM, FLER or HR.');
    return s;
  }
  if (f === 'Field') return s === plainVal_(cur) ? null : pick(FORM_FIELDS);
  if (f === 'Year') return s === plainVal_(cur) ? null : pick(FORM_YEARS);
  if (f === 'Availability') {
    if (s === plainVal_(cur)) return null;
    const days = s ? s.split(/\s*,\s*/).map(d => FORM_DAYS.filter(x => x.toLowerCase() === d.toLowerCase())[0]) : [];
    if (days.some(d => !d)) throw new Error('Availability must be days of the week (' + FORM_DAYS.join(', ') + '), or blank.');
    return days.join(', ');
  }
  return s === plainVal_(cur) ? null : s; // Facebook, Discord: free text, may be blank
}

/** The registration check again on one row: closes the alerts the edit fixed, opens the new problems (REG_CHECKS only;
 *  a duplicate is the sync's call). Keeps the Flags column in step. Returns {closed: [type], opened: [msg]}. */
function recheckRow_(ctx, x) {
  const I = ctx.iv.I, A = ctx.alerts.table.I, rk = String(x[I['Response Key']]), out = { closed: [], opened: [] };
  if (!rk) return out;
  const c1raw = String(x[I['1st Choice']]).trim(), collected = String(x[I.Email]).trim().toLowerCase();
  const chk = checkRegistration({ ts: x[I['Registered At']], collected: collected, typedEmail: String(x[I['Typed Email']]).trim(),
    first: String(x[I['First Name']]).trim(), family: String(x[I['Family Name']]).trim(), birth: x[I['Birth Date']], phone: x[I.Phone],
    c1: normDept(c1raw), c1raw: c1raw, c2: normDept(x[I['2nd Choice']]) }, [], S_().EMAIL_DOMAIN);
  const now = {}, had = String(x[I.Flags]).split(',').map(f => f.trim());
  chk.alerts.forEach(a => { if (REG_CHECKS.indexOf(a.type) >= 0) now[a.type] = a; });
  REG_CHECKS.forEach(t => {
    const key = 'REG|' + t + '|' + rk;
    if (now[t]) {
      // only what the row did not already have: a problem an admin closed with Mark resolved stays closed
      if (had.indexOf(t) < 0 && ctx.alerts.add({ severity: now[t].severity, type: t, code: ivLabel_(ctx, x), binome: x[I.Binome], msg: now[t].msg, key: key, notifyBinome: false })) out.opened.push(now[t].msg);
    } else if (ctx.alerts.table.data.some(r => String(r[A.Key]) === key && (r[A.Status] === 'OPEN' || r[A.Status] === 'SNOOZED'))) {
      ctx.alerts.resolveWhere(r => String(r[A.Key]) === key, 'RESOLVED');
      out.closed.push(t.toLowerCase().replace(/_/g, ' '));
    }
  });
  const flags = String(x[I.Flags]).split(',').map(f => f.trim()).filter(f => f && REG_CHECKS.indexOf(f) < 0);
  const at = flags.findIndex(f => /^CONFIRMED/.test(f));
  x[I.Flags] = (at < 0 ? flags.concat(Object.keys(now)) : flags.slice(0, at).concat(Object.keys(now), flags.slice(at))).join(', ');
  return out;
}

/** values: {field: text} for QUICK_EDITABLE fields, checked like the registration form accepts them. A direct write: the Master,
 *  the binome sheet row and (by the caller's commit) the baseline stay in step; the registration check runs again; one
 *  Interviewee Changes row per changed field. Returns {text, move}: move = {code, binome, dep} when their binome does not
 *  take the new 1st choice (nothing moves without a second click). */
function editRow_(ctx, x, values) {
  const I = ctx.iv.I, rk = String(x[I['Response Key']]), label = ivLabel_(ctx, x);
  if (isOut_(x[I.Status])) throw new Error(label + ' is ' + String(x[I.Status]).toLowerCase() + ': restore it first.');
  const v = {};
  Object.keys(values).filter(f => QUICK_EDITABLE.indexOf(f) >= 0).forEach(f => { const n = editValue_(f, values[f], x[I[f]]); if (n !== null) v[f] = n; });
  const keys = Object.keys(v);
  if (!keys.length) throw new Error('nothing to change.');
  if (keys.some(f => EDIT_GROUPS.iv.Person.indexOf(f) >= 0) && ctx.alerts.openKeys[editKey_('iv', 'Person', rk)]) {
    throw new Error('their name / email also has an open manual edit: Apply or Accept it first.');
  }
  if (keys.some(f => ['First Name', 'Family Name', 'Email', 'Phone'].indexOf(f) >= 0)) {
    const c = x.slice(); keys.forEach(f => { c[I[f]] = v[f]; });
    const o = dupOriginal_(ctx, c, x);
    if (o) throw new Error('that email or name + phone already belongs to ' + ivLabel_(ctx, o) + ' (' + String(o[I.Email]) + '): use the duplicate tools.');
  }
  const was = {};
  keys.forEach(f => { was[f] = x[I[f]]; });
  const what = keys.map(f => f + ' ' + shown_(was[f]) + ' → ' + shown_(v[f])).join(', ');
  keys.forEach(f => { x[I[f]] = v[f]; });
  if (v.Email) x[I['Typed Email']] = v.Email; // the form's own typed copy follows, or the old one would raise the mismatch again
  let where = '', move = null;
  const dep = v['1st Choice'];
  if (dep && !x[I.Binome] && x[I.Status] === ST.UNASSIGNED) { // not on hold, not out
    // a candidate the routing could not place: the right department lets it place them now
    where = assignRow_(ctx, x) ? '; assigned to ' + x[I.Binome] + ' as ' + x[I.Code]
      : '; still waiting for a binome (' + (bool_(S_().ASSIGNMENTS_OPEN) ? 'no ACTIVE binome takes ' + dep : 'assignments are closed') + ')';
    indexCtx_(ctx);
  } else {
    where = refreshFileRow_(ctx, x, what);
    const b = dep && x[I.Binome] ? ctx.binByCode[x[I.Binome]] : null;
    if (b && tagDepts(b.tag).indexOf(dep) < 0) {
      move = { code: String(x[I.Code]).trim(), binome: b.code, dep: dep };
      where += '. ' + b.code + ' does not take ' + dep + ': use Move interviewee to give them a binome that does';
    }
  }
  const re = recheckRow_(ctx, x);
  const checks = (re.closed.length ? '. Closed: ' + re.closed.join(', ') : '') + (re.opened.length ? '. New: ' + re.opened.join(' ') : '');
  keys.forEach(f => logIvChange_(ctx, String(x[I.Code]).trim() || label, 'Edited ' + f, plainVal_(was[f]), plainVal_(v[f])));
  return { text: label + ': ' + what + where + checks + '.', move: move };
}

/** The twelve editable values of one candidate as the Edit form shows them (read only, no lock), with the form's options. */
function candidateGet_(code) {
  code = String(code || '').trim();
  const t = loadTable_(TAB.IV, IV_H), I = t.I, x = t.data.filter(r => String(r[I.Code]).trim() === code)[0];
  if (!x) throw new Error('Unknown code ' + code);
  const values = {};
  QUICK_EDITABLE.forEach(f => { values[f] = f === 'Birth Date' ? (parseLooseDate(x[I[f]]) ? fmt_(parseLooseDate(x[I[f]]), 'dd/MM/yyyy') : plainVal_(x[I[f]])) : plainVal_(x[I[f]]); });
  return { code: code, name: (x[I['First Name']] + ' ' + x[I['Family Name']]).trim(), status: String(x[I.Status]), binome: String(x[I.Binome]),
    values: values, fields: FORM_FIELDS, years: FORM_YEARS, days: FORM_DAYS };
}

/** webRun('editCandidate', {code, values}): the Edit button, an inline cell, the command palette. A direct write, never a pending change. */
function editCandidateCore_(code, values) {
  code = String(code || '').trim();
  const out = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    const x = ctx.ivByCode[code];
    if (!x) throw new Error('Unknown code ' + code);
    const r = editRow_(ctx, x, values || {});
    stampConfirmations_(ctx);
    saveTable_(ctx.iv);
    commitBase_(ctx);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx); sendConfirmations_(ctx);
    buildTracker_(ctx);
    return r;
  }, 60000);
  if (!out) { busy_(); return null; }
  say_(out.text.charAt(0).toUpperCase() + out.text.slice(1));
  return out;
}

/** Contacted, or the interview date + time, written in the binome sheet (the binome's own cells) and the Master. */
function setCell_(ctx, x, a) {
  const I = ctx.iv.I, code = String(x[I.Code]).trim(), b = ctx.binByCode[x[I.Binome]], sh = b && binomeSheet_(ctx, b);
  const row = sh ? findFileRow_(sh, code) : -1;
  if (row < 0) throw new Error(code + ' has no row in a binome sheet to write to.');
  const out = [];
  if (a.contacted !== undefined) {
    const c = String(a.contacted).trim();
    if (CONTACT_OPTIONS.indexOf(c) < 0) throw new Error('Contacted must be one of ' + CONTACT_OPTIONS.join(', ') + '.');
    sh.getRange(row, bfCol_('Contacted')).setValue(c);
    x[I.Contacted] = c;
    if (c !== 'Not yet' && !x[I['Contacted Seen At']]) x[I['Contacted Seen At']] = ctx.now;
    out.push('Contacted "' + c + '"');
  }
  if (a.date !== undefined) {
    const d = String(a.date).match(/^(\d{4})-(\d{2})-(\d{2})$/), t = String(a.time || '').match(/^([01]\d|2[0-3]):[0-5]\d$/);
    if (!d || !t) throw new Error('give the date as yyyy-mm-dd and the time as HH:mm.');
    const dStr = d[3] + '/' + d[2] + '/' + d[1], at = buildInterviewAt(dStr, t[0], tzOffset_());
    if (!(at instanceof Date) || fmt_(at, 'dd/MM/yyyy') !== dStr) throw new Error(dStr + ' is not a real date.');
    sh.getRange(row, bfCol_('Interview Date'), 1, 2).setValues([[dStr, t[0]]]); // typed like a person would: the sheet reads its locale
    x[I['Interview Date']] = dStr; x[I['Interview Time']] = t[0]; x[I['Interview At']] = at;
    out.push('interview on ' + dStr + ' at ' + t[0]);
  }
  if (!out.length) throw new Error('nothing to change.');
  x[I.Status] = statusOf_(ctx, x);
  return code + ': ' + out.join(', ') + ', written in the sheet of ' + b.code + '.';
}

function exclude_(ctx, ref) {
  if (ref.kind !== 'member') throw new Error('this alert is not about a team member.');
  const T = ctx.team.I, i = ctx.team.data.findIndex(r => lc_(r[T.Email]) === ref.email);
  if (i < 0) throw new Error(ref.email + ' is no longer in the Team tab.');
  ctx.team.data[i][T.Exclude] = true;
  ctx.team.sh.getRange(i + 2, T.Exclude + 1).setValue(true);
  return (String(ctx.team.data[i][T['Full Name']]).trim() || ref.email) + ' excluded in the Team tab: no binome is expected for them.';
}

/* ---------- duplicates ---------- */

function dupNew_(ctx, x) {
  const I = ctx.iv.I;
  if (x[I.Status] !== ST.DUPLICATE) throw new Error('this registration is no longer marked as a duplicate.');
  const o = dupOriginal_(ctx, x);
  if (!o) throw new Error('the earlier registration is not in the Interviewees tab any more.');
  if (ctx.alerts.openKeys[editKey_('iv', 'Person', String(o[I['Response Key']]))]) throw new Error(ivLabel_(ctx, o) + ' has an open manual edit of their name / email: Apply or Accept it first.');
  const changed = DUP_COPY.concat(REG_EXTRAS).filter(f => !sameVal_(o[I[f]], x[I[f]]) && String(o[I[f]]) !== String(x[I[f]]));
  if (!changed.length) return ivLabel_(ctx, o) + ': the new answers are the same as the earlier ones, nothing to copy.';
  changed.forEach(f => { o[I[f]] = x[I[f]]; });
  const moved = changed.indexOf('1st Choice') >= 0 && o[I.Binome] ? '. Their 1st choice is now ' + o[I['1st Choice']] + ': move them if ' + o[I.Binome] + ' does not take it' : '';
  return ivLabel_(ctx, o) + ': ' + changed.join(', ') + ' taken from the new registration' + refreshFileRow_(ctx, o, changed.join(', ') + ' from the new registration') + moved + '.';
}

function dupSeparate_(ctx, x) {
  const I = ctx.iv.I;
  if (x[I.Status] !== ST.DUPLICATE) throw new Error('this registration is no longer marked as a duplicate.');
  x[I.Status] = ST.UNASSIGNED;
  const placed = assignRow_(ctx, x);
  indexCtx_(ctx);
  return (x[I['First Name']] + ' ' + x[I['Family Name']]).trim() + ' is now a candidate of their own' + (x[I.Code] ? ' (' + x[I.Code] + ')' : '') +
    (placed ? ', assigned to ' + x[I.Binome] : ', waiting for a binome') + '.';
}

/* ---------- interview forms ---------- */

function writeLogRow_(ctx, i) { ctx.log.sh.getRange(i + 2, 1, 1, LOG_H.length).setValues([ctx.log.data[i]]); }
function noteLog_(ctx, i, result, note) {
  const L = ctx.log.I, r = ctx.log.data[i];
  if (result) r[L.Result] = result;
  r[L.Notes] = (String(r[L.Notes]).trim() ? r[L.Notes] + ' | ' : '') + note + ' (' + Session.getActiveUser().getEmail() + ')';
  writeLogRow_(ctx, i);
}

/** UNKNOWN_INTERVIEWEE: point the form at the right candidate; it counts as their interview unless they already had one. */
function pickCandidate_(ctx, ref, codeText) {
  const i = logRow_(ctx, ref), L = ctx.log.I, I = ctx.iv.I, row = ctx.log.data[i];
  const code = String(codeText || '').trim().toUpperCase(), x = ctx.ivByCode[code];
  if (!x || isOut_(x[I.Status])) throw new Error('unknown interviewee code "' + code + '".');
  row[L.Interviewee] = code; row[L.Binome] = x[I.Binome];
  noteLog_(ctx, i, 'OK', 'interviewee set to ' + code + ' by an admin');
  if (x[I['Interview Submitted At']]) return 'form linked to ' + code + ', who already had a form (Interview Log row ' + x[I['Interview Log Row']] + '): that first one still counts.';
  x[I['Interview Submitted At']] = row[L['Submitted At']]; x[I['Interview Log Row']] = i + 2; x[I.Status] = ST.INTERVIEWED;
  const b = ctx.binByCode[x[I.Binome]];
  return 'form linked to ' + code + ', now interviewed' + (b ? markOrAlert_(ctx, b, code, '✅ ' + fmt_(row[L['Submitted At']], 'dd/MM HH:mm') + ' (linked by an admin)') : '') + '.';
}

/** The interview mark in b's sheet after the Master already changed: a sheet that refuses it raises the alert whose Repair writes
 *  it again (as logInterview_), never a failure of the action. '' or the note to add to the reply. */
function markOrAlert_(ctx, b, code, text) {
  try { markInterviewInFile_(ctx, b, code, text); return ''; } catch (e) {
    ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', code: code, binome: b.code, key: 'FILE|' + b.code + '|' + code,
      msg: 'Cannot mark ' + code + ' in the file of ' + b.code + ': ' + e.message });
    return '; the mark in the sheet of ' + b.code + ' failed (an alert lets you retry it)';
  }
}

/** DUPLICATE_INTERVIEW: which of the two forms counts. The other Interview Log row is marked IGNORED. */
function keepForm_(ctx, ref, which) {
  const i = logRow_(ctx, ref), L = ctx.log.I, I = ctx.iv.I, second = ctx.log.data[i];
  const x = ctx.ivByCode[String(second[L.Interviewee]).trim()];
  if (!x) throw new Error('the form names no known interviewee.');
  const code = String(x[I.Code]).trim(), fi = Number(x[I['Interview Log Row']]) - 2;
  if (!ctx.log.data[fi] || fi === i) throw new Error('the first form of ' + code + ' is not in the Interview Log any more.');
  if (which === 'first') {
    noteLog_(ctx, i, 'IGNORED', 'second form of ' + code + ', the first one (row ' + (fi + 2) + ') counts');
    return 'the first form (row ' + (fi + 2) + ') counts; row ' + (i + 2) + ' is marked IGNORED.';
  }
  if (which !== 'latest') throw new Error('choose the first or the latest form.');
  noteLog_(ctx, fi, 'IGNORED', 'replaced by the later form in row ' + (i + 2));
  x[I['Interview Submitted At']] = second[L['Submitted At']]; x[I['Interview Log Row']] = i + 2;
  const b = ctx.binByCode[x[I.Binome]];
  return 'the latest form (row ' + (i + 2) + ') counts; row ' + (fi + 2) + ' is marked IGNORED' +
    (b ? markOrAlert_(ctx, b, code, '✅ ' + fmt_(second[L['Submitted At']], 'dd/MM HH:mm') + ' (latest form)') : '') + '.';
}

/* ---------- binome sheets and files ---------- */

function repair_(ctx, r, ref, dry) {
  const A = ctx.alerts.table.I;
  if (ref.kind === 'file') return retryFile_(ctx, r, ref, dry);
  if (ref.kind !== 'integ') throw new Error('nothing to repair automatically here.');
  const b = ctx.binByCode[ref.binome], kind = integRepair_(ref, String(r[A.Message]));
  if (!kind) throw new Error('no automatic repair for this one: open the sheet.');
  if (!b || !b.fileId) throw new Error(ref.binome + ' has no binome sheet any more.');
  const book = () => ctx.books[b.fileId] || (ctx.books[b.fileId] = SpreadsheetApp.openById(b.fileId));
  switch (kind) {
    case 'rename': {
      const t = binomeFileTitle_(b, b.members);
      if (dry) return 'rename the sheet of ' + b.code + ' to "' + t + '".';
      book().rename(t);
      return 'the sheet of ' + b.code + ' is titled "' + t + '" again.';
    }
    case 'reorder': {
      const real = book().getSheets().slice(1).filter(x => bfLayout_(x) === 'v2')[0];
      if (!real) throw new Error('the binome tab is not in the sheet any more: open it.');
      if (dry) return 'move the tab "' + real.getName() + '" of ' + b.code + ' back to the first place.';
      book().setActiveSheet(real);
      book().moveActiveSheet(1);
      delete ctx.files[b.fileId];
      return '"' + real.getName() + '" is the first tab of ' + b.code + ' again.';
    }
    case 'protect':
      if (dry) return 'protect the sheet of ' + b.code + ' again (the gold columns stay editable).';
      protectBinomeSheet_(binomeSheet_(ctx, b));
      return 'the sheet of ' + b.code + ' is protected again; the gold columns stay editable.';
    case 'dedupe': case 'remove': return dropRows_(ctx, b, ref.subject, kind, dry);
    case 'putback': {
      const codes = String(r[A.Interviewee]).split(/[,\s]+/).filter(Boolean);
      if (dry) return 'put ' + codes.join(', ') + ' back in the sheet of ' + b.code + '.';
      const errs = [], ok = [];
      codes.forEach(c => { try { ok.push(moveInterviewee_(ctx, c, b.code)); } catch (e) { errs.push(e.message); } });
      if (errs.length) throw new Error((ok.length ? ok.join('; ') + '; but ' : '') + errs.join('; '));
      return ok.join('; ') + '.';
    }
    case 'reshare': return shareMembers_(ctx, b, dry);
    case 'unshare':
      if (dry) return 'take edit access to the sheet of ' + b.code + ' away from ' + ref.subject + '.';
      try { DriveApp.getFileById(b.fileId).removeEditor(ref.subject); } catch (e) { throw new Error('Drive refused: ' + driveErr_(e)); }
      return ref.subject + ' can no longer edit the sheet of ' + b.code + '.';
  }
  throw new Error('unknown repair ' + kind);
}

/** 'dedupe': keep the row of the code with the most binome input, delete the others. 'remove': delete every row of it. */
function dropRows_(ctx, b, code, kind, dry) {
  const I = ctx.iv.I;
  if (kind === 'remove' && ctx.ivByCode[code] && ctx.ivByCode[code][I.Binome] === b.code) throw new Error(code + ' belongs to ' + b.code + ' now: nothing to remove.');
  const sh = binomeSheet_(ctx, b), F = idx_(BF_H);
  return withMemberLock_(b, () => {
    const n = bfLastRow_(sh), vals = n >= 2 ? sh.getRange(2, BF_COL, n - 1, BF_H.length).getDisplayValues() : [];
    const rows = [];
    vals.forEach((v, k) => { if (String(v[F.Code]).trim() === code) rows.push({ row: k + 2, v: v }); });
    if (!rows.length) throw new Error(code + ' is not in the sheet of ' + b.code + ' any more.');
    const typed = v => BF_EDITABLE.filter(h => (h === 'Interview Done' ? String(v[F[h]]).toUpperCase() === 'TRUE' : String(v[F[h]]).trim() && v[F[h]] !== 'Not yet'));
    const desc = x => 'row ' + x.row + ' (' + (typed(x.v).map(h => (BF_LABEL[h] || h) + ' ' + x.v[F[h]]).join(', ') || 'nothing typed by the binome') + ')';
    let drop = rows;
    if (kind === 'dedupe') {
      if (rows.length < 2) throw new Error(code + ' is listed only once now.');
      const keep = rows.reduce((best, x) => (typed(x.v).length > typed(best.v).length ? x : best), rows[0]);
      drop = rows.filter(x => x !== keep);
      if (dry) return code + ' in ' + b.code + ': keep ' + desc(keep) + ', delete ' + drop.map(desc).join('; ') + '.';
    } else if (dry) return 'delete ' + code + ' from the sheet of ' + b.code + ': ' + drop.map(desc).join('; ') + '.';
    drop.slice().reverse().forEach(x => sh.deleteRow(x.row));
    return code + ': ' + drop.map(x => 'row ' + x.row).join(', ') + ' deleted from the sheet of ' + b.code + '.';
  });
}

/** Make every member of the binome an editor of its sheet (as Re-share does for all of them). */
function shareMembers_(ctx, b, dry) {
  const s = S_();
  if (!bool_(s.SHARE_FILES_WITH_BINOME) || bool_(s.TEST_MODE)) throw new Error('sharing is off (' + (bool_(s.TEST_MODE) ? 'test mode' : 'Settings') + '), so nothing is shared.');
  let f, eds;
  try { f = DriveApp.getFileById(b.fileId); eds = f.getEditors().map(u => lc_(u.getEmail())); } catch (e) { throw new Error('cannot read the sharing of ' + b.code + ': ' + driveErr_(e)); }
  const missing = b.members.filter(m => m.email && eds.indexOf(m.email) < 0);
  if (dry) return missing.length ? 'share the sheet of ' + b.code + ' with ' + missing.map(m => m.email).join(', ') + '.' : 'nothing to share.';
  missing.forEach(m => { try { f.addEditor(m.email); } catch (e) { throw new Error('could not share with ' + m.email + ': ' + driveErr_(e)); } });
  return missing.length ? 'the sheet of ' + b.code + ' is shared with ' + missing.map(m => m.email).join(', ') + '.' : 'every member of ' + b.code + ' can already edit its sheet.';
}

/** FILE_ERROR: do again what failed (open the sheet, its title and banner, sharing; a cover's access; a lost row). */
function retryFile_(ctx, r, ref, dry) {
  const A = ctx.alerts.table.I, msg = String(r[A.Message]);
  if (!fileRepair_(msg)) throw new Error('nothing the script can retry: do it by hand, then Mark resolved.');
  if (ref.row) {
    const C = idx_(MC_H), c = loadChanges_()[ref.row - 2];
    if (!c || String(c[C.Status]) !== COVER_REVOKING) return 'that cover is already closed.';
    if (dry) return 'remove the view access of ' + c[C['In Email']] + ' again.';
    const err = revokeCoverAccess_(ctx, { row: ref.row, binome: String(c[C.Binome]).trim(), email: lc_(c[C['In Email']]) });
    if (err) throw new Error('Drive still refuses: ' + err);
    changesSheet_().getRange(ref.row, C.Status + 1).setValue('ENDED ' + fmt_(ctx.now, 'dd/MM HH:mm') + ': view access removed');
    return 'the view access of ' + c[C['In Email']] + ' is removed.';
  }
  const b = ctx.binByCode[ref.binome], code = String(r[A.Interviewee]).trim();
  if (!b) throw new Error('this alert names no binome: fix it by hand.');
  if (code && /missing from both binome sheets/.test(msg)) {
    if (dry) return 'put ' + code + ' back in the sheet of ' + b.code + '.';
    return moveInterviewee_(ctx, code, b.code) + '.';
  }
  if (code && /^Cannot mark/.test(msg)) { // the form was logged: write its mark again
    const at = (ctx.ivByCode[code] || {})[ctx.iv.I['Interview Submitted At']];
    if (!(at instanceof Date)) throw new Error(code + ' has no interview form logged: fix it by hand.');
    if (dry) return 'mark ' + code + ' as interviewed in the sheet of ' + b.code + ' again.';
    markInterviewInFile_(ctx, b, code, '✅ ' + fmt_(at, 'dd/MM HH:mm') + ' (retried)');
    return code + ' is marked in the sheet of ' + b.code + '.';
  }
  if (!b.fileId) throw new Error(b.code + ' has no File ID: set it in the Binomes tab.');
  const share = bool_(S_().SHARE_FILES_WITH_BINOME) && !bool_(S_().TEST_MODE);
  if (dry) return 'open the sheet of ' + b.code + ' again and update its title and banner' + (share ? ', and share it with its members' : '') + '.';
  let sh;
  try { sh = binomeSheet_(ctx, b); } catch (e) { throw new Error('still cannot open the sheet of ' + b.code + ': ' + e.message); }
  ctx.books[b.fileId].rename(binomeFileTitle_(b, b.members));
  setBinomeBanner_(sh, b, b.members);
  return 'the sheet of ' + b.code + ' opens, its title and banner are up to date' + (share ? '; ' + shareMembers_(ctx, b, false) : '.');
}

/* ---------- emails: draft (preview) then send ---------- */

/** Alerts grouped by who gets the email. to: 'binome' (its members) | 'candidate' | 'submitter' (who sent the interview form). */
function mailGroups_(ctx, rows, to) {
  const A = ctx.alerts.table.I, I = ctx.iv.I, L = ctx.log.I, groups = {}, order = [];
  const ok = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  rows.forEach(r => {
    const ref = alertRef_(r, A);
    let g = null;
    if (to === 'binome') {
      const b = ctx.binByCode[String(r[A.Binome]).trim()], emails = b ? b.members.map(m => m.email).filter(ok) : [];
      if (emails.length) g = { id: b.code, b: b, emails: emails, label: b.code + ' (' + b.members.map(m => m.name || m.email).join(' & ') + ')' };
    } else if (to === 'candidate') {
      const x = ref.kind === 'reg' && ivByRk_(ctx, ref.rk), e = x ? lc_(x[I.Email]) : '';
      if (ok(e)) g = { id: ref.rk, x: x, emails: [e], label: ivLabel_(ctx, x) + ' (' + e + ')' };
    } else if (to === 'submitter') {
      const i = ref.kind === 'log' ? logIndex_(ctx, ref.lk) : -1, e = i >= 0 ? lc_(ctx.log.data[i][L.Submitter]) : '';
      if (ok(e)) g = { id: ref.lk, row: ctx.log.data[i], emails: [e], label: (ctx.nameByEmail[e] || e) + ' (' + e + ')' };
    } else throw new Error('unknown recipient "' + to + '".');
    if (!g) return;
    if (!groups[g.id]) { g.alerts = []; groups[g.id] = g; order.push(g.id); }
    groups[g.id].alerts.push(r);
  });
  return order.map(k => groups[k]);
}

const MAIL_SIGN = '\n\nThanks!\nThe VIC recruitment team';
const CANDIDATE_PROBLEM = { BAD_PHONE: v => 'your phone number ("' + v.phone + '") does not look valid',
  BAD_EMAIL: v => 'the email address you typed ("' + v.typed + '") does not look valid',
  BAD_BIRTHDATE: v => 'your birth date ("' + v.birth + '") looks wrong', MISSING_NAME: () => 'your first or family name is missing' };

/** Default subject and text of one email (plain text: the admin edits it in the preview). */
function mailText_(ctx, g, to) {
  const A = ctx.alerts.table.I, first = s => String(s || '').trim().split(/\s+/)[0];
  if (to === 'binome') {
    const n = g.alerts.length;
    return { subject: '[VIC Recruitment] ' + (n === 1 ? 'A candidate needs' : n + ' candidates need') + ' your attention (' + g.b.code + ')',
      body: 'Hi ' + g.b.members.map(m => first(m.name) || m.email).join(' & ') + ',\n\nSomething needs your attention in your binome sheet:\n\n' +
        g.alerts.map(r => '• ' + String(r[A.Message]).replace(/\s*\(binome [^)]*\)\s*$/, '')).join('\n') +
        '\n\nPlease keep Contacted, Interview Day and Time up to date' + (g.b.fileUrl ? ': ' + g.b.fileUrl : ' in your binome sheet.') + MAIL_SIGN };
  }
  if (to === 'candidate') {
    const v = regView_(ctx, g.x);
    return { subject: '[VIC Recruitment] Please check your registration',
      body: 'Hi ' + (first(v.first) || 'there') + ',\n\nThank you for applying to VIC! While reading your registration we noticed:\n\n' +
        g.alerts.map(r => '• ' + (CANDIDATE_PROBLEM[r[A.Type]] ? CANDIDATE_PROBLEM[r[A.Type]](v) : r[A.Message])).join('\n') +
        '\n\nCould you reply to this email with the right information?' + MAIL_SIGN };
  }
  const L = ctx.log.I, e = lc_(g.row[L.Submitter]);
  let form = '';
  try { form = FormApp.openById(CONFIG.INTERVIEW_FORM_ID).getPublishedUrl(); } catch (err) { /* no link then */ }
  return { subject: '[VIC Recruitment] Please send your interview form again',
    body: 'Hi ' + (first(ctx.nameByEmail[e]) || 'there') + ',\n\nThe interview form you sent on ' + fmt_(g.row[L['Submitted At']], 'dd/MM HH:mm') +
      ' names the interviewee "' + g.row[L['Typed Interviewee']] + '", which matches no registered candidate, so it could not be counted.' +
      '\n\nPlease send the form again with the code from the "Their Code" column of your binome sheet' + (form ? ': ' + form : '.') + MAIL_SIGN };
}

function mailDrafts_(ctx, ids, to) {
  const A = ctx.alerts.table.I;
  const rows = ctx.alerts.table.data.filter(r => ids.indexOf(String(r[A.ID])) >= 0 && r[A.Status] === 'OPEN');
  const gs = mailGroups_(ctx, rows, to);
  if (!gs.length) throw new Error('Nobody to email for ' + (ids.length === 1 ? 'this alert' : 'these alerts') + '.');
  return { testMode: bool_(S_().TEST_MODE), drafts: gs.map(g => Object.assign({ group: g.id, to: g.label, ids: g.alerts.map(r => String(r[A.ID])) }, mailText_(ctx, g, to))) };
}

/** drafts: [{group, subject, body}] as edited in the preview. Recipients are worked out again here, never taken from the page. */
function sendMails_(ctx, rows, to, drafts) {
  const A = ctx.alerts.table.I, by = {};
  (drafts || []).forEach(d => { by[String(d.group)] = { subject: String(d.subject || '').trim(), body: String(d.body || '').trim() }; });
  const gs = mailGroups_(ctx, rows, to).filter(g => by[g.id]);
  if (!gs.length) throw new Error('Nothing to send: the alerts are closed or have nobody to email.');
  if (gs.some(g => !by[g.id].subject || !by[g.id].body)) throw new Error('Every email needs a subject and a text.');
  gs.forEach(g => {
    // the edited plain text, wrapped in the template; candidate footer (no internal links): some go to candidates
    const d = by[g.id], html = mailHtml_({ title: d.subject.replace(/^\[VIC Recruitment\]\s*/, ''), blocks: [mailP_(d.body)] });
    g.emails.forEach(e => mail_(e, d.subject, html, to === 'candidate' ? MAIL.candidateFrom : undefined));
    g.alerts.forEach(r => {
      const had = String(r[A['Emailed To']] || '').split(/,\s*/).filter(Boolean);
      r[A['Emailed To']] = had.concat(g.emails.filter(e => had.indexOf(e) < 0)).join(', ');
    });
  });
  ctx.alerts.touch();
  return 'Email sent to ' + gs.map(g => g.label).join('; ') + (bool_(S_().TEST_MODE) ? '. Test mode: only admins really receive it.' : '.');
}

/* ---------- links to the exact row or cell ---------- */

function a1_(row, col) {
  let s = '';
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s + row;
}

// the binome-sheet column an alert is about
const CELL_FOR = { NOT_CONTACTED: 'Contacted', NO_DATE: 'Interview Date', BAD_DATE: 'Interview Date', OVERDUE: 'Interview Form', ODD_VALUE: 'Interview Date' };

/** target: form (Registration Responses) | iv (Interviewees) | log (Interview Log) | team | binomes (File ID) | cell (binome sheet). */
function locateAlert_(id, target) {
  const ctx = loadCtx_(), A = ctx.alerts.table.I, I = ctx.iv.I, ss = ss_();
  const r = ctx.alerts.table.data.filter(x => String(x[A.ID]) === id)[0];
  if (!r) throw new Error(id + ' not found (refresh the page).');
  const ref = alertRef_(r, A), type = String(r[A.Type]);
  const at = (sh, row, col) => ss.getUrl() + '#gid=' + sh.getSheetId() + '&range=' + a1_(row, col);
  if (target === 'form' && ref.kind === 'reg') {
    const sh = responseSheet_('REG'), data = sh.getDataRange().getValues(), H = regHeaders_(data[0]), get = (row, i) => (i >= 0 ? row[i] : '');
    for (let k = 1; k < data.length; k++) {
      const ts = get(data[k], H.ts), email = String(get(data[k], H.collected)).trim().toLowerCase() || String(get(data[k], H.typed)).trim();
      if (ts && (responseKey_(ts, email, k + 1) === ref.rk || serialKey_(ts, email) === ref.rk)) return at(sh, k + 1, 1); // serial: imported before keyTime_
    }
    throw new Error('their answer is not in Registration Responses any more.');
  }
  if (target === 'form' && ref.kind === 'log') {
    // a dashboard form (key DASH|…) has its row in Dashboard Interviews, a Google Form one in Interview Responses
    const dash = /^DASH\|/.test(ref.lk), sh = dash ? ss.getSheetByName(TAB.DASH) : responseSheet_('INT');
    const data = sh && sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [], H = data.length ? intHeaders_(data[0]) : null;
    const kc = DASH_H.indexOf('Response Key'), get = (row, i) => (i >= 0 ? row[i] : '');
    for (let k = 1; k < data.length; k++) {
      const ts = get(data[k], H.ts);
      if (dash ? String(data[k][kc]) === ref.lk : ts && responseKey_(ts, String(get(data[k], H.collected)).trim().toLowerCase(), k + 1) === ref.lk) return at(sh, k + 1, 1);
    }
    throw new Error('the form is not in ' + (dash ? TAB.DASH : TAB.INT_RESP) + ' any more.');
  }
  if (target === 'iv') {
    const x = ref.kind === 'reg' ? ivByRk_(ctx, ref.rk) : ctx.ivByCode[ref.kind === 'iv' ? ref.code : String(r[A.Interviewee]).trim()];
    if (x) return at(ctx.iv.sh, ctx.iv.data.indexOf(x) + 2, 1);
  }
  if (target === 'log') {
    const i = ref.kind === 'log' ? logIndex_(ctx, ref.lk) : -1;
    if (i >= 0) return at(ctx.log.sh, i + 2, 1);
  }
  if (target === 'team' && ref.kind === 'member') {
    const T = ctx.team.I, i = ctx.team.data.findIndex(x => lc_(x[T.Email]) === ref.email);
    if (i >= 0) return at(ctx.team.sh, i + 2, 1);
  }
  const code = ref.kind === 'integ' ? ref.binome : String(r[A.Binome]).trim(), b = ctx.binByCode[code];
  if (target === 'binomes' && b) return at(ctx.bin.sh, ctx.bin.data.indexOf(b.row) + 2, ctx.bin.I['File ID'] + 1);
  if (target === 'cell') {
    const who = ref.kind === 'iv' ? ref.code : ref.kind === 'integ' ? ref.subject : '';
    const bb = ref.kind === 'iv' ? ctx.binByCode[ctx.ivByCode[who] ? ctx.ivByCode[who][I.Binome] : ''] : b;
    if (!bb || !bb.fileId) throw new Error('no binome sheet for this alert.');
    const book = SpreadsheetApp.openById(bb.fileId), sh = book.getSheets()[0], row = who ? findFileRow_(sh, who) : -1;
    const col = ref.check === 'CONTACT' ? 'Contacted' : ref.kind === 'iv' ? CELL_FOR[type] || 'Code' : ref.check === 'cols' ? 'First Name' : 'Code';
    return book.getUrl() + '#gid=' + sh.getSheetId() + (row > 0 ? '&range=' + a1_(row, bfCol_(col)) : '');
  }
  throw new Error('there is no such place for this alert.');
}
