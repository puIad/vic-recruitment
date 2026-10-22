import { Link } from "react-router-dom"
import { ArrowRight, ChevronRight, CircleCheck } from "lucide-react"
import { RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { todoRows } from "@/lib/vic/overview"
import { useVic } from "@/lib/vic/store"
import { useAlertView } from "@/lib/vic/pending"
import type { Severity } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const BAR: Record<Severity, string> = { HIGH: "bg-danger", MEDIUM: "bg-warning", INFO: "bg-info" }
const COUNT: Record<Severity, string> = { HIGH: "text-danger", MEDIUM: "text-warning", INFO: "text-info" }

/** What needs a person today, one row per kind, worst first; each row opens its page already filtered. "All clear" is a designed state, not an empty list. */
export function TodoCard({ wide }: { wide?: boolean }) {
  const s = useVic((x) => x.state)
  const { alerts } = useAlertView() // with the author's pending changes over the snapshot
  if (!s) return <Skeleton className="h-72 rounded-xl" />
  const rows = todoRows(s, alerts)

  return (
    <Card className="relative overflow-hidden" data-tour="overview-todo">
      <CardHeader>
        <CardTitle className="text-lg font-bold">To do</CardTitle>
        <CardDescription>{rows.length ? "What needs a person today, worst first" : "Nothing waiting on the team"}</CardDescription>
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
        {rows.length === 0 ? (
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
          <ul className={cn("-mx-2 divide-y", wide && "xl:columns-2 xl:gap-x-10")}>
            {rows.map((r) => (
              <li key={r.key} className="break-inside-avoid">
                <Link to={r.to} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60">
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", BAR[r.tone])} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{r.label}</span>
                    {r.hint && <span className="block truncate text-xs text-muted-foreground">{r.hint}</span>}
                  </span>
                  {r.count !== null && <span className={cn("num shrink-0 text-xl font-extrabold leading-none", COUNT[r.tone])}>{r.count}</span>}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
