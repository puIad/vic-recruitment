// The sync watch (docs/admin-features.md, When the timed sync stops): the stamp, webPulse's age, the watchdog and its alert.
const assert = require('assert');
const { run, call } = require('./seed')();

const J = JSON.stringify, MIN = 60000, OWNER = 'admin@g.enp.edu.dz', RH = 'vic.rh@g.enp.edu.dz';
const setS = (k, v) => run(`(function () { var c = master.getSheetByName('Settings').cells; for (var i = 1; i < c.length; i++) if (c[i][0] === ${J(k)}) c[i][1] = ${J(v)}; _settings = null; })()`);
const stamp = () => run('__props.SYNC_STAMP');
const setStamp = minsAgo => run(`__props.SYNC_STAMP = String(Date.now() - ${minsAgo * MIN}); _settings = null`);
const mails = () => JSON.parse(run('JSON.stringify(__outbox.map(function (m) { return { to: m.to, subject: m.subject }; }))'));
const clearMails = () => run('__outbox.length = 0');
const openWatchAlerts = () => JSON.parse(run(`JSON.stringify((function () { var I = idx_(ALERT_H); return master.getSheetByName('Alerts').cells.slice(1)
  .filter(function (r) { return r[I.Key] === 'WATCHDOG' && r[I.Status] === 'OPEN'; }).map(function (r) { return { severity: r[I.Severity], msg: r[I.Message] }; }); })())`));

run('var __as = function (e) { Session = { getEffectiveUser: function () { return { getEmail: function () { return e; } }; }, getActiveUser: function () { return { getEmail: function () { return e; } }; } }; }');
run(`__props.TRIGGER_OWNER = ${J(RH)}`);
setS('TEST_MODE', false);
setS('SYNC_EVERY_MINUTES', 5);

// no stamp yet (just after the deploy): no field, so no banner, and the watchdog stays quiet
assert(!('sync' in call('webPulse', true)), 'no stamp: no field');
assert.strictEqual(typeof call('webPulse'), 'number', 'a page before pending changes still gets the bare number');
clearMails();
run('syncWatchdog()');
assert.deepStrictEqual(mails(), [], 'no stamp: nothing to report');

// only the timed sync moves the stamp, on ok or busy
call('webRun', 'sync');
assert.strictEqual(stamp(), undefined, 'Sync now never moves it');
run('onFormSubmitHandler({})');
assert.strictEqual(stamp(), undefined, 'a form cycle never moves it');
run('__load = loadCtx_; loadCtx_ = function () { throw new Error("Authorization is required") }');
assert.throws(() => run('syncAll()'), /Authorization/);
run('loadCtx_ = __load');
assert.strictEqual(stamp(), undefined, 'a failed cycle counts as stopped');
run('__lockBusy = true; syncAll(); __lockBusy = false');
assert(Number(stamp()) > Date.now() - MIN, 'busy: the trigger is alive');
delete run('__props').SYNC_STAMP;
run('syncAll()');
assert(Number(stamp()) > Date.now() - MIN, 'ok');
assert(!/SYNC_STAMP/.test(run('__props.SNAP_HASH || ""')), 'not part of the snapshot');

// webPulse: the time since the stamp, measured on the server
setStamp(20);
const pulse = call('webPulse', true);
assert(pulse.sync.age >= 20 * MIN && pulse.sync.age < 21 * MIN, J(pulse));
assert.strictEqual(pulse.sync.at, Number(stamp()));
assert(!('script' in pulse.sync), 'an admin who is not vic.rh gets no project link');
run(`ss_().addEditor(${J(RH)}); __as(${J(RH)})`);
assert.strictEqual(call('webPulse', true).sync.script, run('projectUrl_()'), 'the trigger owner gets the project');
run(`__as(${J(OWNER)})`);
{ // members see nothing
  run(`__realAccess = access_; access_ = function () { return { ok: true, role: 'member', email: 'm@g.enp.edu.dz', owner: false, binome: 'B.01' }; }`);
  assert(!('sync' in call('webPulse', true)), 'a member gets no sync field');
  run('access_ = __realAccess');
}

// the threshold: 3 × the interval, floor 15 min, the saved value at once
[[1, 15], [5, 15], [10, 30], [15, 45], [30, 90]].forEach(([every, mins]) => {
  setS('SYNC_EVERY_MINUTES', every);
  assert.strictEqual(run('syncStaleMs_()'), mins * MIN, every + '-minute sync');
});
setS('SYNC_EVERY_MINUTES', 5);

// the watchdog: once per stop, once on recovery, to the Master's owner and vic.rh, in the normal template
setStamp(14); clearMails();
run('syncWatchdog()');
assert.deepStrictEqual(mails(), [], 'under the threshold');
assert(Number(run('__props.WATCHDOG_STAMP')) > Date.now() - MIN, 'it stamps its own runs');

