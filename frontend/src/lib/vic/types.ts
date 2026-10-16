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
  | { kind: "iv"; check: string; code: string; contacted: string; date: string; time: string; regYear: string; ahead: boolean }
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
  fileUrl: string
  members: string[]
  people: Person[]
  assigned: number
  interviewed: number
  withdrew: number
  open: number
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

export interface SettingRow {
  key: string
  value: string | number | boolean
  help: string
  kind: SettingKind
}

/** One row of the Member Changes tab. A swap is two PERMANENT rows; a cover is TEMPORARY with the covered codes. */
export interface HistoryRow {
  at: string
  by: string
  type: "PERMANENT" | "TEMPORARY" | string
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
  switchUrl: string
  updated: string
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
  }
  settingsAll: SettingRow[]
  team: { total: number; excluded: number; issues: number; source: string }
  counts: { byStatus: Record<string, number>; byDep: Record<string, number> }
  locked: boolean
  unpaired: Unpaired[]
  covers: Cover[]
  history: HistoryRow[]
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
export type Candidate = Record<SheetKey, string | number | boolean> & { Status: Status | "" }

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

/** What memberSet saved, in the slice's own form (Done a boolean, Rating a number or "", the rest text as the sheet shows it). */
export interface MemberSetOut {
  code: string
  field: GoldKey
  value: string | number | boolean
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
  fileUrl: string
  members: string[]
  candidates: Candidate[]
  alerts: MemberAlert[]
  fromSheet: boolean
  cover: boolean
  /** they can edit their binome sheet (an admin gave edit access): the gold columns are editable here */
  edit: boolean
  user: string
  switchUrl: string
}

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

export interface CoverCheck {
  errors: string[]
  warnings: string[]
  done?: boolean
  inn: { name: string }
  groups: { binome: string; codes: string[]; out: { name: string } | null }[]
}
