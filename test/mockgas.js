// Minimal in-memory mock of the Apps Script services used by the .gs files (evaluated inside the same vm realm)
var __files = {};     // id -> {kind, obj, lastUpdated, parent, editors}
var __outbox = [];
var __uiQueue = [];   // scripted answers for prompts/alerts
var __uiLog = [];
var __idc = 0;
var __props = {};
var __triggers = [];
var __clock = null;   // optional fixed "now" (ms)
var __RealDate = Date;

function __id(p) { __idc++; return (p || 'id') + '_' + __idc; }
function __touch(ssId) { if (__files[ssId]) __files[ssId].lastUpdated = new Date(__files[ssId].lastUpdated.getTime() + 1000); }

function chain(extra) {
  const target = Object.assign({}, extra || {});
  const p = new Proxy(target, { get(t, k) { if (k in t) return t[k]; if (k === 'then') return undefined; return function () { return p; }; } });
  return p;
}

function colToNum(c) { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d, pattern) {
  // fixed +01:00 timezone
  const x = new Date(d.getTime() + 3600e3);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (pattern === 'XXX') return '+01:00';
  return pattern.replace('yyyy', x.getUTCFullYear()).replace('dd', pad(x.getUTCDate())).replace('MM', pad(x.getUTCMonth() + 1))
    .replace('HH', pad(x.getUTCHours())).replace('mm', pad(x.getUTCMinutes())).replace('EEE', days[x.getUTCDay()]);
}

function MockSheet(ss, name) {
  this.ss = ss; this.name = name; this.id = Math.floor(Math.random() * 1e9); this.cells = []; this.maxRows = 1000; this.fmt = {}; this.formUrl = null;
  this.notes = {}; this.activeRow = 2; this.protections = [];
}
MockSheet.prototype = {
  getName() { return this.name; }, setName(n) { this.name = n; return this; }, getSheetId() { return this.id; },
  getParent() { return this.ss; }, getFormUrl() { return this.formUrl; },
  getLastRow() { for (let r = this.cells.length; r >= 1; r--) { const row = this.cells[r - 1]; if (row && row.some(v => v !== '' && v != null)) return r; } return 0; },
  getLastColumn() { let m = 0; this.cells.forEach(row => { if (row) for (let c = row.length; c >= 1; c--) if (row[c - 1] !== '' && row[c - 1] != null) { m = Math.max(m, c); break; } }); return m; },
  getMaxRows() { return Math.max(this.maxRows, this.cells.length); },
  insertRowsAfter(a, n) { this.maxRows += n; return this; },
  getMaxColumns() { return Math.max(this.maxCols || 26, this.getLastColumn()); }, insertColumnsAfter(a, n) { this.maxCols = this.getMaxColumns() + n; return this; },
  getBandings() { return []; },
  copyTo(ss) { const c = ss.insertSheet('Copy of ' + this.name); c.cells = this.cells.map(r => (r || []).slice()); return c; },
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
      const c1 = colToNum(m[1]), r1 = m[2] ? +m[2] : 1, c2 = m[3] ? colToNum(m[3]) : c1, r2 = m[4] ? +m[4] : this.getMaxRows();
      return new MockRange(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new MockRange(this, a, b, c || 1, d || 1);
  },
  getDataRange() { return new MockRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); },
  deleteRow(r) { this.cells.splice(r - 1, 1); __touch(this.ss.id); return this; },
  clear() { this.cells = []; return this; },
  appendRow(v) { this.getRange(this.getLastRow() + 1, 1, 1, v.length).setValues([v]); return this; },
  getProtections() { return this.protections.slice(); },
  protect() { const p = chain({ getEditors: () => [], canDomainEdit: () => false, remove: () => { this.protections = this.protections.filter(x => x !== p); } }); this.protections.push(p); return p; },
  getActiveRange() { return new MockRange(this, this.activeRow, 1, 1, 1); },
  getActiveRangeList() { const s = this; return { getRanges: () => [new MockRange(s, s.activeRow, 1, 1, 1)] }; },
  toString() { return 'Sheet(' + this.name + ')'; },
};
['setFrozenRows', 'setFrozenColumns', 'setColumnWidth', 'setConditionalFormatRules', 'hideSheet', 'setHiddenGridlines', 'setRowHeight', 'setTabColor'].forEach(k => { MockSheet.prototype[k] = function () { return this; }; });

