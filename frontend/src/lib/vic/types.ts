// Shapes returned by the Apps Script web API (WebApp.gs: webAccess / webState / webRun / webPulse).
// API_VERSION must match the script; bump together with web/index.html and WebApp.gs.
export const API_VERSION = 2

export type Severity = "HIGH" | "MEDIUM" | "INFO"
export type Status = "UNASSIGNED" | "ASSIGNED" | "CONTACTED" | "SCHEDULED" | "INTERVIEWED" | "WITHDRAWN" | "DUPLICATE"
export type BinomeStatus = "ACTIVE" | "PAUSED" | "DRAFT"
export type FixMode = "apply" | "revert" | "accept"
export type Dept = "IT" | "COMM" | "FLER" | "HR"

export interface Access {
  ok: boolean
  email: string
  reason: "" | "NO_EMAIL" | "DOMAIN" | "NO_PROJECT" | "READ_ONLY"
  owner: boolean
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

export interface CoverCheck {
  errors: string[]
  warnings: string[]
  done?: boolean
  inn: { name: string }
  groups: { binome: string; codes: string[]; out: { name: string } | null }[]
}
