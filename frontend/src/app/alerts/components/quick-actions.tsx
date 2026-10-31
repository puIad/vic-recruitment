import * as React from "react"
import {
  ArrowRight,
  BellOff,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  MoveRight,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Undo2,
  UserPlus,
  UserX,
  Wrench,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { DEPTS } from "@/lib/vic/format"
import { REPAIR_LABEL, repairOf, useQuick, type LocateTarget, type SnoozeFor } from "@/lib/vic/quick"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Alert, AppView, FormView, QuickInfo, RegView } from "@/lib/vic/types"
import { FormAnswers, FormsError } from "@/components/interview-forms"
import { useFormsRead } from "@/lib/vic/forms"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { MemberName } from "@/components/member-name"
import { REVIEW, TIMING } from "./alert-kinds"

/* ---------- which alerts get which actions ---------- */

const TYPO = ["BAD_PHONE", "BAD_EMAIL", "BAD_BIRTHDATE", "MISSING_NAME"]
const ROUTING = ["INVALID_CHOICE", "SAME_CHOICES", "NO_BINOME"]
const WHO = ["BINOME_MISMATCH", "BACKUP_INTERVIEWER", "NOT_ASSIGNED"]
const NO_IVS: never[] = []
const CONTACT_OPTIONS = ["Not yet", "Yes", "No answer", "Withdrew"]

type Q<K extends QuickInfo["kind"]> = Extract<QuickInfo, { kind: K }>
const qOf = <K extends QuickInfo["kind"]>(a: Alert, kind: K): Q<K> | null => (a.q && a.q.kind === kind ? (a.q as Q<K>) : null)

const snoozable = (a: Alert) => a.type !== "MANUAL_EDIT"

/** The one action a list row offers. open = it needs input, so the row opens the detail pane instead. */
function rowAction(a: Alert): { label: string; icon: typeof Mail; kind: "nudge" | "exclude" | "repair" | "keep" | "open" } | null {
  if (TIMING.includes(a.type) && a.binome) return { label: "Nudge", icon: Send, kind: "nudge" }
  if (a.type === "UNPAIRED_MEMBER" && a.q) return { label: "Exclude", icon: UserX, kind: "exclude" }
  if (repairOf(a)) return { label: repairOf(a) === "retry" ? "Retry" : "Repair", icon: Wrench, kind: "repair" }
  if ((WHO.includes(a.type) && a.type !== "NOT_ASSIGNED") || a.type === "SAME_CHOICES") return { label: "It's fine", icon: Check, kind: "keep" }
  if (!a.q) return null
  if (TYPO.includes(a.type) || ROUTING.includes(a.type) || a.type === "UNKNOWN_INTERVIEWEE" || a.type === "EMAIL_MISMATCH" || a.type === "NOT_ASSIGNED" || (a.type === "ODD_VALUE" && a.q.kind === "iv"))
    return { label: "Fix", icon: Sparkles, kind: "open" }
  if (a.type === "DUPLICATE_REGISTRATION" || a.type === "DUPLICATE_INTERVIEW") return { label: "Compare", icon: Sparkles, kind: "open" }
  if (REVIEW.includes(a.type)) return { label: "Review", icon: Sparkles, kind: "open" }
  return null
}

/* ---------- small building blocks ---------- */

function useBusy() {
  const busy = useVic((s) => s.busy)
  const [pending, setPending] = React.useState<string | null>(null)
  const act = (key: string, fn: () => Promise<unknown>) => async () => {
    setPending(key)
    try {
      await fn()
    } finally {
      setPending(null)
    }
  }
  return { busy, pending, act }
}

function ActionButton({ id, pending, busy, icon: Icon, children, variant = "outline", onClick, type = "button", disabled }: {
  id: string
  pending: string | null
  busy: boolean
  icon: typeof Mail
  children: React.ReactNode
  variant?: "default" | "outline" | "soft" | "destructive"
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
}) {
  return (
    <Button type={type} size="sm" variant={variant} disabled={busy || disabled} onClick={onClick}>
      {pending === id ? <Spinner /> : <Icon />} {children}
    </Button>
  )
}

/** A soft well that holds a form or a comparison. */
function Well({ children, className, as: As = "div", onSubmit }: { children: React.ReactNode; className?: string; as?: "div" | "form"; onSubmit?: (e: React.FormEvent) => void }) {
  return (
    <As onSubmit={onSubmit} className={cn("space-y-3 rounded-2xl border bg-muted/40 p-4", className)}>
      {children}
    </As>
  )
}

