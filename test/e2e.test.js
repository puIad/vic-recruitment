// End-to-end simulation of the whole flow against the mock services
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console, Proxy, JSON, Math });
vm.runInContext(fs.readFileSync(__dirname + '/mockgas.js', 'utf8'), ctx);
require('./gs')(ctx);
const run = code => vm.runInContext(code, ctx);

run(`
var REG_H = ["Timestamp","Email address","First Name","Family Name","E-mail Address","Birth Date","Phone Number","Facebook Link","Discord Username  ","Field of Study ","Year of Study","How did you discover VIC?","Why do you want to be part of the Vision & Innovation Club family?","Have you had previous experience in other clubs? If yes, please mention them.  ","What's your first department choice?","What's your 2nd department choice?","Why did you choose the IT Department as your top preference?  ","Do you have any experience with Graphic Design?","Why did you choose the COMM Department as your top preference?  ","Why did you choose the HR Department as your top preference?  ","Why did you choose the FLER Department as your top preference?  ","Which days or times are you usually available for an interview?  ","Will you be able to attend your interview on time once the date is shared?  ","Anything to add?"];
var INT_H = ["Timestamp","Email Address","Your Binôme Code\\n(B1 , B2 , B3 , B4,...)","Interviewee Code\\n(COMM.12, IT.58, HR.23,...)","Introduce yourself","Their 1st Department Choice","Final Main Department Affectation","Anything to add?"];
__forms[CONFIG.REGISTRATION_FORM_ID] = new MockForm(CONFIG.REGISTRATION_FORM_ID, 'VIC Registrations Form 2025', REG_H);
__forms[CONFIG.INTERVIEW_FORM_ID] = new MockForm(CONFIG.INTERVIEW_FORM_ID, 'Interview Form 2025', INT_H);
var master = new MockSS('Master'); SpreadsheetApp._active = master;
// team database laid out like 2025
var db = new MockSS('DB'); __files[CONFIG.TEAM_DB_DEFAULT_ID] = __files[db.id]; __files[CONFIG.TEAM_DB_DEFAULT_ID].obj = db;
db.sheets[0].cells = [["","First Name","Last Name ","Email Adress","Phone"],
 ["Committe Board","Aymene","KHALED","aymene@g.enp.edu.dz",""],["","Romaissa","BOUTELDJA","romaissa@g.enp.edu.dz",""],
 ["Council Board","Sabrina","AKNINE","sabrina@g.enp.edu.dz",""],
 ["FLER","Yasmine","AIT AHMED","yasmine@g.enp.edu.dz",""],["","Hadjer","KHIER","hadjer@g.enp.edu.dz",""],
 ["COMM","Aya","GHARBI","aya@g.enp.edu.dz",""],
 ["HR","Ikram","MAHI","ikram@g.enp.edu.dz",""],["","Zineb","TAIBI","zineb@g.enp.edu.dz",""],["","Djamila","CHERIFI","djamila@g.enp.edu.dz",""],["","Rami","AHMANE","rami@g.enp.edu.dz",""],
 ["IT","Sara","BOUZNAD","sara@g.enp.edu.dz",""],["","Marya","DJALAB","marya@g.enp.edu.dz",""],["","Madjid","MEDJKANE","madjid@g.enp.edu.dz",""]];
`);

run('setup()');
const tabs = run('master.getSheets().map(s=>s.getName())');
console.log('Tabs:', tabs.join(' | '));
assert(tabs.includes('Registration Responses') && tabs.includes('Interview Responses') && tabs.includes('Tracker'));
assert.strictEqual(run('__forms[CONFIG.REGISTRATION_FORM_ID].title'), 'VIC Registrations Form 2026');
// re-running setup refreshes stale descriptions but keeps edited values
run(`var _st = master.getSheetByName("Settings"); var _r = _st.getDataRange().getValues().findIndex(r => r[0] === "HOURS_NOT_CONTACTED") + 1;
  _st.getRange(_r, 2, 1, 2).setValues([[36, "old text"]]); setup();`);
assert.strictEqual(run('JSON.stringify(_st.getRange(_r, 2, 1, 2).getValues()[0])'),
  JSON.stringify([36, run('SETTINGS_DEFAULTS.find(r => r[0] === "HOURS_NOT_CONTACTED")[2]')]));
