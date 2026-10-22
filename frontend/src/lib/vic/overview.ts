import { alertLabel, SEVERITY } from "./format.ts"
import type { Alert, Binome, Severity, WebState } from "./types"

/** One line of the Overview's to-do (issue 144): a kind of thing waiting on a person, and the page that acts on it. */
export interface TodoRow {
  key: string
  label: string
  /** null for a switch (a launch blocker): it is on or off, not a number of things */
  count: number | null
  tone: Severity
  /** the page to act on it, already filtered to what this row counted */
  to: string
}

const MAX_KINDS = 6

type TodoState = Pick<WebState, "settings" | "counts" | "locked" | "unpaired">

/** What needs a person today, one row per kind, worst first. `alerts` is the author's view (useAlertView). */
export function todoRows(s: TodoState, alerts: Alert[]): TodoRow[] {
  type Counted = TodoRow & { count: number }
  const byType: Record<string, Counted> = {}
  for (const a of alerts) {
    // one per held registrant or unpaired member: their own rows below count them
    if (a.type === "NEEDS_REVIEW" || a.type === "UNPAIRED_MEMBER") continue
    const row = (byType[a.type] ??= { key: a.type, label: alertLabel(a.type), count: 0, tone: a.severity, to: `/alerts?type=${encodeURIComponent(a.type)}` })
    row.count++
    if (SEVERITY[a.severity].rank > SEVERITY[row.tone].rank) row.tone = a.severity
  }
  const rows = Object.values(byType)

  const held = s.counts.byStatus.HELD || 0
  if (held) {
    const review = alerts.find((a) => a.type === "NEEDS_REVIEW")
    rows.push({ key: "held", label: "Applications on hold", count: held, tone: "MEDIUM", to: "/alerts?type=NEEDS_REVIEW" + (review ? `&id=${encodeURIComponent(review.id)}` : "") })
  }

  const unpaired = s.locked ? (s.unpaired || []).length : 0
  if (unpaired) rows.push({ key: "unpaired", label: "Members without a binome", count: unpaired, tone: "MEDIUM", to: "/binomes" })

  rows.sort((a, b) => SEVERITY[b.tone].rank - SEVERITY[a.tone].rank || b.count - a.count || a.label.localeCompare(b.label))

  // short even with ~90 open alerts: past MAX_KINDS kinds of alert, the rest share one row to the whole inbox
  const shown: TodoRow[] = []
  let kinds = 0
  let more: Counted | null = null
  for (const r of rows) {
    if (!byType[r.key] || ++kinds <= MAX_KINDS) shown.push(r)
    else {
      more ??= { key: "more", label: "", count: 0, tone: r.tone, to: "/alerts" }
      more.count += r.count
      if (SEVERITY[r.tone].rank > SEVERITY[more.tone].rank) more.tone = r.tone
    }
  }
  if (more) shown.push({ ...more, label: `${kinds - MAX_KINDS} more kind${kinds - MAX_KINDS > 1 ? "s" : ""} of alert` })

  // launch blockers: a paused pipeline or unshared sheets stop everyone, so they lead; test mode is a reminder, so it trails
  const set = s.settings
  const lead: TodoRow[] = [], trail: TodoRow[] = []
  if (!set.assignmentsOpen) lead.push({ key: "paused", label: "Assignments paused", count: null, tone: "HIGH", to: "/settings/general" })
  if (!set.testMode && !set.shareFiles) lead.push({ key: "sharing", label: "Sheet sharing is off", count: null, tone: "HIGH", to: "/settings/sharing" })
  if (set.testMode) trail.push({ key: "test", label: "Test mode is on", count: null, tone: "INFO", to: "/settings/sharing" })
  return [...lead, ...shown, ...trail]
}

/** Interviewed out of the candidates still in (interviewed / (assigned - withdrew)); 1 when nobody is left to interview. */
export const interviewedShare = (b: Binome) => (b.assigned - b.withdrew > 0 ? b.interviewed / (b.assigned - b.withdrew) : 1)

/** The locked binomes falling behind, most open alerts first, then the lowest interviewed share; caught-up ones are left out. */
export function binomesBehind(binomes: Binome[], max = 6): Binome[] {
  return binomes
    .filter((b) => b.status !== "DRAFT" && (b.open > 0 || interviewedShare(b) < 1))
    .sort((a, b) => b.open - a.open || interviewedShare(a) - interviewedShare(b) || a.code.localeCompare(b.code))
    .slice(0, max)
}
