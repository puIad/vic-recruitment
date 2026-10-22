// Every count the Analytics page shows, from webAnalytics rows. Pure: the page memoises one Model per load.
import { isOut } from "@/lib/vic/format"
import {
  ageOn,
  birthUsed,
  DEPTS,
  flagList,
  HEARD_OPTIONS,
  isEnpEmail,
  median,
  overallYear,
  parseHeard,
  partsIn,
  rowKey,
  topWords,
  wordCount,
} from "@/lib/vic/analytics"
import type { AnalyticsRow } from "@/lib/vic/types"
import { REG_2025_DAILY } from "./baseline-2025"

export interface Row extends AnalyticsRow {
  key: string
  /** out of the recruitment (duplicate, declined): left out of every stat but data quality */
  out: boolean
  name: string
  overall: number | null
  age: number | null
  /** the birth date the stats use, and whether its year is the guess */
  birthUsed: { date: string; guessed: boolean } | null
  heard: { options: string[]; other: string }
  referral: boolean
  regDay: number | null
  regHour: number | null
}

const count = <T,>(xs: T[], f: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>()
  for (const x of xs) {
    const k = f(x)
    if (k) m.set(k, (m.get(k) || 0) + 1)
  }
  return m
}

/** Team names that can be told apart in a free-text answer: first and last names of 3+ letters. */
function nameMatcher(team: string[]) {
  const words = new Set<string>()
  for (const n of team) for (const w of n.toLowerCase().split(/\s+/)) if (w.length >= 3) words.add(w)
  return (text: string) => {
    const t = text.toLowerCase()
    if (/\b(member|membre)s?\b/.test(t)) return true
    return t.split(/[^\p{L}]+/u).some((w) => words.has(w))
  }
}

