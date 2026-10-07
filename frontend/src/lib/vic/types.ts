// Shapes returned by the Apps Script web API (WebApp.gs: webAccess / webState / webRun / webPulse).
// API_VERSION must match the script; bump together with WebApp.gs (test/vercel.test.js checks they match).
export const API_VERSION = 3

export type Severity = "HIGH" | "MEDIUM" | "INFO"
export type Status = "UNASSIGNED" | "ASSIGNED" | "CONTACTED" | "SCHEDULED" | "INTERVIEWED" | "WITHDRAWN" | "DUPLICATE"
export type BinomeStatus = "ACTIVE" | "PAUSED" | "DRAFT"
export type FixMode = "apply" | "revert" | "accept"
export type Dept = "IT" | "COMM" | "FLER" | "HR"

export interface Access {
  ok: boolean
  /** "member": their binome only (task 7 gives them a page; until then they get the no-access screen) */
  role: "" | "admin" | "member"
  email: string
  reason: "" | "NO_EMAIL" | "DOMAIN" | "NO_PROJECT" | "READ_ONLY"
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

export type QuickInfo =
  | { kind: "reg"; iv: RegView; old?: RegView }
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
}

export interface Interviewee {
  code: string
  binome: string
  status: Status
  name: string
}

export interface TeamMember {
  name: string
  email: string
  pairAs: string
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
