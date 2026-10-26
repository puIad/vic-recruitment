import * as React from "react"
import { Eye, Mail, RotateCcw, Send, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { PendingMark } from "@/app/alerts/components/pending-mark"
import { useActions } from "@/lib/vic/actions"
import { MAIL_FIELD_LABEL, MAIL_MAX, MAIL_UI, PLACEHOLDER_HELP, isTrue, mailProblem } from "@/lib/vic/settings-ui"
import { useVic } from "@/lib/vic/store"
import type { MailDef } from "@/lib/vic/types"
import { GROUPS } from "../components/settings-groups"
import { SettingDrop, SettingsPage, type SettingsForm } from "../components/settings-form"

const SECTIONS: { to: MailDef["to"]; title: string; description: string }[] = [
  { to: "candidate", title: "To candidates", description: "Sent from “VIC Recruitment” to the people who applied." },
  { to: "binome", title: "To binome members", description: "Sent from “VIC Recruitment Bot” to the members of a binome." },
]

/** The confirmation must not promise an interview (an applicant can still be declined after it, or never be reached). */
const PROMISE = /interview|entretien/i

function MailCard({ m, f }: { m: MailDef; f: SettingsForm }) {
  const ui = MAIL_UI[m.id] ?? { label: m.name, help: "", icon: Mail } // a mail the script knows before this page does
  const Icon = ui.icon
  const { mailPreview } = useActions()
  const busy = useVic((s) => s.busy)
  const refs = React.useRef<Record<string, HTMLTextAreaElement | HTMLInputElement | null>>({})
  const [last, setLast] = React.useState(m.fields[0].key)
  const [view, setView] = React.useState<{ subject: string; html: string } | null>(null)

  /** boxes the admin emptied: they stay empty (the default shows as a hint) until typed in or reset */
  const [emptied, setEmptied] = React.useState<string[]>([])
  const texts = Object.fromEntries(m.fields.map((x) => [x.field, String(f.value(x.key) ?? "") || (emptied.includes(x.key) ? "" : x.def)]))
  const changed = m.fields.some((x) => String(f.value(x.key) ?? "") !== "")
  const switchKey = ui.switch
  const confirmPromise = m.id === "CONFIRM" && m.fields.some((x) => PROMISE.test(texts[x.field]))

  /** a text equal to the default is kept blank, so a later change to the default still reaches it */
  const set = (x: MailDef["fields"][number], v: string) => {
    setEmptied((e) => (v === "" ? [...new Set([...e, x.key])] : e.filter((k) => k !== x.key)))
    f.change(x.key, v.trim() === x.def ? "" : v)
  }

  const insert = (name: string) => {
    const x = m.fields.find((y) => y.key === last) ?? m.fields[0]
    const el = refs.current[x.key]
    const cur = texts[x.field]
    const at = el?.selectionStart ?? cur.length
    const to = el?.selectionEnd ?? at
    set(x, cur.slice(0, at) + `{${name}}` + cur.slice(to))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + name.length + 2, at + name.length + 2)
    })
  }

  const preview = async (send: boolean) => {
    const r = await mailPreview(m.id, texts, send)
    if (r) setView({ subject: r.subject, html: r.html })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <Icon className="size-5 text-primary" aria-hidden="true" />
            {ui.label}
            {changed && <Badge variant="secondary">Changed</Badge>}
            {switchKey && <PendingMark mark={f.mark(switchKey)} />}
          </CardTitle>
          <CardDescription className="mt-1">{ui.help}</CardDescription>
        </div>
        {switchKey && (
          <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold">
            <Switch checked={isTrue(f.value(switchKey))} onCheckedChange={(v) => f.change(switchKey, v)} aria-label={`Send: ${ui.label}`} />
            {isTrue(f.value(switchKey)) ? "On" : "Off"}
          </label>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {switchKey && f.row(switchKey) && <SettingDrop mark={f.mark(switchKey)} s={f.row(switchKey)!} />}
        {m.fields.map((x) => {
          const v = texts[x.field]
          const problem = mailProblem(v, m.vars)
          const long = x.field !== "subject" && x.field !== "heading" && x.field !== "codeLabel"
          const id = `mail-${x.key}`
          const common = {
            id,
            value: v,
            placeholder: x.def,
            onFocus: () => setLast(x.key),
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(x, e.target.value),
            "aria-invalid": !!problem,
          }
          const row = f.row(x.key)
          return (
            <div key={x.key} className="space-y-1.5">
              <label htmlFor={id} className="text-sm font-bold">{MAIL_FIELD_LABEL[x.field]}</label>
              {long ? (
                <Textarea {...common} ref={(el) => void (refs.current[x.key] = el)} rows={Math.min(10, Math.max(3, v.split("\n").length + 1))} />
              ) : (
                <Input {...common} ref={(el) => void (refs.current[x.key] = el)} />
              )}
              {row && <SettingDrop mark={f.mark(x.key)} s={row} />}
              {problem && (
                <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  {problem}
                </p>
              )}
              {v.length > MAIL_MAX * 0.9 && !problem && <p className="text-xs text-muted-foreground">{v.length} of {MAIL_MAX} characters</p>}
            </div>
          )
        })}
        {confirmPromise && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            This mail mentions an interview. Not everyone who gets it is interviewed, so do not promise one.
          </p>
        )}
        <div>
          <p className="mb-2 text-sm font-bold">Fill in automatically</p>
          <div className="flex flex-wrap gap-2">
            {m.vars.map((name) => (
              <Button key={name} type="button" size="sm" variant="outline" title={ui.vars?.[name] ?? PLACEHOLDER_HELP[name]} onClick={() => insert(name)} className="font-mono">
                {`{${name}}`}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Click a chip to put it into the box you last used. A blank line starts a new paragraph and **words** in stars are bold.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => preview(false)}>
            <Eye /> Preview
          </Button>
          <Button type="button" variant="ghost" disabled={!changed} onClick={() => {
              setEmptied([])
              m.fields.forEach((x) => f.change(x.key, ""))
            }}>
            <RotateCcw /> Reset to default
          </Button>
        </div>
      </CardContent>
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ui.label}</DialogTitle>
            <DialogDescription>Subject: {view?.subject}. Drawn with sample names from the texts as they are now, saved or not.</DialogDescription>
          </DialogHeader>
          <iframe title={`Preview: ${ui.label}`} sandbox="" srcDoc={view?.html} className="h-[28rem] w-full rounded-xl border bg-white" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setView(null)}>Close</Button>
            <Button disabled={busy} onClick={() => void preview(true)}>
              <Send /> Send me a test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Cards({ f }: { f: SettingsForm }) {
  const mails = useVic((s) => s.state?.mails)
  const loaded = useVic((s) => !!s.state)
  if (!loaded) return <Skeleton className="h-96 w-full rounded-2xl" />
  if (!mails)
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          The script is older than this page and does not know the editable mails yet. Deploy the script first, then reload.
        </CardContent>
      </Card>
    )
  return (
    <>
      {SECTIONS.map((sec) => (
        <section key={sec.to} className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">{sec.title}</h2>
            <p className="text-sm text-muted-foreground">{sec.description}</p>
          </div>
          {mails.filter((m) => m.to === sec.to).map((m) => (
            <MailCard key={m.id} m={m} f={f} />
          ))}
        </section>
      ))}
    </>
  )
}

export default function EmailsSettings() {
  return <SettingsPage group={GROUPS.emails} top={(f) => <Cards f={f} />} />
}
