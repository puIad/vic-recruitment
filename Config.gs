/******************************************************************************
 * VIC RECRUITMENT 2026 — automation for the Master sheet
 * -----------------------------------------------------------------------------
 * Deployed with clasp (`npx clasp push`). Run the function `setup` once
 * (▶ Run) and accept the permissions. After that, everything is driven from the
 * "VIC Recruitment" menu + triggers, or from the Vercel dashboard (frontend/,
 * through WebApp.gs; see STATUS.md).
 *
 * All .gs files share one global scope. This file holds the top-level constants
 * and must load first (filePushOrder in .clasp.json); the others only declare
 * functions:
 *   Matching.gs       pure: text/code parsing, name matching, interview-form check
 *   Rules.gs          pure: binome pairing, routing, codes, registration + timing checks
 *   Sheets.gs         plumbing: settings, tables, lock, run context, alerts, mail
 *   BinomeFiles.gs    per-binome Sheet files
 *   Registrations.gs  registration form → Interviewees
 *   Interviews.gs     interview form → Interview Log
 *   Sync.gs           pull binome files, timing alerts, Tracker, main cycle, triggers
 *   Setup.gs          menu, setup, tabs, form links, triggers install
 *   Team.gs           team import, draft / lock / re-share binomes
 *   Members.gs        after lock: change / swap binome members, temporary covers (Member Changes tab)
 *   Integrity.gs      hand-edit detection (baseline in script properties), odd values, full binome-sheet check
 *   Actions.gs        reassign interviewee, resolve alerts, daily digest
 *   QuickFix.gs       the dashboard's quick actions on alerts: fixes, snooze / mute, emails, links
 *   Screening.gs      hold low-effort applications for review, decline VIC members, the rejection email
 *   Mail.gs           the email template every mail is built with, the registrant's confirmation text
 ******************************************************************************/

// IDs of the files created in Drive › Recruitment › VIC Recruitment 2026
const CONFIG = {
  REGISTRATION_FORM_ID: '11dfunyOymN1vsoIlcDuw-kENHYLI2qMWaSLbzQpHHy4',
  INTERVIEW_FORM_ID:    '1fhesZ_Xa4eUhrtlDsm4-tnt2MI7iZWy_QIiKzjmM8NM',
  BINOME_FOLDER_ID:     '18xTMFZLrRhBrbKbABD-eY0kaP4diYWzb',
  TEAM_DB_DEFAULT_ID:   '10FILUcr8WXOWvHnZQdTJemcejO7ppdMyWX1pm1eiaF0', // RECRUITMENT 2025 DATABASE
};