run('_st.getRange(_r, 2).setValue(24)');

run('__uiQueue.push(""); importTeam()');
const team = run('master.getSheetByName("Team").getDataRange().getValues().slice(1)');
console.log('Team:', team.map(r => r[0] + ':' + r[3]).join(', '));
assert.strictEqual(team.length, 13);

run('draftBinomes()');
let bins = run('master.getSheetByName("Binomes").getDataRange().getValues().slice(1)');
console.log('Drafted:', bins.map(r => r[0] + ' ' + r[1] + '+' + r[3] + ' [' + r[5] + ']').join(' ; '));
run('lockBinomes()');
bins = run('master.getSheetByName("Binomes").getDataRange().getValues().slice(1)');
assert(bins.every(r => r[6] === 'ACTIVE' && r[8]), 'all active with files');
console.log('Locked:', bins.length, 'binomes, files in folder:', run('Object.keys(__files).filter(k=>__files[k].parent===CONFIG.BINOME_FOLDER_ID).length'));
console.log(run('__uiLog.slice(-1)[0]'));

// ---- registrations (3 days ago so timing alerts fire) ----
run(`
var reg = master.getSheetByName('Registration Responses');
function regRow(ts, collected, first, fam, typed, birth, phone, c1, c2) {
  var r = new Array(REG_H.length).fill('');
  r[0]=ts; r[1]=collected; r[2]=first; r[3]=fam; r[4]=typed; r[5]=birth; r[6]=phone; r[14]=c1; r[15]=c2; r[16]= c1==='IT'?'I love tech':''; r[17]= c1==='IT'?'Yes':''; r[12]='To learn'; r[19]= c1==='HR'?'People!':''; r[21]='Sunday, Tuesday';
  return r;
}
var old = new Date(Date.now() - 3*24*3600e3);
reg.cells.push(regRow(old,'a1@g.enp.edu.dz','Amine','Test','a1@g.enp.edu.dz','12/06/2006','554781447','IT','HR'));
reg.cells.push(regRow(old,'k@g.enp.edu.dz','Kenza','Ait','Kenza@g.enp edu.dz','27/10/2025','0549844729','IT','IT'));
reg.cells.push(regRow(old,'h1@g.enp.edu.dz','Naima','Benarab','h1@g.enp.edu.dz','05/03/2005','0555441863','HR','IT'));
reg.cells.push(regRow(old,'f1@g.enp.edu.dz','Farouk','Dahlouk','f1@g.enp.edu.dz','01/09/2005','0554710192','COMM','FLER'));
reg.cells.push(regRow(old,'fl@g.enp.edu.dz','Lina','Fler','fl@g.enp.edu.dz','01/09/2005','0554710100','FLER','HR'));
reg.cells.push(regRow(new Date(old.getTime()+1000),'a1@g.enp.edu.dz','Amine','Test','a1@g.enp.edu.dz','12/06/2006','554781447','COMM','HR'));
`);
run('onFormSubmitHandler({})');
let ivs = run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)');
console.log('Interviewees:', ivs.map(r => (r[0] || '-') + '→' + (r[1] || '-') + ' ' + r[2] + ' flags[' + r[27] + ']').join(' ; '));
assert.strictEqual(ivs.length, 6);
assert.strictEqual(ivs[5][2], 'DUPLICATE');
assert.strictEqual(ivs[0][0], 'IT.01'); assert.strictEqual(ivs[1][0], 'IT.02'); assert.strictEqual(ivs[2][0], 'HR.01');
assert.strictEqual(ivs[0][9], '0554781447', 'phone normalized');
assert(ivs.slice(0, 5).every(r => r[1]), 'all non-dups assigned');
const binTags = {}; bins.forEach(r => { binTags[r[0]] = r[5]; });
ivs.slice(0, 5).forEach(r => { const d = r[14]; const tag = binTags[r[1]]; assert(tag === 'ALL' || tag.includes(d), r[0] + ' routed to ' + r[1] + ' [' + tag + ']'); });

