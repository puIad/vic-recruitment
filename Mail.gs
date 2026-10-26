/* ---------- the email template: every mail the script sends (owner, 2026-10-17) ---------- */
// Built for mail clients, not browsers: a 600 px table, inline styles only (Gmail drops most of <style>), hex colours from
// DESIGN.md's charter palette, light only, solid fills behind white text so Gmail's dark mode can't strand it.
const MAIL = {
  blue: '#127dbb', aqua: '#69c4af', ink: '#141e27', page: '#efefef', button: '#0075b2', muted: '#5b6773', line: '#dfe3e8',
  font: "Gilroy,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  // Gmail blocks SVG and data: images, so the logo is a PNG served by the dashboard (frontend/public/brand/)
  logo: 'https://vic-recruitment.vercel.app/brand/vic-logo-white.png',
  candidateFrom: 'VIC Recruitment', // sender name on candidate mails; team mails keep mail_()'s 'VIC Recruitment Bot'
  // the themed look (the ticket and the confirmation): night header, serif heading (clients ignore web fonts)
  night: '#141e27', serif: "Georgia,'Times New Roman',serif",
};
// severity chip: [text, soft fill] (DESIGN.md danger / warning / info)
const MAIL_SEV = { HIGH: ['#c11e00', '#ffece5'], MEDIUM: ['#915200', '#fff0c5'], INFO: ['#005b91', '#e2f3ff'] };
const MAIL_TEXT = 'font-family:' + MAIL.font + ';font-size:15px;line-height:1.55;color:' + MAIL.ink + ';';

/** A full HTML document: {title, intro, blocks: [html from the helpers below], cta: {label, url}, footer: html, theme}.
 *  No footer = the candidate one (no internal links); team mails pass mailTeamFooter_(). theme = the stripe colour of the
 *  themed look (night header, serif heading), used by the ticket and the confirmation only; mailer/Code.gs holds a copy. */
