// Audit 2026-10-19: one refusing sheet, idempotent placement, duplicate codes, code reuse, revert, the HOUR check
const assert = require('assert');
const { run, call, addRegistrations } = require('./seed')();
const J = JSON.stringify;

call('webRun', 'importTeam', { link: '' }); call('webRun', 'draft'); call('webRun', 'lock');
const st0 = () => call('webState');
const fileId = code => st0().binomes.find(b => b.code === code).fileUrl.split('/d/')[1];
const IV = run('idx_(IV_H)'), BFI = run('BFI');
const ivRows = () => run('master.getSheetByName("Interviewees").getDataRange().getValues().slice(1)').filter(r => r[IV.Code] || r[IV['Response Key']]);
const sheetRows = bin => run(`__files[${J(fileId(bin))}].obj.sheets[0].getDataRange().getValues()`).filter(r => r[BFI.Code]);
const alerts = type => st0().alerts.filter(a => a.type === type);
// a sheet that refuses writes (protected): as in Apps Script, the write is held and throws at the next flush
const refuse = (bin, on) => run(`(function(){var sh=__files[${J(fileId(bin))}].obj.sheets[0]; if(!sh.__gr) sh.__gr=sh.getRange;
  sh.getRange=${on ? `function(){var r=sh.__gr.apply(sh,arguments); r.setValues=function(){__flushErr=new Error('You are trying to edit a protected cell'); return r;}; return r;}` : 'sh.__gr'};})()`);

// 1: a refusing sheet raises a HIGH FILE_ERROR, leaves the candidate UNASSIGNED, and the cycle still saves
const bins = st0().binomes.filter(b => b.status === 'ACTIVE').map(b => b.code);
bins.forEach(b => refuse(b, true));
addRegistrations(4, 1);
call('webRun', 'sync');
assert.strictEqual(ivRows().length, 4, 'the cycle saved Interviewees despite the refusing sheets');
assert(ivRows().every(r => r[IV.Code] && !r[IV.Binome] && r[IV.Status] === 'UNASSIGNED'), 'coded, not placed');
const fe = alerts('FILE_ERROR');
assert(fe.length > 0 && fe.every(a => a.severity === 'HIGH'), J(fe));
bins.forEach(b => refuse(b, false));
call('webRun', 'sync');
assert(ivRows().every(r => r[IV.Binome] && r[IV.Status] === 'ASSIGNED'), 'placed once the sheets accept writes');

// 1b: an interview form for a candidate whose sheet refuses the mark is still logged
{
  const r = ivRows()[0], bin = r[IV.Binome], b = st0().binomes.find(x => x.code === bin);
  refuse(bin, true);
  run(`master.getSheetByName('Interview Responses').cells.push([new Date(), ${J(b.people[0].email)}, ${J(bin)}, ${J(r[IV.Code])}, 'intro', ${J(r[IV['1st Choice']])}, ${J(r[IV['1st Choice']])}, ''])`);
  call('webRun', 'sync');
  const now = ivRows().find(x => x[IV.Code] === r[IV.Code]);
  assert.strictEqual(now[IV.Status], 'INTERVIEWED', 'logged although the sheet refuses the mark');
  const mk = alerts('FILE_ERROR').find(a => a.binome === bin && /Cannot mark/.test(a.msg));
  assert(mk && mk.severity === 'HIGH' && mk.code === r[IV.Code], 'its own FILE_ERROR for the mark, even with another open for the binome');
  refuse(bin, false);
  const rowOf = () => run(`__files[${J(fileId(bin))}].obj.sheets[0].cells`).find(c => c[BFI.Code] === r[IV.Code]);
  assert.notStrictEqual(rowOf()[BFI['Interview Done']], true, 'not marked yet');
  call('webRun', 'quick', { op: 'repair', ids: [mk.id] });
  assert.strictEqual(rowOf()[BFI['Interview Done']], true, 'Retry writes the mark');
}

