import * as React from "react"
import { AlertTriangle, ChevronDown, Plus, Settings2, SlidersHorizontal, X, type LucideIcon } from "lucide-react"
import { create } from "zustand"

import { BaseLayout } from "@/components/layouts/base-layout"
import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useConfirm, Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useVic } from "@/lib/vic/store"
import { again, REASON, useSettingsView, type Mark } from "@/lib/vic/pending"
import type { CellValue, SettingEntry, SettingRow, WebState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { PendingMark } from "@/app/alerts/components/pending-mark"

import { GROUPS } from "./settings-groups"
import { CHOICES, SETTING_UI, isTrue, mailProblemFor, type Choice, type Control, type SettingUi } from "@/lib/vic/settings-ui"

export interface SettingsSection {
  /** no title: one plain card, as a page with a single list */
  title?: string
  description?: string
  keys: string[]
  /** folded shut until opened */
  folded?: boolean
  /** also takes every setting no group lists, so a new one is never hidden */
  rest?: boolean
}

export interface SettingsGroup {
  title: string
  description: string
  sections: SettingsSection[]
  /** keys the page shows in its own cards (the test-mode card, the members sheet card) */
  own?: string[]
  /** also edits every MAIL_* text (the Emails page draws them itself) */
  mail?: boolean
}

/** What a page's own cards get: a row's draft value, a change, its pending mark, and a save of some edits right now. */
export interface SettingsForm {
  row: (key: string) => SettingRow | undefined
  value: (key: string) => CellValue | undefined
  /** what the row shows as saved: the author's own pending value, else the snapshot */
  shown: (key: string) => CellValue | undefined
  change: (key: string, v: CellValue) => void
  mark: (key: string) => Mark<SettingEntry> | undefined
  commit: (edits: Record<string, CellValue>) => Promise<boolean>
}
type Slot = React.ReactNode | ((f: SettingsForm) => React.ReactNode)
const fill = (s: Slot, f: SettingsForm) => (typeof s === "function" ? s(f) : s)

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const emails = (v: unknown) => String(v ?? "").split(/[,;\s]+/).filter(Boolean)
// commit is reachable from render (page slots get the form), where react-hooks/purity flags a direct Date.now()
const now = () => Date.now()
const uiOf = (key: string): SettingUi => SETTING_UI[key] || { label: key, icon: SlidersHorizontal, help: "" }

/** the row's control: its own, else from the script's kind (switch, a dropdown of the raw options, a box) */
function controlOf(s: SettingRow): Control | { type: "number" | "text" } {
  const c = SETTING_UI[s.key]?.control
  if (c) return c
  if (s.kind.type === "bool") return { type: "switch" }
  if (s.kind.type === "enum") return { type: "choice" }
  return { type: s.kind.type }
}
const choicesOf = (s: SettingRow): Choice[] => CHOICES[s.key] ?? (s.kind.type === "enum" ? s.kind.options.map((o): Choice => [o, String(o)]) : [])

/** keys saved this visit whose new value waits for Setup (the triggers); cleared once Setup ran */
const useSetupNote = create<{ keys: string[] }>(() => ({ keys: [] }))

/** A setting's place on the page: icon, name, help and mark on the left, the control on the right (or below, when wide). */
export function RowShell({ id, icon: Icon, label, help, badge, wide, children }: { id?: string; icon: LucideIcon; label: React.ReactNode; help?: React.ReactNode; badge?: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-3 py-5", !wide && "sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] sm:items-start sm:gap-8")}>
      <div className="min-w-0">
        <label htmlFor={id} className="flex flex-wrap items-center gap-2 font-bold">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {label}
          {badge}
        </label>
        {help && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{help}</p>}
      </div>
      <div className="min-w-0 sm:w-full sm:justify-self-end">{children}</div>
    </div>
  )
}

