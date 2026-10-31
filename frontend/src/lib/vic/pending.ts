import * as React from "react"
import { useVic } from "./store"
import type { AdminGoldKey, Alert, AlertEntry, BinomeEntry, CellValue, FieldEntry, HeldAlert, MemberState, PendingChange, PendingEntry, PendingRec, SettingEntry, Severity, WebState } from "./types"

/**
 * The author's view of the alerts: the snapshot with their pending changes over it (docs/plans.md › Slice 2, issue 61).
 * A view, never written into `state`, so a refresh can't undo it. Per alert:
 *  - pending: their value, with the Pending pill, on the row they clicked (an Open row stays in Open until it ends)
 *  - applied / already met: "In the sheet" for about 2 s, then their value without a pill until the snapshot catches up
 *    (built at or after the write, or already showing it), or the mark expires after 10 min
 *  - dropped: the row turns amber where they clicked it, showing the sheet's value now, until they answer
 */
export type Mark<E extends PendingEntry = AlertEntry> = { kind: "pending" | "flash" | "dropped"; entry: E }
type Status = "OPEN" | "SNOOZED" | "MUTED" | "CLOSED"
export interface AlertView {
  alerts: Alert[]
  muted: HeldAlert[]
  counts: Record<Severity, number>
  /** alert id → its mark, for the rows that show one */
  marks: Record<string, Mark>
  /** what the author's screen shows for an alert now (the seen value of their next change on it) */
  statusOf: (id: string) => Status
}

