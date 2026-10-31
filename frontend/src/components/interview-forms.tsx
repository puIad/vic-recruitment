import { AlertCircle, RotateCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useFormsRead } from "@/lib/vic/forms"
import { asText, sectionsInPlay } from "@/lib/vic/interview"
import type { FormRead, FormsRead } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim()
const RESULT_TONE: Record<string, "success" | "info" | "warning" | "secondary"> = { OK: "success", AUTOCORRECTED: "info", FLAGGED: "warning", IGNORED: "secondary" }

export function FormsError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-2">
        <p>{error}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCw /> Try again
        </Button>
      </div>
    </div>
  )
}

/** One form's answers, read only: the sections in play (the 1st department choice picks the department's), scores as numbers, an
 *  empty answer left out. */
export function FormAnswers({ form, read }: { form: FormRead; read: Pick<FormsRead, "sections" | "questions"> }) {
  if (!form.answers) return <p className="text-sm text-muted-foreground">Its answers are no longer in the Master.</p>
  const answers = form.answers
  const dept = asText(answers[read.questions.find((q) => q.branch)?.id ?? ""])
  const live = sectionsInPlay(read.sections, dept)
  return (
    <div className="space-y-4">
      {live.map((s) => {
        const qs = read.questions.filter((q) => q.section === s.id && asText(answers[q.id]) !== "")
        if (!qs.length) return null
        return (
          <section key={s.id} className="space-y-2">
            <h4 className="text-sm font-bold">{s.title}</h4>
            <dl className="divide-y rounded-xl border bg-card">
              {qs.map((q) => (
                <div key={q.id} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                  <dt className="text-muted-foreground">{tidy(q.title)}</dt>
                  <dd className={cn("min-w-0 whitespace-pre-line break-words font-medium", q.type === "score" && "num font-bold")}>{asText(answers[q.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

/** Who sent a form, when, the log's result and what was typed: the head of one form. */
export function FormHead({ form }: { form: FormRead }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={RESULT_TONE[form.result] ?? "secondary"}>{form.result || "No result"}</Badge>
        <Badge variant="outline">{form.source}</Badge>
        {form.rating !== "" && <span className="text-muted-foreground">Average <b className="num text-foreground">{form.rating}</b></span>}
        <span className="num ml-auto text-muted-foreground">{form.at}</span>
      </div>
      <p className="text-muted-foreground">
        Sent by <span className="font-medium text-foreground">{form.by || "nobody known"}</span>
        {form.editedAt && <> · edited by <span className="font-medium text-foreground">{form.editedBy || "someone"}</span> on {form.editedAt}</>}
      </p>
      <p className="text-muted-foreground">
        Typed {form.typedBinome || "no binome"} and {form.typedInterviewee || "no candidate"}
        {form.finalDep && <> · final department <span className="font-medium text-foreground">{form.finalDep}</span></>}
      </p>
      {form.notes && <p className="whitespace-pre-line text-muted-foreground">{form.notes}</p>}
    </div>
  )
}

/**
 * The "Interview form" section of a candidate's details (docs/admin-features.md): every form of the candidate with its Interview Log
 * result. The form that counts is open, the others folded. Read only, so any admin can read answers outside their binome.
 * Key it by candidate.
 */
export function InterviewForms({ code }: { code: string }) {
  const { data, error, retry } = useFormsRead({ code })
  if (error) return <FormsError error={error} retry={retry} />
  if (!data) return <Skeleton className="h-40 rounded-xl" />
  if (!data.forms.length) return <p className="text-sm text-muted-foreground">No interview form has come in for {code} yet.</p>
  // the one that counts first; a candidate with none marked (a form linked by hand) opens the latest
  const sorted = [...data.forms].sort((a, b) => Number(b.counts) - Number(a.counts))
  return (
    <div className="space-y-3">
      {sorted.map((f, i) => (
        <details key={f.key} open={f.counts || (i === 0 && !sorted.some((x) => x.counts))} className="group rounded-xl border bg-accent/20 p-3">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-bold">
            {f.counts ? "The form that counts" : "Another form"}
            <Badge variant={RESULT_TONE[f.result] ?? "secondary"}>{f.result || "No result"}</Badge>
            <span className="num ml-auto font-normal text-muted-foreground">{f.at}</span>
          </summary>
          <div className="mt-3 space-y-4">
            <FormHead form={f} />
            <FormAnswers form={f} read={data} />
          </div>
        </details>
      ))}
    </div>
  )
}
