/* ---------- screening: hold low-effort applications, decline VIC members, the rejection email ---------- */
// Owner's decisions (docs/launch-features.md, 2026-10-15): a risky application always waits for a person, never declined on
// its score; an application from a VIC member is declined and nobody is told; the other declined applicants get one polite
// email, sent by an admin once recruitment closes. Off (SCREENING FALSE) = everything as before.

const SCREEN_MEMBER = 'VIC member'; // Screening starts with it = declined as a member: no rejection email
const MEMBERS_TTL_MIN = 30;         // the members sheet is read again after this long (Settings › Screening › Refresh now: at once)
const REJECT_SUBJECT = 'VIC Recruitment 2026: your application';
const REJECT_BODY = 'Hi {first},\n\nThank you for applying to the Vision & Innovation Club. We read every application carefully, ' +
  'and we are sorry to tell you that we will not be moving forward with yours this year.\n\nWe hope to see you at our events, ' +
  'and you are welcome to apply again next year.\n\nThe VIC team';

function screenOn_() { return bool_(S_().SCREENING); }

/** A new registration under screening: {member, hold, score, note}. A member is not scored. */
function screenNew_(ctx, H, row, rec) {
  if (vicMembers_(ctx).has([rec.collected, rec.typedEmail])) return { member: true, hold: false, score: 0, note: SCREEN_MEMBER };
  const get = i => (i >= 0 ? row[i] : '');
  const s = screenApplication({ whyVic: get(H.whyVic), whyDept: rec.c1 && H.motiv[rec.c1] !== undefined ? get(H.motiv[rec.c1]) : null,
    dept: rec.c1, anything: get(H.anything) });
  const hold = s.score >= num_(S_().SCREEN_HOLD_AT, 50);
  return { member: false, hold: hold, score: s.score, note: (hold ? 'Held: ' : '') + s.reasons.join('; ') };
}

/** The VIC members, once per run: {has(emails), ok, error, n}. The linked sheet (script cache, read again after
 *  MEMBERS_TTL_MIN) plus the Team tab. An unreadable sheet gives ok false: the Team tab still counts, nobody else is
 *  declined on a guess. */
function vicMembers_(ctx) {
  if (ctx.vicMembers) return ctx.vicMembers;
  const read = membersSheet_(false), set = {};
  (read.list || []).forEach(e => { set[e] = true; });
  ctx.team.data.forEach(r => { const e = lc_(r[ctx.team.I.Email]); if (e) set[e] = true; });
  return (ctx.vicMembers = { ok: !read.error, error: read.error, n: (read.list || []).length,
    has: emails => emails.some(e => set[lc_(e)]) });
}

/** The linked sheet's emails: {list, at, error}. force = read now. Remembers the last read in VIC_MEMBERS_READ (Settings). */
function membersSheet_(force) {
  const link = String(S_().VIC_MEMBERS_SHEET || '').trim();
  if (!link) return { list: [], at: 0, error: '' };
  const cache = CacheService.getScriptCache();
  if (!force) {
    try {
      const c = JSON.parse(cache.get('vicmembers') || 'null');
      if (c && c.link === link && Date.now() - c.at < MEMBERS_TTL_MIN * 60000) return c;
    } catch (e) { /* read again */ }
  }
  let o;
  try { o = { link: link, at: Date.now(), list: readMembersSheet_(link), error: '' }; }
  catch (e) { o = { link: link, at: Date.now(), list: null, error: String(e && e.message || e) }; }
  PropertiesService.getScriptProperties().setProperty('VIC_MEMBERS_READ', JSON.stringify({ at: o.at, n: o.list ? o.list.length : 0, error: o.error }));
  // a failed read is not kept: the next run tries again. Over 100 KB (about 3,000 emails) it is read on every run.
  if (o.list) { try { cache.put('vicmembers', JSON.stringify(o), 21600); } catch (e) { console.warn('Members list not cached: ' + e); } }
  return o;
}

/** Emails of the linked sheet: the column whose header (in its first 5 rows) contains "mail", on the tab named by the
 *  link's gid, else on the first tab that has one. Throws a readable reason. */
