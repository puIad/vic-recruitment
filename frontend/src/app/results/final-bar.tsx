import * as React from "react"
import { Lock, RotateCcw, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { call } from "@/lib/vic/api"
import { Spinner } from "@/lib/vic/confirm"
import { RESULT_VALUES, useResults, type ResultRow } from "@/lib/vic/results"
import { useVic } from "@/lib/vic/store"
import type { P1Preview, P1View, RunOut } from "@/lib/vic/types"
import { Dot } from "./result-parts"
import { SendResultsDialog } from "./send-results"

interface Props {
  view: P1View
  rows: ResultRow[]
  needs: number
  saving: number
  undealt: number
}

/** Never-interviewed candidates who still need a result: the preview lists them, then they go to Not accepted. */
function NeverDialog({ codes, rows, onClose }: { codes: string[]; rows: ResultRow[]; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const [saving, setSaving] = React.useState(false)
  const by = new Map(rows.map((r) => [r.code, r]))
  async function apply() {
    setSaving(true)
    const out = await run("p1Never", { op: "apply" }, "Set never interviewed to Not accepted")
    if (out) await useResults.getState().load()
    setSaving(false)
    if (out) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Set {codes.length} to Not accepted</DialogTitle>
          <DialogDescription>Candidates with no interview and no result. Each stays changeable until the results are final.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {codes.map((c) => <li key={c} className="flex gap-2"><span className="font-bold">{c}</span>{by.get(c)?.name}<span className="ml-auto text-xs text-muted-foreground">{by.get(c)?.status}</span></li>)}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={apply} disabled={saving || !codes.length}>{saving && <Spinner className="size-4" />} Set Not accepted</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FinalDialog({ counts, refusals, onClose }: { counts: Record<string, number>; refusals: string[]; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const [saving, setSaving] = React.useState(false)
  async function go() {
    setSaving(true)
    const out = await run("p1Final", { op: "final" }, "Make the results final")
    await useResults.getState().load()
    setSaving(false)
    if (out) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make results final</DialogTitle>
          <DialogDescription>Each result is copied into Phase 1 Result. Later edits to Final Affectation change nothing. You can reopen until the first result mail goes.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {RESULT_VALUES.map((v) => <li key={v} className="flex items-center gap-2"><Dot v={v} /> {v}<span className="num ml-auto font-bold">{counts[v] ?? 0}</span></li>)}
        </ul>
        {refusals.length > 0 && <ul className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{refusals.map((x) => <li key={x}>{x}</li>)}</ul>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={saving || refusals.length > 0}>{saving && <Spinner className="size-4" />} Make final</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** What still blocks final, the bulk action, and Make results final / Reopen for the vic.rh sign-in. */
export function FinalBar({ view, rows, needs, saving, undealt }: Props) {
  const run = useVic((s) => s.run)
  const phaseOpen = useVic((s) => !s.state?.close?.on)
  const preview = useResults((s) => s.preview)
  const [never, setNever] = React.useState<string[] | null>(null)
  const [fin, setFin] = React.useState<P1Preview | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const owner = !!preview?.owner
  const neverCount = rows.filter((r) => r.needs && !r.interviewed).length
  const blocks = [
    phaseOpen && "the interview phase is still open",
    needs > 0 && `${needs} need a decision`,
    saving > 0 && `${saving} still saving`,
    undealt > 0 && `${undealt} not applied`,
  ].filter(Boolean) as string[]

  async function openNever() {
    setBusy(true)
    try {
      const o = await call<RunOut<{ codes: string[] }>>("webRun", ["p1Never", { op: "preview" }])
      setNever(o.result.codes)
    } finally { setBusy(false) }
  }
  /** Asked fresh: the refusals include the pending changes only the Vercel side can see. */
  async function openFinal() {
    setBusy(true)
    try { setFin((await call<RunOut<P1Preview>>("webRun", ["p1Final", { op: "preview" }])).result) } finally { setBusy(false) }
  }
  async function reopen() {
    const out = await run("p1Final", { op: "reopen" }, "Reopen the results")
    if (out) await useResults.getState().load()
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-base">
      {view.final ? (
        <span className="inline-flex items-center gap-2 font-bold text-success"><Lock className="size-4" /> Results are final</span>
      ) : (
        <span className="text-muted-foreground">Not final{blocks.length ? `: ${blocks.join(", ")}.` : ". Ready."}</span>
      )}
      {view.final && view.send && view.mails && (
        <span className="text-sm text-muted-foreground">
          Told <b className="num text-foreground">{view.send.told}</b> · left <b className="num text-foreground">{view.send.left}</b>
          {view.send.owed > 0 && <> · mail owed <b className="num text-warning">{view.send.owed}</b></>}
        </span>
      )}
      {!view.final && neverCount > 0 && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void openNever()}>Set {neverCount} never interviewed to Not accepted…</Button>
      )}
      <span className="ml-auto inline-flex flex-wrap items-center gap-3">
        <Button size="sm" variant={view.final ? "default" : "outline"} disabled={!view.final} onClick={() => setSending(true)}
          title={view.final ? undefined : "Results must be final first"}>
          <Send /> Send results…
        </Button>
        {!view.final && <span className="text-sm text-muted-foreground">Final first</span>}
        {view.final ? (
          owner && !view.mails ? <Button size="sm" variant="outline" onClick={() => void reopen()}><RotateCcw /> Reopen</Button>
          : view.mails ? <span className="text-sm text-muted-foreground">Result mails have gone: corrections are one candidate at a time</span> : null
        ) : owner ? (
          <Button size="sm" disabled={blocks.length > 0 || busy} onClick={() => void openFinal()}><Lock /> Make results final…</Button>
        ) : (
          <span className="text-sm text-muted-foreground">Only vic.rh can make results final</span>
        )}
      </span>
      {never && <NeverDialog codes={never} rows={rows} onClose={() => setNever(null)} />}
      {sending && <SendResultsDialog onClose={() => setSending(false)} />}
      {fin && <FinalDialog counts={fin.counts} refusals={fin.refusals} onClose={() => setFin(null)} />}
    </div>
  )
}
