/******************************************************************************
 * VIC RECRUITMENT 2026 — automation for the Master sheet
 * -----------------------------------------------------------------------------
 * Paste this whole file into  Extensions → Apps Script  (replace Code.gs),
 * save, then run the function `setup` once (▶ Run) and accept the permissions.
 * After that, everything is driven from the "VIC Recruitment" menu + triggers.
 ******************************************************************************/

// IDs of the files created in Drive › Recruitment › VIC Recruitment 2026
const CONFIG = {
  REGISTRATION_FORM_ID: '11dfunyOymN1vsoIlcDuw-kENHYLI2qMWaSLbzQpHHy4',
  INTERVIEW_FORM_ID:    '1fhesZ_Xa4eUhrtlDsm4-tnt2MI7iZWy_QIiKzjmM8NM',
  BINOME_FOLDER_ID:     '18xTMFZLrRhBrbKbABD-eY0kaP4diYWzb',
  TEAM_DB_DEFAULT_ID:   '10FILUcr8WXOWvHnZQdTJemcejO7ppdMyWX1pm1eiaF0', // RECRUITMENT 2025 DATABASE
};

// Editable in the "Settings" tab (the values below are only the defaults)
const SETTINGS_DEFAULTS = [
  ['ADMIN_EMAIL', '', 'Who receives alerts + the daily digest (comma-separate several emails)'],
  ['TIMEZONE', 'Africa/Algiers', 'Timezone used for every date/time'],
  ['HOURS_NOT_CONTACTED', 24, 'Alert if an interviewee is still "Not yet" contacted this many hours after registering'],
  ['HOURS_NO_INTERVIEW_DATE', 48, 'Alert if no interview date is set this many hours after registering'],
  ['HOURS_AFTER_INTERVIEW_NO_FORM', 12, 'Alert if the interview form is still missing this many hours after the interview time'],
  ['INSTANT_EMAIL_MIN_SEVERITY', 'MEDIUM', 'HIGH, MEDIUM or INFO: alerts at/above this level are emailed instantly'],
  ['NOTIFY_BINOME_ON_ALERT', true, 'Also email the binome for big mistakes and delays that concern them'],
  ['NOTIFY_BINOME_ON_NEW_INTERVIEWEE', true, 'Email the binome each time a new interviewee is assigned to them'],
  ['SHARE_FILES_WITH_BINOME', true, 'Share each binome file with its two members as editors'],
  ['ASSIGNMENTS_OPEN', true, 'FALSE = stop assigning new registrants (they stay UNASSIGNED until TRUE again)'],
  ['BALANCE_BY', 'ACTIVE', 'ACTIVE = give to the binome with fewest pending interviewees; TOTAL = fewest ever assigned'],
  ['ALL_BINOME_WEIGHT', 1, 'Load multiplier for board (ALL) binomes, e.g. 1.5 means they receive fewer interviewees'],
  ['EMAIL_DOMAIN', 'g.enp.edu.dz', 'Expected email domain of registrants'],
  ['TRUSTED_BACKUPS', '', 'Emails (comma-separated) of people who often replace interviewers, e.g. the HR head: their backup interviews are logged as INFO instead of emailed'],
  ['SYNC_EVERY_MINUTES', 15, '1, 5, 10, 15 or 30: how often the binome files are read (re-run setup after changing)'],
  ['DIGEST_HOUR', 8, 'Hour (0-23) of the daily digest email (re-run setup after changing)'],
];

const TAB = {
  SETTINGS: 'Settings', TEAM: 'Team', BINOMES: 'Binomes', IV: 'Interviewees',
  LOG: 'Interview Log', TRACKER: 'Tracker', ALERTS: 'Alerts',
  REG_RESP: 'Registration Responses', INT_RESP: 'Interview Responses',
};

const TEAM_H = ['Full Name', 'Email', 'Department', 'Pair As', 'Exclude', 'Notes'];
const BIN_H = ['Binome', 'Member 1', 'Email 1', 'Member 2', 'Email 2', 'Tag', 'Status', 'File', 'File ID', 'Created'];
const IV_H = ['Code', 'Binome', 'Status', 'Registered At', 'Assigned At', 'First Name', 'Family Name', 'Email', 'Typed Email',
  'Phone', 'Facebook', 'Discord', 'Field', 'Year', '1st Choice', '2nd Choice', 'Availability', 'Motivation',
  'Anything to add', 'Contacted', 'Contacted Seen At', 'Interview Date', 'Interview Time', 'Interview At',
  'Interview Submitted At', 'Interview Log Row', 'Binome Notes', 'Flags', 'Response Key'];
const LOG_H = ['Submitted At', 'Submitter', 'Typed Binome', 'Typed Interviewee', 'Binome', 'Interviewee',
  'Result', 'Notes', 'Final Dep', 'Response Key'];
const ALERT_H = ['ID', 'Created', 'Severity', 'Type', 'Interviewee', 'Binome', 'Message', 'Emailed To',
  'Status', 'Resolved At', 'Key'];
// Columns of every binome file
const BF_H = ['Code', 'First Name', 'Family Name', 'Email', 'Phone', 'Facebook', 'Discord', 'Field', 'Year',
  '1st Choice', '2nd Choice', 'Availability', 'Why this department', 'Anything to add', 'Registered',
  'Contacted', 'Interview Date', 'Interview Time', 'Interview Form', 'Notes'];
const BF_EDITABLE = ['Contacted', 'Interview Date', 'Interview Time', 'Notes'];
const CONTACT_OPTIONS = ['Not yet', 'Yes', 'No answer', 'Withdrew'];

const ST = { ASSIGNED: 'ASSIGNED', CONTACTED: 'CONTACTED', SCHEDULED: 'SCHEDULED', INTERVIEWED: 'INTERVIEWED',
  WITHDRAWN: 'WITHDRAWN', UNASSIGNED: 'UNASSIGNED', DUPLICATE: 'DUPLICATE' };
const PENDING_STATUSES = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED];
const SEV_RANK = { INFO: 1, MEDIUM: 2, HIGH: 3 };
// Alert types that close themselves once the problem disappears
const AUTO_RESOLVING = ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'NO_BINOME'];

const DEPTS = ['IT', 'COMM', 'FLER', 'HR'];
const DEPT_ALIASES = { it: 'IT', info: 'IT', comm: 'COMM', com: 'COMM', communication: 'COMM',
  hr: 'HR', rh: 'HR', fler: 'FLER', flr: 'FLER', fller: 'FLER' };
const NAME_STOP = { and: 1, et: 1, the: 1, binome: 1, code: 1, with: 1, avec: 1, les: 1, des: 1 };

/* =============================================================================
 * PURE LOGIC (no Google services — unit-testable)
 * ===========================================================================*/