// binome file got the rows
const b1 = ivs[0][1];
const fileId = bins.find(r => r[0] === b1)[8];
const frows = run(`__files["${fileId}"].obj.sheets[0].getDataRange().getValues()`);
const BFI = run('BFI');
assert(frows.some(r => r[BFI.Code] === 'IT.01'), 'IT.01 in binome file');
console.log('Mails so far:', run('__outbox.map(m=>m.to+" :: "+m.subject).join("\\n  ")'));

// ---- binome writes contacted + date, then sync (timing alerts) ----
run(`
var f = __files["${fileId}"].obj.sheets[0];
var rows = f.getDataRange().getValues();
for (var i=1;i<rows.length;i++) if (rows[i][BFI.Code]==='IT.01') { f.cells[i][BFI.Contacted]='Yes'; f.cells[i][BFI['Interview Date']]=new Date(Date.now()-2*24*3600e3); f.cells[i][BFI['Interview Time']]='14:30'; f.cells[i][BFI.Rating]=8; f.cells[i][BFI['Final Affectation']]='IT'; }
__touch("${fileId}");
var ivsh0 = master.getSheetByName('Interviewees'); for (var k=1;k<ivsh0.cells.length;k++) if (ivsh0.cells[k][4]) ivsh0.cells[k][4] = old;
`);
const syncCycles = () => { const logged = [], realLog = console.log; console.log = (...x) => { logged.push(x.join(' ')); };
  try { run('syncAll()'); } finally { console.log = realLog; }
  return logged.filter(l => l.startsWith('{"at":"cycle"')).map(JSON.parse); };
const cyc = syncCycles();
ivs = run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)');
const it01 = ivs.find(r => r[0] === 'IT.01');
// one `cycle` line per run, every phase timed; the edited sheet is opened ('upgrade': first read in the current layout)
assert.strictEqual(cyc.length, 1, 'one cycle line per sync');
['total', 'lockWait', 'load', 'edits', 'regs', 'forms', 'pull', 'statuses', 'timing', 'integrity', 'save', 'base', 'alerts', 'mails', 'tracker', 'mailsSent']
  .forEach(k => assert(cyc[0][k] >= 0, 'cycle.' + k));
assert.strictEqual(cyc[0].kind, 'trigger');
assert.strictEqual(cyc[0].outcome, 'ok');
// a run that can't get the lock, or that throws, still logs its line
const cycleLine = fn => { const logged = [], realLog = console.log; console.log = (...x) => { logged.push(x.join(' ')); };
  try { fn(); } catch (e) { /* the throw is the point */ } finally { console.log = realLog; }
  return logged.filter(l => l.startsWith('{"at":"cycle"')).map(JSON.parse); };
run('var __gl = LockService.getScriptLock; LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });');
const busy = cycleLine(() => run('syncAll()'));
run('LockService.getScriptLock = __gl;');
assert(busy.length === 1 && busy[0].outcome === 'busy' && busy[0].total >= 0 && busy[0].load === 0, 'busy run logs its line');
run('var __pb = pullBinomeFiles_; pullBinomeFiles_ = (c) => { __pb(c, true); throw new Error("boom"); };'); // opens every sheet, then fails
const thrown = cycleLine(() => run('syncAll()'));
run('pullBinomeFiles_ = __pb;');
assert(thrown.length === 1 && thrown[0].outcome === 'error' && thrown[0].load >= 0, 'throwing run logs its line');
assert(Object.keys(thrown[0].opened).length > 0, 'a failed run keeps the sheets it opened');
const bin01 = it01[run('idx_(IV_H)').Binome];
assert.strictEqual(cyc[0].opened[bin01], 'upgrade');
// edited again: Drive's "last updated" moved, so the next sync opens it as 'changed'
run(`__files["${fileId}"].obj.sheets[0].cells[1][BFI.Notes] = 'edited again'; __touch("${fileId}");`);
assert.strictEqual(syncCycles()[0].opened[bin01], 'changed', 'edited sheet opened as changed');
console.log('IT.01 after sync:', it01[2], it01[19], it01[21], it01[22], it01[23]);
assert.strictEqual(it01[2], 'SCHEDULED');
const IVX = run('idx_(IV_H)');
assert.deepStrictEqual([it01[IVX['Why VIC']], it01[IVX['Department Questions']]], ['To learn', 'Do you have any experience with Graphic Design? Yes'], 'registration extras kept');
assert.strictEqual(frows.find(r => r[BFI.Code] === 'IT.01')[BFI['Department Questions']], 'Do you have any experience with Graphic Design? Yes', 'and shown in the sheet');
assert.deepStrictEqual([it01[IVX.Rating], it01[IVX['Final Affectation']], it01[IVX['Interview Done']]], [8, 'IT', false], 'rating and affectation read from the sheet');
let alerts = run('master.getSheetByName("Alerts").getDataRange().getValues().slice(1)');
console.log('Alerts:\n  ' + alerts.map(a => [a[0], a[2], a[3], a[4], a[5], a[8], '→', a[7]].join(' ')).join('\n  '));
assert(alerts.some(a => a[3] === 'OVERDUE' && a[4] === 'IT.01'), 'IT.01 overdue (date 2 days ago, no form)');
assert(alerts.some(a => a[3] === 'NOT_CONTACTED'), 'others not contacted');
assert(alerts.some(a => a[3] === 'DUPLICATE_REGISTRATION'));
assert(alerts.some(a => a[3] === 'BAD_BIRTHDATE'));
assert(alerts.some(a => a[3] === 'BAD_EMAIL'));
// a second sync must not duplicate alerts
const nAlerts = alerts.length;
run('syncAll()');
assert.strictEqual(run('master.getSheetByName("Alerts").getLastRow()-1'), nAlerts, 'no duplicate alerts');

