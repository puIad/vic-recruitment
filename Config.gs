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
 ******************************************************************************/

// IDs of the files created in Drive › Recruitment › VIC Recruitment 2026
const CONFIG = {
  REGISTRATION_FORM_ID: '11dfunyOymN1vsoIlcDuw-kENHYLI2qMWaSLbzQpHHy4',
  INTERVIEW_FORM_ID:    '1fhesZ_Xa4eUhrtlDsm4-tnt2MI7iZWy_QIiKzjmM8NM',
  BINOME_FOLDER_ID:     '18xTMFZLrRhBrbKbABD-eY0kaP4diYWzb',
  TEAM_DB_DEFAULT_ID:   '10FILUcr8WXOWvHnZQdTJemcejO7ppdMyWX1pm1eiaF0', // RECRUITMENT 2025 DATABASE
};

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
  ['SHARE_FILES_WITH_BINOME', true, 'Share each binome file with its two members as editors'],
  ['ASSIGNMENTS_OPEN', true, 'FALSE = stop assigning new registrants (they stay UNASSIGNED until TRUE again)'],
  ['BALANCE_BY', 'ACTIVE', 'ACTIVE = give to the binome with fewest pending interviewees; TOTAL = fewest ever assigned'],
  ['ALL_BINOME_WEIGHT', 1, 'Load multiplier for board (ALL) binomes, e.g. 1.5 means they receive fewer interviewees'],
  ['EMAIL_DOMAIN', 'g.enp.edu.dz', 'Expected email domain of registrants'],
  ['TRUSTED_BACKUPS', '', 'Emails (comma-separated) of people who often replace interviewers, e.g. the HR head: their backup interviews are logged as INFO instead of emailed'],
  ['SYNC_EVERY_MINUTES', 15, '1, 5, 10, 15 or 30: how often the binome files are read (re-run setup after changing)'],
  ['DIGEST_HOUR', 8, 'Hour (0-23) of the daily digest email (re-run setup after changing)'],
  ['SCREENING', false, 'TRUE = hold low-effort applications for an admin and decline VIC members silently (Settings › Screening)'],
  ['SCREEN_HOLD_AT', 50, 'Risk score (0-100) at or above which a new application waits for an admin instead of going to a binome'],
  ['VIC_MEMBERS_SHEET', '', 'Link of the Google Sheet listing the VIC members (a column whose header contains "mail"): their applications are declined silently'],
];

const TAB = {
  SETTINGS: 'Settings', TEAM: 'Team', BINOMES: 'Binomes', IV: 'Interviewees',
  LOG: 'Interview Log', TRACKER: 'Tracker', ALERTS: 'Alerts',
  REG_RESP: 'Registration Responses', INT_RESP: 'Interview Responses', CHANGES: 'Member Changes',
};

const TEAM_H = ['Full Name', 'Email', 'Department', 'Pair As', 'Exclude', 'Notes', 'Experienced'];
const BIN_H = ['Binome', 'Member 1', 'Email 1', 'Member 2', 'Email 2', 'Tag', 'Status', 'File', 'File ID', 'Created'];
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
const CONTACT_OPTIONS = ['Not yet', 'Yes', 'No answer', 'Withdrew'];

const ST = { ASSIGNED: 'ASSIGNED', CONTACTED: 'CONTACTED', SCHEDULED: 'SCHEDULED', INTERVIEWED: 'INTERVIEWED',
  WITHDRAWN: 'WITHDRAWN', UNASSIGNED: 'UNASSIGNED', DUPLICATE: 'DUPLICATE', HELD: 'HELD', DECLINED: 'DECLINED' };
/** Out of the recruitment: not counted, not in the loads, not matched by the interview form (DECLINED = by screening). */
function isOut_(st) { return st === ST.DUPLICATE || st === ST.DECLINED; }
const PENDING_STATUSES = [ST.ASSIGNED, ST.CONTACTED, ST.SCHEDULED];
const SEV_RANK = { INFO: 1, MEDIUM: 2, HIGH: 3 };
// Alert types that close themselves once the problem disappears
// (timingAlerts_ closes these; the screening alerts NEEDS_REVIEW, VIC_MEMBER and MEMBERS_SHEET close in screenWaiting_)
const AUTO_RESOLVING = ['NOT_CONTACTED', 'NO_DATE', 'OVERDUE', 'BAD_DATE', 'NO_BINOME', 'UNPAIRED_MEMBER'];
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