export function buildModel(raw: AnalyticsRow[], tz: string, team: string[], now = Date.now()) {
  const named = nameMatcher(team)
  const rows: Row[] = raw.map((r, i) => {
    const bu = birthUsed(r)
    const heard = parseHeard(r.discovered)
    const p = r.registered ? partsIn(r.registered, tz) : null
    return {
      ...r,
      key: rowKey(r, i),
      out: isOut(r.status),
      name: `${r.first} ${r.family}`.trim(),
      overall: overallYear(r),
      age: bu && r.registered ? ageOn(bu.date, r.registered, tz) : null,
      birthUsed: bu,
      heard,
      referral: !!heard.other && named(heard.other),
      regDay: p ? p.day : null,
      regHour: p ? p.h : null,
    }
  })
  const live = rows.filter((r) => !r.out)

  /* registrations over time, lined up by day N of the opening (day 1 = the first registration's day) */
  const days = live.map((r) => r.regDay).filter((d): d is number => d !== null)
  const first = days.length ? Math.min(...days) : null
  const today = partsIn(now, tz).day
  const last = first === null ? null : Math.max(today, ...days)
  const perDay = new Map<number, number>()
  for (const d of days) perDay.set(d, (perDay.get(d) || 0) + 1)
  const daily: { n: number; day: number; count: number; cum: number; y2025: number | null }[] = []
  if (first !== null && last !== null) {
    let cum = 0
    // past the last day there is nothing to draw; keep at most 60 days so a stray old timestamp can't flatten the chart
    for (let d = Math.max(first, last - 59); d <= last; d++) {
      cum += perDay.get(d) || 0
      daily.push({ n: d - first + 1, day: d, count: perDay.get(d) || 0, cum, y2025: null })
    }
    if (daily.length && daily[0].day > first) {
      const before = days.filter((d) => d < daily[0].day).length
      daily.forEach((x) => (x.cum += before))
    }
  }
  const cum2025: number[] = []
  if (REG_2025_DAILY) REG_2025_DAILY.reduce((t, c, i) => ((cum2025[i] = t + c), t + c), 0)
  const race = Array.from({ length: Math.max(daily.length ? daily[daily.length - 1].n : 0, cum2025.length) }, (_, i) => {
    const d = daily.find((x) => x.n === i + 1)
    return { n: i + 1, y2026: d ? d.cum : null, y2025: cum2025[i] ?? null }
  })
  const byHour = Array.from({ length: 24 }, (_, h) => ({ h, count: live.filter((r) => r.regHour === h).length }))

  /* who applied */
  const byOverall = [1, 2, 3, 4, 5].map((y) => ({ y, count: live.filter((r) => r.overall === y).length }))
  const prepa = live.filter((r) => r.field.toUpperCase() === "PREPA" && r.overall).length
  const special = live.filter((r) => r.field && r.field.toUpperCase() !== "PREPA" && r.overall).length
  const byField = [...count(live, (r) => r.field.toUpperCase() || "—")].sort((a, b) => b[1] - a[1])

  const ages = live.map((r) => r.age).filter((a): a is number => a !== null && a >= 14 && a <= 40)
  const ageMin = ages.length ? Math.min(...ages) : 17, ageMax = ages.length ? Math.max(...ages) : 23
  const byAge = Array.from({ length: ageMax - ageMin + 1 }, (_, i) => ({ age: ageMin + i, count: ages.filter((a) => a === ageMin + i).length }))
  const guessedAges = live.filter((r) => r.birthUsed?.guessed).length
  const byMonth = Array.from({ length: 12 }, (_, m) => ({ m, count: live.filter((r) => r.birthUsed && +r.birthUsed.date.slice(5, 7) === m + 1).length }))

  /* birthdays during the recruitment: from the opening day to the last interview set, at least four weeks */
  const interviews = live.map((r) => r.interviewAt).filter((x): x is number => !!x)
  const winFrom = first ?? today
  const winTo = Math.max(winFrom + 27, interviews.length ? partsIn(Math.max(...interviews), tz).day : 0)
  const birthdays = live
    .filter((r) => r.birthUsed)
    .map((r) => {
      const [, m, d] = r.birthUsed!.date.split("-").map(Number)
      // this year's birthday, or next year's when the window crosses the new year
      const y0 = new Date(winFrom * 864e5).getUTCFullYear()
      const at = [y0, y0 + 1].map((y) => Math.round(Date.UTC(y, m - 1, d) / 864e5)).find((x) => x >= winFrom && x <= winTo)
      return at === undefined ? null : { row: r, day: at, turns: r.age !== null ? new Date(at * 864e5).getUTCFullYear() - +r.birthUsed!.date.slice(0, 4) : null }
    })
    .filter((x): x is { row: Row; day: number; turns: number | null } => !!x)
    .sort((a, b) => a.day - b.day)

  const heardCount = HEARD_OPTIONS.map((o) => ({ option: o as string, count: live.filter((r) => r.heard.options.includes(o)).length }))
  const others = live.filter((r) => r.heard.other)
  const heardAnswered = live.filter((r) => r.heard.options.length || r.heard.other).length

  /* motivation */
  const whys = live.filter((r) => r.whyVic.trim())
  const lengths = whys.map((r) => wordCount(r.whyVic))
  const LEN = [
    { label: "1–9", lo: 1, hi: 9 },
    { label: "10–24", lo: 10, hi: 24 },
    { label: "25–49", lo: 25, hi: 49 },
    { label: "50–99", lo: 50, hi: 99 },
    { label: "100+", lo: 100, hi: Infinity },
  ]
  const byLength = LEN.map((b) => ({ label: b.label, count: lengths.filter((n) => n >= b.lo && n <= b.hi).length }))
  const words = topWords(whys.map((r) => r.whyVic))

  /* department demand */
  const valid = (d: string) => (DEPTS as readonly string[]).includes(d)
  const demand = DEPTS.map((d) => ({ dept: d, first: live.filter((r) => r.c1 === d).length, second: live.filter((r) => r.c2 === d).length }))
  const pairs = DEPTS.map((a) => DEPTS.map((b) => live.filter((r) => r.c1 === a && r.c2 === b).length))
  const sameChoice = live.filter((r) => r.c1 && r.c1 === r.c2).length
  const noSecond = live.filter((r) => valid(r.c1) && !r.c2).length
  const fieldDept = byField.map(([f]) => ({ field: f, cells: DEPTS.map((d) => live.filter((r) => (r.field.toUpperCase() || "—") === f && r.c1 === d).length) }))

  /* funnel and speed, from the assignment */
  const assigned = live.filter((r) => r.assignedAt || r.binome)
  const funnel = [
    { key: "registered", label: "Registered", count: live.length },
    { key: "assigned", label: "Assigned to a binome", count: assigned.length },
    { key: "contacted", label: "Contacted", count: live.filter((r) => r.contactedAt).length },
    { key: "interview", label: "Interview date set", count: live.filter((r) => r.interviewAt).length },
    { key: "form", label: "Interview form in", count: live.filter((r) => r.submittedAt).length },
  ]
  const lag = (rs: Row[], f: (r: Row) => number | null) =>
    median(rs.filter((r) => r.assignedAt && f(r)).map((r) => (f(r)! - r.assignedAt!) / 36e5).filter((h) => h >= 0))
  const speedOf = (rs: Row[]) => ({
    n: rs.length,
    contact: lag(rs, (r) => r.contactedAt),
    interview: lag(rs, (r) => r.interviewAt),
    form: lag(rs, (r) => r.submittedAt),
  })
  const speed = speedOf(assigned)
  const perBinome = [...new Set(assigned.map((r) => r.binome).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((b) => ({ binome: b, ...speedOf(assigned.filter((r) => r.binome === b)) }))

  /* data quality: every row, duplicates included */
  const flags = [...count(rows.flatMap((r) => flagList(r.flags).map((f) => ({ f }))), (x) => x.f)].sort((a, b) => b[1] - a[1])
  const duplicates = rows.filter((r) => r.status === "DUPLICATE")
  const typed = rows.filter((r) => (r.typedEmail || r.email).trim())
  const enp = typed.filter((r) => isEnpEmail(r.typedEmail || r.email)).length
  const toCheck = rows.filter((r) => r.birth?.suspect)

  return {
    rows,
    live,
    tz,
    first,
    today,
    daily,
    race,
    has2025: cum2025.length > 0,
    byHour,
    byOverall,
    prepa,
    special,
    byField,
    byAge,
    ages,
    guessedAges,
    byMonth,
    birthdays,
    window: { from: winFrom, to: winTo },
    heardCount,
    heardAnswered,
    others,
    referrals: others.filter((r) => r.referral).length,
    whys,
    byLength,
    medianWords: median(lengths),
    words,
    demand,
    pairs,
    sameChoice,
    noSecond,
    fieldDept,
    funnel,
    speed,
    perBinome,
    flags,
    duplicates,
    emails: { total: typed.length, enp, personal: typed.length - enp },
    toCheck,
  }
}

export type Model = ReturnType<typeof buildModel>
