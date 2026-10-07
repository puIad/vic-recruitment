import * as React from "react"
import { ArrowUpRight, CalendarClock, CircleCheck, Database, Lock, PanelRightOpen, PauseCircle, RotateCcw, UserRoundCheck } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { DotGrid, RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { alertLabel, cellText, initials, SEVERITY, sheetTime, STAGES } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import type { Candidate, MemberAlert, MemberState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { CandidateSheet, CandidatesTable, fullName } from "./components/candidates"

/** A binome's candidates never wait for a binome: the pipeline starts at Assigned. */
const MEMBER_STAGES = STAGES.filter((s) => s.key !== "UNASSIGNED")

function Note({ icon: Icon, tone, children }: { icon: React.ElementType; tone: "info" | "warning"; children: React.ReactNode }) {
  return (
    <div role="note" className={cn("flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed", tone === "info" ? "border-info/20 bg-info-soft" : "border-vic-orange/40 bg-warning-soft")}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-info" : "text-warning")} />
      <div className="min-w-0 text-foreground/90">{children}</div>
    </div>
  )
}

/** Where the binome's candidates stand, and the interviews coming up. */
function ProgressCard({ m }: { m: MemberState }) {
  const n = (k: string) => m.candidates.filter((c) => c.Status === k).length
  const total = m.candidates.length
  const now = Date.now() - 3600e3 // an interview that started within the hour still counts as coming up
  const next = m.candidates
    .filter((c) => c.Status !== "WITHDRAWN" && !cellText(c["Interview Done"]))
    .map((c) => ({ c, t: sheetTime(c["Interview Date"], c["Interview Time"]) }))
    .filter((x) => x.t >= now)
    .sort((a, b) => a.t - b.t)
    .slice(0, 4)

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Your candidates</CardTitle>
        <CardDescription>{m.fromSheet ? "Read from your sheet; statuses show after the next sync" : "Where each one stands in the Master"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-baseline gap-3">
          <span className="num text-6xl font-extrabold leading-none tracking-tight text-heading">{total}</span>
          <span className="text-base font-medium text-muted-foreground">{total === 1 ? "candidate" : "candidates"}</span>
        </div>

        {!m.fromSheet && total > 0 && (
          <>
            <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={MEMBER_STAGES.map((x) => `${x.label} ${n(x.key)}`).join(", ")}>
              {MEMBER_STAGES.map((x) =>
                n(x.key) ? <i key={x.key} className="block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * n(x.key)) / total}%`, background: x.color }} title={`${x.label}: ${n(x.key)}`} /> : null
              )}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-5">
              {MEMBER_STAGES.map((x) => (
                <div key={x.key} className="min-w-0">
                  <dt className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />
                    {x.label}
                  </dt>
                  <dd className={cn("num mt-0.5 text-3xl leading-tight", n(x.key) ? "font-extrabold" : "font-bold text-muted-foreground/60")}>{n(x.key)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="border-t pt-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            <CalendarClock className="size-4 text-primary" /> Coming up
          </h3>
          {next.length ? (
            <ul className="divide-y">
              {next.map(({ c }) => (
                <li key={cellText(c.Code)} className="flex items-center gap-3 py-2 text-sm">
                  <span className="num w-28 shrink-0 font-semibold">
                    {cellText(c["Interview Date"])}
                    {cellText(c["Interview Time"]) && <span className="font-normal text-muted-foreground"> · {cellText(c["Interview Time"])}</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-bold text-primary">{cellText(c.Code)}</b> {fullName(c)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No interview planned yet. Set the day and time in your sheet once you've reached the candidate.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const rank = (a: MemberAlert) => SEVERITY[a.severity]?.rank ?? 0

/** The binome's open alerts (the ones the script would mail you), one row per candidate, worst first. "All clear" is a designed state. */
function AlertsCard({ alerts, fromSheet, onOpen }: { alerts: MemberAlert[]; fromSheet: boolean; onOpen: (code: string) => void }) {
  const byCode = new Map<string, MemberAlert[]>()
  alerts.forEach((a) => byCode.set(a.code, [...(byCode.get(a.code) ?? []), a]))
  const sorted = [...byCode.entries()]
    .map(([code, list]) => ({ code, list: list.sort((a, b) => rank(b) - rank(a)) }))
    .sort((a, b) => rank(b.list[0]) - rank(a.list[0]) || a.code.localeCompare(b.code, undefined, { numeric: true }))
  return (
    <Card className="relative overflow-hidden lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Needs you</CardTitle>
        <CardDescription>
          {fromSheet
            ? "Alerts live in the Master: they show after the next sync"
            : alerts.length
              ? `${alerts.length} open alert${alerts.length > 1 ? "s" : ""} on ${sorted.length} candidate${sorted.length > 1 ? "s" : ""}, worst first`
              : "Nothing waiting on your binome"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="relative flex min-h-40 items-center gap-5 py-2">
            <RingSlot tone="soft" className="absolute -right-24 -top-10 w-64" />
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <CircleCheck className="size-6" />
            </span>
            <div className="relative">
              <p className="text-xl font-extrabold text-heading">{fromSheet ? "Nothing to show yet" : "All clear"}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                The script checks your candidates on every sync and flags anyone not contacted, not scheduled or overdue.
              </p>
            </div>
          </div>
        ) : (
          <ul className="-mr-3 max-h-[26rem] divide-y overflow-y-auto pr-3">
            {sorted.map(({ code, list }) => (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => code && onOpen(code)}
                  title={list.map((a) => a.msg).join("\n")}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/60"
                >
                  <b className="w-16 shrink-0 pt-0.5 text-sm font-bold text-primary">{code || "—"}</b>
                  <span className="min-w-0 flex-1 space-y-1">
                    {list.map((a) => (
                      <span key={a.id} className="flex items-center gap-2 text-sm">
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY[a.severity]?.tone)}>{SEVERITY[a.severity]?.label ?? a.severity}</span>
                        <span className="truncate font-medium">{alertLabel(a.type)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="hidden shrink-0 pt-0.5 text-xs text-muted-foreground sm:block">{list[0].created}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Members({ m }: { m: MemberState }) {
  if (!m.members.length) return null
  return (
    // spans, not a ul: this sits inside the page header's <p>
    <span role="list" aria-label="Your binome" className="mt-3 flex flex-wrap gap-2">
      {m.members.map((name) => (
        <span role="listitem" key={name} className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm font-semibold text-foreground">
          <span className="flex size-6 items-center justify-center rounded-full bg-vic-aqua text-[10px] font-bold text-vic-ink" aria-hidden="true">
            {initials(name)}
          </span>
          {name}
        </span>
      ))}
    </span>
  )
}

/** The member's binome could not load at all: say why, and that the page fills itself once it can. */
function Unavailable({ message }: { message: string }) {
  const refresh = useVic((s) => s.refresh)
  const refreshing = useVic((s) => s.refreshing)
  return (
    <Card className="relative isolate overflow-hidden">
      <DotGrid className="-z-10 opacity-30" />
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          <Lock className="size-6" />
        </span>
        <div className="max-w-md">
          <p className="text-xl font-extrabold text-heading">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The admins share each binome's sheet at launch. This page checks again every 15 seconds and fills itself as soon as your binome is ready.
          </p>
        </div>
        <Button variant="outline" onClick={() => refresh()} disabled={refreshing}>
          <RotateCcw className={cn(refreshing && "animate-spin")} /> Try again now
        </Button>
      </CardContent>
    </Card>
  )
}

export default function MyBinomePage() {
  const m = useVic((s) => s.member)
  const error = useVic((s) => s.memberError)
  const [open, setOpen] = React.useState<string | null>(null)
  const openCode = React.useCallback((code: string) => setOpen(code), [])
  const candidate: Candidate | null = (open && m?.candidates.find((c) => cellText(c.Code) === open)) || null

  if (!m) {
    return (
      <BaseLayout title="My binome" description={error ? undefined : "Loading your binome…"} watermark="Binome">
        {error ? (
          <Unavailable message={error} />
        ) : (
          <div className="space-y-6" aria-busy="true">
            <div className="grid gap-6 lg:grid-cols-5">
              <Skeleton className="h-72 rounded-xl lg:col-span-3" />
              <Skeleton className="h-72 rounded-xl lg:col-span-2" />
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        )}
      </BaseLayout>
    )
  }

  return (
    <BaseLayout
      title={`Binome ${m.binome}`}
      description={
        <>
          {m.cover
            ? `You're covering ${m.candidates.length} candidate${m.candidates.length === 1 ? "" : "s"} of this binome. You see only those.`
            : m.edit
              ? `Your candidates${m.tag ? ` in ${m.tag}` : ""}, their status and what needs you. Fill in your columns here or in your sheet: both are the same cells.`
              : `Your candidates${m.tag ? ` in ${m.tag}` : ""}, their status and what needs you.`}
          <Members m={m} />
        </>
      }
      actions={
        m.fileUrl && (
          <Button asChild>
            <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
              Open my binome sheet <ArrowUpRight />
            </a>
          </Button>
        )
      }
    >
      {m.status === "PAUSED" && (
        <Note icon={PauseCircle} tone="warning">
          <b className="font-bold">Your binome is paused.</b> It gets no new candidates until an admin resumes it; keep going with the ones you have.
        </Note>
      )}
      {m.fromSheet && (
        <Note icon={Database} tone="info">
          <b className="font-bold">Read straight from your binome sheet.</b> Statuses, alerts and names come from the Master and show here after the script's next sync.
        </Note>
      )}
      {!m.cover && !m.edit && (
        <Note icon={Lock} tone="info">
          <b className="font-bold">You can view your binome for now.</b> Filling it in from here or in your sheet opens once an admin gives your binome edit access.
        </Note>
      )}
      {m.cover && (
        <Note icon={UserRoundCheck} tone="info">
          <b className="font-bold">You're a cover.</b> When the cover ends, these candidates go back to the binome's own members and this page closes.
        </Note>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <ProgressCard m={m} />
        <AlertsCard alerts={m.alerts} fromSheet={m.fromSheet} onOpen={openCode} />
      </div>

      <section aria-labelledby="cand-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="cand-title" className="text-lg font-bold">Candidates</h2>
            <p className="text-sm text-muted-foreground">
              The columns of your sheet. {m.edit ? "Open one to fill in contact, interview, rating and notes" : "Open one for everything they wrote"}; View shows more columns.
            </p>
          </div>
          {m.edit && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PanelRightOpen className="size-3.5" /> Click a code to edit
            </p>
          )}
        </div>
        <CandidatesTable candidates={m.candidates} fromSheet={m.fromSheet} onOpen={openCode} />
      </section>

      <CandidateSheet candidate={candidate} candidates={m.candidates} fileUrl={m.fileUrl} editable={m.edit && !m.cover} onClose={() => setOpen(null)} />
    </BaseLayout>
  )
}
