/* ---------- 2) interview forms ---------- */

function intHeaders_(headers) {
  const n = headers.map(normText);
  const find = (pred) => { for (let i = 0; i < n.length; i++) if (pred(n[i])) return i; return -1; };
  return {
    ts: find(h => h === 'timestamp' || h.indexOf('horodateur') === 0),
    collected: find(h => h === 'email address' || h === 'adresse e mail'),
    binome: find(h => h.indexOf('binome code') >= 0 || h.indexOf('binome') === 0 || h.indexOf('your binome') >= 0),
    interviewee: find(h => h.indexOf('interviewee code') >= 0 || h.indexOf('interviewee') >= 0),
    c1: find(h => h.indexOf('1st department choice') >= 0 || h.indexOf('first department choice') >= 0),
    finalDep: find(h => h.indexOf('final main department') >= 0),
  };
}

function resolverCtx_(ctx) {
  const I = ctx.iv.I;
  const interviewed = {};
  ctx.iv.data.forEach(r => { if (r[I.Code] && r[I['Interview Submitted At']]) interviewed[r[I.Code]] = true; });
  return {
    binomes: ctx.binomes.filter(b => b.status === 'ACTIVE' || b.status === 'PAUSED'),
    interviewees: ctx.iv.data.filter(r => r[I.Code] && r[I.Status] !== ST.DUPLICATE).map(r => ({
      code: String(r[I.Code]).trim(), binome: String(r[I.Binome]).trim(),
      name: r[I['First Name']] + ' ' + r[I['Family Name']], firstChoice: String(r[I['1st Choice']]).trim() })),
    interviewed: interviewed,
    nameByEmail: ctx.nameByEmail,
    trustedBackups: String(S_().TRUSTED_BACKUPS || '').split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => /@/.test(e)),
  };
}

function processInterviews_(ctx) {
  const sh = responseSheet_('INT');
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const H = intHeaders_(data[0]);
  const I = ctx.iv.I;
  const get = (row, i) => (i >= 0 ? row[i] : '');
  let rctx = null;
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const ts = get(row, H.ts);
    if (!ts) continue;
    const sub = String(get(row, H.collected)).trim().toLowerCase();
    const key = responseKey_(ts, sub, r + 1);
    if (ctx.logKeys[key]) continue;
    rctx = rctx || resolverCtx_(ctx);
    const res = resolveInterview({ submitter: sub, typedBinome: get(row, H.binome),
      typedInterviewee: get(row, H.interviewee), typedFirstChoice: get(row, H.c1) }, rctx);

    const logRow = [ts, sub, String(get(row, H.binome)), String(get(row, H.interviewee)), res.binome, res.interviewee,
      res.result, res.notes.concat(res.alerts.map(a => a.type + ': ' + a.msg)).join(' | '), get(row, H.finalDep), key];
    ctx.log.data.push(logRow);
    ctx.logKeys[key] = true;
    const logRowNumber = ctx.log.data.length + 1;

    const ivRow = res.interviewee ? ctx.ivByCode[res.interviewee] : null;
    if (ivRow) {
      const first = !ivRow[I['Interview Submitted At']];
      if (first) {
        ivRow[I['Interview Submitted At']] = ts;
        ivRow[I['Interview Log Row']] = logRowNumber;
        ivRow[I.Status] = ST.INTERVIEWED;
      }
      rctx.interviewed[res.interviewee] = true;
      const b = first ? ctx.binByCode[ivRow[I.Binome]] : null;
      if (b) markInterviewInFile_(ctx, b, res.interviewee, (res.result === 'FLAGGED' ? '⚠️ ' : '✅ ') + fmt_(ts, 'dd/MM HH:mm') +
        (res.result === 'AUTOCORRECTED' ? ' (auto-corrected)' : ''));
    }
    res.alerts.forEach(a => ctx.alerts.add({ severity: a.severity, type: a.type, code: res.interviewee || String(get(row, H.interviewee)),
      binome: a.binome || res.binome, msg: a.msg + ' [Interview Log row ' + logRowNumber + ']', notifyBinome: a.notifyBinome,
      key: 'INT|' + a.type + '|' + key }));
    if (res.result === 'AUTOCORRECTED' && res.substantive) {
      ctx.alerts.add({ severity: 'INFO', type: 'AUTOCORRECTED', code: res.interviewee, binome: res.binome, status: 'AUTO-FIXED',
        msg: res.notes.join(' | ') + ' [Interview Log row ' + logRowNumber + ']', key: 'INT|AUTOCORRECTED|' + key });
    }
  }
  if (ctx.log.data.length > ctx.log.originalLength) {
    const t = ctx.log;
    t.sh.getRange(t.originalLength + 2, 1, t.data.length - t.originalLength, LOG_H.length).setValues(t.data.slice(t.originalLength));
    t.originalLength = t.data.length;
  }
}
