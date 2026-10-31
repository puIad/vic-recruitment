// webRun binomeView (docs/admin-features.md › One binome's panel and page): any locked binome's slice for an admin, and with
// `live` the sheet read now over it, keeping the Master's statuses.
const assert = require('assert');
const J = JSON.stringify, ADMIN = 'admin@g.enp.edu.dz';
const m = require('./seed')();
['importTeam', 'draft', 'lock'].forEach(a => m.call('webRun', a, { link: '' }));
m.addRegistrations(30, 3);
m.call('webRun', 'sync');
m.run('var __admin = Session; var __as = e => { Session = e === "admin@g.enp.edu.dz" ? __admin : { getEffectiveUser: () => ({ getEmail: () => e }), getActiveUser: () => ({ getEmail: () => e }) }; }');
const as = e => m.run('__as(' + J(e) + ')');
const st = m.call('webState');
const ivOf = code => st.interviewees.filter(i => i.binome === code).map(i => i.code).sort();
const b1 = st.binomes.find(b => b.people.length === 2 && ivOf(b.code).length >= 3), fid = b1.fileUrl.split('/d/')[1];
const [mem] = b1.people.map(p => p.email), [c1, c2] = ivOf(b1.code);
const view = (binome, live) => m.call('webRun', 'binomeView', { binome, live }).result;

// the slice a member of that binome would get, for an admin who is not in it
let v = view(b1.code);
assert.deepStrictEqual([v.binome, v.fromSheet, v.candidates.map(c => c.Code).sort()], [b1.code, false, ivOf(b1.code)]);
assert(v.candidates.every(c => c.Status), 'statuses come from the Master');
assert.strictEqual(v.fileUrl, b1.fileUrl);
assert.deepStrictEqual(v.members, b1.members);

// it publishes nothing: a read
const pulse = m.call('webPulse');
view(b1.code);
assert.strictEqual(m.call('webPulse'), pulse, 'a read publishes nothing');

// a binome with no sheet yet (a draft, or no such code)
assert.throws(() => view('B.99'), /B\.99 has no sheet yet/);
assert.throws(() => view(''), /has no sheet yet/);

// members never get it
as(mem);
assert.throws(() => view(b1.code), /^Error: Not allowed$/);
as(ADMIN);

// live: what the sheet says now. A hand edit in the binome sheet shows, the status stays the Master's
m.run('__acl = true');
m.call('webRun', 'binomeAccess', { binome: b1.code, level: 'edit' });
m.call('webRun', 'sync');
m.run(`(function(){var sh=__files[${J(fid)}].obj.sheets[0]; sh.getRange(findFileRow_(sh, ${J(c1)}), bfCol_('Notes')).setValue('typed in the sheet');})()`);
assert.notStrictEqual(view(b1.code).candidates.find(c => c.Code === c1).Notes, 'typed in the sheet', 'the copy is the last sync');
v = view(b1.code, true);
const live = v.candidates.find(c => c.Code === c1);
assert.deepStrictEqual([live.Notes, live.Status], ['typed in the sheet', st.interviewees.find(i => i.code === c1).status], 'sheet cells, Master status');
assert.deepStrictEqual(v.candidates.map(c => c.Code).sort(), ivOf(b1.code));
assert.strictEqual(v.fromSheet, false);
assert(Array.isArray(v.alerts) && v.tag === b1.tag, 'the rest of the slice stays');

// an admin without access to the sheet (not its owner or editor): a plain answer, not "shared with you"; the copy still reads
const OTHER = 'admin2@g.enp.edu.dz';
m.run(`master.addEditor(${J(OTHER)})`);
as(OTHER);
assert.deepStrictEqual(view(b1.code).candidates.map(c => c.Code).sort(), ivOf(b1.code), 'the copy needs no sheet access');
assert.throws(() => view(b1.code, true), e => /^You can't open the sheet of /.test(e.message) && !/shared with you/.test(e.message), 'no access');
console.log('binome.test.js ok');
