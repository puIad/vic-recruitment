import type { BinomeStatus, Severity, Status } from "./types"

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

export const STATUS_COLOR: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.color]))

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
