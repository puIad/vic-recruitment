// The Schedule's pure logic: no React, no icons, no path aliases, so test/schedule.test.js loads it as it ships.
import { cellText, fullName, sheetTime } from "../../lib/vic/format.ts"
import type { MemberState, WebState } from "../../lib/vic/types.ts"

/** Every interview is drawn as one block this long. A display constant, not a setting (docs/plans.md › Schedule). */
export const BLOCK_MIN = 45
/** The Master's zone when an older script sends no settings.tz. */
export const DEFAULT_TZ = "Africa/Algiers"

/** "Africa/Algiers" → "Algiers time" */
export const zoneLabel = (tz: string) => `${(tz.split("/").pop() || tz).replace(/_/g, " ")} time`

export type IvState = "booked" | "done" | "late" | "unreadable"
export const STATE_KEYS: IvState[] = ["booked", "late", "done", "unreadable"]
export const DEPT_KEYS = ["IT", "COMM", "FLER", "HR"]

/** One interviewee as the Schedule draws it. start is wall-clock time in the Master's zone, held in a local Date (so date-fns
 *  can lay it out without a time-zone library); null = no date yet, or one the sync can't read. */
export interface ScheduleItem {
  code: string
  name: string
  binome: string
  /** 1st choice */
  dept: string
  start: Date | null
  state: IvState
  /** another interview of the same binome starts less than BLOCK_MIN minutes away */
  clash: boolean
  contacted: string
  avail: string
  /** ms; null = unknown */
  assignedAt: number | null
  /** what the No date yet list says instead of a time (a member's sheet can hold a day without a time) */
  note?: string
}

/** "IT.04 · First Last" */
export const itemTitle = (item: ScheduleItem) => (item.name ? `${item.code} · ${item.name}` : item.code)

const fmtCache = new Map<string, Intl.DateTimeFormat | null>()
function zoneFormat(tz: string) {
  if (!fmtCache.has(tz)) {
    try {
      fmtCache.set(tz, new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }))
    } catch {
      fmtCache.set(tz, null) // an unknown zone: fall back to the browser's
    }
  }
  return fmtCache.get(tz)
}

/** ms as wall-clock time in tz, held in a local Date. */
export function wallTime(ms: number, tz: string): Date {
  const f = zoneFormat(tz)
  if (!f) return new Date(ms)
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(ms)) if (x.type !== "literal") p[x.type] = +x.value
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute)
}

/** Out of the schedule: never had a binome, or out of the recruitment. */
const OFF = new Set(["UNASSIGNED", "WITHDRAWN", "DUPLICATE", "HELD", "DECLINED"])

/** Marks every interview that starts less than BLOCK_MIN minutes from another of its binome. */
export function markClashes(items: ScheduleItem[]): ScheduleItem[] {
  const byBinome = new Map<string, ScheduleItem[]>()
  for (const it of items) if (it.start) byBinome.set(it.binome, [...(byBinome.get(it.binome) ?? []), it])
  const clashing = new Set<ScheduleItem>()
  for (const list of byBinome.values()) {
    list.sort((a, b) => a.start!.getTime() - b.start!.getTime())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j].start!.getTime() - list[i].start!.getTime() < BLOCK_MIN * 6e4; j++) {
        clashing.add(list[i])
        clashing.add(list[j])
      }
  }
  return items.map((it) => (clashing.has(it) ? { ...it, clash: true } : it))
}