function MockRange(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
MockRange.prototype = {
  getRow() { return this.r; }, getLastRow() { return this.r + this.nr - 1; },
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = this.sh.cells[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v == null ? '' : v); } out.push(o); }
    return out;
  },
  getValue() { return this.getValues()[0][0]; },
  getDisplayValues() {
    return this.getValues().map(row => row.map((v, j) => {
      if (v instanceof Date) { const f = this.sh.fmt[this.c + j] || 'dd/MM/yyyy HH:mm'; return fmtDate(v, f.replace('dd/mm/yyyy', 'dd/MM/yyyy')); }
      return String(v);
    }));
  },
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('setValues dims ' + vals.length + 'x' + vals[0].length + ' vs ' + this.nr + 'x' + this.nc + ' on ' + this.sh.name);
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i; for (let k = 0; k <= ri; k++) if (!this.sh.cells[k]) this.sh.cells[k] = []; // no holes, like a real sheet
      for (let j = 0; j < this.nc; j++) { let v = vals[i][j]; if (v === undefined || v === null) v = ''; if (typeof v === 'string' && v[0] === "'") v = v.slice(1); this.sh.cells[ri][this.c - 1 + j] = v; }
    }
    __touch(this.sh.ss.id); return this;
  },
  setValue(v) { return this.setValues([[v]]); },
  clearContent() { for (let i = 0; i < this.nr; i++) { const row = this.sh.cells[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; },
  setNumberFormat(f) { for (let j = 0; j < this.nc; j++) this.sh.fmt[this.c + j] = f; return this; },
  setNote(n) { this.sh.notes[this.r + ':' + this.c] = n; return this; },
  insertCheckboxes() { for (let i = 0; i < this.nr; i++) { const row = this.sh.cells[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = false; } return this; }, // like Apps Script: every box unticked
  applyRowBanding() { return chain(); },
};
['setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setDataValidation', 'clearDataValidations', 'clearNote', 'setFontSize',
  'setFontFamily', 'setHorizontalAlignment', 'setVerticalAlignment', 'setBorder', 'merge', 'breakApart', 'setBackgrounds', 'setFontColors'].forEach(k => { MockRange.prototype[k] = function () { return this; }; });

function MockSS(title) {
  this.id = __id('ss'); this.title = title; this.sheets = [new MockSheet(this, 'Sheet1')]; this.active = this.sheets[0];
  __files[this.id] = { kind: 'ss', obj: this, lastUpdated: new Date(Date.UTC(2026, 0, 1)), parent: 'root', editors: [] };
}
MockSS.prototype = {
  rename(t) { this.title = t; return this; },
  getId() { return this.id; }, getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }, getName() { return this.title; },
  getSheets() { return this.sheets.slice(); }, getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
  insertSheet(n) { const s = new MockSheet(this, n); this.sheets.push(s); return s; },
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); },
  getActiveSheet() { return this.active; }, setActiveSheet(s) { this.active = s; return s; },
  moveActiveSheet(i) { this.sheets = this.sheets.filter(x => x !== this.active); this.sheets.splice(i - 1, 0, this.active); },
  setSpreadsheetTimeZone() { }, setSpreadsheetLocale() { }, toast(m) { __uiLog.push('TOAST: ' + m); },
  addEditor(e) { __files[this.id].editors.push(e); return this; },
  getEditors() { return __files[this.id].editors.map(e => ({ getEmail: () => e })); },
  getOwner() { return { getEmail: () => 'admin@g.enp.edu.dz' }; },
};

var SpreadsheetApp = {
  _active: null,
  getActive() { return this._active; }, getActiveSpreadsheet() { return this._active; },
  openById(id) { if (!__files[id]) throw new Error('No file ' + id); return __files[id].obj; },
  create(t) { return new MockSS(t); },
  flush() { },
  newDataValidation() { return chain(); }, newConditionalFormatRule() { return chain(); },
  ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' }, BandingTheme: {}, BorderStyle: {}, InterpolationType: {},
  getUi() {
    return {
      alert(a, b) { __uiLog.push('ALERT: ' + a + (typeof b === 'string' ? ' | ' + b : '')); return __uiQueue.length && __uiQueue[0] === 'YES' ? (__uiQueue.shift(), 'YES') : 'YES'; },
      prompt(t) { const ans = __uiQueue.length ? __uiQueue.shift() : ''; __uiLog.push('PROMPT: ' + t + ' -> ' + ans); return { getSelectedButton: () => 'OK', getResponseText: () => ans }; },
      ButtonSet: { OK_CANCEL: 1, YES_NO: 2 }, Button: { OK: 'OK', YES: 'YES' },
      createMenu() { return chain(); },
    };
  },
};

