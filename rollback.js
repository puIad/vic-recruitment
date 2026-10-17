// npm run rollback -- <version>: both deployments (web app + API) back to that script version, in place.
// Only versions that carry the pending-changes apply entry (npm run deploy names them "apply entry"): an older one would
// leave the queue consumer calling a webApply that isn't there.
const { execFileSync } = require('child_process');
const DEPLOYMENTS = ['AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT',
  'AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU'];
const clasp = args => execFileSync('npx', ['clasp'].concat(args), { encoding: 'utf8', shell: process.platform === 'win32' });

const v = process.argv[2];
if (!/^\d+$/.test(v || '')) { console.error('Usage: npm run rollback -- <version number> (see npx clasp versions)'); process.exit(1); }
const line = clasp(['versions']).split('\n').find(l => l.trim().startsWith(v + ' - '));
if (!line) { console.error('No version ' + v + '.'); process.exit(1); }
if (!/apply entry/.test(line)) { console.error('Version ' + v + ' has no apply entry (' + line.trim() + '): pick a later one.'); process.exit(1); }
DEPLOYMENTS.forEach(id => console.log(clasp(['update-deployment', id, '-V', v]).trim()));
