// Shapes returned by the Apps Script web API (WebApp.gs: webAccess / webState / webRun / webPulse).
// API_VERSION must match the script; bump together with WebApp.gs (test/vercel.test.js checks they match).
export const API_VERSION = 3

export type Severity = "HIGH" | "MEDIUM" | "INFO"
/** HELD: screening put it aside for an admin; DECLINED: out by screening (a VIC member, or an admin's decision) */
export type Status = "UNASSIGNED" | "ASSIGNED" | "CONTACTED" | "SCHEDULED" | "INTERVIEWED" | "WITHDRAWN" | "DUPLICATE" | "HELD" | "DECLINED"
export type BinomeStatus = "ACTIVE" | "PAUSED" | "DRAFT"
export type FixMode = "apply" | "revert" | "accept"
export type Dept = "IT" | "COMM" | "FLER" | "HR"

export interface Access {
  ok: boolean
  /** "member": their binome only, read-only (the My binome page); "admin": an editor of the Master */
  role: "" | "admin" | "member"
  email: string
  /** NOT_SHARED: in a binome, but their binome sheet isn't open to them (an admin opens it from Binomes) */
  reason: "" | "NO_EMAIL" | "DOMAIN" | "NO_PROJECT" | "READ_ONLY" | "NOT_SHARED"
  owner: boolean
  binome: string
  cover: boolean
  v: number
  /** Google profile picture URL; absent on an older script, "" when the account has none */
  photo?: string
}

export interface Alert {
  id: string
  created: string
  severity: Severity
  type: string
  code: string
  binome: string
  msg: string
  fix: FixMode[]
  /** what the quick actions need (QuickFix.gs quickInfo_); absent on an older script */
  q?: QuickInfo | null
}

/** A registration as the Interviewees tab holds it (dates already formatted). */
export interface RegView {
  code: string
  binome: string
  status: Status | string
  first: string
  family: string
  email: string
  typed: string
  phone: string
  birth: string
  c1: string
  c2: string
  field: string
  year: string
  availability: string
  registered: string
}

/** One Interview Log row. subBinome = the locked binome its sender is a member of. */
export interface FormView {
  row: number
  at: string
  submitter: string
  submitterName: string
  typedBinome: string
  typedIv: string
  binome: string
  interviewee: string
  result: string
  finalDep: string
  subBinome: string
}

export type RepairKind = "rename" | "reorder" | "protect" | "dedupe" | "remove" | "putback" | "reshare" | "unshare" | "retry" | ""

/** The answers an admin reads to review a held application (QuickFix.gs appView_). screening = the reasons ("Held: …"),
 *  then each decision ("Approved by …"); risk null = not scored (screening was off, or a VIC member). */
export interface AppView {
  whyVic: string
  motivation: string
  deptQuestions: string
  anything: string
  clubs: string
  risk: number | null
  screening: string
}

export type QuickInfo =
  | { kind: "reg"; iv: RegView; old?: RegView; app?: AppView }
  | { kind: "iv"; check: string; code: string; contacted: string; date: string; time: string; regYear: string; ahead: boolean; atMs?: number; dateText?: string; timeText?: string }
  | { kind: "log"; check: string; form: FormView; first?: FormView }
  | { kind: "integ"; check: string; subject: string; repair: RepairKind }
  | { kind: "member"; email: string }
  | { kind: "file"; repair: RepairKind }

/** A snoozed or muted alert (the Muted filter). until = end of the snooze. */
export interface HeldAlert {
  id: string
  created: string
  severity: Severity
  type: string
  code: string
  binome: string
  msg: string
  status: "SNOOZED" | "MUTED"
  until: string
}

export interface QuickOut {
  lines: string[]
  done: string[]
}

export interface MailDraft {
  group: string
  to: string
  ids: string[]
  subject: string
  body: string
}

export interface Person {
  name: string
  email: string
}

export interface Binome {
  code: string
  tag: string
  status: BinomeStatus
  /** the date a paused binome resumes (ms); absent on an older script */
  pausedUntil?: number | null
  fileUrl: string
  members: string[]
  people: Person[]
  assigned: number
  interviewed: number
  withdrew: number
  open: number
  /** the load the next pick compares (Balance interviewees by); absent on an older script */
  load?: number
  /** the level an admin last opened this binome at from the dashboard ("" = never); Drive is the truth (binomeAccess) */
  access?: "" | AccessLevel
  /** a DRAFT paired by hand on the Pairing panel (Redraw all asks before it loses one); absent on an older script */
  byHand?: boolean
}