function normText(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pad2(n) { const s = String(parseInt(n, 10)); return s.length < 2 ? '0' + s : s; }

function normDept(s) {
  const words = normText(s).split(' ');
  for (let i = 0; i < words.length; i++) if (DEPT_ALIASES[words[i]]) return DEPT_ALIASES[words[i]];
  return '';
}

/** Departments a binome can receive, from its tag ("IT & HR", "ALL", "HR"...). */
function tagDepts(tag) {
  const t = normText(tag);
  if (/\ball\b/.test(t)) return DEPTS.slice();
  const out = [];
  t.split(' ').forEach(w => { const d = DEPT_ALIASES[w]; if (d && out.indexOf(d) < 0) out.push(d); });
  return out;
}

function codeNum(code) { const m = String(code).match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : NaN; }
function codeDept(code) { return String(code).split('.')[0]; }

/** "B5", "b.05", "B 5", "binome 5", "5" -> {code:'B.05', exact:false}. */
function parseBinomeCode(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let m = s.match(/^(?:b(?:in[oô]me)?)?[\s.\-_#:°]*0*(\d{1,3})$/i);
  if (!m) m = s.match(/\bb[\s.\-_#:°]*0*(\d{1,3})\b/i);
  if (!m) return null;
  const code = 'B.' + pad2(m[1]);
  return { code: code, exact: s === code };
}

/** "it58", "IT 58", "It-058", "RH.3" -> {dep, num, code:'IT.58'}; "58" -> {dep:'', num:58}. */
function parseIntervieweeCode(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const re = /([A-Za-z]{2,13})[\s.\-_#:,°]*0*(\d{1,4})\b/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const dep = DEPT_ALIASES[m[1].toLowerCase()];
    if (dep) {
      const code = dep + '.' + pad2(m[2]);
      return { dep: dep, num: parseInt(m[2], 10), code: code, exact: s === code };
    }
  }
  const d = s.match(/^\D{0,3}?0*(\d{1,4})\D{0,3}$/);
  if (d) return { dep: '', num: parseInt(d[1], 10), code: '', exact: false };
  return null;
}

function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = [], cur = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function nameTokens(s) {
  return normText(s).split(' ').filter(t => t.length >= 3 && !NAME_STOP[t] && !/^\d+$/.test(t));
}

/** How well a typed text matches a full name: {hits, score = hits / typed tokens}. */
function scoreName(typed, fullName) {
  const tt = nameTokens(typed), nt = nameTokens(fullName);
  if (!tt.length || !nt.length) return { hits: 0, score: 0 };
  let hits = 0;
  tt.forEach(t => {
    if (nt.some(n => n === t || (t.length >= 5 && n.length >= 5 && levenshtein(n, t) <= 1))) hits++;
  });
  return { hits: hits, score: hits / tt.length };
}

/** Best unique item whose name matches the typed text (null if ambiguous/weak). */
function bestNameMatch(typed, items, getName, minHits) {
  if (!nameTokens(typed).length) return null;
  let best = null, bestScore = -1, tie = false;
  items.forEach(it => {
    const r = scoreName(typed, getName(it));
    if (r.hits < minHits || r.score < 0.5) return;
    const sc = r.hits + r.score;
    if (sc > bestScore) { best = it; bestScore = sc; tie = false; }
    else if (sc === bestScore) tie = true;
  });
  return tie ? null : best;
}

/**
 * Validate / auto-correct one interview-form answer.
 * input: {submitter, typedBinome, typedInterviewee, typedFirstChoice}
 * ctx:   {binomes:[{code,tag,members:[{name,email}]}],
 *         interviewees:[{code,binome,name,firstChoice}], interviewed:{code:true}, nameByEmail:{}}
 * returns {binome, interviewee, result: OK|AUTOCORRECTED|FLAGGED, notes[], alerts[{severity,type,msg,binome,notifyBinome}]}
 */
function resolveInterview(input, ctx) {
  const out = { binome: '', interviewee: '', result: 'OK', notes: [], alerts: [] };
  const sub = String(input.submitter || '').trim().toLowerCase();
  const subName = (ctx.nameByEmail && ctx.nameByEmail[sub]) || sub || 'unknown submitter';
  const byCode = {}; ctx.binomes.forEach(b => { byCode[b.code] = b; });
  const ivByCode = {}; ctx.interviewees.forEach(i => { if (i.code) ivByCode[i.code] = i; });
  // exact email, or a personal email that clearly carries the member's first + last name (e.g. sabrinaaknine89@gmail.com)
  const memberVia = (b, email) => {
    if (!b || !email) return '';
    if (b.members.some(m => m.email && m.email.toLowerCase() === email)) return 'exact';
    const m = b.members.filter(x => emailNameHits(email, x.name) >= 2)[0];
    return m ? 'personal email of ' + m.name : '';
  };
  let looseNoted = false;
  const isMember = (b, email) => {
    const v = memberVia(b, email);
    if (v && v !== 'exact' && !looseNoted) { looseNoted = true; corrected = true; out.notes.push('Sent from ' + email + ', recognised as the ' + v); }
    return !!v;
  };
  const subBinomes = ctx.binomes.filter(b => memberVia(b, sub));
  let substantive = false;
  const tB = String(input.typedBinome || '').trim(), tI = String(input.typedInterviewee || '').trim();
  let corrected = false;

  // 1) binome as typed (code, or member names)
  let typedB = null;
  const pb = parseBinomeCode(tB);
  if (pb && byCode[pb.code]) {
    typedB = byCode[pb.code];
    if (!pb.exact) { corrected = true; out.notes.push('Binome "' + tB + '" read as ' + typedB.code); }
  } else {
    const nm = bestNameMatch(tB, ctx.binomes, b => b.members.map(m => m.name).join(' '), 1);
    if (nm) { typedB = nm; corrected = true; substantive = true; out.notes.push('Binome "' + tB + '" matched by member names -> ' + nm.code); }
  }

  // 2) interviewee (exact code, fuzzy code, number only, or name)
  const scopeBinomes = [];
  [typedB].concat(subBinomes).forEach(b => { if (b && scopeBinomes.indexOf(b.code) < 0) scopeBinomes.push(b.code); });
  const scope = ctx.interviewees.filter(i => i.code && scopeBinomes.indexOf(i.binome) >= 0);
  let iv = null, how = '';
  const pi = parseIntervieweeCode(tI);
  if (pi && pi.code && ivByCode[pi.code]) { iv = ivByCode[pi.code]; how = pi.exact ? '' : 'normalized'; }
  const uniq = arr => (arr.length === 1 ? arr[0] : null);
  if (!iv && pi && pi.code) { iv = uniq(scope.filter(i => levenshtein(i.code, pi.code) <= 1)); if (iv) how = 'typo'; }
  if (!iv && pi) { iv = uniq(scope.filter(i => codeNum(i.code) === pi.num)); if (iv) how = 'number within binome'; }
  if (!iv && pi && pi.code) { iv = uniq(ctx.interviewees.filter(i => i.code && levenshtein(i.code, pi.code) <= 1)); if (iv) how = 'typo (outside binome)'; }
  if (!iv) { iv = bestNameMatch(tI, scope, i => i.name, 1); if (iv) how = 'name within binome'; }
  if (!iv) { iv = bestNameMatch(tI, ctx.interviewees.filter(i => i.code), i => i.name, 2); if (iv) how = 'name'; }
  if (iv && how) { corrected = true; if (how !== 'normalized') substantive = true; out.notes.push('Interviewee "' + tI + '" read as ' + iv.code + ' (' + how + ')'); }

  const flag = (severity, type, msg, binome, notifyBinome) =>
    out.alerts.push({ severity: severity, type: type, msg: msg, binome: binome || '', notifyBinome: !!notifyBinome });

  if (!iv) {
    const b = typedB || subBinomes[0] || null;
    out.binome = b ? b.code : '';
    flag('HIGH', 'UNKNOWN_INTERVIEWEE', 'Interview form by ' + subName + ': interviewee "' + tI +
      '" matches no registered interviewee' + (b ? ' (binome ' + b.code + ')' : '') + '. Please correct it.',
      out.binome, true);
    out.result = 'FLAGGED';
    return out;
  }

  out.interviewee = iv.code;
  const assigned = iv.binome ? byCode[iv.binome] : null;

  // 3) reconcile binome with the interviewee's assigned binome and the submitter
  if (!assigned) {
    out.binome = typedB ? typedB.code : (subBinomes[0] ? subBinomes[0].code : '');
    flag('MEDIUM', 'NOT_ASSIGNED', iv.code + ' was interviewed (by ' + subName + ') but has no assigned binome.', '', false);
  } else if (typedB && typedB.code === assigned.code) {
    out.binome = assigned.code;
    if (!isMember(assigned, sub)) {
      const trusted = (ctx.trustedBackups || []).indexOf(sub) >= 0;
      flag(trusted ? 'INFO' : 'MEDIUM', 'BACKUP_INTERVIEWER', iv.code + ' interviewed under ' + assigned.code + ' but the form was sent by ' +
        subName + ', who is not in that binome (backup interviewer?).', assigned.code, false);
    }
  } else if (isMember(assigned, sub)) {
    out.binome = assigned.code; corrected = true; substantive = true;
    out.notes.push('Binome corrected from "' + (tB || 'empty') + '" to ' + assigned.code + ' (submitter is a member)');
  } else {
    out.binome = assigned.code;
    flag('MEDIUM', 'BINOME_MISMATCH', iv.code + ' belongs to ' + assigned.code + ' but the form says "' + (tB || 'empty') +
      '" and was sent by ' + subName + (subBinomes.length ? ' (' + subBinomes.map(b => b.code).join(', ') + ')' : ' (not in any binome)') +
      '. Check who really interviewed.', assigned.code, false);
  }

  // 4) duplicates and department sanity check
  if (ctx.interviewed && ctx.interviewed[iv.code]) {
    flag('MEDIUM', 'DUPLICATE_INTERVIEW', iv.code + ' already has an interview form; this is a second submission (by ' + subName + ').', out.binome, false);
  }
  const fc = normDept(input.typedFirstChoice);
  if (fc && iv.firstChoice && fc !== iv.firstChoice) {
    flag('INFO', 'CHOICE_MISMATCH', iv.code + ': interview form says 1st choice ' + fc + ' but the registration says ' + iv.firstChoice + '.', out.binome, false);
  }

  const serious = out.alerts.some(a => SEV_RANK[a.severity] >= SEV_RANK.MEDIUM);
  out.result = serious ? 'FLAGGED' : (corrected ? 'AUTOCORRECTED' : 'OK');
  out.substantive = substantive;
  return out;
}

/** How many of the name's tokens (first 4 letters) appear in the email's local part. */
function emailNameHits(email, name) {
  const local = normText(String(email || '').split('@')[0]).replace(/ /g, '');
  if (!local) return 0;
  return nameTokens(name).filter(t => local.indexOf(t.slice(0, 4)) >= 0).length;
}

function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/**
 * Draft binomes: 1 HR (pairAs HR) + 1 member of another department.
 * Board members (pairAs ALL) lead "ALL" binomes with a member of another department.
 * members: [{name,email,pairAs}] ; returns [{a, b, tag, warning}]
 */
function draftPairs(members, rnd) {
  rnd = rnd || Math.random;
  const leads = shuffled(members.filter(m => m.pairAs === 'ALL'), rnd);
  const hrs = shuffled(members.filter(m => m.pairAs === 'HR'), rnd);
  const byDep = {};
  ['IT', 'COMM', 'FLER'].forEach(d => { byDep[d] = shuffled(members.filter(m => m.pairAs === d), rnd); });
  const takeOther = () => {
    let best = null;
    Object.keys(byDep).forEach(d => { if (byDep[d].length && (!best || byDep[d].length > byDep[best].length)) best = d; });
    return best ? byDep[best].pop() : null;
  };
  const pairs = [];
  leads.forEach(l => {
    const o = takeOther() || hrs.pop() || null;
    pairs.push({ a: l, b: o, tag: 'ALL', warning: o ? '' : 'No partner left for this board member' });
  });
  while (hrs.length) {
    const h = hrs.pop();
    const o = takeOther();
    if (o) pairs.push({ a: h, b: o, tag: o.pairAs + ' & HR', warning: '' });
    else {
      const h2 = hrs.pop() || null;
      pairs.push({ a: h, b: h2, tag: 'HR', warning: h2 ? 'Two HR members (not enough members from other departments)' : 'No partner left' });
    }
  }
  let rest = [];
  Object.keys(byDep).forEach(d => { rest = rest.concat(byDep[d]); });
  while (rest.length) {
    const a = rest.pop(), b = rest.pop() || null;
    const tag = b && b.pairAs !== a.pairAs ? a.pairAs + ' & ' + b.pairAs : a.pairAs;
    pairs.push({ a: a, b: b, tag: tag, warning: 'No HR member available for this pair' });
  }
  return pairs;
}

/** Pick the binome for a new interviewee of department `dep`. binomes: [{code, tag, load}] */
function pickBinome(dep, binomes, allWeight) {
  const w = Number(allWeight) > 0 ? Number(allWeight) : 1;
  let best = null, bestLoad = Infinity;
  binomes.forEach(b => {
    if (tagDepts(b.tag).indexOf(dep) < 0) return;
    const load = (b.load || 0) * (/\ball\b/i.test(b.tag) ? w : 1);
    if (load < bestLoad || (load === bestLoad && best && b.code < best.code)) { best = b; bestLoad = load; }
  });
  return best;
}

function nextCode(dep, existingCodes) {
  let max = 0;
  existingCodes.forEach(c => { if (codeDept(c) === dep) { const n = codeNum(c); if (n > max) max = n; } });
  return dep + '.' + pad2(max + 1);
}

function normPhone(p) {
  let d = String(p == null ? '' : p).replace(/\D/g, '');
  if (d.indexOf('00213') === 0) d = d.slice(5);
  else if (d.indexOf('213') === 0 && d.length >= 12) d = d.slice(3);
  if (d.length === 9 && /^[5-7]/.test(d)) d = '0' + d; // leading 0 eaten by Sheets
  return d;
}

function parseLooseDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const m = String(v || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return null;
  let y = parseInt(m[3], 10); if (y < 100) y += 2000;
  const d = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(d) ? null : d;
}

/**
 * Registration anomalies. rec: {ts, collected, typedEmail, first, family, birth, phone, c1, c1raw, c2}
 * existing: [{code, email, typedEmail, name, phone}]
 * returns {alerts:[{severity,type,msg}], duplicateOf, phone}
 */
function checkRegistration(rec, existing, domain) {
  const alerts = [];
  const add = (severity, type, msg) => alerts.push({ severity: severity, type: type, msg: msg });
  const who = ((rec.first || '') + ' ' + (rec.family || '')).trim() || rec.collected || 'Someone';
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const collected = String(rec.collected || '').trim().toLowerCase();
  const typed = String(rec.typedEmail || '').trim().toLowerCase();
  const phone = normPhone(rec.phone);
  let duplicateOf = '';

  const fullName = normText(who);
  existing.forEach(e => {
    if (duplicateOf) return;
    const sameEmail = (collected && (collected === e.email || collected === e.typedEmail)) || (typed && typed === e.email);
    const sameNamePhone = fullName && fullName === normText(e.name) && phone && phone === e.phone;
    if (sameEmail || sameNamePhone) duplicateOf = e.code || e.email || 'an earlier registration';
  });
  if (duplicateOf) add('HIGH', 'DUPLICATE_REGISTRATION', who + ' registered again (same person as ' + duplicateOf + '). The new submission was NOT assigned; check if their answers changed.');

  if (!/[a-z]/i.test(normText(rec.first)) || !/[a-z]/i.test(normText(rec.family))) add('HIGH', 'MISSING_NAME', 'Registration from ' + (collected || typed || '?') + ' has an empty or junk first/family name ("' + (rec.first || '') + ' ' + (rec.family || '') + '").');
  if (!rec.c1) add('HIGH', 'INVALID_CHOICE', who + ': 1st department choice "' + (rec.c1raw || '') + '" is not IT/COMM/FLER/HR, so they cannot be routed.');
  if (typed && !emailRe.test(typed)) add('MEDIUM', 'BAD_EMAIL', who + ' typed an invalid email "' + rec.typedEmail + '".');
  else if (typed && collected && typed !== collected) add('MEDIUM', 'EMAIL_MISMATCH', who + ' typed "' + rec.typedEmail + '" but submitted from ' + collected + '. Use the submitting email.');
  const mainEmail = collected || typed;
  if (domain && mainEmail && emailRe.test(mainEmail) && mainEmail.split('@')[1] !== String(domain).toLowerCase()) add('INFO', 'EXTERNAL_EMAIL', who + ' uses a non-@' + domain + ' email (' + mainEmail + ').');
  if (rec.c1 && rec.c2 && rec.c1 === rec.c2) add('MEDIUM', 'SAME_CHOICES', who + ' picked ' + rec.c1 + ' as both 1st and 2nd choice.');
  if (!/^0[5-7]\d{8}$/.test(phone) && !/^0[2-4]\d{7}$/.test(phone)) add('MEDIUM', 'BAD_PHONE', who + ': phone number "' + (rec.phone || '') + '" does not look like a valid Algerian number.');
  const bd = parseLooseDate(rec.birth);
  if (rec.birth && !bd) add('MEDIUM', 'BAD_BIRTHDATE', who + ': birth date "' + rec.birth + '" is unreadable.');
  else if (bd) {
    const ref = rec.ts instanceof Date ? rec.ts : new Date();
    const age = (ref - bd) / (365.25 * 24 * 3600 * 1000);
    if (age < 15 || age > 35) add('MEDIUM', 'BAD_BIRTHDATE', who + ': birth date ' + String(rec.birth instanceof Date ? rec.birth.toDateString() : rec.birth) + ' gives an age of ' + Math.floor(age) + '. Probably a typo.');
  }
  return { alerts: alerts, duplicateOf: duplicateOf, phone: phone };
}

/** "09/11/2026" (+ "14:30" / "14h30") + "+01:00" -> Date ; '' -> null ; unreadable -> 'INVALID' */
function buildInterviewAt(dateStr, timeStr, offset) {
  dateStr = String(dateStr || '').trim(); timeStr = String(timeStr || '').trim();
  if (!dateStr) return null;
  let y, mo, d, m;
  if ((m = dateStr.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else if ((m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return 'INVALID';
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return 'INVALID';
  let hh = 23, mm = 59;
  if (timeStr) {
    const t = timeStr.match(/^(\d{1,2})\s*(?:[:hH]\s*(\d{2})?)?\s*(?:min)?$/);
    if (!t) return 'INVALID';
    hh = +t[1]; mm = t[2] ? +t[2] : 0;
    if (hh > 23 || mm > 59) return 'INVALID';
  }
  const iso = y + '-' + pad2(mo) + '-' + pad2(d) + 'T' + pad2(hh) + ':' + pad2(mm) + ':00' + (offset || 'Z');
  const out = new Date(iso);
  return isNaN(out) ? 'INVALID' : out;
}

/** Timing problems for one interviewee. iv: {code,status,registeredAt,assignedAt,contacted,interviewAt,submittedAt} */
function timingIssues(iv, now, s) {
  const out = [];
  if (PENDING_STATUSES.indexOf(iv.status) < 0) return out;
  const since = iv.assignedAt instanceof Date && iv.assignedAt > iv.registeredAt ? iv.assignedAt : iv.registeredAt;
  const hrs = (now - since) / 3.6e6;
  const c = String(iv.contacted || '').trim();
  if ((!c || c === 'Not yet') && hrs > s.contactH) {
    out.push({ type: 'NOT_CONTACTED', msg: iv.code + ' has not been contacted ' + Math.floor(hrs) + 'h after being assigned.' });
  }
  if (iv.interviewAt === 'INVALID') {
    out.push({ type: 'BAD_DATE', msg: iv.code + ': the interview date/time written in the binome sheet is unreadable (use the date picker and HH:mm).' });
  } else if (!iv.interviewAt && hrs > s.dateH) {
    out.push({ type: 'NO_DATE', msg: iv.code + ' still has no interview date ' + Math.floor(hrs) + 'h after being assigned.' });
  } else if (iv.interviewAt instanceof Date && !iv.submittedAt && (now - iv.interviewAt) / 3.6e6 > s.afterH) {
    out.push({ type: 'OVERDUE', msg: iv.code + ': interview was planned for ' + iv.interviewLabel + ' but no interview form has been submitted.' });
  }
  return out;
}

/* =============================================================================
 * GOOGLE SHEETS PLUMBING
 * ===========================================================================*/

function ss_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActive(); } catch (e) { /* no active */ }
  if (!ss) {
    const id = PropertiesService.getScriptProperties().getProperty('MASTER_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  return ss;
}

let _settings = null;
function S_() {
  if (_settings) return _settings;
  const o = {};
  SETTINGS_DEFAULTS.forEach(r => { o[r[0]] = r[1]; });
  const sh = ss_().getSheetByName(TAB.SETTINGS);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
      if (String(r[0]).trim() && r[1] !== '') o[String(r[0]).trim()] = r[1];
    });
  }
  o.TIMEZONE = String(o.TIMEZONE || 'Africa/Algiers');
  _settings = o;
  return o;
}
function bool_(v) { return v === true || /^(true|yes|oui|1|vrai)$/i.test(String(v).trim()); }
function num_(v, d) { const n = Number(v); return isNaN(n) || v === '' ? d : n; }
function adminEmails_() {
  return String(S_().ADMIN_EMAIL || '').split(/[,;\s]+/).map(e => e.trim()).filter(e => /@/.test(e));
}
function tzOffset_() { return Utilities.formatDate(new Date(), S_().TIMEZONE, 'XXX'); }
function fmt_(d, pattern) {
  if (!(d instanceof Date) || isNaN(d)) return String(d || '');
  return Utilities.formatDate(d, S_().TIMEZONE, pattern || 'dd/MM/yyyy HH:mm');
}
function txt_(v) { const s = String(v == null ? '' : v); return s === '' ? '' : "'" + s; } // force plain text
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function idx_(headers) { const o = {}; headers.forEach((h, i) => { o[h] = i; }); return o; }

/** Load a script-managed tab as {sh, H, I, data} (data = rows below the header). */
function loadTable_(name, headers) {
  const sh = ss_().getSheetByName(name);
  const n = sh.getLastRow();
  const data = n > 1 ? sh.getRange(2, 1, n - 1, headers.length).getValues() : [];
  return { sh: sh, H: headers, I: idx_(headers), data: data, originalLength: data.length };
}
function saveTable_(t) {
  if (!t.data.length) return;
  t.sh.getRange(2, 1, t.data.length, t.H.length).setValues(t.data);
}

function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 30000)) { console.warn('Busy: another run holds the lock'); return null; }
  try { return fn(); } finally { lock.releaseLock(); }
}

function ui_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }
function say_(msg) { const u = ui_(); if (u) u.alert(msg); else console.log(msg); }
function toast_(msg) { try { ss_().toast(msg, 'VIC Recruitment', 6); } catch (e) { console.log(msg); } }

/* ---------- context: everything a run needs, loaded once ---------- */

function loadCtx_() {
  const ctx = {
    now: new Date(),
    iv: loadTable_(TAB.IV, IV_H),
    log: loadTable_(TAB.LOG, LOG_H),
    bin: loadTable_(TAB.BINOMES, BIN_H),
    team: loadTable_(TAB.TEAM, TEAM_H),
    files: {},          // fileId -> Sheet (cache)
    mailNew: {},        // binomeCode -> [iv rows] newly assigned this run
    alerts: null,
  };
  ctx.alerts = alertBuffer_(ctx);
  indexCtx_(ctx);
  return ctx;
}

function indexCtx_(ctx) {
  const I = ctx.iv.I, B = ctx.bin.I;
  ctx.ivByCode = {}; ctx.ivKeys = {};
  ctx.iv.data.forEach(r => {
    if (r[I.Code]) ctx.ivByCode[String(r[I.Code]).trim()] = r;
    if (r[I['Response Key']]) ctx.ivKeys[r[I['Response Key']]] = true;
  });
  ctx.logKeys = {};
  ctx.log.data.forEach(r => { if (r[ctx.log.I['Response Key']]) ctx.logKeys[r[ctx.log.I['Response Key']]] = true; });
  ctx.binomes = ctx.bin.data.filter(r => String(r[B.Binome]).trim()).map(r => ({
    code: String(r[B.Binome]).trim(), tag: String(r[B.Tag]).trim(), status: String(r[B.Status]).trim().toUpperCase(),
    fileId: String(r[B['File ID']]).trim(), fileUrl: String(r[B.File]).trim(),
    members: [[r[B['Member 1']], r[B['Email 1']]], [r[B['Member 2']], r[B['Email 2']]]]
      .filter(m => String(m[0]).trim() || String(m[1]).trim())
      .map(m => ({ name: String(m[0]).trim(), email: String(m[1]).trim().toLowerCase() })),
    row: r,
  }));
  ctx.binByCode = {}; ctx.binomes.forEach(b => { ctx.binByCode[b.code] = b; });
  ctx.nameByEmail = {};
  ctx.team.data.forEach(r => { const e = String(r[ctx.team.I.Email]).trim().toLowerCase(); if (e) ctx.nameByEmail[e] = String(r[ctx.team.I['Full Name']]).trim(); });
  ctx.binomes.forEach(b => b.members.forEach(m => { if (m.email && !ctx.nameByEmail[m.email]) ctx.nameByEmail[m.email] = m.name; }));
}

function activeBinomes_(ctx) { return ctx.binomes.filter(b => b.status === 'ACTIVE'); }

/* ---------- alerts ---------- */

function alertBuffer_(ctx) {
  const t = loadTable_(TAB.ALERTS, ALERT_H);
  const I = t.I;
  const openKeys = {};
  t.data.forEach(r => { if (r[I.Status] === 'OPEN' && r[I.Key]) openKeys[r[I.Key]] = true; });
  const fresh = [];
  let dirty = false;
  return {
    table: t,
    openKeys: openKeys,
    /** a: {severity, type, code, binome, msg, key, notifyBinome, status} */
    add: function (a) {
      if (a.key && openKeys[a.key]) return false;
      if (a.key) openKeys[a.key] = true;
      fresh.push(a);
      return true;
    },
    resolveWhere: function (pred, status) {
      t.data.forEach(r => {
        if (r[I.Status] === 'OPEN' && pred(r)) { r[I.Status] = status || 'AUTO-RESOLVED'; r[I['Resolved At']] = ctx.now; delete openKeys[r[I.Key]]; dirty = true; }
      });
    },
    flush: function () {
      if (dirty) saveTable_(t);
      if (!fresh.length) return;
      const s = S_();
      const minRank = SEV_RANK[String(s.INSTANT_EMAIL_MIN_SEVERITY).toUpperCase()] || SEV_RANK.MEDIUM;
      const admins = adminEmails_();
      const perRecipient = {};
      const push = (email, a) => { (perRecipient[email] = perRecipient[email] || []).push(a); };
      let n = t.data.length;
      const rows = fresh.map(a => {
        n++;
        const to = [];
        const instant = SEV_RANK[a.severity] >= minRank && a.status !== 'AUTO-FIXED';
        if (instant) admins.forEach(e => { push(e, a); to.push(e); });
        if (instant && a.notifyBinome && bool_(s.NOTIFY_BINOME_ON_ALERT) && ctx.binByCode[a.binome]) {
          ctx.binByCode[a.binome].members.forEach(m => { if (m.email) { push(m.email, a); if (to.indexOf(m.email) < 0) to.push(m.email); } });
        }
        return ['A-' + ('0000' + n).slice(-4), ctx.now, a.severity, a.type, a.code || '', a.binome || '', a.msg,
          to.join(', '), a.status || 'OPEN', a.status && a.status !== 'OPEN' ? ctx.now : '', a.key || ''];
      });
      t.sh.getRange(t.sh.getLastRow() + 1, 1, rows.length, ALERT_H.length).setValues(rows);
      rows.forEach(r => t.data.push(r));
      Object.keys(perRecipient).forEach(email => {
        const list = perRecipient[email];
        const isAdmin = admins.indexOf(email) >= 0;
        const html = '<p>' + (isAdmin ? 'New recruitment alert(s):' : 'Hi! Something needs your attention in the recruitment process:') + '</p>' +
          '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:13px">' +
          list.map(a => '<tr style="border-bottom:1px solid #ddd"><td><b style="color:' + (a.severity === 'HIGH' ? '#c62828' : a.severity === 'MEDIUM' ? '#ef6c00' : '#555') + '">' +
            a.severity + '</b></td><td>' + esc_(a.type) + '</td><td>' + esc_(a.code || '') + '</td><td>' + esc_(a.msg) + '</td></tr>').join('') +
          '</table>' + (isAdmin ? '<p><a href="' + ss_().getUrl() + '">Open the master sheet</a></p>' :
          (ctx.binByCode[list[0].binome] && ctx.binByCode[list[0].binome].fileUrl ? '<p><a href="' + ctx.binByCode[list[0].binome].fileUrl + '">Open your binome sheet</a></p>' : ''));
        mail_(email, '[VIC Recruitment] ' + list.length + ' alert' + (list.length > 1 ? 's' : '') + (list.some(a => a.severity === 'HIGH') ? ' (HIGH)' : ''), html);
      });
      fresh.length = 0;
    },
  };
}

function mail_(to, subject, html) {
  try {
    MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: 'VIC Recruitment Bot' });
  } catch (e) { console.error('Mail to ' + to + ' failed: ' + e); }
}

