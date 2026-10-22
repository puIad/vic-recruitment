// Pure: no React, so test/overview.test.js runs this file as it ships. format.ts, its one import, must stay that way too.
import { alertLabel, isOut, SEVERITY } from "./format.ts"
import type { Alert, Binome, Severity, WebState } from "./types"

/** One line of the Overview's to-do (issue 144): a kind of thing waiting on a person, and the page that acts on it. */
export interface TodoRow {
  key: string
  label: string
  /** a line under the label, for the rows that aren't an alert type (an alert's own label says enough) */
  hint?: string
  /** null for a switch (a launch blocker): it is on or off, not a number of things */
  count: number | null
  tone: Severity
  /** the page to act on it, already filtered to what this row counted */
  to: string
}

/** Kinds of alert listed before the rest fold into one row, and binomes listed as behind. */
const MAX_ROWS = 6

type TodoState = Pick<WebState, "settings" | "counts" | "locked" | "unpaired">

const worse = (a: Severity, b: Severity) => (SEVERITY[b].rank > SEVERITY[a].rank ? b : a)
const inbox = (types: string[]) => `/alerts?type=${types.map(encodeURIComponent).join(",")}`

/** Everyone registered but duplicates and declined (Config.gs isOut_). */
export const registrants = (byStatus: Record<string, number>) => Object.keys(byStatus).reduce((t, k) => t + (isOut(k) ? 0 : byStatus[k]), 0)

/** What needs a person today, one row per kind, worst first. `alerts` is the author's view (useAlertView). */
export function todoRows(s: TodoState, alerts: Alert[]): TodoRow[] {
  type Counted = TodoRow & { count: number }
  const rows: Counted[] = []

  // held registrants and unpaired members get their own rows, which stand in for their one-per-person alerts
  const held = s.counts.byStatus.HELD || 0
  if (held) {
    const review = alerts.find((a) => a.type === "NEEDS_REVIEW")
    rows.push({ key: "held", label: "Applications on hold", hint: "Screening held them for a person to read first", count: held, tone: "MEDIUM",
      to: inbox(["NEEDS_REVIEW"]) + (review ? `&id=${encodeURIComponent(review.id)}` : "") })
  }
  const unpaired = s.locked ? (s.unpaired || []).length : 0
  if (unpaired) rows.push({ key: "unpaired", label: "Members without a binome", hint: "Left without a binome after lock: place them", count: unpaired, tone: "MEDIUM", to: "/binomes" })

  const byType: Record<string, Counted> = {}
  for (const a of alerts) {
    if ((held && a.type === "NEEDS_REVIEW") || (unpaired && a.type === "UNPAIRED_MEMBER")) continue
    const row = (byType[a.type] ??= { key: a.type, label: alertLabel(a.type), count: 0, tone: a.severity, to: inbox([a.type]) })
    row.count++
    row.tone = worse(row.tone, a.severity)
  }
  rows.push(...Object.values(byType))
  rows.sort((a, b) => SEVERITY[b.tone].rank - SEVERITY[a.tone].rank || b.count - a.count || a.label.localeCompare(b.label))

  // short even with ~90 open alerts: past MAX_ROWS kinds of alert, the rest share one row to the inbox filtered to them
  const shown: TodoRow[] = []
  const folded: Counted[] = []
  let kinds = 0
  for (const r of rows) (byType[r.key] && ++kinds > MAX_ROWS ? folded : shown).push(r)
  if (folded.length)
    shown.push({ key: "more", label: `${folded.length} more kind${folded.length > 1 ? "s" : ""} of alert`, hint: "The inbox, filtered to these",
      count: folded.reduce((t, r) => t + r.count, 0), tone: folded.map((r) => r.tone).reduce(worse), to: inbox(folded.map((r) => r.key)) })

  // launch blockers: a paused pipeline or unshared sheets stop everyone, so they lead; test mode is a reminder, so it trails
  const settings = s.settings
  const lead: TodoRow[] = [], trail: TodoRow[] = []
  if (!settings.assignmentsOpen) lead.push({ key: "paused", label: "Assignments paused", hint: "New registrants wait unassigned until it's back on", count: null, tone: "HIGH", to: "/settings/general" })
  if (!settings.testMode && !settings.shareFiles) lead.push({ key: "sharing", label: "Sheet sharing is off", hint: "Binome members can't open their sheets", count: null, tone: "HIGH", to: "/settings/sharing" })
  if (settings.testMode) trail.push({ key: "test", label: "Test mode is on", hint: "Emails reach the admins only, binome sheets stay unshared", count: null, tone: "INFO", to: "/settings/sharing" })
  return [...lead, ...shown, ...trail]
}

/** Interviewed out of the candidates still in (interviewed / (assigned - withdrew)); 1 when nobody is left to interview. */
export const interviewedShare = (b: Binome) => (b.assigned - b.withdrew > 0 ? b.interviewed / (b.assigned - b.withdrew) : 1)

/** The locked binomes falling behind, most open alerts first, then the lowest interviewed share; caught-up ones are left out. */
export function binomesBehind(binomes: Binome[]): Binome[] {
  return binomes
    .filter((b) => b.status !== "DRAFT" && (b.open > 0 || interviewedShare(b) < 1))
    .sort((a, b) => b.open - a.open || interviewedShare(a) - interviewedShare(b) || a.code.localeCompare(b.code))
    .slice(0, MAX_ROWS)
}