const NO_ALERTS: Alert[] = []
const NO_HELD: HeldAlert[] = []
const ZERO: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, INFO: 0 }
const asStatus = (v: string | undefined): Status => (v === "OPEN" || v === "SNOOZED" || v === "MUTED" ? v : "CLOSED")
const p2 = (n: number) => String(n).padStart(2, "0")
const ddmmhhmm = (t: number) => { const d = new Date(t); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}` }

export function alertView(state: WebState | null, rec: PendingRec, flash: Record<string, number>, now = Date.now()): AlertView {
  const alerts = state?.alerts ?? NO_ALERTS, muted = state?.muted ?? NO_HELD
  const snap: Record<string, Status> = {}
  alerts.forEach((a) => (snap[a.id] = "OPEN"))
  muted.forEach((a) => (snap[a.id] = a.status))
  // per alert: the status it shows, the list its row sits in, its mark
  const over: Record<string, { shows: Status; sits: Status; mark?: Mark; until?: number }> = {}
  const statusOf = (id: string): Status => over[id]?.shows ?? snap[id] ?? "CLOSED"
  const entries = Object.values(rec).filter((e): e is AlertEntry => e.kind === "alert")
  if (!entries.length) return { alerts, muted, counts: state?.alertCounts ?? ZERO, marks: {}, statusOf }
  const built = state?.built ?? 0
  entries.forEach((e) => {
    const value = asStatus(e.value), seen = asStatus(e.seen)
    // the list it was clicked in: Unmute from Muted (the hold it had), the others from Open, whatever seen the merge gave it
    const clicked: Status = e.op === "unmute" ? (seen === "OPEN" || seen === "CLOSED" ? "MUTED" : seen) : "OPEN"
    // an ended value gives way once the snapshot holds it (or already shows the author's value)
    const caughtUp = (e.wrote !== undefined && built >= e.wrote) || snap[e.alert] === value || (snap[e.alert] === undefined && value === "CLOSED")
    if (e.state === "pending") over[e.alert] = { shows: value, sits: clicked, mark: { kind: "pending", entry: e }, until: e.until }
    else if (e.state === "applied" || e.state === "met") {
      if ((flash[e.cell] ?? 0) > now) over[e.alert] = { shows: value, sits: clicked, mark: { kind: "flash", entry: e }, until: e.until }
      else if (!caughtUp) over[e.alert] = { shows: value, sits: value, until: e.until }
    } else if (!e.addressed) over[e.alert] = { shows: e.sheet ? asStatus(e.sheet) : snap[e.alert] ?? "CLOSED", sits: clicked, mark: { kind: "dropped", entry: e } } // answered where it was clicked
    else if (e.sheet && !(e.wrote !== undefined && built >= e.wrote)) over[e.alert] = { shows: asStatus(e.sheet), sits: asStatus(e.sheet) }
  })

  // every alert the author can see a row for, whichever list the snapshot has it in
  const byId: Record<string, Alert> = {}, heldById: Record<string, HeldAlert> = {}
  alerts.forEach((a) => (byId[a.id] = a))
  muted.forEach((h) => (heldById[h.id] = h))
  const asAlert = (h: HeldAlert): Alert => ({ id: h.id, created: h.created, severity: h.severity, type: h.type, code: h.code, binome: h.binome, msg: h.msg, fix: [], q: null })
  const sits = (id: string) => over[id]?.sits ?? snap[id]

  const open: Alert[] = alerts.filter((a) => sits(a.id) === "OPEN")
  const back = muted.filter((h) => sits(h.id) === "OPEN").map(asAlert) // an Unmute that ended, or a drop answered where it was clicked
  if (back.length) {
    // in the script's order (buildState_): worst first, then newest; created is "dd/MM HH:mm"
    const RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, INFO: 1 }
    const when = (c: string) => c.replace(/^(\d\d)\/(\d\d) /, "$2$1 ")
    open.push(...back)
    open.sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0) || when(b.created).localeCompare(when(a.created)))
  }
  const held: HeldAlert[] = []
  const heldRow = (id: string, status: "SNOOZED" | "MUTED", until?: number): HeldAlert => {
    const base = heldById[id] ?? byId[id]
    return { id, created: base.created, severity: base.severity, type: base.type, code: base.code, binome: base.binome, msg: base.msg, status,
      until: status === "SNOOZED" ? (until ? ddmmhhmm(until) : heldById[id]?.until ?? "") : "" }
  }
  Object.keys(over).forEach((id) => {
    const s = over[id].sits
    if ((s === "SNOOZED" || s === "MUTED") && !heldById[id] && byId[id]) held.push(heldRow(id, s, over[id].until)) // a Snooze or Mute that ended
  })
  muted.forEach((h) => {
    const s = sits(h.id)
    if (s === "SNOOZED" || s === "MUTED") held.push(s === h.status && !over[h.id]?.until ? h : heldRow(h.id, s, over[h.id]?.until))
  })

  const counts = { ...ZERO }
  open.forEach((a) => (counts[a.severity] = (counts[a.severity] || 0) + 1))
  const marks: Record<string, Mark> = {}
  Object.keys(over).forEach((id) => { const m = over[id].mark; if (m) marks[id] = m })
  return { alerts: open, muted: held, counts, marks, statusOf }
}

/** The merged alerts for the pages (Alerts, the sidebar badge, the header bell, the Overview card). */
export function useAlertView(): AlertView {
  const state = useVic((s) => s.state)
  const rec = useVic((s) => s.rec)
  const flash = useVic((s) => s.flash)
  return React.useMemo(() => alertView(state, rec, flash), [state, rec, flash])
}

/** The changes one click makes, with what the author's screen showed for each alert. */
export function alertChanges(view: AlertView, ids: string[], op: AlertEntry["op"], built?: number, until?: (id: string) => number | undefined): PendingChange[] | null {
  const at = Date.now(), out: PendingChange[] = []
  for (const id of ids) {
    const seen = view.statusOf(id)
    if (seen === "CLOSED") return null // nothing on screen to compare against: the direct write says why
    const u = until?.(id)
    if (op === "snooze" && !(u && u > at)) return null
    out.push({ kind: "alert", alert: id, op, seen, at, until: op === "snooze" ? u : undefined, built })
  }
  return out
}

/**
 * The alerts' Fix of Contacted or the interview date and time (quick setCell) as pending changes: the cells in that binome's
 * sheet, and the alert's Resolve, in one accept step. The Master takes the cells at the next sync. true = accepted; false = do
 * today's direct write. date is yyyy-mm-dd as the form gives it; the sheet holds dd/mm/yyyy.
 */
export async function acceptFix(a: Alert, args: { contacted?: string; date?: string; time?: string }): Promise<boolean> {
  const st = useVic.getState(), q = a.q
  // seen = the sheet's own text ("2h30", an empty time), which the apply entry compares with; a script without it: direct
  if (!st.pendingOn || st.gate.mode !== "ok" || q?.kind !== "iv" || q.dateText === undefined || !/^B\.\d{2,3}$/.test(a.binome)) return false
  const at = Date.now(), dmy = (d?: string) => (d ? d.split("-").reverse().join("/") : "")
  const cells: [AdminGoldKey, string, string][] = args.contacted !== undefined
    ? [["Contacted", args.contacted, q.contacted || ""]]
    : [["Interview Date", dmy(args.date), q.dateText ?? ""], ["Interview Time", args.time ?? "", q.timeText ?? ""]]
  const resolve = alertChanges(alertView(st.state, st.rec, st.flash), [a.id], "resolve", st.state?.built)
  if (!resolve) return false
  const changes: PendingChange[] = cells
    .filter(([, value, seen]) => value !== seen)
    .map(([field, value, seen]) => ({ kind: "bfield", binome: a.binome, code: q.code, field, value, seen, at }))
  return (await st.accept([...changes, ...resolve])) === "ok"
}

const SNOOZE_MS: Record<string, number> = { "4h": 4 * 3600e3, "24h": 24 * 3600e3, "3d": 72 * 3600e3 }
/**
 * Resolve, Snooze, Mute or Unmute as pending changes. true = accepted (the rows show it); false = do today's direct write
 * (switch off, a change the pending path can't take, or the accept step failed). Snooze's end is fixed here, at the click.
 */
export async function acceptAlerts(ids: string[], op: AlertEntry["op"], snoozeFor?: string): Promise<boolean> {
  const st = useVic.getState()
  if (!st.pendingOn || st.gate.mode !== "ok" || !ids.length) return false
  const now = Date.now()
  const until = (id: string) => {
    if (snoozeFor !== "interview") return SNOOZE_MS[snoozeFor ?? ""] ? now + SNOOZE_MS[snoozeFor ?? ""] : undefined
    const q = st.state?.alerts.find((a) => a.id === id)?.q
    return q?.kind === "iv" ? q.atMs : undefined
  }
  const changes = alertChanges(alertView(st.state, st.rec, st.flash), ids, op, st.state?.built, until)
  return !!changes && (await st.accept(changes)) === "ok"
}

/**
 * Apply mine anyway: a drop again as a fresh change, seen = the sheet's value as the notice shows it (issue 50; a drop with a
 * reason never read the sheet: what they saw). null = it can't be any more (no Apply mine anyway, or the snooze is over).
 */
export function again(e: PendingEntry, built: number | undefined, at: number): PendingChange | null {
  if (!e.again) return null
  if (e.kind === "alert") {
    if (e.op === "snooze" && !(e.until && e.until > at)) return null
    const seen = e.sheet === "OPEN" || e.sheet === "SNOOZED" || e.sheet === "MUTED" ? e.sheet : e.seen
    return { kind: "alert", alert: e.alert, op: e.op, seen, at, until: e.until, built }
  }
  if (e.kind === "bmove") return null
  if (e.kind === "binome") return { kind: "binome", binome: e.binome, op: e.op, value: e.value, seen: e.seen, note: e.note, until: e.until, codes: e.codes, at }
  if (e.kind === "setting") return { kind: "setting", key: e.key, value: e.value, seen: e.sheet ?? e.seen, at, built }
  if (e.kind === "team") return { kind: "team", email: e.email, value: e.value, seen: e.sheet === undefined ? e.seen : e.sheet === "true", at }
  if (e.kind === "bfield") return { kind: "bfield", binome: e.binome, code: e.code, field: e.field, value: e.value, seen: e.sheet ?? e.seen, at }
  return { kind: "field", code: e.code, field: e.field, value: e.value, seen: e.sheet ?? e.seen, at }
}

/** An alert's status, and an alert change, in words (the drop notices). */
export const STATUS: Record<string, string> = { OPEN: "Open", SNOOZED: "Snoozed", MUTED: "Muted", RESOLVED: "Resolved", "AUTO-RESOLVED": "Closed by the script" }
export const YOURS: Record<AlertEntry["op"], string> = { resolve: "Resolved", snooze: "Snoozed", mute: "Muted", unmute: "Back with the open alerts" }

/** Why a change was dropped, in words (the consumer's reasons; the script's own come as sentences). */
export const REASON: Record<string, string> = {
  "lost access": "You can no longer edit the Master, so it could not be written as you.",
  "sign-in ended before it was saved": "Your sign-in ended before it reached the sheet.",
  "retries ran out": "Google kept refusing it until your sign-in ran out.",
}

/**
 * email → the Experienced tick the author's screen shows over the snapshot's Team list: theirs while it is pending, and once
 * it ended until a snapshot built at or after the write holds it (the mark expires after 10 min). A drop shows the sheet's
 * value, and the drops dialog asks about it.
 */
export function teamView(state: WebState | null, rec: PendingRec): Record<string, boolean> {
  const out: Record<string, boolean> = {}, built = state?.built ?? 0
  Object.values(rec).forEach((e) => {
    if (e.kind !== "team") return
    if (e.state === "pending" || ((e.state === "applied" || e.state === "met") && !(e.wrote !== undefined && built >= e.wrote))) out[e.email] = e.value
  })
  return out
}
export function useTeamView() {
  const state = useVic((s) => s.state)
  const rec = useVic((s) => s.rec)
  return React.useMemo(() => teamView(state, rec), [state, rec])
}

/**
 * code → what the author's screen shows of a binome over the snapshot: theirs while it is pending, and once it ended until a
 * snapshot built at or after the write holds it. A drop shows the snapshot, and the drops dialog asks about it.
 */
export type BinomeOver = { status: BinomeEntry["value"]; until: number | null; mark?: Mark<PendingEntry> }
export function binomeView(state: WebState | null, rec: PendingRec, flash: Record<string, number>): Record<string, BinomeOver> {
  const out: Record<string, BinomeOver> = {}, built = state?.built ?? 0, now = Date.now()
  Object.values(rec).forEach((e) => {
    if (e.kind !== "binome") return
    if (e.state === "pending") out[e.binome] = { status: e.value, until: e.until, mark: { kind: "pending", entry: e } }
    else if ((e.state === "applied" || e.state === "met") && !(e.wrote !== undefined && built >= e.wrote))
      out[e.binome] = { status: e.value, until: e.until, mark: (flash[e.cell] ?? 0) > now ? { kind: "flash", entry: e } : undefined }
  })
  return out
}
export function useBinomeView() {
  const state = useVic((s) => s.state)
  const rec = useVic((s) => s.rec)
  const flash = useVic((s) => s.flash)
  return React.useMemo(() => binomeView(state, rec, flash), [state, rec, flash])
}

/* ---------- settings and My binome fields (docs/plans.md › Slice 3) ---------- */

const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "")
/** What one cell shows over the snapshot (value undefined = the snapshot's own), and its mark: the same rules as alerts. */
export type CellOver<E extends PendingEntry> = { value?: CellValue; mark?: Mark<E> }
function cellOver<E extends SettingEntry | FieldEntry>(e: E, snap: unknown, caught: boolean, flashing: boolean): CellOver<E> {
  if (e.state === "pending") return { value: e.value, mark: { kind: "pending", entry: e } }
  if (e.state === "applied" || e.state === "met") {
    if (flashing) return { value: e.value, mark: { kind: "flash", entry: e } }
    return caught || same(snap, e.value) ? {} : { value: e.value }
  }
  if (!e.addressed) return { value: e.sheet, mark: { kind: "dropped", entry: e } } // a drop with a reason never read the sheet: the snapshot
  return e.sheet !== undefined && !caught && !same(snap, e.sheet) ? { value: e.sheet } : {}
}

/** key → its row's overlay on the Settings page. Only that row shows it (issue 61): the rest of the dashboard follows the sheet. */
export function settingsView(state: WebState | null, rec: PendingRec, flash: Record<string, number>, now = Date.now()): Record<string, CellOver<SettingEntry>> {
  const out: Record<string, CellOver<SettingEntry>> = {}, built = state?.built ?? 0
  Object.values(rec).forEach((e) => {
    if (e.kind !== "setting") return
    const snap = state?.settingsAll.find((s) => s.key === e.key)?.value
    out[e.key] = cellOver(e, snap, e.wrote !== undefined && built >= e.wrote, (flash[e.cell] ?? 0) > now)
  })
  return out
}
export function useSettingsView() {
  const state = useVic((s) => s.state)
  const rec = useVic((s) => s.rec)
  const flash = useVic((s) => s.flash)
  return React.useMemo(() => settingsView(state, rec, flash), [state, rec, flash])
}

export interface MemberView {
  /** the slice with the member's own values over it */
  member: MemberState | null
  /** cell ("field:IT.12:Rating") → its mark */
  marks: Record<string, Mark<FieldEntry>>
  /** drops on candidates no longer in the slice: shown on the page with what they typed */
  gone: FieldEntry[]
}
/** My binome needs no clock: an ended value gives way to the first slice loaded after the page saw it end (issue 61). */
export function memberView(member: MemberState | null, rec: PendingRec, flash: Record<string, number>, ended: Record<string, number>, loadedAt: number, now = Date.now()): MemberView {
  const fields = Object.values(rec).filter((e): e is FieldEntry => e.kind === "field")
  if (!member || !fields.length) return { member, marks: {}, gone: [] }
  const marks: Record<string, Mark<FieldEntry>> = {}, gone: FieldEntry[] = [], over: Record<string, Record<string, CellValue>> = {}
  fields.forEach((e) => {
    const c = member.candidates.find((x) => String(x.Code) === e.code)
    if (!c) { if (e.state === "dropped" && !e.addressed) gone.push(e); return }
    const o = cellOver(e, c[e.field], (ended[e.id] ?? Infinity) < loadedAt, (flash[e.cell] ?? 0) > now)
    if (o.value !== undefined) (over[e.code] ??= {})[e.field] = o.value
    if (o.mark) marks[e.cell] = o.mark
  })
  const candidates = member.candidates.map((c) => (over[String(c.Code)] ? { ...c, ...over[String(c.Code)] } : c))
  return { member: { ...member, candidates }, marks, gone }
}
export function useMemberView(): MemberView {
  const member = useVic((s) => s.member)
  const rec = useVic((s) => s.rec)
  const flash = useVic((s) => s.flash)
  const ended = useVic((s) => s.ended)
  const loadedAt = useVic((s) => s.loadedAt)
  return React.useMemo(() => memberView(member, rec, flash, ended, loadedAt), [member, rec, flash, ended, loadedAt])
}
