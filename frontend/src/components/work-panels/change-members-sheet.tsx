"use client"

import * as React from "react"
import { Repeat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { typedCodes } from "@/lib/vic/codes"
import { useVic } from "@/lib/vic/store"
import { useUi, type ChangeMode, type MemberSheetOpen } from "@/lib/vic/ui"
import type { Binome, Unpaired, WebState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { MemberName, MemberNames } from "@/components/member-name"

const NOBODY = "__none__"

function Field({ label, optional, children, className }: { label: string; optional?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-semibold">
        {label} {optional && <i className="font-normal text-muted-foreground">({optional})</i>}
      </Label>
      {children}
    </div>
  )
}

function BinomeSelect({ value, onChange, binomes, id }: { value: string; onChange: (v: string) => void; binomes: Binome[]; id?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {binomes.map((b) => (
          <SelectItem key={b.code} value={b.code}>
            {b.code} · <MemberNames names={b.members} empty="empty" />
            {b.status === "PAUSED" ? " (paused)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PeopleSelect({ value, onChange, binome, emptySeat, placeholder = "Choose a binome first" }: { value: string; onChange: (v: string) => void; binome?: Binome; emptySeat?: boolean; placeholder?: string }) {
  const seat = !!(binome && emptySeat && binome.people.length < 2)
  return (
    <Select value={value || (seat ? NOBODY : "")} onValueChange={(v) => onChange(v === NOBODY ? "" : v)} disabled={!binome}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {seat && <SelectItem value={NOBODY}>Nobody (fill the empty seat)</SelectItem>}
        {binome?.people.map((p) => (
          <SelectItem key={p.email} value={p.email}>
            <MemberName name={p.name || p.email} /> · {p.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function UnpairedSelect({ value, onChange, list, other }: { value: string; onChange: (v: string) => void; list: Unpaired[]; other: string }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={!list.length}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={list.length ? "Choose…" : "Nobody is unpaired"} />
      </SelectTrigger>
      <SelectContent>
        {list.map((m) => (
          <SelectItem key={m.email} value={m.email} disabled={m.email === other || !!m.draft}>
            <MemberName name={m.name || m.email} /> · {m.pairAs}
            {m.draft ? ` (in draft ${m.draft})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function hintFor(mode: ChangeMode, st: WebState) {
  const set = st.settings
  const mails = set.testMode ? "Test mode: the emails only reach admins." : ""
  if (mode === "cover")
    return `The Binomes tab is not changed. The cover person counts as a member for these interviews only, gets ${
      set.shareFiles ? "view-only access to the binome sheet" : `no sheet access (${set.testMode ? "test mode" : "sharing is off"})`
    } and is emailed the candidates; the binome is told and keeps filling its sheet. ${mails}`
  if (mode === "pair")
    return `A new binome sheet is created in the Binome Sheets folder${
      set.shareFiles ? " and shared with both" : ` (${set.testMode ? "test mode" : "sharing is off"}: not shared)`
    }. The tag follows the draft rules. ${mails || "Both are emailed."}`
  return (
    (mode === "swap" ? "Each member moves to the other binome. " : "Interviewees stay with the binome. ") +
    "Leavers lose edit access to the binome sheet; " +
    (set.shareFiles ? "newcomers get it. " : `${set.testMode ? "test mode" : "sharing is off"}: newcomers are not given access. `) +
    (mails || "Both are emailed.")
  )
}

function Form({ init, state }: { init: MemberSheetOpen; state: WebState }) {
  const { changeMember, swapMembers, newBinome, addCover, resolve } = useActions()
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs)
  const close = useUi((s) => s.closeMemberSheet)

  const locked = React.useMemo(() => state.binomes.filter((b) => b.status !== "DRAFT"), [state.binomes])
  const byCode = (c: string) => state.binomes.find((b) => b.code === c)

  const [mode, setMode] = React.useState<ChangeMode>(init.mode || "replace")
  const [reason, setReason] = React.useState("")
  // replace
  const [binome, setBinome] = React.useState(init.binome || "")
  const [outEmail, setOutEmail] = React.useState("")
  const [inEmail, setInEmail] = React.useState(init.inEmail || "")
  const [inName, setInName] = React.useState(init.inName || "")
  // swap
  const [swA, setSwA] = React.useState(init.binome || "")
  const [swAm, setSwAm] = React.useState("")
  const [swB, setSwB] = React.useState("")
  const [swBm, setSwBm] = React.useState("")
  // new binome from two unpaired members
  const [pA, setPA] = React.useState(init.mode === "pair" ? init.inEmail || "" : "")
  const [pB, setPB] = React.useState("")
  // cover
  const [codes, setCodes] = React.useState(init.codes || "")
  const [cvEmail, setCvEmail] = React.useState("")
  const [cvName, setCvName] = React.useState("")
  const [cvOut, setCvOut] = React.useState("")

  // a Team email always brings its own name (never keep the previous person's); an outside email starts empty
  const autoName = React.useRef(init.inName || "")
  const onEmail = (set: (v: string) => void, setName: (v: string) => void, current: string) => (v: string) => {
    set(v)
    const m = state.teamList.find((x) => x.email === v.trim().toLowerCase())
    if (m) {
      setName(m.name)
      autoName.current = m.name
    } else if (current === autoName.current) {
      setName("")
      autoName.current = ""
    }
  }

  const typed = React.useMemo(() => typedCodes(codes).map((c) => ({ c, iv: state.interviewees.find((i) => i.code === c) })), [codes, state.interviewees])
  const coverBins = Array.from(new Set(typed.filter((x) => x.iv && x.iv.binome).map((x) => x.iv!.binome)))
  const coverBinome = coverBins.length === 1 ? byCode(coverBins[0]) : undefined

  const hint = hintFor(mode, state)
  const running = jobs.some((j) => ["changeMember", "swapMembers", "newBinome", "addCover"].includes(j.action))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    let ok = false
    if (mode === "cover") {
      if (!codes.trim()) return
      ok = await addCover({ codes, inEmail: cvEmail.trim(), inName: cvName.trim(), outEmail: cvOut, reason: reason.trim() }, hint)
    } else if (mode === "pair") {
      if (!(pA && pB)) return
      ok = await newBinome({ emailA: pA, emailB: pB, reason: reason.trim() }, hint)
    } else if (mode === "swap") {
      if (!(swA && swB)) return
      ok = await swapMembers({ binomeA: swA, emailA: swAm, binomeB: swB, emailB: swBm, reason: reason.trim() }, hint)
    } else {
      if (!binome) return
      ok = await changeMember({ binome, outEmail, inEmail: inEmail.trim(), inName: inName.trim(), reason: reason.trim() }, hint)
    }
    if (!ok) return
    close()
    if (init.alertId) await resolve([init.alertId])
  }

  const canSubmit = mode === "cover" ? !!codes.trim() : mode === "swap" ? !!(swA && swB) : mode === "pair" ? !!(pA && pB && pA !== pB) : !!binome

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-5">
        <Tabs value={mode} onValueChange={(v) => setMode(v as ChangeMode)}>
          <TabsList className="grid w-full grid-cols-4 rounded-full">
            <TabsTrigger value="replace" className="rounded-full">Replace</TabsTrigger>
            <TabsTrigger value="swap" className="rounded-full">Swap</TabsTrigger>
            <TabsTrigger value="pair" className="rounded-full">New binome</TabsTrigger>
            <TabsTrigger value="cover" className="rounded-full">Cover</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {mode === "replace" && "A member leaves a binome and someone from the team joins, or the seat is only emptied."}
          {mode === "swap" && "Two members trade binomes in one step. If a write fails, both are rolled back."}
          {mode === "pair" && "Two unpaired members become a new binome together, without touching the existing ones."}
          {mode === "cover" && "A temporary stand-in for chosen candidates. The Binomes tab does not change."}
        </p>

        {mode === "replace" && (
          <div className="space-y-4">
            <Field label="Binome">
              <BinomeSelect value={binome} onChange={(v) => { setBinome(v); setOutEmail("") }} binomes={locked} />
            </Field>
            <Field label="Who leaves">
              <PeopleSelect value={outEmail} onChange={setOutEmail} binome={byCode(binome)} emptySeat />
            </Field>
            <Field label="Who joins · email">
              <Input value={inEmail} onChange={(e) => onEmail(setInEmail, setInName, inName)(e.target.value)} list="vic-team-emails" placeholder="Empty = only remove" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Their name">
              <Input value={inName} onChange={(e) => setInName(e.target.value)} placeholder="From the Team tab, or type it" autoComplete="off" />
            </Field>
          </div>
        )}

        {mode === "swap" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Binome A">
                <BinomeSelect value={swA} onChange={(v) => { setSwA(v); setSwAm("") }} binomes={locked} />
              </Field>
              <Field label="Member of A">
                <PeopleSelect value={swAm} onChange={setSwAm} binome={byCode(swA)} />
              </Field>
              <Field label="Binome B">
                <BinomeSelect value={swB} onChange={(v) => { setSwB(v); setSwBm("") }} binomes={locked} />
              </Field>
              <Field label="Member of B">
                <PeopleSelect value={swBm} onChange={setSwBm} binome={byCode(swB)} />
              </Field>
            </div>
          </div>
        )}

        {mode === "pair" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First member">
              <UnpairedSelect value={pA} onChange={setPA} list={state.unpaired} other={pB} />
            </Field>
            <Field label="Second member">
              <UnpairedSelect value={pB} onChange={setPB} list={state.unpaired} other={pA} />
            </Field>
          </div>
        )}

        {mode === "cover" && (
          <div className="space-y-4">
            <Field label="Interviewee codes">
              <Input value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="IT.07, HR.12" autoComplete="off" spellCheck={false} />
              {typed.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {typed.map((x) =>
                    x.iv ? (
                      <span key={x.c} className="rounded-full bg-secondary px-2.5 py-1 text-xs">
                        <b>{x.iv.code}</b> {x.iv.name} · {x.iv.binome || "no binome"}
                      </span>
                    ) : (
                      <span key={x.c} className="rounded-full bg-danger-soft px-2.5 py-1 text-xs text-danger">
                        <b>{x.c}</b> unknown
                      </span>
                    )
                  )}
                </div>
              )}
            </Field>
            <Field label="Who covers · email">
              <Input value={cvEmail} onChange={(e) => onEmail(setCvEmail, setCvName, cvName)(e.target.value)} list="vic-team-emails" placeholder="name@g.enp.edu.dz" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Their name">
              <Input value={cvName} onChange={(e) => setCvName(e.target.value)} placeholder="From the Team tab, or type it" autoComplete="off" />
            </Field>
            <Field label="Unavailable member" optional="optional">
              <Select value={cvOut || NOBODY} onValueChange={(v) => setCvOut(v === NOBODY ? "" : v)} disabled={!coverBinome}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Not said" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Not said</SelectItem>
                  {coverBinome?.people.map((p) => (
                    <SelectItem key={p.email} value={p.email}>
                      <MemberName name={p.name || p.email} /> · {coverBinome.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <Field label="Reason" optional="optional, kept in the Member Changes tab">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. no longer available for interviews" autoComplete="off" />
        </Field>

        <datalist id="vic-team-emails">
          {state.teamList.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name + " · " + m.pairAs}
            </option>
          ))}
        </datalist>

        <p className="rounded-2xl bg-muted/70 p-3 text-sm leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t bg-background p-4">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !canSubmit}>
          {running ? <Spinner /> : <Repeat />} Review…
        </Button>
      </div>
    </form>
  )
}

export function ChangeMembersSheet() {
  const sheet = useUi((s) => s.memberSheet)
  const close = useUi((s) => s.closeMemberSheet)
  const state = useVic((s) => s.state)
  return (
    <Sheet open={!!sheet?.open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="text-xl font-extrabold text-heading">Change members</SheetTitle>
          <SheetDescription>Replace, swap, pair into a new binome, or cover. You see exactly what will change before anything is written.</SheetDescription>
        </SheetHeader>
        {sheet && state && <Form key={sheet.nonce} init={sheet} state={state} />}
      </SheetContent>
    </Sheet>
  )
}