/** What a binome's members can do in their sheet, and so on the dashboard. */
export type AccessLevel = "none" | "view" | "edit"
/** webRun binomeAccess: the members' access read live from Drive (owner = owns the sheet). */
export interface BinomeAccessOut {
  binome: string
  level: "" | AccessLevel
  members: { email: string; now: AccessLevel | "owner" }[]
  errors: string[]
}

export interface Interviewee {
  code: string
  binome: string
  status: Status
  name: string
  /** screening risk 0–100; null = not scored; absent on an older script */
  risk?: number | null
  /** Schedule (docs/plans.md); all absent on an older script. 1st choice */
  dept?: string
  /** the binome sheet's Contacted ("Not yet", "Yes", …) */
  contacted?: string
  /** interview time read from the binome sheet, ms (show it in settings.tz); null = no date, or one the sync can't read (BAD_DATE) */
  at?: number | null
  /** ms; null = not assigned */
  assignedAt?: number | null
  /** their availability answer from the registration */
  avail?: string
}

/** One row of the Interviewee Changes tab: a move (from / to = binome codes) or an accepted hand edit (from / to = "Field: value";
 *  to = "row deleted" for a deleted row; code = the binome's code for a Binomes-tab edit). at dd/MM/yyyy HH:mm. */
export interface IvHistoryRow {
  at: string
  by: string
  code: string
  what: "Moved" | "Edit accepted" | string
  from: string
  to: string
}

/** A birth date as Analytics shows it (Rules.gs birthInfo): date yyyy-MM-dd (or the text as typed when unreadable); suspect =
 *  unreadable or an age outside 15–35; guess = the same day and month with the year expected from the year of study, or "". */
export interface BirthInfo {
  date: string
  suspect: boolean
  guess: string
}

/** One registration for Analytics (webAnalytics; duplicates included, their status says so). Times are ms or null; show them in tz. */
export interface AnalyticsRow {
  code: string
  binome: string
  status: Status | ""
  flags: string
  risk: number | null
  registered: number | null
  assignedAt: number | null
  contactedAt: number | null
  interviewAt: number | null
  submittedAt: number | null
  first: string
  family: string
  email: string
  typedEmail: string
  field: string
  year: string
  c1: string
  c2: string
  birth: BirthInfo
  /** "How did you discover VIC?": the checked options joined by commas, plus any Other text */
  discovered: string
  whyVic: string
  /** why their 1st-choice department */
  motivation: string
  clubs: string
  /** the 1st choice's own questions, one "question answer" per line */
  deptQuestions: string
  avail: string
  anything: string
  contacted: string
  notes: string
  finalDep: string
}

export interface AnalyticsState {
  v: number
  tz: string
  rows: AnalyticsRow[]
}

/** Settings › Screening: the switch, the threshold, and the last read of the VIC members sheet (at "" = never). */
export interface ScreeningState {
  on: boolean
  holdAt: number
  linked: boolean
  members: { at: string; n: number; error: string }
}

/** webRun rejections without send: who would get the email, and its default text ({first} = their first name). */
export interface RejectionsPreview {
  count: number
  sample: string[]
  subject: string
  body: string
  testMode: boolean
}

export interface TeamMember {
  name: string
  email: string
  pairAs: string
  /** has interviewed before (Team tab › Experienced; Import ticks the 2025 team); absent on an older script */
  experienced?: boolean
}

export interface Unpaired extends TeamMember {
  draft?: string
}

export interface Cover {
  row: number
  binome: string
  name: string
  email: string
  outName: string
  codes: string[]
  live: string[]
  reason: string
}

export type SettingKind =
  | { type: "bool" }
  | { type: "number" }
  | { type: "text" }
  | { type: "enum"; options: (string | number)[] }

/** One mail the script lets admins reword (MAILS in Config.gs). */
export interface MailDef {
  id: string
  name: string
  to: "candidate" | "binome"
  vars: string[]
  fields: { key: string; field: string; def: string }[]
}

export interface SettingRow {
  key: string
  value: string | number | boolean
  help: string
  kind: SettingKind
}

