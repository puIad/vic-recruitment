"use client"

import * as React from "react"
import { Save, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useTeamCells } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { TeamField, WebState } from "@/lib/vic/types"

const DEPARTMENTS = ["Committee Board", "Council Board", "IT", "COMM", "FLER", "HR"]
const SIDES = ["HR", "IT", "COMM", "FLER", "ALL"]
const lc = (s: string) => s.trim().toLowerCase()
/** Pair As suggested from the department, as sectionToPair_ (Team.gs) does */
const pairOf = (dept: string) => (/committ/i.test(dept) ? "ALL" : /council/i.test(dept) ? "HR" : SIDES.includes(dept.toUpperCase()) ? dept.toUpperCase() : "")
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Where someone sits: their locked binome and their draft, by email. */
export function seatsOf(s: WebState, email: string) {
  const e = lc(email), holds = (b: WebState["binomes"][number]) => b.people.some((p) => lc(p.email) === e)
  return { binome: s.binomes.find((b) => b.status !== "DRAFT" && holds(b)), draft: s.binomes.find((b) => b.status === "DRAFT" && holds(b)) }
}

/** tagWarnings_'s rule (Members.gs) on what the page holds: the binome's members no longer cover its tag. */
function tagWarning(s: WebState, email: string, pairAs: string) {
  const b = seatsOf(s, email).binome
  if (!b) return ""
  const side = (e: string) => (lc(e) === lc(email) ? pairAs : s.teamList.find((m) => lc(m.email) === lc(e))?.pairAs)
  const sides = b.people.map((p) => side(p.email))
  if (sides.some((x) => !x)) return ""
  if (/\bALL\b/i.test(b.tag)) return sides.includes("ALL") ? "" : `${b.code} is tagged ALL but no member would be a board lead.`
  const missing = b.tag.split(/\s*&\s*/).filter((d) => d && !sides.includes(d.toUpperCase()))
  return missing.length ? `${b.code} (${b.tag}) would have no member on the ${missing.join(" / ")} side. It keeps receiving those candidates until you change its department (Binomes › ⋯ › Change department…).` : ""
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="font-semibold">{label}</Label>
      {children}
    </div>
  )
}

function Choice({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder || "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {(value && !options.includes(value) ? [value, ...options] : options).map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AddForm() {
  const { teamAddCheck, teamAdd } = useActions()
  const close = useUi((s) => s.closeTeamDialog)
  const openSheet = useUi((s) => s.openMemberSheet)
  const team = useVic((s) => s.state?.teamList) || []
  const busy = useVic((s) => s.busy)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [dept, setDept] = React.useState("")
  const [pairAs, setPairAs] = React.useState("")
  const [exp, setExp] = React.useState(false)
  const [warnings, setWarnings] = React.useState<string[]>([])
  const taken = team.some((m) => lc(m.email) === lc(email))
  const ok = name.trim() && EMAIL.test(email.trim()) && !taken && dept && pairAs

  const check = async () => {
    if (!EMAIL.test(email.trim()) || taken) return
    const r = await teamAddCheck(email.trim(), name.trim(), dept)
    if (!r) return
    setExp(r.experienced)
    setWarnings(r.warnings)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok) return
    const m = { name: name.trim(), email: lc(email), dept, pairAs, experienced: exp }
    if (!(await teamAdd(m))) return
    close()
    openSheet({ mode: "replace", inEmail: m.email, inName: m.name })
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ta-name" label="Name">
          <Input id="ta-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={check} autoComplete="off" autoFocus />
        </Field>
        <Field id="ta-email" label="Email">
          <Input id="ta-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={check} autoComplete="off" aria-invalid={taken || undefined} />
          {taken && <p className="text-xs text-danger">Already in the Team tab.</p>}
        </Field>
        <Field id="ta-dept" label="Department">
          <Choice id="ta-dept" value={dept} options={DEPARTMENTS} onChange={(v) => { setDept(v); setPairAs(pairOf(v)) }} />
        </Field>
        <Field id="ta-pair" label="Pairs as">
          <Choice id="ta-pair" value={pairAs} options={SIDES} onChange={setPairAs} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={exp} onCheckedChange={(v) => setExp(v === true)} /> Experienced (has interviewed before)
      </label>
      {warnings.map((w) => <p key={w} className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{w}</p>)}
      <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">
        Written in the Team tab and logged in Member Changes. Nobody is emailed until they join a binome; Place… opens next.
      </p>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={busy || !ok}>{busy ? <Spinner /> : <UserPlus />} Add member</Button>
      </DialogFooter>
    </form>
  )
}

