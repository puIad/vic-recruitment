import * as React from "react"
import { Undo2 } from "lucide-react"
import { toast } from "sonner"

import { FormAnswers, FormHead, FormsError } from "@/components/interview-forms"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_LABEL } from "@/lib/vic/format"
import { useFormsRead } from "@/lib/vic/forms"
import { again } from "@/lib/vic/pending"
import { RESULT_VALUES, setResult, useResults, type ResultRow } from "@/lib/vic/results"
import { useVic } from "@/lib/vic/store"
import { Dot, Marks } from "./result-parts"
import { CorrectionDialog, ResultMailDialog } from "./send-results"

const Fact = ({ k, v }: { k: string; v: string }) => <div><p className="text-xs text-muted-foreground">{k}</p><p className="text-base font-semibold">{v}</p></div>

/** A change of mine the sheet refused: keep the sheet's value, or apply mine again. */
function Dropped({ r }: { r: ResultRow }) {
  const markDrops = useVic((s) => s.markDrops)
  const accept = useVic((s) => s.accept)
  const built = useVic((s) => s.state?.built)
  const e = r.dropped
  if (!e) return null
  const mine = e.value || "follow the binome"
  const apply = async () => {
    const c = again(e, built, Date.now())
    if (c && (await accept([c])) === "ok") await markDrops({ keep: [e.cell] })
    else toast.warning("Not applied yet", { description: "Pending changes are off or unreachable right now." })
  }
  return (
    <div className="space-y-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
      <p>
        Your change to <b>{mine}</b> was not applied. {e.reason ? e.reason : <>The sheet kept <b>{e.sheet || "no override"}</b>.</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void markDrops({ keep: [e.cell] })}>Keep the sheet's value</Button>
        {e.again && <Button size="sm" onClick={() => void apply()}>Apply mine anyway</Button>}
      </div>
    </div>
  )
}

/** The form that counts: the binome's notes and conclusion, the scores with their average, the answers. Read when the panel opens. */
function Answers({ code }: { code: string }) {
  const { data, error, retry } = useFormsRead({ code })
  if (error) return <FormsError error={error} retry={retry} />
  if (!data) return <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /></div>
  const form = data.forms.find((f) => f.counts) ?? data.forms[0]
  if (!form) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No form on file.</p>
  return (
    <div className="space-y-4">
      <FormHead form={form} />
      <FormAnswers form={form} read={data} />
    </div>
  )
}

/** The panel's content for one candidate; keyed by code, so the note draft starts empty for each. */
function PanelBody({ r, final }: { r: ResultRow; final: boolean }) {
  const [note, setNote] = React.useState("")
  const [dialog, setDialog] = React.useState<"correct" | "mail" | null>(null)
  const owner = useResults((s) => !!s.preview?.owner)
  const mailsGone = useResults((s) => !!s.view?.mails)
  const click = useResults((s) => s.clicks?.[r.code])
  return (
    <>
      <SheetHeader className="px-0">
              <SheetTitle className="text-xl">{r.name || r.code}</SheetTitle>
              <SheetDescription>{r.code}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fact k="Binome" v={r.binome || "None"} />
                <Fact k="1st / 2nd choice" v={`${r.c1 || "—"} / ${r.c2 || "—"}`} />
                <Fact k="Binome proposed" v={r.proposal || "Nothing yet"} />
                <Fact k="Status" v={STATUS_LABEL[r.status] || r.status} />
              </div>
              {final ? (
                <div className="space-y-2">
                  <p className="inline-flex flex-wrap items-center gap-2 text-base font-bold">{r.result && <Dot v={r.result} />}{r.result || "No result"} (final)<Marks r={r} /></p>
                  {r.told && <p className="text-sm text-muted-foreground">Told: {r.told}.{r.told.indexOf("Not accepted") !== 0 && (click ? <> Opened the group link on {new Date(click).toLocaleDateString()}.</> : <> Has not opened the group link.</>)}</p>}
                  {owner && (
                    <div className="flex flex-wrap gap-2">
                      {r.owed && mailsGone && <Button size="sm" onClick={() => setDialog("mail")}>Send the result mail…</Button>}
                      <Button size="sm" variant="outline" onClick={() => setDialog("correct")}>Correct the result…</Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {RESULT_VALUES.map((v, k) => (
                      <Button key={v} size="sm" variant={r.result === v ? "default" : "outline"} onClick={() => { void setResult(r, v, note.trim()).then((went) => went && setNote("")) }} className="gap-1.5">
                        <Dot v={v} /> {v}
                        <kbd className="hidden text-[10px] opacity-60 lg:inline">{k + 1}</kbd>
                      </Button>
                    ))}
                    {r.override && <Button size="sm" variant="ghost" onClick={() => void setResult(r, r.proposal)}><Undo2 /> Follow the binome</Button>}
                    <Marks r={r} />
                  </div>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="text-sm"
                    placeholder="Note for admins (optional), kept with the result you choose next: why the room overrode the binome" />
                </div>
              )}
              <Dropped r={r} />
              {r.override && r.note && <p className="rounded-lg border bg-card px-3 py-2 text-sm"><span className="font-semibold">Note on this override: </span>{r.note}</p>}
              {r.changed && (
                <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">The binome's proposal is now {r.proposal || "empty"}; the override was set against another.</p>
              )}
              <section className="space-y-2">
                <h3 className="text-sm font-bold">Binome's notes</h3>
                <p className="rounded-lg border bg-card px-3 py-2 text-sm whitespace-pre-line">{r.notes || <span className="text-muted-foreground">No notes in the sheet.</span>}</p>
              </section>
              {r.interviewed ? (
                <Answers key={r.code} code={r.code} />
              ) : (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Never interviewed ({STATUS_LABEL[r.status] || r.status}). No form.</p>
              )}
            </div>
      {dialog === "correct" && <CorrectionDialog r={r} onClose={() => setDialog(null)} />}
      {dialog === "mail" && <ResultMailDialog r={r} onClose={() => setDialog(null)} />}
    </>
  )
}

/** One row opened: binome, choices, proposal, the result buttons, the admin note, and the answers. */
export function ResultPanel({ r, final, onClose }: { r: ResultRow | undefined; final: boolean; onClose: () => void }) {
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto px-5 pb-16 sm:max-w-xl">
        {r && <PanelBody key={r.code} r={r} final={final} />}
      </SheetContent>
    </Sheet>
  )
}
