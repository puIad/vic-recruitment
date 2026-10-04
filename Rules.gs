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

/** Tag of a hand-made pair, as the draft gives it: 'ALL' with a board lead, else 'IT & HR', 'HR', 'IT & COMM', 'IT'. */
function pairTag(a, b) {
  if (a === 'ALL' || b === 'ALL') return 'ALL';
  if (a === b) return a;
  if (b === 'HR') return a + ' & HR';
  if (a === 'HR') return b + ' & HR';
  return a + ' & ' + b;
}

/**
 * Team members who should interview but sit in no ACTIVE/PAUSED binome (after lock nobody is auto-paired again).
 * team: [{name,email,pairAs,exclude}] ; binomes: [{code,status,members:[{email}]}]
 * returns [{name,email,pairAs,draft}] (draft = code of a DRAFT row they sit in, waiting for Lock)
 */
function unpairedMembers(team, binomes) {
  const locked = {}, draft = {};
  binomes.forEach(b => b.members.forEach(m => {
    if (!m.email) return;
    if (b.status === 'ACTIVE' || b.status === 'PAUSED') locked[m.email] = true;
    else if (!draft[m.email]) draft[m.email] = b.code;
  }));
  return team.filter(m => m.email && !m.exclude && m.pairAs !== 'SKIP' && !locked[m.email])
    .map(m => ({ name: m.name, email: m.email, pairAs: m.pairAs, draft: draft[m.email] || '' }));
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