/** One row of the Member Changes tab. A swap is two PERMANENT rows; a cover is TEMPORARY with the covered codes; a department
 *  change is TAG, out = the old tag, inn = the new one, codes = the interviewees it kept that the new tag doesn't cover. */
export interface HistoryRow {
  at: string
  by: string
  type: "PERMANENT" | "TEMPORARY" | "TAG" | "STATUS" | string
  binome: string
  out: string
  inn: string
  codes: string[]
  reason: string
  status: string
}

export interface WebState {
  user: string
  owner: boolean
  v: number
  updated: string
  /** ms the snapshot's data was read (moves only with its content); absent on an older script */
  built?: number
  /** the owner's switch: saves become pending changes (docs/plans.md › Slice 2); absent on an older script = off */
  pending?: boolean
  /** an admin who is in a locked binome or a live cover: their binome, as a member gets it (My binome); false = Drive
   *  failed this time (keep the last one) */
  member?: MemberState | false
  links: { master: string; registrationForm: string; interviewForm: string; binomeFolder: string }
  settings: {
    assignmentsOpen: boolean
    testMode: boolean
    shareFiles: boolean
    notifyBinome: boolean
    notifyNew: boolean
    syncEvery: number
    digestHour: number
    admins: string[]
    /** the Master's TIMEZONE, for the ms times; absent on an older script */
    tz?: string
  }
  settingsAll: SettingRow[]
  /** absent on a script from before the Emails page */
  mails?: MailDef[]
  team: { total: number; excluded: number; issues: number; source: string }
  counts: { byStatus: Record<string, number>; byDep: Record<string, number> }
  locked: boolean
  unpaired: Unpaired[]
  covers: Cover[]
  history: HistoryRow[]
  /** moves and accepted hand edits, newest first; absent on an older script */
  ivHistory?: IvHistoryRow[]
  teamList: TeamMember[]
  binomes: Binome[]
  alertCounts: Record<Severity, number>
  alerts: Alert[]
  /** snoozed and muted alerts; absent on an older script */
  muted?: HeldAlert[]
  interviewees: Interviewee[]
  /** absent on an older script */
  screening?: ScreeningState
}

/** A candidate as their binome sheet holds it (WebApp.gs candidate_: the BF_H keys, plus Status from the Master;
 *  dates as dd/MM/yyyy, Interview Time HH:mm, Registered dd/MM/yyyy HH:mm). */
export type Candidate = Record<SheetKey, string | number | boolean> & {
  Status: Status | ""
  /** the interview form that counts, once one is in (absent on an older script): Dashboard = edited from My binome,
   *  Google Form = only viewed there. at dd/MM HH:mm, by = who sent it first (an email). */
  interview?: CandidateInterview
}
export interface CandidateInterview {
  at: string
  by: string
  source: "Dashboard" | "Google Form"
}

/** The binome sheet's columns, in its order (Config.gs BF_H); the sheet's own header labels are in SHEET_LABEL. */
export const SHEET_KEYS = [
  "Code", "Registered", "First Name", "Family Name", "Email", "Birth Date", "Phone", "Facebook", "Discord",
  "Field", "Year", "Discovered VIC", "Why VIC", "Other Clubs", "1st Choice", "2nd Choice", "Why this department",
  "Department Questions", "Availability", "Anything to add",
  "Contacted", "Interview Date", "Interview Time", "Interview Done", "Rating", "Final Affectation", "Interview Form", "Notes",
] as const
export type SheetKey = (typeof SHEET_KEYS)[number]

/** The binome's own columns (Config.gs BF_EDITABLE): a member (not a cover) edits them from My binome (webRun memberSet). */
export const GOLD_KEYS = ["Contacted", "Interview Date", "Interview Time", "Interview Done", "Rating", "Final Affectation", "Notes"] as const
export type GoldKey = (typeof GOLD_KEYS)[number]
/** The sheet's own validations (Config.gs CONTACT_OPTIONS, AFFECTATION_OPTIONS). */
export const CONTACT_OPTIONS = ["Not yet", "Yes", "No answer", "Withdrew"] as const
export const AFFECTATION_OPTIONS = ["IT", "COMM", "FLER", "HR", "Not accepted"] as const

/** memberSet's answer for one field: the value saved, in the slice's own form (Done a boolean, Rating a number or "", the rest
 *  text as the sheet shows it); or conflict = what the partner put in the cell meanwhile; or error = why the value was refused. */