// The mails admins can reword (Settings › Emails; docs/plans.md, Email texts). Per mail: id, name, to (candidate or binome),
// the placeholders its texts may use, and each text field as [field, default]. The layout is fixed (mailFrom_, Mail.gs):
// subject, heading, text above, the generated part (code box, list, alert table), text below. One Settings row per field,
// MAIL_<ID>_<FIELD>; blank = the default here. Subject, heading and code label are plain; the other texts: a blank line starts a paragraph, **x** is bold.
const MAILS = [
  // the registration form's ticket (docs/registration-form.md, The mails): sent by the mailer (mailer/Code.gs), which reads
  // these rows from the Master; no On/Off switch, since off would break the form's first screen
  { id: 'CODE', name: 'Registration ticket', to: 'candidate', vars: ['code'], fields: [
    ['subject', 'Your ticket for Platform 9¾: {code}'],
    ['heading', 'Your ticket is ready'],
    ['above', 'Type this ticket on the registration form to prove this ENP address is yours. It works for 10 minutes. If you did not ask for it, ignore this mail.'],
    ['codeLabel', 'Your ticket']] },
  { id: 'CONFIRM', name: 'Registrant confirmation', to: 'candidate', vars: ['first', 'code'], fields: [
    ['subject', 'VIC Recruitment 2026: registration received'],
    ['heading', 'Thanks for registering, {first}!'],
    ['above', "We received your registration for the Vision & Innovation Club's 2026 recruitment."],
    ['codeLabel', 'Your code'],
    ['below', 'Keep this code. It identifies your registration until the end of the recruitment, and we will ask for it when we contact you.\n\n' +
      'We will get back to you by phone or email about the next steps.\n\nSee you soon,\nThe VIC team']] },
  // the heading is the subject; the text starts the body
  { id: 'REJECT', name: 'Rejection', to: 'candidate', vars: ['first'], fields: [
    ['subject', 'VIC Recruitment 2026: your application'],
    ['text', 'Hi {first},\n\nThank you for applying to the Vision & Innovation Club. We read every application carefully, ' +
      'and we are sorry to tell you that we will not be moving forward with yours this year.\n\nWe hope to see you at our events, ' +
      'and you are welcome to apply again next year.\n\nThe VIC team']] },
  { id: 'NEW_IV', name: 'New interviewees', to: 'binome', vars: ['names', 'binome', 'n', 's', 'hours'], fields: [
    ['subject', '[VIC Recruitment] New interviewee(s) for {binome}'],
    ['heading', '{n} new interviewee{s} for {binome}'],
    ['above', 'Hi {names},\n\nNewly assigned to your binome **{binome}** ({n} interviewee{s}):'],
    ['below', 'Please contact them within {hours}h and fill in **Contacted**, **Interview Date** and **Interview Time** in your binome sheet.\n\n' +
      'In the interview form, use your binome code **{binome}** and the interviewee code.']] },
  { id: 'ALERT', name: 'Alert mail to a binome', to: 'binome', vars: ['n', 's'], fields: [
    ['subject', '[VIC Recruitment] {n} alert{s}'],
    ['heading', '{n} new alert{s}'],
    ['above', 'Hi! Something needs your attention in the recruitment process:']] },
  { id: 'JOINED', name: 'Joined a binome', to: 'binome', vars: ['first', 'binome', 'members'], fields: [
    ['subject', '[VIC Recruitment] You joined binome {binome}'],
    ['heading', 'You joined binome {binome}'],
    ['above', 'Hi {first},\n\nYou are now a member of binome **{binome}** ({members}).'],
    ['below', 'In the interview form, use the binome code **{binome}**.']] },
  { id: 'LEFT', name: 'Left a binome', to: 'binome', vars: ['first', 'binome', 'replaced'], fields: [
    ['subject', '[VIC Recruitment] You left binome {binome}'],
    ['heading', 'You left binome {binome}'],
    ['text', 'Hi {first},\n\nYou are no longer a member of binome **{binome}**{replaced}. Thanks for your help!']] },
  { id: 'PAIRED', name: 'New binome', to: 'binome', vars: ['first', 'binome', 'members'], fields: [
    ['subject', '[VIC Recruitment] You are in binome {binome}'],
    ['heading', 'You are in binome {binome}'],
    ['text', 'Hi {first},\n\nYou are now a member of binome **{binome}** ({members}).\n\nIn the interview form, use the binome code **{binome}**.']] },
  { id: 'COVER', name: 'You cover', to: 'binome', vars: ['first', 'codes', 'binome', 'members', 'instead'], fields: [
    ['subject', '[VIC Recruitment] You cover {codes} for binome {binome}'],
    ['heading', 'You cover {codes} for {binome}'],
    ['above', 'Hi {first},\n\nThanks for stepping in! You interview these candidates for binome **{binome}** ({members}){instead}:'],
    ['below', 'The binome keeps filling in the binome sheet. In the interview form, use the binome code **{binome}** and the interviewee code.']] },
  { id: 'COVERED', name: 'Someone covers for you', to: 'binome', vars: ['first', 'cover', 'coverEmail', 'codes', 'binome', 'instead', 'reason'], fields: [
    ['subject', '[VIC Recruitment] {cover} covers {codes} for {binome}'],
    ['heading', '{cover} covers {codes}'],
    ['text', 'Hi {first},\n\n**{cover}** ({coverEmail}) covers **{codes}** for your binome{instead}{reason}. ' +
      'You stay responsible for the binome sheet: keep Contacted / Date / Time up to date for them.']] },
  { id: 'BINOME_PAUSED', name: 'Binome paused', to: 'binome', vars: ['first', 'binome', 'until'], fields: [
    ['subject', '[VIC Recruitment] Binome {binome} is paused'],
    ['heading', 'Binome {binome} is paused'],
    ['text', 'Hi {first},\n\nYour binome **{binome}** is paused{until}. It gets no new candidates for now: keep going with the ones you have.']] },
  { id: 'BINOME_RESUMED', name: 'Binome resumed', to: 'binome', vars: ['first', 'binome'], fields: [
    ['subject', '[VIC Recruitment] Binome {binome} is active again'],
    ['heading', 'Binome {binome} is active again'],
    ['text', 'Hi {first},\n\nYour binome **{binome}** is active again: new candidates will come.']] },
  { id: 'INTERVIEW_CLOSED', name: 'Interview phase closed', to: 'binome', vars: ['first', 'binome'], fields: [
    ['subject', '[VIC Recruitment] The interview phase is closed'],
    ['heading', 'The interview phase is closed'],
    ['text', 'Hi {first},\n\nThe interview phase is closed. For a candidate whose interview form is already filed, the form, Rating and Final Affectation are locked now. Candidates not interviewed yet can still be interviewed: fill in their row and save the form as usual.\n\nNeed a correction on a locked row? Ask an admin.']] },
  { id: 'INTERVIEW_REOPENED', name: 'Interview phase reopened', to: 'binome', vars: ['first', 'binome'], fields: [
    ['subject', '[VIC Recruitment] The interview phase is open again'],
    ['heading', 'The interview phase is open again'],
    ['text', 'Hi {first},\n\nThe interview phase is open again: every interview form, Rating and Final Affectation of your binome can be edited as before.']] },
];
const MAIL_MAX = 2000; // a pending change refuses a text over 2,100 characters (web/lib/pending.js)
const MAIL_FIELD_LABEL = { subject: 'subject', heading: 'heading', above: 'text above', below: 'text below', text: 'text', codeLabel: 'code box label' };

