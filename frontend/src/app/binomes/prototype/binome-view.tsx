// PROTOTYPE for https://github.com/puIad/vic-recruitment/issues/171 (throwaway, mock data only, never merged).
// One binome's panel and page, as grilled on the issue. Rewrite properly when it is built.
import * as React from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, ArrowRightLeft, Building2, CalendarClock, ChevronLeft, ChevronRight, CircleCheck, Clock, ExternalLink, FlaskConical, KeyRound, Maximize2, MoreHorizontal, MoveRight, PauseCircle, PenLine, PlayCircle, RotateCw, Repeat, UserRoundCheck, UsersRound } from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { MemberName, MemberNames } from "@/components/member-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { AlertDetail } from "@/app/alerts/components/alert-detail"
import { RowQuickButton } from "@/app/alerts/components/quick-actions"
import { CandidateSheet, CandidatesTable } from "@/app/my-binome/components/candidates"
import { describe, fromIv, KINDS, outcome, timeKey, type Kind } from "@/app/settings/history/page"
import { call } from "@/lib/vic/api"
import { useActions } from "@/lib/vic/actions"
import { alertLabel, BINOME_STATUS, cellText, initials, pct, SEVERITY, STAGES } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Alert, Binome, Candidate, MemberState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { ACCESS_BADGE } from "../components/access-badge"
import { AccessDialog } from "../components/access-dialog"
import { TagDialog } from "../components/tag-dialog"
import { protoTarget } from "./target"

const MEMBER_STAGES = STAGES.filter((s) => s.key !== "UNASSIGNED")
const stub = (what: string) => toast(`Prototype: ${what}`, { description: "Decided on the map, not built. Nothing was written." })

/* ---------- the state bar: scenarios the mock doesn't hold, in the URL (?state=) and nowhere else ---------- */

const SCENARIOS = [
  { key: "", label: "As the mock has it" },
  { key: "paused", label: "Paused" },
  { key: "until", label: "Paused until a date" },
  { key: "draft", label: "Draft (before Lock)" },
] as const

function useScenario(b: Binome | undefined): Binome | undefined {
  const [params] = useSearchParams()
  const s = params.get("state")
  return React.useMemo(() => {
    if (!b) return b
    if (s === "paused" || s === "until") return { ...b, status: "PAUSED" as const }
    if (s === "draft") return { ...b, status: "DRAFT" as const, fileUrl: "", assigned: 0, interviewed: 0, withdrew: 0, open: 0 }
    return b
  }, [b, s])
}

export function PrototypeBar({ code }: { code: string }) {
  const [params, setParams] = useSearchParams()
  const cur = SCENARIOS.findIndex((x) => x.key === (params.get("state") ?? ""))
  const go = React.useCallback(
    (d: number) => {
      const n = new URLSearchParams(window.location.search), next = SCENARIOS[(Math.max(cur, 0) + d + SCENARIOS.length) % SCENARIOS.length]
      if (next.key) n.set("state", next.key)
      else n.delete("state")
      setParams(n, { replace: true })
    },
    [cur, setParams]
  )
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, [contenteditable]")) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])
  if (!import.meta.env.DEV) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 py-1 pl-3 pr-1 text-sm text-white shadow-xl">
      <FlaskConical className="size-4 text-amber-300" aria-hidden="true" />
      <span className="mr-1 hidden font-semibold sm:inline">Prototype #171 · {code}</span>
      <button type="button" onClick={() => go(-1)} aria-label="Previous state" className="rounded-full p-1.5 hover:bg-white/15"><ChevronLeft className="size-4" /></button>
      <span className="min-w-36 text-center">{SCENARIOS[Math.max(cur, 0)].label}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next state" className="rounded-full p-1.5 hover:bg-white/15"><ChevronRight className="size-4" /></button>
    </div>
  )
}

/* ---------- actions: the header's two buttons and the ... menu ---------- */

type Dialogs = { access: (b: Binome) => void; tag: (b: Binome) => void }

