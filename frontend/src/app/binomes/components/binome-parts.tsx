import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowRightLeft, Building2, CalendarClock, CircleCheck, Clock, ExternalLink, KeyRound, MoreHorizontal, MoveRight, PauseCircle, PlayCircle, Repeat, UsersRound } from "lucide-react"

import { MailsSection } from "@/components/mail-log"
import { MemberName } from "@/components/member-name"
import { PendingMark } from "@/app/alerts/components/pending-mark"
import { RowQuickButton } from "@/app/alerts/components/quick-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useActions } from "@/lib/vic/actions"
import { mailKind, type MailLogOut } from "@/lib/vic/mail-log"
import { alertLabel, BINOME_STATUS, initials, pct, SEVERITY, STAGES } from "@/lib/vic/format"
import { pausedLabel } from "@/lib/vic/pause"
import type { BinomeRow } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Alert } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { ACCESS_BADGE } from "./access-badge"
import type { BinomeDialogs } from "./binome-dialogs"

/** The binome's own pipeline: candidates start at Assigned, there is no Unassigned step. */
const MEMBER_STAGES = STAGES.filter((s) => s.key !== "UNASSIGNED")

/* ---------- the header's actions ---------- */

/**
 * Pause / Resume and Open sheet as buttons, the rest in a ... menu preset to this binome. Each opens the dialog the Binomes row
 * menu opens. A binome whose pause is still pending can't be paused or resumed again until it lands.
 */
