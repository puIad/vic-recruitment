"use client"

import * as React from "react"
import { Link } from "react-router-dom"
import { BellRing, CircleCheck, FlaskConical, RefreshCw, SwatchBook } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CommandSearch, SearchTrigger } from "@/components/command-search"
import { ModeToggle } from "@/components/mode-toggle"
import { ActivityList } from "@/components/activity-list"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { alertLabel, SEVERITY } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useAlertView } from "@/lib/vic/pending"
import { useUi } from "@/lib/vic/ui"
import { cn } from "@/lib/utils"
import { togglePinned, useSidebarConfig } from "@/hooks/use-sidebar-config"

/** A gradient arc (charter blue to aquamarine): turns once whenever the Master actually changed, and keeps turning while a refresh runs. */
function MiniRing({ spinning, tick }: { spinning: boolean; tick: number }) {
  return (
    <svg key={tick} viewBox="0 0 24 24" className={cn("size-5", spinning ? "animate-spin" : tick > 0 && "vic-turn")} aria-hidden="true">
      <defs>
        <linearGradient id="mini-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#69c4af" />
          <stop offset="1" stopColor="#127dbb" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#mini-ring)" strokeWidth="3" strokeLinecap="round" strokeDasharray="42 12" />
    </svg>
  )
}

/** A member's live status: click to reload. */
function LiveStatus() {
  const loadedAt = useVic((s) => s.loadedAt)
  const refreshing = useVic((s) => s.refreshing)
  const busy = useVic((s) => s.busy)
  const tick = useVic((s) => s.tick)
  const refresh = useVic((s) => s.refresh)
  // a member's slice carries no "updated": the time this page last read it
  const time = loadedAt ? new Date(loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => !busy && refresh()}
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
          aria-label={`Refresh now. Last updated ${time}`}
        >
          <MiniRing spinning={refreshing} tick={tick} />
          <span className="hidden md:inline">
            <span className="font-bold text-foreground">Live</span> · updated {time}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>What you type in your binome sheet shows here after the script's next sync, within 15 s of it. Click to reload now.</TooltipContent>
    </Tooltip>
  )
}

/** An admin's live status opens this session's Activity (what they ran, errors in red), with Refresh now inside. */
function LiveActivity() {
  const updated = useVic((s) => s.state?.updated)
  const time = updated ? updated.split(" ")[1] : "…"
  const syncEvery = useVic((s) => s.state?.settings.syncEvery)
  const refreshing = useVic((s) => s.refreshing)
  const busy = useVic((s) => s.busy)
  const tick = useVic((s) => s.tick)
  const refresh = useVic((s) => s.refresh)
  const activity = useVic((s) => s.activity)
  const failed = !!activity[0]?.error // the newest action: the dot clears once a retry works
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={`Activity and live status. Last updated ${time}${failed ? ". The last action failed" : ""}`}
        >
          <MiniRing spinning={refreshing} tick={tick} />
          {failed && <span className="absolute left-7 top-1.5 size-2 rounded-full bg-danger ring-2 ring-background" aria-hidden="true" />}
          <span className="hidden md:inline">
            <span className="font-bold text-foreground">Live</span> · updated {time}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-0">
        <div className="border-b px-4 py-3">
          <p className="font-bold">Activity</p>
          <p className="text-xs text-muted-foreground">What you ran in this session</p>
        </div>
        <div className="px-4 py-3">
          <ActivityList activity={activity} />
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">Updated {time}. Master changes show within 15 s; the script syncs every {syncEvery ?? 15} min.</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => refresh()}>
            {refreshing ? <Spinner /> : <RefreshCw />} Refresh
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}