/* ---------- binome files ---------- */

function binomeSheet_(ctx, b) {
  if (!b || !b.fileId) return null;
  if (!ctx.files[b.fileId]) ctx.files[b.fileId] = SpreadsheetApp.openById(b.fileId).getSheets()[0];
  return ctx.files[b.fileId];
}

function ivToFileRow_(ctx, r, carry) {
  const I = ctx.iv.I;
  carry = carry || {};
  return [r[I.Code], r[I['First Name']], r[I['Family Name']], r[I.Email], String(r[I.Phone]), r[I.Facebook], r[I.Discord],
    r[I.Field], r[I.Year], r[I['1st Choice']], r[I['2nd Choice']], r[I.Availability], r[I.Motivation], r[I['Anything to add']],
    r[I['Registered At']], carry.contacted || 'Not yet', carry.date || '', carry.time || '', carry.form || '', carry.notes || ''];
}

function appendToBinomeFile_(ctx, b, r, carry) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, 1, BF_H.length).setValues([ivToFileRow_(ctx, r, carry)]);
}

function findFileRow_(sh, code) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const codes = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < codes.length; i++) if (String(codes[i][0]).trim() === code) return i + 2;
  return -1;
}

function removeFromBinomeFile_(ctx, b, code) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return {};
  const row = findFileRow_(sh, code);
  if (row < 0) return {};
  const F = idx_(BF_H);
  const disp = sh.getRange(row, 1, 1, BF_H.length).getDisplayValues()[0];
  const carry = { contacted: disp[F.Contacted], date: disp[F['Interview Date']], time: disp[F['Interview Time']],
    form: disp[F['Interview Form']], notes: disp[F.Notes] };
  sh.deleteRow(row);
  return carry;
}

