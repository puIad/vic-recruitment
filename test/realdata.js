// Simulation on real data: OT Database (pairing + routing of 2025 registrations) and 2025 interview forms (validation)
const fs = require('fs'), vm = require('vm');
const R = JSON.parse(fs.readFileSync(__dirname + '/../data/ranges.json', 'utf8'));
const REG_AK = JSON.parse(fs.readFileSync(__dirname + '/../data/reg_AK.json', 'utf8')).values;
const OUT = {};

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function newCtx(seed) {
  const M = Object.create(Math); M.random = seeded(seed);
  const c = vm.createContext({ console: { log() {}, warn() {}, error: console.error }, Proxy, JSON, Math: M });
  vm.runInContext(fs.readFileSync(__dirname + '/mockgas.js', 'utf8'), c);
  require('./gs')(c);
  c.REG_H = R["'Registration Responses'!A1:AN3"].values[0];
  c.INT_H = R["'Interview Responses'!A1:AS2"].values[0];
  vm.runInContext(`
    __forms[CONFIG.REGISTRATION_FORM_ID] = new MockForm(CONFIG.REGISTRATION_FORM_ID, 'VIC Registrations Form 2026', REG_H);
    __forms[CONFIG.INTERVIEW_FORM_ID] = new MockForm(CONFIG.INTERVIEW_FORM_ID, 'Interview Form 2026', INT_H);
    var master = new MockSS('Master'); SpreadsheetApp._active = master;`, c);
  return c;
}
const run = (c, code) => vm.runInContext(code, c);
const parseTs = (s, order) => {           // order 'dmy' or 'mdy' preferred
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  let a = +m[1], b = +m[2];
  let d, mo;
  if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else if (order === 'dmy') { d = a; mo = b; } else { mo = a; d = b; }
  return Date.UTC(+m[3], mo - 1, d, +m[4] - 1, +m[5], +m[6]); // Algiers = UTC+1
};

/* ===================== RUN A: pairing + routing ===================== */
const A = newCtx(2026);
A.OT = R["'OT Database'!A1:Z200"].values;
run(A, `var ot = master.insertSheet('OT Database'); ot.cells = OT.map(r => r.slice());`);
run(A, 'setup()');
run(A, '__uiQueue.push(""); importTeam()');
OUT.importMsg = run(A, '__uiLog.filter(x=>/Imported/.test(x)).slice(-1)[0]');
run(A, 'draftBinomes()');
OUT.draftMsg = run(A, '__uiLog.filter(x=>/Drafted/.test(x)).slice(-1)[0]');
run(A, 'lockBinomes()');
OUT.team = run(A, 'master.getSheetByName("Team").getDataRange().getValues()').filter(r => r[0] || r[1]);
OUT.binomes = run(A, 'master.getSheetByName("Binomes").getDataRange().getValues()').filter(r => r[0]);
OUT.binNotes = run(A, 'JSON.stringify(master.getSheetByName("Binomes").notes)');

// feed 2025 registrations
const OP = R['RAW!O1:P374'].values, AF = R['RAW!AF1:AF374'].values;
const regRows = [];
for (let i = 1; i < REG_AK.length; i++) {
  const row = new Array(A.REG_H.length).fill('');
  REG_AK[i].forEach((v, j) => { row[j] = v; });
  row[0] = parseTs(REG_AK[i][0], 'dmy');
  const op = OP[i] || []; row[14] = op[0] || ''; row[15] = op[1] || '';
  row[31] = (AF[i] || [])[0] || '';
  regRows.push(row);
}
A.REGROWS = regRows;
run(A, `var reg = master.getSheetByName('Registration Responses'); REGROWS.forEach(r => { r[0] = new Date(r[0]); reg.cells.push(r); });`);
const t0 = Date.now();
run(A, '__outbox.length = 0; onFormSubmitHandler({})');
OUT.regMs = Date.now() - t0;
OUT.iv = run(A, 'master.getSheetByName("Interviewees").getDataRange().getValues()');
OUT.alertsA = run(A, 'master.getSheetByName("Alerts").getDataRange().getValues()');
OUT.trackerA = run(A, 'master.getSheetByName("Tracker").getDataRange().getValues()');
OUT.mailsA = run(A, '__outbox.map(m => m.to + " | " + m.subject)');

