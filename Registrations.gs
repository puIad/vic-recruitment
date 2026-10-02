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
    // a row deleted by hand stays aside (MANUAL_EDIT) instead of coming back with a new code; Revert restores it (ctx.restore)
    if (ctx.restore ? !ctx.restore[key] : ctx.base && key in ctx.base.iv) continue;

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
    if (ctx.restore) {
      const old = ctx.restore[key];
      out[I.Code] = old.Code; out[I.Binome] = old.Binome;
      out[I.Status] = old.Status === ST.DUPLICATE ? ST.DUPLICATE : statusOf_(ctx, out);
      if (out[I.Code]) ctx.ivByCode[out[I.Code]] = out;
      continue;
    }

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