// ---- interview forms ----
const bIT01 = bins.find(r => r[0] === it01[1]);
const memberEmail = bIT01[2], otherBin = bins.find(r => r[0] !== it01[1]);
const hr01 = ivs.find(r => r[0] === 'HR.01');
const bHR = bins.find(r => r[0] === hr01[1]);
run(`
var ir = master.getSheetByName('Interview Responses');
var now = new Date();
ir.cells.push([now,'${memberEmail}','b${parseInt(bIT01[0].slice(2))}','it 1','intro','IT','IT','']);           // sloppy but right
ir.cells.push([new Date(now.getTime()+1000),'${otherBin[2]}','${otherBin[0]}','HR.01','intro','HR','HR','']);  // someone else's candidate
ir.cells.push([new Date(now.getTime()+2000),'${bHR[2]}','${bHR[1]}','XX.99','intro','HR','HR','']);           // names in binome field + unknown code
ir.cells.push([new Date(now.getTime()+3000),'${memberEmail}','${bIT01[0]}','IT.01','intro','IT','IT','']);     // duplicate
`);
run('onFormSubmitHandler({})');
const log = run('master.getSheetByName("Interview Log").getDataRange().getValues().slice(1)');
console.log('Interview Log:\n  ' + log.map(r => [r[2], r[3], '→', r[4], r[5], r[6], '|', r[7]].join(' ')).join('\n  '));
assert.strictEqual(log[0][6], 'AUTOCORRECTED'); assert.strictEqual(log[0][5], 'IT.01');
assert.strictEqual(log[1][6], 'FLAGGED');
assert.strictEqual(log[2][6], 'FLAGGED'); assert.strictEqual(log[2][4], bHR[0], 'binome resolved from member names');
assert.strictEqual(log[3][6], 'FLAGGED');
run('syncAll()');
alerts = run('master.getSheetByName("Alerts").getDataRange().getValues().slice(1)');
const overdue = alerts.find(a => a[3] === 'OVERDUE' && a[4] === 'IT.01');
assert.strictEqual(overdue[8], 'AUTO-RESOLVED', 'overdue closes once the form arrives');
const unk = alerts.find(a => a[3] === 'UNKNOWN_INTERVIEWEE');
assert(unk[7].includes(bHR[2]), 'binome notified of big mistake: ' + unk[7]);
const mism = alerts.find(a => a[3] === 'BINOME_MISMATCH');
assert(!mism[7].includes(otherBin[2]), 'mismatch goes to admin only');
const fileIT01 = run(`__files["${fileId}"].obj.sheets[0].getDataRange().getValues()`).find(r => r[BFI.Code] === 'IT.01');
console.log('Binome file "Interview Form" cell for IT.01:', fileIT01[BFI['Interview Form']]);
assert(fileIT01[BFI['Interview Form']].startsWith('✅'), 'first submission mark kept');
assert.strictEqual(fileIT01[BFI['Interview Done']], true, 'form ticks Interview Done');

