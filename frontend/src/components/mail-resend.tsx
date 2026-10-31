import * as React from "react"
import { AlertCircle, RotateCw, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { OutcomeChip } from "@/components/mail-log"
import { mailKind, readResendPreview, type ResendMail, type ResendOut } from "@/lib/vic/mail-log"
import { useVic } from "@/lib/vic/store"

/**
 * Resend, for a MAIL_FAILED alert: every failed mail, each with its address and error. Resend sends the stored subject and body to
 * the address on the row (fix a wrong one first); a mail gone stale, such as for a deleted candidate, can be dismissed. Drop mails
 * are retried by the next cycle, so they only show.
 */
export function ResendPanel() {
  const run = useVic((s) => s.run)
  const refresh = useVic((s) => s.refresh)
  const busy = useVic((s) => s.busy)
  const [mails, setMails] = React.useState<ResendMail[] | null>(null)
  const [testMode, setTestMode] = React.useState(false)
  const [error, setError] = React.useState("")
  const [to, setTo] = React.useState<Record<string, string>>({})
  const [working, setWorking] = React.useState("")

  const [tries, setTries] = React.useState(0)
  const load = () => {
    setError("")
    setTries((n) => n + 1)
  }
  React.useEffect(() => {
    let live = true
    readResendPreview().then(
      (d) => {
        if (!live) return
        setMails(d.mails)
        setTestMode(d.testMode)
      },
      (e: Error) => live && setError(e.message)
    )
    return () => {
      live = false
    }
  }, [tries])

  const act = async (id: string, args: Record<string, unknown>) => {
    setWorking(id)
    try {
      await run<ResendOut>("mailResend", args, "Resend mail")
      refresh(true)
      load()
    } finally {
      setWorking("")
    }
  }

  if (error)
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-2">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={load}>
            <RotateCw /> Try again
          </Button>
        </div>
      </div>
    )
  if (!mails) return <Skeleton className="h-24 rounded-xl" />
  if (!mails.length) return <p className="text-sm text-muted-foreground">Nothing left to resend. The alert closes at the next sync.</p>

  return (
    <div className="space-y-2">
      {testMode && <p className="text-xs text-warning">Test mode is on: a resend to anyone but an admin is held.</p>}
      <ul className="divide-y rounded-xl border bg-background">
        {mails.map((m) => {
          const address = to[m.id] ?? m.to
          return (
            <li key={m.id} className="space-y-2 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <OutcomeChip outcome={m.retrying ? "Retrying" : m.outcome} />
                <span className="font-semibold">{mailKind(m.kind)}</span>
                {m.concerns && <span className="text-muted-foreground">{m.concerns}</span>}
                <span className="num ml-auto text-xs text-muted-foreground">{m.when}</span>
              </div>
              {m.error && <p className="[overflow-wrap:anywhere] text-xs text-danger">{m.error}</p>}
              {m.retrying ? (
                <p className="text-xs text-muted-foreground">The next cycle retries it; nothing to do.</p>
              ) : m.stale ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Stale: {m.stale}.</span>
                  <Button size="sm" variant="outline" disabled={busy || !!working} onClick={() => act(m.id, { dismiss: [m.id] })}>
                    <Trash2 /> Dismiss
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Address for the ${mailKind(m.kind)} mail`}
                    value={address}
                    onChange={(e) => setTo((cur) => ({ ...cur, [m.id]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 basis-56 bg-background"
                  />
                  <Button size="sm" disabled={busy || !!working || !address.trim()} onClick={() => act(m.id, { send: [{ id: m.id, to: address.trim() }] })}>
                    <Send /> Resend
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy || !!working} onClick={() => act(m.id, { dismiss: [m.id] })}>
                    Dismiss
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">A resend sends the stored subject and text to the address shown and adds its own row to the log.</p>
    </div>
  )
}