function FixForm({ email }: { email: string }) {
  const { teamFix, teamCells } = useActions()
  const close = useUi((s) => s.closeTeamDialog)
  const s = useVic((x) => x.state)
  const busy = useVic((x) => x.busy)
  const m = s?.teamList.find((x) => lc(x.email) === lc(email))
  const seats = s ? seatsOf(s, email) : { binome: undefined, draft: undefined }
  const seat = (seats.binome || seats.draft)?.people.find((p) => lc(p.email) === lc(email))
  const was = seat?.name || m?.name || ""
  const [name, setName] = React.useState(was)
  const [mail, setMail] = React.useState(email)
  const changed = name.trim() !== was || lc(mail) !== lc(email)
  const ok = changed && name.trim() && EMAIL.test(mail.trim())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok) return
    // a name for someone in no binome is a pending change to the Team row; everything else is Correct name or email's direct write
    const done = lc(mail) === lc(email) && m && !seats.binome && !seats.draft
      ? await teamCells(email, [{ field: "Full Name", value: name.trim(), seen: m.name }])
      : await teamFix(email, name.trim() === was ? "" : name.trim(), lc(mail) === lc(email) ? "" : lc(mail))
    if (done) close()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="tf-name" label="Name"><Input id="tf-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus /></Field>
        <Field id="tf-email" label="Email"><Input id="tf-email" type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="off" /></Field>
      </div>
      {m?.notes && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">Team tab note: {m.notes}</p>}
      <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">
        For a typo, the same person. Someone else taking the seat is Change members.
        {seats.binome ? ` An email fix carries to ${seats.binome.code}'s sheet and sharing, and the new address gets one short email.` : ""}
      </p>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={busy || !ok}>{busy ? <Spinner /> : <Save />} Correct</Button>
      </DialogFooter>
    </form>
  )
}

function DeptForm({ email, resume }: { email: string; resume?: boolean }) {
  const { teamCells } = useActions()
  const close = useUi((s) => s.closeTeamDialog)
  const s = useVic((x) => x.state)
  const busy = useVic((x) => x.busy)
  const mine = useTeamCells()[lc(email)] || {}
  const m = s?.teamList.find((x) => lc(x.email) === lc(email))
  const curDept = String(mine.Department ?? m?.dept ?? ""), curPair = String(mine["Pair As"] ?? m?.pairAs ?? "")
  const [dept, setDept] = React.useState(curDept)
  const [pairAs, setPairAs] = React.useState(curPair === "SKIP" ? "" : curPair)
  if (!s || !m) return <p className="text-sm text-muted-foreground">They are no longer in the Team tab.</p>
  const cells: { field: TeamField; value: boolean | string; seen: boolean | string }[] = []
  if (dept && dept !== curDept) cells.push({ field: "Department", value: dept, seen: curDept })
  if (pairAs && pairAs !== curPair) cells.push({ field: "Pair As", value: pairAs, seen: curPair })
  if (resume) cells.push({ field: "Exclude", value: false, seen: !!(mine.Exclude ?? m.exclude) })
  const warn = pairAs ? tagWarning(s, email, pairAs) : ""

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cells.length && (await teamCells(email, cells))) close()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="td-dept" label="Department"><Choice id="td-dept" value={dept} options={DEPARTMENTS} onChange={setDept} /></Field>
        <Field id="td-pair" label="Pairs as"><Choice id="td-pair" value={pairAs} options={SIDES} onChange={setPairAs} placeholder={resume ? "Choose a side to interview" : undefined} /></Field>
      </div>
      {warn && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{warn}</p>}
      <p className="rounded-2xl bg-muted/70 p-3 text-sm text-muted-foreground">Only the Team row changes: a locked binome's department never moves with it.</p>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
        <Button type="submit" disabled={busy || !cells.length || (resume && !pairAs)}>{busy ? <Spinner /> : <Save />} Save</Button>
      </DialogFooter>
    </form>
  )
}

const TITLE = { add: ["Add member", "Someone new on the team, one person."], fix: ["Correct name or email", "A typo in the name or address of the same person."], dept: ["Department and Pair As", "Which side they interview for."] }

/** Add member, Correct name or email, Department & Pair As (docs/admin-features.md › Add, edit and remove Team members). */
export function TeamDialog() {
  const d = useUi((s) => s.teamDialog)
  const close = useUi((s) => s.closeTeamDialog)
  const [title, desc] = TITLE[d?.mode || "add"]
  return (
    <Dialog open={!!d?.open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">{d?.resume ? "Interviewing again" : title}</DialogTitle>
          <DialogDescription>{d?.resume ? "Choose the side they interview for." : desc}{d?.email ? ` ${d.email}` : ""}</DialogDescription>
        </DialogHeader>
        {d?.mode === "add" && <AddForm key={d.nonce} />}
        {d?.mode === "fix" && d.email && <FixForm key={d.nonce} email={d.email} />}
        {d?.mode === "dept" && d.email && <DeptForm key={d.nonce} email={d.email} resume={d.resume} />}
      </DialogContent>
    </Dialog>
  )
}
