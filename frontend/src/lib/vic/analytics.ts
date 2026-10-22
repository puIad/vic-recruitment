// Analytics (docs/plans.md › Analytics, Launch scope 2026-10-22): webAnalytics is read once per session, when Analytics or a
// profile first opens, never on the poll. The browser does every count (about 300 rows), so filters cost no new call.
import { create } from "zustand"
import { call } from "./api"
import type { AnalyticsRow, AnalyticsState } from "./types"

interface AnalyticsStore {
  data: AnalyticsState | null
  loading: boolean
  error: string | null
  loadedAt: number
  /** first call loads; later calls do nothing unless force (the page's Reload) */
  load: (force?: boolean) => Promise<void>
}

export const useAnalytics = create<AnalyticsStore>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  loadedAt: 0,
  load: async (force) => {
    const s = get()
    if (s.loading || (s.data && !force)) return
    set({ loading: true, error: null })
    try {
      const data = await call<AnalyticsState>("webAnalytics")
      set({ data: { ...data, rows: data.rows ?? [] }, loading: false, loadedAt: Date.now() })
    } catch (e) {
      set({ loading: false, error: (e as Error).message || "Could not load the registrations." })
    }
  },
}))

/** A row's key: its code, or its place in the list for a duplicate (which never gets a code). */
export const rowKey = (r: AnalyticsRow, i: number) => r.code || `#${i}`

/** The applicant profile sheet (components/applicant-profile.tsx): opened by row key from Analytics, an Interviewees row and Ctrl K. */
export const useProfile = create<{ key: string | null; open: boolean; show: (key: string) => void; close: () => void }>((set) => ({
  key: null,
  open: false,
  show: (key) => set({ key, open: true }),
  close: () => set({ open: false }),
}))

/* ------------------------------------------------------------------ time in the Master's zone */

const fmts = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = fmts.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    } catch {
      f = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    }
    fmts.set(tz, f)
  }
  return f
}

export interface Parts {
  y: number
  mo: number
  d: number
  h: number
  mi: number
  /** days since 1970-01-01 of that calendar date: a day index that ignores the time */
  day: number
}