export function BinomeActions({ b, dialogs, compact }: { b: BinomeRow; dialogs: BinomeDialogs; compact?: boolean }) {
  const openSheet = useUi((s) => s.openMemberSheet)
  const openMove = useUi((s) => s.openMoveDialog)
  const locked = b.status !== "DRAFT"
  const size = compact ? "sm" : "default"
  const pending = b.mark?.kind === "pending"
  return (
    <>
      {b.status === "ACTIVE" && (
        <Button size={size} variant="secondary" disabled={pending} onClick={() => dialogs.pause(b, "pause")}>
          <PauseCircle /> Pause
        </Button>
      )}
      {b.status === "PAUSED" && (
        <Button size={size} disabled={pending} onClick={() => dialogs.pause(b, "resume")}>
          <PlayCircle /> Resume now
        </Button>
      )}
      {b.fileUrl && (
        <Button asChild size={size} variant="outline">
          <a href={b.fileUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open sheet
          </a>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={compact ? "icon-sm" : "icon"} variant="outline" aria-label={`More actions for ${b.code}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuItem className="cursor-pointer" onSelect={() => dialogs.tag(b)}>
            <Building2 /> Change department…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!locked || !b.fileUrl} className="cursor-pointer" onSelect={() => dialogs.access(b)}>
            <KeyRound /> Sheet &amp; dashboard access…
          </DropdownMenuItem>
          {b.status === "PAUSED" && (
            <DropdownMenuItem disabled={pending} className="cursor-pointer" onSelect={() => dialogs.pause(b, "date")}>
              <CalendarClock /> Change resume date…
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openSheet({ mode: "replace", binome: b.code })}>
            <Repeat /> Replace a member…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openSheet({ mode: "swap", binome: b.code })}>
            <ArrowRightLeft /> Swap with another binome…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openMove({ binome: b.code })}>
            <MoveRight /> Move an interviewee here…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openSheet({ mode: "cover", binome: b.code })}>
            <UsersRound /> Add a cover…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

/** Status, department and access, on one line. */
export function StatusLine({ b }: { b: BinomeRow }) {
  const s = BINOME_STATUS[b.status]
  const badge = ACCESS_BADGE[b.access || ""]
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn("size-2.5 rounded-full", s.dot)} aria-hidden="true" />
      <span className="font-semibold text-foreground">{b.status === "PAUSED" ? pausedLabel(b.pausedUntil) : s.label}</span>
      <PendingMark mark={b.mark} />
      {b.tag && <span>· {b.tag === "ALL" ? "takes any department" : b.tag}</span>}
      {badge && b.status !== "DRAFT" && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.tone)}>{badge.label}</span>}
    </span>
  )
}

/* ---------- the notes ---------- */

export function PausedNote({ b, dialogs }: { b: BinomeRow; dialogs: BinomeDialogs }) {
  if (b.status !== "PAUSED") return null
  return (
    <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm">
      <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <b className="font-bold">{pausedLabel(b.pausedUntil)}.</b> It gets no new candidates and keeps the ones it has. Timing alerts keep running.
        <button type="button" className="ml-2 font-bold text-primary hover:underline disabled:opacity-50" disabled={b.mark?.kind === "pending"} onClick={() => dialogs.pause(b, "date")}>
          Change resume date
        </button>
      </p>
    </div>
  )
}

export function DraftNote() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p>
        <b className="font-bold">Not locked yet.</b> This binome has no sheet, no candidates and no alerts until Lock. Pairing stays in the Pairing panel on the Binomes page.
      </p>
    </div>
  )
}

/* ---------- members and covers ---------- */

function PersonRow({ name, detail, children }: { name: string; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-vic-aqua text-xs font-bold text-vic-ink" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold"><MemberName name={name} /></p>
        {detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
      </div>
      {children}
    </li>
  )
}

export function MembersCard({ b, className }: { b: BinomeRow; className?: string }) {
  const covers = (useVic((s) => s.state?.covers) ?? []).filter((c) => c.binome === b.code)
  const sharing = useVic((s) => !!s.state?.settings.shareFiles)
  const busy = useVic((s) => s.busy)
  const { endCover } = useActions()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Members and covers</CardTitle>
      </CardHeader>
      <CardContent>
        {b.people.length + covers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody in this binome yet.</p>
        ) : (
          <ul className="divide-y">
            {b.people.map((p) => (
              <PersonRow key={p.email} name={p.name || p.email} detail={p.name ? p.email : undefined} />
            ))}
            {covers.map((c) => (
              <PersonRow key={c.row} name={c.name} detail={`Covers ${c.live.join(", ") || "nothing left"}${c.outName ? ` instead of ${c.outName}` : ""}${c.reason ? ` · ${c.reason}` : ""}`}>
                <Badge variant="info">Cover</Badge>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => endCover(c, sharing)}>
                  End
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- progress ---------- */

/** Where the binome's candidates stand, from what the dashboard already holds. coming: the next interviews too. */
export function ProgressCard({ b, coming, className }: { b: BinomeRow; coming?: boolean; className?: string }) {
  const all = useVic((s) => s.state?.interviewees)
  const tz = useVic((s) => s.state?.settings.tz)
  const loadedAt = useVic((s) => s.loadedAt)
  const mine = React.useMemo(() => (all ?? []).filter((i) => i.binome === b.code), [all, b.code])
  const n = (k: string) => mine.filter((i) => i.status === k).length
  const now = loadedAt - 36e5 // as of the last poll; an interview that started within the hour still counts as coming up
  const next = mine.filter((i) => i.at && i.at >= now && i.status !== "INTERVIEWED" && i.status !== "WITHDRAWN").sort((x, y) => x.at! - y.at!).slice(0, 4)
  const denom = b.assigned - b.withdrew
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Progress</CardTitle>
        <CardDescription>
          {b.interviewed} of {denom} interviewed ({pct(b.interviewed, denom)}%)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-baseline gap-3">
          <span className="num text-5xl font-extrabold leading-none tracking-tight text-heading">{mine.length}</span>
          <span className="font-medium text-muted-foreground">{mine.length === 1 ? "candidate" : "candidates"}</span>
        </div>
        {mine.length > 0 && (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={MEMBER_STAGES.map((x) => `${x.label} ${n(x.key)}`).join(", ")}>
              {MEMBER_STAGES.map((x) =>
                n(x.key) ? <i key={x.key} className="block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * n(x.key)) / mine.length}%`, background: x.color }} title={`${x.label}: ${n(x.key)}`} /> : null
              )}
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
              {MEMBER_STAGES.map((x) => (
                <div key={x.key} className="min-w-0">
                  <dt className="flex items-center gap-1.5 truncate text-xs font-semibold">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />
                    {x.label}
                  </dt>
                  <dd className={cn("num text-2xl leading-tight", n(x.key) ? "font-extrabold" : "font-bold text-muted-foreground/60")}>{n(x.key)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {coming && (
          <div className="border-t pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <CalendarClock className="size-4 text-primary" /> Coming up
            </h3>
            {next.length ? (
              <ul className="divide-y">
                {next.map((i) => (
                  <li key={i.code} className="flex items-center gap-3 py-2 text-sm">
                    <span className="num w-32 shrink-0 font-semibold">{new Date(i.at!).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <b className="text-primary">{i.code}</b> {i.name}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No interview planned.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- alerts ---------- */

/** One row per alert with the inbox's row button; onOpen shows its quick fix (Fix, Compare and Review open it too). */
export function AlertRows({ alerts, onOpen }: { alerts: Alert[]; onOpen: (id: string) => void }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
          <CircleCheck className="size-5" />
        </span>
        <div>
          <p className="font-extrabold text-heading">All clear</p>
          <p className="text-sm text-muted-foreground">Nothing open on this binome.</p>
        </div>
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {alerts.map((a) => (
        <li key={a.id} className="flex items-start gap-2 py-2.5">
          <button type="button" onClick={() => onOpen(a.id)} className="min-w-0 flex-1 rounded-lg text-left hover:bg-accent/60">
            <span className="flex items-center gap-2">
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", SEVERITY[a.severity].tone)}>{SEVERITY[a.severity].label}</span>
              {a.code && <b className="shrink-0 text-sm text-primary">{a.code}</b>}
              <span className="truncate text-sm font-bold">{alertLabel(a.type)}</span>
            </span>
            <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{a.msg}</span>
          </button>
          <RowQuickButton alert={a} onOpen={() => onOpen(a.id)} />
        </li>
      ))}
    </ul>
  )
}

/** The alerts card: the header counts them and links to the inbox, where several can be picked at once. */
export function AlertsCard({ code, alerts, onOpen, className }: { code: string; alerts: Alert[]; onOpen: (id: string) => void; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">
          Open alerts <Badge variant="secondary" className="num ml-1">{alerts.length}</Badge>
        </CardTitle>
        <CardDescription>
          Worst first. Several at once:{" "}
          <Link to={`/alerts?q=${encodeURIComponent(code)}`} className="font-semibold text-primary hover:underline">
            the inbox
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[26rem] overflow-y-auto">
        <AlertRows alerts={alerts} onOpen={onOpen} />
      </CardContent>
    </Card>
  )
}

/** The mails to this binome's members and covers, and the newest one in the header (docs/admin-features.md, Email and notification status). */
export function MailsCard({ code, className }: { code: string; className?: string }) {
  const [last, setLast] = React.useState<MailLogOut["last"]>(null)
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Mails</CardTitle>
        <CardDescription>{last ? `Last mail: ${mailKind(last.kind)}, ${last.outcome.toLowerCase()}, ${last.when}` : "What the script mailed to its members and covers."}</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[26rem] overflow-y-auto">
        <MailsSection key={code} scope={{ binome: code }} onLoad={(d) => setLast(d.last)} />
      </CardContent>
    </Card>
  )
}
