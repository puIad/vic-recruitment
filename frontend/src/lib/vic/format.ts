import type { BinomeStatus, SheetKey, Severity, Status } from "./types"

/** Pipeline stages in order. The ramp runs cobalt, blue, teal, aquamarine: the charter gradient, as candidates progress. */
export const STAGES: { key: Status; label: string; hint: string; color: string }[] = [
  { key: "UNASSIGNED", label: "Waiting", hint: "Registered, no binome yet", color: "#9aa8b4" },
  { key: "ASSIGNED", label: "Assigned", hint: "Has a binome, not contacted", color: "#1a52a2" },
  { key: "CONTACTED", label: "Contacted", hint: "The binome reached out", color: "#127dbb" },
  { key: "SCHEDULED", label: "Scheduled", hint: "Interview date set", color: "#3da3b4" },
  { key: "INTERVIEWED", label: "Interviewed", hint: "Interview done", color: "#69c4af" },
  { key: "WITHDRAWN", label: "Withdrew", hint: "Candidate withdrew", color: "#7849a8" },
]

export const STATUS_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]))
STATUS_LABEL.DUPLICATE = "Duplicate"
STATUS_LABEL.HELD = "On hold"
STATUS_LABEL.DECLINED = "Declined"

/** Outside the pipeline: screening's statuses, for filters and badges (not stages a candidate moves through). */
export const SCREEN_STAGES: { key: Status; label: string; hint: string; color: string }[] = [
  { key: "HELD", label: "On hold", hint: "Waiting for an admin to review", color: "#f29a09" },
  { key: "DECLINED", label: "Declined", hint: "Out: a VIC member, or declined by an admin", color: "#b6abb9" },
]

/** Out of the recruitment, never counted as registrants (Config.gs isOut_). */
export const isOut = (status: string) => status === "DUPLICATE" || status === "DECLINED"

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(STAGES.concat(SCREEN_STAGES).map((s) => [s.key, s.color]))

export const SEVERITY: Record<Severity, { label: string; tone: string; rank: number }> = {
  HIGH: { label: "High", tone: "bg-danger-soft text-danger", rank: 3 },
  MEDIUM: { label: "Medium", tone: "bg-warning-soft text-warning", rank: 2 },
  INFO: { label: "Info", tone: "bg-info-soft text-info", rank: 1 },
}

export const BINOME_STATUS: Record<BinomeStatus, { label: string; dot: string }> = {
  ACTIVE: { label: "Active", dot: "bg-vic-aqua" },
  PAUSED: { label: "Paused", dot: "bg-vic-orange" },
  DRAFT: { label: "Draft", dot: "bg-muted-foreground/50" },
}

const ALERT_LABELS: Record<string, string> = {
  NOT_CONTACTED: "Not contacted in time",
  NO_DATE: "No interview date",
  OVERDUE: "Interview overdue",
  BAD_DATE: "Date looks wrong",
  NO_BINOME: "No binome for this registrant",
  UNPAIRED_MEMBER: "Member without a binome",
  SAME_CHOICES: "Same department chosen twice",
  DROPPED: "Dashboard changes not applied",
  INVALID_CHOICE: "Invalid department choice",
  BAD_EMAIL: "Email looks wrong",
  EMAIL_MISMATCH: "Email does not match the name",
  EXTERNAL_EMAIL: "Personal email address",
  BAD_PHONE: "Phone number looks wrong",
  BAD_BIRTHDATE: "Birth date looks wrong",
  MISSING_NAME: "Name missing",
  DUPLICATE_REGISTRATION: "Registered twice",
  UNKNOWN_INTERVIEWEE: "Interview form for an unknown code",
  BINOME_MISMATCH: "Form filled by another binome",
  BACKUP_INTERVIEWER: "Backup interviewer",
  DUPLICATE_INTERVIEW: "Interview form sent twice",
  NOT_ASSIGNED: "Form for an unassigned candidate",
  CHOICE_MISMATCH: "Department choice differs",
  AUTOCORRECTED: "Form autocorrected",
  FILE_ERROR: "Sheet or sharing error",
  MEMBER_CHANGED: "Member changed",
  COVER_ADDED: "Cover started",
  REASSIGNED: "Interviewee moved",
  MANUAL_EDIT: "Edited by hand",
  ODD_VALUE: "Odd value in a sheet",
  INTEGRITY: "Sheet check",
  NEEDS_REVIEW: "Waiting for review",
  VIC_MEMBER: "VIC member in a binome",
  VIC_MEMBER_DECLINED: "VIC member declined",
  MEMBERS_SHEET: "Members sheet unreadable",
}

/** Sentence-case label for an alert type (the charter forbids all-caps setting of Gilroy). */
export function alertLabel(type: string): string {
  if (ALERT_LABELS[type]) return ALERT_LABELS[type]
  const t = type.toLowerCase().replace(/_/g, " ")
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0)

export function initials(s: string): string {
  const base = (s || "?").split("@")[0].replace(/[._-]+/g, " ").trim()
  const parts = base.split(/\s+/).filter(Boolean)
  const out = (parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  return out.toUpperCase()
}

export function displayName(email: string): string {
  const base = (email || "").split("@")[0].replace(/[._-]+/g, " ")
  return base.replace(/\b\w/g, (c) => c.toUpperCase()) || "You"
}

/** "3 min ago" style label for the live indicator. */
export function ago(ts: number, now = Date.now()): string {
  if (!ts) return "never"
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

/** The binome sheet's own header labels (Config.gs BF_LABEL), so My binome reads like the sheet members know. */
export const SHEET_LABEL: Record<SheetKey, string> = {
  Code: "Their code",
  Registered: "Registered on",
  "First Name": "First name",
  "Family Name": "Family name",
  Email: "E-mail",
  "Birth Date": "Birth date",
  Phone: "Phone",
  Facebook: "Facebook",
  Discord: "Discord",
  Field: "Field of study",
  Year: "Year of study",
  "Discovered VIC": "How they found VIC",
  "Why VIC": "Why VIC?",
  "Other Clubs": "Other clubs",
  "1st Choice": "1st choice",
  "2nd Choice": "2nd choice",
  "Why this department": "Why this department?",
  "Department Questions": "Department questions",
  Availability: "When they are free",
  "Anything to add": "Anything to add",
  Contacted: "Contacted?",
  "Interview Date": "Interview day",
  "Interview Time": "Time",
  "Interview Done": "Interview done",
  Rating: "Rating /10",
  "Final Affectation": "Final affectation",
  "Interview Form": "Interview form",
  Notes: "Your notes",
}

/** A sheet cell as text: "" for empty, Yes / No for a checkbox. */
export function cellText(v: string | number | boolean | undefined): string {
  if (v === true || v === "TRUE") return "Yes"
  if (v === false || v === "FALSE") return ""
  return v === undefined || v === null ? "" : String(v).trim()
}

/** dd/MM/yyyy (+ HH:mm) as a timestamp, or NaN. */
export function sheetTime(date: unknown, time?: unknown): number {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(date ?? "").trim())
  if (!d) return NaN
  const t = /^(\d{1,2}):(\d{2})/.exec(String(time ?? "").trim())
  return new Date(+d[3], +d[2] - 1, +d[1], t ? +t[1] : 0, t ? +t[2] : 0).getTime()
}
