import { Link } from "react-router-dom"
import { ArrowRight, CircleCheck } from "lucide-react"
import { RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { alertLabel, SEVERITY } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

/** What needs a human right now. "All clear" is a designed state, not an empty list. */
export function AttentionCard() {
  const s = useVic((x) => x.state)
  if (!s) return <Skeleton className="h-72 rounded-xl" />
  const { alerts, alertCounts: ac } = s
  const top = alerts.slice(0, 4)

  return (
    <Card className="relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Needs attention</CardTitle>
        <CardDescription>{alerts.length ? `${alerts.length} open alert${alerts.length > 1 ? "s" : ""}, worst first` : "Nothing waiting on the team"}</CardDescription>
        {alerts.length > 0 && (
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/alerts">
                Open inbox <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="relative flex min-h-44 items-center gap-5 py-2">
            <RingSlot tone="soft" className="absolute -right-24 -top-10 w-64" />
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <CircleCheck className="size-6" />
            </span>
            <div className="relative">
              <p className="text-xl font-extrabold text-heading">All clear</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">No open alerts. The script checks every {s.settings.syncEvery} minutes and will raise one when a candidate falls behind.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="grid grid-cols-3 gap-2">
              {(["HIGH", "MEDIUM", "INFO"] as const).map((k) => (
                <li key={k} className={cn("rounded-xl px-3 py-2", SEVERITY[k].tone)}>
                  <span className="num block text-2xl font-extrabold leading-none">{ac[k] || 0}</span>
                  <span className="text-xs font-semibold">{SEVERITY[k].label}</span>
                </li>
              ))}
            </ul>
            <ul className="divide-y">
              {top.map((a) => (
                <li key={a.id}>
                  <Link to={`/alerts?id=${encodeURIComponent(a.id)}`} className="group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60">
                    <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY[a.severity].tone)}>{SEVERITY[a.severity].label}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{alertLabel(a.type)}</span>
                      <span className="line-clamp-1 block text-sm text-muted-foreground">{a.msg}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{a.code || a.binome}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