function markInterviewInFile_(ctx, b, code, text) {
  const sh = binomeSheet_(ctx, b);
  if (!sh) return;
  const row = findFileRow_(sh, code);
  if (row > 0) sh.getRange(row, idx_(BF_H)['Interview Form'] + 1).setValue(text);
}

function createBinomeFile_(b, members) {
  const s = S_();
  const first = n => String(n || '').trim().split(/\s+/)[0] || '?';
  const title = '[' + b.code + '] ' + members.map(m => first(m.name)).join(' & ');
  const file = SpreadsheetApp.create(title);
  try { file.setSpreadsheetLocale('fr_FR'); } catch (e) { /* ignore */ }
  file.setSpreadsheetTimeZone(s.TIMEZONE);
  DriveApp.getFileById(file.getId()).moveTo(DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID));
  const sh = file.getSheets()[0];
  sh.setName(b.code);
  const F = idx_(BF_H);
  sh.getRange(1, 1, 1, BF_H.length).setValues([BF_H]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
  BF_EDITABLE.forEach(h => sh.getRange(1, F[h] + 1).setBackground('#38761d'));
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  sh.getRange(1, 1).setNote('Binome ' + b.code + ' (' + b.tag + ')\n' + members.map(m => m.name).join(' & ') +
    '\n\nGreen columns are yours: Contacted, Interview Date (date picker), Interview Time (HH:mm), Notes.\n' +
    'Everything else is filled automatically.');
  const maxRows = 400;
  if (sh.getMaxRows() < maxRows) sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  sh.getRange(2, F.Contacted + 1, maxRows - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONTACT_OPTIONS, true).setAllowInvalid(false).build());
  sh.getRange(2, F['Interview Date'] + 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy').setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Double-click to open the date picker').build());
  sh.getRange(2, F['Interview Time'] + 1, maxRows - 1, 1).setNumberFormat('HH:mm');
  sh.getRange(2, F.Phone + 1, maxRows - 1, 1).setNumberFormat('@');
  sh.getRange(2, F.Registered + 1, maxRows - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange(2, F['Why this department'] + 1, maxRows - 1, 2).setWrap(true);
  sh.setColumnWidth(F['Why this department'] + 1, 320);
  const cf = [
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Yes').setBackground('#d9ead3').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Not yet').setBackground('#fce5cd').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Withdrew').setBackground('#eeeeee').setRanges([sh.getRange(2, F.Contacted + 1, maxRows - 1, 1)]).build(),
  ];
  sh.setConditionalFormatRules(cf);
  // Protect everything except the binome's own columns
  const p = sh.protect().setDescription('Filled by the recruitment script');
  p.setUnprotectedRanges(BF_EDITABLE.map(h => sh.getRange(2, F[h] + 1, maxRows - 1, 1)));
  const me = Session.getEffectiveUser();
  p.addEditor(me);
  p.removeEditors(p.getEditors().filter(u => u.getEmail() !== me.getEmail()));
  if (p.canDomainEdit()) p.setDomainEdit(false);
  if (bool_(s.SHARE_FILES_WITH_BINOME)) {
    members.forEach(m => { if (m.email) { try { file.addEditor(m.email); } catch (e) { console.warn('Share failed ' + m.email + ': ' + e); } } });
  }
  return file;
}

/* ---------- 1) registrations ---------- */

function regHeaders_(headers) {
  const n = headers.map(normText);
  const find = (pred) => { for (let i = 0; i < n.length; i++) if (pred(n[i])) return i; return -1; };
  const H = {
    ts: find(h => h === 'timestamp' || h.indexOf('horodateur') === 0),
    collected: find(h => h === 'email address' || h === 'adresse e mail'),
    typed: find(h => h.indexOf('e mail address') >= 0 && h !== 'adresse e mail'),
    first: find(h => h.indexOf('first name') >= 0 || h === 'prenom'),
    family: find(h => h.indexOf('family name') >= 0 || h.indexOf('last name') >= 0 || h === 'nom'),
    birth: find(h => h.indexOf('birth') >= 0),
    phone: find(h => h.indexOf('phone') >= 0),
    fb: find(h => h.indexOf('facebook') >= 0),
    discord: find(h => h.indexOf('discord') >= 0),
    field: find(h => h.indexOf('field of study') >= 0),
    year: find(h => h.indexOf('year of study') >= 0),
    c1: find(h => (h.indexOf('first department') >= 0 || h.indexOf('1st department') >= 0) && h.indexOf('why') < 0),
    c2: find(h => (h.indexOf('2nd department') >= 0 || h.indexOf('second department') >= 0) && h.indexOf('why') < 0),
    avail: find(h => h.indexOf('available for an interview') >= 0 || h.indexOf('availab') >= 0 && h.indexOf('interview') >= 0),
    anything: find(h => h.indexOf('anything to add') >= 0),
    motiv: {},
  };
  n.forEach((h, i) => { const m = h.match(/why did you choose the (\w+) department/); if (m && DEPT_ALIASES[m[1]]) H.motiv[DEPT_ALIASES[m[1]]] = i; });
  return H;
}

function responseSheet_(which) {
  const id = PropertiesService.getScriptProperties().getProperty(which === 'REG' ? 'REG_SHEET_ID' : 'INT_SHEET_ID');
  const name = which === 'REG' ? TAB.REG_RESP : TAB.INT_RESP;
  const sheets = ss_().getSheets();
  for (let i = 0; i < sheets.length; i++) if (String(sheets[i].getSheetId()) === id) return sheets[i];
  return ss_().getSheetByName(name);
}

function responseKey_(ts, email, r) {
  return (ts instanceof Date ? ts.getTime() : String(ts)) + '|' + String(email || '').trim().toLowerCase() + (email ? '' : '|r' + r);
}

