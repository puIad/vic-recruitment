/* ---------- telling candidates their result (docs/admin-features.md › Telling candidates their result) ---------- */
// Three mails (accepted, not accepted and interviewed, not accepted and not interviewed), sent to everyone from one preview by
// vic.rh once the results are final. The Master's Result Told column holds what a candidate was told and when ("IT 12/11"), written
// only after Google accepts the mail. The accepted mail's button is a signed /join/<token> link on vic-enp, which records the first
// click and redirects to the department's Messenger group; the script pushes the four group links and each told candidate's
// department there (JOIN_URL, JOIN_SECRET script properties; vic-enp's JOIN_SECRET is the same value).

const RES_COL = 'Result Told';
const RES_KINDS = ['RESULT_YES', 'RESULT_NO', 'RESULT_NO_NI'];
const RES_SAVE_EVERY = 20; // mails between two writes of Result Told: a run that dies loses at most this many marks
const RES_SAMPLE = { first: 'Amina', code: 'IT.42' };

/** A Settings value of the result mails: a group link is https, a text is within the mail limit. Throws why not. */
function resultSettingCheck_(k, v) {
  v = String(v == null ? '' : v);
  if (/^RESULT_GROUP_/.test(k)) { if (v && !/^https:\/\/[^\s<>"]+$/.test(v)) throw new Error(k + ' must be an https link'); return; }
  if (v.length > MAIL_MAX) throw new Error(k + ' is over ' + MAIL_MAX + ' characters');
}

const resTold_ = (I, r) => String(r[I[RES_COL]] || '').trim();
/** "IT 12/11" -> "IT", "Not accepted 12/11" -> "Not accepted". */
const resToldResult_ = told => String(told).replace(/\s+\d\d\/\d\d$/, '');
const resMark_ = (result, now) => result + ' ' + fmt_(now, 'dd/MM');
const resValid_ = result => AFFECTATION_OPTIONS.indexOf(result) >= 0;
const resNext_ = d => String(S_()['RESULT_NEXT_' + d] || '').trim();
const resGroup_ = d => String(S_()['RESULT_GROUP_' + d] || '').trim();
/** The mail a result calls for: a department is accepted; Not accepted splits on whether the interview happened. */
const resKind_ = (status, result) => DEPTS.indexOf(result) >= 0 ? 'RESULT_YES' : status === ST.INTERVIEWED ? 'RESULT_NO' : 'RESULT_NO_NI';

/* ---------- the join link ---------- */

function resProp_(name, what) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error(name + ' is not set in the script properties (' + what + ').');
  return String(v);
}
const resUrl_ = () => resProp_('JOIN_URL', 'the address of the vic-enp site').replace(/\/+$/, '');
const resSecret_ = () => resProp_('JOIN_SECRET', 'the secret shared with vic-enp');
/** The first 22 characters of the HMAC of the code: vic-enp checks the same (api/_lib/join.ts). */
function resSign_(code) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature('join:' + code, resSecret_())).replace(/=+$/, '').slice(0, 22);
}
/** The link in a candidate's mail. The token names the candidate and holds no department. test: a token vic-enp records nothing for. */
function resLink_(code, test) {
  if (test && !resConfigured_()) return 'https://example.invalid/join/TEST'; // a preview before the setup still draws
  return resUrl_() + '/join/' + (test ? 'TEST' : code) + '~' + resSign_(test ? 'TEST' : code);
}
function resConfigured_() { const p = PropertiesService.getScriptProperties(); return !!p.getProperty('JOIN_URL') && !!p.getProperty('JOIN_SECRET'); }

/** Gives vic-enp the four group links and these candidates' current results ({code: result}). Throws when it can't, so nothing is sent. */
function resPush_(told) {
  const links = {}; DEPTS.forEach(d => { links[d] = resGroup_(d); });
  const body = { links: links, told: told };
  let r;
  try {
    r = UrlFetchApp.fetch(resUrl_() + '/api/join-sync', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + resSecret_() },
      payload: JSON.stringify(body), muteHttpExceptions: true });
  } catch (e) { throw new Error('The push to vic-enp failed (' + String(e && e.message || e).slice(0, 120) + '): nothing was sent.'); }
  if (r.getResponseCode() !== 200) throw new Error('The push to vic-enp failed (it answered ' + r.getResponseCode() + '): nothing was sent.');
  return body;
}