// Editable in the "Settings" tab (the values below are only the defaults)
const SETTINGS_DEFAULTS = [
  ['ADMIN_EMAIL', '', 'Who receives alerts + the daily digest (comma-separate several emails)'],
  ['TEST_MODE', true, 'TRUE = nothing leaves the admins: emails to anyone else are dropped and binome files are not shared. Set FALSE only for the real launch'],
  ['TIMEZONE', 'Africa/Algiers', 'Timezone used for every date/time'],
  ['HOURS_NOT_CONTACTED', 24, 'Alert if an interviewee is still "Not yet" contacted this many hours after being assigned to a binome (after registering, if the assignment time is missing)'],
  ['HOURS_NO_INTERVIEW_DATE', 48, 'Alert if no interview date is set this many hours after being assigned to a binome (after registering, if the assignment time is missing)'],
  ['HOURS_AFTER_INTERVIEW_NO_FORM', 12, 'Alert if the interview form is still missing this many hours after the interview time'],
  ['INSTANT_EMAIL_MIN_SEVERITY', 'MEDIUM', 'HIGH, MEDIUM or INFO: alerts at/above this level are emailed instantly'],
  ['NOTIFY_BINOME_ON_ALERT', true, 'Also email the binome for big mistakes and delays that concern them'],
  ['NOTIFY_BINOME_ON_NEW_INTERVIEWEE', true, 'Email the binome each time a new interviewee is assigned to them'],
  ['CONFIRM_REGISTRANTS', true, 'Email each new registrant a confirmation with their code (not duplicates, not declined VIC members)'],
  ['SHARE_FILES_WITH_BINOME', true, 'Share each binome file with its two members as editors'],
  ['ASSIGNMENTS_OPEN', true, 'FALSE = stop assigning new registrants (they stay UNASSIGNED until TRUE again)'],
  ['BALANCE_BY', 'ACTIVE', 'ACTIVE = give to the binome with fewest pending interviewees; TOTAL = fewest ever assigned'],
  ['ALL_BINOME_WEIGHT', 1, 'Load multiplier for board (ALL) binomes, e.g. 1.5 means they receive fewer interviewees'],
  ['HR_ONLY_WEIGHT', 2.5, '1, 1.5, 2, 2.5, 3 or 4: an HR-only binome (tag HR) takes about this many times the interviewees of the lightest mixed binome; 1 = the same share'],
  ['EMAIL_DOMAIN', 'g.enp.edu.dz', 'Expected email domain of registrants'],
  ['TRUSTED_BACKUPS', '', 'Emails (comma-separated) of people who often replace interviewers, e.g. the HR head: their backup interviews are logged as INFO instead of emailed'],
  ['SYNC_EVERY_MINUTES', 15, '1, 5, 10, 15 or 30: how often the binome files are read (re-run setup after changing)'],
  ['DIGEST_HOUR', 8, 'Hour (0-23) of the daily digest email (re-run setup after changing)'],
  ['SCREENING', false, 'TRUE = hold low-effort applications for an admin to review and decline VIC members silently; FALSE = every application goes to a binome as before'],
  ['SCREEN_HOLD_AT', 50, 'Risk score (0-100) at or above which a new application waits for an admin instead of going to a binome'],
  ['VIC_MEMBERS_SHEET', '', 'Link of the Google Sheet listing the VIC members (a column whose header contains "mail"): their applications are declined silently'],
  ['INTERVIEW_CLOSE_DATE', '', 'Optional reminder, YYYY-MM-DD or YYYY-MM-DD HH:mm in Algiers time: after it an alert and a banner ask an admin to close the interview phase. Nothing locks by itself. Blank = no date'],

].concat(MAILS.reduce((rows, m) => rows.concat(m.fields.map(f => ['MAIL_' + m.id + '_' + f[0].toUpperCase(), '',
  'Email text (Settings › Emails): ' + m.name + ', ' + MAIL_FIELD_LABEL[f[0]] + ". Blank = the script's text. Placeholders: " +
  m.vars.map(v => '{' + v + '}').join(', ')])), []));

