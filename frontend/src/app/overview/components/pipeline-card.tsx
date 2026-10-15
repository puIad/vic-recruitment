import { ArrowRight, ArrowUpRight, Inbox, ShieldQuestionMark } from "lucide-react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { STAGES, isOut, pct } from "@/lib/vic/format"
import { cn } from "@/lib/utils"
import { DotGrid } from "@/components/brand/motifs"
import { useVic } from "@/lib/vic/store"

/** One object for what the old dashboard spread over six tiles: registrants, their status, and how far they got. */
export function PipelineCard() {
  const s = useVic((x) => x.state)
  if (!s) return <Skeleton className="h-64 rounded-xl" />

  const st = s.counts.byStatus
  const n = (k: string) => st[k] || 0
  const registered = Object.keys(st).reduce((t, k) => t + (isOut(k) ? 0 : st[k]), 0)
  const contacted = n("CONTACTED") + n("SCHEDULED") + n("INTERVIEWED")
  const scheduled = n("SCHEDULED") + n("INTERVIEWED")
  const pending = registered - n("UNASSIGNED") - n("WITHDRAWN") - n("HELD")
  const held = n("HELD")
  const review = s.alerts.find((a) => a.type === "NEEDS_REVIEW")
  const total = STAGES.reduce((t, x) => t + n(x.key), 0)
  const deps = Object.entries(s.counts.byDep)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Pipeline</CardTitle>
        <CardDescription>Where every registrant stands right now</CardDescription>
        <CardAction>
          <Badge variant={s.settings.assignmentsOpen ? "success" : "warning"}>
            {s.settings.assignmentsOpen ? "Assigning new registrants" : "Assignments paused"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-3">
            <span className="num text-6xl font-extrabold leading-none tracking-tight text-heading">{registered}</span>
            <span className="text-base font-medium text-muted-foreground">registrants</span>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Registrants by first-choice department">
            {deps.map(([d, c]) => (
              <li key={d} className="flex items-baseline gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm">
                <b className="num font-bold">{c}</b>
                <span className="text-muted-foreground">{d}</span>
              </li>
            ))}
          </ul>
        </div>

        {(held > 0 || n("DECLINED") > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-warning/30 bg-warning-soft/50 px-4 py-3">
            <ShieldQuestionMark className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm">
              {held > 0 ? (
                <>
                  <b className="num">{held}</b> waiting for review: screening held {held > 1 ? "them" : "it"} for a person to read before any binome sees {held > 1 ? "them" : "it"}.
                </>
              ) : (
                "Nothing waiting for review."
              )}
              {n("DECLINED") > 0 && <span className="text-muted-foreground"> {n("DECLINED")} declined, not counted.</span>}
            </p>
            {held > 0 && (
              <Button asChild size="sm" variant="outline" className="bg-background">
                <Link to={review ? `/alerts?id=${encodeURIComponent(review.id)}` : "/alerts"}>
                  Review <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        )}

        {total ? (
          <div
            className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={STAGES.map((x) => `${x.label} ${n(x.key)}`).join(", ")}
          >
            {STAGES.map((x) =>
              n(x.key) ? <i key={x.key} className="block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * n(x.key)) / total}%`, background: x.color }} title={`${x.label}: ${n(x.key)}`} /> : null
            )}
          </div>
        ) : (
          <div className="relative isolate flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/50 p-4">
            <DotGrid className="-z-10 opacity-25" />
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-primary">
              <Inbox className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">No registrations yet</p>
              <p className="text-sm text-muted-foreground">Registrants appear here as soon as someone fills the registration form. Share it at launch.</p>
            </div>
            {s.links.registrationForm && (
              <Button asChild variant="outline" size="sm">
                <a href={s.links.registrationForm} target="_blank" rel="noopener noreferrer">
                  Open the form <ArrowUpRight />
                </a>
              </Button>
            )}
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
          {STAGES.map((x) => (
            <div key={x.key} className="min-w-0">
              <dt className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />
                {x.label}
              </dt>
              <dd className={cn("num mt-0.5 text-3xl leading-tight", n(x.key) ? "font-extrabold" : "font-bold text-muted-foreground/60")}>{n(x.key)}</dd>
              <dd className="text-xs text-muted-foreground">{x.hint}</dd>
            </div>
          ))}
        </dl>

        <p className="border-t pt-4 text-sm text-muted-foreground">
          Of the <b className="num text-foreground">{pending}</b> assigned: <b className="num text-foreground">{contacted}</b> contacted ({pct(contacted, pending)}%),{" "}
          <b className="num text-foreground">{scheduled}</b> scheduled ({pct(scheduled, pending)}%), <b className="num text-foreground">{n("INTERVIEWED")}</b> interviewed ({pct(n("INTERVIEWED"), pending)}%).
        </p>
      </CardContent>
    </Card>
  )
}
