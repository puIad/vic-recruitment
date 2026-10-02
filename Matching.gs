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
 *         interviewees:[{code,binome,name,firstChoice}], interviewed:{code:true}, nameByEmail:{},
 *         former:{binomeCode:[emails of members who left it]}}
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
  const wasMember = b => ((ctx.former || {})[b.code] || []).indexOf(sub) >= 0;
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
      const trusted = (ctx.trustedBackups || []).indexOf(sub) >= 0, former = wasMember(assigned);
      flag(trusted || former ? 'INFO' : 'MEDIUM', 'BACKUP_INTERVIEWER', iv.code + ' interviewed under ' + assigned.code + ' but the form was sent by ' +
        subName + (former ? ', a former member of that binome.' : ', who is not in that binome (backup interviewer?).'), assigned.code, false);
    }
  } else if (isMember(assigned, sub)) {
    out.binome = assigned.code; corrected = true; substantive = true;
    out.notes.push('Binome corrected from "' + (tB || 'empty') + '" to ' + assigned.code + ' (submitter is a member)');
  } else if (wasMember(assigned)) {
    out.binome = assigned.code; corrected = true; substantive = true;
    out.notes.push('Binome corrected from "' + (tB || 'empty') + '" to ' + assigned.code + ' (submitter is a former member of it)');
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
