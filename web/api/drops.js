// POST /api/drops {mailed} → {mail, alert, open}: the sync's call each cycle (docs/plans.md › Slice 4), from Apps Script as
// the club account. Guarded by DROPS_SECRET (Bearer), the same value as the script property; unset here = 503, unset in the
// script = no call. No cookie, no Google call: it reads and marks the pending-changes records only (web/lib/pending.js forSync).
const crypto = require('crypto');
const S = require('../lib/session'), P = require('../lib/pending');

const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.sendJson(res, 405, { error: 'POST only' });
  const secret = process.env.DROPS_SECRET;
  if (!secret) return S.sendJson(res, 503, { error: 'Not configured' });
  if (!sameSecret(req.headers.authorization || '', 'Bearer ' + secret)) return S.sendJson(res, 403, { error: 'Bad secret' });
  let b;
  try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch (e) { return S.sendJson(res, 400, { error: 'Bad request' }); }
  try {
    const out = await P.forSync(b.mailed, Date.now());
    console.log(JSON.stringify({ at: 'drops', mail: out.mail.length, alert: out.alert.length, open: out.open.length }));
    S.sendJson(res, 200, out);
  } catch (e) {
    console.warn(JSON.stringify({ at: 'drops', error: String(e.message).slice(0, 200) }));
    S.sendJson(res, 502, { error: 'Could not reach the pending-changes store.' });
  }
};
