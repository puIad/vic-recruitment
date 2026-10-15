import type { Binome, TeamMember, WebState } from "./types"

/** Before Lock: who is free, and what a pair looks like. The script's rules (Rules.gs pairTag / makePair), mirrored for the
 *  Pairing panel's preview; the script decides when it writes. */

const lc = (s: string) => s.trim().toLowerCase()

/** Tag of a hand-made pair: "ALL" with a board lead, else "IT & HR", "HR", "IT & COMM". */
export function pairTag(a: string, b: string) {
  if (a === "ALL" || b === "ALL") return "ALL"
  if (a === b) return a
  if (b === "HR") return `${a} & HR`
  if (a === "HR") return `${b} & HR`
  return `${a} & ${b}`
}

const OTHERS = ["IT", "COMM", "FLER"]
/** Why a pair's shape is off ("" when it is fine), in the panel's words. */
export function pairWarning(a: string, b?: string) {
  if (!b) return "No partner yet"
  if (a === "HR" && b === "HR") return "Two HR members: they only receive HR candidates"
  if (OTHERS.includes(a) && OTHERS.includes(b)) return "No HR member: they only receive " + pairTag(a, b).replace(" & ", " and ") + " candidates"
  return ""
}

/** Team members who can still be paired: not excluded (teamList leaves them out), not SKIP, in no binome or draft. */
export function freeMembers(s: WebState): TeamMember[] {
  const taken = new Set(s.binomes.flatMap((b) => b.people.map((p) => lc(p.email))))
  return s.teamList.filter((m) => m.email && m.pairAs !== "SKIP" && !taken.has(lc(m.email)))
}

export type Mix = "mixed" | "both" | "new" | "alone"
export const MIX: Record<Mix, { label: string; tone: "success" | "info" | "warning" }> = {
  mixed: { label: "Experienced + new", tone: "success" },
  both: { label: "Both experienced", tone: "info" },
  new: { label: "Both new", tone: "warning" },
  alone: { label: "No partner", tone: "warning" },
}
export function mixOf(exp: boolean[]): Mix {
  if (exp.length < 2) return "alone"
  const n = exp.filter(Boolean).length
  return n === 2 ? "both" : n === 1 ? "mixed" : "new"
}

/** email -> experienced, from the Team list (overrides: the panel's pending toggles). */
export function experienceOf(team: TeamMember[], overrides: Record<string, boolean> = {}) {
  const map = new Map(team.map((m) => [lc(m.email), !!m.experienced]))
  return (email: string) => overrides[lc(email)] ?? map.get(lc(email)) ?? false
}

/** The drafts' counts for the panel and the Launch card. */
export function draftCounts(s: WebState, isExp = experienceOf(s.teamList)) {
  const drafts: Binome[] = s.binomes.filter((b) => b.status === "DRAFT")
  const free = freeMembers(s)
  const pool = s.teamList.filter((m) => m.pairAs !== "SKIP")
  return {
    drafts: drafts.length,
    byHand: drafts.filter((b) => b.byHand).length,
    without: drafts.filter((b) => !b.people.some((p) => isExp(p.email))).length,
    free: free.length,
    paired: pool.length - free.length,
    pool: pool.length,
    experienced: pool.filter((m) => isExp(m.email)).length,
  }
}
