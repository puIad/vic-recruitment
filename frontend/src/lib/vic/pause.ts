import type { Binome, Interviewee } from "./types"

/* The Pause dialog's rules (docs/admin-features.md › Pause and resume a binome). The apply entry judges everything again. */

type B = Pick<Binome, "code" | "status" | "tag">
const DEPTS = ["IT", "COMM", "FLER", "HR"]
/** Departments of a tag, as the script reads it (Matching.gs tagDepts). */
export const depsOf = (tag: string) => (/\bALL\b/i.test(tag) ? DEPTS : DEPTS.filter((d) => new RegExp(`\\b${d}\\b`, "i").test(tag)))
const others = (all: B[], b: B) => all.filter((o) => o.code !== b.code && o.status === "ACTIVE")

/** The departments of b that no other ACTIVE binome takes. */
export function lastFor(all: B[], b: B): string[] {
  return depsOf(b.tag).filter((d) => !others(all, b).some((o) => depsOf(o.tag).includes(d)))
}

/** b's interviewees that may leave: assigned, not contacted, and another ACTIVE binome takes their department. */
export function movable<I extends Pick<Interviewee, "binome" | "status" | "contacted" | "dept">>(ivs: I[], all: B[], b: B): I[] {
  return ivs.filter((i) => i.binome === b.code && i.status === "ASSIGNED" && (!i.contacted || i.contacted === "Not yet") && others(all, b).some((o) => depsOf(o.tag).includes(i.dept ?? "")))
}

/** The resume date typed in the dialog, in Algiers (always UTC+1, no daylight saving), as ms; null when empty or unreadable. */
export function resumeMs(date: string, time: string): number | null {
  const ms = date ? Date.parse(`${date}T${time || "08:00"}:00+01:00`) : NaN
  return Number.isNaN(ms) ? null : ms
}

/** A resume date back in the dialog's two fields. */
export function resumeFields(ms?: number | null): { date: string; time: string } {
  if (!ms) return { date: "", time: "08:00" }
  const iso = new Date(ms + 36e5).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

const LABEL = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Algiers", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
/** "3 Nov 08:00" */
export const resumeLabel = (ms: number) => LABEL.format(ms).replace(",", "")
/** "Paused until 3 Nov 08:00", or "Paused". */
export const pausedLabel = (until?: number | null) => (until ? `Paused until ${resumeLabel(until)}` : "Paused")