function mailHtml_(o) {
  const head = o.theme ? MAIL.night : MAIL.blue, stripe = o.theme || MAIL.aqua, h1 = o.theme ? MAIL.serif : MAIL.font;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>' + esc_(o.title) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + MAIL.page + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + MAIL.page + '" style="background:' + MAIL.page + '">' +
    '<tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td bgcolor="' + head + '" style="background:' + head + ';padding:20px 32px">' +
    '<img src="' + MAIL.logo + '" width="120" height="48" alt="VIC" style="display:block;border:0;outline:none;color:#ffffff;font-family:' + MAIL.font + ';font-size:26px;font-weight:bold"></td></tr>' +
    '<tr><td bgcolor="' + stripe + '" style="background:' + stripe + ';height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 32px 12px;' + MAIL_TEXT + '">' +
    '<h1 style="margin:0 0 14px;font-family:' + h1 + ';font-size:22px;line-height:1.3;font-weight:800;color:' + MAIL.ink + '">' + esc_(o.title) + '</h1>' +
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

/** One value to keep, shown large (the registrant's code, the ticket). theme: the themed look's stripe colour, which also
 *  edges the box (on Bright Gray, so a house colour never sits on the aquamarine tint). */
function mailCode_(label, value, theme) {
  const fill = theme ? MAIL.page : '#e6f5f1';
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>' +
    '<td bgcolor="' + fill + '" style="background:' + fill + ';border-left:4px solid ' + (theme || MAIL.aqua) + ';border-radius:8px;padding:12px 24px 14px;font-family:' + MAIL.font + '">' +
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

/* ---------- the editable mails (MAILS in Config.gs; Settings › Emails) ---------- */
function mailDef_(id) { return MAILS.filter(m => m.id === id)[0]; }
/** {m, f} for a Settings key MAIL_<ID>_<FIELD>, or null. */
function mailKey_(key) {
  for (const m of MAILS) for (const f of m.fields) if ('MAIL_' + m.id + '_' + f[0].toUpperCase() === key) return { m: m, f: f };
  return null;
}
/** The text of one field: the one being previewed or edited (texts), else the saved one, else the default. */
function mailField_(id, field, texts) {
  const m = mailDef_(id), f = m.fields.filter(x => x[0] === field)[0];
  if (texts && texts[field] != null) return String(texts[field]).trim() || f[1]; // sent by the caller: blank means the default, as a save does
  const saved = S_()['MAIL_' + id + '_' + field.toUpperCase()];
  return saved != null && String(saved).trim() ? String(saved).trim() : f[1];
}
/** Throws on a placeholder the mail doesn't know or a text that is too long. Other keys pass. */
function mailCheck_(key, text) {
  const hit = mailKey_(key);
  if (!hit) return;
  text = String(text);
  if (text.length > MAIL_MAX) throw new Error(key + ' is over ' + MAIL_MAX + ' characters');
  (text.match(/\{\w+\}/g) || []).forEach(p => {
    if (hit.m.vars.indexOf(p.slice(1, -1)) < 0)
      throw new Error(key + ': unknown placeholder ' + p + '. This mail knows ' + hit.m.vars.map(v => '{' + v + '}').join(' '));
  });
}
function mailFill_(text, vars) {
  return String(text).replace(/\{(\w+)\}/g, (all, k) => Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : all);
}
/** One of the editable mails in the fixed layout: {subject, html, from}. o: blocks (the generated part), cta, footer,
 *  dept (the confirmation's 1st choice, for its house stripe), texts (fields to use instead of the saved ones). Who gets it, and when, stays with the caller. */
function mailFrom_(id, vars, o) {
  o = o || {};
  const m = mailDef_(id), has = f => m.fields.some(x => x[0] === f), t = f => mailFill_(mailField_(id, f, o.texts), vars);
  const subject = t('subject'), blocks = (o.blocks || []).slice();
  const theme = id === 'CODE' ? MAIL.aqua : id === 'CONFIRM' ? formHouseColour_(o.dept) : '';
  if (id === 'CODE' || id === 'CONFIRM') blocks.push(mailCode_(t('codeLabel'), vars.code, theme));
  if (id === 'REJECT') blocks.push(mailP_(t('text')));
  if (has('below') && t('below')) blocks.push(mailP_(t('below')));
  return { subject: subject, from: m.to === 'candidate' ? MAIL.candidateFrom : undefined,
    html: mailHtml_({ title: has('heading') ? t('heading') : subject, intro: has('above') ? t('above') : has('text') && id !== 'REJECT' ? t('text') : '',
      blocks: blocks, cta: o.cta, footer: o.footer, theme: theme }) };
}
/** The confirmation's stripe: the 1st choice's house on the form, aquamarine for a department it doesn't know. */
function formHouseColour_(dept) { const h = FORM_HOUSE[String(dept == null ? '' : dept).trim()]; return h ? h.colour : MAIL.aqua; }
function mailSend_(to, m) { return mail_(to, m.subject, m.html, m.from); }

/** The mail with sample data, for the dashboard's preview. */
function mailSample_(id, texts) {
  const v = { first: 'Amina', code: 'IT.42', names: 'Amina & Yanis', binome: 'B3', n: 2, s: 's', hours: 24, members: 'Amina K. & Yanis B.',
    replaced: ' (replaced by Sara B.)', instead: ' instead of Yanis K.', reason: ' (exam)', cover: 'Sara B.', coverEmail: 'sara.b@g.enp.edu.dz',
    codes: 'IT.12, IT.15' };
  if (id === 'CODE') v.code = '482913';
  const people = mailList_([['IT.12', 'Lina A. · 0550 00 00 00 · available: evenings'], ['IT.15', 'Omar S. · 0661 00 00 00 · available: weekends']]);
  const cta = label => ({ label: label, url: DASHBOARD_URL });
  const o = { texts: texts, dept: 'IT', footer: MAILS.some(m => m.id === id && m.to === 'candidate') ? undefined : mailTeamFooter_(DASHBOARD_URL) };
  if (id === 'NEW_IV') Object.assign(o, { blocks: [people], cta: cta('Open the dashboard') });
  if (id === 'ALERT') Object.assign(o, { blocks: [mailAlerts_([['HIGH', 'NOT_CONTACTED', 'IT.12', 'IT.12 has not been contacted yet']])], cta: cta('Open the dashboard') });
  if (id === 'JOINED') Object.assign(o, { blocks: [mailP_('Interviewees still in progress:'), people], cta: cta('Open the dashboard') });
  if (id === 'PAIRED' || id === 'COVERED') o.cta = cta('Open the dashboard');
  if (id === 'COVER') Object.assign(o, { blocks: [people], cta: cta('Open the dashboard') });
  return mailFrom_(id, v, o);
}
