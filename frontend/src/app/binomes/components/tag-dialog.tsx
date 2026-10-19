import * as React from "react"
import { ArrowRight, BellOff, Check, MoveRight, RotateCcw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { call } from "@/lib/vic/api"
import { Spinner } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Binome, BinomeTagCheck, RunOut } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

/** In the script's order (Config.gs DEPTS): the tag lists the other departments, then HR. */
const DEPTS = [
  { key: "IT", house: "Ravenclaw" },
  { key: "COMM", house: "Gryffindor" },
  { key: "FLER", house: "Hufflepuff" },
  { key: "HR", house: "Slytherin" },
] as const

/** Departments of a tag, as the script reads it (Matching.gs tagDepts); "ALL" is every department. */
const depsOf = (tag: string) => {
  const t = tag.toUpperCase()
  if (/\bALL\b/.test(t)) return DEPTS.map((d) => d.key as string)
  return DEPTS.map((d) => d.key as string).filter((k) => new RegExp(`\\b${k}\\b`).test(t))
}
const tagFor = (pick: Set<string>) => DEPTS.filter((d) => pick.has(d.key)).map((d) => d.key).join(" & ")
/** A binome sheet wears the house of its non-HR side (BinomeFiles.gs houseOf_). */
const houseOf = (tag: string) => (DEPTS.find((d) => d.key !== "HR" && depsOf(tag).includes(d.key)) ?? DEPTS[3]).house

/**
 * Binomes › ⋯ › Change department…: which departments a binome receives. Every change of the ticks asks the script for a dry
 * run (old and new tag, members who don't fit it, interviewees in progress it would keep); Apply writes the Tag, repaints the
 * binome sheet in its new house and logs a TAG row in the history. No email.
 */
export function TagDialog({ binome, onClose }: { binome: Binome | null; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const refresh = useVic((s) => s.refresh)
  const busy = useVic((s) => s.busy)
  const openMove = useUi((s) => s.openMoveDialog)
  const [pick, setPick] = React.useState<Set<string>>(new Set())
  const [check, setCheck] = React.useState<BinomeTagCheck | null>(null)
  const [error, setError] = React.useState("")
  const [nonce, setNonce] = React.useState(0)
  const code = binome?.code
  const from = binome?.tag ?? ""
  const to = tagFor(pick)
  const same = to === tagFor(new Set(depsOf(from))) // by departments: "HR & IT" or ALL ticked as it is changes nothing

  const [shownFor, setShownFor] = React.useState<{ code?: string; from: string } | null>(null)
  if (shownFor?.code !== code || shownFor?.from !== from) {
    setShownFor({ code, from })
    if (code) setPick(new Set(depsOf(from)))
  }

  // the dry run of the current ticks (debounced: each one loads the Master under the script lock)
  const [checkFor, setCheckFor] = React.useState<{ code?: string; to: string; same: boolean; nonce: number } | null>(null)
  if (checkFor?.code !== code || checkFor?.to !== to || checkFor?.same !== same || checkFor?.nonce !== nonce) {
    setCheckFor({ code, to, same, nonce })
    setCheck(null)
    setError("")
  }
  React.useEffect(() => {
    if (!code || !to || same) return
    let gone = false
    const t = setTimeout(() => {
      call<RunOut<BinomeTagCheck>>("webRun", ["binomeTag", { binome: code, depts: to.split(" & "), dryRun: true }])
        .then((out) => !gone && setCheck(out.result))
        .catch((e: Error) => !gone && setError(e.message))
    }, 450)
    return () => {
      gone = true
      clearTimeout(t)
    }
  }, [code, to, same, nonce])

  function toggle(k: string) {
    setPick((p) => {
      const n = new Set(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }

  async function apply() {
    if (!code || !check || check.errors.length) return
    const out = await run<BinomeTagCheck>("binomeTag", { binome: code, depts: to.split(" & ") }, `Department ${code}`)
    if (out?.result?.done) {
      refresh(true)
      onClose()
    }
  }

  function move(c: string) {
    onClose()
    openMove({ code: c })
  }

  const ready = !!check && check.to === to && !check.errors.length
  const draft = binome?.status === "DRAFT"

  return (
    <Dialog open={!!binome} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Change the department of {code}</DialogTitle>
          <DialogDescription>
            New registrations go to the least-loaded binome that takes their first choice. This decides which ones {code} can get.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="mb-2 text-sm font-bold">Receives candidates for</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEPTS.map((d) => {
              const on = pick.has(d.key)
              return (
                <button
                  key={d.key}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(d.key)}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-xl border p-3 text-left text-sm transition-colors disabled:opacity-50",
                    on ? "border-primary bg-accent ring-2 ring-ring/40" : "hover:bg-accent/50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-bold">{d.key}</span>
                    <span className="block text-xs text-muted-foreground">{d.house}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <section aria-label="What changes" aria-live="polite" className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
            <span className="font-semibold">{from || "no tag"}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className={cn("font-bold", same ? "text-muted-foreground" : "text-primary")}>{to || "nothing chosen"}</span>
            {!draft && !same && to && (
              <span className="ml-auto text-xs text-muted-foreground">
                Sheet: {houseOf(from)} → {houseOf(to)}
              </span>
            )}
          </div>

          {!to ? (
            <p className="text-muted-foreground">Tick at least one department.</p>
          ) : same ? (
            <p className="text-muted-foreground">{code} already receives {to}. Tick other departments to change it.</p>
          ) : error ? (
            <div role="alert" className="flex items-center gap-3 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5">
              <span className="min-w-0 flex-1">{error}</span>
              <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                <RotateCcw /> Retry
              </Button>
            </div>
          ) : !check || check.to !== to ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-3/4 rounded-full" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          ) : check.errors.length ? (
            <p role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2.5 text-danger">
              {check.errors.join(" ")}
            </p>
          ) : (
            <>
              {check.warnings.length > 0 && (
                <div className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  <ul className="space-y-1">
                    {check.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {check.stranded.length > 0 ? (
                <div className="space-y-2">
                  <p>
                    <b className="num">{check.stranded.length}</b> interviewee{check.stranded.length === 1 ? "" : "s"} in progress chose a
                    department {to} doesn't take. They stay with {code}; move any that should go elsewhere.
                  </p>
                  <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border">
                    {check.stranded.map((s) => (
                      <li key={s.code} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-16 shrink-0 font-bold text-primary">{s.code}</span>
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">{s.dept}</span>
                        <Button size="sm" variant="ghost" onClick={() => move(s.code)} aria-label={`Move ${s.code} to another binome`}>
                          <MoveRight /> Move…
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                !draft && <p className="text-muted-foreground">Every interviewee in progress with {code} fits {to}.</p>
              )}
            </>
          )}
        </section>

        <p className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <BellOff className="mt-px size-3.5 shrink-0" />
          <span>
            {draft
              ? "A draft has no sheet yet: only its Tag changes, and Lock makes its sheet in the new house."
              : "No email is sent: the binome sees its sheet change colour. Logged in the change history."}
          </span>
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!ready || busy}>
            {busy && <Spinner className="size-4" />}
            {same ? "No change" : to ? `Receive ${to}` : "Choose a department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