function PauseDialog({ b, open, onClose }: { b: Binome; open: boolean; onClose: () => void }) {
  const [, setParams] = useSearchParams()
  const list = useVic((s) => s.state?.interviewees) ?? []
  const free = list.filter((i) => i.binome === b.code && i.status === "ASSIGNED" && (!i.contacted || i.contacted === "Not yet"))
  const others = useVic((s) => s.state?.binomes.some((x) => x.code !== b.code && x.status === "ACTIVE" && x.tag === b.tag))
  const [reason, setReason] = React.useState("")
  const [until, setUntil] = React.useState("")
  const [ticked, setTicked] = React.useState<Set<string> | null>(null)
  const on = ticked ?? new Set(free.map((i) => i.code))
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pause {b.code}</DialogTitle>
          <DialogDescription>It keeps its interviewees and gets no new ones. Both members are mailed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pause-reason">Reason</Label>
            <Textarea id="pause-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Exams until Tuesday" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pause-until">Resume on (optional, Algiers time)</Label>
            <Input id="pause-until" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          {free.length > 0 && others && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Move the ones not contacted yet to other binomes ({on.size}/{free.length})</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
                {free.map((i) => (
                  <li key={i.code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`mv-${i.code}`}
                      checked={on.has(i.code)}
                      onCheckedChange={() => {
                        const n = new Set(on)
                        if (n.has(i.code)) n.delete(i.code)
                        else n.add(i.code)
                        setTicked(n)
                      }}
                    />
                    <label htmlFor={`mv-${i.code}`} className="truncate"><b className="text-primary">{i.code}</b> {i.name}</label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!reason.trim()}
            onClick={() => {
              setParams((p) => { p.set("state", until ? "until" : "paused"); return p }, { replace: true })
              onClose()
              stub(`${b.code} shows as paused (only in this URL)`)
            }}
          >
            <PauseCircle /> Pause
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Actions({ b, dialogs, compact }: { b: Binome; dialogs: Dialogs; compact?: boolean }) {
  const [, setParams] = useSearchParams()
  const openSheet = useUi((s) => s.openMemberSheet)
  const openMove = useUi((s) => s.openMoveDialog)
  const [pausing, setPausing] = React.useState(false)
  const locked = b.status !== "DRAFT"
  const size = compact ? "sm" : "default"
  return (
    <>
      {locked &&
        (b.status === "PAUSED" ? (
          <Button size={size} onClick={() => { setParams((p) => { p.delete("state"); return p }, { replace: true }); stub(`${b.code} shows as active again (only in this URL)`) }}>
            <PlayCircle /> Resume
          </Button>
        ) : (
          <Button size={size} variant="secondary" onClick={() => setPausing(true)}>
            <PauseCircle /> Pause
          </Button>
        ))}
      {b.fileUrl && (
        <Button asChild size={size} variant="outline">
          <a href={b.fileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Open sheet</a>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={compact ? "icon-sm" : "icon"} variant="outline" aria-label={`More actions for ${b.code}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuItem onSelect={() => dialogs.tag(b)}><Building2 /> Change department…</DropdownMenuItem>
          <DropdownMenuItem disabled={!locked || !b.fileUrl} onSelect={() => dialogs.access(b)}><KeyRound /> Sheet &amp; dashboard access…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!locked} onSelect={() => openSheet({ mode: "replace", binome: b.code })}><Repeat /> Replace a member…</DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} onSelect={() => openSheet({ mode: "swap", binome: b.code })}><ArrowRightLeft /> Swap with another binome…</DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} onSelect={() => openMove({ binome: b.code })}><MoveRight /> Move an interviewee here…</DropdownMenuItem>
          <DropdownMenuItem disabled={!locked} onSelect={() => openSheet({ mode: "cover", binome: b.code })}><UsersRound /> Add a cover…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PauseDialog b={b} open={pausing} onClose={() => setPausing(false)} />
    </>
  )
}

function StatusLine({ b }: { b: Binome }) {
  const [params] = useSearchParams()
  const s = BINOME_STATUS[b.status]
  const badge = ACCESS_BADGE[b.access || ""]
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={cn("size-2.5 rounded-full", s.dot)} aria-hidden="true" />
      <span className="font-semibold text-foreground">{params.get("state") === "until" ? "Paused until 3 Nov 08:00" : s.label}</span>
      {b.tag && <span>· {b.tag === "ALL" ? "takes any department" : b.tag}</span>}
      {badge && b.status !== "DRAFT" && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.tone)}>{badge.label}</span>}
    </span>
  )
}

/* ---------- pieces the panel and the page share ---------- */

function PersonRow({ name, email, children }: { name: string; email?: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-vic-aqua text-xs font-bold text-vic-ink" aria-hidden="true">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold"><MemberName name={name} /></p>
        {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
      </div>
      {children}
    </li>
  )
}

function MembersCard({ b, className }: { b: Binome; className?: string }) {
  const covers = useVic((s) => s.state?.covers)?.filter((c) => c.binome === b.code) ?? []
  const sharing = useVic((s) => !!s.state?.settings.shareFiles)
  const busy = useVic((s) => s.busy)
  const { endCover } = useActions()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Members and covers</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {b.people.map((p) => (
            <PersonRow key={p.email} name={p.name} email={p.email}>
              <Button size="sm" variant="ghost" onClick={() => stub("Correct name or email (#170)")}><PenLine /> Correct</Button>
            </PersonRow>
          ))}
          {covers.map((c) => (
            <PersonRow key={c.row} name={c.name} email={`Covers ${c.live.join(", ") || "nothing left"}${c.outName ? ` instead of ${c.outName}` : ""}${c.reason ? ` · ${c.reason}` : ""}`}>
              <Badge variant="info">Cover</Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => endCover(c, sharing)}>End</Button>
            </PersonRow>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Where its candidates stand, from what the dashboard already holds. coming: the next interviews too. */
function ProgressCard({ b, coming, className }: { b: Binome; coming?: boolean; className?: string }) {
  const all = useVic((s) => s.state?.interviewees)
  const tz = useVic((s) => s.state?.settings.tz)
  const mine = React.useMemo(() => (all ?? []).filter((i) => i.binome === b.code), [all, b.code])
  const n = (k: string) => mine.filter((i) => i.status === k).length
  const [now] = React.useState(Date.now)
  const next = mine.filter((i) => i.at && i.at > now - 36e5 && i.status !== "INTERVIEWED" && i.status !== "WITHDRAWN").sort((x, y) => x.at! - y.at!).slice(0, 4)
  const denom = b.assigned - b.withdrew
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Progress</CardTitle>
        <CardDescription>{b.interviewed} of {denom} interviewed ({pct(b.interviewed, denom)}%)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-baseline gap-3">
          <span className="num text-5xl font-extrabold leading-none tracking-tight text-heading">{mine.length}</span>
          <span className="font-medium text-muted-foreground">{mine.length === 1 ? "candidate" : "candidates"}</span>
        </div>
        {mine.length > 0 && (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={MEMBER_STAGES.map((x) => `${x.label} ${n(x.key)}`).join(", ")}>
              {MEMBER_STAGES.map((x) => (n(x.key) ? <i key={x.key} className="block h-full min-w-1.5 first:rounded-l-full last:rounded-r-full" style={{ width: `${(100 * n(x.key)) / mine.length}%`, background: x.color }} title={`${x.label}: ${n(x.key)}`} /> : null))}
            </div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
              {MEMBER_STAGES.map((x) => (
                <div key={x.key} className="min-w-0">
                  <dt className="flex items-center gap-1.5 truncate text-xs font-semibold"><span className="size-2 shrink-0 rounded-full" style={{ background: x.color }} aria-hidden="true" />{x.label}</dt>
                  <dd className={cn("num text-2xl leading-tight", n(x.key) ? "font-extrabold" : "font-bold text-muted-foreground/60")}>{n(x.key)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {coming && (
          <div className="border-t pt-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarClock className="size-4 text-primary" /> Coming up</h3>
            {next.length ? (
              <ul className="divide-y">
                {next.map((i) => (
                  <li key={i.code} className="flex items-center gap-3 py-2 text-sm">
                    <span className="num w-32 shrink-0 font-semibold">{new Date(i.at!).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="min-w-0 flex-1 truncate"><b className="text-primary">{i.code}</b> {i.name}</span>
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

function AlertRows({ alerts, onOpen }: { alerts: Alert[]; onOpen: (id: string) => void }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><CircleCheck className="size-5" /></span>
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

function useAlertsOf(code: string): Alert[] {
  const all = useVic((s) => s.state?.alerts)
  return React.useMemo(() => (all ?? []).filter((a) => a.binome === code).sort((x, y) => SEVERITY[y.severity].rank - SEVERITY[x.severity].rank), [all, code])
}

function PausedNote({ b }: { b: Binome }) {
  const [params] = useSearchParams()
  if (b.status !== "PAUSED") return null
  return (
    <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm">
      <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <b className="font-bold">Paused{params.get("state") === "until" ? " until 3 Nov 08:00" : ""}.</b> It gets no new candidates and keeps the ones it has. Timing alerts keep running. Reason: exams until Tuesday (mock).
        {params.get("state") === "until" && <button type="button" className="ml-2 font-bold text-primary hover:underline" onClick={() => stub("Change resume date (#169)")}>Change resume date</button>}
      </p>
    </div>
  )
}

function DraftNote() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p><b className="font-bold">Not locked yet.</b> This binome has no sheet and no candidates until Lock. Pairing stays in the Pairing panel on the Binomes page.</p>
    </div>
  )
}

/* ---------- the panel, from the Binomes table ---------- */

export function BinomePanel({ code, onClose, dialogs }: { code: string | null; onClose: () => void; dialogs: Dialogs }) {
  const [params] = useSearchParams()
  const raw = useVic((s) => s.state?.binomes.find((b) => b.code === code))
  const b = useScenario(raw)
  const alerts = useAlertsOf(code ?? "")
  const [alertId, setAlertId] = React.useState<string | null>(null)
  const alert = alerts.find((a) => a.id === alertId) ?? null
  if (alertId && !alert) setAlertId(null) // fixed: back to the list
  const state = params.get("state")
  return (
    <Sheet open={!!code} onOpenChange={(o) => { if (!o) { setAlertId(null); onClose() } }}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {alert ? (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="sr-only">Alert on {code}</SheetTitle>
              <SheetDescription className="sr-only">The quick fix for this alert.</SheetDescription>
              <Button size="sm" variant="ghost" className="w-fit" onClick={() => setAlertId(null)}><ArrowLeft /> Back to {code}</Button>
            </SheetHeader>
            <AlertDetail alert={alert} />
          </>
        ) : b ? (
          <>
            <SheetHeader className="gap-3 border-b p-6">
              <SheetTitle className="text-3xl font-extrabold text-heading">{b.code}</SheetTitle>
              <SheetDescription asChild><div><StatusLine b={b} /></div></SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm"><Link to={`/binomes/${encodeURIComponent(b.code)}${state ? `?state=${state}` : ""}`}><Maximize2 /> Full page</Link></Button>
                <Actions b={b} dialogs={dialogs} compact />
              </div>
            </SheetHeader>
            <div className="space-y-5 p-4">
              <PausedNote b={b} />
              {b.status === "DRAFT" && <DraftNote />}
              <MembersCard b={b} />
              {b.status !== "DRAFT" && (
                <>
                  <ProgressCard b={b} />
                  <Card>
                    <CardHeader><CardTitle className="text-lg font-bold">Open alerts <Badge variant="secondary" className="num ml-1">{alerts.length}</Badge></CardTitle></CardHeader>
                    <CardContent><AlertRows alerts={alerts} onOpen={setAlertId} /></CardContent>
                  </Card>
                </>
              )}
            </div>
          </>
        ) : (
          <SheetHeader className="p-6">
            <SheetTitle>{code}</SheetTitle>
            <SheetDescription>This binome is gone.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ---------- the page ---------- */

/** The binome's copy on open and whenever a snapshot moves; live = read the sheet now. PROTOTYPE call, webRun protoBinomeView. */
function useSlice(code: string, locked: boolean) {
  const built = useVic((s) => s.state?.built ?? s.state?.v)
  const [slice, setSlice] = React.useState<MemberState | null>(null)
  const [readAt, setReadAt] = React.useState(0)
  const [live, setLive] = React.useState(false)
  const [error, setError] = React.useState("")
  const load = React.useCallback(
    async (fresh: boolean) => {
      if (!locked) return
      if (fresh) setLive(true)
      try {
        const out = await call<{ result: MemberState }>("webRun", ["protoBinomeView", { binome: code, live: fresh }])
        setSlice(out.result)
        setReadAt(Date.now())
        setError("")
        if (fresh) toast(`${code}'s sheet read just now`)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        if (fresh) setLive(false)
      }
    },
    [code, locked]
  )
  React.useEffect(() => void load(false), [load, built])
  const patch = React.useCallback((c: string, field: string, value: string | number | boolean) => {
    setSlice((cur) => (cur ? { ...cur, candidates: cur.candidates.map((x) => (cellText(x.Code) === c ? { ...x, [field]: value } : x)) } : cur))
  }, [])
  return { slice, readAt, live, error, load, patch }
}

function ChangesCard({ code, candidates }: { code: string; candidates: Candidate[] }) {
  const members = useVic((s) => s.state?.history)
  const iv = useVic((s) => s.state?.ivHistory)
  const [kind, setKind] = React.useState<Kind | "all">("all")
  const rows = React.useMemo(() => {
    const mine = new Set(candidates.map((c) => cellText(c.Code)))
    return [...(members ?? []), ...(iv ?? []).map(fromIv)]
      .filter((h) => h.binome === code || ((h.type === "MOVED" || h.type === "EDIT") && (h.out.includes(code) || h.codes.some((x) => mine.has(x)))))
      .sort((a, b) => timeKey(b.at).localeCompare(timeKey(a.at)))
      .map((h) => ({ h, d: describe(h) }))
  }, [members, iv, code, candidates])
  const shown = rows.filter((r) => kind === "all" || r.d.kind === kind)
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-bold">Changes</CardTitle>
          <CardDescription>Who joined or left, covers, department, pauses, moves and admin edits. <Link to="/settings/history" className="font-semibold text-primary hover:underline">Full history</Link></CardDescription>
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as Kind | "all")}>
          <SelectTrigger className="w-44" aria-label="Filter changes"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {(Object.keys(KINDS) as Kind[]).map((k) => <SelectItem key={k} value={k}>{KINDS[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {shown.length ? (
          <ul className="divide-y">
            {shown.map(({ h, d }, i) => {
              const o = outcome(h)
              return (
                <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <d.icon className="size-4 shrink-0 text-muted-foreground" />
                  <b className="w-24 shrink-0 font-bold">{d.title}</b>
                  <span className="min-w-0 flex-1 basis-48">{d.what}</span>
                  <Badge variant={o.variant} title={o.detail}>{o.label}</Badge>
                  <span className="num shrink-0 text-xs text-muted-foreground" title={h.by}>{h.at}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No changes of this kind yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function BinomePrototypePage() {
  const { code = "" } = useParams()
  const raw = useVic((s) => s.state?.binomes.find((b) => b.code === code))
  const loaded = useVic((s) => !!s.state)
  const b = useScenario(raw)
  const locked = !!b && b.status !== "DRAFT"
  const { slice, readAt, live, error, load, patch } = useSlice(code, locked)
  const alerts = useAlertsOf(code)
  const covers = useVic((s) => s.state?.covers)
  const myBinome = useVic((s) => (s.member ? s.member.binome : ""))
  const updated = useVic((s) => s.state?.updated)

  const [accessOf, setAccessOf] = React.useState<Binome | null>(null)
  const [tagOf, setTagOf] = React.useState<Binome | null>(null)
  const dialogs = React.useMemo<Dialogs>(() => ({ access: setAccessOf, tag: setTagOf }), [])
  const [openCode, setOpenCode] = React.useState<string | null>(null)
  const [alertId, setAlertId] = React.useState<string | null>(null)
  const alert = alerts.find((a) => a.id === alertId) ?? null
  if (alertId && !alert) setAlertId(null) // fixed: the side panel closes

  // what the details' Save talks to (see target.ts)
  React.useEffect(() => {
    protoTarget.binome = code
    protoTarget.patch = patch
    return () => {
      protoTarget.binome = ""
      protoTarget.patch = null
    }
  }, [code, patch])

  const candidates = slice?.candidates ?? []
  const coveredBy = React.useCallback(
    (c: string) => {
      const cv = covers?.find((x) => x.binome === code && x.live.includes(c))
      return cv ? <Badge variant="info" className="ml-2 shrink-0"><UserRoundCheck className="size-3" /> {cv.name.split(" ")[0]} covers</Badge> : null
    },
    [covers, code]
  )
  const candidate = (openCode && candidates.find((c) => cellText(c.Code) === openCode)) || null

  if (!b) {
    return (
      <BaseLayout title={code} description={loaded ? "No binome with this code." : "Loading…"} watermark="Binome">
        {!loaded && <Skeleton className="h-80 rounded-xl" />}
      </BaseLayout>
    )
  }

  return (
    <BaseLayout
      title={`Binome ${b.code}`}
      watermark="Binome"
      description={
        <>
          <StatusLine b={b} />
          <span className="mt-1 block"><MemberNames names={b.members} empty="No members" /></span>
          {myBinome === b.code && (
            <span className="mt-1 block text-sm">You're in this binome. <Link to="/my-binome" className="font-semibold text-primary hover:underline">Open My binome</Link> for your member view.</span>
          )}
        </>
      }
      actions={<Actions b={b} dialogs={dialogs} />}
    >
      <PausedNote b={b} />
      {b.status === "DRAFT" ? (
        <>
          <DraftNote />
          <MembersCard b={b} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <ProgressCard b={b} coming className="min-w-0 lg:col-span-3" />
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Open alerts <Badge variant="secondary" className="num ml-1">{alerts.length}</Badge></CardTitle>
                <CardDescription>Worst first. Several at once: <Link to={`/alerts?q=${encodeURIComponent(b.code)}`} className="font-semibold text-primary hover:underline">the inbox</Link></CardDescription>
              </CardHeader>
              <CardContent className="max-h-[26rem] overflow-y-auto"><AlertRows alerts={alerts} onOpen={setAlertId} /></CardContent>
            </Card>
          </div>

          <MembersCard b={b} />

          <section aria-labelledby="cand-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="cand-title" className="text-lg font-bold">Candidates</h2>
                <p className="text-sm text-muted-foreground">Every column of the sheet: View shows more. Open one for the details and the binome's columns.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span title="The copy from the last sync, plus dashboard edits">As of {updated || (readAt ? new Date(readAt).toLocaleTimeString("en-GB") : "…")}</span>
                <Button size="sm" variant="outline" disabled={live} onClick={() => load(true)}>
                  <RotateCw className={cn(live && "animate-spin")} /> Read the sheet now
                </Button>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><p>{error}</p></div>
            )}
            {slice ? (
              <CandidatesTable candidates={candidates} fromSheet={false} onOpen={setOpenCode} admin={{ badge: coveredBy }} />
            ) : (
              <Skeleton className="h-80 rounded-xl" />
            )}
          </section>

          <ChangesCard code={b.code} candidates={candidates} />

          <CandidateSheet candidate={candidate} candidates={candidates} fileUrl={b.fileUrl} editable onClose={() => setOpenCode(null)} admin />

          <Sheet open={!!alert} onOpenChange={(o) => !o && setAlertId(null)}>
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
              <SheetHeader className="sr-only">
                <SheetTitle>Alert on {b.code}</SheetTitle>
                <SheetDescription>The quick fix for this alert.</SheetDescription>
              </SheetHeader>
              <AlertDetail alert={alert} />
            </SheetContent>
          </Sheet>
        </>
      )}
      <AccessDialog binome={accessOf} onClose={() => setAccessOf(null)} />
      <TagDialog binome={tagOf} onClose={() => setTagOf(null)} />
      <PrototypeBar code={b.code} />
    </BaseLayout>
  )
}