// ---- a sync with nothing new writes nothing to the Master; each kind of change is written (load-test task 4) ----
const quietSync = fn => { run('__writes = {}'); const lu = run('__files[master.id].lastUpdated.getTime()'); run(fn || 'syncAll()');
  return { w: run('JSON.stringify(__writes)'), moved: run('__files[master.id].lastUpdated.getTime()') !== lu }; };
const wrote = q => JSON.parse(q.w);
const ivOf = code => run('master.getSheetByName("Interviewees").getDataRange().getValues()').find(r => r[0] === code);
let q = quietSync();
assert.deepStrictEqual([q.w, q.moved], ['{}', false], 'a sync with nothing new wrote ' + q.w);
// a Tracker still carrying the old "Last update:" label is rewritten once, then left alone
run('master.getSheetByName("Tracker").cells[0][2] = "Last update: 01/10/2026 10:00"');
q = quietSync();
assert(wrote(q).Tracker && /^Last change: /.test(run('master.getSheetByName("Tracker").getRange(1, 3).getValue()')), 'old label replaced: ' + q.w);
q = quietSync();
assert.deepStrictEqual([q.w, q.moved], ['{}', false], 'nothing new after the label, yet wrote ' + q.w);
// a binome-sheet edit: the row is written, the status moves, NOT_CONTACTED closes, the Tracker follows
const comm = ivOf('COMM.01'), commFile = bins.find(r => r[0] === comm[1])[8];
const notContacted = () => run('master.getSheetByName("Alerts").getDataRange().getValues()').find(a => a[3] === 'NOT_CONTACTED' && a[4] === 'COMM.01');
assert.strictEqual(notContacted()[8], 'OPEN');
run(`(function(){ var f = __files["${commFile}"].obj.sheets[0];
  f.cells.forEach(function(r){ if (r[BFI.Code] !== 'COMM.01') return;
    r[BFI.Contacted] = 'Yes'; r[BFI['Interview Date']] = new Date(Date.now() + 24 * 3600e3); r[BFI['Interview Time']] = '10:00';
    r[BFI['Interview Done']] = true; r[BFI.Rating] = 7; r[BFI['Final Affectation']] = 'COMM'; r[BFI.Notes] = 'very motivated'; });
  __touch("${commFile}"); })()`);
q = quietSync();
assert(wrote(q).Interviewees && wrote(q).Alerts && wrote(q).Tracker && q.moved, 'binome edit written: ' + q.w);
let c1 = ivOf('COMM.01');
assert.deepStrictEqual([c1[IVX.Status], c1[IVX.Contacted], c1[IVX['Interview Time']], c1[IVX['Interview Done']], c1[IVX.Rating], c1[IVX['Final Affectation']], c1[IVX['Binome Notes']]],
  ['SCHEDULED', 'Yes', '10:00', true, 7, 'COMM', 'very motivated'], 'binome edit visible');