function loads_(ctx) {
  const I = ctx.iv.I, mode = String(S_().BALANCE_BY).toUpperCase();
  const load = {};
  ctx.iv.data.forEach(r => {
    const b = r[I.Binome]; if (!b) return;
    if (mode === 'TOTAL' ? r[I.Status] !== ST.DUPLICATE : PENDING_STATUSES.indexOf(r[I.Status]) >= 0) load[b] = (load[b] || 0) + 1;
  });
  return load;
}

/** Give a binome (and a code if missing) to an Interviewees row. Returns true if assigned. */
function assignRow_(ctx, r) {
  const I = ctx.iv.I, s = S_();
  const dep = String(r[I['1st Choice']]).trim();
  if (DEPTS.indexOf(dep) < 0) return false;
  if (!r[I.Code]) {
    r[I.Code] = nextCode(dep, Object.keys(ctx.ivByCode));
    ctx.ivByCode[r[I.Code]] = r;
  }
  if (!bool_(s.ASSIGNMENTS_OPEN)) return false;
  const load = loads_(ctx);
  const cands = activeBinomes_(ctx).map(b => ({ code: b.code, tag: b.tag, load: load[b.code] || 0, b: b }));
  const pick = pickBinome(dep, cands, num_(s.ALL_BINOME_WEIGHT, 1));
  if (!pick) return false;
  r[I.Binome] = pick.code;
  r[I.Status] = ST.ASSIGNED;
  r[I['Assigned At']] = ctx.now;
  appendToBinomeFile_(ctx, pick.b, r);
  (ctx.mailNew[pick.code] = ctx.mailNew[pick.code] || []).push(r);
  return true;
}

function processRegistrations_(ctx) {
  const sh = responseSheet_('REG');
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const H = regHeaders_(data[0]);
  const I = ctx.iv.I, s = S_();
  const get = (row, i) => (i >= 0 ? row[i] : '');
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const ts = get(row, H.ts);
    if (!ts) continue;
    const collected = String(get(row, H.collected)).trim().toLowerCase();
    const typed = String(get(row, H.typed)).trim();
    const key = responseKey_(ts, collected || typed, r + 1);
    if (ctx.ivKeys[key]) continue;

    const c1raw = String(get(row, H.c1)).trim();
    const rec = { ts: ts, collected: collected, typedEmail: typed, first: String(get(row, H.first)).trim(),
      family: String(get(row, H.family)).trim(), birth: get(row, H.birth), phone: get(row, H.phone),
      c1: normDept(c1raw), c1raw: c1raw, c2: normDept(get(row, H.c2)) };
    const existing = ctx.iv.data.filter(x => x[I.Status] !== ST.DUPLICATE).map(x => ({
      code: x[I.Code], email: String(x[I.Email]).toLowerCase(), typedEmail: String(x[I['Typed Email']]).toLowerCase(),
      name: x[I['First Name']] + ' ' + x[I['Family Name']], phone: normPhone(x[I.Phone]) }));
    const chk = checkRegistration(rec, existing, s.EMAIL_DOMAIN);

    const out = new Array(IV_H.length).fill('');
    out[I['Registered At']] = ts;
    out[I['First Name']] = rec.first; out[I['Family Name']] = rec.family;
    out[I.Email] = collected || typed.toLowerCase(); out[I['Typed Email']] = typed;
    out[I.Phone] = chk.phone || String(get(row, H.phone));
    out[I.Facebook] = get(row, H.fb); out[I.Discord] = get(row, H.discord);
    out[I.Field] = get(row, H.field); out[I.Year] = get(row, H.year);
    out[I['1st Choice']] = rec.c1 || c1raw; out[I['2nd Choice']] = rec.c2 || String(get(row, H.c2));
    out[I.Availability] = get(row, H.avail); out[I['Anything to add']] = get(row, H.anything);
    out[I.Motivation] = rec.c1 && H.motiv[rec.c1] !== undefined ? get(row, H.motiv[rec.c1]) : '';
    out[I.Contacted] = '';
    out[I.Flags] = chk.alerts.map(a => a.type).join(', ');
    out[I['Response Key']] = key;
    out[I.Status] = ST.UNASSIGNED;
    ctx.iv.data.push(out);
    ctx.ivKeys[key] = true;

    if (chk.duplicateOf) {
      out[I.Status] = ST.DUPLICATE;
    } else if (rec.c1) {
      assignRow_(ctx, out);
    }
    const label = out[I.Code] || (rec.first + ' ' + rec.family).trim();
    chk.alerts.forEach(a => ctx.alerts.add({ severity: a.severity, type: a.type, code: label, binome: out[I.Binome],
      msg: a.msg, key: 'REG|' + a.type + '|' + key, notifyBinome: false }));
    if (out[I.Status] === ST.UNASSIGNED && rec.c1 && bool_(s.ASSIGNMENTS_OPEN)) {
      const none = !activeBinomes_(ctx).length;
      ctx.alerts.add({ severity: 'HIGH', type: 'NO_BINOME', code: none ? '' : label, binome: '', notifyBinome: false,
        msg: none ? 'Registrations are arriving but no binome is locked yet: they wait as UNASSIGNED until you run "3 · Lock binomes".'
          : label + ' (' + rec.c1 + ') could not be assigned: no ACTIVE binome takes ' + rec.c1 + '.',
        key: none ? 'NO_BINOME|ALL' : 'NO_BINOME|' + key });
    }
  }
}

function assignUnassigned_(ctx) {
  const I = ctx.iv.I;
  if (!bool_(S_().ASSIGNMENTS_OPEN) || !activeBinomes_(ctx).length) return;
  ctx.iv.data.forEach(r => { if (r[I.Status] === ST.UNASSIGNED) assignRow_(ctx, r); });
}

/* ---------- 2) interview forms ---------- */

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
    interviewees: ctx.iv.data.filter(r => r[I.Code] && r[I.Status] !== ST.DUPLICATE).map(r => ({
      code: String(r[I.Code]).trim(), binome: String(r[I.Binome]).trim(),
      name: r[I['First Name']] + ' ' + r[I['Family Name']], firstChoice: String(r[I['1st Choice']]).trim() })),
    interviewed: interviewed,
    nameByEmail: ctx.nameByEmail,
    trustedBackups: String(S_().TRUSTED_BACKUPS || '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => /@/.test(e)),
  };
}

function processInterviews_(ctx) {
  const sh = responseSheet_('INT');
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const H = intHeaders_(data[0]);
  const I = ctx.iv.I;
  const get = (row, i) => (i >= 0 ? row[i] : '');
  let rctx = null;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const ts = get(row, H.ts);
    if (!ts) continue;
    const sub = String(get(row, H.collected)).trim().toLowerCase();
    const key = responseKey_(ts, sub, r + 1);
    if (ctx.logKeys[key]) continue;
    rctx = rctx || resolverCtx_(ctx);
    const res = resolveInterview({ submitter: sub, typedBinome: get(row, H.binome),
      typedInterviewee: get(row, H.interviewee), typedFirstChoice: get(row, H.c1) }, rctx);

    const logRow = [ts, sub, String(get(row, H.binome)), String(get(row, H.interviewee)), res.binome, res.interviewee,
      res.result, res.notes.concat(res.alerts.map(a => a.type + ': ' + a.msg)).join(' | '), get(row, H.finalDep), key];
    ctx.log.data.push(logRow);
    ctx.logKeys[key] = true;
    const logRowNumber = ctx.log.data.length + 1;

    const ivRow = res.interviewee ? ctx.ivByCode[res.interviewee] : null;
    if (ivRow) {
      const first = !ivRow[I['Interview Submitted At']];
      if (first) {
        ivRow[I['Interview Submitted At']] = ts;
        ivRow[I['Interview Log Row']] = logRowNumber;
        ivRow[I.Status] = ST.INTERVIEWED;
      }
      rctx.interviewed[res.interviewee] = true;
      const b = first ? ctx.binByCode[ivRow[I.Binome]] : null;
      if (b) markInterviewInFile_(ctx, b, res.interviewee, (res.result === 'FLAGGED' ? '⚠️ ' : '✅ ') + fmt_(ts, 'dd/MM HH:mm') +
        (res.result === 'AUTOCORRECTED' ? ' (auto-corrected)' : ''));
    }
    res.alerts.forEach(a => ctx.alerts.add({ severity: a.severity, type: a.type, code: res.interviewee || String(get(row, H.interviewee)),
      binome: a.binome || res.binome, msg: a.msg + ' [Interview Log row ' + logRowNumber + ']', notifyBinome: a.notifyBinome,
      key: 'INT|' + a.type + '|' + key }));
    if (res.result === 'AUTOCORRECTED' && res.substantive) {
      ctx.alerts.add({ severity: 'INFO', type: 'AUTOCORRECTED', code: res.interviewee, binome: res.binome, status: 'AUTO-FIXED',
        msg: res.notes.join(' | ') + ' [Interview Log row ' + logRowNumber + ']', key: 'INT|AUTOCORRECTED|' + key });
    }
  }
  if (ctx.log.data.length > ctx.log.originalLength) {
    const t = ctx.log;
    t.sh.getRange(t.originalLength + 2, 1, t.data.length - t.originalLength, LOG_H.length).setValues(t.data.slice(t.originalLength));
    t.originalLength = t.data.length;
  }
}

/* ---------- 3) read what binomes wrote ---------- */

function pullBinomeFiles_(ctx, force) {
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty('FILE_SEEN') || '{}');
  const updated = {};
  try {
    const it = DriveApp.getFolderById(CONFIG.BINOME_FOLDER_ID).getFiles();
    while (it.hasNext()) { const f = it.next(); updated[f.getId()] = f.getLastUpdated().getTime(); }
  } catch (e) { console.warn('Folder listing failed: ' + e); }
  const I = ctx.iv.I, F = idx_(BF_H), offset = tzOffset_();
  ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
    const lu = updated[b.fileId];
    if (!force && lu && seen[b.fileId] && lu <= seen[b.fileId]) return;
    let sh;
    try { sh = binomeSheet_(ctx, b); } catch (e) {
      ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', binome: b.code, msg: 'Cannot open the file of ' + b.code + ': ' + e, key: 'FILE|' + b.code });
      return;
    }
    const n = sh.getLastRow();
    if (n >= 2) {
      const rng = sh.getRange(2, 1, n - 1, BF_H.length);
      const vals = rng.getValues(), disp = rng.getDisplayValues();
      vals.forEach((v, k) => {
        const code = String(v[F.Code]).trim();
        const r = ctx.ivByCode[code];
        if (!r || r[I.Binome] !== b.code) return;
        const contacted = String(v[F.Contacted]).trim();
        if (contacted && contacted !== 'Not yet' && !r[I['Contacted Seen At']]) r[I['Contacted Seen At']] = ctx.now;
        r[I.Contacted] = contacted;
        const dStr = disp[k][F['Interview Date']].trim(), tStr = disp[k][F['Interview Time']].trim();
        r[I['Interview Date']] = dStr; r[I['Interview Time']] = tStr;
        const at = buildInterviewAt(dStr, tStr, offset);
        r[I['Interview At']] = at === null ? '' : at;
        r[I['Binome Notes']] = String(v[F.Notes]);
        r[I.Status] = statusOf_(ctx, r);
      });
    }
    seen[b.fileId] = lu || ctx.now.getTime();
  });
  props.setProperty('FILE_SEEN', JSON.stringify(seen));
}

