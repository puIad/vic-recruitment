import { create } from "zustand"
import { toast } from "sonner"
import { API_VERSION, type Access, type Alert, type GoldKey, type MemberSetOut, type MemberState, type PendingChange, type PendingRec, type RunOut, type WebState } from "./types"
import { ApiError, call, callFull, hooks, rateLimited } from "./api"
import { startNotice } from "./notice"

export type Gate =
  | { mode: "booting" }
  | { mode: "ok" }
  /** a binome member: My binome only, read-only, polled every 15 s */
  | { mode: "member" }
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
  /** a member's slice of the snapshot (gate "member"; state stays null for them), or an admin's own binome next to state */
  member: MemberState | null
  /** why a member's binome could not load (e.g. their sheet isn't shared yet): the page shows it instead of a toast */
  memberError: string | null
  /** true while the first load has not finished: pages show skeletons */
  loading: boolean
  refreshing: boolean
  busy: boolean
  busyAction: string | null
  /** the running action as the page names it ("Sync", "Lock binomes"): the hint on grayed-out buttons says it */
  busyLabel: string | null
  /** number of confirm dialogs open: live refresh pauses while one is */
  modals: number
  pulse: number | null
  /** an admin in a binome: their binome's version (webPulse bv), so a partner's edit refreshes My binome */
  bv: number | null
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
  /** A member sets some of their binome's columns for one candidate, in one call. Never optimistic: the slice changes only
   *  with the values the script wrote. seen = what the screen showed when the edit started; the partner changed it meanwhile
   *  → conflict, with the value now. One result per field, in the order given. */
  memberSet: (code: string, fields: { field: GoldKey; value: unknown; seen: unknown }[]) => Promise<MemberSetResult[]>
  /** Put a value the script reported into the member's slice (a save, or "Keep theirs" after a conflict). */
  patchMember: (code: string, field: GoldKey, value: string | number | boolean) => void
  setModals: (delta: number) => void
  /** the owner's switch (docs/plans.md › Slice 2): admin saves become pending changes */
  pendingOn: boolean
  /** the author's pending changes, as /api/run last returned them (a view over state, never written into it) */
  rec: PendingRec
  /** cell → until when its pill shows "In the sheet" (about 2 s after it applied) */
  flash: Record<string, number>
  /** entry id → when this page first saw it end (applied, met or dropped): My binome's overlay gives way to a slice loaded after it */
  ended: Record<string, number>
  /** accept steps in flight: the close warning holds until they return */
  accepting: number
  /** The accept step. "ok" = safe as pending changes; "direct" = do today's direct write instead (switch off, or it failed). */
  accept: (changes: PendingChange[]) => Promise<"ok" | "direct">
  /** Answers on drops: shown (on screen), keep (Keep the sheet's value). */
  markDrops: (a: { shown?: string[]; seen?: string[]; keep?: string[] }) => Promise<void>
  setRec: (rec: PendingRec) => void
  /** cells of the drops this visit found waiting (the first record it read): the must-answer dialog (slice 4) */
  awayDrops: string[]
}

export type MemberSetResult = { ok: true; value: string | number | boolean } | { conflict: string } | { error: string; busy?: boolean }

