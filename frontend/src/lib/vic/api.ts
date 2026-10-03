// Every call goes through POST /api/run (Vercel), which runs the Apps Script function as the signed-in visitor.
// The tokens live in an HttpOnly cookie: this module never sees them.

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
} = { onAuthLost: () => {}, onSession: () => {} }

export async function call<T = unknown>(fn: string, ...args: unknown[]): Promise<T> {
  let r: Response
  try {
    r = await fetch("/api/run", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-VIC": "1" },
      body: JSON.stringify({ fn, args }),
    })
  } catch {
    throw new ApiError("Network error: check your connection and try again.", "NETWORK")
  }
  const exp = Number(r.headers.get("X-Session-Expires"))
  if (exp) hooks.onSession(exp)
  const j = (await r.json().catch(() => ({ error: `Unexpected reply from the server (${r.status}).` }))) as {
    value?: T
    error?: string
    code?: string
  }
  if (r.status === 401) {
    hooks.onAuthLost(j.code === "EXPIRED" ? "expired" : "signin", j.error || "Signed out")
    throw new ApiError(j.error || "Signed out", j.code, 401)
  }
  if (j.error) throw new ApiError(j.error, j.code, r.status)
  return j.value as T
}

export async function signOut(next = "/") {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin", headers: { "X-VIC": "1" } })
  } catch {
    /* the cookie expires on its own */
  }
  window.location.href = next
}

export const signInUrl = "/api/login"
