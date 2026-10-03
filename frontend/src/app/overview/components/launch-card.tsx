import * as React from "react"
import { Check, Lock, Shuffle, UserPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

/** Import the team, draw the binomes, lock them: the three steps that start the recruitment, in order. */
export function LaunchCard() {
  const s = useVic((x) => x.state)
  const busy = useVic((x) => x.busy)
  const action = useVic((x) => x.busyAction)
  const { importTeam, draft, lock } = useActions()
  const [link, setLink] = React.useState("")
  if (!s) return <Skeleton className="h-72 rounded-xl" />

  const b = s.binomes
  const drafts = b.filter((x) => x.status === "DRAFT").length
  const active = b.filter((x) => x.status === "ACTIVE").length
  const paused = b.filter((x) => x.status === "PAUSED").length
  const done = [s.team.total > 0, drafts > 0 || active > 0, active > 0]
  const current = done.indexOf(false)
  const unpaired = (s.unpaired || []).length
  const running = (a: string) => busy && action === a

  const steps = [
    {
      title: "Import the team",
      icon: UserPlus,
      text: "Reads the OT list into the Team tab: pairing group and Exclude flags.",
      chips: (
        <>
          {s.team.total ? <Badge variant="success">{s.team.total} members</Badge> : <Badge variant="outline">Team tab empty</Badge>}
          {s.team.excluded > 0 && <Badge variant="outline">{s.team.excluded} excluded</Badge>}
          {s.team.issues > 0 && <Badge variant="warning">{s.team.issues} rows to check</Badge>}
        </>
      ),
      extra: (
        <div className="mt-3">
          <Label htmlFor="team-link" className="text-xs font-semibold">
            Team sheet link <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="team-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a Google Sheets link" className="mt-1 h-9" />
          <p className="mt-1 text-xs text-muted-foreground">Left empty, it reads {s.team.source ? `the “${s.team.source}” tab` : "the 2025 database"}.</p>
        </div>
      ),
      button: (
        <Button variant={current === 0 ? "default" : "secondary"} size="sm" disabled={busy} onClick={() => importTeam(link.trim())}>
          {running("importTeam") ? <Spinner /> : <UserPlus />} Import
        </Button>
      ),
    },
    {
      title: "Draft the binomes",
      icon: Shuffle,
      text: s.locked
        ? "Closed once binomes are locked: nobody is paired automatically again. Members left without a binome are listed on the Binomes page for you to place."
        : "Random HR + other-department pairs, written to the Binomes tab as drafts. Edit them freely, redraw any time.",
      chips: s.locked ? (
        <>
          <Badge variant="success">Drafting closed</Badge>
          {unpaired > 0 && <Badge variant="warning">{unpaired} unpaired</Badge>}
        </>
      ) : drafts ? (
        <Badge variant="warning">{drafts} drafts to review</Badge>
      ) : active ? (
        <Badge variant="success">Drafts locked</Badge>
      ) : (
        <Badge variant="outline">No drafts yet</Badge>
      ),
      button: (
        <Button variant={current === 1 ? "default" : "secondary"} size="sm" disabled={busy || s.locked} title={s.locked ? "Closed: binomes are locked, nobody is paired automatically any more" : undefined} onClick={() => draft(drafts)}>
          {running("draft") ? <Spinner /> : <Shuffle />} Draft
        </Button>
      ),
    },
    {
      title: "Lock",
      icon: Lock,
      text: "Creates one sheet per binome, shares it with both members and starts routing registrants to them.",
      chips: (
        <>
          {active ? <Badge variant="success">{active} active</Badge> : <Badge variant="outline">None locked</Badge>}
          {paused > 0 && <Badge variant="outline">{paused} paused</Badge>}
          {s.settings.testMode ? <Badge variant="warning">test mode</Badge> : !s.settings.shareFiles ? <Badge variant="warning">sharing off</Badge> : null}
        </>
      ),
      button: (
        <Button variant={current === 2 ? "default" : "secondary"} size="sm" disabled={busy} onClick={lock}>
          {running("lock") || running("lockCheck") ? <Spinner /> : <Lock />} Lock…
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Launch sequence</CardTitle>
        <CardDescription>Three steps, in order</CardDescription>
        <CardAction>
          <Badge variant="outline" className="num">{done.filter(Boolean).length} / 3</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="space-y-5">
          {steps.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  done[i] ? "bg-vic-aqua text-vic-ink" : i === current ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
                aria-label={done[i] ? "Done" : i === current ? "Next step" : "Later"}
              >
                {done[i] ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={cn("font-bold", i === current && "text-heading")}>{st.title}</p>
                  {st.button}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{st.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{st.chips}</div>
                {st.extra}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
