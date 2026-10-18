import * as React from "react"
import { useVic } from "./store"
import type { Alert, HeldAlert, PendingChange, PendingEntry, PendingRec, Severity, WebState } from "./types"

/**
 * The author's view of the alerts: the snapshot with their pending changes over it (docs/plans.md › Slice 2, issue 61).
 * A view, never written into `state`, so a refresh can't undo it. Per alert:
 *  - pending: their value, with the Pending pill, on the row they clicked (an Open row stays in Open until it ends)
 *  - applied / already met: "In the sheet" for about 2 s, then their value without a pill until the snapshot catches up
 *    (built at or after the write, or already showing it), or the mark expires after 10 min
 *  - dropped: the row turns amber where they clicked it, showing the sheet's value now, until they answer
 */
export type Mark = { kind: "pending" | "flash" | "dropped"; entry: PendingEntry }
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
  const entries = Object.values(rec).filter((e) => e.kind === "alert")
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
export function alertChanges(view: AlertView, ids: string[], op: PendingChange["op"], built?: number, until?: (id: string) => number | undefined): PendingChange[] | null {
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

const SNOOZE_MS: Record<string, number> = { "4h": 4 * 3600e3, "24h": 24 * 3600e3, "3d": 72 * 3600e3 }
/**
 * Resolve, Snooze, Mute or Unmute as pending changes. true = accepted (the rows show it); false = do today's direct write
 * (switch off, a change the pending path can't take, or the accept step failed). Snooze's end is fixed here, at the click.
 */
export async function acceptAlerts(ids: string[], op: PendingChange["op"], snoozeFor?: string): Promise<boolean> {
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