function Who({ v }: { v: RegView }) {
  return (
    <p className="text-sm">
      <b>{`${v.first} ${v.family}`.trim() || "No name"}</b>
      <span className="text-muted-foreground">
        {" · "}
        {v.code || "no code yet"}
        {v.binome ? ` · ${v.binome}` : " · no binome"} · registered {v.registered}
      </span>
    </p>
  )
}

/** What the form(s) of a form alert answered, read when the alert opens (webRun interviewForms by the Interview Log key). Two keys sit
 *  side by side (a duplicate's first and latest form). Nothing on a script that sends no key. */
function AlertAnswers({ keys }: { keys: (string | undefined)[] }) {
  const list = keys.filter((k): k is string => !!k)
  if (!list.length) return null
  return <AlertAnswersRead keys={list} />
}
function AlertAnswersRead({ keys }: { keys: string[] }) {
  const { data, error, retry } = useFormsRead({ key: keys[keys.length - 1] })
  if (error) return <FormsError error={error} retry={retry} />
  if (!data) return <Skeleton className="h-32 rounded-xl" />
  return (
    <div className={cn("grid gap-3", keys.length > 1 && "sm:grid-cols-2")}>
      {keys.map((k, i) => {
        const form = data.forms.find((x) => x.key === k)
        return (
          <div key={k} className="min-w-0 space-y-2">
            <p className="font-bold">{keys.length > 1 ? (i === 0 ? "First form's answers" : "Latest form's answers") : "Its answers"}</p>
            {form ? <FormAnswers form={form} read={data} /> : <p className="text-sm text-muted-foreground">This form is no longer in the Interview Log.</p>}
          </div>
        )
      })}
    </div>
  )
}