function Row({ s, value, mark, onChange }: { s: SettingRow; value: CellValue; mark?: Mark<SettingEntry>; onChange: (v: CellValue) => void }) {
  const ui = uiOf(s.key)
  const id = "set-" + s.key
  const c = controlOf(s)
  return (
    <RowShell id={id} icon={ui.icon} label={ui.label} help={ui.help || s.help} badge={<PendingMark mark={mark} />} wide={c.type === "emails"}>
      {c.type === "switch" ? (
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <Switch id={id} checked={isTrue(value)} onCheckedChange={onChange} />
          {isTrue(value) ? c.on ?? "On" : c.off ?? "Off"}
        </label>
      ) : c.type === "choice" ? (
        <ChoiceControl id={id} label={ui.label} options={choicesOf(s)} custom={c.custom} value={value} onChange={onChange} />
      ) : c.type === "emails" ? (
        <EmailsControl label={ui.label} value={value} onChange={onChange} />
      ) : c.type === "fixed" ? (
        <p id={id} className="rounded-xl border bg-muted/40 px-3 py-2 text-sm font-semibold">{c.show(String(value ?? ""))}</p>
      ) : (
        <Input id={id} type={c.type === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      )}
      {ui.setup && <SetupNote k={s.key} />}
      <SettingDrop mark={mark} s={s} />
    </RowShell>
  )
}

const CUSTOM = "__custom", EMPTY = "__empty"

/** A dropdown of labelled choices. custom: "Custom…" opens a number box; without it a value from the sheet that no
 *  choice holds shows as "Custom: N" and stays until another is picked. The picked choice's hint shows underneath. */
function ChoiceControl({ id, label, options, custom, value, onChange }: { id: string; label: string; options: Choice[]; custom?: { unit: string; min: number; max?: number }; value: CellValue; onChange: (v: CellValue) => void }) {
  const str = String(value ?? "")
  const hit = options.find((o) => String(o[0]) === str)
  const [own, setOwn] = React.useState(false)
  const isCustom = own || !hit
  const asNumber = typeof options[0]?.[0] === "number"
  const pick = (v: string) => {
    if (v === CUSTOM) return setOwn(true)
    if (v === EMPTY) return
    setOwn(false)
    if (v !== str) onChange(asNumber ? Number(v) : v)
  }
  const selected = isCustom && custom ? CUSTOM : str || EMPTY
  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={pick}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={String(v)} value={String(v)}>
              {l}
            </SelectItem>
          ))}
          {custom ? (
            <SelectItem value={CUSTOM}>Custom…</SelectItem>
          ) : (
            !hit && <SelectItem value={str || EMPTY}>Custom: {str || "empty"}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {custom && isCustom && (
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="decimal" min={custom.min} max={custom.max} step="any" value={str} onChange={(e) => onChange(e.target.value)} aria-label={`${label}, in ${custom.unit}`} className="w-28" />
          <span className="text-sm text-muted-foreground">{custom.unit}</span>
        </div>
      )}
      {!isCustom && hit?.[2] && <p className="text-xs leading-relaxed text-muted-foreground">{hit[2]}</p>}
    </div>
  )
}