function readMembersSheet_(link) {
  const id = (link.match(/\/d\/([\w-]{20,})/) || link.match(/^([\w-]{20,})$/) || [])[1];
  if (!id) throw new Error('"' + link + '" is not a Google Sheets link');
  let book;
  try { book = SpreadsheetApp.openById(id); } catch (e) { throw new Error('no access to the members sheet (share it with this account as a viewer)'); }
  const gid = (link.match(/[#&?]gid=(\d+)/) || [])[1];
  const tabs = book.getSheets().filter(sh => gid === undefined || String(sh.getSheetId()) === gid);
  for (let t = 0; t < tabs.length; t++) {
    const v = tabs[t].getDataRange().getValues();
    for (let h = 0; h < Math.min(5, v.length); h++) {
      const c = v[h].findIndex(x => normText(x).indexOf('mail') >= 0);
      if (c < 0) continue;
      const out = [];
      v.slice(h + 1).forEach(r => { const e = lc_(r[c]); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && out.indexOf(e) < 0) out.push(e); });
      return out;
    }
  }
  throw new Error('no column with "mail" in its header in the members sheet');
}

const approved_ = (ctx, r) => /\b(Approved|Restored) by /.test(String(r[ctx.iv.I.Screening]));

/** Each run: decline the VIC members still waiting (the list may have changed), flag the ones already with a binome,
 *  raise NEEDS_REVIEW for every application on hold, and close what no longer applies. Held rows wait for a person
 *  whether Screening is on or not. */
function screenWaiting_(ctx) {
  const I = ctx.iv.I, on = screenOn_(), members = on ? vicMembers_(ctx) : null, current = {};
  if (members && !members.ok) {
    current['MEMBERS|SHEET'] = true;
    ctx.alerts.add({ severity: 'HIGH', type: 'MEMBERS_SHEET', code: '', binome: '', key: 'MEMBERS|SHEET', notifyBinome: false,
      msg: 'The VIC members sheet can\'t be read (' + members.error + '). Registrations carry on without the member check (the Team tab still counts) until it can: fix the link in Settings › Screening.' });
  }
  ctx.iv.data.forEach(r => {
    const rk = String(r[I['Response Key']]), st = r[I.Status], label = ivLabel_(ctx, r);
    if (!rk || isOut_(st)) return;
    if (members && !approved_(ctx, r) && members.has([r[I.Email], r[I['Typed Email']]])) {
      if (st === ST.UNASSIGNED || st === ST.HELD) {
        r[I.Status] = ST.DECLINED;
        r[I.Screening] = SCREEN_MEMBER + (String(r[I.Screening]).trim() ? '; ' + r[I.Screening] : '');
        ctx.alerts.add({ severity: 'INFO', type: 'VIC_MEMBER_DECLINED', status: 'AUTO-FIXED', code: label, binome: '', key: '',
          msg: label + ' (' + r[I.Email] + ') is on the VIC members list: declined silently, nobody was emailed.' });
        return;
      }
      if (r[I.Binome] && PENDING_STATUSES.indexOf(st) >= 0) {
        const key = 'MEMBER|' + rk;
        current[key] = true;
        ctx.alerts.add({ severity: 'MEDIUM', type: 'VIC_MEMBER', code: label, binome: r[I.Binome], key: key, notifyBinome: false,
          msg: label + ' is on the VIC members list but is with ' + r[I.Binome] + '. Decline takes them out of its sheet; nobody is emailed. ' +
            'They stay if the binome already called them and you keep them.' });
      }
    }
    if (st === ST.HELD) {
      const key = 'REVIEW|' + rk;
      current[key] = true;
      ctx.alerts.add({ severity: 'MEDIUM', type: 'NEEDS_REVIEW', code: label, binome: '', key: key, notifyBinome: false,
        msg: label + ' (' + String(r[I['1st Choice']]) + ') is on hold for review, risk ' + r[I.Risk] + ': ' +
          String(r[I.Screening]).replace(/^Held: /, '') + '. Approve sends them to a binome; Decline keeps them out.' });
    }
  });
  const A = ctx.alerts.table.I;
  ctx.alerts.resolveWhere(x => ['NEEDS_REVIEW', 'VIC_MEMBER', 'MEMBERS_SHEET'].indexOf(x[A.Type]) >= 0 && !current[x[A.Key]]);
}

/** One decision on one row, in memory (the caller saves under the lock, with commitBase_). decision: approve (on hold →
 *  a binome), decline (out; taken out of their binome sheet if they had one; member = as a VIC member, no rejection
 *  email), restore (declined → a binome; never held or declined as a member again). Returns a sentence; throws why not. */
function reviewRow_(ctx, x, decision, member) {
  const I = ctx.iv.I, st = x[I.Status], label = ivLabel_(ctx, x);
  const stamp = ' by ' + (Session.getActiveUser().getEmail() || 'an admin') + ', ' + fmt_(ctx.now, 'dd/MM HH:mm');
  const note = (s, first) => {
    const old = String(x[I.Screening]).trim();
    x[I.Screening] = first ? s + stamp + (old ? '; ' + old : '') : (old ? old + '; ' : '') + s + stamp;
  };
  const place = () => {
    x[I.Status] = ST.UNASSIGNED;
    const placed = assignRow_(ctx, x);
    indexCtx_(ctx);
    return placed ? ', assigned to ' + x[I.Binome] + (x[I.Code] ? ' as ' + x[I.Code] : '') : ', waiting for a binome';
  };
  if (decision === 'approve') {
    if (st !== ST.HELD) throw new Error(label + ' is not on hold any more.');
    note('Approved');
    return label + ' approved' + place() + '.';
  }
  if (decision === 'restore') {
    if (st !== ST.DECLINED) throw new Error(label + ' is not declined.');
    note('Restored');
    return label + ' restored' + place() + '.';
  }
  if (decision !== 'decline') throw new Error('unknown decision "' + decision + '".');
  if (isOut_(st)) throw new Error(label + ' is already out.');
  if (st === ST.INTERVIEWED || st === ST.WITHDRAWN) throw new Error(label + ' is ' + st.toLowerCase() + ': there is nothing to decline.');
  const had = String(x[I.Binome]).trim();
  if (had) {
    if (ctx.binByCode[had]) removeFromBinomeFile_(ctx, ctx.binByCode[had], String(x[I.Code]).trim());
    ['Binome', 'Assigned At', 'Contacted', 'Contacted Seen At', 'Interview Date', 'Interview Time', 'Interview At'].forEach(h => { x[I[h]] = ''; });
  }
  x[I.Status] = ST.DECLINED;
  if (member) note(SCREEN_MEMBER + ', declined', true); else note('Declined');
  return label + ' declined' + (had ? ', taken out of the sheet of ' + had : '') + '. Nobody was emailed.';
}

/** webRun('restore', {codes}): declined applications back in, each placed in a binome. */
function restoreCore_(codes) {
  codes = [].concat(codes || []).map(c => String(c).trim()).filter(Boolean);
  if (!codes.length) throw new Error('No interviewee given.');
  const res = withLock_(() => {
    const ctx = loadCtx_();
    detectEdits_(ctx);
    let done = 0;
    const lines = codes.map(c => {
      const x = ctx.ivByCode[c];
      try { if (!x) throw new Error('unknown interviewee code "' + c + '".'); const m = reviewRow_(ctx, x, 'restore'); done++; return m; }
      catch (e) { return e.message; }
    });
    if (done) {
      saveTable_(ctx.iv);
      commitBase_(ctx);
      ctx.alerts.flush();
      sendNewIntervieweeMails_(ctx);
      buildTracker_(ctx);
    }
    return { lines: lines, done: done };
  }, 60000);
  if (!res) { busy_(); return null; }
  if (!res.done) throw new Error(res.lines.join('\n')); // nothing restored: the page shows it as a failure
  say_(res.lines.join('\n'));
  return res;
}

/** webRun('membersRefresh'): read the members sheet now, as the admin pressing it. */
function membersRefreshCore_() {
  const o = membersSheet_(true);
  if (!String(S_().VIC_MEMBERS_SHEET || '').trim()) throw new Error('No members sheet linked yet: paste its link in VIC_MEMBERS_SHEET first.');
  if (o.error) throw new Error('The members sheet can\'t be read: ' + o.error + '.');
  say_(o.list.length + ' VIC member email' + (o.list.length === 1 ? '' : 's') + ' read from the members sheet.');
  return membersStatus_();
}
/** The last read of the members sheet, for Settings › Screening: {at, n, error} (at '' = never). */
function membersStatus_() {
  let o = {}; try { o = JSON.parse(PropertiesService.getScriptProperties().getProperty('VIC_MEMBERS_READ') || '{}'); } catch (e) { /* never read */ }
  return { at: o.at ? fmt_(new Date(o.at), 'dd/MM/yyyy HH:mm') : '', n: Number(o.n) || 0, error: String(o.error || '') };
}

/** Declined applicants who get the rejection email: declined at screening, not as VIC members, not sent yet. */
function rejectionList_(ctx) {
  const I = ctx.iv.I;
  return ctx.iv.data.filter(r => r[I.Status] === ST.DECLINED && String(r[I.Screening]).indexOf(SCREEN_MEMBER) !== 0 &&
    !/Rejection sent/.test(String(r[I.Screening])) && /@/.test(String(r[I.Email])));
}

/**
 * webRun('rejections', {send, subject, body, budgetMs}). Without send: the preview {count, sample, subject, body, testMode}.
 * With send: one email each ({first} = their first name), stamped "Rejection sent" in Screening so pressing again reaches
 * only those not sent yet (a failed send is not stamped, so it is retried); stops before budgetMs and says how many are left. TEST_MODE: one copy to the admin pressing it,
 * nothing stamped. Never automatic.
 */
function rejectionsCore_(a) {
  a = a || {};
  const subject = String(a.subject || REJECT_SUBJECT).trim(), body = String(a.body || REJECT_BODY).trim();
  if (!a.send) {
    const list = rejectionList_(loadCtx_()), I = idx_(IV_H);
    return { count: list.length, sample: list.slice(0, 5).map(r => (r[I['First Name']] + ' ' + r[I['Family Name']]).trim() + ' <' + r[I.Email] + '>'),
      subject: REJECT_SUBJECT, body: REJECT_BODY, testMode: bool_(S_().TEST_MODE) };
  }
  if (!subject || !body) throw new Error('The email needs a subject and a text.');
  const html = (first, note) => mailHtml_({ title: subject, blocks: (note ? [mailP_(note)] : []).concat(mailP_(body.replace(/\{first\}/g, () => first))) });
  const t0 = Date.now(), budget = Number(a.budgetMs) || 240000;
  const res = withLock_(() => {
    const ctx = loadCtx_(), I = ctx.iv.I, list = rejectionList_(ctx);
    detectEdits_(ctx);
    if (bool_(S_().TEST_MODE)) {
      const me = Session.getActiveUser().getEmail();
      if (list.length) mail_(me, '[TEST] ' + subject, html(String(list[0][I['First Name']]).trim() || 'there',
        'Test mode: this copy went to you only. With test mode off it goes to ' + list.length + ' declined applicant(s).'), MAIL.candidateFrom);
      return { sent: 0, left: list.length, test: true };
    }
    let i = 0, sent = 0, failed = 0;
    for (; i < list.length && Date.now() - t0 < budget; i++) {
      const r = list[i];
      // a failed send (quota, bad address) stays unstamped so the next press retries it
      if (!mail_(String(r[I.Email]).trim(), subject, html(String(r[I['First Name']]).trim() || 'there'), MAIL.candidateFrom)) { failed++; continue; }
      r[I.Screening] = String(r[I.Screening]).trim() + '; Rejection sent ' + fmt_(ctx.now, 'dd/MM');
      sent++;
    }
    saveTable_(ctx.iv);
    commitBase_(ctx);
    return { sent: sent, failed: failed, left: list.length - i, test: false };
  }, 60000);
  if (!res) { busy_(); return null; }
  say_(res.test ? (res.left ? 'Test mode is on: one copy went to you, nobody else was emailed and nothing was marked as sent.' : 'Nobody to email: no applicant declined at screening is waiting for the email.')
    : res.sent + ' rejection email' + (res.sent === 1 ? '' : 's') + ' sent.' +
      (res.failed ? ' ' + res.failed + ' failed (daily quota or a bad address) and stay unsent: press Send again later to retry them.' : '') +
      (res.left ? ' ' + res.left + ' left: press Send again to carry on.' : ''));
  return res;
}
