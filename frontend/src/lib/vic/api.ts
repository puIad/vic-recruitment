// Every call goes through POST /api/run (Vercel), which runs the Apps Script function as the signed-in visitor.
// The tokens live in an HttpOnly cookie: this module never sees them.
import type { PendingRec } from "./types"

export class ApiError extends Error {
  code?: string
  status?: number
  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** The store registers these so the transport can report a lost session without importing the store. */
export const hooks: {
  onAuthLost: (kind: "signin" | "expired", message: string) => void
  onSession: (endsAt: number) => void
  /** waits for a save still being accepted, then says how many of this person's changes are still pending */
  beforeSignOut: () => Promise<number>
} = { onAuthLost: () => {}, onSession: () => {}, beforeSignOut: async () => 0 }

/** Until when Google is rate-limiting this account (ms timestamp): live refresh skips its ticks till then. */
let limitedUntil = 0
export const rateLimited = () => Date.now() < limitedUntil

/** timeoutMs: give up on a call stuck at Google (the polls use it; webState and webRun can be long and keep none). */
export async function call<T = unknown>(fn: string, args: unknown[] = [], timeoutMs?: number): Promise<T> {
  return (await callFull<T>(fn, args, undefined, timeoutMs)).value
}

/** call, plus what /api/run returns next to the value (rec: the author's pending changes) and extra body fields. */
export async function callFull<T = unknown>(fn: string, args: unknown[] = [], extra?: Record<string, unknown>, timeoutMs?: number): Promise<{ value: T; rec?: PendingRec }> {
  let r: Response
  try {
    r = await fetch("/api/run", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-VIC": "1" },
      body: JSON.stringify({ fn, args, ...extra }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    })
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new ApiError("Google took too long to answer.", "TIMEOUT")
    throw new ApiError("Network error: check your connection and try again.", "NETWORK")
  }
  const exp = Number(r.headers.get("X-Session-Expires"))
  if (exp) hooks.onSession(exp)
  const j = (await r.json().catch(() => ({ error: `Unexpected reply from the server (${r.status}).` }))) as {
    value?: T
    rec?: PendingRec
    error?: string
    code?: string
  }
  if (r.status === 401) {
    hooks.onAuthLost(j.code === "EXPIRED" ? "expired" : "signin", j.error || "Signed out")
    throw new ApiError(j.error || "Signed out", j.code, 401)
  }
  if (j.code === "RATE_LIMIT") limitedUntil = Date.now() + 30000
  if (j.error) throw new ApiError(j.error, j.code, r.status)
  return { value: j.value as T, rec: j.rec }
}

const SAVING_KEY = "vic:saving"
/** How many changes were still being saved when this tab signed out (read once: the sign-in screen says so). */
export const savingAtSignOut = (() => {
  try {
    const n = Number(sessionStorage.getItem(SAVING_KEY)) || 0
    sessionStorage.removeItem(SAVING_KEY)
    return n
  } catch {
    return 0
  }
})()

/** Sign out, or Switch account (next = the sign-in). Pending changes keep saving after it (docs/plans.md › Slice 5);
 *  with some left, both land on the sign-in screen, which says how many, before any account picker. */
export async function signOut(next = "/") {
  const saving = await hooks.beforeSignOut()
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: { "X-VIC": "1" } })
  } catch {
    /* the cookie expires on its own */
  }
  if (saving) {
    try {
      sessionStorage.setItem(SAVING_KEY, String(saving))
    } catch {
      /* the screen just doesn't say it */
    }
  }
  window.location.href = saving ? "/" : next
}

export const signInUrl = "/api/login"