/** A list of emails as chips: × removes one, Add suggests people from the Team tab and takes any typed email. */
function EmailsControl({ label, value, onChange }: { label: string; value: CellValue; onChange: (v: CellValue) => void }) {
  const team = useVic((s) => s.state?.teamList)
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const list = emails(value)
  const has = (e: string) => list.some((x) => x.toLowerCase() === e.toLowerCase())
  const nameOf = (e: string) => team?.find((t) => t.email.toLowerCase() === e.toLowerCase())?.name
  const set = (l: string[]) => onChange(l.join(", "))
  const add = (e: string) => {
    if (!has(e.trim())) set([...list, e.trim().toLowerCase()])
    setQ("")
    setOpen(false)
  }
  const typed = q.trim()
  const people = (team ?? []).filter((t) => t.email && !has(t.email))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {list.map((e) => {
        const bad = !EMAIL.test(e)
        return (
          <span key={e} title={e} className={cn("inline-flex max-w-full items-center gap-2 rounded-full border bg-accent/50 py-1 pl-1 pr-1.5 text-sm", bad && "border-destructive/50 bg-destructive/10")}>
            <UserAvatar email={e} className="size-6 text-[10px]" />
            <span className="min-w-0 truncate font-semibold">{nameOf(e) ?? e}</span>
            {bad && <span className="text-xs text-destructive">not an email</span>}
            <button type="button" onClick={() => set(list.filter((x) => x !== e))} aria-label={`Remove ${nameOf(e) ?? e}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </span>
        )
      })}
      {!list.length && <span className="text-sm text-muted-foreground">Nobody yet.</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="rounded-full" aria-label={`Add to ${label}`}>
            <Plus /> Add
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput value={q} onValueChange={setQ} placeholder="Name or email" />
            <CommandList>
              <CommandEmpty>{typed ? "Nobody on the team matches. Type their full email to add them." : "Everyone on the team is already in."}</CommandEmpty>
              {EMAIL.test(typed) && !has(typed) && (
                <CommandGroup heading="Email">
                  <CommandItem value={"add " + typed} onSelect={() => add(typed)}>
                    <Plus /> Add {typed}
                  </CommandItem>
                </CommandGroup>
              )}
              {people.length > 0 && (
                <CommandGroup heading="Team">
                  {people.map((t) => (
                    <CommandItem key={t.email} value={`${t.name} ${t.email}`} onSelect={() => add(t.email)}>
                      <UserAvatar email={t.email} className="size-6 text-[10px]" />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{t.email}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** After a new sync interval or digest time is saved: the triggers still run the old one until the owner runs Setup.
 *  Setup reads the Settings tab, so it waits while the change is still pending (only in Redis) and is moot once dropped. */
function SetupNote({ k }: { k: string }) {
  const on = useSetupNote((s) => s.keys.includes(k))
  const owner = useVic((s) => !!s.access?.owner)
  const busy = useVic((s) => s.busy)
  const over = useSettingsView()
  const { setup } = useActions()
  const kind = over[k]?.mark?.kind
  if (!on || kind === "dropped") return null
  const pending = kind === "pending"
  const run = async () => {
    // the keys still pending keep their note: Setup ran without them
    if (await setup()) useSetupNote.setState((n) => ({ keys: n.keys.filter((x) => over[x]?.mark?.kind === "pending") }))
  }
  return (
    <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-info/30 bg-info-soft/60 p-3 text-sm">
      <Settings2 className="size-4 shrink-0 text-info" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {pending ? "Saving into the sheet. Setup can run once it's there." : owner ? "Takes effect after Setup." : "Takes effect after Setup: ask the owner to run it."}
      </span>
      {owner && !pending && (
        <Button size="sm" variant="outline" disabled={busy} onClick={run}>
          Run Setup
        </Button>
      )}
    </div>
  )
}

/** settingValue_'s checks in WebApp.gs: a value they refuse takes the direct write, which says why. */
function settingOk(s: SettingRow, v: CellValue) {
  const t = String(v).trim(), n = Number(t)
  if (s.kind.type === "number" && (t === "" || isNaN(n))) return false
  if (s.key === "DIGEST_HOUR" && !(Number.isInteger(n) && n >= 0 && n <= 23)) return false
  return !(s.key === "ADMIN_EMAIL" && t && !emails(t).every((e) => EMAIL.test(e)))
}

/** a value as the row shows it: On / Off, the choice's label, or the text */
const asText = (s: SettingRow, v: unknown) => {
  if (s.kind.type === "bool") return isTrue(v) ? "On" : "Off"
  const hit = choicesOf(s).find((o) => String(o[0]) === String(v))
  return hit ? hit[1] : String(v ?? "") || "empty"
}

/** A dropped setting, answered on its row: Keep the sheet's value, or Apply mine anyway (a fresh change); a refused value: OK. */
export function SettingDrop({ mark, s }: { mark?: Mark<SettingEntry>; s: SettingRow }) {
  const markDrops = useVic((st) => st.markDrops)
  const accept = useVic((st) => st.accept)
  const built = useVic((st) => st.state?.built)
  const { saveSettings } = useActions()
  if (mark?.kind !== "dropped") return null
  const e = mark.entry
  const keep = () => markDrops({ keep: [e.cell] })
  const applyMine = async () => {
    const change = again(e, built, Date.now())
    if (change && (await accept([change])) === "ok") return
    void keep() // the pending path can't take it now: today's direct write, which reports on its own
    await saveSettings({ [e.key]: e.value })
  }
  return (
    <div role="status" className="mt-2 rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-sm">
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <span>
          <b>Not applied.</b>{" "}
          {e.reason ? <>{REASON[e.reason] ?? e.reason}</> : <>Someone changed it in the Settings tab first. The sheet now: <b>{asText(s, e.sheet)}</b>.</>} Yours: <b>{asText(s, e.value)}</b>.
        </span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <Button size="sm" variant="outline" onClick={keep}>
          {e.again ? "Keep the sheet's value" : "OK"}
        </Button>
        {e.again && (
          <Button size="sm" onClick={applyMine}>
            Apply mine anyway
          </Button>
        )}
      </div>
    </div>
  )
}

function Section({ sec, tour, children }: { sec: SettingsSection; tour?: string; children: React.ReactNode }) {
  if (!sec.title)
    return (
      <Card data-tour={tour}>
        <CardContent className="divide-y">{children}</CardContent>
      </Card>
    )
  const head = (
    <>
      <CardTitle className="text-lg font-bold">{sec.title}</CardTitle>
      {sec.description && <CardDescription>{sec.description}</CardDescription>}
    </>
  )
  if (!sec.folded)
    return (
      <Card data-tour={tour}>
        <CardHeader>{head}</CardHeader>
        <CardContent className="divide-y">{children}</CardContent>
      </Card>
    )
  return (
    <Collapsible asChild>
      <Card className="group/fold" data-tour={tour}>
        <CardHeader>
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <span className="grid gap-1.5">{head}</span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/fold:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="divide-y">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/** One Settings page: its settings in sections, saved through webRun('saveSettings') or as pending changes.
 *  top: cards above the sections; slots: blocks at the end of a section (by its title); extra: cards under them. */
export function SettingsPage({ group, top, slots, extra }: { group: SettingsGroup; top?: Slot; slots?: Record<string, Slot>; extra?: Slot }) {
  const all = useVic((s) => s.state?.settingsAll)
  const state = useVic((s) => s.state)
  const testMode = useVic((s) => s.state?.settings.testMode)
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs), runs = (a: string) => jobs.some((j) => j.action === a)
  const accepting = useVic((s) => s.accepting > 0)
  const over = useSettingsView()
  const { saveSettings } = useActions()
  const confirm = useConfirm()

  // the email texts (MAIL_*) are edited on the Emails page, never in Advanced
  const listed = React.useMemo(
    () => new Set([...Object.values(GROUPS).flatMap((g) => [...g.sections.flatMap((x) => x.keys), ...(g.own ?? [])]), ...(all ?? []).filter((s) => s.key.startsWith("MAIL_")).map((s) => s.key)]),
    [all],
  )
  /** every setting this page edits: its sections', its own cards', and the rest when a section takes them */
  const rows = React.useMemo(() => {
    if (!all) return []
    const mine = new Set([...group.sections.flatMap((x) => x.keys), ...(group.own ?? [])])
    const rest = group.sections.some((x) => x.rest)
    return all.filter((s) => mine.has(s.key) || (rest && !listed.has(s.key)) || (group.mail && s.key.startsWith("MAIL_")))
  }, [all, group, listed])

  const [edits, setEdits] = React.useState<Record<string, CellValue>>({})
  /** bumped by Discard: rows start over (a dropdown left on Custom… goes back to the saved choice) */
  const [gen, setGen] = React.useState(0)
  const dirty = Object.keys(edits).length > 0
  /** what the row shows: the author's own pending or just-saved value, else the snapshot */
  const shown = (s: SettingRow) => over[s.key]?.value ?? s.value
  const value = (s: SettingRow) => (s.key in edits ? edits[s.key] : shown(s))

  const change = (s: SettingRow, v: CellValue) =>
    setEdits((cur) => {
      const n = { ...cur }
      if (String(v) === String(shown(s))) delete n[s.key]
      else n[s.key] = v
      return n
    })

  /** saves these edits now; the page's other unsaved edits stay */
  const commit = async (e: Record<string, CellValue>) => {
    const edited = rows.filter((s) => s.key in e)
    if (!edited.length) return false
    if (edited.some((s) => mailProblemFor(s.key, e[s.key], state?.mails))) return false
    if ("TEST_MODE" in e && testMode && !isTrue(e.TEST_MODE)) {
      const ok = await confirm({
        title: "Turn test mode off?",
        body: (
          <>
            <p>From now on the script sends real emails to binome members and registrants, and shares binome sheets with their members.</p>
            <p>Only do this at launch.</p>
          </>
        ),
        okLabel: "Turn test mode off",
        danger: true,
      })
      if (!ok) return false
    }
    const done = () => {
      setEdits((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !(k in e))))
      const later = edited.filter((s) => SETTING_UI[s.key]?.setup).map((s) => s.key)
      if (later.length) useSetupNote.setState((n) => ({ keys: [...new Set([...n.keys, ...later])] }))
      return true
    }
    // pending changes: one per edited key, with the value the row showed; at once, and the rows show them
    const st = useVic.getState()
    if (st.pendingOn && st.gate.mode === "ok" && edited.every((s) => settingOk(s, e[s.key]))) {
      const at = now(), built = st.state?.built
      if ((await st.accept(edited.map((s) => ({ kind: "setting" as const, key: s.key, value: e[s.key], seen: shown(s), at, built })))) === "ok") return done()
    }
    // the edited keys only (issue 50): one someone changed in the Settings tab meanwhile is left as it is
    return (await saveSettings(e)) ? done() : false
  }

  const form: SettingsForm = {
    row: (key) => rows.find((r) => r.key === key),
    value: (key) => {
      const s = rows.find((r) => r.key === key)
      return s && value(s)
    },
    shown: (key) => {
      const s = rows.find((r) => r.key === key)
      return s && shown(s)
    },
    change: (key, v) => {
      const s = rows.find((r) => r.key === key)
      if (s) change(s, v)
    },
    mark: (key) => over[key]?.mark,
    commit,
  }

  const visible = (s: SettingRow) => !SETTING_UI[s.key]?.show || (state && SETTING_UI[s.key].show!(state as WebState))
  const ownKeys = new Set(group.own ?? [])

  return (
    <BaseLayout title={group.title} description={group.description} watermark="Settings">
      {!all ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          {top && fill(top, form)}
          {group.sections.map((sec, i) => {
            const at = (s: SettingRow) => (sec.keys.includes(s.key) ? sec.keys.indexOf(s.key) : sec.keys.length) // the section's order, the rest after
            const mine = rows.filter((s) => !ownKeys.has(s.key) && (sec.keys.includes(s.key) || (sec.rest && !listed.has(s.key))) && visible(s)).sort((a, b) => at(a) - at(b))
            const slot = sec.title && slots?.[sec.title]
            return (
              <Section key={sec.title ?? "main"} sec={sec} tour={i === 0 ? "settings-sections" : undefined}>
                {mine.map((s) => (
                  <Row key={s.key + gen} s={s} value={value(s)} mark={over[s.key]?.mark} onChange={(v) => change(s, v)} />
                ))}
                {slot && fill(slot, form)}
              </Section>
            )
          })}
        </>
      )}
      {all && extra && fill(extra, form)}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 pl-5 shadow-lg backdrop-blur-sm">
        <p className="text-sm text-muted-foreground">{dirty ? <><b className="text-foreground">{Object.keys(edits).length} unsaved change{Object.keys(edits).length > 1 ? "s" : ""}</b>. Save writes them into the Settings tab of the Master.</> : "Everything shown is saved in the Settings tab of the Master."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || busy || accepting} onClick={() => {
              setEdits({})
              setGen((g) => g + 1)
            }}
          >
            Discard
          </Button>
          <Button disabled={!dirty || busy || accepting || Object.entries(edits).some(([k, v]) => mailProblemFor(k, v, state?.mails))} onClick={() => commit(edits)}>
            {runs("saveSettings") && <Spinner />} Save changes
          </Button>
        </div>
      </div>
    </BaseLayout>
  )
}
