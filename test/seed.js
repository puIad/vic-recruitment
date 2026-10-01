// Loads the .gs files into the Apps Script mock, runs setup like the editor would,
// then switches to web-app conditions (no active spreadsheet, getUi() throws).
const fs = require('fs'), vm = require('vm');

module.exports = function seed() {
  const ctx = vm.createContext({ console, Proxy, JSON, Math });
  vm.runInContext(fs.readFileSync(__dirname + '/mockgas.js', 'utf8'), ctx, { filename: 'test/mockgas.js' });
  require('./gs')(ctx);
  const run = code => vm.runInContext(code, ctx);
  run(`
var REG_H = ["Timestamp","Email address","First Name","Family Name","E-mail Address","Birth Date","Phone Number","Facebook Link","Discord Username  ","Field of Study ","Year of Study","How did you discover VIC?","Why do you want to be part of the Vision & Innovation Club family?","Have you had previous experience in other clubs? If yes, please mention them.  ","What's your first department choice?","What's your 2nd department choice?","Why did you choose the IT Department as your top preference?  ","Do you have any experience with Graphic Design?","Why did you choose the COMM Department as your top preference?  ","Why did you choose the HR Department as your top preference?  ","Why did you choose the FLER Department as your top preference?  ","Which days or times are you usually available for an interview?  ","Will you be able to attend your interview on time once the date is shared?  ","Anything to add?"];
var INT_H = ["Timestamp","Email Address","Your Binôme Code\\n(B1 , B2 , B3 , B4,...)","Interviewee Code\\n(COMM.12, IT.58, HR.23,...)","Introduce yourself","Their 1st Department Choice","Final Main Department Affectation","Anything to add?"];
__forms[CONFIG.REGISTRATION_FORM_ID] = new MockForm(CONFIG.REGISTRATION_FORM_ID, 'VIC Registrations Form 2025', REG_H);
__forms[CONFIG.INTERVIEW_FORM_ID] = new MockForm(CONFIG.INTERVIEW_FORM_ID, 'Interview Form 2025', INT_H);
var master = new MockSS('Master'); SpreadsheetApp._active = master;
var db = new MockSS('DB'); __files[CONFIG.TEAM_DB_DEFAULT_ID] = __files[db.id]; __files[CONFIG.TEAM_DB_DEFAULT_ID].obj = db;
db.sheets[0].cells = [["","First Name","Last Name ","Email Adress","Phone"],
 ["Committe Board","Aymene","KHALED","aymene@g.enp.edu.dz",""],["","Romaissa","BOUTELDJA","romaissa@g.enp.edu.dz",""],
 ["Council Board","Sabrina","AKNINE","sabrina@g.enp.edu.dz",""],
 ["FLER","Yasmine","AIT AHMED","yasmine@g.enp.edu.dz",""],["","Hadjer","KHIER","hadjer@g.enp.edu.dz",""],
 ["COMM","Aya","GHARBI","aya@g.enp.edu.dz",""],
 ["HR","Ikram","MAHI","ikram@g.enp.edu.dz",""],["","Zineb","TAIBI","zineb@g.enp.edu.dz",""],["","Djamila","CHERIFI","djamila@g.enp.edu.dz",""],["","Rami","AHMANE","rami@g.enp.edu.dz",""],
 ["IT","Sara","BOUZNAD","sara@g.enp.edu.dz",""],["","Marya","DJALAB","marya@g.enp.edu.dz",""],["","Madjid","MEDJKANE","madjid@g.enp.edu.dz",""]];
function regRow(ts, collected, first, fam, typed, birth, phone, c1, c2) {
  var r = new Array(REG_H.length).fill('');
  r[0]=ts; r[1]=collected; r[2]=first; r[3]=fam; r[4]=typed; r[5]=birth; r[6]=phone; r[14]=c1; r[15]=c2; r[21]='Sunday, Tuesday';
  return r;
}
`);
  run('setup()');
  // From here on, behave like a web-app execution
  run('SpreadsheetApp._active = null; SpreadsheetApp.getUi = function () { throw new Error("Cannot call SpreadsheetApp.getUi() from this context."); };');

  // google.script.run serialises results and rejects Dates: mimic that, so a Date leak fails loudly
  const call = (fn, ...args) => {
    const out = ctx[fn](...args);
    (function walk(v, path) {
      if (Object.prototype.toString.call(v) === '[object Date]') throw new Error(fn + ' returned a Date at ' + path);
      if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], path + '.' + k));
    })(out, fn);
    return JSON.parse(JSON.stringify(out === undefined ? null : out));
  };
  const addRegistrations = (n, daysAgo) => run(`
    (function () {
      var reg = master.getSheetByName('Registration Responses');
      var firsts = ['Amine','Kenza','Naima','Farouk','Lina','Yacine','Ines','Rayan','Sofia','Walid','Meriem','Anis','Nour','Islam','Selma'];
      var fams = ['Belkacem','Haddad','Saidi','Mansouri','Brahimi','Kaci','Ziani','Amrani','Cherif','Bouzid'];
      var deps = ['IT','IT','IT','COMM','FLER','HR','HR'];
      var base = Date.now() - ${daysAgo} * 24 * 3600e3;
      for (var i = 0; i < ${n}; i++) {
        var f = firsts[i % firsts.length], l = fams[(i * 7) % fams.length], e = (f + '.' + l + i).toLowerCase() + '@g.enp.edu.dz';
        var d1 = deps[i % deps.length], d2 = deps[(i + 3) % deps.length];
        reg.cells.push(regRow(new Date(base + i * 60000), e, f, l, i % 11 === 5 ? e.replace('.dz', '') : e, '0' + (1 + i % 9) + '/03/2005', '0555' + String(100000 + i), d1, d2 === d1 ? 'HR' : d2));
      }
    })();`);
  // Timing alerts count from assignment: push every "Assigned At" back so they become overdue on the next sync
  const backdateAssignments = days => run(`
    (function () { var sh = master.getSheetByName('Interviewees'), I = idx_(IV_H);
      for (var k = 1; k < sh.cells.length; k++) if (sh.cells[k][I['Assigned At']]) sh.cells[k][I['Assigned At']] = new Date(Date.now() - ${days} * 24 * 3600e3); })();`);
  return { ctx, run, call, addRegistrations, backdateAssignments };
};
