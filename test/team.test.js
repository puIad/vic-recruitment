// Add, edit and remove Team members (docs/admin-features.md): teamAdd, teamSet's cells, teamFix, teamRemove, Import after Lock,
// and the pending change of kind 'team' with a field.
const assert = require('assert');

// ---- before Lock: add, cells, a draft dropped by Not interviewing and by Remove ----
{
  const { run, call } = require('./seed')();
  call('webRun', 'importTeam', { link: '' });
  const T = run('idx_(TEAM_H)'), C = run('idx_(MC_H)');
  const team = () => JSON.parse(run(`JSON.stringify(master.getSheetByName('Team').getDataRange().getValues())`)).slice(1).filter(r => r[T.Email]);
  const row = e => team().find(r => r[T.Email] === e);
  const changes = () => run(`master.getSheetByName('Member Changes').getDataRange().getValues()`).slice(1);

  // dryRun: Pair As from the department, Experienced from the 2025 team, the name warning
  let out = call('webRun', 'teamAdd', { name: 'Sara Belaid', email: 'nesma@g.enp.edu.dz', dept: 'IT', dryRun: true }).result;
  assert.deepStrictEqual(out, { pairAs: 'IT', experienced: true, warnings: ["The email does not look like this person's (nesma@g.enp.edu.dz)."] });
  assert.throws(() => call('webRun', 'teamAdd', { name: 'Sara Belaid', email: 'nesma@g.enp.edu.dz', dept: 'IT' }), /already in the Team tab/);
  assert.throws(() => call('webRun', 'teamAdd', { name: 'Sara Belaid', email: 'sara@', dept: 'IT' }), /valid email/);
  assert.throws(() => call('webRun', 'teamAdd', { name: 'Sara Belaid', email: 'sara.belaid@g.enp.edu.dz', dept: 'IT', pairAs: 'BOSS' }), /Pair As is one of/);
  out = call('webRun', 'teamAdd', { name: 'Sara Belaid', email: 'Sara.Belaid@g.enp.edu.dz', dept: 'COMM' }).result;
  assert.deepStrictEqual([out.pairAs, out.experienced], ['COMM', false]);
  assert.deepStrictEqual(row('sara.belaid@g.enp.edu.dz').slice(0, 5), ['Sara Belaid', 'sara.belaid@g.enp.edu.dz', 'COMM', 'COMM', false]);
  assert(changes().some(r => r[C.Type] === 'TEAM_ADD' && r[C['In Email']] === 'sara.belaid@g.enp.edu.dz'), 'logged');
  assert(call('webState').teamList.some(m => m.email === 'sara.belaid@g.enp.edu.dz' && m.dept === 'COMM'));

  // cells: Pair As and Department, then Not interviewing stays in teamList with exclude
  call('webRun', 'teamSet', { email: 'sara.belaid@g.enp.edu.dz', field: 'Pair As', value: 'hr' });
  call('webRun', 'teamSet', { email: 'sara.belaid@g.enp.edu.dz', field: 'Department', value: 'HR' });
  assert.deepStrictEqual(row('sara.belaid@g.enp.edu.dz').slice(2, 4), ['HR', 'HR']);
  assert.throws(() => call('webRun', 'teamSet', { email: 'sara.belaid@g.enp.edu.dz', field: 'Notes', value: 'x' }), /Not a Team column/);

  // a draft holding someone who stops interviewing is dropped, their partner is free again
  call('webRun', 'draftPair', { emailA: 'warda@g.enp.edu.dz', emailB: 'nawel@g.enp.edu.dz' });
  call('webRun', 'draftPair', { emailA: 'houria@g.enp.edu.dz', emailB: 'kahina@g.enp.edu.dz' });
  assert.throws(() => call('webRun', 'teamSet', { email: 'warda@g.enp.edu.dz', field: 'Full Name', value: 'W' }), /use Correct name or email/);
  out = call('webRun', 'teamSet', { email: 'warda@g.enp.edu.dz', field: 'Exclude', value: true }).result;
  assert(/Warda Tebbal left draft B\.01: Nawel Chikhi free again/.test(out.warning), out.warning);
  let st = call('webState');
  assert.deepStrictEqual(st.binomes.map(b => b.code + ' ' + b.people.map(p => p.email.split('@')[0]).join('+')), ['B.01 houria+kahina']);
  assert.strictEqual(st.teamList.find(m => m.email === 'warda@g.enp.edu.dz').exclude, true, 'teamList keeps the not-interviewing');

  // a draft name fix goes to the draft row too; the hand-made mark follows an email fix
  out = call('webRun', 'teamFix', { email: 'kahina@g.enp.edu.dz', newName: 'Kahina Remili-Ait', newEmail: 'kahina.remili@g.enp.edu.dz' }).result;
  assert(/corrected in the Team tab and draft B\.01/.test(out.done[0]), out.done[0]);
  st = call('webState');
  assert.deepStrictEqual(st.binomes[0].people[1], { name: 'Kahina Remili-Ait', email: 'kahina.remili@g.enp.edu.dz' });
  assert.strictEqual(st.binomes[0].byHand, true);
  assert.strictEqual(row('kahina.remili@g.enp.edu.dz')[T.Notes], '', 'Notes rechecked');

  // Remove waits for the document lock (the apply entry writes Team cells by row number): busy, nothing removed
  run('__docLockBusy = true');
  assert.throws(() => call('webRun', 'teamRemove', { email: 'houria@g.enp.edu.dz' }), /^Error: BUSY:/);
  run('__docLockBusy = false');
  assert(row('houria@g.enp.edu.dz'), 'still in the Team tab');

  // Remove: the row goes, the draft is dropped
  out = call('webRun', 'teamRemove', { email: 'houria@g.enp.edu.dz' }).result;
  assert(/left draft B\.01/.test(out.warning));
  assert(!row('houria@g.enp.edu.dz'));
  assert.deepStrictEqual(call('webState').binomes, []);
  assert(changes().some(r => r[C.Type] === 'TEAM_REMOVED' && r[C['Out Email']] === 'houria@g.enp.edu.dz'));
  call('webRun', 'sync');
  assert(!call('webState').alerts.some(a => a.type === 'MANUAL_EDIT'), 'no hand edit from these writes');
}

