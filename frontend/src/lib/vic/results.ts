// The results view (docs/admin-features.md › The results view): webRun p1View is read when the page opens, never on the poll, and the
// author's pending Phase 1 Result changes sit over it until a view loaded after they ended holds them.
import * as React from "react"
import { create } from "zustand"
import { toast } from "sonner"

import { call } from "./api"
import { useVic } from "./store"
import type { P1Preview, P1Row, P1View, PendingEntry, PendingRec, ResultEntry, RunOut } from "./types"

/** The five results, in the order of keys 1 to 5. */
export const RESULT_VALUES = ["IT", "COMM", "FLER", "HR", "Not accepted"] as const
export const DEPT_RESULTS = ["IT", "COMM", "FLER", "HR"] as const

interface ResultsStore {
  view: P1View | null
  preview: P1Preview | null
  /** first click on the group link by code (ms); null = vic-enp could not say, or nothing to read yet */
  clicks: Record<string, number> | null
  loading: boolean
  error: string | null
  /** when the last load began (an ended pending change is held by a load that began after it ended) */
  startedAt: number
  /** a load was asked for while one ran: go again when it ends */
  again: boolean
  load: () => Promise<void>
}

export const useResults = create<ResultsStore>((set, get) => ({
  view: null,
  preview: null,
  clicks: null,
  loading: false,
  error: null,
  startedAt: 0,
  again: false,
  load: async () => {
    if (get().loading) { set({ again: true }); return }
    const at = Date.now()
    set({ loading: true, error: null })
    try {
      const [v, p] = await Promise.all([call<RunOut<P1View>>("webRun", ["p1View", {}]), call<RunOut<P1Preview>>("webRun", ["p1Final", { op: "preview" }])])
      set({ view: v.result, preview: p.result, loading: false, startedAt: at })
      // who opened their group link: from vic-enp, once result mails have gone; if it is down the page says so
      if (v.result.mails) {
        call<RunOut<{ ok: boolean; clicks?: Record<string, number> }>>("webRun", ["resultClicks", {}])
          .then((c) => set({ clicks: c.result.ok ? c.result.clicks ?? {} : null }), () => set({ clicks: null }))
      } else set({ clicks: null })
    } catch (e) {
      set({ loading: false, error: (e as Error).message || "Could not load the results." })
    }
    if (get().again) { set({ again: false }); void get().load() }
  },
}))

/** A row as the author's screen shows it. pending: their change is still being saved; dropped: the sheet kept its value. */
export type ResultRow = P1Row & { pending: boolean; dropped?: ResultEntry; over: boolean }

const isResult = (e: PendingEntry): e is ResultEntry => e.kind === "result"

/** The view's rows with the author's result changes over them, and the counts those rows make. */
export function overlay(view: P1View | null, rec: PendingRec, startedAt: number, ended: Record<string, number>): { rows: ResultRow[]; counts: Record<string, number>; needs: number; saving: number; undealt: number } {
  const mine = new Map<string, ResultEntry>()
  Object.values(rec).filter(isResult).forEach((e) => mine.set(e.code, e))
  const counts: Record<string, number> = Object.fromEntries(RESULT_VALUES.map((v) => [v, 0]))
  let needs = 0, saving = 0, undealt = 0
  const rows = (view?.rows ?? []).map((r): ResultRow => {
    const e = mine.get(r.code)
    let override = r.override, note = r.note, pending = false, dropped: ResultEntry | undefined, over = false
    if (e && !view?.final) {
      if (e.state === "pending") { override = e.value; note = e.note ?? ""; pending = true; over = true }
      else if (e.state === "applied" || e.state === "met") { if ((ended[e.id] ?? 0) >= startedAt) { override = e.value; note = e.note ?? ""; over = true } }
      else if (e.state === "dropped" && !e.addressed) dropped = e
    }
    const result = override || (view?.final ? "" : r.proposal)
    if (pending) saving++
    if (dropped) undealt++
    if (result) counts[result] = (counts[result] ?? 0) + 1
    else needs++
    const choices = [r.c1, r.c2]
    return { ...r, override, result, needs: !result, warn: (DEPT_RESULTS as readonly string[]).includes(result) && !choices.includes(result), pending, dropped, over,
      // a change of mine not loaded yet has no proposal history to show
      changed: over ? false : r.changed, note }
  })
  return { rows, counts, needs, saving, undealt }
}

export function useResultRows() {
  const view = useResults((s) => s.view)
  const startedAt = useResults((s) => s.startedAt)
  const rec = useVic((s) => s.rec)
  const ended = useVic((s) => s.ended)
  return React.useMemo(() => ({ ...overlay(view, rec, startedAt, ended), view }), [view, rec, startedAt, ended])
}

/** When a change of mine ends, load the sheet again so the page holds it. */
export function useReloadOnEnd() {
  const rec = useVic((s) => s.rec)
  const load = useResults((s) => s.load)
  const seen = React.useRef(new Set<string>())
  React.useEffect(() => {
    let again = false
    Object.values(rec).filter(isResult).forEach((e) => {
      if (e.state === "pending" || seen.current.has(e.id)) return
      seen.current.add(e.id)
      again = true
    })
    if (again) void load()
  }, [rec, load])
  // a load that began before a change ended can't hold it: go again once it returns
  const loading = useResults((s) => s.loading), startedAt = useResults((s) => s.startedAt), ended = useVic((s) => s.ended)
  React.useEffect(() => {
    if (!loading && Object.values(rec).some((e) => e.kind === "result" && e.state !== "pending" && (ended[e.id] ?? 0) >= startedAt)) void load()
  }, [loading, startedAt, ended, rec, load])
}

/**
 * Set one candidate's result: a pending change when the switch is on, else the direct write. Choosing the binome's own proposal on
 * an override clears it (follow the binome); choosing what already shows does nothing. value "" clears. Resolves true when it went (or needed nothing), false when a typed note was kept back.
 */
export async function setResult(row: ResultRow, value: string, note = ""): Promise<boolean> {
  const to = value === row.proposal ? "" : value
  if (to === row.override) {
    // nothing would change, so a typed note would be dropped: say so and keep it
    if (note) { toast.warning("Pick a different result to keep this note"); return false }
    return true
  }
  const st = useVic.getState()
  const seen = row.override
  if (st.pendingOn && st.gate.mode === "ok") {
    const ok = await st.accept([{ kind: "result", code: row.code, value: to, seen, note: note || undefined, at: Date.now() }])
    if (ok === "ok") return true
  }
  const out = await st.run<{ end: string; sheet?: string }>("p1Set", { code: row.code, value: to, seen, note: note || undefined }, "Set a result")
  if (!out) return false
  if (out.result.end === "dropped") toast.warning(`${row.code} was changed meanwhile`, { description: `The sheet now holds ${out.result.sheet || "no override"}.` })
  await useResults.getState().load()
  return true
}
