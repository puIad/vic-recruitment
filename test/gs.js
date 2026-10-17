// The Apps Script sources in push order (Config.gs first: it holds the top-level constants the rest use).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const files = ['Config.gs'].concat(fs.readdirSync(root).filter(f => f.endsWith('.gs') && f !== 'Config.gs').sort());
module.exports = ctx => {
  // every mail a suite sends must come out of the template (Mail.gs): checked when the suite ends
  process.on('exit', () => { const u = vm.runInContext('typeof __untemplated === "undefined" ? "" : __untemplated.join(" | ")', ctx); if (u) { console.error('Mail not built by mailHtml_: ' + u); process.exitCode = 1; } });
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
  // tests only: BFI[key] = index of a binome-sheet column in a mock row (the table starts at column BF_COL)
  vm.runInContext('var BFI = {}; BF_H.forEach(function (k, i) { BFI[k] = BF_COL - 1 + i; });', ctx);
};