let polling = false
let polls = 0
/** the next pulse reads the record (the tab came back into view) */
let wantRec = true
const hasPending = (rec: PendingRec) => Object.values(rec).some((e) => e.state === "pending")
const openDrops = (rec: PendingRec) => Object.values(rec).filter((e) => e.state === "dropped" && !e.addressed).map((e) => e.cell)
/** the first record this visit reads opens the dialog for the drops waiting in it */
let firstRec = true
/** the last seen mark: while drops are on screen it is refreshed once a minute, so the admins get no alert */
let seenMark = 0
const SEEN_MS = 60e3
type Pulse = number | { v: number; pending: boolean; bv?: number }
/** The pulse's answer: a number from an older script, {v, pending, bv?} from one that has the switch. */
const pulseOf = (p: Pulse | null) => (p === null || typeof p === "number" ? { v: p, on: null, bv: null } : { v: p.v, on: p.pending, bv: p.bv ?? null })
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
  member: null,
  memberError: null,
  loading: true,
  refreshing: false,
  busy: false,
  busyAction: null,
  busyLabel: null,
  modals: 0,
  pulse: null,
  bv: null,
  loadedAt: 0,
  tick: 0,
  sessionEnds: 0,
  activity: [],
  pendingOn: false,
  rec: {},
  flash: {},
  ended: {},
  accepting: 0,
  awayDrops: [],

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
    if (!a.ok) {
      set({ gate: { mode: "noaccess", access: a }, access: a, loading: false })
      return
    }
    // "member", not "!== admin": a script without roles answers role "" for its admins
    set({ gate: { mode: a.role === "member" ? "member" : "ok" }, access: a })
    await get().refresh()
  },

  async refresh(quiet) {
    if (!quiet) set({ refreshing: true })
    try {
      // read before the state, so an edit in between still shows as a change; with the author's record when the switch is on
      const pr = await callFull<Pulse>("webPulse", [true], { rec: hasPending(get().rec) ? 2 : 1 }, POLL_TIMEOUT_MS).catch(() => null)
      const pp = pulseOf(pr ? pr.value : null)
      if (pr?.rec) get().setRec(pr.rec)
      const p = pp.v
      const s = await call<WebState | MemberState>("webState")
      // The shape decides the mode: an admin who lost edit access but is in a binome now gets a member slice (My binome, not
      // admin pages on the wrong shape), and a member made an editor gets the admin state. Either way the role changed: re-read access.
      const member = "role" in s && s.role === "member"
      if (member !== (get().gate.mode === "member")) {
        const a = await call<Access>("webAccess", [], POLL_TIMEOUT_MS).catch(() => null)
        set({ access: a ?? get().access })
      }
      set((cur) => ({
        gate: { mode: member ? "member" : "ok" },
        state: member ? null : (s as WebState),
        member: member ? (s as MemberState) : (s as WebState).member ?? null,
        memberError: null,
        pulse: p,
        bv: pp.bv,
        pendingOn: pp.on ?? !!s.pending,
        loading: false,
        loadedAt: Date.now(),
        tick: cur.tick + (quiet && (cur.state || cur.member) ? 1 : 0),
      }))
    } catch (e) {
      // a live refresh hitting Google's rate limit is a quiet pause (rateLimited), not an error toast every tick
      const limited = quiet && e instanceof ApiError && e.code === "RATE_LIMIT"
      const { gate, member } = get()
      // a member with nothing on screen yet sees why on the page ("Your binome sheet isn't shared with you yet.")
      if (gate.mode === "member" && !member) set({ memberError: limited ? get().memberError : (e as Error).message })
      else if ((gate.mode === "ok" || gate.mode === "member") && !limited) toast.error("Could not load the dashboard", { description: (e as Error).message })
      set({ loading: false })
    } finally {
      set({ refreshing: false })
    }
  },

  // Live refresh: poll the version of the dashboard's snapshot (it moves only when the data changed) and reload when it moved.
  async checkPulse() {
    const { busy, refreshing, gate, state, member, memberError, modals, pulse, bv } = get()
    // the seen mark only touches Redis, so it skips the guards below that spare Google: a 5-min Lock or an open dialog is still on screen
    const drops = openDrops(get().rec)
    if (drops.length && !document.hidden && Date.now() - seenMark >= SEEN_MS) { seenMark = Date.now(); void get().markDrops({ seen: drops }) }
    // a member whose sheet couldn't load keeps polling, so the page fills itself once the sync has published their binome
    const shown = gate.mode === "ok" ? !!state : gate.mode === "member" && !!(member || memberError)
    if (busy || refreshing || polling || document.hidden || !shown || modals > 0) return
    if (rateLimited()) return // Google is limiting this account: pause quietly instead of adding to it
    polling = true // at a 2 s tick a slow Apps Script call would otherwise stack up
    try {
      // webPulse rechecks access itself, so a revoked account drops to the gate at the next tick (69024a1) in one call
      // the record rides on the pulse while the author has changes pending (admins every 5th 2 s poll, members every 15 s one), and on tab return
      const held = hasPending(get().rec)
      const rec = wantRec ? (held ? 2 : 1) : held && (gate.mode === "member" || ++polls % 5 === 0) ? 2 : 0
      wantRec = false
      const r = await callFull<Pulse>("webPulse", [true], rec ? { rec } : undefined, POLL_TIMEOUT_MS)
      const p = pulseOf(r.value)
      if (r.rec) get().setRec(r.rec)
      if (p.on !== null && p.on !== get().pendingOn) set({ pendingOn: p.on })
      // the pulse only advances inside a successful refresh, so a failed one is retried on the next tick
      if ((p.v !== pulse || p.bv !== bv) && !get().busy) await get().refresh(true)
    } catch (e) {
      // "Not allowed": ask webAccess (it never throws) only for the email and reason the gate shows
      if (e instanceof ApiError && /^(?:Error: )?Not allowed$/.test(e.message)) {
        const a = await call<Access>("webAccess", [], POLL_TIMEOUT_MS).catch(() => undefined)
        if (!a?.ok) set({ gate: { mode: "noaccess", access: a }, access: a ?? null, state: null, member: null, memberError: null, pulse: null, bv: null, loading: false })
      }
      /* anything else stays quiet: the next tick or the refresh button retries */
    } finally {
      polling = false
    }
  },

  async run<R>(action: string, args: Record<string, unknown> = {}, label?: string) {
    const name = label || action
    set({ busy: true, busyAction: action, busyLabel: name })
    const finish = startNotice(name)
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
      const head = finish("success", (out.messages || []).join("\n"))
      log(`${name} · ${head || "done"}`)
      return out
    } catch (e) {
      const m = e instanceof ApiError || e instanceof Error ? e.message : String(e)
      const busy = e instanceof ApiError && e.code === "BUSY"
      finish("error", m, {
        head: busy ? `${name} was not done` : `${name} failed`,
        action: busy ? { label: "Try again", onClick: () => void get().run(action, args, label) } : undefined,
      })
      log(`${name} failed: ${m}`, true)
      return null
    } finally {
      set({ busy: false, busyAction: null, busyLabel: null })
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

  async memberSet(code, fields) {
    try {
      const out = await call<RunOut<MemberSetOut>>("webRun", ["memberSet", { code, fields }])
      return out.result.fields.map((r): MemberSetResult => {
        if ("value" in r) {
          get().patchMember(code, r.field, r.value)
          return { ok: true, value: r.value }
        }
        return "conflict" in r ? { conflict: r.conflict } : { error: r.error }
      })
    } catch (e) {
      // the whole call was refused (busy sheet, no access, candidate gone): every field says why
      const err = { error: (e as Error).message, busy: e instanceof ApiError && e.code === "BUSY" }
      return fields.map(() => err)
    }
  },

  patchMember(code, field, value) {
    set((cur) =>
      cur.member
        ? { member: { ...cur.member, candidates: cur.member.candidates.map((c) => (String(c.Code) === code ? { ...c, [field]: value } : c)) } }
        : cur
    )
  },

  setModals: (delta) => set((cur) => ({ modals: Math.max(0, cur.modals + delta) })),

  async accept(changes) {
    if (!get().pendingOn || !changes.length) return "direct"
    set((cur) => ({ accepting: cur.accepting + 1 }))
    try {
      const r = await callFull<PendingRec>("accept", [{ v: 1, changes }])
      get().setRec(r.value)
      return "ok"
    } catch (e) {
      if (e instanceof ApiError && e.code === "FORMAT")
        toast.warning("This page is out of date", { description: "Your change is saved the usual way. Reload the page to get the new version.", duration: 12000 })
      return "direct"
    } finally {
      set((cur) => ({ accepting: cur.accepting - 1 }))
    }
  },

  async markDrops(a) {
    try {
      const r = await callFull<PendingRec>("pendingMark", [a])
      get().setRec(r.value)
    } catch {
      /* shown is retried with the next drop; Keep the sheet's value can be clicked again */
    }
  },

  // A new record: changes that ended since the last one flash "In the sheet"; new drops get one toast per click and are marked shown.
  setRec(next) {
    const prev = get().rec, now = Date.now(), flash = { ...get().flash }, drops: Record<number, number> = {}, ended: Record<string, number> = {}
    const shown: string[] = []
    Object.values(next).forEach((e) => {
      const was = prev[e.cell]
      if (was?.id === e.id && was.state === "pending" && (e.state === "applied" || e.state === "met")) flash[e.cell] = now + 2000
      if (e.state !== "pending") ended[e.id] = get().ended[e.id] ?? now
      if (e.state === "dropped" && !e.addressed && !e.shown) {
        shown.push(e.cell)
        if (!(was?.id === e.id && was.state === "dropped")) drops[e.at] = (drops[e.at] || 0) + 1
      }
    })
    // a visit that finds drops from while away asks about them all at once (the dialog), instead of a toast per click
    const away = firstRec ? openDrops(next) : []
    firstRec = false
    set({ rec: next, flash, ended, ...(away.length ? { awayDrops: away } : {}) })
    if (away.length) seenMark = now // marked shown just below
    else Object.values(drops).forEach((n) =>
      toast.warning(n > 1 ? `${n} of your changes were not applied` : "Your change was not applied", {
        description: "The row shows why, and what the sheet holds now.",
        duration: 10000,
      })
    )
    if (shown.length) void get().markDrops({ shown })
    const next2 = Math.min(...Object.values(flash).filter((t) => t > now))
    if (Number.isFinite(next2)) setTimeout(() => set((cur) => ({ flash: Object.fromEntries(Object.entries(cur.flash).filter(([, t]) => t > Date.now())) })), next2 - now + 20)
  },
}))

hooks.onSession = (endsAt) => useVic.setState({ sessionEnds: endsAt })
// Sign out and Switch account wait only for a save still being accepted (about 1 s), like the close warning
hooks.beforeSignOut = async () => {
  for (let i = 0; i < 100 && useVic.getState().accepting > 0; i++) await new Promise((r) => setTimeout(r, 100))
  return Object.values(useVic.getState().rec).filter((e) => e.state === "pending").length
}
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wantRec = true })
  // the browser's own "leave site?" only while a save is still being accepted (about 1 s); once safe it applies with the tab closed
  window.addEventListener("beforeunload", (e) => {
    if (useVic.getState().accepting > 0) e.preventDefault()
  })
}
hooks.onAuthLost = (kind, message) => {
  if (["ok", "member", "booting"].includes(useVic.getState().gate.mode))
    useVic.setState({ gate: { mode: kind, message }, loading: false })
}