/** The timed sync: once mails have gone, keeps vic-enp's links and results current (a changed link also fixes the mails already sent). */
function resSyncLinks_(ctx) {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('JOIN_SECRET') || !props.getProperty('JOIN_URL')) return;
  const I = ctx.iv.I, told = {};
  if (!ctx.iv.data.some(r => resTold_(I, r))) return;
  ctx.iv.data.forEach(r => { if (resTold_(I, r) && resValid_(p1Stored_(I, r))) told[String(r[I.Code]).trim()] = p1Stored_(I, r); });
  const links = {}; DEPTS.forEach(d => { links[d] = resGroup_(d); });
  const h = hash_(JSON.stringify({ links: links, told: told }));
  if (props.getProperty('JOIN_PUSHED') === h) return;
  resPush_(told);
  props.setProperty('JOIN_PUSHED', h);
}

/** Reset: vic-enp forgets every told candidate and click. Never fails the reset. */
function resJoinReset_() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('JOIN_PUSHED');
  if (!resConfigured_()) return;
  try {
    const r = UrlFetchApp.fetch(resUrl_() + '/api/join-sync', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + resSecret_() },
      payload: JSON.stringify({ reset: true }), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) console.warn('Join reset: vic-enp answered ' + r.getResponseCode());
  } catch (e) { console.warn('Join reset: ' + e); }
}

