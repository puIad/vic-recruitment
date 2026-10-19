/* ---------- the email template: every mail the script sends (owner, 2026-10-17) ---------- */
// Built for mail clients, not browsers: a 600 px table, inline styles only (Gmail drops most of <style>), hex colours from
// DESIGN.md's charter palette, light only, solid fills behind white text so Gmail's dark mode can't strand it.
const MAIL = {
  blue: '#127dbb', aqua: '#69c4af', ink: '#141e27', page: '#efefef', button: '#0075b2', muted: '#5b6773', line: '#dfe3e8',
  font: "Gilroy,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  // Gmail blocks SVG and data: images, so the logo is a PNG served by the dashboard (frontend/public/brand/)
  logo: 'https://vic-recruitment.vercel.app/brand/vic-logo-white.png',
};
// severity chip: [text, soft fill] (DESIGN.md danger / warning / info)
const MAIL_SEV = { HIGH: ['#c11e00', '#ffece5'], MEDIUM: ['#915200', '#fff0c5'], INFO: ['#005b91', '#e2f3ff'] };
const MAIL_TEXT = 'font-family:' + MAIL.font + ';font-size:15px;line-height:1.55;color:' + MAIL.ink + ';';

// The registrant's confirmation. Wording settled with the owner on 2026-10-19 (docs/plans.md, Email texts, decision 2).
// {first} and {code} are filled in. Never promise an interview or a binome: screening can still hold or decline them.
const CONFIRM_MAIL = {
  subject: 'VIC Recruitment 2026: registration received',
  title: 'Thanks for registering, {first}!',
  intro: "We received your registration for the Vision & Innovation Club's 2026 recruitment.",
  codeLabel: 'Your code',
  body: 'Keep this code. It identifies your registration until the end of the recruitment, and we will ask for it when we contact you.\n\n' +
    'We will get back to you by phone or email about the next steps.\n\nSee you soon,\nThe VIC team',
};

/** A full HTML document: {title, intro, blocks: [html from the helpers below], cta: {label, url}, footer: html}.
 *  No footer = the candidate one (no internal links); team mails pass mailTeamFooter_(). */
