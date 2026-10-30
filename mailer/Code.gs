/* ---------- The VIC mailer: every VIC mail leaves from vic.rh through here (docs/registration-form.md, The mails) ----------
 * A standalone Apps Script owned by vic.rh, not the Master's bound script (that one's web app runs as the visitor).
 * Deployed with clasp from this folder (mailer/.clasp.json, mailer/appsscript.json: Web app, Execute as Me, access
 * Anyone; docs/registration-form.md, setup step 7). Script properties: MAILER_SECRET (the site's MAILER_SECRET),
 * MAIL_SEND_SECRET (the bound script's MAIL_SEND_SECRET), EMAIL_DOMAIN (g.enp.edu.dz), MASTER_ID (the Master's id;
 * vic.rh must be able to open it).
 *
 * doPost takes JSON:
 *   {secret, to, code}  one ticket mail to `to` (an address in EMAIL_DOMAIN), `code` six digits, sent as "VIC Recruitment"
 *                       from this account (replies land in its mailbox). Answers {ok:true} or {ok:false, reason}.
 *   {secret, ping:true} answers {ok:true, quota} and sends nothing (the site's /api/health): quota is MailApp's recipients
 *                       left today for vic.rh, shared with the Master's mails; left out if Google won't say.
 *   {secret, mail:{to, subject, html, name}}  one mail built by the bound script (mail_ in Sheets.gs), to any one address.
 *                       Its own secret: a leak of the site's can only send tickets to ENP addresses, never free text.
 * The wording is the Master's Settings rows MAIL_CODE_* (Settings › Emails, Registration ticket), blank = the defaults
 * below, cached 60 s. TEST_MODE does not reach this script.
 *
 * The layout is a copy of the themed look in the bound script's Mail.gs (mailHtml_ with a theme, mailP_, mailCode_):
 * test/mail.test.js renders one sample through both and fails on any difference, so change the two together. */

const MAILER = {
  from: 'VIC Recruitment',
  cacheSeconds: 60,
  // the CODE entry of MAILS in the bound script's Config.gs (test/mail.test.js checks they match)
  defaults: {
    subject: 'Your ticket for Platform 9¾: {code}',
    heading: 'Your ticket is ready',
    above: 'Type this ticket on the registration form to prove this ENP address is yours. It works for 10 minutes. If you did not ask for it, ignore this mail.',
    codeLabel: 'Your ticket',
  },
};

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return answer_({ ok: false, reason: 'bad request' }); }
  if (!body || typeof body !== 'object') return answer_({ ok: false, reason: 'bad request' });
  const props = PropertiesService.getScriptProperties();
  if (body.mail) return answer_(sameSecret_(body.secret, props.getProperty('MAIL_SEND_SECRET')) ? sendMail_(body.mail) : { ok: false, reason: 'secret' });
  if (!sameSecret_(body.secret, props.getProperty('MAILER_SECRET'))) return answer_({ ok: false, reason: 'secret' });
  if (body.ping === true) return answer_(pong_());
  const domain = String(props.getProperty('EMAIL_DOMAIN') || '').trim().replace(/^@/, '').toLowerCase();
  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : '';
  // one plain address: MailApp would read a comma as a second recipient (an apostrophe is fine: m'hamed.x@)
  if (!domain || !/^[a-z0-9._%+'-]+@[a-z0-9.-]+$/.test(to) || to.slice(-domain.length - 1) !== '@' + domain) return answer_({ ok: false, reason: 'to' });
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return answer_({ ok: false, reason: 'code' });
  const m = ticketMail_(wording_(props.getProperty('MASTER_ID')), body.code);
  try {
    MailApp.sendEmail({ to: to, subject: m.subject, htmlBody: m.html, name: MAILER.from });
  } catch (err) {
    console.error('Ticket mail failed: ' + err); // never the address or the code
    return answer_({ ok: false, reason: 'send' });
  }
  return answer_({ ok: true });
}

/** A mail the bound script built. One plain address: MailApp would read a comma as a second recipient. */
function sendMail_(m) {
  const to = typeof m.to === 'string' ? m.to.trim() : '';
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) return { ok: false, reason: 'to' };
  if (typeof m.subject !== 'string' || !m.subject.trim() || typeof m.html !== 'string' || !m.html) return { ok: false, reason: 'mail' };
  try {
    MailApp.sendEmail({ to: to, subject: m.subject, htmlBody: m.html, name: String(m.name || MAILER.from) });
  } catch (err) {
    console.error('Mail failed: ' + err); // never the address or the text
    return { ok: false, reason: 'send' };
  }
  return { ok: true };
}