assert(c1[IVX['Interview At']] instanceof run('Date') && c1[IVX['Interview Date']], 'date read');
assert.strictEqual(notContacted()[8], 'AUTO-RESOLVED', 'alert resolved and written');
q = quietSync();
assert.deepStrictEqual([q.w, q.moved], ['{}', false], 'nothing new after the edit, yet wrote ' + q.w);
// an interview form: INTERVIEWED, and the Tracker counts it
const bComm = bins.find(r => r[0] === comm[1]);
run(`master.getSheetByName('Interview Responses').cells.push([new Date(), '${bComm[2]}', '${bComm[0]}', 'COMM.01', 'intro', 'COMM', 'COMM', '']);`);
const interviewedBefore = run('master.getSheetByName("Tracker").getRange(3, 3).getValue()');
q = quietSync('onFormSubmitHandler({})');
assert(wrote(q)['Interview Log'] && wrote(q).Interviewees && wrote(q).Tracker, 'form written: ' + q.w);
assert.strictEqual(ivOf('COMM.01')[IVX.Status], 'INTERVIEWED');
assert.notStrictEqual(run('master.getSheetByName("Tracker").getRange(3, 3).getValue()'), interviewedBefore, 'Tracker counts the interview');
// a new registration (bad birth date: an alert raised): appended, assigned, alerted, counted
run(`reg.cells.push(regRow(new Date(), 'new1@g.enp.edu.dz', 'Nadia', 'Nouvelle', 'new1@g.enp.edu.dz', '27/10/2025', '0555000111', 'HR', 'IT'))`);
q = quietSync();
const nadia = run('master.getSheetByName("Interviewees").getDataRange().getValues()').find(r => r[IVX['First Name']] === 'Nadia');
assert(nadia && nadia[0] && nadia[1] && wrote(q).Interviewees && wrote(q).Tracker, 'new registration written: ' + q.w);
assert(run('master.getSheetByName("Alerts").getDataRange().getValues()').some(a => a[3] === 'BAD_BIRTHDATE' && a[4] === nadia[0]), 'alert raised and written');
q = quietSync();
assert.deepStrictEqual([q.w, q.moved], ['{}', false], 'nothing new after the registration, yet wrote ' + q.w);
// rows the script left alone are not rewritten: two edited rows apart = two one-row blocks, at their own rows
run(`var __sv = MockRange.prototype.setValues, __blocks = []; MockRange.prototype.setValues = function (v) { if (this.sh.name === 'Interviewees') __blocks.push([this.r, v.length]); return __sv.call(this, v); };`);
[[commFile, 'COMM.01'], [fileId, 'IT.01']].forEach(([f, code]) => run(`__files["${f}"].obj.sheets[0].cells.forEach(function(r){ if (r[BFI.Code] === '${code}') r[BFI.Notes] = 'notes changed'; }); __touch("${f}");`));
const rowOf = code => run('master.getSheetByName("Interviewees").getDataRange().getValues()').findIndex(r => r[0] === code) + 1;
run('syncAll()');
run('MockRange.prototype.setValues = __sv');
assert(rowOf('COMM.01') - rowOf('IT.01') > 1, 'the two rows are apart');
assert.deepStrictEqual([JSON.stringify(run("__blocks")), ivOf('COMM.01')[IVX['Binome Notes']], ivOf('IT.01')[IVX['Binome Notes']]],
  [JSON.stringify([[rowOf('IT.01'), 1], [rowOf('COMM.01'), 1]]), 'notes changed', 'notes changed'], 'only the edited rows written');
// equal only when sure: forced text matches its read-back; a number never matches the same number as text
assert(run(`sameCell_("'0555", '0555') && sameCell_(new Date(5), new Date(5)) && !sameCell_(7, '7') && !sameCell_('7', 7) && !sameCell_("'0555", 555) && !sameCell_('', 0)`));

// ---- a run that fails after reading a form reads it again next time: the form is never lost ----
const bNadia = bins.find(r => r[0] === nadia[IVX.Binome]), logLen = () => run('master.getSheetByName("Interview Log").getLastRow()');
const logBefore = logLen();
run(`master.getSheetByName('Interview Responses').cells.push([new Date(), '${bNadia[2]}', '${bNadia[0]}', '${nadia[0]}', 'intro', 'HR', 'HR', '']);
  var __pb2 = pullBinomeFiles_; pullBinomeFiles_ = function () { pullBinomeFiles_ = __pb2; throw new Error('Service Spreadsheets timed out'); };`);
assert.throws(() => run('syncAll()'), /timed out/);
assert.strictEqual(logLen(), logBefore, 'the failed run left the Interview Log as it was');
run('syncAll()');
assert.strictEqual(logLen(), logBefore + 1, 'logged once');
const nadiaNow = ivOf(nadia[0]);
assert.strictEqual(nadiaNow[IVX.Status], 'INTERVIEWED');
assert(nadiaNow[IVX['Interview Submitted At']], 'Interview Submitted At set');

