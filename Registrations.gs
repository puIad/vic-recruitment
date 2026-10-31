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
    attend: find(h => h.indexOf('will you be able to attend') >= 0),
    discover: find(h => h.indexOf('discover') >= 0),
    whyVic: find(h => h.indexOf('why do you want to be part') >= 0),
    clubs: find(h => h.indexOf('other clubs') >= 0),
    motiv: {},
    deptQ: {}, // dept -> columns of that department's own questions (between its "why" and the next section)
  };
  n.forEach((h, i) => { const m = h.match(/why did you choose the (\w+) department/); if (m && DEPT_ALIASES[m[1]]) H.motiv[DEPT_ALIASES[m[1]]] = i; });
  const stop = {};
  [H.avail, H.anything, H.attend].concat(Object.keys(H.motiv).map(d => H.motiv[d])).forEach(i => { if (i >= 0) stop[i] = true; });
  Object.keys(H.motiv).forEach(d => { const q = []; for (let i = H.motiv[d] + 1; i < n.length && !stop[i]; i++) q.push(i); H.deptQ[d] = q; });
  return H;
}

/** The registration answers shown in the binome sheet but not used by the routing. */
function regExtras_(H, head, row, dep) {
  const get = i => (i >= 0 ? row[i] : '');
  const qs = (H.deptQ[dep] || []).filter(i => String(row[i]).trim()).map(i => String(head[i]).trim() + ' ' + String(row[i]).trim());
  return { 'Birth Date': get(H.birth), 'Discovered VIC': get(H.discover), 'Why VIC': get(H.whyVic), 'Other Clubs': get(H.clubs),
    'Department Questions': qs.join('\n') };
}
const REG_EXTRAS = ['Birth Date', 'Discovered VIC', 'Why VIC', 'Other Clubs', 'Department Questions'];

function responseSheet_(which) {
  const id = PropertiesService.getScriptProperties().getProperty(which === 'REG' ? 'REG_SHEET_ID' : 'INT_SHEET_ID');
  const name = which === 'REG' ? TAB.REG_RESP : TAB.INT_RESP;
  const sheets = ss_().getSheets();
  for (let i = 0; i < sheets.length; i++) if (String(sheets[i].getSheetId()) === id) return sheets[i];
  return ss_().getSheetByName(name);
}

/** A response's timestamp as epoch ms. The /apply form writes it RAW, as a sheet serial (wall clock in TIMEZONE): the cell
 *  reads as that number until it gets a date format and as a Date after, and both must give one key, or the
 *  registration is imported twice (live 2026-10-26). */
function keyTime_(ts) {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts !== 'number') return String(ts);
  const wall = Math.round((ts - 25569) * 864e5);
  return wall - tzOffsetMs_(new Date(wall));
}
function tzOffsetMs_(d, tz) {
  const m = Utilities.formatDate(d, tz || S_().TIMEZONE, 'XXX').match(/([+-])(\d\d):(\d\d)/); // 'Z' for UTC
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 6e4 : 0;
}

function responseKey_(ts, email, r) {
  return keyTime_(ts) + '|' + String(email || '').trim().toLowerCase() + (email ? '' : '|r' + r);
}

/** The key a registration got before keyTime_, while its cell read as the serial: that number, or for a cell that is a
 *  Date by now the same float the /apply form wrote (VIC-ENP sheetSerial), so rows imported that way are still known.
 *  '' without an email (those keys hold the row). */
function serialKey_(ts, email) {
  if (!email || !(ts instanceof Date || typeof ts === 'number')) return '';
  const serial = typeof ts === 'number' ? ts : (ts.getTime() + tzOffsetMs_(ts)) / 864e5 + 25569;
  return String(serial) + '|' + String(email).trim().toLowerCase();
}

function loads_(ctx) {
  const I = ctx.iv.I, mode = String(S_().BALANCE_BY).toUpperCase();
  const load = {};
  ctx.iv.data.forEach(r => {
    const b = r[I.Binome]; if (!b) return;
    if (mode === 'TOTAL' ? !isOut_(r[I.Status]) : PENDING_STATUSES.indexOf(r[I.Status]) >= 0) load[b] = (load[b] || 0) + 1;
  });
  return load;
}

/** Codes in use: the tab's, those of rows deleted by hand that the baseline keeps for Revert, and those of deleted
 *  applications (never handed out again). */
function usedCodes_(ctx) {
  const held = ctx.base ? Object.keys(ctx.base.iv).map(k => ctx.base.iv[k] && ctx.base.iv[k].Code).filter(Boolean) : [];
  return Object.keys(ctx.ivByCode).concat(held, heldCodes_());
}
function heldCodes_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('HELD_CODES') || '[]'); } catch (e) { return []; }
}
function holdCode_(code) {
  const all = heldCodes_();
  if (all.indexOf(code) < 0) PropertiesService.getScriptProperties().setProperty('HELD_CODES', JSON.stringify(all.concat(code)));
}

