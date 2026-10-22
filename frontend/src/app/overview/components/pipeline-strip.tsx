import { ArrowRight, ArrowUpRight, Inbox } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DotGrid } from "@/components/brand/motifs"
import { STAGES, pct } from "@/lib/vic/format"
import { registrants } from "@/lib/vic/overview"
import { useVic } from "@/lib/vic/store"

/** The pipeline in one compact row: registrants, first choices, the stage bar (hover a stage for its count) and how far the assigned got. Analytics has the full breakdown. */
export function PipelineStrip() {
  const s = useVic((x) => x.state)
  if (!s) return <Skeleton className="h-36 rounded-xl" />

  const st = s.counts.byStatus
  const n = (k: string) => st[k] || 0
  const registered = registrants(st)
  const contacted = n("CONTACTED") + n("SCHEDULED") + n("INTERVIEWED")
  const scheduled = n("SCHEDULED") + n("INTERVIEWED")
  const assigned = registered - n("UNASSIGNED") - n("WITHDRAWN") - n("HELD")
  const total = STAGES.reduce((t, x) => t + n(x.key), 0)
  const deps = Object.entries(s.counts.byDep)

  if (!total)
    return (
      <Card className="py-0">
        <CardContent className="relative isolate flex flex-wrap items-center gap-4 overflow-hidden p-5">
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
        </CardContent>
      </Card>
    )

  const rates = [
    ["contacted", contacted],
    ["scheduled", scheduled],
    ["interviewed", n("INTERVIEWED")],
  ] as const

  return (
    <Card className="py-0">
      <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
        <p className="flex items-baseline gap-2">
          <span className="num text-4xl font-extrabold leading-none tracking-tight text-heading">{registered}</span>
          <span className="text-sm font-medium text-muted-foreground">registrants</span>
        </p>
        <ul className="flex flex-wrap gap-1" aria-label="Registrants by first-choice department">
          {deps.map(([d, c]) => (
            <li key={d} className="flex items-baseline gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
              <b className="num font-bold">{c}</b>
              <span className="text-muted-foreground">{d}</span>
            </li>
          ))}
        </ul>
        <div className="flex h-3 min-w-36 flex-1 basis-36 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={STAGES.map((x) => `${x.label} ${n(x.key)}`).join(", ")}>
          {STAGES.map((x) =>
            n(x.key) ? <i key={x.key} className="block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * n(x.key)) / total}%`, background: x.color }} title={`${x.label}: ${n(x.key)}`} /> : null
          )}
        </div>
        <p className="text-sm text-muted-foreground" title={`Shares of the ${assigned} registrants assigned to a binome`}>
          {rates.map(([label, v], i) => (
            <span key={label} className="whitespace-nowrap">
              {i > 0 && " · "}
              <b className="num text-foreground">{pct(v, assigned)}%</b> {label}
            </span>
          ))}
        </p>
        <Button asChild variant="ghost" size="sm" className="-mx-2">
          <Link to="/analytics">
            Full breakdown <ArrowRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
