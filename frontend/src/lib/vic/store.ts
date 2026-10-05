import { create } from "zustand"
import { toast } from "sonner"
import { API_VERSION, type Access, type Alert, type RunOut, type WebState } from "./types"
import { ApiError, call, hooks } from "./api"

export type Gate =
  | { mode: "booting" }
  | { mode: "ok" }
  | { mode: "signin" | "expired" | "noaccess" | "error"; access?: Access; message?: string }

export interface ActivityItem {
  id: number
  time: string
  text: string
  error: boolean
}

interface VicStore {
  gate: Gate
  access: Access | null
  state: WebState | null
  /** true while the first load has not finished: pages show skeletons */
  loading: boolean
  refreshing: boolean
  busy: boolean
  busyAction: string | null
  /** number of confirm dialogs open: live refresh pauses while one is */
  modals: number
  pulse: number | null
  /** ms timestamp of the last successful state load (drives the "live" indicator) */
  loadedAt: number
  /** bumps each time the numbers actually changed: the header ring turns once */
  tick: number
  sessionEnds: number
  activity: ActivityItem[]
  boot: () => Promise<void>
  refresh: (quiet?: boolean) => Promise<void>
  checkPulse: () => Promise<void>
  run: <R = unknown>(action: string, args?: Record<string, unknown>, label?: string) => Promise<RunOut<R> | null>
  dropAlerts: (ids: string[]) => void
  setModals: (delta: number) => void
}

let polling = false
let activityId = 0
const hhmm = () => {
  const t = new Date()
  return String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0")
}

export const useVic = create<VicStore>((set, get) => ({
  gate: { mode: "booting" },
  access: null,
  state: null,
  loading: true,
  refreshing: false,
  busy: false,
  busyAction: null,
  modals: 0,
  pulse: null,
  loadedAt: 0,
  tick: 0,
  sessionEnds: 0,
  activity: [],

  async boot() {
    let a: Access
    try {
      a = await call<Access>("webAccess")
    } catch (e) {
      if (get().gate.mode === "booting") set({ gate: { mode: "error", message: (e as Error).message }, loading: false })
      return
    }
    if (a.v !== API_VERSION) {
      toast.error("The page and the script are on different versions", {
        description: `Page ${API_VERSION}, script ${a.v}. Reload the page; if this stays, tell the admin.`,
      })
    }
    if (!a.ok) {
      set({ gate: { mode: "noaccess", access: a }, access: a, loading: false })
      return
    }
    set({ gate: { mode: "ok" }, access: a })
    await get().refresh()
  },

  async refresh(quiet) {
    if (!quiet) set({ refreshing: true })
    try {
      const p = await call<number>("webPulse").catch(() => null) // read before the state, so an edit in between still shows as a change
      const s = await call<WebState>("webState")
      set((cur) => ({
        state: s,
        pulse: p,
        loading: false,
        loadedAt: Date.now(),
        tick: cur.tick + (quiet && cur.state ? 1 : 0),
      }))
    } catch (e) {
      if (get().gate.mode === "ok") toast.error("Could not load the dashboard", { description: (e as Error).message })
      set({ loading: false })
    } finally {
      set({ refreshing: false })
    }
  },

  // Live refresh: poll the Master's last-edit time (one cheap Drive call) and reload only when it moved.
  async checkPulse() {
    const { busy, refreshing, gate, state, modals, pulse } = get()
    if (busy || refreshing || polling || document.hidden || gate.mode !== "ok" || !state || modals > 0) return
    polling = true // at a 2 s tick a slow Apps Script call would otherwise stack up
    try {
      // access is rechecked every tick so a revoked account drops to the gate at once instead of keeping the last data on screen
      const a = await call<Access>("webAccess")
      if (!a.ok) {
        set({ gate: { mode: "noaccess", access: a }, access: a, state: null, pulse: null, loading: false })
        return
      }
      const p = await call<number>("webPulse")
      // the pulse only advances inside a successful refresh, so a failed one is retried on the next tick
      if (p !== pulse && !get().busy) await get().refresh(true)
    } catch {
      /* stay quiet: the next tick or the refresh button retries */
    } finally {
      polling = false
    }
  },

  async run<R>(action: string, args: Record<string, unknown> = {}, label?: string) {
    const name = label || action
    set({ busy: true, busyAction: action })
    const log = (text: string, error = false) =>
      set((cur) => ({ activity: [{ id: ++activityId, time: hhmm(), text, error }, ...cur.activity].slice(0, 40) }))
    try {
      const out = await call<RunOut<R>>("webRun", action, args)
      const msg = (out.messages || []).join("\n\n")
      if (msg) {
        const [head, ...rest] = msg.split("\n").filter((l) => l.trim())
        toast.success(head, rest.length ? { description: rest.join("\n"), duration: 12000 } : undefined)
        log(`${name} · ${head}`)
      } else {
        log(`${name} · done`)
      }
      return out
    } catch (e) {
      const m = e instanceof ApiError || e instanceof Error ? e.message : String(e)
      toast.error(`${name} failed`, { description: m, duration: 15000 })
      log(`${name} failed: ${m}`, true)
      return null
    } finally {
      set({ busy: false, busyAction: null })
    }
  },

  // Alerts leave the screen the moment the script confirms; the refresh that follows just re-syncs.
  dropAlerts(ids) {
    const gone = new Set(ids)
    set((cur) => {
      if (!cur.state) return cur
      const counts = { ...cur.state.alertCounts }
      cur.state.alerts.forEach((a: Alert) => {
        if (gone.has(a.id) && counts[a.severity]) counts[a.severity]--
      })
      return { state: { ...cur.state, alerts: cur.state.alerts.filter((a) => !gone.has(a.id)), alertCounts: counts } }
    })
  },

  setModals: (delta) => set((cur) => ({ modals: Math.max(0, cur.modals + delta) })),
}))

hooks.onSession = (endsAt) => useVic.setState({ sessionEnds: endsAt })
hooks.onAuthLost = (kind, message) => {
  if (useVic.getState().gate.mode === "ok" || useVic.getState().gate.mode === "booting")
    useVic.setState({ gate: { mode: kind, message }, loading: false })
}
