import * as React from "react"
import { AlertCircle, RotateCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mailKind, readMailLog, type MailLogOut, type MailRow, type MailScope } from "@/lib/vic/mail-log"
import { cn } from "@/lib/utils"

const TONE: Record<string, string> = {
  Failed: "bg-danger-soft text-danger",
  Retrying: "bg-warning-soft text-warning",
  Held: "bg-warning-soft text-warning",
  Resent: "bg-accent text-primary",
  Dismissed: "bg-muted text-muted-foreground",
}

export function OutcomeChip({ outcome }: { outcome: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", TONE[outcome] ?? "bg-success-soft text-success")}>{outcome}</span>
}

function Row({ r }: { r: MailRow }) {
  return (
    <li className="space-y-0.5 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OutcomeChip outcome={r.outcome} />
        <span className="font-semibold">{mailKind(r.kind)}</span>
        <span className="num ml-auto text-xs text-muted-foreground">{r.when}</span>
      </div>
      <p className="[overflow-wrap:anywhere] text-muted-foreground">
        To {r.to} · by {r.by}
      </p>
      {r.error && <p className="[overflow-wrap:anywhere] text-xs text-danger">{r.error}</p>}
    </li>
  )
}

/**
 * The Mail Log for one candidate, binome or alert (docs/admin-features.md, Email and notification status), read when it opens and
 * not polled. Sent means Google accepted the mail; delivery is not confirmed. Key it by what it shows.
 */
export function MailsSection({ scope, onLoad }: { scope: MailScope; onLoad?: (d: MailLogOut) => void }) {
  const [data, setData] = React.useState<MailLogOut | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)
  const key = JSON.stringify(scope)

  React.useEffect(() => {
    let live = true
    readMailLog(JSON.parse(key) as MailScope).then(
      (d) => {
        if (!live) return
        setData(d)
        onLoad?.(d)
      },
      (e: Error) => live && setError(e.message)
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tries])

  if (error)
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-2">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => { setError(""); setTries((n) => n + 1) }}>
            <RotateCw /> Try again
          </Button>
        </div>
      </div>
    )
  if (!data) return <Skeleton className="h-20 rounded-xl" />

  const none = !data.rows.length && !data.older.length && !data.intended
  return (
    <div className="space-y-2">
      {data.rows.length > 0 && <ul className="divide-y rounded-xl border bg-background">{data.rows.map((r) => <Row key={r.id} r={r} />)}</ul>}
      {data.older.length > 0 && (
        <ul className="space-y-1 text-sm">
          {data.older.map((o) => (
            <li key={o.label} className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">older record</Badge>
              <span>
                {o.label}: {o.text}
                {o.date ? `, ${o.date}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.intended && (
        <p className="text-sm">
          <Badge variant="secondary" className="mr-2">intended</Badge>
          Meant for {data.intended}. This alert is older than the log, so what was sent is not recorded.
        </p>
      )}
      {none && <p className="text-sm text-muted-foreground">No mail recorded{data.since ? ` since ${data.since}` : ""}.</p>}
      <p className="text-xs text-muted-foreground">
        Sent means Google accepted the mail; delivery isn&apos;t confirmed. A bounce shows in vic.rh&apos;s inbox.{data.testMode ? " Test mode is on: only admins really receive mail." : ""}
      </p>
    </div>
  )
}