function statusOf_(ctx, r) {
  const I = ctx.iv.I, c = String(r[I.Contacted]).trim();
  if (r[I.Status] === ST.DUPLICATE) return ST.DUPLICATE;
  if (!r[I.Binome]) return ST.UNASSIGNED;
  if (r[I['Interview Submitted At']]) return ST.INTERVIEWED;
  if (c === 'Withdrew') return ST.WITHDRAWN;
  if (r[I['Interview At']] instanceof Date) return ST.SCHEDULED;
  if (c === 'Yes' || c === 'No answer') return ST.CONTACTED;
  return ST.ASSIGNED;
}

/* ---------- 4) timing alerts ---------- */

function timingAlerts_(ctx) {
  const s = S_(), I = ctx.iv.I;
  const lim = { contactH: num_(s.HOURS_NOT_CONTACTED, 24), dateH: num_(s.HOURS_NO_INTERVIEW_DATE, 48), afterH: num_(s.HOURS_AFTER_INTERVIEW_NO_FORM, 12) };
  const current = {};
  const noneActive = !activeBinomes_(ctx).length;
  ctx.iv.data.forEach(r => {
    const code = String(r[I.Code]).trim();
    if (r[I.Status] === ST.UNASSIGNED && DEPTS.indexOf(String(r[I['1st Choice']])) >= 0 && bool_(s.ASSIGNMENTS_OPEN)) {
      current[noneActive ? 'NO_BINOME|ALL' : 'NO_BINOME|' + r[I['Response Key']]] = true;
    }
    if (!code || !(r[I['Registered At']] instanceof Date)) return;
    const at = r[I['Interview At']];
    const issues = timingIssues({ code: code, status: r[I.Status], registeredAt: r[I['Registered At']], assignedAt: r[I['Assigned At']], contacted: r[I.Contacted],
      interviewAt: at === '' ? null : at, interviewLabel: fmt_(at), submittedAt: r[I['Interview Submitted At']] }, ctx.now, lim);
    issues.forEach(x => {
      const key = 'TIME|' + x.type + '|' + code;
      current[key] = true;
      ctx.alerts.add({ severity: 'MEDIUM', type: x.type, code: code, binome: r[I.Binome], msg: x.msg + ' (binome ' + r[I.Binome] + ')',
        key: key, notifyBinome: true });
    });
  });
  const KI = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(row => AUTO_RESOLVING.indexOf(row[KI.Type]) >= 0 && !current[row[KI.Key]]);
}

/* ---------- 5) tracker ---------- */

function buildTracker_(ctx) {
  const sh = ss_().getSheetByName(TAB.TRACKER);
  const I = ctx.iv.I, s = S_();
  const per = {};
  const blank = () => ({ assigned: 0, contacted: 0, scheduled: 0, interviewed: 0, withdrew: 0, notContacted: 0, noDate: 0, overdue: 0, open: 0 });
  activeOrPaused_(ctx).forEach(b => { per[b.code] = blank(); });
  const tot = blank(); let registered = 0, unassigned = 0, dups = 0;
  const byDep = {}; DEPTS.forEach(d => { byDep[d] = 0; });
  ctx.iv.data.forEach(r => {
    const st = r[I.Status];
    if (st === ST.DUPLICATE) { dups++; return; }
    registered++;
    if (byDep[r[I['1st Choice']]] !== undefined) byDep[r[I['1st Choice']]]++;
    if (st === ST.UNASSIGNED) { unassigned++; return; }
    const p = per[r[I.Binome]] || (per[r[I.Binome]] = blank());
    [p, tot].forEach(x => {
      x.assigned++;
      if (st === ST.WITHDRAWN) x.withdrew++;
      if ([ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED].indexOf(st) >= 0) x.contacted++;
      if ([ST.SCHEDULED, ST.INTERVIEWED].indexOf(st) >= 0) x.scheduled++;
      if (st === ST.INTERVIEWED) x.interviewed++;
    });
  });
  const A = ctx.alerts.table.I;
  const openAlerts = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN');
  openAlerts.forEach(r => {
    const p = per[r[A.Binome]];
    [p, tot].forEach(x => {
      if (!x) return;
      x.open++;
      if (r[A.Type] === 'NOT_CONTACTED') x.notContacted++;
      if (r[A.Type] === 'NO_DATE') x.noDate++;
      if (r[A.Type] === 'OVERDUE') x.overdue++;
    });
  });
  const head = ['Binome', 'Members', 'Tag', 'Assigned', 'Contacted', 'Scheduled', 'Interviewed', 'Withdrew',
    'Not contacted > ' + s.HOURS_NOT_CONTACTED + 'h', 'No date > ' + s.HOURS_NO_INTERVIEW_DATE + 'h', 'Overdue interview form', 'Open alerts', 'Progress', 'File'];
  const rows = Object.keys(per).sort().map(code => {
    const p = per[code], b = ctx.binByCode[code] || { members: [], tag: '', fileUrl: '' };
    const denom = p.assigned - p.withdrew;
    return [code, b.members.map(m => m.name).join(' & '), b.tag, p.assigned, p.contacted, p.scheduled, p.interviewed, p.withdrew,
      p.notContacted, p.noDate, p.overdue, p.open, denom > 0 ? p.interviewed / denom : '', b.fileUrl];
  });
  const summary = [
    ['VIC Recruitment 2026 — live tracker', '', 'Last update: ' + fmt_(ctx.now)],
    ['Registered', registered, 'IT ' + byDep.IT + ' · COMM ' + byDep.COMM + ' · FLER ' + byDep.FLER + ' · HR ' + byDep.HR],
    ['Contacted', tot.contacted, 'Scheduled ' + tot.scheduled + ' · Interviewed ' + tot.interviewed + ' · Withdrew ' + tot.withdrew],
    ['Waiting for a binome', unassigned, 'Duplicates ignored: ' + dups],
    ['Open alerts', openAlerts.length, 'HIGH ' + openAlerts.filter(r => r[A.Severity] === 'HIGH').length + ' · MEDIUM ' + openAlerts.filter(r => r[A.Severity] === 'MEDIUM').length],
  ];
  sh.clear();
  sh.getRange(1, 1, summary.length, 3).setValues(summary);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1, summary.length - 1, 1).setFontWeight('bold');
  const top = summary.length + 2;
  sh.getRange(top, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
  if (rows.length) {
    sh.getRange(top + 1, 1, rows.length, head.length).setValues(rows);
    sh.getRange(top + 1, 13, rows.length, 1).setNumberFormat('0%');
    const flagCols = sh.getRange(top + 1, 9, rows.length, 4);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setBackground('#f4cccc').setRanges([flagCols]).build(),
      SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint('#ffffff').setGradientMaxpoint('#b6d7a8').setRanges([sh.getRange(top + 1, 13, rows.length, 1)]).build(),
    ]);
  }
  sh.setFrozenRows(top);
}

function activeOrPaused_(ctx) { return ctx.binomes.filter(b => b.status === 'ACTIVE' || b.status === 'PAUSED'); }