setStamp(15); clearMails();
run('syncWatchdog()');
let sent = mails();
assert.deepStrictEqual(sent.map(m => m.to).sort(), [OWNER, RH].sort(), J(sent));
assert(sent.every(m => /timed sync has stopped/i.test(m.subject)), J(sent));
assert.strictEqual(run('__untemplated.length'), 0, 'the normal mail template');
assert(/reauthorize/.test(run('__outbox[0].htmlBody')), 'the mail carries the steps');
clearMails();
run('syncWatchdog()');
assert.deepStrictEqual(mails(), [], 'once per stop');

setStamp(1); clearMails();
run('syncWatchdog()');
sent = mails();
assert.deepStrictEqual(sent.map(m => m.to).sort(), [OWNER, RH].sort(), J(sent));
assert(sent.every(m => /timed sync is back/i.test(m.subject)), J(sent));
clearMails();
run('syncWatchdog()');
assert.deepStrictEqual(mails(), [], 'once on recovery');

// a stop nobody could be told about is retried at the next run; one that reached someone is not
setStamp(20); clearMails();
run('__mailerOk = __mailer; __mailer = function () { return { code: 200, body: { ok: false, reason: "down" } }; }');
run('syncWatchdog()');
run('__mailer = __mailerOk');
assert.deepStrictEqual(mails(), [], 'the mailer is down');
run('syncWatchdog()');
assert.strictEqual(mails().length, 2, 'retried once the mailer is back');
clearMails();
run(`__sendOk = MailApp.sendEmail; MailApp.sendEmail = function (o) { if (o.to === ${J(RH)}) throw new Error('over quota'); __sendOk(o); }`);
setStamp(1); run('syncWatchdog()'); // the recovery reaches the owner only
run('MailApp.sendEmail = __sendOk');
assert.deepStrictEqual(mails().map(m => m.to), [OWNER]);
clearMails();
run('syncWatchdog()');
assert.deepStrictEqual(mails(), [], 'reached one of them: not sent again');

// a broken run does not count as a run: the stamp stays behind so the 3 h alert fires
run('__props.WATCHDOG_STAMP = "1"; __S = S_; S_ = function () { throw new Error("boom") }');
assert.throws(() => run('syncWatchdog()'), /boom/);
run('S_ = __S');
assert.strictEqual(run('__props.WATCHDOG_STAMP'), '1');
delete run('__props').WATCHDOG_STAMP;

// the watchdog's alert: raised by the timed sync only, MEDIUM, closed when the stamp returns
run('syncAll()');
assert.deepStrictEqual(openWatchAlerts(), [], 'never stamped (not installed yet): no alert');
run(`__props.WATCHDOG_STAMP = String(Date.now() - ${179 * MIN}); syncAll()`);
assert.deepStrictEqual(openWatchAlerts(), [], 'under 3 h');
run(`__props.WATCHDOG_STAMP = String(Date.now() - ${181 * MIN})`);
call('webRun', 'sync');
assert.deepStrictEqual(openWatchAlerts(), [], 'Sync now leaves it to the timed sync');
run('syncAll()');
let alerts = openWatchAlerts();
assert.strictEqual(alerts.length, 1, J(alerts));
assert.strictEqual(alerts[0].severity, 'MEDIUM');
assert(/re-authorize/i.test(alerts[0].msg) && /reauthorize/.test(alerts[0].msg), alerts[0].msg);
run('syncAll()');
assert.strictEqual(openWatchAlerts().length, 1, 'one alert, not one per cycle');
run('__props.WATCHDOG_STAMP = String(Date.now()); syncAll()');
assert.deepStrictEqual(openWatchAlerts(), [], 'the stamp returned');

// installing it: the Master's owner only; a second install replaces the first; Setup leaves it alone
run('ScriptApp.deleteTrigger = function (t) { __triggers.splice(__triggers.indexOf(t), 1); }');
const watchers = () => run(`__triggers.filter(function (t) { return t.getHandlerFunction() === 'syncWatchdog'; }).length`);
run(`__as(${J(RH)})`);
assert.throws(() => run('installWatchdog()'), new RegExp(OWNER), 'vic.rh shares the grant that stops');
assert.strictEqual(watchers(), 0);
run(`__as(${J(OWNER)}); installWatchdog(); installWatchdog()`);
assert.strictEqual(watchers(), 1, 'one trigger however often it is installed');
assert(Number(run('__props.WATCHDOG_STAMP')) > Date.now() - MIN, 'it ran once, so the alert has a stamp to read');
run(`__props.TRIGGER_OWNER = ${J(OWNER)}; installTriggers_(ss_())`);
assert.strictEqual(watchers(), 1, 'Setup does not touch it');
run(`__props.TRIGGER_OWNER = ${J(RH)}`);

// reauthorize: only a log line
{
  const before = run('JSON.stringify(__props)'), trig = run('__triggers.length');
  run('__log = console.log; __said = []; console.log = function (m) { __said.push(m); }; reauthorize(); console.log = __log');
  assert.strictEqual(run('JSON.stringify(__props)'), before, 'no write');
  assert.strictEqual(run('__triggers.length'), trig);
  assert.strictEqual(run('__said.length'), 1);
}

console.log('WATCH OK');