// 2: placing is idempotent: a second append of the same code adds nothing and keeps what the binome typed
{
  const r = ivRows()[1], bin = r[IV.Binome], code = r[IV.Code];
  const rowOfCode = () => run(`__files[${J(fileId(bin))}].obj.sheets[0].cells`).findIndex(c => c[BFI.Code] === code) + 1;
  run(`__files[${J(fileId(bin))}].obj.sheets[0].cells[${rowOfCode() - 1}][BFI.Contacted] = 'Yes'; __touch(${J(fileId(bin))})`); // typed: Drive's "last updated" moves
  const n = sheetRows(bin).length;
  run(`(function(){var ctx=loadCtx_(); appendToBinomeFile_(ctx, ctx.binByCode[${J(bin)}], ctx.ivByCode[${J(code)}]);})()`);
  assert.strictEqual(sheetRows(bin).length, n, 'no second row');
  call('webRun', 'sync');
  assert.strictEqual(ivRows().find(x => x[IV.Code] === code)[IV.Contacted], 'Yes', 'typed value not overwritten');
}

// 3: a code on two rows: the pull reads the first, like memberSet
{
  const r = ivRows()[2], bin = r[IV.Binome], code = r[IV.Code];
  run(`(function(){var c=__files[${J(fileId(bin))}].obj.sheets[0].cells; for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(code)}){ var d=c[i].slice(); d[BFI.Contacted]='Not yet'; c.push(d); c[i][BFI.Contacted]='Yes'; break; } __touch(${J(fileId(bin))}); })()`);
  call('webRun', 'sync');
  assert.strictEqual(ivRows().find(x => x[IV.Code] === code)[IV.Contacted], 'Yes', 'first row wins');
}

// 4: a code whose row was deleted by hand (the baseline keeps it for Revert) is not handed out again
{
  const dep = c => c.split('.')[0];
  const last = ivRows().filter(r => dep(r[IV.Code]) === 'IT').sort((a, b) => a[IV.Code] < b[IV.Code] ? -1 : 1).pop(), gone = last[IV.Code];
  run(`(function(){var sh=ss_().getSheetByName('Interviewees'),d=sh.getDataRange().getValues();
    for(var i=1;i<d.length;i++) if(d[i][${IV.Code}]===${J(gone)}) { sh.deleteRow(i+1); return; }})()`);
  call('webRun', 'sync');
  run(`(function(){var reg=master.getSheetByName('Registration Responses'); reg.cells.push(regRow(new Date(), 'late.it@g.enp.edu.dz','Late','It','late.it@g.enp.edu.dz','01/03/2005','0555777001','IT','HR'));})()`);
  call('webRun', 'sync');
  const fresh = ivRows().find(r => r[IV.Email] === 'late.it@g.enp.edu.dz');
  assert(fresh[IV.Code], 'coded');
  assert.notStrictEqual(fresh[IV.Code], gone);
}

// 6: an interview day saved without a time does not trip the AM/PM check
{
  const r = ivRows().find(x => x[IV.Binome] && x[IV.Status] === 'ASSIGNED'), bin = r[IV.Binome], code = r[IV.Code];
  const day = new Date(Date.now() + 3 * 864e5);
  const dd = ('0' + day.getDate()).slice(-2) + '/' + ('0' + (day.getMonth() + 1)).slice(-2) + '/' + day.getFullYear();
  run(`(function(){var c=__files[${J(fileId(bin))}].obj.sheets[0].cells; for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(code)}) { c[i][BFI['Interview Date']]=${J(dd)}; c[i][BFI['Interview Time']]=''; c[i][BFI.Contacted]='Yes'; } __touch(${J(fileId(bin))}); })()`);
  call('webRun', 'sync');
  call('webRun', 'integrity', {});
  assert.deepStrictEqual(st0().alerts.filter(a => a.type === 'ODD_VALUE' && /AM\/PM/.test(a.msg) && a.code === code), [], 'no HOUR alert without a time');
  run(`(function(){var c=__files[${J(fileId(bin))}].obj.sheets[0].cells; for(var i=1;i<c.length;i++) if(c[i][BFI.Code]===${J(code)}) c[i][BFI['Interview Time']]='03:00'; __touch(${J(fileId(bin))}); })()`);
  call('webRun', 'sync'); call('webRun', 'integrity', {});
  assert(st0().alerts.some(a => a.type === 'ODD_VALUE' && /AM\/PM/.test(a.msg) && a.code === code), 'still fires for a real odd time');
}