function sendNewIntervieweeMails_(ctx) {
  if (!bool_(S_().NOTIFY_BINOME_ON_NEW_INTERVIEWEE)) return;
  const I = ctx.iv.I;
  Object.keys(ctx.mailNew).forEach(code => {
    const b = ctx.binByCode[code];
    if (!b) return;
    const list = ctx.mailNew[code];
    const html = '<p>Hi ' + esc_(b.members.map(m => m.name.split(' ')[0]).join(' & ')) + ',</p><p>' + list.length +
      ' new interviewee' + (list.length > 1 ? 's were' : ' was') + ' assigned to your binome <b>' + code + '</b>:</p><ul>' +
      list.map(r => '<li><b>' + esc_(r[I.Code]) + '</b>: ' + esc_(r[I['First Name']] + ' ' + r[I['Family Name']]) + ' · ' +
        esc_(String(r[I.Phone]).replace(/^'/, '')) + ' · available: ' + esc_(r[I.Availability]) + '</li>').join('') +
      '</ul><p>Please contact them within ' + S_().HOURS_NOT_CONTACTED + 'h and fill in <i>Contacted</i>, <i>Interview Date</i> and <i>Interview Time</i> in ' +
      (b.fileUrl ? '<a href="' + b.fileUrl + '">your binome sheet</a>' : 'your binome sheet') +
      '.</p><p>In the interview form, use your binome code <b>' + code + '</b> and the interviewee code.</p>';
    b.members.forEach(m => { if (m.email) mail_(m.email, '[VIC Recruitment] New interviewee(s) for ' + code, html); });
  });
  ctx.mailNew = {};
}

/* ---------- the main cycle ---------- */

function runCycle_(opts) {
  return withLock_(() => {
    _settings = null;
    const ctx = loadCtx_();
    processRegistrations_(ctx);
    assignUnassigned_(ctx);
    processInterviews_(ctx);
    if (opts.pull) pullBinomeFiles_(ctx, opts.force);
    ctx.iv.data.forEach(r => { if (r[ctx.iv.I.Code]) r[ctx.iv.I.Status] = statusOf_(ctx, r); });
    if (opts.timing) timingAlerts_(ctx);
    saveTable_(ctx.iv);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    if (opts.tracker) buildTracker_(ctx);
    return ctx;
  }, opts.wait || 30000);
}

/** Trigger: any form linked to the master was submitted. */
function onFormSubmitHandler(e) { runCycle_({ pull: false, timing: false, tracker: true, wait: 120000 }); }

/** Trigger: every N minutes. Also available from the menu. */
function syncAll() { runCycle_({ pull: true, timing: true, tracker: true }); }
function syncAllForce() { runCycle_({ pull: true, force: true, timing: true, tracker: true }); toast_('Full sync done'); }

/* =============================================================================
 * SETUP, MENU AND MANUAL ACTIONS
 * ===========================================================================*/

function onOpen() {
  SpreadsheetApp.getUi().createMenu('VIC Recruitment')
    .addItem('1 · Import organizing team…', 'importTeam')
    .addItem('2 · Draft binomes (random, for review)', 'draftBinomes')
    .addItem('3 · Lock binomes & create their sheets', 'lockBinomes')
    .addSeparator()
    .addItem('Sync now', 'syncAllForce')
    .addItem('Reassign selected interviewee…', 'reassignSelected')
    .addItem('Mark selected alerts as resolved', 'resolveSelectedAlerts')
    .addItem('Re-share binome sheets with current members', 'reshareBinomeFiles')
    .addItem('Send me the digest now', 'sendDailyDigest')
    .addSeparator()
    .addItem('Run setup again (safe)', 'setup')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('MASTER_ID', ss.getId());
  ensureTabs_(ss);
  _settings = null;
  ss.setSpreadsheetTimeZone(S_().TIMEZONE);
  const formNotes = linkForms_(ss);
  installTriggers_(ss);
  cleanupAndOrder_(ss);
  runCycle_({ pull: false, timing: false, tracker: true });
  say_('Setup done ✅\n\n' + formNotes.join('\n') +
    '\n\nNext steps:\n1. Check the Settings tab (ADMIN_EMAIL etc.).\n2. VIC Recruitment › 1 · Import organizing team (or fill the Team tab).\n' +
    '3. VIC Recruitment › 2 · Draft binomes, review/edit them in the Binomes tab.\n4. VIC Recruitment › 3 · Lock binomes.\n5. Open the registration form.');
}

function ensureTabs_(ss) {
  const mk = (name, headers) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (headers) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
        .setBackground('#1f3864').setFontColor('#ffffff').setWrap(true);
      sh.setFrozenRows(1);
    }
    return sh;
  };
  // Settings
  const st = mk(TAB.SETTINGS, ['Setting', 'Value', 'What it does']);
  const have = {};
  if (st.getLastRow() > 1) st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().forEach(r => { have[r[0]] = true; });
  const add = SETTINGS_DEFAULTS.filter(r => !have[r[0]]).map(r => [r[0], r[0] === 'ADMIN_EMAIL' ? Session.getEffectiveUser().getEmail() : r[1], r[2]]);
  if (add.length) st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add);
  st.setColumnWidth(1, 260); st.setColumnWidth(2, 220); st.setColumnWidth(3, 620);

  // Team
  const tm = mk(TAB.TEAM, TEAM_H);
  tm.getRange('D2:D500').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['HR', 'IT', 'COMM', 'FLER', 'ALL', 'SKIP'], true).setAllowInvalid(false).build());
  tm.getRange('E2:E500').insertCheckboxes();
  tm.getRange(1, 5).setNote('Tick to leave this member out of the binomes (e.g. the president).');
  tm.getRange(1, 4).setNote('Pair As: HR = HR side of a binome; IT/COMM/FLER = other side; ALL = board member leading an "ALL" binome; SKIP = not interviewing.');
  // Binomes
  const bn = mk(TAB.BINOMES, BIN_H);
  bn.getRange('G2:G300').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['DRAFT', 'ACTIVE', 'PAUSED'], true).setAllowInvalid(false).build());
  bn.getRange(1, 7).setNote('DRAFT = not created yet · ACTIVE = receives interviewees · PAUSED = keeps its interviewees but gets no new ones.');
  bn.getRange(1, 6).setNote('Tag decides who they receive: "IT & HR" = IT and HR candidates, "ALL" = everyone.');
  // Interviewees (script-managed)
  const iv = mk(TAB.IV, IV_H);
  const I = idx_(IV_H);
  ['Code', 'Phone', 'Facebook', 'Discord', 'Year', 'Interview Date', 'Interview Time', 'Response Key'].forEach(h => {
    iv.getRange(2, I[h] + 1, iv.getMaxRows() - 1, 1).setNumberFormat('@');
  });
  ['Registered At', 'Assigned At', 'Contacted Seen At', 'Interview At', 'Interview Submitted At'].forEach(h => {
    iv.getRange(2, I[h] + 1, iv.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  });
  iv.setFrozenColumns(3);
  if (!iv.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    iv.protect().setDescription('Managed by the script — use the menu to reassign').setWarningOnly(true);
  }
  // Interview log
  const lg = mk(TAB.LOG, LOG_H);
  lg.getRange('C2:D').setNumberFormat('@');
  lg.getRange('A2:A').setNumberFormat('dd/mm/yyyy HH:mm');
  lg.getRange('G2:G').clearDataValidations();
  lg.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('FLAGGED').setBackground('#f4cccc').setRanges([lg.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('AUTOCORRECTED').setBackground('#fff2cc').setRanges([lg.getRange('G2:G')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('OK').setBackground('#d9ead3').setRanges([lg.getRange('G2:G')]).build(),
  ]);
  // Alerts
  const al = mk(TAB.ALERTS, ALERT_H);
  al.getRange('I2:I').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['OPEN', 'RESOLVED', 'AUTO-RESOLVED', 'AUTO-FIXED'], true).setAllowInvalid(true).build());
  al.getRange('B2:B').setNumberFormat('dd/mm/yyyy HH:mm'); al.getRange('J2:J').setNumberFormat('dd/mm/yyyy HH:mm');
  al.setColumnWidth(7, 520); al.getRange('G2:G').setWrap(true);
  al.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I2="OPEN",$C2="HIGH")').setBackground('#f4cccc').setRanges([al.getRange('A2:K')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($I2="OPEN",$C2="MEDIUM")').setBackground('#fce5cd').setRanges([al.getRange('A2:K')]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$I2<>"OPEN"').setFontColor('#999999').setRanges([al.getRange('A2:K')]).build(),
  ]);
  mk(TAB.TRACKER, null);
}

function linkForms_(ss) {
  const props = PropertiesService.getScriptProperties();
  const notes = [];
  [['REG', CONFIG.REGISTRATION_FORM_ID, TAB.REG_RESP], ['INT', CONFIG.INTERVIEW_FORM_ID, TAB.INT_RESP]].forEach(x => {
    const key = x[0] + '_SHEET_ID', id = x[1], name = x[2];
    const known = props.getProperty(key);
    if (known && ss.getSheets().some(sh => String(sh.getSheetId()) === known)) { notes.push('• ' + name + ': already linked'); return; }
    const form = FormApp.openById(id);
    try { if (/2025/.test(form.getTitle())) form.setTitle(form.getTitle().replace(/2025/g, '2026')); } catch (e) { /* ignore */ }
    if (x[0] === 'INT') {
      form.getItems().forEach(it => {
        const t = normText(it.getTitle());
        if (t.indexOf('binome code') >= 0) it.setHelpText('Your binome code, e.g. B.05 (it is in the title of your binome sheet).');
        if (t.indexOf('interviewee code') >= 0) it.setHelpText('The code in column A of your binome sheet, e.g. IT.58 or COMM.12.');
      });
    }
    let sheet = ss.getSheets().filter(sh => { const u = sh.getFormUrl(); return u && u.indexOf(id) >= 0; })[0];
    if (!sheet) {
      const before = ss.getSheets().map(sh => sh.getSheetId());
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
      SpreadsheetApp.flush();
      Utilities.sleep(1500);
      sheet = SpreadsheetApp.openById(ss.getId()).getSheets().filter(sh => before.indexOf(sh.getSheetId()) < 0)[0];
    }
    if (sheet) {
      sheet.setName(name);
      props.setProperty(key, String(sheet.getSheetId()));
      notes.push('• ' + name + ': linked to "' + form.getTitle() + '" → ' + form.getPublishedUrl());
    } else notes.push('• ' + name + ': ⚠️ could not find the response tab — run setup again.');
  });
  return notes;
}

