"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Command as CommandPrimitive } from "cmdk"
import { Bell, CornerDownLeft, RefreshCw, Search, UserSearch, Users } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { pageIndex } from "@/config/nav"
import { useActions } from "@/lib/vic/actions"
import { alertLabel, STATUS_LABEL } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"
import { MemberNames } from "@/components/member-name"

const Item = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    className={cn(
      "relative flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50",
      className
    )}
    {...props}
  />
)

const Group = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group
    className={cn(
      "px-2 [&:not(:first-child)]:mt-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground",
      className
    )}
    {...props}
  />
)

/** ⌘K: jump to a page, a candidate by code or name, a binome, an alert, or run a safe action. */
export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const state = useVic((s) => s.state)
  const inBinome = useVic((s) => !!s.member)
  const refresh = useVic((s) => s.refresh)
  const { sync } = useActions()
  const [q, setQ] = React.useState("")

  React.useEffect(() => {
    if (!open) setQ("")
  }, [open])

  const go = (url: string) => {
    onOpenChange(false)
    navigate(url)
  }
  const searching = q.trim().length >= 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-[640px] gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl">
        <DialogTitle className="sr-only">Search the control room</DialogTitle>
        <DialogDescription className="sr-only">Jump to a page, candidate, binome or alert, or run an action.</DialogDescription>
        <CommandPrimitive className="flex h-full w-full flex-col overflow-hidden bg-popover text-popover-foreground" loop>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              value={q}
              onValueChange={setQ}
              autoFocus
              placeholder="Search pages, candidates (IT.07), binomes (B.12), alerts…"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandPrimitive.List className="max-h-[420px] overflow-y-auto overflow-x-hidden p-2">
            <CommandPrimitive.Empty className="flex h-20 items-center justify-center text-sm text-muted-foreground">Nothing matches that.</CommandPrimitive.Empty>

            <Group heading="Actions">
              <Item value="sync now actions" onSelect={() => { onOpenChange(false); sync() }}>
                <RefreshCw className="size-4 text-primary" />
                Sync now
              </Item>
              <Item value="refresh reload numbers actions" onSelect={() => { onOpenChange(false); refresh() }}>
                <RefreshCw className="size-4 text-primary" />
                Reload the numbers
              </Item>
            </Group>

            <Group heading="Pages">
              {pageIndex(inBinome).map((p) => (
                <Item key={p.url} value={`${p.title} ${p.group} page`} onSelect={() => go(p.url)}>
                  <p.icon className="size-4 text-muted-foreground" />
                  {p.title}
                </Item>
              ))}
            </Group>

            {searching && state && (
              <>
                <Group heading="Candidates">
                  {state.interviewees.map((i) => (
                    <Item key={i.code} value={`${i.code} ${i.name} ${i.binome} candidate`} onSelect={() => go(`/interviewees?q=${encodeURIComponent(i.code)}`)}>
                      <UserSearch className="size-4 text-muted-foreground" />
                      <span className="font-bold">{i.code}</span>
                      <span className="truncate">{i.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{i.binome || "no binome"} · {STATUS_LABEL[i.status] || i.status}</span>
                    </Item>
                  ))}
                </Group>
                <Group heading="Binomes">
                  {state.binomes.map((b) => (
                    <Item key={b.code} value={`${b.code} ${b.members.join(" ")} ${b.tag} binome`} onSelect={() => go(`/binomes?q=${encodeURIComponent(b.code)}`)}>
                      <Users className="size-4 text-muted-foreground" />
                      <span className="font-bold">{b.code}</span>
                      <span className="truncate"><MemberNames names={b.members} empty="empty" /></span>
                    </Item>
                  ))}
                </Group>
                <Group heading="Alerts">
                  {state.alerts.map((a) => (
                    <Item key={a.id} value={`${a.id} ${a.type} ${alertLabel(a.type)} ${a.code} ${a.binome} ${a.msg} alert`} onSelect={() => go(`/alerts?id=${encodeURIComponent(a.id)}`)}>
                      <Bell className="size-4 text-muted-foreground" />
                      <span className="truncate font-bold">{alertLabel(a.type)}</span>
                      <span className="truncate text-muted-foreground">{a.msg}</span>
                    </Item>
                  ))}
                </Group>
              </>
            )}
          </CommandPrimitive.List>
          <div className="flex items-center gap-4 border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> open</span>
            <span>Type two letters to search candidates, binomes and alerts</span>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  )
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative inline-flex h-9 w-full items-center justify-start gap-2 whitespace-nowrap rounded-full border border-input bg-background px-3.5 py-1 text-sm font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-14 md:w-44 lg:w-64"
    >
      <Search className="size-3.5" />
      <span>Search…</span>
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-0.5 rounded-md border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground sm:flex">
        Ctrl K
      </kbd>
    </button>
  )
}