const TAB = {
  SETTINGS: 'Settings', TEAM: 'Team', BINOMES: 'Binomes', IV: 'Interviewees',
  LOG: 'Interview Log', TRACKER: 'Tracker', ALERTS: 'Alerts',
  REG_RESP: 'Registration Responses', INT_RESP: 'Interview Responses', CHANGES: 'Member Changes',
  DASH: 'Dashboard Interviews', IV_CHANGES: 'Interviewee Changes',
};

const TEAM_H = ['Full Name', 'Email', 'Department', 'Pair As', 'Exclude', 'Notes', 'Experienced'];
const BIN_H = ['Binome', 'Member 1', 'Email 1', 'Member 2', 'Email 2', 'Tag', 'Status', 'File', 'File ID', 'Created', 'Paused Until'];
// Plain-text ('@') columns: Setup / formatBinomeSheet_ format them, plainRows_ writes them as they are
const IV_TEXT_COLS = ['Code', 'Phone', 'Facebook', 'Discord', 'Year', 'Interview Date', 'Interview Time', 'Response Key'];
const BF_TEXT_COLS = ['Phone'];
const IV_H = ['Code', 'Binome', 'Status', 'Registered At', 'Assigned At', 'First Name', 'Family Name', 'Email', 'Typed Email',
  'Phone', 'Facebook', 'Discord', 'Field', 'Year', '1st Choice', '2nd Choice', 'Availability', 'Motivation',
  'Anything to add', 'Contacted', 'Contacted Seen At', 'Interview Date', 'Interview Time', 'Interview At',
  'Interview Submitted At', 'Interview Log Row', 'Binome Notes', 'Flags', 'Response Key',
  // added 2026-10-04: more of the registration (shown in the binome sheets) and what the binome records after the interview
  'Birth Date', 'Discovered VIC', 'Why VIC', 'Other Clubs', 'Department Questions', 'Interview Done', 'Rating', 'Final Affectation',
  // added 2026-10-15, admins only (never in the binome sheets): the screening score and its reasons, then each decision
  'Risk', 'Screening'];
const LOG_H = ['Submitted At', 'Submitter', 'Typed Binome', 'Typed Interviewee', 'Binome', 'Interviewee',
  'Result', 'Notes', 'Final Dep', 'Response Key'];
// One row per member change after lock (history; also tells the interview check who used to be in a binome)
const MC_H = ['At', 'By', 'Type', 'Binome', 'Out Name', 'Out Email', 'In Name', 'In Email', 'Interviewees', 'Reason', 'Status'];
// One row per interviewee move and accepted hand edit (Change history; created on first write, never read by the sync)
const IC_H = ['When', 'By', 'Code', 'What', 'From', 'To'];
const ALERT_H = ['ID', 'Created', 'Severity', 'Type', 'Interviewee', 'Binome', 'Message', 'Emailed To',
  'Status', 'Resolved At', 'Key'];