function installTriggers_(ss) {
  const s = S_();
  const mine = ['onFormSubmitHandler', 'syncAll', 'sendDailyDigest'];
  ScriptApp.getProjectTriggers().forEach(t => { if (mine.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmitHandler').forSpreadsheet(ss).onFormSubmit().create();
  const allowed = [1, 5, 10, 15, 30];
  const want = num_(s.SYNC_EVERY_MINUTES, 15);
  const every = allowed.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(every).create();
  ScriptApp.newTrigger('sendDailyDigest').timeBased().atHour(Math.max(0, Math.min(23, num_(s.DIGEST_HOUR, 8))))
    .everyDays(1).inTimezone(s.TIMEZONE).create();
}

function cleanupAndOrder_(ss) {
  ss.getSheets().forEach(sh => {
    if (/^(Sheet1|Feuille 1|Feuille1)$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  [TAB.TRACKER, TAB.ALERTS, TAB.IV, TAB.BINOMES, TAB.TEAM, TAB.LOG, TAB.SETTINGS, TAB.REG_RESP, TAB.INT_RESP].forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  });
  ss.setActiveSheet(ss.getSheetByName(TAB.TRACKER));
}

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
  const sheets = ss.getSheets().filter(sh => [TAB.TEAM, TAB.BINOMES, TAB.IV].indexOf(sh.getName()) < 0);
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
  let src;
  if (!text && local) src = local;
  else {
    let id = text || CONFIG.TEAM_DB_DEFAULT_ID;
    const m = id.match(/\/d\/([a-zA-Z0-9_-]+)/); if (m) id = m[1];
    const ext = SpreadsheetApp.openById(id);
    src = findTeamSource_(ext) || ext.getSheets()[0];
  }
  const rows = teamRowsFrom_(src.getDataRange().getValues());
  const sh = ss_().getSheetByName(TAB.TEAM);
  const used = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().filter(r => String(r[0]).trim() || String(r[1]).trim()).length : 0;
  if (used) {
    const ok = ui.alert('Replace the Team tab?', 'The Team tab already has ' + used + ' members. Replace them with ' + rows.length + ' imported members?', ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TEAM_H.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, TEAM_H.length).setValues(rows);
  const count = {}; rows.forEach(r => { count[r[3]] = (count[r[3]] || 0) + 1; });
  const issues = rows.filter(r => r[5]).map(r => '• ' + r[0] + ': ' + r[5]);
  say_('Imported ' + rows.length + ' members from "' + src.getName() + '".\nPair As: ' + Object.keys(count).map(k => k + ' ' + count[k]).join(' · ') +
    (issues.length ? '\n\n⚠️ Check these rows (see Notes column):\n' + issues.join('\n') : '') +
    '\n\nReview "Pair As" (HR side / IT, COMM, FLER side / ALL = board lead / SKIP), tick "Exclude" for anyone not interviewing, then run "2 · Draft binomes".');
}

/** Team rows [name, email, dept, pairAs, exclude, notes] from a 2025-style database. */
function teamRowsFrom_(vals) {
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
    rows.push([name, email, p.dep, p.pairAs, false, notes.join('; ')]);
  }
  return rows;
}

function draftBinomes() {
  const res = withLock_(() => {
    const ctx = loadCtx_();
    const T = ctx.team.I, B = ctx.bin.I;
    const taken = {};
    ctx.binomes.filter(b => b.status !== 'DRAFT').forEach(b => b.members.forEach(m => { taken[m.email] = true; }));
    const members = ctx.team.data.filter(r => {
      const e = String(r[T.Email]).trim().toLowerCase();
      return e && !bool_(r[T.Exclude]) && !taken[e];
    }).map(r => {
      let pairAs = String(r[T['Pair As']]).trim().toUpperCase();
      if (!pairAs) pairAs = sectionToPair_(r[T.Department]).pairAs;
      return { name: String(r[T['Full Name']]).trim(), email: String(r[T.Email]).trim().toLowerCase(), pairAs: pairAs };
    }).filter(m => m.pairAs !== 'SKIP');
    const pairs = draftPairs(members, Math.random);
    const kept = ctx.bin.data.filter(r => String(r[B.Status]).toUpperCase() !== 'DRAFT' && String(r[B.Binome]).trim());
    let max = 0; kept.forEach(r => { const n = codeNum(r[B.Binome]); if (n > max) max = n; });
    const fresh = pairs.map((p, i) => {
      const row = new Array(BIN_H.length).fill('');
      row[B.Binome] = 'B.' + pad2(max + i + 1);
      row[B['Member 1']] = p.a.name; row[B['Email 1']] = p.a.email;
      row[B['Member 2']] = p.b ? p.b.name : ''; row[B['Email 2']] = p.b ? p.b.email : '';
      row[B.Tag] = p.tag; row[B.Status] = 'DRAFT';
      return { row: row, warning: p.warning };
    });
    const sh = ctx.bin.sh;
    if (sh.getLastRow() > 1) { sh.getRange(2, 1, sh.getLastRow() - 1, BIN_H.length).clearContent(); sh.getRange(2, 1, sh.getLastRow(), 1).clearNote().setBackground(null); }
    const all = kept.concat(fresh.map(f => f.row));
    if (all.length) sh.getRange(2, 1, all.length, BIN_H.length).setValues(all);
    fresh.forEach((f, i) => { if (f.warning) sh.getRange(kept.length + 2 + i, 1).setNote('⚠️ ' + f.warning).setBackground('#fce5cd'); else sh.getRange(kept.length + 2 + i, 1).setBackground(null); });
    const tags = {}; fresh.forEach(f => { tags[f.row[B.Tag]] = (tags[f.row[B.Tag]] || 0) + 1; });
    return { n: fresh.length, members: members.length, tags: tags, warnings: fresh.filter(f => f.warning).map(f => f.row[B.Binome] + ': ' + f.warning) };
  });
  if (!res) return say_('Busy, try again in a minute.');
  say_('Drafted ' + res.n + ' binomes from ' + res.members + ' available members.\n' +
    Object.keys(res.tags).map(k => k + ': ' + res.tags[k]).join(' · ') +
    (res.warnings.length ? '\n\n⚠️ To check:\n' + res.warnings.join('\n') : '') +
    '\n\nEdit the Binomes tab freely (swap people, change tags). Run "Draft binomes" again for a new random draw, or "3 · Lock binomes" when happy.');
}

function lockBinomes() {
  const ui = SpreadsheetApp.getUi();
  const t0 = Date.now();
  const pre = loadCtx_();
  const B = pre.bin.I;
  const drafts = pre.bin.data.filter(r => String(r[B.Status]).toUpperCase() === 'DRAFT' && String(r[B.Binome]).trim());
  if (!drafts.length) return say_('No DRAFT binomes to lock. Run "2 · Draft binomes" first (or add rows with Status DRAFT).');
  const seen = {}, problems = [];
  pre.bin.data.forEach(r => {
    [r[B['Email 1']], r[B['Email 2']]].forEach(e => {
      e = String(e).trim().toLowerCase(); if (!e) return;
      if (seen[e]) problems.push(e + ' is in both ' + seen[e] + ' and ' + r[B.Binome]); else seen[e] = r[B.Binome];
    });
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !String(r[B['Email 1']]).trim() && !String(r[B['Email 2']]).trim()) problems.push(r[B.Binome] + ' has no email');
    if (String(r[B.Status]).toUpperCase() === 'DRAFT' && !tagDepts(r[B.Tag]).length) problems.push(r[B.Binome] + ' has an unreadable tag "' + r[B.Tag] + '"');
  });
  const ok = ui.alert('Lock ' + drafts.length + ' binomes?',
    'This creates one sheet per binome in "Binome Sheets"' + (bool_(S_().SHARE_FILES_WITH_BINOME) ? ', shares it with both members (they get a Google share email)' : '') +
    ' and starts routing registrants to them.' + (problems.length ? '\n\n⚠️ Problems found:\n' + problems.join('\n') + '\n\nContinue anyway?' : ''), ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  let created = 0, stopped = false;
  withLock_(() => {
    const ctx = loadCtx_();
    const BI = ctx.bin.I;
    for (let i = 0; i < ctx.bin.data.length; i++) {
      const r = ctx.bin.data[i];
      if (String(r[BI.Status]).toUpperCase() !== 'DRAFT' || !String(r[BI.Binome]).trim()) continue;
      if (Date.now() - t0 > 270000) { stopped = true; break; }
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
  }, 60000);
  runCycle_({ pull: false, timing: false, tracker: true, wait: 60000 });
  say_('Locked ' + created + ' binomes ✅' + (stopped ? '\n\n⏱ Stopped early to avoid the 6-minute limit: run "3 · Lock binomes" again to finish the rest.' : '') +
    '\nWaiting registrants (if any) have been assigned.');
}

function reshareBinomeFiles() {
  const ctx = loadCtx_();
  let n = 0;
  ctx.binomes.filter(b => b.fileId && b.status !== 'DRAFT').forEach(b => {
    const f = DriveApp.getFileById(b.fileId);
    const current = f.getEditors().map(u => u.getEmail().toLowerCase());
    b.members.forEach(m => { if (m.email && current.indexOf(m.email) < 0) { try { f.addEditor(m.email); n++; } catch (e) { console.warn(e); } } });
  });
  say_('Done: ' + n + ' new share(s). (People removed from a binome keep access until you remove them in Drive.)');
}

/* ---------- interviewees & alerts ---------- */

function reassignSelected() {
  const ui = SpreadsheetApp.getUi();
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== TAB.IV) return say_('Select the interviewee\'s row in the "Interviewees" tab first.');
  const rowNum = sh.getActiveRange().getRow();
  const code = String(sh.getRange(rowNum, 1).getValue()).trim();
  if (rowNum < 2 || !code) return say_('This row has no interviewee code.');
  const resp = ui.prompt('Reassign ' + code, 'Move ' + code + ' to which binome? (e.g. B.07)\nTheir Contacted/Date/Notes are carried over.', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const pb = parseBinomeCode(resp.getResponseText());
  const msg = withLock_(() => {
    const ctx = loadCtx_();
    const I = ctx.iv.I;
    const r = ctx.ivByCode[code];
    const target = pb && ctx.binByCode[pb.code];
    if (!r) return 'Unknown code ' + code;
    if (!target || target.status === 'DRAFT') return 'Binome "' + resp.getResponseText() + '" not found or not locked yet.';
    if (r[I.Binome] === target.code) return code + ' is already in ' + target.code;
    const old = ctx.binByCode[r[I.Binome]];
    const carry = old ? removeFromBinomeFile_(ctx, old, code) : {};
    r[I.Binome] = target.code;
    r[I['Assigned At']] = ctx.now;
    appendToBinomeFile_(ctx, target, r, carry);
    r[I.Status] = statusOf_(ctx, r);
    ctx.mailNew[target.code] = [r];
    ctx.alerts.add({ severity: 'INFO', type: 'REASSIGNED', status: 'AUTO-FIXED', code: code, binome: target.code,
      msg: code + ' moved from ' + (old ? old.code : 'nobody') + ' to ' + target.code + ' by ' + Session.getActiveUser().getEmail(), key: '' });
    saveTable_(ctx.iv);
    ctx.alerts.flush();
    sendNewIntervieweeMails_(ctx);
    buildTracker_(ctx);
    return code + ' moved to ' + target.code + ' ✅';
  }, 60000);
  say_(msg || 'Busy, try again in a minute.');
}

function resolveSelectedAlerts() {
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== TAB.ALERTS) return say_('Select one or more rows in the "Alerts" tab first.');
  const I = idx_(ALERT_H);
  let n = 0;
  sh.getActiveRangeList().getRanges().forEach(rg => {
    for (let r = Math.max(2, rg.getRow()); r <= rg.getLastRow(); r++) {
      const cell = sh.getRange(r, I.Status + 1);
      if (cell.getValue() === 'OPEN') { cell.setValue('RESOLVED'); sh.getRange(r, I['Resolved At'] + 1).setValue(new Date()); n++; }
    }
  });
  toast_(n + ' alert(s) marked resolved');
}

/* ---------- daily digest ---------- */

function sendDailyDigest() {
  const ctx = runCycle_({ pull: true, timing: true, tracker: true, wait: 120000 }) || loadCtx_();
  const I = ctx.iv.I, A = ctx.alerts.table.I;
  const count = {}; ctx.iv.data.forEach(r => { count[r[I.Status]] = (count[r[I.Status]] || 0) + 1; });
  const open = ctx.alerts.table.data.filter(r => r[A.Status] === 'OPEN')
    .sort((a, b) => (SEV_RANK[b[A.Severity]] || 0) - (SEV_RANK[a[A.Severity]] || 0));
  const yesterday = new Date(ctx.now.getTime() - 24 * 3.6e6);
  const newRegs = ctx.iv.data.filter(r => r[I['Registered At']] instanceof Date && r[I['Registered At']] > yesterday).length;
  const newInts = ctx.iv.data.filter(r => r[I['Interview Submitted At']] instanceof Date && r[I['Interview Submitted At']] > yesterday).length;
  const perBinome = {}; open.forEach(r => { if (r[A.Binome]) perBinome[r[A.Binome]] = (perBinome[r[A.Binome]] || 0) + 1; });
  const lag = Object.keys(perBinome).sort((a, b) => perBinome[b] - perBinome[a]).slice(0, 8);
  const statusLine = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED, ST.INTERVIEWED, ST.WITHDRAWN, ST.UNASSIGNED, ST.DUPLICATE]
    .map(s => s.charAt(0) + s.slice(1).toLowerCase() + ': <b>' + (count[s] || 0) + '</b>').join(' · ');
  const html = '<div style="font-family:Arial;font-size:13px">' +
    '<h3 style="margin:0 0 8px">VIC Recruitment · daily digest (' + fmt_(ctx.now, 'EEE dd/MM') + ')</h3>' +
    '<p>Last 24h: <b>' + newRegs + '</b> new registrations · <b>' + newInts + '</b> interviews submitted</p>' +
    '<p>' + statusLine + '</p>' +
    (lag.length ? '<p><b>Binomes with the most open alerts:</b> ' + lag.map(b => b + ' (' + perBinome[b] + ')').join(', ') + '</p>' : '') +
    '<h4 style="margin:12px 0 4px">Open alerts (' + open.length + ')</h4>' +
    (open.length ? '<table cellpadding="5" style="border-collapse:collapse">' + open.slice(0, 60).map(r =>
      '<tr style="border-bottom:1px solid #ddd"><td>' + esc_(r[A.ID]) + '</td><td><b style="color:' + (r[A.Severity] === 'HIGH' ? '#c62828' : r[A.Severity] === 'MEDIUM' ? '#ef6c00' : '#555') + '">' +
      esc_(r[A.Severity]) + '</b></td><td>' + esc_(r[A.Type]) + '</td><td>' + esc_(r[A.Binome]) + '</td><td>' + esc_(r[A.Message]) + '</td></tr>').join('') +
      '</table>' + (open.length > 60 ? '<p>…and ' + (open.length - 60) + ' more.</p>' : '') : '<p>Nothing open 🎉</p>') +
    '<p><a href="' + ss_().getUrl() + '">Open the master sheet</a></p></div>';
  adminEmails_().forEach(e => mail_(e, '[VIC Recruitment] Daily digest: ' + open.length + ' open alert' + (open.length === 1 ? '' : 's'), html));
}