/** The admin Schedule: every interviewee with a binome, from webState. A field an older script doesn't send reads as empty. */
export function fromWebState(s: WebState): ScheduleItem[] {
  const tz = s.settings.tz || DEFAULT_TZ
  const alerts = new Map<string, Set<string>>()
  for (const a of s.alerts ?? []) if (a.code) alerts.set(a.code, (alerts.get(a.code) ?? new Set()).add(a.type))
  const items = (s.interviewees ?? [])
    .filter((iv) => iv.binome && !OFF.has(iv.status))
    .map((iv): ScheduleItem => {
      const at = typeof iv.at === "number" ? wallTime(iv.at, tz) : null
      // shortcut: the Master stores a day typed without a time as 23:59 (Rules.gs buildInterviewAt), so 23:59 reads as "no
      // time yet"; send the time cell in webState if a real 23:59 slot ever matters
      const start = at && hhmm(at) !== "23:59" ? at : null
      const types = alerts.get(iv.code)
      const state: IvState =
        iv.status === "INTERVIEWED" ? "done" : !start && types?.has("BAD_DATE") ? "unreadable" : types?.has("OVERDUE") ? "late" : "booked"
      return {
        code: iv.code,
        name: iv.name ?? "",
        binome: iv.binome,
        dept: iv.dept || iv.code.split(".")[0] || "",
        start,
        state,
        clash: false,
        contacted: iv.contacted ?? "",
        avail: iv.avail ?? "",
        assignedAt: iv.assignedAt ?? null,
        note: at && !start ? `${pad2(at.getDate())}/${pad2(at.getMonth() + 1)}/${at.getFullYear()}, no time yet` : undefined,
      }
    })
  return markClashes(items)
}

/** My binome: the member's own candidates, from the Interview Date and Time their sheet holds (already the Master's zone). */
export function fromMember(m: MemberState): ScheduleItem[] {
  const alerts = new Map<string, Set<string>>()
  for (const a of m.alerts ?? []) if (a.code) alerts.set(a.code, (alerts.get(a.code) ?? new Set()).add(a.type))
  const items = m.candidates
    .filter((c) => c.Status !== "WITHDRAWN" && cellText(c.Contacted) !== "Withdrew")
    .map((c): ScheduleItem => {
      const code = cellText(c.Code)
      const date = cellText(c["Interview Date"])
      const time = cellText(c["Interview Time"])
      const day = !Number.isNaN(sheetTime(date))
      const ok = day && !!time && !Number.isNaN(sheetTime(date, time))
      const types = alerts.get(code)
      const done = c.Status === "INTERVIEWED" || cellText(c["Interview Done"]) === "Yes"
      const unreadable = !ok && ((!!date && !day) || (day && !!time) || !!types?.has("BAD_DATE"))
      return {
        code,
        name: fullName(c),
        binome: m.binome,
        dept: cellText(c["1st Choice"]) || code.split(".")[0] || "",
        start: ok ? new Date(sheetTime(date, time)) : null,
        state: done ? "done" : unreadable ? "unreadable" : types?.has("OVERDUE") ? "late" : "booked",
        clash: false,
        contacted: cellText(c.Contacted),
        avail: cellText(c.Availability),
        assignedAt: null,
        note: day && !time ? `${date}, no time yet` : undefined,
      }
    })
  return markClashes(items)
}

/** Waiting for a date, oldest assignment first: what the NO_DATE alert will catch, before it fires. Interviewed ones are done. */
export function noDateYet(items: ScheduleItem[]): ScheduleItem[] {
  return items
    .filter((it) => !it.start && it.state !== "done")
    .sort((a, b) => (a.assignedAt ?? Infinity) - (b.assignedAt ?? Infinity) || a.code.localeCompare(b.code, undefined, { numeric: true }))
}

export const pad2 = (n: number) => String(n).padStart(2, "0")
export const hhmm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
export const endOf = (d: Date) => new Date(d.getTime() + BLOCK_MIN * 6e4)

/** How long since ms, short: "4 d", "5 h", "20 min". */
export function waited(ms: number, now: number): string {
  const min = Math.max(0, Math.round((now - ms) / 6e4))
  if (min >= 1440) return `${Math.floor(min / 1440)} d`
  if (min >= 60) return `${Math.floor(min / 60)} h`
  return `${min} min`
}

/** The sidebar's filters: departments and states shown, and one binome ("" = all). */
export interface Filters {
  depts: Set<string>
  states: Set<IvState>
  binome: string
}
export const allFilters = (): Filters => ({ depts: new Set([...DEPT_KEYS, ""]), states: new Set(STATE_KEYS), binome: "" })

/** "" stands for a department outside the four (an older script, or a typo in the sheet). */
export const deptKey = (dept: string) => (DEPT_KEYS.includes(dept.toUpperCase()) ? dept.toUpperCase() : "")

export function applyFilters(items: ScheduleItem[], f: Filters): ScheduleItem[] {
  return items.filter((it) => f.depts.has(deptKey(it.dept)) && f.states.has(it.state) && (!f.binome || it.binome === f.binome))
}
