import * as React from "react"
import { AlertTriangle, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useConfirm, Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useVic } from "@/lib/vic/store"
import { REASON, useSettingsView, type Mark } from "@/lib/vic/pending"
import type { CellValue, SettingEntry, SettingRow } from "@/lib/vic/types"
import { PendingMark } from "@/app/alerts/components/pending-mark"

import { SETTING_UI } from "@/lib/vic/settings-ui"

export interface SettingsGroup {
  title: string
  description: string
  keys: string[]
  /** also takes every setting no group lists, so a new one is never hidden */
  rest?: boolean
}

const isTrue = (v: unknown) => v === true || /^(true|yes|oui|1|vrai)$/i.test(String(v))

function Row({ s, value, mark, onChange }: { s: SettingRow; value: CellValue; mark?: Mark<SettingEntry>; onChange: (v: CellValue) => void }) {
  const [name, Icon] = SETTING_UI[s.key] || [s.key, SlidersHorizontal]
  const id = "set-" + s.key
  const k = s.kind
  return (
    <div className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] sm:items-start sm:gap-8" title={s.key}>
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 font-bold">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {name}
          <PendingMark mark={mark} />
        </label>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.help}</p>
      </div>
      <div className="sm:justify-self-end sm:w-full">
        {k.type === "bool" ? (
          <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold">
            <Switch id={id} checked={isTrue(value)} onCheckedChange={onChange} />
            {isTrue(value) ? "On" : "Off"}
          </label>
        ) : k.type === "enum" ? (
          <Select value={String(value)} onValueChange={(v) => onChange(typeof k.options[0] === "number" ? Number(v) : v)}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {k.options.map((o) => (
                <SelectItem key={String(o)} value={String(o)}>
                  {String(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={id} type={k.type === "number" ? "number" : "text"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        )}
        <SettingDrop mark={mark} s={s} />
      </div>
    </div>
  )
}

/** The script's checks (settingValue_ in WebApp.gs): a value they refuse takes the direct write, which says why. */
function settingOk(s: SettingRow, v: CellValue) {
  const t = String(v).trim(), n = Number(t)
  if (s.kind.type === "number" && (t === "" || isNaN(n))) return false
  if (s.key === "DIGEST_HOUR" && !(Number.isInteger(n) && n >= 0 && n <= 23)) return false
  return !(s.key === "ADMIN_EMAIL" && t && !t.split(/[,;\s]+/).filter(Boolean).every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))
}

const asText = (s: SettingRow, v: unknown) => (s.kind.type === "bool" ? (isTrue(v) ? "On" : "Off") : String(v ?? "") || "empty")

/** A dropped setting, answered on its row: Keep the sheet's value, or Apply mine anyway (a fresh change); a refused value: OK. */
function SettingDrop({ mark, s }: { mark?: Mark<SettingEntry>; s: SettingRow }) {
  const markDrops = useVic((st) => st.markDrops)
  const accept = useVic((st) => st.accept)
  const built = useVic((st) => st.state?.built)
  const { saveSettings } = useActions()
  if (mark?.kind !== "dropped") return null
  const e = mark.entry
  const keep = () => markDrops({ keep: [e.cell] })
  const applyMine = async () => {
    // seen = the sheet's value as the notice shows it (issue 50)
    if ((await accept([{ kind: "setting", key: e.key, value: e.value, seen: e.sheet ?? e.seen, at: Date.now(), built }])) === "ok") return
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

/** One page of the old Settings form: the same settings, grouped by what they decide, saved through webRun('saveSettings'). */
export function SettingsPage({ group, extra }: { group: SettingsGroup; extra?: React.ReactNode }) {
  const all = useVic((s) => s.state?.settingsAll)
  const testMode = useVic((s) => s.state?.settings.testMode)
  const busy = useVic((s) => s.busy)
  const action = useVic((s) => s.busyAction)
  const accepting = useVic((s) => s.accepting > 0)
  const over = useSettingsView()
  const { saveSettings } = useActions()
  const confirm = useConfirm()

  const rows = React.useMemo(() => {
    if (!all) return []
    const listed = new Set(Object.values(GROUP_KEYS).flat())
    return all.filter((s) => group.keys.includes(s.key) || (group.rest && !listed.has(s.key)))
  }, [all, group])

  const [edits, setEdits] = React.useState<Record<string, CellValue>>({})
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

  const save = async () => {
    if ("TEST_MODE" in edits && testMode && !isTrue(edits.TEST_MODE)) {
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
      if (!ok) return
    }
    // pending changes: one per edited key, with the value the row showed; at once, and the rows show them
    const st = useVic.getState(), edited = rows.filter((s) => s.key in edits)
    if (st.pendingOn && st.gate.mode === "ok" && edited.every((s) => settingOk(s, edits[s.key]))) {
      const at = Date.now(), built = st.state?.built
      if ((await st.accept(edited.map((s) => ({ kind: "setting" as const, key: s.key, value: edits[s.key], seen: shown(s), at, built })))) === "ok") {
        setEdits({})
        if (edited.some((s) => s.key === "SYNC_EVERY_MINUTES" || s.key === "DIGEST_HOUR"))
          toast.info("The sheet owner needs to run Setup for the new schedule to take effect.", { duration: 10000 })
        return
      }
    }
    // the edited keys only (issue 50): one someone changed in the Settings tab meanwhile is left as it is
    if (await saveSettings(edits)) setEdits({})
  }

  return (
    <BaseLayout title={group.title} description={group.description} watermark="Settings">
      {!all ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <Card>
          <CardHeader className="sr-only">
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {rows.map((s) => (
              <Row key={s.key} s={s} value={value(s)} mark={over[s.key]?.mark} onChange={(v) => change(s, v)} />
            ))}
          </CardContent>
        </Card>
      )}
      {extra}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 pl-5 shadow-lg backdrop-blur-sm">
        <p className="text-sm text-muted-foreground">{dirty ? <><b className="text-foreground">{Object.keys(edits).length} unsaved change{Object.keys(edits).length > 1 ? "s" : ""}</b>. Save writes them into the Settings tab of the Master.</> : "Everything shown is saved in the Settings tab of the Master."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || busy || accepting} onClick={() => setEdits({})}>
            Discard
          </Button>
          <Button disabled={!dirty || busy || accepting} onClick={save}>
            {busy && action === "saveSettings" && <Spinner />} Save changes
          </Button>
        </div>
      </div>
    </BaseLayout>
  )
}

const GROUP_KEYS = {
  timing: ["HOURS_NOT_CONTACTED", "HOURS_NO_INTERVIEW_DATE", "HOURS_AFTER_INTERVIEW_NO_FORM", "INSTANT_EMAIL_MIN_SEVERITY"],
  sharing: ["TEST_MODE", "SHARE_FILES_WITH_BINOME", "NOTIFY_BINOME_ON_ALERT", "NOTIFY_BINOME_ON_NEW_INTERVIEWEE", "CONFIRM_REGISTRANTS"],
  screening: ["SCREENING", "SCREEN_HOLD_AT", "VIC_MEMBERS_SHEET"],
  general: ["ADMIN_EMAIL", "TIMEZONE", "ASSIGNMENTS_OPEN", "BALANCE_BY", "ALL_BINOME_WEIGHT", "EMAIL_DOMAIN", "TRUSTED_BACKUPS", "SYNC_EVERY_MINUTES", "DIGEST_HOUR"],
}

export const GROUPS: Record<"general" | "timing" | "sharing" | "screening", SettingsGroup> = {
  screening: {
    title: "Screening",
    description: "Hold low-effort applications for a person to read before any binome sees them, and decline VIC members without telling them.",
    keys: GROUP_KEYS.screening,
  },
  general: { title: "General", description: "Who the admins are, how candidates are assigned, and how often the script syncs.", keys: GROUP_KEYS.general, rest: true },
  timing: { title: "Alerts and timing", description: "How long a candidate may wait before the script raises an alert, and how loudly.", keys: GROUP_KEYS.timing },
  sharing: { title: "Sharing and email", description: "Test mode, whether binome sheets are shared, and which emails go out.", keys: GROUP_KEYS.sharing },
}
