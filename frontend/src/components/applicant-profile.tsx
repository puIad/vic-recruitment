import * as React from "react"
import { AlertCircle, CakeSlice, Check, ExternalLink, Pencil, RotateCw } from "lucide-react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BinomeColumns } from "@/components/binome-columns"
import { MemberNames } from "@/components/member-name"
import {
  ageOn,
  birthUsed,
  DEPT_VARS,
  deptColor,
  fieldLabel,
  flagList,
  isEnpEmail,
  longDate,
  parseHeard,
  rowKey,
  useAnalytics,
  useProfile,
  when,
  yearLabel,
} from "@/lib/vic/analytics"
import { alertLabel, STATUS_COLOR, STATUS_LABEL } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import { cn } from "@/lib/utils"
import type { AnalyticsRow } from "@/lib/vic/types"

/**
 * One applicant, everything the form and the pipeline know (docs/plans.md › The applicant profile). Admins only: the shell
 * mounts it for them, never for a member. Opened by row key (the code, or #n for a duplicate) from Analytics, an
 * Interviewees row and Ctrl K. Reads webAnalytics, loading it the first time it opens.
 */
export function ApplicantProfile() {
  const { key, open, close } = useProfile()
  const { data, loading, error, load } = useAnalytics()

  React.useEffect(() => {
    // the sheet opens from live lists (Interviewees, Ctrl K): re-read a copy older than 5 min; the old one stays on screen meanwhile
    if (open) void load(Date.now() - useAnalytics.getState().loadedAt > 5 * 60e3)
  }, [open, load])

  const row = React.useMemo(() => {
    if (!data || !key) return null
    const i = data.rows.findIndex((r, n) => rowKey(r, n) === key)
    return i < 0 ? null : data.rows[i]
  }, [data, key])

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-xl", DEPT_VARS)}>
        {row && data ? (
          <Profile row={row} tz={data.tz} />
        ) : (
          <>
            <SheetHeader className="p-6 pb-4">
              <SheetTitle className="text-2xl font-extrabold text-heading">{key?.startsWith("#") ? "Applicant" : key || "Applicant"}</SheetTitle>
              <SheetDescription>{loading || !data ? (error ? "The registrations did not load." : "Loading the registration…") : "No registration with this code."}</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 px-6">
              {error ? (
                <div className="flex items-start gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-2">
                    <p>{error}</p>
                    <Button size="sm" variant="outline" onClick={() => void load(true)}>
                      <RotateCw /> Try again
                    </Button>
                  </div>
                </div>
              ) : loading || !data ? (
                <>
                  <Skeleton className="h-24 rounded-xl" />
                  <Skeleton className="h-40 rounded-xl" />
                  <Skeleton className="h-32 rounded-xl" />
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">It may have registered after the list was read.</p>
                  <Button size="sm" variant="outline" onClick={() => void load(true)}>
                    <RotateCw /> Read the Master again
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Profile({ row: r, tz }: { row: AnalyticsRow; tz: string }) {
  const binome = useVic((s) => s.state?.binomes.find((b) => b.code === r.binome))
  const openEdit = useUi((s) => s.openEditDialog)
  const name = `${r.first} ${r.family}`.trim() || "No name given"
  const bu = birthUsed(r)
  const age = bu && r.registered ? ageOn(bu.date, r.registered, tz) : null
  const heard = parseHeard(r.discovered)
  const flags = flagList(r.flags)
  const email = r.typedEmail || r.email
  const [now] = React.useState(Date.now)

  const steps: { label: string; at: number | null; note?: string }[] = [
    { label: "Registered", at: r.registered },
    { label: r.binome ? `Assigned to ${r.binome}` : "Assigned to a binome", at: r.assignedAt },
    { label: "Contacted", at: r.contactedAt, note: !r.contactedAt && r.contacted && r.contacted !== "Not yet" ? `Sheet says “${r.contacted}”` : undefined },
    { label: r.interviewAt && r.interviewAt > now ? "Interview set for" : "Interview", at: r.interviewAt },
    { label: "Interview form in", at: r.submittedAt, note: r.finalDep ? `Final department: ${r.finalDep}` : undefined },
  ]
  const reached = steps.reduce((n, s, i) => (s.at && (i !== 3 || s.at <= now) ? i + 1 : n), 0)

  return (
    <>
      <SheetHeader className="relative gap-3 border-b p-6 pb-5">
        <div className="flex items-center gap-2 pr-8 text-sm">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[r.status] || "#9aa8b4" }} aria-hidden="true" />
          <span className="font-semibold">{STATUS_LABEL[r.status] || r.status || "No status"}</span>
          {r.binome && (
            <>
              <span className="text-muted-foreground" aria-hidden="true">·</span>
              <span className="font-semibold">{r.binome}</span>
              {binome && (
                <span className="truncate text-muted-foreground">
                  <MemberNames names={binome.members} />
                </span>
              )}
            </>
          )}
        </div>
        <div>
          <SheetTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[1.75rem] font-extrabold leading-tight tracking-tight">
            <span className="text-heading">{r.code || "No code"}</span>
            <span className="text-foreground">{name}</span>
          </SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="break-all">{email || "No email"}</span>
            {email && !isEnpEmail(email) && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">Personal email</span>}
          </SheetDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.code && r.status !== "DECLINED" && r.status !== "DUPLICATE" && (
            <Button size="sm" variant="outline" className="w-fit" onClick={() => openEdit({ code: r.code })}>
              <Pencil /> Edit
            </Button>
          )}
          {binome?.fileUrl && (
            <Button asChild size="sm" variant="outline" className="w-fit">
              <a href={binome.fileUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Open the binome sheet
              </a>
            </Button>
          )}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
        <Section title="Timeline">
          <ol className="relative space-y-0">
            {steps.map((s, i) => {
              const done = i < reached
              const set = !!s.at
              return (
                <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className={cn("absolute left-[9px] top-5 h-[calc(100%-1rem)] w-px", i + 1 < reached ? "bg-primary" : "bg-border")} />
                  )}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full border",
                      done ? "border-primary bg-primary text-primary-foreground" : set ? "border-primary bg-background" : "border-border bg-background"
                    )}
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={cn("text-sm font-semibold", !set && "text-muted-foreground")}>{s.label}</span>
                      <span className={cn("num text-sm", set ? "text-foreground" : "text-muted-foreground")}>{set ? when(s.at, tz) : "Not yet"}</span>
                    </div>
                    {s.note && <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </Section>

        {r.code && r.binome && (
          <Section title="Binome's columns">
            <p className="-mt-1 text-xs text-muted-foreground">
              Written straight into {r.binome}'s sheet. Anything the binome typed can be replaced; a field they changed since this opened is refused.
            </p>
            <BinomeColumns key={r.code} code={r.code} />
          </Section>
        )}

        <Section title="About them">
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-3 text-sm">
            <Term>Age</Term>
            <dd>
              {age !== null ? (
                <span className="font-semibold">
                  {age}
                  {bu?.guessed && <Guessed />}
                </span>
              ) : (
                <span className="text-muted-foreground">Unknown</span>
              )}
            </dd>
            <Term>Birthday</Term>
            <dd>
              {bu ? (
                <span className="inline-flex flex-wrap items-center gap-x-2">
                  <CakeSlice className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {longDate(bu.date)}
                  {bu.guessed && (
                    <span className="text-xs text-muted-foreground">
                      typed {longDate(r.birth.date)}, year guessed from their year of study
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">{r.birth?.date ? `Typed “${r.birth.date}”, unreadable` : "Not given"}</span>
              )}
            </dd>
            <Term>Field</Term>
            <dd>{r.field ? <><span className="font-semibold">{r.field}</span> <span className="text-muted-foreground">{fieldLabel(r.field)}</span></> : <Missing />}</dd>
            <Term>Year</Term>
            <dd>{r.year ? yearLabel(r) : <Missing />}</dd>
            <Term>Choices</Term>
            <dd className="flex flex-wrap gap-x-4 gap-y-1">
              <Choice n="1st" d={r.c1} />
              <Choice n="2nd" d={r.c2} />
            </dd>
            <Term>Heard of VIC</Term>
            <dd>
              {heard.options.length || heard.other ? (
                <span className="flex flex-wrap gap-1.5">
                  {heard.options.map((o) => (
                    <span key={o} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">{o}</span>
                  ))}
                  {heard.other && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{heard.other}</span>}
                </span>
              ) : (
                <Missing />
              )}
            </dd>
            <Term>Availability</Term>
            <dd>{r.avail || <Missing />}</dd>
          </dl>
        </Section>

        <Answer title="Why VIC" text={r.whyVic} />
        <Answer title={r.c1 ? `Why ${r.c1} first` : "Why their first choice"} text={r.motivation} />
        <Answer title="Other clubs" text={r.clubs} />
        {r.deptQuestions && (
          <Section title={`${r.c1 || "Department"} questions`}>
            <ul className="space-y-2 text-sm leading-relaxed">
              {r.deptQuestions.split("\n").filter((l) => l.trim()).map((l, i) => (
                <li key={i} className="rounded-lg bg-muted/60 px-3 py-2">{l}</li>
              ))}
            </ul>
          </Section>
        )}
        {r.anything && <Answer title="Anything to add" text={r.anything} />}

        <Section title="Flags">
          {flags.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {flags.map((f) => (
                <li key={f} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", f === "DUPLICATE_REGISTRATION" || f.startsWith("BAD_") ? "bg-warning-soft text-warning" : "bg-secondary text-foreground")}>
                  {alertLabel(f)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None: the registration passed every check.</p>
          )}
        </Section>

        <Answer title="Binome notes" text={r.notes} empty="The binome has not written anything." />
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </section>
  )
}

function Answer({ title, text, empty = "No answer." }: { title: string; text: string; empty?: string }) {
  return (
    <Section title={title}>
      {text.trim() ? <p className="max-w-prose whitespace-pre-line text-sm leading-relaxed">{text}</p> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </Section>
  )
}

const Term = ({ children }: { children: React.ReactNode }) => <dt className="text-muted-foreground">{children}</dt>
const Missing = () => <span className="text-muted-foreground">Not given</span>
const Guessed = () => (
  <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 align-middle text-xs font-semibold text-warning" title="The year typed was impossible: this one is guessed from the year of study">
    guessed
  </span>
)

function Choice({ n, d }: { n: string; d: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{n}</span>
      {d ? (
        <>
          <span className="size-2.5 rounded-full" style={{ background: deptColor(d) }} aria-hidden="true" />
          <span className="font-semibold">{d}</span>
        </>
      ) : (
        <span className="text-muted-foreground">none</span>
      )}
    </span>
  )
}

