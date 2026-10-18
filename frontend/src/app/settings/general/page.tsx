import { Link } from "react-router-dom"
import { Clock, Scale } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useConfirm } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import type { Binome } from "@/lib/vic/types"
import { GROUPS, SettingsPage } from "../components/settings-form"

export default function GeneralSettings() {
  return (
    <SettingsPage
      group={GROUPS.general}
      extra={(draft) => (
        <>
          <HrShare weight={Number(draft("HR_ONLY_WEIGHT")) || 1} total={String(draft("BALANCE_BY")).toUpperCase() === "TOTAL"} />
          <PendingSwitch />
        </>
      )}
    />
  )
}

const one = (n: number) => String(Math.round(n * 10) / 10)

/** How HR candidates are shared (launch-features.md section 5): the HR-only binomes' load next to the mixed ones', with
 *  the weight and Balance by being edited. An HR-only binome counts as load / weight, so it keeps taking HR candidates
 *  until it holds about weight x the lightest mixed binome's load. */
function HrShare({ weight, total }: { weight: number; total: boolean }) {
  const binomes = useVic((s) => s.state?.binomes)
  // shortcut: tags matched as the dashboard writes them (IT & HR, HR); a hand-typed alias like RH is missed here, not in routing
  const words = (b: Binome) => b.tag.toUpperCase().split(/[^A-Z]+/)
  const live = (binomes ?? []).filter((b) => b.status === "ACTIVE" && words(b).includes("HR") && !words(b).includes("ALL"))
  // board (ALL) binomes also take HR candidates but are left out of the numbers: none this year, so the card only says so
  const board = (binomes ?? []).filter((b) => b.status === "ACTIVE" && words(b).includes("ALL")).length
  if (!binomes || binomes.some((b) => b.load === undefined)) return null // an older script: no loads to show
  const hrOnly = live.filter((b) => b.tag.trim().toUpperCase() === "HR")
  const mixed = live.filter((b) => b.tag.trim().toUpperCase() !== "HR")
  const load = (b: Binome) => b.load ?? 0
  const lightest = mixed.length ? mixed.reduce((a, b) => (load(b) < load(a) ? b : a)) : null
  const avg = mixed.length ? mixed.reduce((n, b) => n + load(b), 0) / mixed.length : 0
  const target = lightest ? weight * load(lightest) : 0
  const max = Math.max(1, target, ...live.map(load))

  const bar = (n: number, tone: string, mark?: number) => (
    <div className="relative col-span-3 h-1.5 w-full rounded-full bg-secondary sm:col-span-1 sm:col-start-2" aria-hidden="true">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(n ? 4 : 0, (n / max) * 100)}%` }} />
      {mark !== undefined && <div className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground/60" style={{ left: `calc(${(mark / max) * 100}% - 1px)` }} />}
    </div>
  )
  const row = (key: string, label: React.ReactNode, sub: React.ReactNode, n: number, tone: string, mark?: number) => (
    <li key={key} className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)_2.5rem]">
      <span className="text-sm font-bold">{label}</span>
      <span className="truncate text-sm text-muted-foreground" title={typeof sub === "string" ? sub : undefined}>{sub}</span>
      <span className="num text-right text-sm font-semibold">{one(n)}</span>
      {bar(n, tone, mark)}
    </li>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Scale className="size-4 text-primary" aria-hidden="true" /> How HR candidates are shared
        </CardTitle>
        <CardDescription>
          An HR candidate goes to the binome with the lowest load, counted as {total ? "every interviewee it was given" : "its pending interviewees"} in
          every department. An HR-only binome counts as its load ÷ {one(weight)}, so it takes about {one(weight)}× the load of the lightest mixed
          binome{weight === 1 ? ": the same share" : ""}. It wins a tie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!live.length ? (
          <p className="rounded-xl border-2 border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">Appears once binomes are locked.</p>
        ) : !hrOnly.length ? (
          <p className="rounded-xl border-2 border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">No locked binome is HR-only, so this weight changes nothing right now.</p>
        ) : (
          <>
            <ul className="space-y-3.5">
              {hrOnly.map((b) =>
                row(
                  b.code,
                  <Link to={`/binomes?q=${encodeURIComponent(b.code)}`} className="text-primary hover:underline">{b.code}</Link>,
                  lightest ? `HR-only · about ${one(target)} at this weight` : "HR-only",
                  load(b),
                  "bg-vic-ring",
                  lightest ? target : undefined
                )
              )}
              {lightest && row("light", "Lightest mixed", `${lightest.code} · ${lightest.tag}`, load(lightest), "bg-primary/40")}
              {mixed.length > 0 && row("avg", "Mixed average", `${mixed.length} binomes`, avg, "bg-primary/20")}
            </ul>
            <p className="text-xs text-muted-foreground">
              Load right now, from the last sync. A new weight applies from the next candidate: nobody already assigned moves.
              {board > 0 && ` Not shown: ${board} board (ALL) binome${board > 1 ? "s" : ""}, which also take HR candidates, so the lightest of them can come before this target.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The owner's switch between pending changes and direct writes (issue 57): a script property, not a Settings row, so
 *  only the owner flips it. Off = every save waits for the sheet, as before. Pages pick it up at their next pulse. */
function PendingSwitch() {
  const owner = useVic((s) => !!s.access?.owner)
  const on = useVic((s) => s.pendingOn)
  const busy = useVic((s) => s.busy)
  const run = useVic((s) => s.run)
  const confirm = useConfirm()
  if (!owner) return null
  const flip = async (next: boolean) => {
    const ok = await confirm({
      title: next ? "Turn pending changes on?" : "Turn pending changes off?",
      body: next ? (
        <>
          <p>Resolve, Snooze, Mute, Unmute, saved settings and My binome fields show at once with a Pending pill and reach the sheet about a minute later, as the person who clicked, even with the tab closed.</p>
          <p className="text-muted-foreground">A change the sheet overtook comes back on its row as Not applied, with Keep the sheet's value or Apply mine anyway.</p>
        </>
      ) : (
        <p>Every save waits for the sheet again. Changes already pending still go in.</p>
      ),
      okLabel: next ? "Turn on" : "Turn off",
    })
    if (!ok) return
    const out = await run<{ pending: boolean }>("pendingSwitch", { on: next }, next ? "Pending changes on" : "Pending changes off")
    if (out?.result) useVic.setState({ pendingOn: out.result.pending })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Clock className="size-4 text-primary" aria-hidden="true" /> Pending changes
          <Badge variant="info" className="ml-1">Owner only</Badge>
        </CardTitle>
        <CardDescription>Alert actions, settings and My binome fields save in under a second and go into the sheet in the background. Other admins see them after the next sync; a binome partner at their next refresh.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <Switch checked={on} disabled={busy} onCheckedChange={flip} aria-label="Pending changes" />
          {on ? "On: these saves are pending changes" : "Off: every save is a direct write"}
        </label>
      </CardContent>
    </Card>
  )
}
