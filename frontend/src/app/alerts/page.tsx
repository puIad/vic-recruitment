import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { BellOff, CheckCheck, CircleCheck, Search, Send, ThumbsDown, ThumbsUp, Wrench, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useIsMobile } from "@/hooks/use-mobile"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { repairOf, useQuick } from "@/lib/vic/quick"
import { alertLabel, SEVERITY } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import type { Alert, HeldAlert } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { useAlertView } from "@/lib/vic/pending"
import { AlertDetail } from "./components/alert-detail"
import { InlineDrop, PendingMark } from "./components/pending-mark"
import { nudgeable, REVIEW } from "./components/alert-kinds"
import { RowQuickButton, SnoozeMenu, UnmuteButton } from "./components/quick-actions"

type Filter = "ALL" | "HIGH" | "MEDIUM" | "INFO" | "EDITS" | "MUTED"
const NONE: Alert[] = []
const NO_HELD: HeldAlert[] = []

/**
 * Alerts as an inbox: the template's Mail layout (list left, reading pane right). Same data and same fixes as the
 * old Alerts tab: filter by severity or manual edits, search, select several, Mark resolved / Accept edits.
 */
export default function AlertsPage() {
  // the snapshot with the author's pending changes over it (lib/vic/pending.ts)
  const { alerts, muted, counts, marks } = useAlertView()
  const loading = useVic((s) => !s.state)
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs), runs = (a: string) => jobs.some((j) => j.action === a)
  const { resolve, editAccept } = useActions()
  const quick = useQuick()
  const isMobile = useIsMobile()
  const [params, setParams] = useSearchParams()

  const [filter, setFilter] = React.useState<Filter>("ALL")
  const [q, setQ] = React.useState(params.get("q") || "") // the binome page links here with its code
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const activeId = params.get("id")
  // ?type=A,B narrows the inbox to those kinds of alert (the Overview's to-do rows link here with it)
  const typeParam = params.get("type")
  const types = React.useMemo(() => (typeParam ? new Set(typeParam.split(",")) : null), [typeParam])
  const ofType = React.useCallback((a: Alert | HeldAlert) => !types || types.has(a.type), [types])
  const typed = React.useMemo(() => (types ? alerts.filter(ofType) : alerts), [alerts, types, ofType])
  const typedCounts = React.useMemo(() => {
    if (!types) return counts
    const c = { HIGH: 0, MEDIUM: 0, INFO: 0 }
    typed.forEach((a) => c[a.severity]++)
    return c
  }, [types, typed, counts])

  const editCount = typed.filter((a) => a.type === "MANUAL_EDIT").length
  const matches = React.useCallback(
    (a: Alert | HeldAlert) => {
      const s = q.trim().toLowerCase()
      return ofType(a) && (!s || `${a.id} ${a.type} ${alertLabel(a.type)} ${a.code} ${a.binome} ${a.msg}`.toLowerCase().includes(s))
    },
    [q, ofType]
  )
  const isMuted = filter === "MUTED"
  const shown = React.useMemo(
    () => (isMuted ? NONE : alerts.filter((a) => (filter === "ALL" || (filter === "EDITS" ? a.type === "MANUAL_EDIT" : a.severity === filter)) && matches(a))),
    [alerts, filter, isMuted, matches]
  )
  const shownMuted = React.useMemo(() => (isMuted ? muted.filter(matches) : NO_HELD), [muted, isMuted, matches])
  const shownIds = isMuted ? shownMuted.map((a) => a.id) : shown.map((a) => a.id)

  // keep the selection to alerts that still exist (they leave the screen when resolved)
  const liveIds = React.useMemo(() => new Set((isMuted ? muted : alerts).map((a) => a.id)), [alerts, muted, isMuted])
  if (!Array.from(selected).every((i) => liveIds.has(i))) setSelected(new Set(Array.from(selected).filter((i) => liveIds.has(i))))

  const active = alerts.find((a) => a.id === activeId) || null
  // a deep link (?id=) or the bell can open an alert that sits far down the list: bring its row into view
  React.useEffect(() => {
    if (activeId) document.querySelector("[aria-current=true]")?.scrollIntoView({ block: "nearest" })
  }, [activeId, shown.length, loading])
  const open = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set("id", id)
    else next.delete("id")
    setParams(next, { replace: true })
  }
  const clearTypes = () => {
    const next = new URLSearchParams(params)
    next.delete("type")
    setParams(next, { replace: true })
    clear()
  }
  // with an alert open, up/down walk the list instead of scrolling it (typing fields and menus keep their arrows)
  React.useEffect(() => {
    if (!activeId || isMuted) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable], [role=menu], [role=listbox], [role=combobox]")) return
      const i = shown.findIndex((a) => a.id === activeId)
      const next = shown[i + (e.key === "ArrowDown" ? 1 : -1)]
      if (i < 0) return
      e.preventDefault()
      if (next) open(next.id)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id))
  const someShown = shownIds.some((id) => selected.has(id))
  const picked = isMuted ? NONE : alerts.filter((a) => selected.has(a.id))
  const selectedEdits = picked.filter((a) => a.fix.includes("accept"))
  // bulk quick actions: only offered when every selected alert takes them
  const canNudge = picked.length > 0 && picked.every(nudgeable)
  const canRepair = picked.length > 0 && picked.every((a) => !!repairOf(a))
  const canDecline = picked.length > 0 && picked.every((a) => REVIEW.includes(a.type))
  const canApprove = canDecline && picked.every((a) => a.type === "NEEDS_REVIEW")
  const clear = () => setSelected(new Set())

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-4 pb-3" data-tour="alerts-toolbar">
        <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1.5">
          {(
            [
              ["ALL", "All", typed.length],
              ["HIGH", "High", typedCounts?.HIGH || 0],
              ["MEDIUM", "Medium", typedCounts?.MEDIUM || 0],
              ["INFO", "Info", typedCounts?.INFO || 0],
              ["EDITS", "Manual edits", editCount],
              ["MUTED", "Muted", types ? muted.filter(ofType).length : muted.length],
            ] as const
          ).filter(([v, , n]) => v !== "MUTED" || n > 0 || filter === "MUTED").map(([v, label, n]) => (
            <button
              key={v}
              type="button"
              aria-pressed={filter === v}
              onClick={() => { setFilter(v); clear() }}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors",
                filter === v ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
              )}
            >
              {label}
              <span className="num text-xs font-bold opacity-80">{n}</span>
            </button>
          ))}
        </div>
        {types && (
          <p className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Only</span>
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-accent py-0.5 pl-3 pr-1 font-semibold text-accent-foreground" title={[...types].map(alertLabel).join(", ")}>
              <span className="truncate">{types.size === 1 ? alertLabel([...types][0]) : `${types.size} kinds of alert`}</span>
              <button type="button" onClick={clearTypes} aria-label="Show every kind of alert" className="flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-background/70">
                <X className="size-3.5" />
              </button>
            </span>
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, binome, text" aria-label="Search alerts" className="h-10 rounded-full pl-9" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-y bg-muted/40 px-4 py-2">
        <Checkbox
          checked={allShown ? true : someShown ? "indeterminate" : false}
          onCheckedChange={(c) => setSelected((cur) => { const n = new Set(cur); shownIds.forEach((id) => (c ? n.add(id) : n.delete(id))); return n })}
          aria-label="Select all shown"
        />
        <span className="whitespace-nowrap text-sm text-muted-foreground">{selected.size ? `${selected.size} selected` : `${shownIds.length} shown`}</span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {isMuted ? (
            <UnmuteButton ids={Array.from(selected)} onDone={clear} />
          ) : (
            <>
          {canNudge && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await quick.mail(picked.map((a) => a.id), "binome")) clear() }} title="One email per binome, listing its selected alerts">
              <Send /> Nudge
            </Button>
          )}
          {canRepair && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await quick.repair(picked)) clear() }} title="Let the script repair every selected sheet problem">
              <Wrench /> Repair
            </Button>
          )}
          {canApprove && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await quick.approve(picked)) clear() }} title="Send every selected application to a binome">
              <ThumbsUp /> Approve
            </Button>
          )}
          {canDecline && (
            <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await quick.decline(picked)) clear() }} title="Keep every selected application out">
              <ThumbsDown /> Decline
            </Button>
          )}
          {picked.length > 0 && <SnoozeMenu alerts={picked} onDone={clear} />}
          {editCount > 0 && (!picked.length || selectedEdits.length > 0) && (
            <Button size="sm" variant="outline" disabled={busy || !selectedEdits.length} onClick={async () => { if (await editAccept(selectedEdits.map((a) => a.id))) setSelected(new Set()) }} title="Take the selected manual edits as they are now">
              {runs("editAccept") ? <Spinner /> : <CheckCheck />} Accept edits
            </Button>
          )}
          <Button size="sm" disabled={busy || !selected.size} onClick={async () => { if (await resolve(Array.from(selected))) setSelected(new Set()) }}>
            {runs("resolve") ? <Spinner /> : <CircleCheck />} Mark resolved
          </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : isMuted ? (
          shownMuted.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">{muted.length ? "Nothing fits this search." : "Nothing is snoozed or muted."}</p>
          ) : (
            <ul className="divide-y">
              {shownMuted.map((a) => (
                <li key={a.id} className={cn("flex gap-3 px-4 py-3", selected.has(a.id) && "bg-accent/40", marks[a.id]?.kind === "dropped" && "bg-warning-soft/30")}>
                  <Checkbox className="mt-1" checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${alertLabel(a.type)} ${a.code || a.binome}`} />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
                        <BellOff className="size-3" /> {a.status === "MUTED" ? "Muted" : `Until ${a.until}`}
                      </span>
                      <span className="truncate text-sm font-bold">{alertLabel(a.type)}</span>
                      <PendingMark mark={marks[a.id]} />
                      <span className="num ml-auto shrink-0 text-xs text-muted-foreground">{a.created}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{a.msg}</span>
                    <InlineDrop mark={marks[a.id]} />
                  </div>
                  <UnmuteButton ids={[a.id]} />
                </li>
              ))}
            </ul>
          )
        ) : shown.length === 0 ? (
          <div className="relative flex min-h-64 flex-col items-center justify-center gap-2 overflow-hidden p-8 text-center">
            <RingSlot tone="soft" className="absolute -bottom-32 -right-24 w-72" />
            <span className="relative flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <CircleCheck className="size-6" />
            </span>
            <p className="relative text-xl font-extrabold text-heading">{alerts.length ? "No match" : "All clear"}</p>
            <p className="relative max-w-xs text-sm text-muted-foreground">{alerts.length ? "Nothing fits this filter." : "No open alerts right now. New ones appear here as the script finds them."}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {shown.map((a) => {
              const sev = SEVERITY[a.severity]
              const on = a.id === activeId
              return (
                <li key={a.id} className={cn("flex scroll-my-3 gap-3 px-4 py-3 transition-colors", on ? "bg-accent" : "hover:bg-muted/50", selected.has(a.id) && !on && "bg-accent/40", marks[a.id]?.kind === "dropped" && !on && "bg-warning-soft/30")}>
                  <Checkbox className="mt-1" checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${alertLabel(a.type)} ${a.code || a.binome}`} />
                  <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => open(a.id)} className="block w-full min-w-0 text-left" aria-current={on ? "true" : undefined}>
                    <span className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", sev.tone)}>{sev.label}</span>
                      <span className="truncate text-sm font-bold">{alertLabel(a.type)}</span>
                      <PendingMark mark={marks[a.id]} />
                      <span className="num ml-auto shrink-0 text-xs text-muted-foreground">{a.created}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{a.msg}</span>
                    {(a.code || a.binome) && (
                      <span className="mt-1.5 flex gap-1.5 text-xs font-semibold text-primary">
                        {a.code && <span className="rounded-full bg-secondary px-2 py-0.5">{a.code}</span>}
                        {a.binome && <span className="rounded-full bg-secondary px-2 py-0.5">{a.binome}</span>}
                      </span>
                    )}
                  </button>
                  <InlineDrop mark={marks[a.id]} />
                  </div>
                  <RowQuickButton alert={a} onOpen={() => open(a.id)} />
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )

  return (
    <BaseLayout title="Alerts" description="What the script found that needs a person, worst first." watermark="Alerts">
      <div className="h-[calc(100svh-15rem)] min-h-[34rem] overflow-hidden rounded-2xl border bg-card">
        {isMobile ? (
          <>
            {list}
            <Sheet open={!!active} onOpenChange={(o) => !o && open(null)}>
              <SheetContent side="bottom" className="max-h-[88svh] overflow-auto rounded-t-3xl p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Alert</SheetTitle>
                  <SheetDescription>Alert details and actions</SheetDescription>
                </SheetHeader>
                <AlertDetail alert={active} />
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={46} minSize={32}>
              {list}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={54} minSize={34}>
              <ScrollArea className="h-full">
                <AlertDetail alert={active} />
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </BaseLayout>
  )
}
