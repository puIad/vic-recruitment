import type { CSSProperties } from "react"
import { CircleCheck, CircleHelp, Clock, Layers, TriangleAlert, type LucideIcon } from "lucide-react"
import { BLOCK_MIN, type IvState } from "./schedule-data"

export * from "./schedule-data"

/** Department colours from the charter palette; the dark-mode ends are the charts' own lifts. */
export const DEPTS: { key: string; label: string; light: string; dark: string }[] = [
  { key: "IT", label: "IT", light: "#127dbb", dark: "#3d9bd4" },
  { key: "COMM", label: "COMM", light: "#7849a8", dark: "#a07fcb" },
  { key: "FLER", label: "FLER", light: "#1a52a2", dark: "#4f84d6" },
  { key: "HR", label: "HR", light: "#69c4af", dark: "#69c4af" },
]
const DEPT_BY_KEY = new Map(DEPTS.map((d) => [d.key, d]))

/** CSS variables for a department's colour: --dep is set for light and dark; use it as var(--dep). */
export function deptVars(dept: string): CSSProperties {
  const d = DEPT_BY_KEY.get(dept.toUpperCase())
  return { "--dep-l": d?.light ?? "var(--muted-foreground)", "--dep-d": d?.dark ?? "var(--muted-foreground)" } as CSSProperties
}

/** Puts the department colour in --dep, light or dark. Pair with deptVars(dept) as the style. */
export const DEP = "[--dep:var(--dep-l)] dark:[--dep:var(--dep-d)]"

export const STATES: { key: IvState; label: string; hint: string; icon: LucideIcon; tone: string }[] = [
  { key: "booked", label: "Booked", hint: "Date set, interview to come", icon: Clock, tone: "text-info" },
  { key: "late", label: "Late", hint: "Time passed, no interview form yet", icon: TriangleAlert, tone: "text-warning" },
  { key: "done", label: "Done", hint: "Interview form in", icon: CircleCheck, tone: "text-success" },
  { key: "unreadable", label: "Unreadable", hint: "The sheet's date can't be read", icon: CircleHelp, tone: "text-danger" },
]
export const STATE_BY_KEY = Object.fromEntries(STATES.map((s) => [s.key, s])) as Record<IvState, (typeof STATES)[number]>
export const CLASH = { label: "Clash", hint: `Less than ${BLOCK_MIN} min from another interview of the same binome`, icon: Layers, tone: "text-warning" }