// Columns of every binome file, in order. The code addresses them by these keys; the header row shows BF_LABEL instead.
// The table starts at column BF_COL: column A is the binome's banner (members, code, house).
const BF_COL = 2;
const BF_H = ['Code', 'Registered', 'First Name', 'Family Name', 'Email', 'Birth Date', 'Phone', 'Facebook', 'Discord',
  'Field', 'Year', 'Discovered VIC', 'Why VIC', 'Other Clubs', '1st Choice', '2nd Choice', 'Why this department',
  'Department Questions', 'Availability', 'Anything to add',
  'Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation', 'Interview Form', 'Notes'];
const BF_LABEL = { Code: 'Their Code', Registered: 'Registered On', Email: 'E-mail', Field: 'Field of Study', Year: 'Year of Study',
  'Discovered VIC': 'How They Found VIC', 'Why VIC': 'Why VIC?', 'Why this department': 'Why This Department?',
  Availability: 'When They Are Free', 'Anything to add': 'Anything to Add', Contacted: 'Contacted?', 'Interview Date': 'Interview Day',
  'Interview Time': 'Time', Rating: 'Rating /10', Notes: 'Your Notes' };
const BF_HEAD = BF_H.map(h => BF_LABEL[h] || h);
const BF_EDITABLE = ['Contacted', 'Interview Date', 'Interview Time', 'Interview Done', 'Rating', 'Final Affectation', 'Notes'];
// The first layout (until 2026-10-04): table from column A with these headers. binomeSheet_ rebuilds such a sheet once.
const BF_H_V1 = ['Code', 'First Name', 'Family Name', 'Email', 'Phone', 'Facebook', 'Discord', 'Field', 'Year',
  '1st Choice', '2nd Choice', 'Availability', 'Why this department', 'Anything to add', 'Registered',
  'Contacted', 'Interview Date', 'Interview Time', 'Interview Form', 'Notes'];
const AFFECTATION_OPTIONS = ['IT', 'COMM', 'FLER', 'HR', 'Not accepted'];
// Look of the Master and the binome sheets: Montserrat on parchment, one Hogwarts house per department
// (a binome sheet wears the house of its non-HR side).
const THEME = { font: 'Montserrat', ink: '#2B2118', head: '#740001', headInk: '#F3D27A', band1: '#FFFDF7', band2: '#F6EEDB',
  line: '#E2D3B0', muted: '#8A7A66' };
const HOUSE = {
  IT: { name: 'Ravenclaw', main: '#0E1A40', accent: '#B08D57', light: '#DDE3F0' },
  COMM: { name: 'Gryffindor', main: '#740001', accent: '#D3A625', light: '#F5DCDC' },
  FLER: { name: 'Hufflepuff', main: '#372E29', accent: '#ECB939', light: '#FBEFC8' },
  HR: { name: 'Slytherin', main: '#1A472A', accent: '#AAAAAA', light: '#DCEBDF' },
};
// The houses on the registration form and its mails (GLOSSARY.md, House; owner, 22 Oct): IT and COMM the other way round
// from HOUSE on purpose. The colour is the confirmation's stripe; an unknown department gets aquamarine (MAIL.aqua).
const FORM_HOUSE = {
  IT: { name: 'Gryffindor', colour: '#FF6A5E' }, COMM: { name: 'Ravenclaw', colour: '#7FB0FF' },
  FLER: { name: 'Hufflepuff', colour: '#F4BB35' }, HR: { name: 'Slytherin', colour: '#46D392' },
};
const CONTACT_OPTIONS = ['Not yet', 'Yes', 'No answer', 'Withdrew'];