/** Give a binome (and a code if missing) to an Interviewees row. Returns true if assigned. */
function assignRow_(ctx, r) {
  const I = ctx.iv.I, s = S_();
  const dep = String(r[I['1st Choice']]).trim();
  if (DEPTS.indexOf(dep) < 0) return false;
  if (!r[I.Code]) {
    r[I.Code] = nextCode(dep, usedCodes_(ctx));
    ctx.ivByCode[r[I.Code]] = r;
  }
  if (!bool_(s.ASSIGNMENTS_OPEN)) return false;
  const load = loads_(ctx), bad = ctx.badBinomes || (ctx.badBinomes = {});
  const cands = activeBinomes_(ctx).filter(b => !bad[b.code]).map(b => ({ code: b.code, tag: b.tag, load: load[b.code] || 0, b: b }));
  const pick = pickBinome(dep, cands, num_(s.ALL_BINOME_WEIGHT, 1), num_(s.HR_ONLY_WEIGHT, 1));
  if (!pick) return false;
  // a sheet that refuses the write leaves the candidate UNASSIGNED and is skipped for the rest of the run: it must not stop the cycle
  try { appendToBinomeFile_(ctx, pick.b, r); } catch (e) {
    bad[pick.code] = true;
    ctx.alerts.add({ severity: 'HIGH', type: 'FILE_ERROR', binome: pick.code, msg: 'Cannot write ' + r[I.Code] + ' into the file of ' + pick.code + ': ' + e, key: 'FILE|' + pick.code });
    return false;
  }
  r[I.Binome] = pick.code;
  r[I.Status] = ST.ASSIGNED;
  r[I['Assigned At']] = ctx.now;
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
  const byKey = {};
  ctx.iv.data.forEach(x => { if (x[I['Response Key']]) byKey[x[I['Response Key']]] = x; });
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const ts = get(row, H.ts);
    if (!ts) continue;
    const collected = String(get(row, H.collected)).trim().toLowerCase();
    const typed = String(get(row, H.typed)).trim();
    let key = responseKey_(ts, collected || typed, r + 1);
    const old = ctx.ivKeys[key] ? '' : serialKey_(ts, collected || typed);
    // imported under its serial (before 2026-10-26's fix): the same registration, whether its row is there, deleted by hand or being restored
    if (old && (ctx.ivKeys[old] || (ctx.restore ? ctx.restore[old] : ctx.base && old in ctx.base.iv))) key = old;
    if (ctx.ivKeys[key]) {
      // rows imported before these columns existed (or with one cleared) get the blank ones from the registration
      const x = byKey[key];
      if (x && REG_EXTRAS.some(h => x[I[h]] === '')) {
        const e = regExtras_(H, data[0], row, normDept(get(row, H.c1)));
        REG_EXTRAS.forEach(h => { if (x[I[h]] === '') x[I[h]] = e[h]; });
      }
      continue;
    }
    // a row deleted by hand stays aside (MANUAL_EDIT) instead of coming back with a new code; Revert restores it (ctx.restore)
    if (ctx.restore ? !ctx.restore[key] : ctx.base && key in ctx.base.iv) continue;

    const c1raw = String(get(row, H.c1)).trim();
    const rec = { ts: ts, collected: collected, typedEmail: typed, first: String(get(row, H.first)).trim(),
      family: String(get(row, H.family)).trim(), birth: get(row, H.birth), phone: get(row, H.phone),
      c1: normDept(c1raw), c1raw: c1raw, c2: normDept(get(row, H.c2)) };
    // family name typed as the first name and the other way round, as the ENP email shows: put right (owner, 2026-10-15)
    const swapped = namesSwapped(rec.first, rec.family, collected || typed);
    if (swapped) { const f = rec.first; rec.first = rec.family; rec.family = f; }
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
    const extra = regExtras_(H, data[0], row, rec.c1);
    REG_EXTRAS.forEach(h => { out[I[h]] = extra[h]; });
    out[I['Interview Done']] = false;
    out[I.Flags] = (swapped ? ['NAMES_SWAPPED'] : []).concat(chk.alerts.map(a => a.type)).join(', ');
    const scr = screenOn_() ? screenNew_(ctx, H, row, rec) : null;
    if (scr) { out[I.Risk] = scr.member ? '' : scr.score; out[I.Screening] = scr.note; }
    out[I['Response Key']] = key;
    out[I.Status] = ST.UNASSIGNED;
    ctx.iv.data.push(out);
    ctx.ivKeys[key] = true;
    if (ctx.restore) {
      const old = ctx.restore[key];
      out[I.Code] = old.Code; out[I.Binome] = old.Binome;
      out[I['Assigned At']] = old['Assigned At'] ? new Date(old['Assigned At']) : ''; // older baselines lack it: empty, as before
      if (old['Interview Submitted At']) out[I['Interview Submitted At']] = new Date(old['Interview Submitted At']);
      out[I['Interview Log Row']] = old['Interview Log Row'] ? Number(old['Interview Log Row']) : '';
      out[I.Screening] = old.Screening || out[I.Screening];
      out[I.Status] = old.Status; // out and on hold stay so (statusOf_ keeps them); the others are computed again
      out[I.Status] = statusOf_(ctx, out);
      if (out[I.Code]) ctx.ivByCode[out[I.Code]] = out;
      continue;
    }

    ctx.confirm.push(out); // the confirmation filters by the status this run ends with
    const named = (rec.first + ' ' + rec.family).trim();
    if (scr && scr.member) {
      // a VIC member: out, silently (no alert mail, no binome mail); one line in the history so admins can audit it
      out[I.Status] = ST.DECLINED;
      if (rec.c1) { out[I.Code] = nextCode(rec.c1, usedCodes_(ctx)); ctx.ivByCode[out[I.Code]] = out; }
      ctx.alerts.add({ severity: 'INFO', type: 'VIC_MEMBER_DECLINED', status: 'AUTO-FIXED', code: out[I.Code] || named, binome: '',
        msg: (out[I.Code] || named) + ' (' + out[I.Email] + ') is on the VIC members list: declined silently, nobody was emailed.', key: '' });
      continue;
    }
    if (chk.duplicateOf) {
      out[I.Status] = ST.DUPLICATE;
    } else if (scr && scr.hold) {
      // waits for an admin (screenWaiting_ raises NEEDS_REVIEW); a code so alerts and quick actions can point at it
      out[I.Status] = ST.HELD;
      if (rec.c1) { out[I.Code] = nextCode(rec.c1, usedCodes_(ctx)); ctx.ivByCode[out[I.Code]] = out; }
    } else if (rec.c1) {
      assignRow_(ctx, out);
    }
    const label = out[I.Code] || named;
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

/** Place the waiting interviewees until stopAt (ms): each is a write to a binome sheet, and a run must end before Google's
 *  6 minutes. The rest wait for the next sync (ctx.leftWaiting counts them). */
function assignUnassigned_(ctx, stopAt) {
  const I = ctx.iv.I;
  ctx.leftWaiting = 0;
  if (!bool_(S_().ASSIGNMENTS_OPEN) || !activeBinomes_(ctx).length) return;
  ctx.iv.data.forEach(r => {
    if (r[I.Status] !== ST.UNASSIGNED) return;
    if (Date.now() < stopAt) assignRow_(ctx, r); else ctx.leftWaiting++;
  });
}

/* ---------- the registrant's confirmation (owner, 2026-10-17) ---------- */

// not HELD (owner, 2026-10-26): a held applicant hears nothing until an admin approves them (reviewRow_ queues it then)
const CONFIRM_STATUSES = [ST.UNASSIGNED].concat(PENDING_STATUSES);

/** Before the save: keeps in ctx.confirm the registrations read this run that get a confirmation (a code, waiting or
 *  assigned, a usable email and first name) and stamps them "CONFIRMED <date>" in Flags as the record. Only rows
 *  read this run, or approved / restored this run and never confirmed, are queued, so nobody is mailed twice.
 *  shortcut: stamped before the send, so a send that fails (quota) is not retried; mail_ logs it. */
function stampConfirmations_(ctx) {
  const I = ctx.iv.I;
  ctx.confirm = !bool_(S_().CONFIRM_REGISTRANTS) ? [] : ctx.confirm.filter(r => r[I.Code] && CONFIRM_STATUSES.indexOf(r[I.Status]) >= 0 &&
    /\p{L}/u.test(String(r[I['First Name']])) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r[I.Email]).trim())); // a letter in any script
  ctx.confirm.forEach(r => { r[I.Flags] = (r[I.Flags] ? r[I.Flags] + ', ' : '') + 'CONFIRMED ' + fmt_(ctx.now, 'dd/MM/yyyy'); });
}

/** After the save, like the new-interviewee mail. TEST_MODE: mail_ keeps it to the admins. */
function sendConfirmations_(ctx) {
  const I = ctx.iv.I;
  ctx.confirm.forEach(r => mailSend_(String(r[I.Email]).trim(),
    mailFrom_('CONFIRM', { first: String(r[I['First Name']]).trim(), code: String(r[I.Code]) }, { dept: r[I['1st Choice']] }), String(r[I.Code])));
  ctx.confirm = [];
}
