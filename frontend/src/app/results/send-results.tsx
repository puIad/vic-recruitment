import * as React from "react"
import { Eye, Send, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { call } from "@/lib/vic/api"
import { Spinner } from "@/lib/vic/confirm"
import { DEPT_RESULTS, RESULT_VALUES, useResults, type ResultRow } from "@/lib/vic/results"
import { useVic } from "@/lib/vic/store"
import type { ResultOnePreview, ResultsMailPreview, RunOut } from "@/lib/vic/types"
import { Dot } from "./result-parts"

const KIND_LABEL: Record<string, string> = { RESULT_YES: "Accepted", RESULT_NO: "Not accepted, interviewed", RESULT_NO_NI: "Not accepted, not interviewed" }
const FIELD_LABEL: Record<string, string> = { subject: "Subject", heading: "Heading", above: "Text above", below: "Text below", text: "Text" }

/** The mail drawn as the candidate gets it. */
const Frame = ({ title, html }: { title: string; html: string }) => <iframe title={title} sandbox="" srcDoc={html} className="h-[26rem] w-full rounded-xl border bg-white" />

/** Send results (docs/admin-features.md › Telling candidates their result): one preview, the texts editable, a test to the presser, then everyone in one batch. */
export function SendResultsDialog({ onClose }: { onClose: () => void }) {
  const run = useVic((s) => s.run)
  const [pv, setPv] = React.useState<ResultsMailPreview | null>(null)
  const [error, setError] = React.useState("")
  const [texts, setTexts] = React.useState<Record<string, Record<string, string>>>({})
  const [nexts, setNexts] = React.useState<Record<string, string>>({})
  const [replaces, setReplaces] = React.useState("")
  const [sample, setSample] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [drawing, setDrawing] = React.useState(false)

  React.useEffect(() => {
    let live = true
    call<RunOut<ResultsMailPreview>>("webRun", ["resultsMail", { op: "preview" }]).then(
      (o) => {
        if (!live) return
        setPv(o.result)
        setTexts(o.result.texts)
        setNexts(o.result.nexts)
        setReplaces(o.result.replaces)
      },
      (e: Error) => live && setError(e.message || "Could not read the preview.")
    )
    return () => { live = false }
  }, [])
  /** draws the six mails again from the words as typed (and the refusals they change); the boxes keep what was typed */
  async function redraw() {
    setDrawing(true)
    try { setPv((await call<RunOut<ResultsMailPreview>>("webRun", ["resultsMail", { op: "preview", texts, nexts }])).result) }
    catch (e) { setError((e as Error).message || "Could not read the preview.") } finally { setDrawing(false) }
  }

  const body = () => ({ texts, nexts, replaces })
  const typed = (kind: string, field: string, v: string) => { setTexts((t) => ({ ...t, [kind]: { ...t[kind], [field]: v } })) }
  async function test() {
    setBusy(true)
    await run("resultsMail", { op: "test", ...body() }, "Send test result mails")
    setBusy(false)
  }
  async function send() {
    setBusy(true)
    const out = await run<{ sent: number; failed: number; left: number }>("resultsMail", { op: "send", ...body() }, "Send results")
    await useResults.getState().load()
    setBusy(false)
    if (out && !out.result.left) onClose()
    else await redraw()
  }

  const s = pv?.samples[sample]
  const refusals = pv?.refusals ?? []
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Send results</DialogTitle>
          <DialogDescription>
            Everyone who is final and not told yet gets one mail, in one batch. Send me a test mails you one copy of each; nothing is marked as told.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!pv && !error && <div className="flex justify-center py-10"><Spinner className="size-5" /></div>}
        {pv && (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-lg border px-3 py-2">
                <p className="font-bold">Accepted ({DEPT_RESULTS.reduce((n, d) => n + pv.counts.RESULT_YES[d], 0)})</p>
                <p className="flex flex-wrap gap-x-3">{DEPT_RESULTS.map((d) => <span key={d} className="inline-flex items-center gap-1.5"><Dot v={d} />{d} <b className="num">{pv.counts.RESULT_YES[d]}</b></span>)}</p>
              </div>
              <div className="rounded-lg border px-3 py-2"><p className="font-bold">Not accepted, interviewed</p><p className="num text-lg font-bold">{pv.counts.RESULT_NO}</p></div>
              <div className="rounded-lg border px-3 py-2"><p className="font-bold">Not accepted, not interviewed</p><p className="num text-lg font-bold">{pv.counts.RESULT_NO_NI}</p></div>
            </div>
            <p className="text-sm text-muted-foreground">
              {pv.total} to tell now{pv.told > 0 && <>, {pv.told} already told</>}{pv.owed > 0 && <>, {pv.owed} correction mail(s) owed (sent one at a time, not here)</>}.
            </p>

            {pv.skipped.length > 0 && (
              <details className="rounded-lg border px-3 py-2 text-sm" open>
                <summary className="cursor-pointer font-bold">{pv.skipped.length} skipped</summary>
                <ul className="mt-1 space-y-0.5">{pv.skipped.map((x) => <li key={x.code}><b>{x.code}</b> {x.name} {x.why}</li>)}</ul>
              </details>
            )}
            {pv.notInterviewed.length > 0 && (
              <details className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning" open>
                <summary className="cursor-pointer font-bold">{pv.notInterviewed.length} not interviewed but proposed by a binome</summary>
                <p className="mt-1">They get the not-interviewed text unless their form is logged first. Check them:</p>
                <ul className="mt-1 space-y-0.5">{pv.notInterviewed.map((x) => <li key={x.code}><b>{x.code}</b> {x.name} ({x.status}, proposed {x.proposal})</li>)}</ul>
              </details>
            )}
            {pv.declinedWaiting > 0 && (
              <p className="rounded-lg border px-3 py-2 text-sm">{pv.declinedWaiting} declined applicant(s) are still waiting for their rejection. They are not part of this send: use Send rejections in Maintenance.</p>
            )}

            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="mr-2 text-sm font-bold">The six mails</h3>
                {pv.samples.map((x, k) => (
                  <Button key={x.label} size="sm" variant={k === sample ? "default" : "outline"} onClick={() => setSample(k)}>{x.label}</Button>
                ))}
              </div>
              {s && (
                <>
                  <p className="text-sm text-muted-foreground">Subject: {s.subject}. Drawn with {s.name ? `${s.name} (${s.code})` : "a sample name"}.</p>
                  <Frame title={s.label} html={s.html} />
                </>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold">The words</h3>
              {Object.keys(KIND_LABEL).map((kind) => (
                <div key={kind} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-bold">{KIND_LABEL[kind]}</p>
                  {Object.entries(texts[kind] ?? {}).map(([field, v]) => (
                    <label key={field} className="block space-y-1 text-sm">
                      <span className="font-semibold">{FIELD_LABEL[field] ?? field}</span>
                      {field === "subject" || field === "heading"
                        ? <Input value={v} onChange={(e) => typed(kind, field, e.target.value)} />
                        : <Textarea value={v} rows={Math.min(8, Math.max(3, v.split("\n").length + 1))} onChange={(e) => typed(kind, field, e.target.value)} />}
                    </label>
                  ))}
                </div>
              ))}
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-bold">Next step per department <span className="font-normal text-muted-foreground">(placed where the accepted mail says {"{next}"})</span></p>
                {DEPT_RESULTS.map((d) => (
                  <label key={d} className="block space-y-1 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-semibold"><Dot v={d} />{d}</span>
                    <Textarea value={nexts[d] ?? ""} rows={2} onChange={(e) => setNexts((n) => ({ ...n, [d]: e.target.value }))} />
                  </label>
                ))}
              </div>
              <label className="block space-y-1 text-sm">
                <span className="font-semibold">Line added when a corrected result replaces an earlier mail</span>
                <Input value={replaces} onChange={(e) => setReplaces(e.target.value)} />
              </label>
              <Button size="sm" variant="outline" disabled={drawing} onClick={() => void redraw()}>{drawing ? <Spinner className="size-4" /> : <Eye />} Redraw the mails with these words</Button>
              <p className="text-xs text-muted-foreground">The words are saved to Settings when Send is pressed, before the first mail. Group links are in Settings › Emails.</p>
            </section>

            {refusals.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning" role="alert">
                {refusals.map((x) => <li key={x} className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{x}</li>)}
              </ul>
            )}
            {pv.testMode && <p className="rounded-lg border px-3 py-2 text-sm">Test mode is on: Send mails you one copy of each and tells nobody.</p>}
            {!pv.owner && <p className="text-sm text-muted-foreground">Only vic.rh can send. You can still preview and send yourself a test.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="outline" disabled={busy || !pv} onClick={() => void test()}><Send /> Send me a test</Button>
          <Button disabled={busy || !pv || !pv.owner || refusals.length > 0} onClick={() => void send()}>
            {busy && <Spinner className="size-4" />} Send to {pv?.total ?? 0}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One candidate's mail (a correction, or a late first result): the preview, the replaces line when they were told before, Send. */
export function ResultMailDialog({ r, onClose }: { r: Pick<ResultRow, "code" | "name">; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const [pv, setPv] = React.useState<ResultOnePreview | null>(null)
  const [error, setError] = React.useState("")
  const [line, setLine] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const owner = useResults((s) => !!s.preview?.owner)

  React.useEffect(() => {
    let live = true
    call<RunOut<ResultOnePreview>>("webRun", ["resultMailOne", { op: "preview", code: r.code }]).then(
      (o) => {
        if (!live) return
        setPv(o.result)
        setLine(o.result.replaces)
      },
      (e: Error) => live && setError(e.message || "Could not read the mail.")
    )
    return () => { live = false }
  }, [r.code])
  /** the mail drawn again with the replaces line as typed */
  async function redraw() {
    try { setPv((await call<RunOut<ResultOnePreview>>("webRun", ["resultMailOne", { op: "preview", code: r.code, replaces: line ?? undefined }])).result) }
    catch (e) { setError((e as Error).message || "Could not read the mail.") }
  }

  async function send() {
    setBusy(true)
    const out = await run<{ sent: boolean }>("resultMailOne", { op: "send", code: r.code, replaces: line ?? undefined }, `Result mail to ${r.code}`)
    await useResults.getState().load()
    setBusy(false)
    if (out?.result.sent) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Result mail to {r.name || r.code}</DialogTitle>
          <DialogDescription>{pv ? <>To {pv.to}. Result: <b>{pv.result}</b>{pv.told ? <>, told before: {pv.told}</> : null}.</> : "One mail for this candidate."}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{error}</p>}
        {pv && (
          <div className="space-y-3">
            {pv.told && line !== null && (
              <label className="block space-y-1 text-sm">
                <span className="font-semibold">Line saying this mail replaces the earlier one</span>
                <Input value={line} onChange={(e) => setLine(e.target.value)} onBlur={() => void redraw()} />
              </label>
            )}
            <p className="text-sm text-muted-foreground">Subject: {pv.subject}</p>
            <Frame title="Result mail" html={pv.html} />
            {pv.testMode && <p className="rounded-lg border px-3 py-2 text-sm">Test mode is on: Send mails you a copy and tells the candidate nothing.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button disabled={busy || !pv || !owner} onClick={() => void send()}>{busy && <Spinner className="size-4" />} Send</Button>
        </DialogFooter>
        {!owner && <p className="text-sm text-muted-foreground">Only vic.rh can send a result mail.</p>}
      </DialogContent>
    </Dialog>
  )
}

/** A final result changed by vic.rh, one candidate at a time, with a reason; it ends in that candidate's mail. */
export function CorrectionDialog({ r, onClose }: { r: ResultRow; onClose: () => void }) {
  const run = useVic((s) => s.run)
  const [value, setValue] = React.useState(r.result)
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [mail, setMail] = React.useState(false)
  async function apply() {
    setBusy(true)
    const out = await run("p1Final", { op: "correct", code: r.code, value, reason: reason.trim() }, `Correct ${r.code}`)
    await useResults.getState().load()
    setBusy(false)
    if (out) setMail(true)
  }
  if (mail) return <ResultMailDialog r={r} onClose={onClose} />
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct the result of {r.name || r.code}</DialogTitle>
          <DialogDescription>The results are final. A correction is logged with its reason and changes this candidate only. The next step shows their mail.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {RESULT_VALUES.map((v) => <Button key={v} size="sm" variant={value === v ? "default" : "outline"} onClick={() => setValue(v)} className="gap-1.5"><Dot v={v} />{v}</Button>)}
        </div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why (required)" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !reason.trim() || value === r.result} onClick={() => void apply()}>{busy && <Spinner className="size-4" />} Correct and preview the mail</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
