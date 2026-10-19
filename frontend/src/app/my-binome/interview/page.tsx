import * as React from "react"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, ArrowUpRight, Check, ClipboardPen, Eye, History, Lock, RotateCcw, SendHorizontal, Undo2 } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { PageHeader } from "@/components/page-header"
import { DotGrid, RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ApiError, call } from "@/lib/vic/api"
import { Spinner } from "@/lib/vic/confirm"
import { cellText } from "@/lib/vic/format"
import {
  asText, branchOf, clearDraft, missingOf, readDraft, sameAnswers, sectionsInPlay, toSend, useBinomeBase, writeDraft, type Answers,
} from "@/lib/vic/interview"
import { useVic } from "@/lib/vic/store"
import type { InterviewData, InterviewQuestion, InterviewSaved, InterviewSection, RunOut } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { Note } from "../components/note"

const TEXT_MAX = 5000
const DEPT_NAME: Record<string, string> = { IT: "Information & Technology", COMM: "Communication", HR: "Human Resources", FLER: "Finance, Logistics & External Relations" }
/** The form's own answers that read better with a word of context on the page. */
const OPTION_HINT: Record<string, string> = { "7ECHOH": "Not accepted", ...DEPT_NAME }

/** A form title as the page shows it: the form's stray spaces trimmed (the script keeps them, to match the sheet's headers). */
const tidy = (s: string) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim()

function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "code" | "done" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
        tone === "code" && "border-primary/30 bg-accent text-accent-foreground",
        tone === "done" && "border-transparent bg-success-soft text-success",
        tone === "plain" && "bg-card text-foreground"
      )}
    >
      {children}
    </span>
  )
}

/* ---------- one question ---------- */

