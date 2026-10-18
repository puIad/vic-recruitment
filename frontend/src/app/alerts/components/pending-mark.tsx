import { AlertTriangle, Check, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useActions } from "@/lib/vic/actions"
import { REASON, STATUS, YOURS, type Mark } from "@/lib/vic/pending"
import { useQuick } from "@/lib/vic/quick"
import { useVic } from "@/lib/vic/store"
import type { AlertEntry, PendingEntry } from "@/lib/vic/types"

/* How an alert row shows its author's pending change (variant A of the prototype the owner chose, issue 51). */


/** The pill next to the alert's name: Pending, then "In the sheet" for a moment, or Not applied. */
export function PendingMark({ mark }: { mark?: Mark<PendingEntry> }) {
  if (!mark) return null
  if (mark.kind === "pending")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-xs font-bold text-info" title="Only you see this until it is in the sheet">
        <Clock className="size-3" aria-hidden="true" /> Pending
      </span>
    )
  if (mark.kind === "flash")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success animate-in fade-in zoom-in-95">
        <Check className="size-3" aria-hidden="true" /> In the sheet
      </span>
    )
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">
      <AlertTriangle className="size-3" aria-hidden="true" /> Not applied
    </span>
  )
}

/** A dropped change, answered on its row: Keep the sheet's value, or Apply mine anyway (a fresh change). */
export function InlineDrop({ mark }: { mark?: Mark }) {
  const markDrops = useVic((s) => s.markDrops)
  const accept = useVic((s) => s.accept)
  const built = useVic((s) => s.state?.built)
  const { resolve } = useActions()
  const quick = useQuick()
  if (mark?.kind !== "dropped") return null
  const e = mark.entry
  const keep = () => markDrops({ keep: [e.cell] })
  const applyMine = async () => {
    const at = Date.now()
    // seen = the sheet's value as the notice shows it (issue 50); a drop with a reason never read the sheet: what they saw
    const seen = (e.sheet === "OPEN" || e.sheet === "SNOOZED" || e.sheet === "MUTED" ? e.sheet : e.seen) as AlertEntry["seen"]
    if (e.op === "snooze" && !(e.until && e.until > at)) return keep() // the snooze would already be over
    if ((await accept([{ kind: "alert", alert: e.alert, op: e.op, seen, at, until: e.until, built }])) === "ok") return
    // the pending path can't take it now: today's direct write, which reports on its own
    void keep()
    if (e.op === "resolve") await resolve([e.alert])
    else if (e.op === "snooze") { const h = ((e.until ?? at) - at) / 36e5; await quick.snooze([e.alert], h <= 4 ? "4h" : h <= 24 ? "24h" : "3d") } // the nearest length the direct Snooze has
    else await quick[e.op]([e.alert])
  }
  return (
    <div role="status" className="mt-2 rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-sm">
      <p>
        <b>Not applied.</b>{" "}
        {e.reason ? (
          <>{REASON[e.reason] ?? e.reason} Yours: <b>{YOURS[e.op]}</b>.</>
        ) : (
          <>
            The sheet changed before your change reached it. The sheet now: <b>{STATUS[e.sheet ?? ""] ?? e.sheet}</b>. Yours: <b>{YOURS[e.op]}</b>.
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={keep}>
          {e.again ? "Keep the sheet's value" : "OK"}
        </Button>
        {e.again && (
          <Button size="sm" onClick={applyMine}>
            Apply mine anyway
          </Button>
        )}
      </div>
    </div>
  )
}