/* ===================== RUN B: 2025 interview forms vs 2025 binomes ===================== */
const B = newCtx(7);
run(B, 'setup()');
const bin25 = R['Sheet1!A1:D52'].values.slice(2).filter(r => /^B\.\d+/.test(r[0]));
const otEmails = R["'OT Database'!A1:Z200"].values.slice(1).map(r => r[3]).filter(e => e && /@/.test(e));
const ints = R['Responses!A1:D368'].values.slice(1);
const pool = Array.from(new Set(otEmails.concat(ints.map(r => r[1])).map(e => String(e).trim().toLowerCase())));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MANUAL = { 'maroua abderrezzak': 'maroua.abd_errezzak@g.enp.edu.dz', 'abdelkader zerouk': 'abdelkader.zerrouk@g.enp.edu.dz', 'khadidja benlaredj': 'khadidjabenlaaradj@gmail.com', 'meriem maarouf': 'meriem.marouf@g.enp.edu.dz' };
function emailFor(name) {
  if (MANUAL[norm(name)]) return MANUAL[norm(name)];
  const toks = norm(name).split(' ').filter(t => t.length >= 3);
  let best = null, bestScore = 0, tie = false;
  pool.forEach(e => {
    const local = norm(e.split('@')[0]).split(' ');
    let hits = 0; toks.forEach(t => { if (local.some(l => l === t || (t.length >= 5 && l.length >= 5 && (l.startsWith(t.slice(0, 5)) || t.startsWith(l.slice(0, 5)))))) hits++; });
    if (hits > bestScore) { best = e; bestScore = hits; tie = false; } else if (hits === bestScore && hits > 0) tie = true;
  });
  return bestScore >= 2 || (bestScore === 1 && !tie) ? best : '';
}
const binRows = bin25.map(r => {
  const row = ['', '', '', '', '', '', '', '', '', ''];
  row[0] = r[0].trim(); row[1] = r[1].trim(); row[2] = emailFor(r[1]); row[3] = r[2].trim(); row[4] = emailFor(r[2]);
  row[5] = r[3].trim(); row[6] = 'ACTIVE';
  return row;
});
OUT.bin25 = binRows;
const rep = R['Sheet1!A1:F279'].values.slice(1), repP = R['Sheet1!P1:P279'].values.slice(1);
let cur = '';
const IVH = vm.runInContext('IV_H', B);
const ivRows = [];
rep.forEach((r, i) => {
  if (!/^(IT|HR|COMM|FLER)\.\d+/.test(r[1] || '')) return;
  if (r[0]) cur = r[0].trim();
  const o = new Array(IVH.length).fill('');
  const I = k => IVH.indexOf(k);
  o[I('Code')] = r[1]; o[I('Binome')] = cur; o[I('Status')] = 'ASSIGNED';
  o[I('Registered At')] = parseTs(r[2], 'mdy'); o[I('First Name')] = r[3]; o[I('Family Name')] = r[4]; o[I('Email')] = String(r[5]).toLowerCase();
  o[I('1st Choice')] = (repP[i] || [])[0] || String(r[1]).split('.')[0]; o[I('Response Key')] = 'seed|' + i;
  ivRows.push(o);
});
B.BINROWS = binRows; B.IVROWS = ivRows;
const intI = R['Responses!I1:I368'].values.slice(1);
B.INTROWS = ints.map((r, i) => { const o = new Array(B.INT_H.length).fill(''); o[0] = parseTs(r[0], 'mdy'); o[1] = r[1]; o[2] = r[2]; o[3] = r[3]; o[8] = (intI[i] || [])[0] || ''; return o; });
run(B, `
  var bs = master.getSheetByName('Binomes'); BINROWS.forEach(r => bs.cells.push(r));
  var ivs = master.getSheetByName('Interviewees'); IVROWS.forEach(r => { if (r[3]) r[3] = new Date(r[3]); ivs.cells.push(r); });
  var ir = master.getSheetByName('Interview Responses'); INTROWS.forEach(r => { r[0] = new Date(r[0]); ir.cells.push(r); });
  __outbox.length = 0; onFormSubmitHandler({});`);
OUT.log = run(B, 'master.getSheetByName("Interview Log").getDataRange().getValues()');
OUT.alertsB = run(B, 'master.getSheetByName("Alerts").getDataRange().getValues()');
OUT.mailsB = run(B, '__outbox.map(m => m.to + " | " + m.subject)');

fs.writeFileSync(__dirname + '/../data/sim_out.json', JSON.stringify(OUT, (k, v) => v, 1));
console.log('done; registration batch took', OUT.regMs, 'ms');