// Interview Form 2026, copied question by question from its public page (2026-10-18): titles exactly as the form, odd spaces
// included, so they match the Interview Responses headers. The dashboard draws its form from this list (webRun interviewGet).
// The two code questions come first in the form; the dashboard fills them itself (entry ids: the prefilled Google Form link).
const INTERVIEW_CODE_TITLES = ['Your Binôme Code\n(B1 , B2 , B3 , B4,...)', 'Interviewee Code\n(COMM.12, IT.58, HR.23,...)'];
const INTERVIEW_ENTRY = { binome: 'entry.1757583213', code: 'entry.1249446617' };
// The 1st choice picks the department section (its id is the department); every department section then ends on 'final'.
const INTERVIEW_SECTIONS = [
  { id: 'first', title: 'First Impressions', help: 'This section allows the interviewer to evaluate the candidate’s first impression, attitude, and communication skills during the interview.\nPlease fill it objectively and provide comments where necessary.' },
  { id: 'IT', title: 'Information & Technology' }, { id: 'COMM', title: 'Communication' }, { id: 'HR', title: 'Human Resources' },
  { id: 'FLER', title: 'Finance, Logistics & External Relations' }, { id: 'final', title: 'TA9RIR AL MASIR' },
];
const INTERVIEW_BRANCH = 'firstChoice', INTERVIEW_FINAL = 'finalDep';
// What the interviewee is shown during a question, opened from the dashboard form (the Google Form's "#IT Designs" note).
const INTERVIEW_LINKS = {
  itDesign: { label: 'Open the IT designs folder', url: 'https://drive.google.com/drive/folders/18nCJBZ4okd4tNXwV0_jWKrxQNWZ0q426' },
};
// [id, section, title, options (a list = choice, 'text' = paragraph, none = a score from 1 to 10), 0 = optional, help]
const INTERVIEW_QUESTIONS = [
  ['intro', 'first', 'Introduce yourself'],
  ['knowVic', 'first', 'Tell us what you know about VIC'],
  ['motivation', 'first', 'What motivates you to join VIC?  '],
  ['english', 'first', 'Rate your English Level'],
  ['firstChoice', 'first', 'Their 1st Department Choice', ['IT', 'HR', 'FLER', 'COMM'], 1, 'NOTE: If their 2nd Dep Choice howa nefso their 1st Dep Choice ask them if they know the other choices.'],
  ['itPurpose', 'IT', 'According to you, what are the main purposes of the IT Department?'],
  ['itPressure', 'IT', 'Can you manage tasks when working under tight deadlines or high-pressure situations? '],
  ['itFeedback', 'IT', 'You’ve spent many hours on a design, but your mentor or HOD says it doesn’t meet the criteria and must be redone.\nWould you accept this feedback? Do you consider yourself open to constructive criticism?'],
  ['itDesign', 'IT', 'What is your opinion on this design? Feel free to share any thoughts, ideas, or critiques and what could be improved? ', null, 1],
  ['commPurpose', 'COMM', 'For you, what are the main purposes of the COMM Department?'],
  ['commSocial', 'COMM', 'Are you following VIC’s Social Media? Share something you liked and something you think could be improved', null, 1, 'Hna also check ida rah mfollowi l vic hh'],
  ['commIdeas', 'COMM', 'Can you come up with out-of-the-box ideas? If so, where do you draw your inspiration from? '],
  ['commTrends', 'COMM', 'Do you follow Social Media trends? Which ones inspire you or catch your attention? '],
  ['commTiktok', 'COMM', 'Do you have a TikTok account?', ['Yes', 'No', 'No but I would create one']],
  ['commEnglish', 'COMM', 'Evaluate your fluency in English'],
  ['commFrench', 'COMM', '  Evaluate your fluency in French?  '],
  ['hrPurpose', 'HR', 'What do you know about the HR Department and its main purpose?'],
  ['hrOrganized', 'HR', 'Do you consider yourself an organized person? Rate your organizational skills?'],
  ['hrEntertainment', 'HR', 'Are you familiar with VIC Entertainment', ['Yes', 'No']],
  ['hrActivity', 'HR', 'Can you suggest any ideas for a VIC Entertainment Activity?'],
  ['hrTeam', 'HR', "How well do you work in a team? What if it's made of people you don't know?"],
  ['hrInactive', 'HR', 'How would you deal with inactive members?'],
  ['hrLeadership', 'HR', 'How would you rate your leadership skills?  ', null, 0],
  ['flerPurpose', 'FLER', 'According to you, what is the main purpose of the FLER Department?'],
  ['flerWork', 'FLER', 'Do you have any previous professional or work experience?  ', ['Yes', 'No'], 0],
  ['flerSponsor', 'FLER', 'Are you willing to be available for sponsorship meetings or assist with club events and logistics?  ', ['Yes', 'No', 'Maybe']],
  ['flerTraining', 'FLER', 'Are you able to attend all department training sessions and simulations?  ', ['Yes', 'No', 'Maybe']],
  ['flerStress', 'FLER', 'How effectively do you manage stress during professional meetings?'],
  ['flerEnglish', 'FLER', 'Evaluate your fluency in English?'],
  ['flerFrench', 'FLER', 'Evaluate your fluency in French?'],
  ['flerComm', 'FLER', 'Rate your communication skills'],
  ['finalDep', 'final', 'Final Main Department Affectation', ['IT', 'HR', 'FLER', 'COMM', '7ECHOH']],
  ['activity', 'final', 'Activity Department Affectation', ['English Bubble', 'SPARK', 'Training', 'NON-Affiliated'], 1, 'Not very important mais s9sohm brk 3lihm'],
  ['conclusion', 'final', 'Commentaire et Conclusion du TP', 'text', 1, 'General comments and thoughts about this member\nIda bedeltolhm Dep wla 7echitoh say here why\nIda chikor bzf mention it'],
  ['anything', 'final', 'Anything to add?', 'text', 0],
].map(q => ({ id: q[0], section: q[1], title: q[2], type: Array.isArray(q[3]) ? 'choice' : q[3] || 'score',
  options: Array.isArray(q[3]) ? q[3] : null, required: q[4] !== 0, help: q[5] || '', branch: q[0] === INTERVIEW_BRANCH,
  link: INTERVIEW_LINKS[q[0]] || null }));