export type MemberSetField = { field: GoldKey } & ({ value: string | number | boolean } | { conflict: string } | { error: string })
export interface MemberSetOut {
  code: string
  fields: MemberSetField[]
}

/** An open alert of the member's binome (only the types the script mails to binomes). */
export interface MemberAlert {
  id: string
  created: string
  severity: Severity
  type: string
  code: string
  msg: string
}

/** webState for a member: their binome's slice. fromSheet = the cache was cold and it was read from their sheet
 *  (then no statuses, alerts, tag or member names: those live in the Master). A cover gets only the codes they cover. */
export interface MemberState {
  role: "member"
  v: number
  binome: string
  tag: string
  status: BinomeStatus | ""
  /** the date a paused binome resumes (ms); absent on an older script or read from the sheet */
  pausedUntil?: number | null
  fileUrl: string
  members: string[]
  candidates: Candidate[]
  alerts: MemberAlert[]
  fromSheet: boolean
  cover: boolean
  /** they can edit their binome sheet (an admin gave edit access): the gold columns are editable here */
  edit: boolean
  user: string
  /** the owner's switch: My binome saves become pending changes (docs/plans.md › Slice 3); absent on an older script = off */
  pending?: boolean
  /** the Google Form prefilled with the binome code, ending in the interviewee code's entry= (append the code); "" while the
   *  script doesn't know its URL yet. Absent on a script without the dashboard form: the interview buttons stay hidden. */
  interviewForm?: string
}

/** One question of Interview Form 2026 as Config.gs INTERVIEW_QUESTIONS holds it (the page draws the form from these). */
export interface InterviewQuestion {
  id: string
  section: string
  title: string
  type: "score" | "choice" | "text"
  options: string[] | null
  required: boolean
  help: string
  /** the 1st department choice: its answer picks the department section */
  branch: boolean
  /** what the interviewee looks at for this question (a Drive folder); absent before the script deploy */
  link?: { label: string; url: string } | null
}
export interface InterviewSection {
  id: string
  title: string
  help?: string
}
export type InterviewAnswer = string | number
/** webRun interviewGet: one candidate's interview form. answers null = none yet. stamp = the `seen` a save sends back. */
export interface InterviewData {
  code: string
  binome: string
  name: string
  /** from their registration */
  firstChoice: string
  /** may save here: edit access, not a cover (a Google Form row stays read-only anyway) */
  edit: boolean
  sections: InterviewSection[]
  questions: InterviewQuestion[]
  formUrl: string
  answers: Record<string, InterviewAnswer> | null
  source: "" | "Dashboard" | "Google Form"
  submittedAt?: string
  submittedBy?: string
  editedAt?: string
  editedBy?: string
  stamp: string
}
/** webRun interviewSave: the row as saved, and the candidate's interview as the slice now holds it. */
export type InterviewSaved = Omit<InterviewData, "binome" | "name" | "firstChoice" | "edit" | "sections" | "questions" | "formUrl"> & { interview: CandidateInterview }

/** What webRun returns: messages for the activity log and toast, plus an action-specific result. */
export interface RunOut<R = unknown> {
  messages: string[]
  result: R
}

export interface LockCheck {
  drafts: number
  share: boolean
  problems: string[]
}

export interface ImportConfirm {
  confirm?: boolean
  existing: number
  incoming: number
  source: string
}

export interface ChangePlan {
  binome: string
  out: Person | null
  inn: (Person & { name: string }) | null
}

export interface ChangeCheck {
  errors: string[]
  warnings: string[]
  done?: boolean
  binome?: string
  out?: Person | null
  inn?: Person | null
  plans?: ChangePlan[]
}

/** webRun draftPair: the DRAFT row written (its code moves when an earlier draft is removed). */
export interface DraftPairOut {
  binome: string
  tag: string
  warning: string
  bothNew: boolean
}

export interface NewBinomeCheck {
  errors: string[]
  warnings: string[]
  done?: string[]
  binome: string
  tag: string
  members: { name: string; email: string }[]
}

/** webRun binomeTag: the departments a binome receives. Interviewees in progress the new tag no longer covers stay (stranded). */
export interface BinomeTagCheck {
  errors: string[]
  warnings: string[]
  done?: string[]
  binome: string
  from: string
  to: string
  stranded: { code: string; name: string; dept: string }[]
}

