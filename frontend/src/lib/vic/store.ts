import { create } from "zustand"
import { toast } from "sonner"
import { API_VERSION, type Access, type Alert, type RunOut, type WebState } from "./types"
import { ApiError, call, hooks, rateLimited } from "./api"

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
/** a poll stuck at Google ends after this, so the `polling` guard is released and the next tick runs */
const POLL_TIMEOUT_MS = 20000
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
      a = await call<Access>("webAccess", [], POLL_TIMEOUT_MS)
    } catch (e) {
      if (get().gate.mode === "booting") set({ gate: { mode: "error", message: (e as Error).message }, loading: false })
      return
    }
    if (a.v !== API_VERSION) {
      toast.error("The page and the script are on different versions", {
        description: `Page ${API_VERSION}, script ${a.v}. Reload the page; if this stays, tell the admin.`,
      })
    }
    // members get My binome in task 7; until then the gate ("member", not "!== admin": a script without roles is all admins)
    if (!a.ok || a.role === "member") {
      set({ gate: { mode: "noaccess", access: a }, access: a, loading: false })
      return
    }
    set({ gate: { mode: "ok" }, access: a })
    await get().refresh()
  },

  async refresh(quiet) {
    if (!quiet) set({ refreshing: true })
    try {
      const p = await call<number>("webPulse", [], POLL_TIMEOUT_MS).catch(() => null) // read before the state, so an edit in between still shows as a change
      const s = await call<WebState>("webState")
      // an admin who lost edit access but is in a binome now gets a member slice: the gate, not admin pages on the wrong shape
      if ((s as unknown as { role?: string }).role === "member") {
        const a = await call<Access>("webAccess", [], POLL_TIMEOUT_MS).catch(() => undefined)
        set({ gate: { mode: "noaccess", access: a }, access: a ?? null, state: null, pulse: null, loading: false })
        return
      }
      set((cur) => ({
        state: s,
        pulse: p,
        loading: false,
        loadedAt: Date.now(),
        tick: cur.tick + (quiet && cur.state ? 1 : 0),
      }))
    } catch (e) {
      // a live refresh hitting Google's rate limit is a quiet pause (rateLimited), not an error toast every tick
      const limited = quiet && e instanceof ApiError && e.code === "RATE_LIMIT"
      if (get().gate.mode === "ok" && !limited) toast.error("Could not load the dashboard", { description: (e as Error).message })
      set({ loading: false })
    } finally {
      set({ refreshing: false })
    }
  },

  // Live refresh: poll the version of the dashboard's snapshot (it moves only when the data changed) and reload when it moved.
  async checkPulse() {
    const { busy, refreshing, gate, state, modals, pulse } = get()
    if (busy || refreshing || polling || document.hidden || gate.mode !== "ok" || !state || modals > 0) return
    if (rateLimited()) return // Google is limiting this account: pause quietly instead of adding to it
    polling = true // at a 2 s tick a slow Apps Script call would otherwise stack up
    try {
      // webPulse rechecks access itself, so a revoked account drops to the gate at the next tick (69024a1) in one call
      const p = await call<number>("webPulse", [], POLL_TIMEOUT_MS)
      // the pulse only advances inside a successful refresh, so a failed one is retried on the next tick
      if (p !== pulse && !get().busy) await get().refresh(true)
    } catch (e) {
      // "Not allowed": ask webAccess (it never throws) only for the email and reason the gate shows
      if (e instanceof ApiError && /^(?:Error: )?Not allowed$/.test(e.message)) {
        const a = await call<Access>("webAccess", [], POLL_TIMEOUT_MS).catch(() => undefined)
        if (!a?.ok) set({ gate: { mode: "noaccess", access: a }, access: a ?? null, state: null, pulse: null, loading: false })
      }
      /* anything else stays quiet: the next tick or the refresh button retries */
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
      const send = () => call<RunOut<R>>("webRun", [action, args])
      // A refused action changed nothing (the script lock is taken before any change), so a quick action may quietly try once more.
      const out = await send().catch(async (e) => {
        if (action !== "quick" || !(e instanceof ApiError) || e.code !== "BUSY") throw e
        await new Promise((r) => setTimeout(r, 3000))
        return send()
      })
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
      const busy = e instanceof ApiError && e.code === "BUSY"
      toast.error(busy ? `${name} was not done` : `${name} failed`, {
        description: m,
        duration: 15000,
        action: busy ? { label: "Try again", onClick: () => void get().run(action, args, label) } : undefined,
      })
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