var DriveApp = {
  getFileById(id) {
    const f = __files[id]; if (!f) throw new Error('no drive file ' + id);
    return { moveTo(folder) { f.parent = folder.id; }, setTrashed(t) { f.trashed = t; return this; }, getLastUpdated() { return f.lastUpdated; }, getId() { return id; },
      getEditors() { return f.editors.map(e => ({ getEmail: () => e })); }, addEditor(e) { f.editors.push(e); }, getOwner() { return { getEmail: () => 'admin@g.enp.edu.dz' }; },
      getViewers() { return (f.viewers || []).map(e => ({ getEmail: () => e })); },
      addViewer(e) { (f.viewers = f.viewers || []).push(e); }, removeViewer(e) { f.viewers = (f.viewers || []).filter(x => x !== e); },
      removeEditor(e) { if (e === 'admin@g.enp.edu.dz') throw new Error('Cannot remove the owner'); f.editors = f.editors.filter(x => x !== e); } };
  },
  getFolderById(fid) {
    return { id: fid, getEditors() { return []; }, getOwner() { return { getEmail: () => 'admin@g.enp.edu.dz' }; }, getFiles() { const ids = Object.keys(__files).filter(k => __files[k].parent === fid); let i = 0;
      return { hasNext: () => i < ids.length, next: () => { const id = ids[i++]; return { getId: () => id, getLastUpdated: () => __files[id].lastUpdated }; } }; } };
  },
};

var __forms = {};
function MockForm(id, title, headers) { this.id = id; this.title = title; this.headers = headers; this.items = headers.slice(2).map(h => ({ t: h, getTitle() { return this.t; }, setHelpText(x) { this.help = x; return this; } })); }
MockForm.prototype = {
  getTitle() { return this.title; }, setTitle(t) { this.title = t; }, getItems() { return this.items; },
  getPublishedUrl() { return 'https://forms/' + this.id + '/viewform'; },
  setDestination(type, ssId) {
    const ss = __files[ssId].obj; const s = ss.insertSheet('Form Responses ' + ss.sheets.length);
    s.formUrl = 'https://docs.google.com/forms/d/' + this.id + '/edit'; s.cells = [this.headers.slice()]; this.sheet = s;
  },
};
var FormApp = { DestinationType: { SPREADSHEET: 'SS' }, openById(id) { return __forms[id]; } };

var PropertiesService = { getScriptProperties() { return { getProperty: k => (k in __props ? __props[k] : null), setProperty: (k, v) => { __props[k] = String(v); },
  getProperties: () => Object.assign({}, __props), setProperties: o => { Object.keys(o).forEach(k => { __props[k] = String(o[k]); }); }, deleteProperty: k => { delete __props[k]; } }; } };
var __lockBusy = false; // a test sets it to make the script lock refuse
var LockService = { getScriptLock() { return { tryLock: () => !__lockBusy, waitLock: () => true, releaseLock: () => { } }; } };
var MailApp = { sendEmail(o) { __outbox.push(o); } };
var Session = { getEffectiveUser() { return { getEmail: () => 'admin@g.enp.edu.dz' }; }, getActiveUser() { return { getEmail: () => 'admin@g.enp.edu.dz' }; } };
var Utilities = { formatDate: (d, tz, p) => fmtDate(d, p), sleep() { } };
var HtmlService = {
  createHtmlOutputFromFile: f => chain({ _file: f }),
  createTemplateFromFile: f => ({ evaluate() { return chain({ _file: f, _vars: Object.assign({}, this) }); } }),
};
var ScriptApp = { getService() { return { getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }; }, getProjectTriggers() { return __triggers; }, deleteTrigger() { }, newTrigger(h) { const c = chain({ create: () => { __triggers.push({ getHandlerFunction: () => h }); } }); return c; } };
var Logger = { log: console.log };