/** 1 to 10 as a segmented control: two rows of five on a phone, one row from sm. Arrow keys move along it (Radix radio group). */
function ScoreScale({ q, value, onChange, labelId, invalid }: { q: InterviewQuestion; value: string; onChange: (v: string) => void; labelId: string; invalid: boolean }) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-labelledby={labelId}
      aria-invalid={invalid || undefined}
      aria-required={q.required}
      className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
    >
      {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
        <RadioGroupPrimitive.Item
          key={n}
          value={n}
          aria-label={`${n} out of 10`}
          className={cn(
            "num flex h-11 items-center justify-center rounded-xl border bg-background text-base font-bold text-foreground/80 shadow-xs outline-none transition-[background-color,border-color,color,transform] duration-150",
            "hover:border-primary/50 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96]",
            "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
            invalid && "border-danger/50"
          )}
        >
          {n}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

/** Options as full-width rows (tiles in two columns for the departments); the registration's own choice is marked. */
function ChoiceList({ q, value, onChange, labelId, invalid, registered }: { q: InterviewQuestion; value: string; onChange: (v: string) => void; labelId: string; invalid: boolean; registered?: string }) {
  const tiles = (q.options ?? []).every((o) => OPTION_HINT[o])
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      aria-labelledby={labelId}
      aria-invalid={invalid || undefined}
      aria-required={q.required}
      className={cn("grid gap-2", tiles && "sm:grid-cols-2")}
    >
      {(q.options ?? []).map((o) => (
        <RadioGroupPrimitive.Item
          key={o}
          value={o}
          className={cn(
            "group flex min-h-12 items-center gap-3 rounded-xl border bg-background px-4 py-2.5 text-left text-sm shadow-xs outline-none transition-[background-color,border-color] duration-150",
            "hover:border-primary/50 hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "data-[state=checked]:border-primary data-[state=checked]:bg-accent",
            invalid && "border-danger/50"
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-input transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary">
            <Check className="size-3 text-primary-foreground opacity-0 transition-opacity group-data-[state=checked]:opacity-100" strokeWidth={3} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{o}</span>
            {OPTION_HINT[o] && <span className="block text-xs text-muted-foreground">{OPTION_HINT[o]}</span>}
          </span>
          {registered === o && <span className="shrink-0 rounded-full bg-info-soft px-2 py-0.5 text-xs font-semibold text-info">Registration</span>}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

/** An answer as read-only: a score as a ten-step meter, a choice as a pill, a paragraph as text. */
function AnswerView({ q, value }: { q: InterviewQuestion; value: string }) {
  if (!value) return <p className="text-sm text-muted-foreground">No answer</p>
  if (q.type === "score") {
    const n = Number(value)
    return (
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" role="img" aria-label={`${n} out of 10`}>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className={cn("block h-2.5 flex-1 rounded-full", i < n ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <span className="num w-14 shrink-0 text-right text-lg font-extrabold text-heading">
          {n}
          <span className="text-sm font-normal text-muted-foreground">/10</span>
        </span>
      </div>
    )
  }
  if (q.type === "choice") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">
        {value}
        {OPTION_HINT[value] && <span className="font-normal text-accent-foreground/70">· {OPTION_HINT[value]}</span>}
      </span>
    )
  }
  return <p className="whitespace-pre-line break-words rounded-xl bg-muted/60 px-4 py-3 text-sm leading-relaxed">{value}</p>
}

function Question({ q, value, onChange, readOnly, invalid, registered }: {
  q: InterviewQuestion; value: string; onChange: (v: string) => void; readOnly: boolean; invalid: boolean; registered?: string
}) {
  const labelId = `q-${q.id}-label`
  return (
    <div id={`q-${q.id}`} className={cn("scroll-mt-24 py-5 first:pt-0 last:pb-0", invalid && "-mx-3 rounded-xl bg-danger-soft/50 px-3 ring-1 ring-danger/30 first:pt-3 last:pb-3")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={labelId} className="whitespace-pre-line text-[0.9375rem] font-semibold leading-snug text-foreground">{tidy(q.title)}</p>
          {q.help && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{tidy(q.help)}</p>}
        </div>
        {!q.required && <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">Optional</span>}
      </div>
      {readOnly ? (
        <AnswerView q={q} value={value} />
      ) : q.type === "score" ? (
        <ScoreScale q={q} value={value} onChange={onChange} labelId={labelId} invalid={invalid} />
      ) : q.type === "choice" ? (
        <ChoiceList q={q} value={value} onChange={onChange} labelId={labelId} invalid={invalid} registered={registered} />
      ) : (
        <div>
          <Textarea
            aria-labelledby={labelId}
            aria-invalid={invalid || undefined}
            aria-required={q.required}
            value={value}
            maxLength={TEXT_MAX}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-28 rounded-xl bg-background text-base leading-relaxed md:text-sm"
            placeholder={q.required ? "Your conclusion about this candidate" : "Anything the next reader should know"}
          />
          {value.length > TEXT_MAX - 1000 && <p className="num mt-1 text-right text-xs text-muted-foreground">{value.length} / {TEXT_MAX}</p>}
        </div>
      )}
      {invalid && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger"><AlertTriangle className="size-3.5" /> Answer this one to submit.</p>}
    </div>
  )
}

/* ---------- a section ---------- */

function SectionCard({ s, n, questions, answers, set, readOnly, showMissing, registered }: {
  s: InterviewSection; n: number; questions: InterviewQuestion[]; answers: Answers; set: (id: string, v: string) => void
  readOnly: boolean; showMissing: boolean; registered: string
}) {
  const qs = questions.filter((q) => q.section === s.id)
  const done = qs.filter((q) => (answers[q.id] ?? "").trim()).length
  return (
    <Card aria-labelledby={`sec-${s.id}`} className="overflow-hidden">
      <CardHeader className="gap-1">
        <div className="flex items-start gap-3">
          <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-vic-aqua text-base font-extrabold text-vic-ink" aria-hidden="true">
            {n}
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <CardTitle id={`sec-${s.id}`} className="text-lg font-bold leading-tight">{s.title}</CardTitle>
            {s.help && <CardDescription className="mt-1.5 whitespace-pre-line">{tidy(s.help)}</CardDescription>}
          </div>
          {!readOnly && (
            <span className={cn("num shrink-0 pt-1.5 text-xs font-semibold", done === qs.length ? "text-success" : "text-muted-foreground")}>
              {done === qs.length ? <Check className="inline size-3.5" /> : null} {done}/{qs.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="divide-y">
        {qs.map((q) => (
          <Question
            key={q.id}
            q={q}
            value={answers[q.id] ?? ""}
            onChange={(v) => set(q.id, v)}
            readOnly={readOnly}
            invalid={showMissing && q.required && !(answers[q.id] ?? "").trim()}
            registered={q.branch ? registered : undefined}
          />
        ))}
      </CardContent>
    </Card>
  )
}

/* ---------- the page ---------- */

type Phase = { s: "loading" } | { s: "error"; msg: string } | { s: "ready"; data: InterviewData }

/** The form's answers as the page holds them: what was saved, else the 1st choice from the registration. */
function startAnswers(d: InterviewData): Answers {
  if (d.answers) return Object.fromEntries(d.questions.map((q) => [q.id, asText(d.answers![q.id])]))
  const branch = d.questions.find((q) => q.branch)
  return branch && branch.options?.includes(d.firstChoice) ? { [branch.id]: d.firstChoice } : {}
}

/**
 * Interview Form 2026 for one candidate, on its own page: /interview/:code (members), /my-binome/interview/:code (admins in a
 * binome). The questions come from the script (Config.gs INTERVIEW_QUESTIONS); the 1st choice picks the department section.
 * Every change is kept as a draft in this browser until the save; a save the partner beat is refused (CONFLICT) and the page
 * reloads their version without losing the draft. Covers, view-only members and Google Form answers are read-only.
 */
export default function InterviewPage() {
  const { code = "" } = useParams()
  const navigate = useNavigate()
  const base = useBinomeBase(), back = base || "/"
  const member = useVic((s) => s.member)
  const user = useVic((s) => (s.member?.user || s.state?.user || "").toLowerCase())
  const adminLoaded = useVic((s) => s.gate.mode === "ok" && !s.loading)
  const patchInterview = useVic((s) => s.patchInterview)
  const cand = member?.candidates.find((c) => cellText(c.Code) === code)

  const [phase, setPhase] = React.useState<Phase>({ s: "loading" })
  const [answers, setAnswers] = React.useState<Answers>({})
  const [loaded, setLoaded] = React.useState<Answers>({})
  const [stamp, setStamp] = React.useState("")
  const [restored, setRestored] = React.useState(0) // when the draft found on load was saved (0 = none)
  const [conflict, setConflict] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false) // the draft now sits over the partner's newer version
  const [showMissing, setShowMissing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const ready = phase.s === "ready" ? phase.data : null

  const load = React.useCallback(() => call<RunOut<InterviewData>>("webRun", ["interviewGet", { code }]).then((o) => o.result), [code])

  // another candidate's page starts loading again (load changes only with code)
  const [loadedFor, setLoadedFor] = React.useState(code)
  if (loadedFor !== code) {
    setLoadedFor(code)
    setPhase({ s: "loading" })
  }

  React.useEffect(() => {
    let live = true
    load()
      .then((d) => {
        if (!live) return
        const start = startAnswers(d), draft = d.edit && d.source !== "Google Form" ? readDraft(d.binome, d.code) : null
        const keep = draft && !sameAnswers({ ...start, ...draft.answers }, start)
        setLoaded(start)
        setAnswers(keep ? { ...start, ...draft.answers } : start)
        setRestored(keep ? draft.at : 0)
        setStamp(d.stamp)
        setPhase({ s: "ready", data: d })
      })
      .catch((e: Error) => live && setPhase({ s: "error", msg: e.message }))
    return () => {
      live = false
    }
  }, [load])

  const readOnly = !ready || !ready.edit || ready.source === "Google Form" || cand?.interview?.source === "Google Form"
  const dirty = !!ready && !sameAnswers(answers, loaded)

  // the draft follows every change; back to what was loaded = no draft
  React.useEffect(() => {
    if (!ready || readOnly) return
    if (dirty) writeDraft(ready.binome, ready.code, answers)
    else clearDraft(ready.binome, ready.code)
  }, [answers, dirty, ready, readOnly])

  // an admin at this address who is in no binome: back to the Overview, as My binome does
  if (!member && adminLoaded) return <Navigate to="/" replace />

  const set = (id: string, v: string) => setAnswers((cur) => ({ ...cur, [id]: v }))

  async function reloadTheirs(keepDraft: boolean) {
    try {
      const d = await load()
      const start = startAnswers(d)
      setLoaded(start)
      setStamp(d.stamp)
      setPhase({ s: "ready", data: d })
      setConflict(null)
      if (keepDraft) setOver(!sameAnswers(answers, start))
      else {
        setAnswers(start)
        setOver(false)
        setRestored(0)
      }
    } catch (e) {
      toast.error("Could not reload the form", { description: (e as Error).message })
    }
  }

  async function submit() {
    if (!ready || saving) return
    const miss = missingOf(ready.questions, ready.sections, answers)
    if (miss.length) {
      setShowMissing(true)
      const el = document.getElementById(`q-${miss[0].id}`)
      el?.scrollIntoView({ behavior: "smooth", block: "center" })
      el?.querySelector<HTMLElement>("button, textarea")?.focus({ preventScroll: true })
      toast.warning(miss.length > 1 ? `${miss.length} questions still need an answer` : "One question still needs an answer")
      return
    }
    setSaving(true)
    try {
      const out = await call<RunOut<InterviewSaved>>("webRun", ["interviewSave", { code: ready.code, answers: toSend(ready.questions, ready.sections, answers), seen: stamp }])
      clearDraft(ready.binome, ready.code)
      patchInterview(ready.code, out.result.interview)
      toast.success(ready.answers ? "Changes saved" : "Interview form submitted", {
        description: "In your binome sheet now; the Interview Log, the status, Rating and Final Affectation follow at the next sync.",
      })
      navigate(back)
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") setConflict(e.message)
      else
        toast.error("Not saved", {
          description: (e as Error).message,
          action: e instanceof ApiError && e.code === "BUSY" ? { label: "Try again", onClick: () => void submit() } : undefined,
        })
    } finally {
      setSaving(false)
    }
  }

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
      <Link to={back}>
        <ArrowLeft /> My binome
      </Link>
    </Button>
  )

  if (!ready) {
    return (
      <BaseLayout>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {backLink}
          {phase.s === "error" ? (
            <Card className="relative isolate overflow-hidden">
              <DotGrid className="-z-10 opacity-30" />
              <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
                  <Lock className="size-6" />
                </span>
                <div className="max-w-md">
                  <p className="text-xl font-extrabold text-heading">{phase.msg}</p>
                  <p className="mt-2 text-sm text-muted-foreground">The form opens from your binome's own candidates, with your access to its sheet.</p>
                </div>
                <Button asChild variant="outline">
                  <Link to={back}>Back to My binome</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6" aria-busy="true">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-96 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          )}
        </div>
      </BaseLayout>
    )
  }

  const d = ready
  const shown = readOnly && d.answers ? startAnswers(d) : answers
  const dept = branchOf(d.questions, shown)
  const live = sectionsInPlay(d.sections, dept)
  const missing = missingOf(d.questions, d.sections, answers)
  const required = d.questions.filter((q) => live.some((s) => s.id === q.section) && q.required).length
  const who = (email?: string) => (!email ? "" : email.toLowerCase() === user ? "you" : email)
  const gform = d.formUrl ? d.formUrl + encodeURIComponent(d.code) : ""
  const fromForm = d.source === "Google Form" || cand?.interview?.source === "Google Form"

  const status = d.answers ? (
    <Chip tone="done">
      <Check className="size-3.5" /> Submitted {d.submittedAt || cand?.interview?.at}
    </Chip>
  ) : cand?.interview ? (
    <Chip tone="done">
      <Check className="size-3.5" /> Submitted {cand.interview.at}
    </Chip>
  ) : (
    <Chip>Not submitted yet</Chip>
  )

  return (
    <BaseLayout>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="space-y-2">
          {backLink}
          <PageHeader
            title={d.name || d.code}
            watermark="Interview"
            description={
              <>
                {readOnly ? "Interview Form 2026, as it was sent." : "Interview Form 2026. Your answers go into your binome sheet, and the Master takes them at the next sync."}
                <span className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone="code">{d.code}</Chip>
                  <Chip>Binome {d.binome}</Chip>
                  {d.firstChoice && <Chip>1st choice · {d.firstChoice}</Chip>}
                  {status}
                </span>
              </>
            }
          />
          {d.answers && (d.submittedBy || d.editedAt) && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <History className="size-3.5" />
              {d.submittedBy && <span>Sent by {who(d.submittedBy)}{fromForm ? " with the Google Form" : ""}</span>}
              {d.editedAt && <span>· edited {d.editedAt} by {who(d.editedBy)}</span>}
            </p>
          )}
        </div>

        {conflict && (
          <Note
            icon={AlertTriangle}
            tone="warning"
            action={
              <Button size="sm" onClick={() => void reloadTheirs(true)}>
                <RotateCcw /> Reload, keep my answers
              </Button>
            }
          >
            <b className="font-bold">Your partner saved this form meanwhile.</b> {conflict} Nothing of yours was saved. Reload their version: your answers stay on
            this page and in your draft.
          </Note>
        )}
        {over && !conflict && (
          <Note
            icon={History}
            tone="info"
            action={
              <Button size="sm" variant="outline" className="bg-background" onClick={() => void reloadTheirs(false)}>
                <Eye /> Show their answers
              </Button>
            }
          >
            <b className="font-bold">Their version is loaded underneath.</b> Your answers are kept on screen; saving now replaces theirs.
          </Note>
        )}
        {restored > 0 && !readOnly && !over && (
          <Note
            icon={History}
            tone="info"
            action={
              <Button
                size="sm"
                variant="outline"
                className="bg-background"
                onClick={() => {
                  setAnswers(loaded)
                  setRestored(0)
                  clearDraft(d.binome, d.code)
                }}
              >
                <Undo2 /> Discard draft
              </Button>
            }
          >
            <b className="font-bold">Draft restored.</b> What you typed on this device on{" "}
            {new Date(restored).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} is back, not saved yet.
          </Note>
        )}
        {readOnly && d.answers && (
          <Note icon={Eye} tone="info">
            {fromForm ? (
              <>
                <b className="font-bold">Sent with the Google Form.</b> Its answers show here read-only; the Google Form is where they were written.
              </>
            ) : (
              <>
                <b className="font-bold">Read-only.</b> {member?.cover ? "As a cover you can read these answers." : "You can view your binome sheet but not edit it, so these answers are read-only for you."}
              </>
            )}
          </Note>
        )}

        {readOnly && !d.answers ? (
          <Card className="relative isolate overflow-hidden">
            <RingSlot tone="soft" className="absolute -right-24 -top-16 -z-10 w-72" />
            <CardContent className="flex flex-col items-start gap-4 py-10">
              <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                {fromForm ? <Check className="size-6" /> : <ClipboardPen className="size-6" />}
              </span>
              <div className="max-w-lg">
                <p className="text-xl font-extrabold text-heading">{fromForm ? "Sent with the Google Form" : "Not filled in yet"}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {fromForm
                    ? `This interview came in ${cand?.interview?.at ? "on " + cand.interview.at + " " : ""}before the dashboard kept a copy of the answers. They are in the Master's Interview Responses tab.`
                    : "You can view this binome but not fill it in here, so the form opens in Google Forms with your binome and this candidate already filled in."}
                </p>
              </div>
              {!fromForm && gform && (
                <Button asChild>
                  <a href={gform} target="_blank" rel="noopener noreferrer">
                    Fill it with the Google Form <ArrowUpRight />
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {live.map((s, i) => (
              <React.Fragment key={s.id}>
                <SectionCard s={s} n={i + 1} questions={d.questions} answers={shown} set={set} readOnly={readOnly} showMissing={showMissing} registered={d.firstChoice} />
                {s.id === "first" && !dept && (
                  <div className="rounded-xl border-2 border-dashed border-primary/30 bg-accent/40 px-5 py-6 text-center text-sm text-muted-foreground">
                    Pick their <b className="font-semibold text-foreground">1st department choice</b> above: its section opens here.
                  </div>
                )}
              </React.Fragment>
            ))}
          </>
        )}

        {!readOnly && (
          <div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:mx-0 sm:rounded-t-2xl sm:border-x sm:px-5">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="num font-semibold">
                    {required - missing.length} of {required} required
                  </span>
                  <span className="truncate text-muted-foreground">{dirty ? "Draft kept on this device" : d.answers ? "No changes yet" : ""}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={required - missing.length} aria-label="Required questions answered">
                  <div className="h-full rounded-full bg-vic-strip transition-[width] duration-300" style={{ width: `${required ? (100 * (required - missing.length)) / required : 0}%` }} />
                </div>
              </div>
              <Button size="lg" className="shrink-0 px-5 sm:px-7" onClick={() => void submit()} disabled={saving || (!!d.answers && !dirty) || !!conflict}>
                {saving ? <Spinner /> : <SendHorizontal />}
                {d.answers ? "Save changes" : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BaseLayout>
  )
}
