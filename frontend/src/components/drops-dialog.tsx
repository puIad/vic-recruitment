"use client"

import * as React from "react"
import { AlertTriangle, Bell, Settings2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { again, REASON, STATUS, YOURS } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import type { CellValue, PendingChange, PendingEntry, WebState } from "@/lib/vic/types"

/*
 * The next visit after a change was dropped while the author was away (docs/plans.md › Slice 4, the prototype's variant C):
 * one dialog for every drop waiting in the first record this visit read. It must be answered: Keep the sheet's value for
 * all, or Apply all of mine (fresh changes through the accept step). Drops that happen during the visit stay on their rows.
 */

const text = (v: CellValue | undefined) => (v === true ? "Yes" : v === false ? "No" : v === undefined || v === "" ? "empty" : String(v))

function describe(e: PendingEntry, state: WebState | null) {
  if (e.kind === "alert") {
    const a = state?.alerts.find((x) => x.id === e.alert) ?? state?.muted?.find((x) => x.id === e.alert)
    return { icon: Bell, what: `Alert ${e.alert}${a ? ` · ${a.type}${a.code ? ` · ${a.code}` : ""}` : ""}`, mine: YOURS[e.op], sheet: STATUS[e.sheet ?? ""] ?? e.sheet }
  }
  if (e.kind === "setting") return { icon: Settings2, what: `Setting ${e.key}`, mine: text(e.value), sheet: e.sheet === undefined ? undefined : text(e.sheet) }
  if (e.kind === "team") return { icon: UserRound, what: `${e.email} · Experienced`, mine: text(e.value), sheet: e.sheet === undefined ? undefined : text(e.sheet === "true") }
  if (e.kind === "bfield") return { icon: UserRound, what: `${e.code} (${e.binome}) · ${e.field}`, mine: text(e.value), sheet: e.sheet === undefined ? undefined : text(e.sheet) }
  return { icon: UserRound, what: `${e.code} · ${e.field}`, mine: text(e.value), sheet: e.sheet === undefined ? undefined : text(e.sheet) }
}

const fresh = (drops: PendingEntry[], built?: number) => { const at = Date.now(); return drops.map((e) => again(e, built, at)) }

export function DropsDialog() {
  const awayDrops = useVic((s) => s.awayDrops)
  const rec = useVic((s) => s.rec)
  const state = useVic((s) => s.state)
  const markDrops = useVic((s) => s.markDrops)
  const accept = useVic((s) => s.accept)
  const [saving, setSaving] = React.useState(false)
  // still waiting: answered on a row, or by another device, leaves the list
  const drops = awayDrops.map((c) => rec[c]).filter((e): e is PendingEntry => !!e && e.state === "dropped" && !e.addressed)
  const close = () => useVic.setState({ awayDrops: [] })
  if (!drops.length) return null

  const keepAll = async () => {
    setSaving(true)
    await markDrops({ keep: drops.map((e) => e.cell) })
    setSaving(false)
    close()
  }
  const applyAll = async () => {
    setSaving(true)
    const changes = fresh(drops, state?.built)
    const mine = changes.filter((c): c is PendingChange => !!c), rest = drops.filter((_, i) => !changes[i]).map((e) => e.cell)
    // the ones that can't be applied again (a refused value, a candidate gone, a snooze already over) are only acknowledged
    if (rest.length) await markDrops({ keep: rest })
    if (mine.length && (await accept(mine)) !== "ok")
      toast.warning("Not applied yet", { description: "Pending changes are off or unreachable right now. Each change is still on its row: answer it there.", duration: 10000 })
    setSaving(false)
    close()
  }
  const canApply = drops.some((e) => e.again)

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
            While you were away
          </DialogTitle>
          <DialogDescription>
            {drops.length === 1 ? "One of your changes was" : `${drops.length} of your changes were`} not applied, so the sheet kept its value. Nothing else changed.
          </DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 max-h-[50vh] space-y-2 overflow-y-auto px-1">
          {drops.map((e) => {
            const d = describe(e, state), Icon = d.icon
            return (
              <li key={e.cell} className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-sm">
                <p className="flex items-center gap-2 font-bold">
                  <Icon className="size-4 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 truncate">{d.what}</span>
                </p>
                <p className="mt-1 pl-6 text-foreground/80">
                  {e.reason ? <>{REASON[e.reason] ?? e.reason} </> : <>Changed before yours reached it. The sheet now: <b className="text-foreground">{d.sheet}</b>. </>}
                  Yours: <b className="text-foreground">{d.mine}</b>.
                </p>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={keepAll} disabled={saving}>
            Keep the sheet's value for all
          </Button>
          {canApply && (
            <Button onClick={applyAll} disabled={saving}>
              Apply all of mine
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
