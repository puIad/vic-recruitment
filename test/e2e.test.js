// End-to-end simulation of the whole flow against the mock services
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = vm.createContext({ console, Proxy, JSON, Math });
vm.runInContext(fs.readFileSync(__dirname + '/mockgas.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), ctx);
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
  r[0]=ts; r[1]=collected; r[2]=first; r[3]=fam; r[4]=typed; r[5]=birth; r[6]=phone; r[14]=c1; r[15]=c2; r[16]= c1==='IT'?'I love tech':''; r[19]= c1==='HR'?'People!':''; r[21]='Sunday, Tuesday';
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
assert(frows.some(r => r[0] === 'IT.01'), 'IT.01 in binome file');
console.log('Mails so far:', run('__outbox.map(m=>m.to+" :: "+m.subject).join("\\n  ")'));

// ---- binome writes contacted + date, then sync (timing alerts) ----
run(`
var f = __files["${fileId}"].obj.sheets[0];
var rows = f.getDataRange().getValues();
for (var i=1;i<rows.length;i++) if (rows[i][0]==='IT.01') { f.cells[i][15]='Yes'; f.cells[i][16]=new Date(Date.now()-2*24*3600e3); f.cells[i][17]='14:30'; }
__touch("${fileId}");
var ivsh0 = master.getSheetByName('Interviewees'); for (var k=1;k<ivsh0.cells.length;k++) if (ivsh0.cells[k][4]) ivsh0.cells[k][4] = old;
`);
run('syncAll()');
ivs = run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)');
const it01 = ivs.find(r => r[0] === 'IT.01');
console.log('IT.01 after sync:', it01[2], it01[19], it01[21], it01[22], it01[23]);
assert.strictEqual(it01[2], 'SCHEDULED');
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
const fileIT01 = run(`__files["${fileId}"].obj.sheets[0].getDataRange().getValues()`).find(r => r[0] === 'IT.01');
console.log('Binome file "Interview Form" cell for IT.01:', fileIT01[18]);
assert(fileIT01[18].startsWith('✅'), 'first submission mark kept');

// ---- reassign ----
const it02 = ivs.find(r => r[0] === 'IT.02');
const target = bins.find(r => r[0] !== it02[1] && (r[5] === 'ALL' || r[5].includes('IT')));
run(`var ivsh = master.getSheetByName('Interviewees'); master.setActiveSheet(ivsh); ivsh.activeRow = 3; __uiQueue.push('${target[0]}'); reassignSelected();`);
ivs = run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)');
console.log(run('__uiLog.slice(-1)[0]'));
assert.strictEqual(ivs[1][1], target[0]);
const tFile = run(`__files["${target[8]}"].obj.sheets[0].getDataRange().getValues()`);
const oFile = run(`__files["${bins.find(r => r[0] === it02[1])[8]}"].obj.sheets[0].getDataRange().getValues()`);
assert(tFile.some(r => r[0] === 'IT.02') && !oFile.some(r => r[0] === 'IT.02'), 'row moved between binome files');

// ---- tracker + digest ----
const tracker = run('master.getSheetByName("Tracker").getDataRange().getValues()');
console.log('Tracker:\n  ' + tracker.filter(r => r[0]).map(r => r.slice(0, 13).join(' | ')).join('\n  '));
run('__outbox.length = 0; sendDailyDigest()');
const digest = run('__outbox.find(m => /digest/.test(m.subject))');
assert(digest && digest.to === 'admin@g.enp.edu.dz');
console.log('Digest subject:', digest.subject);
console.log('\nE2E OK');