export interface CoverCheck {
  errors: string[]
  warnings: string[]
  done?: boolean
  inn: { name: string }
  groups: { binome: string; codes: string[]; out: { name: string } | null }[]
}

/** One cell in the author's pending-changes record (web/lib/pending.js). value = what they want, seen = what they saw. */
interface EntryBase {
  id: string
  /** "alert:A-0012", "setting:DIGEST_HOUR", "field:IT.12:Rating" */
  cell: string
  at: number
  state: "pending" | "applied" | "met" | "dropped"
  /** Google's write (or check) time */
  wrote?: number
  /** the sheet's value when it was dropped */
  sheet?: string
  reason?: string
  /** Apply mine anyway is offered */
  again?: boolean
  shown?: number
  /** a page still showing the drop (once a minute, on the pulse) */
  seenAt?: number
  /** the sync emailed the author about it */
  mailed?: number
  addressed?: number
}
export interface AlertEntry extends EntryBase {
  kind: "alert"
  alert: string
  op: "resolve" | "snooze" | "mute" | "unmute"
  value: "RESOLVED" | "SNOOZED" | "MUTED" | "OPEN"
  seen: "OPEN" | "SNOOZED" | "MUTED"
  until?: number
}
export type CellValue = string | number | boolean
export interface SettingEntry extends EntryBase {
  kind: "setting"
  key: string
  value: CellValue
  seen: CellValue
}
export interface FieldEntry extends EntryBase {
  kind: "field"
  code: string
  field: GoldKey
  value: CellValue
  seen: CellValue
}
/** An admin's Experienced tick of one Team member */
export interface TeamEntry extends EntryBase {
  kind: "team"
  email: string
  value: boolean
  seen: boolean
}
export type AdminGoldKey = "Contacted" | "Interview Date" | "Interview Time"
/** An admin's Fix of Contacted or the interview date / time, in that binome's sheet */
export interface BFieldEntry extends EntryBase {
  kind: "bfield"
  binome: string
  code: string
  field: AdminGoldKey
  value: CellValue
  seen: CellValue
}
export type BinomeOp = "pause" | "resume" | "date"
/** An admin's pause, resume or change of resume date of one binome, with the codes to move away on a pause */
export interface BinomeEntry extends EntryBase {
  kind: "binome"
  binome: string
  op: BinomeOp
  value: "ACTIVE" | "PAUSED"
  seen: "ACTIVE" | "PAUSED"
  note: string
  until: number | null
  codes: string[]
}
/** A move a pause could not make: always a drop, with its reason */
export interface BMoveEntry extends EntryBase {
  kind: "bmove"
  binome: string
  code: string
}
export type PendingEntry = AlertEntry | SettingEntry | FieldEntry | TeamEntry | BFieldEntry | BinomeEntry | BMoveEntry
/** cell → entry */
export type PendingRec = Record<string, PendingEntry>
/** A change as the page sends it to the accept step. built = its snapshot's build time (admins). */
export type PendingChange =
  | { kind: "alert"; alert: string; op: AlertEntry["op"]; seen: AlertEntry["seen"]; at: number; until?: number; built?: number }
  | { kind: "setting"; key: string; value: CellValue; seen: CellValue; at: number; built?: number }
  | { kind: "field"; code: string; field: GoldKey; value: CellValue; seen: CellValue; at: number }
  | { kind: "team"; email: string; value: boolean; seen: boolean; at: number }
  | { kind: "bfield"; binome: string; code: string; field: AdminGoldKey; value: CellValue; seen: CellValue; at: number }
  | { kind: "binome"; binome: string; op: BinomeOp; value: BinomeEntry["value"]; seen: BinomeEntry["seen"]; note: string; until: number | null; codes: string[]; at: number }

/** webRun('candidateGet'): one candidate's twelve editable values (the Edit form) with the registration form's options */
export interface CandidateData {
  code: string
  name: string
  status: string
  binome: string
  values: Record<string, string>
  fields: string[]
  years: string[]
  days: string[]
}

/** webRun('editCandidate'): move is set when their binome does not take the new 1st choice (nothing moved yet) */
export interface EditResult {
  text: string
  move: { code: string; binome: string; dep: string } | null
}