/** The ping's answer: ok, and how many mails vic.rh can still send today when Google says. */
function pong_() {
  try { return { ok: true, quota: MailApp.getRemainingDailyQuota() }; } catch (err) { return { ok: true }; }
}

function answer_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Constant time: the SHA-256 digests of both, every byte compared, so neither the content nor the length leaks. */
function sameSecret_(given, expected) {
  if (typeof given !== 'string' || !given || !expected) return false;
  const d = s => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  const a = d(given), b = d(String(expected));
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** {subject, heading, above, codeLabel}: the Master's MAIL_CODE_* rows, blank = the default; cached 60 s. An unreadable
 *  Master gives the defaults (not cached), so the ticket still goes out. Read like the bound script's S_(): the last filled row wins. */
function wording_(masterId) {
  const cache = CacheService.getScriptCache(), hit = cache.get('wording');
  if (hit) return JSON.parse(hit);
  const saved = {};
  let read = true;
  try {
    const sh = SpreadsheetApp.openById(masterId).getSheetByName('Settings');
    if (sh) sh.getDataRange().getValues().slice(1).forEach(r => { if (String(r[0]).trim() && r[1] !== '') saved[String(r[0]).trim()] = r[1]; });
  } catch (err) { read = false; console.error('Master not readable, default wording: ' + err); }
  const w = {};
  Object.keys(MAILER.defaults).forEach(f => {
    const v = saved['MAIL_CODE_' + f.toUpperCase()];
    w[f] = v != null && String(v).trim() ? String(v).trim() : MAILER.defaults[f];
  });
  if (read) cache.put('wording', JSON.stringify(w), MAILER.cacheSeconds); // a failed read is retried on the next mail
  return w;
}

/** The ticket mail: {subject, html}. The same bytes as the bound script's mailFrom_('CODE', {code}). */
function ticketMail_(w, code) {
  const t = s => String(s).replace(/\{code\}/g, code);
  return { subject: t(w.subject), html: themedHtml_({ title: t(w.heading), intro: t(w.above), blocks: [mailCode_(t(w.codeLabel), code, MAIL.aqua)], theme: MAIL.aqua }) };
}

/* ---------- a copy of the themed look (bound script: Mail.gs) ---------- */
const MAIL = {
  aqua: '#69c4af', ink: '#141e27', page: '#efefef', muted: '#5b6773', line: '#dfe3e8',
  font: "Gilroy,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  logo: 'https://vic-recruitment.vercel.app/brand/vic-logo-white.png',
  night: '#141e27', serif: "Georgia,'Times New Roman',serif",
};
const MAIL_TEXT = 'font-family:' + MAIL.font + ';font-size:15px;line-height:1.55;color:' + MAIL.ink + ';';

function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function themedHtml_(o) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc_(o.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + MAIL.page + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + MAIL.page + '" style="background:' + MAIL.page + '">' +
    '<tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td bgcolor="' + MAIL.night + '" style="background:' + MAIL.night + ';padding:20px 32px">' +
    '<img src="' + MAIL.logo + '" width="120" height="48" alt="VIC" style="display:block;border:0;outline:none;color:#ffffff;font-family:' + MAIL.font + ';font-size:26px;font-weight:bold"></td></tr>' +
    '<tr><td bgcolor="' + o.theme + '" style="background:' + o.theme + ';height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 12px;' + MAIL_TEXT + '">' +
    '<h1 style="margin:0 0 14px;font-family:' + MAIL.serif + ';font-size:22px;line-height:1.3;font-weight:800;color:' + MAIL.ink + '">' + esc_(o.title) + '</h1>' +
    (o.intro ? mailP_(o.intro) : '') + (o.blocks || []).join('') +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px;border-top:1px solid ' + MAIL.line + ';font-family:' + MAIL.font + ';font-size:12px;line-height:1.5;color:' + MAIL.muted + '">' +
    'Vision &amp; Innovation Club · Recruitment 2026' + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function mailP_(text) {
  return String(text == null ? '' : text).split(/\n\s*\n/).map(p => '<p style="margin:0 0 14px;' + MAIL_TEXT + '">' +
    esc_(p.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');
}

function mailCode_(label, value, theme) {
  const fill = MAIL.page;
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>' +
    '<td bgcolor="' + fill + '" style="background:' + fill + ';border-left:4px solid ' + theme + ';border-radius:8px;padding:12px 24px 14px;font-family:' + MAIL.font + '">' +
    '<div style="font-size:12px;line-height:1.4;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + MAIL.muted + '">' + esc_(label) + '</div>' +
    '<div style="font-size:30px;line-height:1.2;font-weight:800;letter-spacing:1px;color:' + MAIL.ink + '">' + esc_(value) + '</div></td></tr></table>';
}