/** webRun('resultClicks'): {ok, clicks: {code: ms of the first click}}; ok false when vic-enp can't say (down, not set up). */
function resClicksCore_() {
  try {
    const r = UrlFetchApp.fetch(resUrl_() + '/api/join-clicks', { method: 'get', headers: { Authorization: 'Bearer ' + resSecret_() }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return { ok: false, reason: 'vic-enp answered ' + r.getResponseCode() };
    return { ok: true, clicks: JSON.parse(r.getContentText()).clicks || {} };
  } catch (e) { return { ok: false, reason: String(e && e.message || e).slice(0, 120) }; }
}

/* ---------- who gets what ---------- */

/** Codes with a Phase 1 Result correction logged: a correction is a mail owed, never part of Send results. */
function resCorrected_() {
  const out = {};
  if (!ss_().getSheetByName(TAB.IV_CHANGES)) return out;
  const t = loadTable_(TAB.IV_CHANGES, IC_H), C = t.I;
  t.data.forEach(r => { if (/^Phase 1 Result correction/.test(String(r[C.What]))) out[String(r[C.Code]).trim()] = true; });
  return out;
}

function resCand_(I, r) {
  const s = v => String(v == null ? '' : v).trim(), email = s(r[I.Email]);
  return { code: s(r[I.Code]), name: (s(r[I['First Name']]) + ' ' + s(r[I['Family Name']])).trim(), first: s(r[I['First Name']]) || 'there',
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '', status: r[I.Status], interviewed: r[I.Status] === ST.INTERVIEWED,
    result: p1Stored_(I, r), told: resTold_(I, r), proposal: p1Proposal_(I, r) };
}

/** The table's candidates sorted by what they are owed. send: not told, to be told by Send results; owed: a correction mail;
 *  skipped: has a result but gets no mail (gone, no address); told: how many are told; started: has a result mail gone. */
function resAudience_(iv) {
  const I = iv.I, cor = resCorrected_(), out = { send: [], owed: [], skipped: [], told: 0, started: iv.data.some(r => resTold_(I, r)) };
  iv.data.forEach(r => {
    if (!String(r[I.Code]).trim()) return;
    const c = resCand_(I, r);
    if (!resValid_(c.result)) return;
    if (c.told) { out.told++; if (!p1NoResult_(c.status) && resToldResult_(c.told) !== c.result) out.owed.push(c); return; }
    if (p1NoResult_(c.status)) return out.skipped.push({ code: c.code, name: c.name, why: 'is now ' + c.status });
    if (cor[c.code] && out.started) return out.owed.push(c);
    if (!c.email) return out.skipped.push({ code: c.code, name: c.name, why: 'has a missing or invalid address' });
    out.send.push(c);
  });
  return out;
}

/** The mail one candidate gets for c.result. o: replaces (the "replaces the earlier one" line), test (a link that records nothing),
 *  texts ({kind: {field: text}}) and nexts ({dept: text}) as typed in the dialog, before they are saved. */
function resMail_(c, o) {
  o = o || {};
  const kind = resKind_(c.status, c.result), yes = kind === 'RESULT_YES';
  const next = o.nexts && o.nexts[c.result] != null ? String(o.nexts[c.result]).trim() : resNext_(c.result);
  const lead = o.replaces ? (o.replacesText != null ? String(o.replacesText) : String(S_().RESULT_REPLACES || '')).trim() : '';
  return mailFrom_(kind, { first: c.first, code: c.code, department: c.result, next: next },
    { dept: c.result, lead: lead, texts: o.texts && o.texts[kind], cta: yes ? { label: 'Join the ' + c.result + ' group', url: resLink_(c.code, o.test) } : undefined });
}

/** Why Send results (or a correction's send) is refused for these candidates, as sentences. nexts: next steps typed in the dialog. */
function resRefusals_(list, nexts) {
  const ref = [];
  DEPTS.filter(d => list.some(c => c.result === d)).forEach(d => {
    const next = nexts && nexts[d] != null ? String(nexts[d]).trim() : resNext_(d);
    if (!next) ref.push(d + ' has accepted candidates and no next step (Settings › Emails).');
    if (!/^https:\/\//.test(resGroup_(d))) ref.push(d + ' has accepted candidates and no group link (Settings › Emails).');
  });
  return ref;
}

/** The text fields of the three mails as they stand (saved or default), for the dialog. */
function resTexts_() {
  const t = {};
  RES_KINDS.forEach(k => { t[k] = {}; mailDef_(k).fields.forEach(f => { t[k][f[0]] = mailField_(k, f[0]); }); });
  return t;
}

/** Writes the dialog's edits to Settings as a logged direct write; the keys it changed. */
function resSaveTexts_(a, args) {
  const values = {};
  Object.keys(args.texts || {}).forEach(k => {
    if (RES_KINDS.indexOf(k) < 0) throw new Error('Not a result mail: ' + k);
    Object.keys(args.texts[k]).forEach(f => { if (mailDef_(k).fields.some(x => x[0] === f)) values['MAIL_' + k + '_' + f.toUpperCase()] = args.texts[k][f]; });
  });
  Object.keys(args.nexts || {}).forEach(d => { if (DEPTS.indexOf(d) >= 0) values['RESULT_NEXT_' + d] = args.nexts[d]; });
  if (args.replaces != null) values.RESULT_REPLACES = args.replaces;
  const msg = saveSettings_(values), saved = /^Settings saved: ([^\n]*)/.exec(msg), keys = saved ? saved[1].split(', ') : [];
  if (keys.length) logIvChange_({ now: new Date() }, '', 'Result mail texts saved by ' + a.email, '', keys.join(', '));
  return keys;
}

/** One sample of each of the six mails, drawn with real candidates' data where there are some. */
function resSamples_(iv, o) {
  const I = iv.I, fin = p1Final_(), pick = (test, label) => { const r = iv.data.filter(x => String(x[I.Code]).trim() && !p1NoResult_(x[I.Status]) && test(x, p1Result_(I, x, !!fin)))[0]; return r ? Object.assign(resCand_(I, r), { result: p1Result_(I, r, !!fin) }) : null; };
  const out = [];
  DEPTS.forEach(d => {
    const c = pick((x, res) => res === d) || { code: RES_SAMPLE.code, first: RES_SAMPLE.first, status: ST.INTERVIEWED, result: d, name: '', email: '' };
    out.push({ kind: 'RESULT_YES', label: 'Accepted into ' + d, code: c.code, name: c.name, mail: resMail_(c, Object.assign({}, o, { test: true })) });
  });
  [['Not accepted, interviewed', ST.INTERVIEWED], ['Not accepted, not interviewed', ST.ASSIGNED]].forEach(s => {
    const c = pick((x, res) => res === 'Not accepted' && (s[1] === ST.INTERVIEWED) === (x[I.Status] === ST.INTERVIEWED)) ||
      { code: RES_SAMPLE.code, first: RES_SAMPLE.first, status: s[1], result: 'Not accepted', name: '', email: '' };
    out.push({ kind: resKind_(c.status, 'Not accepted'), label: s[0], code: c.code, name: c.name, mail: resMail_(c, Object.assign({}, o, { test: true })) });
  });
  return out;
}

/* ---------- Send results ---------- */

/** webRun('resultsMail', {op: 'preview' | 'test' | 'send', texts?, nexts?, replaces?, budgetMs?}). Send results of the Results page.
 *  preview: {final, owner, started, counts, total, told, left, owed, skipped, notInterviewed, declinedWaiting, samples, texts, nexts, replaces, refusals, testMode}.
 *  test: one copy of each mail to the presser (Result Told stays empty, the link records nothing).
 *  send: vic.rh only; everyone not told, in one batch; stops near the time limit and says how many are left. In TEST_MODE it is a test. */
function resultsMailCore_(a, args) {
  args = args || {};
  const op = String(args.op || 'preview');
  if (['preview', 'test', 'send'].indexOf(op) < 0) throw new Error('Not a change this entry knows.');
  if (op === 'send' && !p1IsOwner_(a)) throw new Error('Only vic.rh (the Master\'s owner) can send the results.');
  const o = { texts: args.texts, nexts: args.nexts };
  if (op === 'preview') {
    const iv = loadTable_(TAB.IV, IV_H), aud = resAudience_(iv), I = iv.I, counts = { RESULT_YES: {}, RESULT_NO: 0, RESULT_NO_NI: 0 };
    DEPTS.forEach(d => { counts.RESULT_YES[d] = 0; });
    aud.send.forEach(c => { const k = resKind_(c.status, c.result); if (k === 'RESULT_YES') counts.RESULT_YES[c.result]++; else counts[k]++; });
    const refusals = [];
    if (!p1Final_()) refusals.push('The results are not final.');
    resRefusals_(aud.send, o.nexts).forEach(x => refusals.push(x));
    if (!aud.send.length) refusals.push('Nobody is left to tell.');
    if (!resConfigured_()) refusals.push('JOIN_URL and JOIN_SECRET are not set in the script properties: the group links cannot work.');
    return { final: !!p1Final_(), owner: p1IsOwner_(a), started: aud.started, counts: counts, total: aud.send.length, told: aud.told, left: aud.send.length, owed: aud.owed.length,
      skipped: aud.skipped, notInterviewed: aud.send.filter(c => c.result === 'Not accepted' && !c.interviewed && c.proposal).map(c => ({ code: c.code, name: c.name, status: c.status, proposal: c.proposal })),
      declinedWaiting: rejectionList_(loadCtx_()).length, samples: resSamples_(iv, o).map(s => ({ kind: s.kind, label: s.label, code: s.code, name: s.name, subject: s.mail.subject, html: s.mail.html })),
      texts: resTexts_(), nexts: { IT: resNext_('IT'), COMM: resNext_('COMM'), FLER: resNext_('FLER'), HR: resNext_('HR') }, replaces: String(S_().RESULT_REPLACES || ''),
      refusals: refusals, testMode: bool_(S_().TEST_MODE) };
  }
  if (op === 'test' || bool_(S_().TEST_MODE)) {
    const iv = loadTable_(TAB.IV, IV_H);
    resSecret_(); resUrl_(); // a test link needs the secret and the address, as a send does
    let sent = 0, held = 0;
    resSamples_(iv, o).forEach(s => {
      // Held rows (the presser is not in ADMIN_EMAIL while test mode is on) are logged as TEST, never as a first result mail
      if (mail_(a.email, '[TEST] ' + s.mail.subject, s.mail.html, s.mail.from, { kind: 'TEST', concerns: [s.kind] })) sent++; else held++;
    });
    mailLogSettle_();
    say_(op === 'send' ? 'Test mode is on: one copy of each of the 6 mails went to you, nobody else was emailed and nobody was marked as told.'
      : sent + ' test mail' + (sent === 1 ? '' : 's') + ' sent to ' + a.email + (held ? '; ' + held + ' held by test mode (' + a.email + ' is not in ADMIN_EMAIL)' : '') + '.');
    return { test: true, sent: sent, held: held, left: 0 };
  }
  const t0 = Date.now(), budget = Number(args.budgetMs) || 240000;
  const res = withLock_(() => {
    if (!p1Final_()) throw new Error('The results are not final.');
    const iv = loadTable_(TAB.IV, IV_H), I = iv.I, aud = resAudience_(iv);
    const ref = resRefusals_(aud.send, o.nexts);
    if (ref.length) throw new Error(ref.join(' '));
    if (!aud.send.length) throw new Error('Nobody is left to tell.');
    resSecret_(); resUrl_();
    // the words go to Settings before the first mail, so Send again and later corrections use the same words
    resSaveTexts_(a, args);
    const told = {};
    iv.data.forEach(r => { const c = resCand_(I, r); if (c.told || aud.send.some(x => x.code === c.code)) told[c.code] = c.result; });
    resPush_(told);
    const byCode = {}; iv.data.forEach(r => { byCode[String(r[I.Code]).trim()] = r; });
    let i = 0, sent = 0, failed = 0, unsaved = 0;
    for (; i < aud.send.length && Date.now() - t0 < budget; i++) {
      const c = aud.send[i];
      if (!mailSend_(c.email, resMail_(c, {}), [c.code, c.result])) { failed++; continue; } // a failed mail gets a Failed row and no mark
      byCode[c.code][I[RES_COL]] = resMark_(c.result, new Date());
      sent++;
      if (++unsaved >= RES_SAVE_EVERY) { saveTable_(iv); unsaved = 0; }
    }
    if (unsaved) saveTable_(iv);
    return { sent: sent, failed: failed, left: aud.send.length - i, test: false };
  }, 60000);
  if (!res) { busy_(); return null; }
  say_(res.sent + ' result mail' + (res.sent === 1 ? '' : 's') + ' sent.' + (res.failed ? ' ' + res.failed + ' failed (daily quota or a bad address): Send again reaches them.' : '') +
    (res.left ? ' ' + res.left + ' not tried yet: press Send again to carry on.' : ''));
  return res;
}

/* ---------- one candidate's mail (a correction, or a late first result) ---------- */

/** webRun('resultMailOne', {op: 'preview' | 'send', code, replaces?}). The correction dialog's preview and Send, and the row menu's.
 *  A candidate already told also gets the "replaces the earlier one" line (replaces: the line as edited). vic.rh only to send. */
function resultMailOneCore_(a, args) {
  const op = String(args.op || 'preview'), code = String(args.code || '').trim();
  if (['preview', 'send'].indexOf(op) < 0) throw new Error('Not a change this entry knows.');
  if (op === 'send' && !p1IsOwner_(a)) throw new Error('Only vic.rh (the Master\'s owner) can send a result mail.');
  const build = () => {
    if (!p1Final_()) throw new Error('The results are not final: Send results tells everyone at once.');
    const iv = loadTable_(TAB.IV, IV_H), I = iv.I, r = iv.data.filter(x => String(x[I.Code]).trim() === code)[0];
    if (!r) throw new Error(code + ' is not a candidate.');
    const c = resCand_(I, r);
    if (!resValid_(c.result)) throw new Error(code + ' has no result yet.');
    if (p1NoResult_(c.status)) throw new Error(code + ' gets no result mail (' + c.status + ').');
    if (!iv.data.some(x => resTold_(I, x))) throw new Error('No result mail has gone yet: Send results tells everyone at once.');
    if (!c.email) throw new Error(code + ' has a missing or invalid address.');
    if (c.told && resToldResult_(c.told) === c.result) throw new Error(code + ' was already told ' + c.told + '.');
    if (DEPTS.indexOf(c.result) >= 0) { const ref = resRefusals_([c]); if (ref.length) throw new Error(ref.join(' ')); }
    return { iv: iv, I: I, r: r, c: c, m: resMail_(c, { replaces: !!c.told, replacesText: args.replaces }) };
  };
  if (op === 'preview') {
    resSecret_(); resUrl_();
    const b = build();
    return { code: code, name: b.c.name, to: b.c.email, result: b.c.result, told: b.c.told, subject: b.m.subject, html: b.m.html,
      replaces: b.c.told ? String(args.replaces != null ? args.replaces : S_().RESULT_REPLACES || '') : '', testMode: bool_(S_().TEST_MODE) };
  }
  const out = withLock_(() => {
    const b = build();
    if (bool_(S_().TEST_MODE)) {
      const sent = mail_(a.email, '[TEST] ' + b.m.subject, b.m.html, b.m.from, { kind: 'TEST', concerns: [code] });
      mailLogSettle_();
      return { test: true, sent: !!sent };
    }
    const told = {}; told[code] = b.c.result;
    resPush_(told);
    if (!mailSend_(b.c.email, b.m, [code, b.c.result])) return { sent: false, test: false };
    b.r[b.I[RES_COL]] = resMark_(b.c.result, new Date());
    saveTable_(b.iv);
    return { sent: true, test: false, told: b.r[b.I[RES_COL]] };
  }, 60000);
  if (!out) { busy_(); return null; }
  say_(out.test ? 'Test mode is on: a copy went to you, ' + code + ' was not emailed and not marked as told.'
    : out.sent ? 'Result mail sent to ' + code + '.' : 'The mail to ' + code + ' failed: see the Mail Log, then Resend it from the alert.');
  return out;
}
