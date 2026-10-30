import { Link } from "react-router-dom"
import { ArrowRight, CircleCheck } from "lucide-react"
import { OpenChip } from "@/components/open-chip"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { binomesBehind, interviewedShare } from "@/lib/vic/overview"
import { useVic } from "@/lib/vic/store"
import { MemberNames } from "@/components/member-name"

/** The locked binomes falling behind: most open alerts first, then the lowest share of their candidates interviewed. */
export function BinomesBehind() {
  const s = useVic((x) => x.state)
  if (!s) return <Skeleton className="h-72 rounded-xl" />
  const live = s.binomes.filter((b) => b.status !== "DRAFT")
  const top = binomesBehind(s.binomes)
  const max = Math.max(1, ...top.map((b) => b.assigned))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Binomes behind</CardTitle>
        <CardDescription>
          {!live.length ? "Appears once binomes are locked" : top.length ? "Most open alerts first, then the fewest interviewed" : `All ${live.length} locked binomes are caught up`}
        </CardDescription>
        {live.length > 0 && (
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/binomes">
                All binomes <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {!live.length ? (
          <p className="rounded-xl border-2 border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">No locked binomes yet. Run the launch sequence to create their sheets.</p>
        ) : !top.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-success" /> No open alerts, and everyone still in has been interviewed.
          </p>
        ) : (
          <ul className="xl:columns-2 xl:gap-x-10">
            {top.map((b) => {
              const denom = b.assigned - b.withdrew
              return (
                <li key={b.code} className="mb-3.5 grid break-inside-avoid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto]">
                  <Link to={`/binomes/${encodeURIComponent(b.code)}`} className="text-sm font-bold text-primary hover:underline">
                    {b.code}
                  </Link>
                  <p className="truncate text-sm" title={b.members.join(" & ")}><MemberNames names={b.members} /></p>
                  <span className="num flex items-center justify-end gap-1.5 text-right text-sm">
                    <span>
                      <b>{b.interviewed}</b>
                      <span className="text-muted-foreground">/{denom}</span>
                    </span>
                    {b.open > 0 && <OpenChip code={b.code} open={b.open} />}
                  </span>
                  <div className="col-span-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-2" aria-hidden="true">
                    <div className="h-full overflow-hidden rounded-full bg-primary/20" style={{ width: `${Math.max(8, (b.assigned / max) * 100)}%` }} title={`${b.assigned} candidates`}>
                      <div className="h-full rounded-full bg-vic-ring" style={{ width: `${Math.round(interviewedShare(b) * 100)}%` }} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