// ---- reassign ----
const it02 = ivs.find(r => r[0] === 'IT.02');
const target = bins.find(r => r[0] !== it02[1] && (r[5] === 'ALL' || r[5].includes('IT')));
run(`var ivsh = master.getSheetByName('Interviewees'); master.setActiveSheet(ivsh); ivsh.activeRow = 3; __uiQueue.push('${target[0]}'); reassignSelected();`);
ivs = run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)');
console.log(run('__uiLog.slice(-1)[0]'));
assert.strictEqual(ivs[1][1], target[0]);
const tFile = run(`__files["${target[8]}"].obj.sheets[0].getDataRange().getValues()`);
const oFile = run(`__files["${bins.find(r => r[0] === it02[1])[8]}"].obj.sheets[0].getDataRange().getValues()`);
assert(tFile.some(r => r[BFI.Code] === 'IT.02') && !oFile.some(r => r[BFI.Code] === 'IT.02'), 'row moved between binome files');

// ---- tracker + digest ----
const tracker = run('master.getSheetByName("Tracker").getDataRange().getValues()');
console.log('Tracker:\n  ' + tracker.filter(r => r[0]).map(r => r.slice(0, 13).join(' | ')).join('\n  '));
run('__outbox.length = 0; sendDailyDigest()');
const digest = run('__outbox.find(m => /digest/.test(m.subject))');
assert(digest && digest.to === 'admin@g.enp.edu.dz');
console.log('Digest subject:', digest.subject);
// the whole run only wrote through the script: no hand edit flagged, and the digest's sheet check found nothing
const flagged = run('master.getSheetByName("Alerts").getDataRange().getValues().filter(r => /MANUAL_EDIT|INTEGRITY/.test(r[3]))');
assert.strictEqual(JSON.stringify(flagged), '[]', 'false manual-edit / integrity alerts');

// ---- a sheet still in the first layout is rebuilt in the current one, keeping what the binome typed ----
const hrB = ivs.find(r => r[0] === 'HR.01')[1], hrFile = bins.find(r => r[0] === hrB)[8];
run(`(function(){ var sh = __files["${hrFile}"].obj.sheets[0], row = BF_H_V1.map(function(){ return ''; });
  row[0] = 'HR.01'; row[BF_H_V1.indexOf('Contacted')] = 'Yes'; row[BF_H_V1.indexOf('Notes')] = 'calls after 6pm'; row[BF_H_V1.indexOf('Interview Form')] = '✅ 03/10 18:00';
  sh.cells = [BF_H_V1.slice(), row]; sh.protections = []; })()`);
run(`(function(){ var c = loadCtx_(); binomeSheet_(c, c.binByCode["${hrB}"]); })()`);
const up = run(`__files["${hrFile}"].obj.sheets[0].getDataRange().getValues()`);
assert.strictEqual(up[0].slice(BFI.Code).join('|'), run('BF_HEAD.join("|")'), 'current header');
const upRow = up.find(r => r[BFI.Code] === 'HR.01');
assert.deepStrictEqual([upRow[BFI.Contacted], upRow[BFI.Notes], upRow[BFI['First Name']], upRow[BFI['Interview Done']]],
  ['Yes', 'calls after 6pm', 'Naima', true], 'carried over, done still ticked');
assert.strictEqual(run(`__files["${hrFile}"].obj.sheets[0].getProtections().length`), 1, 'protected again');
assert.strictEqual(run(`__files["${hrFile}"].obj.getSheets().length`), 1, 'backup tab removed once the rebuild ends');
// a rebuild that stopped half-way (first tab cleared, copy of the old tab left) starts again from the copy
const flB = ivs.find(r => r[0] === 'FLER.01')[1], flFile = bins.find(r => r[0] === flB)[8];
run(`(function(){ var book = __files["${flFile}"].obj, row = BF_H_V1.map(function(){ return ''; });
  row[0] = 'FLER.01'; row[BF_H_V1.indexOf('Notes')] = 'met at the stand';
  var copy = book.insertSheet("${flB}" + BF_BACKUP); copy.cells = [BF_H_V1.slice(), row];
  book.sheets[0].cells = []; book.sheets[0].protections = []; })()`);
run(`(function(){ var c = loadCtx_(); binomeSheet_(c, c.binByCode["${flB}"]); })()`);
const fl = run(`__files["${flFile}"].obj.sheets[0].getDataRange().getValues()`).find(r => r[BFI.Code] === 'FLER.01');
assert.strictEqual(fl[BFI.Notes], 'met at the stand', 'recovered from the copy');
assert.strictEqual(run(`__files["${flFile}"].obj.getSheets().length`), 1, 'copy removed after the recovery');
console.log('\nE2E OK');