export function partsIn(ms: number, tz: string): Parts {
  const p: Record<string, string> = {}
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value
  const y = +p.year, mo = +p.month, d = +p.day
  return { y, mo, d, h: +p.hour % 24, mi: +p.minute, day: Math.round(Date.UTC(y, mo - 1, d) / 864e5) }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const MONTH_NAMES = MONTHS
const pad = (n: number) => String(n).padStart(2, "0")

/** "24 Oct, 14:05" in the Master's zone ("24 Oct 2025, 14:05" outside the current year). */
export function when(ms: number | null | undefined, tz: string, withTime = true): string {
  if (!ms) return ""
  const p = partsIn(ms, tz)
  const year = p.y !== partsIn(Date.now(), tz).y ? ` ${p.y}` : ""
  return `${p.d} ${MONTHS[p.mo - 1]}${year}${withTime ? `, ${pad(p.h)}:${pad(p.mi)}` : ""}`
}

/** A day index as "24 Oct". */
export const dayLabel = (day: number) => {
  const d = new Date(day * 864e5)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "3 h", "2 d 4 h" */
export function hours(h: number | null): string {
  if (h === null || !isFinite(h)) return "—"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  const d = Math.floor(h / 24)
  return `${d} d ${Math.round(h - d * 24)} h`
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/* ------------------------------------------------------------------ fields of the form */

export const DEPTS = ["IT", "HR", "COMM", "FLER"] as const
export type Dept = (typeof DEPTS)[number]

/** Department marks in charts: the hues member names already wear (index.css --dep-*: IT red, COMM blue, HR green, FLER
 *  yellow). Light uses those tokens as they are; dark steps them down from the text tints into the band marks need on the dark
 *  card. Both sets pass the dataviz validator in the order IT, HR, COMM, FLER (CVD ≥ 6 with the department named beside every
 *  mark). Set on a wrapper with DEPT_VARS, read with deptColor. */
export const DEPT_VARS =
  "[--mark-IT:var(--dep-it)] [--mark-HR:var(--dep-hr)] [--mark-COMM:var(--dep-comm)] [--mark-FLER:var(--dep-fler)] dark:[--mark-IT:#d4302e] dark:[--mark-HR:#35ae5c] dark:[--mark-COMM:#3280dd] dark:[--mark-FLER:#8f700f]"
export const deptColor = (d: string) => ((DEPTS as readonly string[]).includes(d) ? `var(--mark-${d})` : "var(--muted-foreground)")

/** The 2025 field codes, for display. The code always shows next to it, so a wrong guess here never hides the data. */
export const FIELD_LABEL: Record<string, string> = {
  PREPA: "Preparatory years",
  DATA: "Data science",
  AUTO: "Automation",
  "GM-AUTO": "Mechanical eng., automotive",
  MTRX: "Mechatronics",
  ELT: "Electrical eng.",
  "ELT-HV": "Electrical eng., high voltage",
  ELN: "Electronics",
  MECA: "Mechanical eng.",
  MINIER: "Mining eng.",
  "GP-ENV": "Environmental eng.",
  GCHIM: "Chemical eng.",
  HYDRAU: "Hydraulics",
  GC: "Civil eng.",
  QHSE: "Quality, health, safety, environment",
  INDUS: "Industrial eng.",
}
export const fieldLabel = (f: string) => FIELD_LABEL[f.toUpperCase()] || f || "Not given"

const YEAR_N: Record<string, number> = { "1ST": 1, "2ND": 2, "3RD": 3 }
/** Year of study as typed (1ST…) → n, or null. */
export const yearN = (y: string) => YEAR_N[String(y || "").trim().toUpperCase()] ?? null
/** Overall year at ENP: the count starts again after the preparatory years, so PREPA n = n and any other field n + 2. */
export function overallYear(r: Pick<AnalyticsRow, "field" | "year">): number | null {
  const n = yearN(r.year)
  if (!n || !r.field) return null
  return r.field.trim().toUpperCase() === "PREPA" ? n : n + 2
}
/** "Prépa 2nd", or "1st, year 3" in a specialty (its overall year beside it). */
export const yearLabel = (r: Pick<AnalyticsRow, "field" | "year">) => {
  const n = yearN(r.year)
  if (!n) return r.year || "—"
  const ord = ["1st", "2nd", "3rd"][n - 1]
  if (r.field.toUpperCase() === "PREPA") return `Prépa ${ord}`
  return r.field ? `${ord}, year ${n + 2}` : ord
}

/** yyyy-MM-dd as "5 Jun 2004"; anything else as typed. */
export const longDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "")
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : s
}

/** The birth date the stats use: the guessed year for a suspect date, else the date as typed. null = unreadable or missing. */
export function birthUsed(r: AnalyticsRow): { date: string; guessed: boolean } | null {
  const b = r.birth
  if (!b) return null
  if (b.suspect) return b.guess ? { date: b.guess, guessed: true } : null
  return /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? { date: b.date, guessed: false } : null
}

/** Age in whole years on a day (the registration day, by default). */
export function ageOn(birth: string, onMs: number, tz: string): number {
  const [y, m, d] = birth.split("-").map(Number), p = partsIn(onMs, tz)
  return p.y - y - (p.mo < m || (p.mo === m && p.d < d) ? 1 : 0)
}

/** "How did you discover VIC?": the form's checkbox options, and whatever else was typed in Other. */
export const HEARD_OPTIONS = ["Friends", "Social Media", "Stand", "Open Day"] as const
export function parseHeard(s: string): { options: string[]; other: string } {
  const options: string[] = [], other: string[] = []
  for (const raw of String(s || "").split(",")) {
    const t = raw.trim()
    if (!t) continue
    const known = HEARD_OPTIONS.find((o) => o.toLowerCase() === t.toLowerCase())
    if (known) options.push(known)
    else other.push(t.replace(/^other\s*:\s*/i, ""))
  }
  return { options, other: other.join(", ").trim() }
}

/** Flags on an Interviewees row: the alert types, without the CONFIRMED stamp. */
export const flagList = (s: string) =>
  String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^[A-Z_]+$/.test(x))

export const isEnpEmail = (e: string) => /@g\.enp\.edu\.dz$/i.test(e.trim())

/* ------------------------------------------------------------------ words */

const STOP = new Set(
  (
    // English
    "a about above after again all also am an and any are as at be because been before being both but by can could did do does doing " +
    "down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most " +
    "my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their them then " +
    "there these they this those through to too under until up very was we were what when where which while who whom why will with would you " +
    "your yours want wanted like really much many get got make also well think things thing way lot vic club family part join being able " +
    // French
    "au aux avec ce ces cet cette dans de des du elle en et eux il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous " +
    "on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y été être avoir ai as avons " +
    "est sont suis était fait faire plus très aussi comme tout tous toute toutes bien car donc si sans entre ça cela ceci veux veut voudrais " +
    "parce faire partie rejoindre club famille"
  ).split(" ")
)

/** Most frequent words of a set of answers (stop words, short words and numbers out), counted once per answer. */
export function topWords(texts: string[], n = 24): { word: string; count: number }[] {
  const c = new Map<string, number>()
  for (const t of texts) {
    const seen = new Set(
      t
        .toLowerCase()
        .normalize("NFC")
        .split(/[^\p{L}'’-]+/u)
        .map((w) => w.replace(/^['’-]+|['’-]+$/g, "").replace(/^(l|d|j|qu|c|m|n|s|t)['’]/, ""))
        .filter((w) => w.length > 2 && !STOP.has(w))
    )
    for (const w of seen) c.set(w, (c.get(w) || 0) + 1)
  }
  return [...c.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, n)
}

export const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
