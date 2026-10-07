import * as React from "react"
import { BellOff, Eye, Lock, PencilLine, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { MemberName } from "@/components/member-name"
import { call } from "@/lib/vic/api"
import { Spinner } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import type { AccessLevel, Binome, BinomeAccessOut, RunOut } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const LEVELS: { key: AccessLevel; label: string; icon: React.ElementType; what: string }[] = [
  { key: "none", label: "No access", icon: Lock, what: "They can't open their sheet or the dashboard." },
  { key: "view", label: "View", icon: Eye, what: "They open their sheet and see My binome, read-only." },
  { key: "edit", label: "Edit", icon: PencilLine, what: "They fill in their sheet, there or from My binome." },
]
const NOW_LABEL: Record<string, string> = { none: "No access", view: "Can view", edit: "Can edit", owner: "Owner" }
const NOW_TONE: Record<string, string> = {
  none: "bg-secondary text-muted-foreground",
  view: "bg-info-soft text-info",
  edit: "bg-success-soft text-success",
  owner: "bg-accent text-accent-foreground",
}

/** Short label for the level an admin opened a binome at (Binomes table). */
export const ACCESS_BADGE: Record<string, { label: string; tone: string } | undefined> = {
  view: { label: "Open · view", tone: NOW_TONE.view },
  edit: { label: "Open · edit", tone: NOW_TONE.edit },
}

/**
 * Who in a binome can open its sheet, and with it the dashboard (the script lets a member in only while Drive lets them open
 * their sheet). Reads the members' access live from Drive on open; Apply gives both members that level, without Drive's email.
 */
export function AccessDialog({ binome, onClose }: { binome: Binome | null; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const refresh = useVic((s) => s.refresh)
  const busy = useVic((s) => s.busy)
  const [live, setLive] = React.useState<BinomeAccessOut | null>(null)
  const [error, setError] = React.useState("")
  const [pick, setPick] = React.useState<AccessLevel | null>(null)
  const [nonce, setNonce] = React.useState(0)
  const code = binome?.code

  React.useEffect(() => {
    if (!code) return
    let gone = false
    setLive(null)
    setError("")
    call<RunOut<BinomeAccessOut>>("webRun", ["binomeAccess", { binome: code }])
      .then((out) => {
        if (gone) return
        setLive(out.result)
        // start from what both members have now when they agree, else from nothing chosen
        const nows = new Set(out.result.members.map((m) => (m.now === "owner" ? "edit" : m.now)))
        setPick(nows.size === 1 ? ([...nows][0] as AccessLevel) : null)
      })
      .catch((e: Error) => !gone && setError(e.message))
    return () => {
      gone = true
    }
  }, [code, nonce])

  const same = !!live && live.members.every((m) => (m.now === "owner" ? "edit" : m.now) === pick)
  const nameOf = (email: string) => binome?.people.find((p) => p.email.toLowerCase() === email)?.name || ""

  async function apply() {
    if (!code || !pick) return
    const out = await run<BinomeAccessOut>("binomeAccess", { binome: code, level: pick }, `Access ${code}`)
    if (out) {
      setLive(out.result)
      refresh(true)
      if (!out.result.errors.length) onClose()
    }
  }

  return (
    <Dialog open={!!binome} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Open {code} to its members</DialogTitle>
          <DialogDescription>
            Their binome sheet and their dashboard go together: a member gets My binome only while they can open their sheet.
          </DialogDescription>
        </DialogHeader>

        <section aria-label="Who can open the sheet now" className="space-y-2">
          <h3 className="text-sm font-bold">Right now, in Drive</h3>
          {error ? (
            <div role="alert" className="flex items-center gap-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">{error}</span>
              <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                <RotateCcw /> Retry
              </Button>
            </div>
          ) : !live ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {live.members.map((m) => (
                <li key={m.email} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{nameOf(m.email) ? <MemberName name={nameOf(m.email)} /> : m.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", NOW_TONE[m.now])}>{NOW_LABEL[m.now] ?? m.now}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <fieldset className="space-y-2" disabled={!live || busy}>
          <legend className="mb-2 text-sm font-bold">Give both members</legend>
          <div role="radiogroup" aria-label="Access level" className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => {
              const on = pick === l.key
              return (
                <button
                  key={l.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPick(l.key)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-50",
                    on ? "border-primary bg-accent ring-2 ring-ring/40" : "hover:bg-accent/50"
                  )}
                >
                  <span className="flex items-center gap-2 font-bold">
                    <l.icon className={cn("size-4", on ? "text-primary" : "text-muted-foreground")} /> {l.label}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">{l.what}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <p className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <BellOff className="mt-px size-3.5 shrink-0" />
          <span>
            No email is sent, even with test mode on. Re-share binome sheets (Maintenance) still emails everyone at launch. A member
            replaced later gets this binome's level the same way.
          </span>
        </p>
        {live && live.errors.length > 0 && (
          <p role="alert" className="text-sm text-danger">Not done for: {live.errors.join("; ")}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!live || !pick || same || busy}>
            {busy && <Spinner className="size-4" />}
            {same ? "Already set" : pick === "none" ? "Close access" : `Give ${pick ?? "…"} access`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