// 7: the /apply form writes its Timestamp RAW, as a sheet serial; the cell reads as a number until it gets a date format
// and as a Date after. Both reads are one registration, not two (live 2026-10-26: each test letter came in twice)
{
  const ms = Date.UTC(2026, 9, 26, 17, 33, 25, 730), serial = (ms + 3600e3) / 864e5 + 25569; // as VIC-ENP's sheetSerial, Algiers
  const before = ivRows().length;
  run(`(function(){var reg=master.getSheetByName('Registration Responses'); reg.cells.push(regRow(${serial}, 'serial.it@g.enp.edu.dz','Serial','It','serial.it@g.enp.edu.dz','01/03/2005','0555777002','IT','HR'));})()`);
  call('webRun', 'sync');
  assert.strictEqual(ivRows().length, before + 1, 'the serial timestamp is imported');
  run(`(function(){var c=master.getSheetByName('Registration Responses').cells; c[c.length-1][0]=new Date(${ms});})()`);
  call('webRun', 'sync');
  const mine = ivRows().filter(r => r[IV.Email] === 'serial.it@g.enp.edu.dz');
  assert.strictEqual(mine.length, 1, 'once, after the cell turns into a date: ' + J(mine.map(r => r[IV['Response Key']])));
  assert.strictEqual(String(mine[0][IV['Response Key']]), ms + '|serial.it@g.enp.edu.dz', 'keyed by the moment, in ms');
  // a registration imported before the fix (keyTime_ as it was) holds the serial as its key, in the row and the baseline
  const legacy = String(serial + 1) + '|legacy.it@g.enp.edu.dz', keys = () => J(ivRows().filter(r => r[IV.Email] === 'legacy.it@g.enp.edu.dz').map(r => String(r[IV['Response Key']])));
  run(`var __keyTime = keyTime_; keyTime_ = function (ts) { return ts instanceof Date ? ts.getTime() : String(ts); }`);
  run(`(function(){var reg=master.getSheetByName('Registration Responses'); reg.cells.push(regRow(${serial + 1}, 'legacy.it@g.enp.edu.dz','Legacy','It','legacy.it@g.enp.edu.dz','01/03/2005','0555777003','IT','HR'));})()`);
  call('webRun', 'sync');
  run('keyTime_ = __keyTime');
  assert.strictEqual(keys(), J([legacy]), 'imported under its serial, as before the fix');
  // still the same registration while its cell reads as the number, and once it is a date
  call('webRun', 'sync');
  assert.strictEqual(keys(), J([legacy]), 'the serial-keyed row is recognised while its cell is a number');
  run(`(function(){var c=master.getSheetByName('Registration Responses').cells; c[c.length-1][0]=new Date(${ms + 864e5});})()`);
  call('webRun', 'sync');
  assert.strictEqual(keys(), J([legacy]), 'the serial-keyed row is recognised once its cell is a date');
  // deleted by hand, it stays aside (MANUAL_EDIT) instead of coming back with a new code
  run(`(function(){var c=master.getSheetByName('Interviewees').cells; for(var i=c.length-1;i>0;i--) if(c[i][${IV.Email}]==='legacy.it@g.enp.edu.dz') c.splice(i,1);})()`);
  call('webRun', 'sync');
  assert.strictEqual(keys(), J([]), 'a serial-keyed row deleted by hand is not imported again');
}

console.log('pipeline OK');
