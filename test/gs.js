// The Apps Script sources in push order (Config.gs first: it holds the top-level constants the rest use).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const files = ['Config.gs'].concat(fs.readdirSync(root).filter(f => f.endsWith('.gs') && f !== 'Config.gs').sort());
module.exports = ctx => files.forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));
