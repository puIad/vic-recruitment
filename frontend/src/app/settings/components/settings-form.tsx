import * as React from "react"
import {
  ArrowUpDown,
  Bell,
  ClipboardList,
  Clock,
  FlaskConical,
  Gauge,
  Mail,
  Play,
  RefreshCw,
  Repeat,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"

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
import type { SettingRow } from "@/lib/vic/types"

/** key: [friendly name, icon]. A new setting in SETTINGS_DEFAULTS gets a row here (falls back to its key). */
const SETTING_UI: Record<string, [string, LucideIcon]> = {
  ADMIN_EMAIL: ["Admin emails", Mail],
  TEST_MODE: ["Test mode", FlaskConical],
  TIMEZONE: ["Timezone", Clock],
  HOURS_NOT_CONTACTED: ["Alert: not contacted after (hours)", Bell],
  HOURS_NO_INTERVIEW_DATE: ["Alert: no interview date after (hours)", Clock],
  HOURS_AFTER_INTERVIEW_NO_FORM: ["Alert: no interview form after (hours)", ClipboardList],
  INSTANT_EMAIL_MIN_SEVERITY: ["Instant email from alert level", Bell],
  NOTIFY_BINOME_ON_ALERT: ["Email binomes about alerts", Send],
  NOTIFY_BINOME_ON_NEW_INTERVIEWEE: ["Email binomes about new interviewees", UserPlus],
  SHARE_FILES_WITH_BINOME: ["Share sheets with binomes", Share2],
  ASSIGNMENTS_OPEN: ["Assigning new registrants", Play],
  BALANCE_BY: ["Balance interviewees by", SlidersHorizontal],
  ALL_BINOME_WEIGHT: ["Board binome load weight", ArrowUpDown],
  EMAIL_DOMAIN: ["Registrant email domain", Mail],
  TRUSTED_BACKUPS: ["Trusted backup interviewers", Users],
  SYNC_EVERY_MINUTES: ["Auto-sync every (minutes)", RefreshCw],
  DIGEST_HOUR: ["Daily digest hour (0–23)", Repeat],
  SCREENING: ["Screening", ShieldCheck],
  SCREEN_HOLD_AT: ["Hold for review from risk", Gauge],
  VIC_MEMBERS_SHEET: ["VIC members sheet", Table2],
}

export interface SettingsGroup {
  title: string
  description: string
  keys: string[]
  /** also takes every setting no group lists, so a new one is never hidden */
  rest?: boolean
}

const isTrue = (v: unknown) => v === true || /^(true|yes|oui|1|vrai)$/i.test(String(v))

function Row({ s, value, onChange }: { s: SettingRow; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  const [name, Icon] = SETTING_UI[s.key] || [s.key, SlidersHorizontal]
  const id = "set-" + s.key
  const k = s.kind
  return (
    <div className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] sm:items-start sm:gap-8" title={s.key}>
      <div className="min-w-0">
        <label htmlFor={id} className="flex items-center gap-2 font-bold">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {name}
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
  const { saveSettings } = useActions()
  const confirm = useConfirm()

  const rows = React.useMemo(() => {
    if (!all) return []
    const listed = new Set(Object.values(GROUP_KEYS).flat())
    return all.filter((s) => group.keys.includes(s.key) || (group.rest && !listed.has(s.key)))
  }, [all, group])

  const [edits, setEdits] = React.useState<Record<string, string | number | boolean>>({})
  const dirty = Object.keys(edits).length > 0
  const value = (s: SettingRow) => (s.key in edits ? edits[s.key] : s.value)

  const change = (s: SettingRow, v: string | number | boolean) =>
    setEdits((cur) => {
      const n = { ...cur }
      if (String(v) === String(s.value)) delete n[s.key]
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
    // send every setting of this page, as the old form did: the script writes only what changed
    const values: Record<string, unknown> = {}
    rows.forEach((s) => (values[s.key] = value(s)))
    if (await saveSettings(values)) setEdits({})
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
              <Row key={s.key} s={s} value={value(s)} onChange={(v) => change(s, v)} />
            ))}
          </CardContent>
        </Card>
      )}
      {extra}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 pl-5 shadow-lg backdrop-blur-sm">
        <p className="text-sm text-muted-foreground">{dirty ? <><b className="text-foreground">{Object.keys(edits).length} unsaved change{Object.keys(edits).length > 1 ? "s" : ""}</b>. Save writes them into the Settings tab of the Master.</> : "Everything shown is saved in the Settings tab of the Master."}</p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setEdits({})}>
            Discard
          </Button>
          <Button disabled={!dirty || busy} onClick={save}>
            {busy && action === "saveSettings" && <Spinner />} Save changes
          </Button>
        </div>
      </div>
    </BaseLayout>
  )
}

const GROUP_KEYS = {
  timing: ["HOURS_NOT_CONTACTED", "HOURS_NO_INTERVIEW_DATE", "HOURS_AFTER_INTERVIEW_NO_FORM", "INSTANT_EMAIL_MIN_SEVERITY"],
  sharing: ["TEST_MODE", "SHARE_FILES_WITH_BINOME", "NOTIFY_BINOME_ON_ALERT", "NOTIFY_BINOME_ON_NEW_INTERVIEWEE"],
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