function AlertsBell() {
  const { alerts, counts } = useAlertView() // with the author's pending changes over the snapshot
  const [open, setOpen] = React.useState(false)
  const top = alerts.slice(0, 5)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Open alerts: ${alerts.length}`}>
          <BellRing />
          {alerts.length > 0 && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                counts?.HIGH ? "bg-vic-tangelo text-vic-ink" : "bg-primary text-primary-foreground"
              )}
            >
              {alerts.length > 99 ? "99+" : alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-bold">Open alerts</p>
          <Link to="/alerts" onClick={() => setOpen(false)} className="text-sm font-semibold text-primary hover:underline">
            See all
          </Link>
        </div>
        {top.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
            <CircleCheck className="size-5 text-success" />
            All clear. Nothing needs you right now.
          </div>
        ) : (
          <ul className="max-h-80 divide-y overflow-auto">
            {top.map((a) => (
              <li key={a.id}>
                <Link to={`/alerts?id=${encodeURIComponent(a.id)}`} onClick={() => setOpen(false)} className="block px-4 py-3 transition-colors hover:bg-accent/60">
                  <span className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY[a.severity].tone)}>{SEVERITY[a.severity].label}</span>
                    <span className="truncate text-sm font-bold">{alertLabel(a.type)}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.created}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{a.msg}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SyncButton() {
  const { sync } = useActions()
  const busy = useVic((s) => s.busy)
  const action = useVic((s) => s.busyAction)
  return (
    <Button onClick={sync} disabled={busy} title="Sync the forms into the sheets now" className="shadow-xs">
      {busy && action === "sync" ? <Spinner /> : <RefreshCw />}
      <span className="hidden sm:inline">{busy && action === "sync" ? "Syncing…" : "Sync now"}</span>
    </Button>
  )
}

/** The sidebar toggle's slot. Where the toggle is pinned (app-sidebar), a desktop shows it here only while the sidebar is fully hidden. */
function HeaderSidebarTrigger() {
  const { config } = useSidebarConfig()
  const { open } = useSidebar()
  const pin = togglePinned(config)
  // open or on the icon rail, the pinned toggle sits on the sidebar: the slot and divider here would only leave a gap
  const slot = cn("flex items-center", pin && (open || config.collapsible === "icon") && "md:hidden")
  return (
    <>
      <span className={cn(slot, "-ml-1 size-7 shrink-0")}>
        <SidebarTrigger className={cn(pin && "md:hidden")} />
      </span>
      <Separator orientation="vertical" className={cn(slot, "mx-2 data-[orientation=vertical]:h-4")} />
    </>
  )
}

/** A member's header: no search, alerts bell or Sync (admin tools); live status, palette and theme stay. */
function MemberHeader() {
  const binome = useVic((s) => s.member?.binome)
  const edit = useVic((s) => !!s.member?.edit)
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur-sm">
      <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
        <HeaderSidebarTrigger />
        {binome && (
          <p className="truncate text-sm font-medium text-muted-foreground">
            Binome <b className="font-bold text-foreground">{binome}</b> · {edit ? "you can edit" : "read-only"}
          </p>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <LiveStatus />
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Customize palette and layout" title="Customize" onClick={() => useUi.getState().setCustomizerOpen(true)}>
            <SwatchBook />
          </Button>
          <ModeToggle variant="ghost" />
        </div>
      </div>
    </header>
  )
}

export function SiteHeader() {
  const member = useVic((s) => s.gate.mode === "member")
  return member ? <MemberHeader /> : <AdminHeader />
}

function AdminHeader() {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const testMode = useVic((s) => s.state?.settings.testMode)

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur-sm transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full items-center gap-1 px-4 py-3 lg:gap-2 lg:px-6">
          <HeaderSidebarTrigger />
          <div className="min-w-0 max-w-sm flex-1">
            <SearchTrigger onClick={() => setSearchOpen(true)} />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {testMode && (
              <Link
                to="/settings/sharing"
                className="flex items-center gap-1.5 rounded-full border border-vic-orange/60 bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning sm:px-3"
                title="Emails to anyone but the admins are dropped and binome sheets are not shared"
              >
                <FlaskConical className="size-3.5" />
                <span className="hidden sm:inline">Test mode</span>
                <span className="sr-only sm:hidden">Test mode is on</span>
              </Link>
            )}
            <LiveActivity />
            <AlertsBell />
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label="Customize palette and layout" title="Customize" onClick={() => useUi.getState().setCustomizerOpen(true)}>
              <SwatchBook />
            </Button>
            <ModeToggle variant="ghost" />
            <SyncButton />
          </div>
        </div>
      </header>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  )
}