// ---- after Lock: Correct name or email in a binome, Remove, Import merge, the pending change ----
{
  const { run, call } = require('./seed')();
  call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
  call('webRun', 'saveSettings', { values: { TEST_MODE: false } });
  call('webRun', 'sync');
  const T = run('idx_(TEAM_H)'), C = run('idx_(MC_H)'), B = run('idx_(BIN_H)');
  const tab = name => JSON.parse(run(`JSON.stringify(master.getSheetByName('${name}').getDataRange().getValues())`)).slice(1);
  const b = call('webState').binomes.find(x => x.people.length === 2), e = b.people[0].email, ne = 'fixed.' + e;

  run('__outbox.length = 0');
  assert.throws(() => call('webRun', 'teamFix', { email: e, newEmail: b.people[1].email }), /already in the Team tab/);
  const pv = call('webRun', 'teamFix', { email: e, newEmail: ne, dryRun: true }).result;
  assert.deepStrictEqual([pv.binome, pv.notice], [b.code, true]);
  // the Binomes write fails: nothing else is written either
  run("var __svB = MockRange.prototype.setValues; MockRange.prototype.setValues = function (v) { if (this.sh.name === 'Binomes') throw new Error('Service unavailable'); return __svB.call(this, v); }");
  assert.throws(() => call('webRun', 'teamFix', { email: e, newEmail: ne }), /Nothing changed/);
  run('MockRange.prototype.setValues = __svB');
  assert(tab('Team').some(x => x[T.Email] === e) && !tab('Team').some(x => x[T.Email] === ne), 'the Team row kept the old address');
  call('webRun', 'teamFix', { email: e, newEmail: ne });
  const r = tab('Binomes').find(x => x[B.Binome] === b.code);
  assert([r[B['Email 1']], r[B['Email 2']]].includes(ne), 'Binomes row');
  assert(tab('Team').some(x => x[T.Email] === ne) && !tab('Team').some(x => x[T.Email] === e), 'Team row');
  const mails = JSON.parse(run('JSON.stringify(__outbox.map(m => [m.to, m.subject]))'));
  assert.deepStrictEqual(mails, [[ne, '[VIC Recruitment] Binome ' + b.code + ' now uses this address']], 'one notice, to the new address only');
  assert(JSON.parse(run('JSON.stringify(pairedSent_())')).includes(b.code + '|' + ne), 'PAIRED_SENT has the new address');
  assert(JSON.parse(run('JSON.stringify(formerMembers_())'))[b.code].includes(e), 'the old address is a former member');
  assert(tab('Alerts').some(a => a.includes('MEMBER_CHANGED') && a.includes(b.code)), 'MEMBER_CHANGED info alert');
  assert(!JSON.parse(run('JSON.stringify(pairedTodo_(loadCtx_()).map(t => t.key))')).includes(b.code + '|' + ne), 'the catch-up never tells the new address');

  // a name fix in a binome: the row and the Team tab, no mail
  run('__outbox.length = 0');
  call('webRun', 'teamFix', { email: ne, newName: 'Fixed Name' });
  assert(tab('Binomes').find(x => x[B.Binome] === b.code).includes('Fixed Name'));
  assert.strictEqual(tab('Team').find(x => x[T.Email] === ne)[T['Full Name']], 'Fixed Name');
  assert.strictEqual(run('__outbox.length'), 0);

  // Remove someone in a locked binome: the binome keeps them, and the "no longer in the Team tab" alert stays quiet
  const keep = b.people[1].email;
  call('webRun', 'teamRemove', { email: keep });
  assert(tab('Binomes').find(x => x[B.Binome] === b.code).includes(keep), 'binome untouched');
  call('webRun', 'sync');
  assert(!call('webState').alerts.some(a => a.type === 'MANUAL_EDIT' && a.msg.includes(keep)), 'no missing-from-Team alert');

  // Import after Lock: Replace refused, a merge previews then adds only the new rows (and the one coming back)
  assert.throws(() => call('webRun', 'importTeam', { link: '', replace: true }), /Import only adds new people/);
  run(`db.sheets[0].cells.push(["","New","PERSON","new.person@g.enp.edu.dz",""], ["","No","MAIL","",""])`);
  const before = tab('Team').length;
  let out = call('webRun', 'importTeam', { link: '' }).result;
  assert.deepStrictEqual(out.add.map(m => m.email + ':' + m.back).sort(), [keep + ':true', e + ':false', 'new.person@g.enp.edu.dz:false'].sort());
  assert.deepStrictEqual(out.skipped.map(x => x.why), ['no email']);
  assert.strictEqual(tab('Team').length, before, 'the preview writes nothing');
  out = call('webRun', 'importTeam', { link: '', merge: true }).result;
  assert.strictEqual(tab('Team').length, before + out.add.length);

  // the pending change: Pair As and Not interviewing, judged against what the author saw; a name in a binome is dropped
  const apply = (...cs) => call('webApply', { v: 1, changes: cs.map((c, i) => Object.assign({ id: 'c' + i, kind: 'team', at: Date.now() }, c)) }).results;
  const res = apply({ email: 'new.person@g.enp.edu.dz', field: 'Pair As', value: 'HR', seen: 'IT' },
    { email: 'new.person@g.enp.edu.dz', field: 'Exclude', value: true, seen: false },
    { email: 'new.person@g.enp.edu.dz', field: 'Department', value: 'HR', seen: 'COMM' },
    { email: ne, field: 'Full Name', value: 'X', seen: 'Fixed Name' });
  assert.deepStrictEqual(res.map(x => x.end + (x.sheet ? ':' + x.sheet : '')), ['applied', 'applied', 'dropped:IT', 'dropped']);
  assert(/Correct name or email/.test(res[3].reason));
}
console.log('TEAM OK');