function FormFacts({ f, title, right }: { f: FormView; title?: string; right?: React.ReactNode }) {
  const rows: [string, React.ReactNode][] = [
    ["Sent by", f.submitterName ? <><MemberName name={f.submitterName} /> ({f.submitter})</> : f.submitter],
    ["On", f.at],
    ["Binome typed", f.typedBinome || "—"],
    ["Interviewee typed", f.typedIv || "—"],
    ["Read as", [f.interviewee, f.binome].filter(Boolean).join(" in ") || "nobody"],
  ]
  if (f.finalDep) rows.push(["Final department", f.finalDep])
  return (
    <div className="min-w-0 flex-1 space-y-2">
      {(title || right) && (
        <div className="flex items-center justify-between gap-2">
          {title && <p className="font-bold">{title}</p>}
          {right}
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words font-medium">{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Interview Log row {f.row}</p>
    </div>
  )
}

function DeptSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full bg-background">
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {DEPTS.map((d) => (
          <SelectItem key={d} value={d}>
            {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ---------- the panels ---------- */

const TYPO_FIELDS: Record<string, { key: string; label: string; of: (v: RegView) => string; placeholder: string; inputMode?: "tel" | "email" | "text" }[]> = {
  BAD_PHONE: [{ key: "Phone", label: "Phone number", of: (v) => v.phone, placeholder: "0555 12 34 56", inputMode: "tel" }],
  BAD_EMAIL: [{ key: "Email", label: "Email the Master uses", of: (v) => v.email, placeholder: "name@g.enp.edu.dz", inputMode: "email" }],
  BAD_BIRTHDATE: [{ key: "Birth Date", label: "Birth date", of: (v) => v.birth, placeholder: "dd/mm/yyyy" }],
  MISSING_NAME: [
    { key: "First Name", label: "First name", of: (v) => v.first, placeholder: "Amine" },
    { key: "Family Name", label: "Family name", of: (v) => v.family, placeholder: "Belkacem" },
  ],
}

function TypoPanel({ a, v }: { a: Alert; v: RegView }) {
  const quick = useQuick()
  const { busy, pending, act } = useBusy()
  const fields = TYPO_FIELDS[a.type]
  const openEdit = useUi((s) => s.openEditDialog)
  const [vals, setVals] = React.useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.of(v)])))
  const changed = fields.some((f) => (vals[f.key] || "").trim() !== f.of(v).trim())
  const filled = fields.every((f) => (vals[f.key] || "").trim())
  return (
    <Well as="form" onSubmit={(e) => { e.preventDefault(); act("save", () => quick.edit(a, vals))() }}>
      <Who v={v} />
      <div className={cn("grid gap-3", fields.length > 1 && "sm:grid-cols-2")}>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`${a.id}-${f.key}`} className="text-sm font-semibold">{f.label}</Label>
            <Input
              id={`${a.id}-${f.key}`}
              value={vals[f.key]}
              onChange={(e) => setVals((cur) => ({ ...cur, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              inputMode={f.inputMode}
              autoComplete="off"
              spellCheck={false}
              className="bg-background"
            />
          </div>
        ))}
      </div>
      {a.type === "BAD_EMAIL" && v.typed && (
        <p className="text-xs text-muted-foreground">
          They typed <b className="text-foreground">{v.typed}</b>. The Master keeps the address they submitted from unless you change it here.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">Saved in the Master and in their binome sheet.</p>
        {v.code && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => openEdit({ code: v.code, field: fields[0].key })}>
            <Pencil /> All their data…
          </Button>
        )}
        <ActionButton id="save" pending={pending} busy={busy} icon={Check} variant="default" type="submit" disabled={!changed || !filled}>
          Save the fix
        </ActionButton>
      </div>
    </Well>
  )
}

function EmailChoice({ a, v }: { a: Alert; v: RegView }) {
  const quick = useQuick()
  const { resolve } = useActions()
  const { busy, pending, act } = useBusy()
  const opts = [
    { id: "keep", icon: Check, title: "Keep the address they submitted from", email: v.email, hint: "Already the one in use. Closes the alert.", run: () => resolve([a.id]) },
    { id: "typed", icon: ArrowRight, title: "Use the address they typed", email: v.typed, hint: "Replaces it in the Master and their binome sheet.", run: () => quick.edit(a, { Email: v.typed }) },
  ]
  return (
    <div className="space-y-3">
      <Who v={v} />
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={busy || !o.email}
            onClick={act(o.id, o.run)}
            className="group flex cursor-pointer flex-col gap-1 rounded-2xl border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              {pending === o.id ? <Spinner /> : <o.icon className="size-4 text-primary" />} {o.title}
            </span>
            <span className="break-all font-semibold text-heading">{o.email || "—"}</span>
            <span className="text-xs text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function RoutingPanel({ a, v }: { a: Alert; v: RegView }) {
  const quick = useQuick()
  const openMove = useUi((s) => s.openMoveDialog)
  const openEdit = useUi((s) => s.openEditDialog)
  const { busy, pending, act } = useBusy()
  const valid = (d: string) => (DEPTS.includes(d) ? d : "")
  const [c1, setC1] = React.useState(valid(v.c1))
  const [c2, setC2] = React.useState(valid(v.c2))
  const waiting = !v.binome && v.status === "UNASSIGNED" // not on hold, not out
  const values: Record<string, string> = {}
  if (c1 && c1 !== v.c1) values["1st Choice"] = c1
  if (c2 && c2 !== v.c2) values["2nd Choice"] = c2
  const assigns = waiting && !!values["1st Choice"]
  return (
    <Well as="form" onSubmit={(e) => { e.preventDefault(); act("save", () => quick.edit(a, values, assigns))() }}>
      <Who v={v} />
      {!DEPTS.includes(v.c1) && v.c1 && (
        <p className="text-sm">
          Their form says <b>“{v.c1}”</b> for the 1st choice.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${a.id}-c1`} className="text-sm font-semibold">1st choice</Label>
          <DeptSelect id={`${a.id}-c1`} value={c1} onChange={setC1} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${a.id}-c2`} className="text-sm font-semibold">2nd choice</Label>
          <DeptSelect id={`${a.id}-c2`} value={c2} onChange={setC2} />
        </div>
      </div>
      {c1 && c1 === c2 && <p className="text-xs text-warning">Both choices are {c1}.</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">{waiting ? "Saving a new 1st choice places them in a binome right away." : "Saved in the Master and in their binome sheet."}</p>
        {v.code && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => openEdit({ code: v.code, field: "1st Choice" })}>
            <Pencil /> All their data…
          </Button>
        )}
        {a.type === "NO_BINOME" && v.code && (
          <ActionButton id="move" pending={pending} busy={busy} icon={MoveRight} onClick={() => openMove({ code: v.code, alertId: a.id })}>
            Pick a binome…
          </ActionButton>
        )}
        <ActionButton id="save" pending={pending} busy={busy} icon={Check} variant="default" type="submit" disabled={!Object.keys(values).length}>
          {assigns ? "Save and place" : "Save"}
        </ActionButton>
      </div>
    </Well>
  )
}

const COMPARE: [string, (v: RegView) => string][] = [
  ["Name", (v) => `${v.first} ${v.family}`.trim()],
  ["Email", (v) => v.email],
  ["Phone", (v) => v.phone],
  ["Birth date", (v) => v.birth],
  ["Field · year", (v) => [v.field, v.year].filter(Boolean).join(" · ")],
  ["Choices", (v) => [v.c1, v.c2].filter(Boolean).join(" then ")],
  ["Available", (v) => v.availability],
  ["Registered", (v) => v.registered],
]

function DuplicatePanel({ a, v, old }: { a: Alert; v: RegView; old?: RegView }) {
  const quick = useQuick()
  const { resolve } = useActions()
  const { busy, pending, act } = useBusy()
  if (!old) return <p className="text-sm text-muted-foreground">The earlier registration is no longer in the Interviewees tab.</p>
  const answer = (label: string) => label !== "Registered" // the time always differs: not an answer
  const diffs = COMPARE.filter(([label, f]) => answer(label) && f(old) !== f(v)).length
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="w-24 px-3 py-2 font-semibold text-muted-foreground sm:w-28" />
              <th className="px-3 py-2 font-bold">Earlier · {old.code || "no code"}</th>
              <th className="px-3 py-2 font-bold">New submission</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {COMPARE.map(([label, f]) => {
              const differs = answer(label) && f(old) !== f(v)
              return (
                <tr key={label}>
                  <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
                  <td className="px-3 py-1.5 [overflow-wrap:anywhere]">{f(old) || "—"}</td>
                  <td className={cn("px-3 py-1.5 [overflow-wrap:anywhere]", differs && "bg-accent font-semibold text-accent-foreground")}>{f(v) || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{diffs ? `${diffs} answer${diffs > 1 ? "s" : ""} changed, highlighted.` : "Same answers both times."} The new submission was not given a code.</p>
      <div className="flex flex-wrap gap-2">
        <ActionButton id="old" pending={pending} busy={busy} icon={Check} variant="default" onClick={act("old", () => resolve([a.id]))}>
          Keep the earlier one
        </ActionButton>
        <ActionButton id="new" pending={pending} busy={busy} icon={ArrowRight} onClick={act("new", () => quick.dupNew(a, old.code || "the earlier registration"))} disabled={!diffs}>
          Use the new answers
        </ActionButton>
        <ActionButton id="sep" pending={pending} busy={busy} icon={UserPlus} onClick={act("sep", () => quick.dupSeparate(a))}>
          Different person
        </ActionButton>
      </div>
    </div>
  )
}

function PickPanel({ a, f }: { a: Alert; f: FormView }) {
  const quick = useQuick()
  const ivs = useVic((s) => s.state?.interviewees) ?? NO_IVS
  const { busy, pending, act } = useBusy()
  const [code, setCode] = React.useState("")
  const home = f.binome || f.subBinome
  const list = React.useMemo(() => [...ivs].sort((x, y) => Number(y.binome === home) - Number(x.binome === home)), [ivs, home])
  const iv = ivs.find((i) => i.code.toUpperCase() === code.trim().toUpperCase())
  return (
    <Well as="form" onSubmit={(e) => { e.preventDefault(); if (iv) act("pick", () => quick.pickCandidate(a, iv.code))() }}>
      <FormFacts f={f} />
      <div className="space-y-1.5 border-t pt-3">
        <Label htmlFor={`${a.id}-pick`} className="text-sm font-semibold">Who did they interview?</Label>
        <div className="flex gap-2">
          <Input id={`${a.id}-pick`} value={code} onChange={(e) => setCode(e.target.value)} list={`${a.id}-codes`} placeholder={home ? `A code of ${home}, e.g. IT.07` : "IT.07"} autoComplete="off" spellCheck={false} className="bg-background" />
          <ActionButton id="pick" pending={pending} busy={busy} icon={Link2} variant="default" type="submit" disabled={!iv}>
            Link the form
          </ActionButton>
        </div>
        <datalist id={`${a.id}-codes`}>
          {list.map((i) => (
            <option key={i.code} value={i.code}>
              {i.name + (i.binome ? " · " + i.binome : "")}
            </option>
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          {iv ? (
            <>
              <b className="text-foreground">{iv.name}</b> · {iv.binome || "no binome"} · the form counts as their interview.
            </>
          ) : (
            `Candidates of ${home || "their binome"} are listed first.`
          )}
        </p>
      </div>
    </Well>
  )
}

function FormsPanel({ a, f, first }: { a: Alert; f: FormView; first?: FormView }) {
  const quick = useQuick()
  const { busy, pending, act } = useBusy()
  if (!first) return <><Well><FormFacts f={f} /></Well><AlertAnswers keys={[f.key]} /></>
  const keep = (which: "first" | "latest") => (
    <ActionButton id={which} pending={pending} busy={busy} icon={Check} variant="soft" onClick={act(which, () => quick.keepForm(a, which))}>
      Keep this one
    </ActionButton>
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Well className="flex flex-col">
        <FormFacts f={first} title="First form" right={keep("first")} />
      </Well>
      <Well className="flex flex-col">
        <FormFacts f={f} title="Latest form" right={keep("latest")} />
      </Well>
      <div className="sm:col-span-2">
        <AlertAnswers keys={[first.key, f.key]} />
      </div>
    </div>
  )
}

const p2 = (n: number) => String(n).padStart(2, "0")
/** The value the sheet probably meant: last year's date in this year, a morning hour that was meant as afternoon. */
function guess(q: Q<"iv">) {
  let date = q.date
  let time = q.time
  if (q.check === "YEAR" && date && q.regYear) date = q.regYear + date.slice(4)
  if (q.check === "HOUR" && time) {
    const h = Number(time.slice(0, 2))
    if (h < 7) time = p2(h + 12) + time.slice(2)
  }
  return { date, time }
}

function OddPanel({ a, q }: { a: Alert; q: Q<"iv"> }) {
  const quick = useQuick()
  const { busy, pending, act } = useBusy()
  const g = guess(q)
  const [date, setDate] = React.useState(g.date)
  const [time, setTime] = React.useState(g.time)
  const [contacted, setContacted] = React.useState(q.contacted === "Not yet" || !q.contacted ? "Yes" : q.contacted)
  const isContact = q.check === "CONTACT"
  const changed = isContact ? contacted !== q.contacted : date !== q.date || time !== q.time
  const suggested = !isContact && (g.date !== q.date || g.time !== q.time)
  return (
    <Well as="form" onSubmit={(e) => { e.preventDefault(); act("save", () => quick.setCell(a, isContact ? { contacted } : { date, time }))() }}>
      <p className="text-sm">
        <b>{q.code}</b>
        <span className="text-muted-foreground">
          {" · "}now {q.date ? `${q.date.split("-").reverse().join("/")} at ${q.time}` : "no date"} · Contacted “{q.contacted || "empty"}”
        </span>
      </p>
      {isContact ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${a.id}-ct`} className="text-sm font-semibold">Contacted</Label>
          <Select value={contacted} onValueChange={setContacted}>
            <SelectTrigger id={`${a.id}-ct`} className="w-full bg-background sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor={`${a.id}-d`} className="text-sm font-semibold">Interview day</Label>
            <Input id={`${a.id}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${a.id}-t`} className="text-sm font-semibold">Time</Label>
            <Input id={`${a.id}-t`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-background" />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">{suggested ? "Prefilled with the likely fix. " : ""}Written in the binome's own cells of their sheet.</p>
        <ActionButton id="save" pending={pending} busy={busy} icon={Check} variant="default" type="submit" disabled={!changed || (!isContact && !(date && time))}>
          Write it in the sheet
        </ActionButton>
      </div>
    </Well>
  )
}

/** Screening's note split in two: why it was held, then what admins decided ("Approved by …", "Rejection sent …"). */
function splitScreening(s: string) {
  const parts = s.replace(/^Held: /, "").split("; ").map((p) => p.trim()).filter(Boolean)
  const decision = (p: string) => /^(Approved|Declined|Restored|VIC member|Rejection sent)\b/.test(p)
  return { reasons: parts.filter((p) => !decision(p)), decisions: parts.filter(decision) }
}

function RiskMeter({ risk, holdAt }: { risk: number; holdAt: number }) {
  const held = risk >= holdAt
  return (
    <div className="flex min-w-40 flex-1 items-center gap-3 sm:max-w-64" title={`Held at ${holdAt} or more`}>
      <span className={cn("num shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", held ? "bg-warning-soft text-warning" : "bg-secondary text-muted-foreground")}>
        Risk {risk}
      </span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", held ? "bg-vic-orange" : "bg-primary/50")} style={{ width: `${Math.max(4, Math.min(100, risk))}%` }} />
        <span className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${holdAt}%` }} />
      </span>
    </div>
  )
}

/** A held application as the admin reads it: the score and its reasons, then every free-text answer, the flagged ones marked. */
function ReviewPanel({ v, app }: { v: RegView; app?: AppView }) {
  const holdAt = useVic((s) => s.state?.screening?.holdAt ?? 50)
  if (!app) return <Well><Who v={v} /></Well>
  const { reasons, decisions } = splitScreening(app.screening)
  const flagged = (label: string) => reasons.some((r) => r.startsWith(label + ":"))
  const dept = v.c1 || "this department"
  const answers: [string, string, boolean][] = [
    ["Why VIC", app.whyVic, flagged("Why VIC")],
    [`Why ${dept}`, app.motivation, flagged(`Why ${dept}`)],
    ["Department questions", app.deptQuestions, false],
    ["Other clubs", app.clubs, false],
    ["Anything to add", app.anything, false],
  ]
  return (
    <Well>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <Who v={v} />
        </div>
        {app.risk !== null && <RiskMeter risk={app.risk} holdAt={holdAt} />}
      </div>
      {reasons.length > 0 && (
        <ul className="space-y-1.5" aria-label="Why it was held">
          {reasons.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="[overflow-wrap:anywhere]">{r}</span>
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-2 border-t pt-3">
        {answers.map(([label, text, bad]) => (
          <div key={label} className={cn("rounded-xl border bg-background px-3 py-2", bad && "border-warning/50 bg-warning-soft/40")}>
            <dt className={cn("text-xs font-bold", bad ? "text-warning" : "text-muted-foreground")}>{label}</dt>
            <dd className={cn("mt-0.5 whitespace-pre-line text-sm leading-relaxed [overflow-wrap:anywhere]", !text.trim() && "italic text-muted-foreground")}>
              {text.trim() || "No answer"}
            </dd>
          </div>
        ))}
      </dl>
      {decisions.length > 0 && <p className="text-xs text-muted-foreground">{decisions.join(" · ")}</p>}
    </Well>
  )
}

/* ---------- the section in the detail pane ---------- */

interface Link {
  key: string
  label: string
  target?: LocateTarget
  href?: string
}

export function QuickActions({ alert: a }: { alert: Alert }) {
  const quick = useQuick()
  const { resolve } = useActions()
  const openMove = useUi((s) => s.openMoveDialog)
  const openMembers = useUi((s) => s.openMemberSheet)
  const binome = useVic((s) => s.state?.binomes.find((b) => b.code === a.binome))
  const member = useVic((s) => {
    const m = qOf(a, "member")
    return m ? s.state?.unpaired.find((u) => u.email === m.email) || s.state?.teamList.find((u) => u.email === m.email) : undefined
  })
  const { busy, pending, act } = useBusy()

  let hint = ""
  let panel: React.ReactNode = null
  const buttons: React.ReactNode[] = []
  const links: Link[] = []
  const btn = (id: string, icon: typeof Mail, label: string, run: () => Promise<unknown> | void, variant: "default" | "outline" = "outline") =>
    buttons.push(
      <ActionButton key={id} id={id} pending={pending} busy={busy} icon={icon} variant={variant} onClick={act(id, async () => { await run() })}>
        {label}
      </ActionButton>
    )

  // a form's own row: Interview Responses, or Dashboard Interviews for a form filled in the dashboard
  const FORM_ROW: Link = { key: "form", label: "The form response", target: "form" }
  const reg = qOf(a, "reg")
  const iv = qOf(a, "iv")
  const log = qOf(a, "log")

  if (reg && TYPO.includes(a.type)) {
    hint = "Type the right value, or keep it if it is actually fine."
    panel = <TypoPanel key={a.id} a={a} v={reg.iv} />
    btn("fine", Check, "Looks fine", () => resolve([a.id]))
    btn("mail", Mail, "Email the candidate", () => quick.mail([a.id], "candidate"))
    links.push({ key: "form", label: "Their form response", target: "form" })
  } else if (reg && a.type === "EMAIL_MISMATCH") {
    hint = "Pick the address the recruitment should use."
    panel = <EmailChoice a={a} v={reg.iv} />
    links.push({ key: "form", label: "Their form response", target: "form" })
  } else if (reg && ROUTING.includes(a.type)) {
    hint = a.type === "SAME_CHOICES" ? "They chose this department twice because they really want it. Nothing to fix; set a 2nd choice only if they ask for one." : "Set the department they belong in."
    panel = <RoutingPanel key={a.id} a={a} v={reg.iv} />
    if (a.type === "SAME_CHOICES") btn("fine", Check, "It's fine", () => resolve([a.id]), "default")
    links.push({ key: "form", label: "Their form response", target: "form" }, { key: "iv", label: "Interviewees row", target: "iv" })
  } else if (reg && a.type === "DUPLICATE_REGISTRATION") {
    hint = "Compare the two submissions, then decide which answers stand."
    panel = <DuplicatePanel a={a} v={reg.iv} old={reg.old} />
    links.push({ key: "form", label: "The new form response", target: "form" })
  } else if (reg && a.type === "NEEDS_REVIEW") {
    hint = "Screening held this application. Read the answers, then send it to a binome or keep it out."
    panel = <ReviewPanel key={a.id} v={reg.iv} app={reg.app} />
    btn("approve", ThumbsUp, "Approve", () => quick.approve([a]), "default")
    btn("decline", ThumbsDown, "Decline", () => quick.decline([a]))
    links.push({ key: "form", label: "Their form response", target: "form" }, { key: "iv", label: "Interviewees row", target: "iv" })
  } else if (reg && a.type === "VIC_MEMBER") {
    hint = "They're on the VIC members list but already have a binome. Decline takes them out of its sheet; mute the alert to keep them."
    panel = <ReviewPanel key={a.id} v={reg.iv} app={reg.app} />
    btn("decline", ThumbsDown, "Decline", () => quick.decline([a]), "default")
    btn("keep", Check, "Keep them", () => quick.mute([a.id]))
    links.push({ key: "iv", label: "Interviewees row", target: "iv" })
  } else if (TIMING.includes(a.type) && a.code) {
    hint = "Remind the binome, or hand the candidate to someone else."
    if (a.binome) btn("nudge", Send, "Nudge the binome", () => quick.mail([a.id], "binome"), "default")
    btn("move", MoveRight, "Move…", () => openMove({ code: a.code, alertId: a.id }))
    btn("cover", UserPlus, "Cover…", () => openMembers({ mode: "cover", codes: a.code, alertId: a.id }))
    if (a.binome) links.push({ key: "cell", label: `Their row in ${a.binome}'s sheet`, target: "cell" })
  } else if (a.type === "UNPAIRED_MEMBER" && qOf(a, "member")) {
    const m = qOf(a, "member")!
    hint = "Leave them out of the binomes, or give them a seat."
    btn("exclude", UserX, "Exclude", () => quick.exclude(a), "default")
    btn("place", UserPlus, "Place in a binome…", () => openMembers({ mode: "replace", inEmail: m.email, inName: member?.name || "", alertId: a.id }))
    links.push({ key: "team", label: "Their Team row", target: "team" })
  } else if (log && a.type === "UNKNOWN_INTERVIEWEE") {
    hint = "Link the form to the candidate it was about, or ask its sender to send it again."
    panel = <><PickPanel key={a.id} a={a} f={log.form} /><AlertAnswers key={"ans" + a.id} keys={[log.form.key]} /></>
    btn("mail", Mail, "Ask to send it again", () => quick.mail([a.id], "submitter"))
    links.push({ key: "log", label: "Interview Log row", target: "log" }, FORM_ROW)
  } else if (log && WHO.includes(a.type)) {
    const to = log.form.subBinome
    hint = a.type === "NOT_ASSIGNED" ? "Give the candidate to the binome that interviewed them." : "Keep it as it is, or move the candidate to the binome that really interviewed."
    panel = <><Well><FormFacts f={log.form} /></Well><AlertAnswers key={"ans" + a.id} keys={[log.form.key]} /></>
    if (a.type !== "NOT_ASSIGNED") btn("fine", Check, "It's fine, keep it", () => resolve([a.id]), "default")
    if (a.code && to && to !== a.binome) btn("move", MoveRight, `Move ${a.code} to ${to}…`, () => openMove({ code: a.code, binome: to, alertId: a.id }), a.type === "NOT_ASSIGNED" ? "default" : "outline")
    else if (a.code && a.type === "NOT_ASSIGNED") btn("move", MoveRight, "Pick a binome…", () => openMove({ code: a.code, alertId: a.id }), "default")
    links.push({ key: "log", label: "Interview Log row", target: "log" }, FORM_ROW)
  } else if (log && a.type === "DUPLICATE_INTERVIEW") {
    hint = "Two forms for one interview. Choose the one that counts."
    panel = <FormsPanel a={a} f={log.form} first={log.first} />
    links.push({ key: "log", label: "Latest form in the log", target: "log" }, FORM_ROW)
  } else if (iv && a.type === "ODD_VALUE") {
    hint = iv.check === "CONTACT" ? "They have a date, so they were probably contacted." : "Fix the date or time the binome typed, or snooze it if it is right."
    panel = <OddPanel key={a.id} a={a} q={iv} />
    links.push({ key: "cell", label: `The cell in ${a.binome}'s sheet`, target: "cell" })
  } else if (log && a.type === "ODD_VALUE") {
    links.push({ key: "log", label: "Interview Log row", target: "log" }, FORM_ROW)
  } else if (a.type === "INTEGRITY" && qOf(a, "integ")) {
    const r = repairOf(a)
    hint = r ? "The script can put it right in the binome sheet." : "Fix it in the sheet; the alert closes at the next sheet check."
    if (r) btn("repair", r === "reshare" ? ShieldCheck : Wrench, REPAIR_LABEL[r], () => quick.repair([a]), "default")
    links.push({ key: "cell", label: `The spot in ${a.binome}'s sheet`, target: "cell" })
  } else if (a.type === "FILE_ERROR") {
    const r = repairOf(a)
    hint = r ? "Try the failed step again now instead of waiting for the next sync." : "Something only a person can do: fix it, then mark it resolved."
    if (r) btn("retry", Wrench, REPAIR_LABEL.retry, () => quick.repair([a]), "default")
    if (a.binome) links.push({ key: "binomes", label: "Binomes row (File ID)", target: "binomes" })
  }

  if (binome?.fileUrl && !links.some((l) => l.target === "cell")) links.push({ key: "sheet", label: `${binome.code}'s sheet`, href: binome.fileUrl })
  if (!panel && !buttons.length && !links.length) return null

  const goTo = links.length > 0 && (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
      <span className="mr-1 text-muted-foreground">Go to</span>
      {links.map((l) =>
        l.href ? (
          <Button key={l.key} asChild variant="link" size="sm" className="h-7 px-2">
            <a href={l.href} target="_blank" rel="noopener noreferrer">
              <FileText /> {l.label} <ExternalLink className="size-3 opacity-60" />
            </a>
          </Button>
        ) : (
          <Button key={l.key} variant="link" size="sm" className="h-7 px-2" disabled={busy} onClick={act("go-" + l.key, () => quick.locate(a, l.target!))}>
            {pending === "go-" + l.key ? <Spinner /> : <FileText />} {l.label} <ExternalLink className="size-3 opacity-60" />
          </Button>
        )
      )}
    </div>
  )
  // nothing to do here but open a sheet: just the links
  if (!panel && !buttons.length) return goTo || null

  return (
    <section aria-label="Quick actions" className="space-y-4 border-t pt-5">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-bold">
          <Sparkles className="size-4 text-primary" /> Quick fix
        </h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {panel}
      {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}
      {goTo}
    </section>
  )
}

/* ---------- the one-click action on a list row ---------- */

export function RowQuickButton({ alert: a, onOpen }: { alert: Alert; onOpen: () => void }) {
  const quick = useQuick()
  const { resolve } = useActions()
  const { busy, pending, act } = useBusy()
  const r = rowAction(a)
  if (!r) return null
  const run =
    r.kind === "open" ? async () => onOpen()
    : r.kind === "nudge" ? () => quick.mail([a.id], "binome")
    : r.kind === "exclude" ? () => quick.exclude(a)
    : r.kind === "repair" ? () => quick.repair([a])
    : () => resolve([a.id])
  const titles = { open: "Open the quick fix", nudge: `Email ${a.binome} about it`, exclude: "Tick Exclude in the Team tab", repair: "Let the script repair it", keep: "Keep it as it is and close the alert" }
  return (
    <Button size="sm" variant="soft" className="h-7 shrink-0 self-center px-2.5 text-xs" disabled={busy} onClick={act("row", run)} title={titles[r.kind]}>
      {pending === "row" ? <Spinner className="size-3.5" /> : <r.icon />} {r.label}
    </Button>
  )
}

/* ---------- snooze / mute menu (detail pane and bulk bar) ---------- */

export function SnoozeMenu({ alerts, onDone, size = "sm", variant = "outline" }: { alerts: Alert[]; onDone?: () => void; size?: "sm" | "default"; variant?: "outline" | "ghost" }) {
  const quick = useQuick()
  const busy = useVic((s) => s.busy)
  const ok = alerts.length > 0 && alerts.every(snoozable)
  const ahead = alerts.length > 0 && alerts.every((a) => a.q?.kind === "iv" && a.q.ahead)
  const ids = alerts.map((a) => a.id)
  const done = (p: Promise<unknown>) => p.then(() => onDone?.())
  const items: [SnoozeFor, string][] = [
    ["4h", "For 4 hours"],
    ["24h", "Until tomorrow"],
    ["3d", "For 3 days"],
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={busy || !ok} title={ok ? "Put it aside for a while, or for good" : "Manual edits can't be snoozed"}>
          <BellOff /> Snooze
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Hide {alerts.length > 1 ? `these ${alerts.length} alerts` : "this alert"}; it comes back if still true
        </DropdownMenuLabel>
        {items.map(([k, label]) => (
          <DropdownMenuItem key={k} onSelect={() => done(quick.snooze(ids, k))}>
            <Clock /> {label}
          </DropdownMenuItem>
        ))}
        {ahead && (
          <DropdownMenuItem onSelect={() => done(quick.snooze(ids, "interview"))}>
            <Clock /> Until the interview
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => done(quick.mute(ids))}>
          <VolumeX />
          <span className="flex flex-col">
            <span>Mute for good</span>
            <span className="text-xs text-muted-foreground">Never raised again; undo from Muted</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UnmuteButton({ ids, onDone }: { ids: string[]; onDone?: () => void }) {
  const quick = useQuick()
  const busy = useVic((s) => s.busy)
  return (
    <Button size="sm" variant="outline" disabled={busy || !ids.length} onClick={() => quick.unmute(ids).then(() => onDone?.())}>
      <Undo2 /> Unmute
    </Button>
  )
}
