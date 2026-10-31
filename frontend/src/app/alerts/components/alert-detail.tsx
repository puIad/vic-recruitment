import { Link } from "react-router-dom"
import { Check, Inbox, RotateCcw, Wrench, UserSearch, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/lib/vic/confirm"
import { FIX_META, useActions } from "@/lib/vic/actions"
import { alertLabel, SEVERITY } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import type { Alert, FixMode } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { QuickActions, SnoozeMenu } from "./quick-actions"
import { MemberNames } from "@/components/member-name"
import { MailsSection } from "@/components/mail-log"

const FIX_ICON: Record<FixMode, typeof Wrench> = { apply: Wrench, revert: RotateCcw, accept: Check }

export function AlertDetail({ alert }: { alert: Alert | null }) {
  const { fixOne, resolve } = useActions()
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs), runs = (a: string) => jobs.some((j) => j.action === a)
  const binome = useVic((s) => (alert ? s.state?.binomes.find((b) => b.code === alert.binome) : undefined))

  if (!alert) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <Inbox className="size-6" />
        </span>
        <p className="text-lg font-bold">Pick an alert</p>
        <p className="max-w-xs text-sm text-muted-foreground">The message, the candidate or binome it concerns, and what you can do about it appear here.</p>
      </div>
    )
  }

  const sev = SEVERITY[alert.severity]
  const isEdit = alert.type === "MANUAL_EDIT"
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", sev.tone)}>{sev.label}</span>
          <span className="ml-auto text-xs text-muted-foreground" title={alert.id}>
            Raised {alert.created}
          </span>
        </div>
        <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-heading">{alertLabel(alert.type)}</h2>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {alert.code && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Candidate</dt>
              <dd>
                <Link to={`/interviewees?q=${encodeURIComponent(alert.code)}`} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
                  <UserSearch className="size-3.5" />
                  {alert.code}
                </Link>
              </dd>
            </div>
          )}
          {alert.binome && (
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground">Binome</dt>
              <dd>
                <Link to={`/binomes/${encodeURIComponent(alert.binome)}`} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
                  <Users className="size-3.5" />
                  {alert.binome}
                </Link>
                {binome && <span className="ml-1.5 text-muted-foreground"><MemberNames names={binome.members} empty="" /></span>}
              </dd>
            </div>
          )}
        </dl>
      </div>
      <Separator />
      <div className="flex-1 space-y-4 p-5">
        <p className="max-w-prose whitespace-pre-line text-[0.95rem] leading-relaxed">{alert.msg}</p>
        {isEdit && alert.fix.length > 0 && (
          <div className="border-t pt-5">
            <p className="font-bold">Someone changed the Master by hand</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose what the script should do about it. Each choice asks for confirmation first.</p>
            <ul className="mt-3 space-y-2">
              {alert.fix.map((f) => {
                const Icon = FIX_ICON[f]
                const running = runs("edit" + f.charAt(0).toUpperCase() + f.slice(1))
                return (
                  <li key={f} className="flex items-center gap-3">
                    <Button size="sm" variant={f === "apply" ? "default" : "outline"} disabled={busy} onClick={() => fixOne(alert, f)} className="shrink-0">
                      {running ? <Spinner /> : <Icon />} {FIX_META[f].label}
                    </Button>
                    <span className="text-sm text-muted-foreground">{FIX_META[f].hint}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <QuickActions key={alert.id} alert={alert} />
        <section aria-label="Mails about this alert" className="space-y-2 border-t pt-5">
          <h3 className="font-bold">Mails about it</h3>
          <MailsSection key={alert.id} scope={{ alertId: alert.id }} />
        </section>
      </div>
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="max-w-xs text-xs text-muted-foreground">Alerts close themselves when the problem goes away. Resolve one to hide it now, or snooze it.</p>
        <div className="flex items-center gap-2">
          {!isEdit && <SnoozeMenu alerts={[alert]} />}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => resolve([alert.id])}>
            {runs("resolve") ? <Spinner /> : <Check />} Mark resolved
          </Button>
        </div>
      </div>
    </div>
  )
}