// The binome sheet's second tab (added after the main one, so getSheets()[0] is unchanged): one row per interview of its
// candidates, written by its members from the dashboard (Source Dashboard) or by the sync (Source Google Form, read-only).
const IA_TAB = 'Interview Answers';
const IA_H = ['Interviewee Code', 'Source', 'Submitted At', 'Submitted By', 'Edited At', 'Edited By'].concat(INTERVIEW_QUESTIONS.map(q => q.title));
// The Master's lasting copy of every dashboard interview (Reset trashes the binome sheets): the Interview Responses columns
// (Email Address = who submitted, the binome code as the form's question), then the edit and what the form last filled.
const DASH_H = ['Timestamp', 'Email Address'].concat(INTERVIEW_CODE_TITLES, INTERVIEW_QUESTIONS.map(q => q.title),
  ['Edited At', 'Edited By', 'Filled Rating', 'Filled Affectation', 'Response Key']);

const ST = { ASSIGNED: 'ASSIGNED', CONTACTED: 'CONTACTED', SCHEDULED: 'SCHEDULED', INTERVIEWED: 'INTERVIEWED',
  WITHDRAWN: 'WITHDRAWN', UNASSIGNED: 'UNASSIGNED', DUPLICATE: 'DUPLICATE', HELD: 'HELD', DECLINED: 'DECLINED' };
/** Out of the recruitment: not counted, not in the loads, not matched by the interview form (DECLINED = by screening). */
function isOut_(st) { return st === ST.DUPLICATE || st === ST.DECLINED; }
const PENDING_STATUSES = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED];
const SEV_RANK = { INFO: 1, MEDIUM: 2, HIGH: 3 };
// Alert types that close themselves once the problem disappears
// (timingAlerts_ closes these; the screening alerts NEEDS_REVIEW, VIC_MEMBER and MEMBERS_SHEET close in screenWaiting_)
const AUTO_RESOLVING = ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'NO_BINOME', 'UNPAIRED_MEMBER', 'PAUSE_DATE'];
// Statuses of an alert put aside from the dashboard: its key is not raised again while it holds one
const HELD_STATUSES = ['SNOOZED', 'MUTED'];

// Screening (owner, 2026-10-15): a why-answer that is only punctuation, under 2 words or one of these phrases holds the
// application for a person. Phrases are in normText form; a repeated word counts once ("test test").
const NON_ANSWERS = ['i don t know', 'i dont know', 'idk', 'no idea', 'nothing', 'rien', 'je sais pas', 'je ne sais pas',
  'jsp', 'test', 'none', 'n a', 'na'];

const DEPTS = ['IT', 'COMM', 'FLER', 'HR'];
const DEPT_ALIASES = { it: 'IT', info: 'IT', comm: 'COMM', com: 'COMM', communication: 'COMM',
  hr: 'HR', rh: 'HR', fler: 'FLER', flr: 'FLER', fller: 'FLER' };
const NAME_STOP = { and: 1, et: 1, the: 1, binome: 1, code: 1, with: 1, avec: 1, les: 1, des: 1 };