function mailHtml_(o) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc_(o.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + MAIL.page + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + MAIL.page + '" style="background:' + MAIL.page + '">' +
    '<tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td bgcolor="' + MAIL.blue + '" style="background:' + MAIL.blue + ';padding:20px 32px">' +
    '<img src="' + MAIL.logo + '" width="120" height="48" alt="VIC" style="display:block;border:0;outline:none;color:#ffffff;font-family:' + MAIL.font + ';font-size:26px;font-weight:bold"></td></tr>' +
    '<tr><td bgcolor="' + MAIL.aqua + '" style="background:' + MAIL.aqua + ';height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 12px;' + MAIL_TEXT + '">' +
    '<h1 style="margin:0 0 14px;font-family:' + MAIL.font + ';font-size:22px;line-height:1.3;font-weight:800;color:' + MAIL.ink + '">' + esc_(o.title) + '</h1>' +
    (o.intro ? mailP_(o.intro) : '') + (o.blocks || []).join('') + (o.cta && o.cta.url ? mailButton_(o.cta.label, o.cta.url) : '') +
    '</td></tr>' +
    '<tr><td style="padding:16px 32px 24px;border-top:1px solid ' + MAIL.line + ';font-family:' + MAIL.font + ';font-size:12px;line-height:1.5;color:' + MAIL.muted + '">' +
    (o.footer || 'Vision &amp; Innovation Club · Recruitment 2026') + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

/** Text, escaped. A blank line starts a new paragraph, a newline is a line break, **x** is bold. */
function mailP_(text) {
  return String(text == null ? '' : text).split(/\n\s*\n/).map(p => '<p style="margin:0 0 14px;' + MAIL_TEXT + '">' +
    esc_(p.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');
}

/** A small heading inside the body. */
function mailH_(text) {
  return '<h2 style="margin:20px 0 8px;font-family:' + MAIL.font + ';font-size:16px;line-height:1.3;font-weight:800;color:' + MAIL.ink + '">' + esc_(text) + '</h2>';
}

/** Key/value list: [[key, value], ...]. */
function mailList_(pairs) {
  const td = 'padding:8px 0;border-bottom:1px solid ' + MAIL.line + ';vertical-align:top;font-family:' + MAIL.font + ';font-size:14px;line-height:1.45;color:' + MAIL.ink + ';';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;border-collapse:collapse">' +
    pairs.map(p => '<tr><td style="' + td + 'padding-right:16px;font-weight:bold;white-space:nowrap;width:1%">' + esc_(p[0]) +
      '</td><td style="' + td + '">' + esc_(p[1]) + '</td></tr>').join('') + '</table>';
}

/** Alert table: [[severity, ...details, message], ...]. The severity shows as a chip; the details (ID, type, code) go on a
 *  small line above the message, so a phone screen never scrolls sideways. */
function mailAlerts_(rows) {
  const td = 'padding:10px 0;border-bottom:1px solid ' + MAIL.line + ';vertical-align:top;font-family:' + MAIL.font + ';';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 16px;border-collapse:collapse">' +
    rows.map(r => {
      const sev = String(r[0]).toUpperCase(), c = MAIL_SEV[sev] || MAIL_SEV.INFO, meta = r.slice(1, -1).filter(v => String(v).trim());
      return '<tr><td style="' + td + 'padding-right:12px;white-space:nowrap;width:1%"><span style="display:inline-block;padding:2px 10px;border-radius:999px;' +
        'background:' + c[1] + ';color:' + c[0] + ';font-size:12px;line-height:1.5;font-weight:bold">' + esc_(sev) + '</span></td>' +
        '<td style="' + td + '">' + (meta.length ? '<div style="font-size:12px;line-height:1.5;font-weight:bold;color:' + MAIL.muted + '">' +
        meta.map(esc_).join(' &nbsp;·&nbsp; ') + '</div>' : '') +
        '<div style="font-size:14px;line-height:1.5;color:' + MAIL.ink + ';word-break:break-word">' + esc_(r[r.length - 1]) + '</div></td></tr>';
    }).join('') + '</table>';
}

/** One value to keep, shown large (the registrant's code). */
function mailCode_(label, value) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>' +
    '<td bgcolor="#e6f5f1" style="background:#e6f5f1;border-left:4px solid ' + MAIL.aqua + ';border-radius:8px;padding:12px 24px 14px;font-family:' + MAIL.font + '">' +
    '<div style="font-size:12px;line-height:1.4;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + MAIL.muted + '">' + esc_(label) + '</div>' +
    '<div style="font-size:30px;line-height:1.2;font-weight:800;letter-spacing:1px;color:' + MAIL.ink + '">' + esc_(value) + '</div></td></tr></table>';
}

/** Stat line: [[label, number], ...] → "label n · label n", the numbers bold. */
function mailStats_(pairs) {
  return '<p style="margin:0 0 14px;' + MAIL_TEXT + '">' + pairs.map(p => '<span style="white-space:nowrap">' + esc_(p[0]) + ' <b style="font-size:17px">' + esc_(p[1]) + '</b></span>').join(' &nbsp;· ') + '</p>';
}

/** The call to action: a table cell with a link, so it shows as a button in every client. */
function mailButton_(label, url) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px"><tr>' +
    '<td bgcolor="' + MAIL.button + '" style="background:' + MAIL.button + ';border-radius:999px">' +
    '<a href="' + esc_(url) + '" style="display:inline-block;padding:12px 26px;font-family:' + MAIL.font + ';font-size:15px;font-weight:bold;' +
    'line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px">' + esc_(label) + '</a></td></tr></table>';
}

/** Footer of the team's mails: the dashboard, and the binome sheet when there is one. */
function mailTeamFooter_(sheetUrl) {
  const a = (url, label) => '<a href="' + esc_(url) + '" style="color:' + MAIL.button + ';text-decoration:underline">' + label + '</a>';
  return 'VIC Recruitment 2026 · ' + a(DASHBOARD_URL, 'Dashboard') + (sheetUrl ? ' · ' + a(sheetUrl, 'Binome sheet') : '') +
    '<br>Sent by the VIC Recruitment Bot.';
}

/** The registrant's confirmation, from CONFIRM_MAIL. */
function confirmHtml_(first, code) {
  const fill = s => s.replace(/\{first\}/g, () => first).replace(/\{code\}/g, () => code);
  return mailHtml_({ title: fill(CONFIRM_MAIL.title), intro: fill(CONFIRM_MAIL.intro),
    blocks: [mailCode_(CONFIRM_MAIL.codeLabel, code), mailP_(fill(CONFIRM_MAIL.body))] });
}
