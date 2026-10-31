import * as React from "react"
import { AlertTriangle, Check, RotateCcw, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/lib/vic/confirm"
import { displayName } from "@/lib/vic/format"
import { useVic, type MemberSetResult } from "@/lib/vic/store"
import { again, REASON, useMemberView, type Mark } from "@/lib/vic/pending"
import { AFFECTATION_OPTIONS, CONTACT_OPTIONS, GOLD_KEYS, type Candidate, type CellValue, type FieldEntry, type GoldKey, type SetBy } from "@/lib/vic/types"
import { PendingMark } from "@/app/alerts/components/pending-mark"
import { cn } from "@/lib/utils"
import { draftKey } from "./gold-drafts"

type Cell = string | number | boolean
/** The binome's columns of one candidate: a Candidate, or what an admin reads from the binome sheet (WebApp.gs binomeColumnsGet). */
export type GoldSource = Pick<Candidate, GoldKey | "Code" | "setBy">
/** An admin filling the form in (docs/admin-features.md): where it saves, and Let the form fill it. Both keep the marks current. */
export type AdminWrite = {
  binome: string
  save: (code: string, fields: { field: GoldKey; value: unknown; seen: unknown }[]) => Promise<MemberSetResult[]>
  /** the value the form wrote into the cell */
  fill: (k: "Rating" | "Final Affectation") => Promise<Cell>
}
type Phase = { s: "idle" } | { s: "error"; msg: string } | { s: "conflict"; theirs: string }
/** base = the sheet's value the edit started from (sent as `seen`), draft = what the member has typed or picked. */
type Field = { base: Cell | undefined; draft: string | boolean; phase: Phase }
type Fields = Record<GoldKey, Field>

const NONE = "__none" // Radix Select has no empty value: the "no affectation yet" item
const NOTES_MAX = 2000

const isDone = (v: unknown) => v === true || /^true$/i.test(String(v))

/** The sheet's value as the editor holds it: Done a boolean, Interview Day as the date input's yyyy-mm-dd, the rest text. */
function toDraft(k: GoldKey, v: unknown): string | boolean {
  if (k === "Interview Done") return isDone(v)
  const s = v === undefined || v === null ? "" : String(v).trim()
  if (k === "Interview Date") {
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
    return d ? `${d[3]}-${d[2]}-${d[1]}` : ""
  }
  return k === "Notes" ? String(v ?? "") : s
}

/** What the script receives: Interview Day back to dd/MM/yyyy (the sheet's form). */
function toWire(k: GoldKey, d: string | boolean): unknown {
  if (k === "Interview Date") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d))
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ""
  }
  return d
}

/** A conflict carries the cell as text (WebApp.gs goldText_); back to the slice's own form. */
function fromText(k: GoldKey, t: string): Cell {
  if (k === "Interview Done") return t === "true"
  if (k === "Rating") return t === "" || isNaN(Number(t)) ? t : Number(t)
  return t
}

function theirsLabel(k: GoldKey, t: string) {
  if (k === "Interview Done") return t === "true" ? "ticked" : "not ticked"
  if (!t) return "empty"
  return k === "Rating" ? `${t}/10` : `“${t.length > 80 ? t.slice(0, 80) + "…" : t}”`
}

function ratingProblem(d: string) {
  if (!d.trim()) return ""
  const n = Number(d.replace(",", "."))
  return isNaN(n) || n < 0 || n > 10 ? "A mark from 0 to 10" : ""
}

const isDirty = (k: GoldKey, f: Field) => f.draft !== toDraft(k, f.base)
const fieldsOf = (c: GoldSource) =>
  Object.fromEntries(GOLD_KEYS.map((k) => [k, { base: c[k], draft: toDraft(k, c[k]), phase: { s: "idle" } }])) as Fields

/* Unsaved drafts live in this browser, per binome, candidate and field, so an expired session or a reload doesn't lose them (like the
   interview form, lib/vic/interview.ts). The base rides along: a restored draft is still checked against the sheet on Save. */
function restoreDrafts(binome: string, c: GoldSource, fields: Fields): Fields {
  const next = { ...fields }
  for (const k of GOLD_KEYS) {
    try {
      const raw = localStorage.getItem(draftKey(binome, String(c.Code), k))
      const d = raw ? (JSON.parse(raw) as { draft?: string | boolean; base?: Cell; phase?: Phase }) : null
      if (d && d.draft !== undefined) next[k] = { base: d.base, draft: d.draft, phase: d.phase ?? { s: "idle" } }
    } catch {
      /* no storage: no draft */
    }
  }
  return next
}
function keepDrafts(binome: string, code: string, fields: Fields) {
  for (const k of GOLD_KEYS) {
    try {
      const f = fields[k]
      if (isDirty(k, f)) localStorage.setItem(draftKey(binome, code, k), JSON.stringify({ draft: f.draft, base: f.base, phase: f.phase.s === "conflict" ? f.phase : undefined }))
      else localStorage.removeItem(draftKey(binome, code, k))
    } catch {
      /* private window or storage full: the form still works, without a draft */
    }
  }
}

type Form = {
  code: string
  fields: Fields
  saving: boolean
  setDraft: (k: GoldKey, d: string | boolean) => void
  revert: (k: GoldKey) => void
  useMine: (k: GoldKey) => void
  saveAll: () => void
  /** an admin's form: Let the form fill it, and who they are talking about */
  admin?: AdminWrite & { filling: GoldKey | null; fillFromForm: (k: "Rating" | "Final Affectation") => void }
  /** who set which field (an admin), until the binome edits it again */
  setBy: SetBy
  /** this candidate's pending marks, by field */
  marks: Partial<Record<GoldKey, Mark<FieldEntry>>>
}
const FormCtx = React.createContext<Form | null>(null)

/**
 * The binome's own columns for one candidate, edited together and written into their sheet (webRun memberSet, one call for
 * every changed field) when the member presses Save. Nothing shows as saved until the script says so. If the partner changed a
 * cell meanwhile, the script refuses that one and the field offers Keep theirs / Use mine.
 * Key it by candidate: switching candidates starts afresh. onDirty gets the count of unsaved fields as it changes.
 */
export function GoldForm({ code, candidate, onDirty, children, admin }: { code: string; candidate: GoldSource; onDirty?: (n: number) => void; children: React.ReactNode; admin?: AdminWrite }) {
  const memberSet = useVic((s) => s.memberSet)
  const patchMember = useVic((s) => s.patchMember)
  const allMarks = useMemberView().marks
  // an admin's form writes directly and has no pending marks; its drafts are kept apart from the same binome's My binome drafts
  const marks = admin ? {} : Object.fromEntries(GOLD_KEYS.filter((k) => allMarks[`field:${code}:${k}`]).map((k) => [k, allMarks[`field:${code}:${k}`]]))
  const own = useVic((s) => s.member?.binome ?? "")
  const binome = admin ? `admin:${admin.binome}` : own
  const [fields, setFields] = React.useState(() => restoreDrafts(binome, candidate, fieldsOf(candidate)))
  React.useEffect(() => keepDrafts(binome, code, fields), [binome, code, fields])
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const put = (k: GoldKey, f: Partial<Field>) => setFields((cur) => ({ ...cur, [k]: { ...cur[k], ...f } }))

  // a poll brought new values: untouched fields follow them, a field mid-edit keeps the draft (the save checks it)
  const sig = JSON.stringify(GOLD_KEYS.map((k) => candidate[k] ?? null))
  const [prevSig, setPrevSig] = React.useState(sig)
  if (sig !== prevSig) {
    setPrevSig(sig)
    setFields((cur) => {
      let next = cur
      for (const k of GOLD_KEYS) {
        const f = cur[k], v = candidate[k]
        if (isDirty(k, f) || f.phase.s === "conflict" || v === f.base) continue
        next = { ...next, [k]: { ...f, base: v, draft: toDraft(k, v) } }
      }
      return next
    })
  }

  React.useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  async function saveAll() {
    const todo = GOLD_KEYS.filter((k) => isDirty(k, fields[k]))
    if (!todo.length || saving || ratingProblem(String(fields.Rating.draft))) return
    setSaving(true)
    setSaved(false)
    // pending changes: accepted at once, the fields show them with the pill; a failed accept is today's direct write
    const st = useVic.getState(), at = Date.now()
    if (!admin && st.pendingOn && (await st.accept(todo.map((k) => ({ kind: "field" as const, code, field: k, value: toWire(k, fields[k].draft) as CellValue, seen: fields[k].base ?? "", at })))) === "ok") {
      todo.forEach((k) => put(k, { base: toWire(k, fields[k].draft) as CellValue, phase: { s: "idle" } }))
      setSaving(false)
      return
    }
    const rs = await (admin ? admin.save : memberSet)(code, todo.map((k) => ({ field: k, value: toWire(k, fields[k].draft), seen: fields[k].base })))
    todo.forEach((k, i) => {
      const r = rs[i]
      if ("ok" in r) put(k, { base: r.value, draft: toDraft(k, r.value), phase: { s: "idle" } })
      else if ("conflict" in r) {
        // the sheet holds theirs: it becomes the base (Use mine then writes over it), the draft stays
        const theirs = fromText(k, r.conflict)
        if (!admin) patchMember(code, k, theirs)
        put(k, { base: theirs, phase: { s: "conflict", theirs: r.conflict } })
      } else put(k, { phase: { s: "error", msg: r.error } })
    })
    setSaving(false)
    setSaved(rs.every((r) => "ok" in r))
  }

  const [filling, setFilling] = React.useState<GoldKey | null>(null)
  async function fillFromForm(k: "Rating" | "Final Affectation") {
    if (!admin || saving || filling) return
    setFilling(k)
    try {
      const v = await admin.fill(k)
      put(k, { base: v, draft: toDraft(k, v), phase: { s: "idle" } })
    } catch (e) {
      put(k, { phase: { s: "error", msg: (e as Error).message } })
    } finally {
      setFilling(null)
    }
  }

  const form: Form = {
    code,
    fields,
    saving,
    // editing clears that field's "Not saved" (it is about the old value); a conflict stays until Keep theirs / Use mine
    setDraft: (k, d) => setFields((cur) => ({ ...cur, [k]: { ...cur[k], draft: d, phase: cur[k].phase.s === "error" ? { s: "idle" } : cur[k].phase } })),
    revert: (k) => setFields((cur) => ({ ...cur, [k]: { ...cur[k], draft: toDraft(k, cur[k].base), phase: { s: "idle" } } })),
    useMine: (k) => put(k, { phase: { s: "idle" } }), // the next Save writes the draft over theirs
    saveAll,
    admin: admin && { ...admin, filling, fillFromForm },
    setBy: candidate.setBy ?? {},
    marks,
  }

  const dirty = GOLD_KEYS.filter((k) => isDirty(k, fields[k])).length
  React.useEffect(() => onDirty?.(dirty), [dirty, onDirty])
  // closing or reloading the tab with unsaved changes: the browser's own "Leave site?" prompt
  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const failed = GOLD_KEYS.some((k) => fields[k].phase.s !== "idle")

  return (
    <FormCtx.Provider value={form}>
      {children}
      <div aria-live="polite" className="mt-3 flex min-h-9 flex-wrap items-center gap-2">
        {dirty > 0 ? (
          <>
            <Button onClick={saveAll} disabled={saving || !!ratingProblem(String(fields.Rating.draft))}>
              {saving ? <Spinner className="size-4" /> : <Check />}{" "}
              {saving ? (admin ? "Saving to the binome sheet…" : "Saving to your sheet…") : dirty > 1 ? `Save ${dirty} changes` : "Save change"}
            </Button>
            <Button variant="ghost" onClick={() => GOLD_KEYS.forEach(form.revert)} disabled={saving}>
              Discard
            </Button>
            {failed && !saving && <span className="text-xs font-medium text-danger">Some changes weren't saved: see above.</span>}
          </>
        ) : saved ? (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <Check className="size-3.5" /> {admin ? "Saved to the binome sheet" : "Saved to your sheet"}
          </p>
        ) : null}
      </div>
    </FormCtx.Provider>
  )
}

/** One gold column inside a GoldForm: holds a draft, written only by the form's Save. */
export function GoldField({ k }: { k: GoldKey }) {
  const form = React.useContext(FormCtx)!
  const { code, saving } = form
  const { draft, phase } = form.fields[k]
  const dirty = isDirty(k, form.fields[k])
  const id = `gold-${code}-${k.replace(/\s+/g, "-")}`
  const set = (d: string | boolean) => form.setDraft(k, d)
  const mark = form.setBy[k]
  const them = form.admin ? "The binome" : "Your partner"

  const ratingError = k === "Rating" ? ratingProblem(String(draft)) : ""
  // Enter saves everything (Ctrl/Cmd+Enter in the notes box), Escape drops this field's edit
  const onKey = (e: React.KeyboardEvent, needMod = false) => {
    if (e.key === "Enter" && (!needMod || e.ctrlKey || e.metaKey)) form.saveAll()
    if (e.key === "Escape" && dirty) {
      e.stopPropagation() // Escape cancels the edit, not the whole details panel
      form.revert(k)
    }
  }

  let control: React.ReactNode
  if (k === "Contacted" || k === "Final Affectation") {
    const options = k === "Contacted" ? CONTACT_OPTIONS : AFFECTATION_OPTIONS
    control = (
      <Select value={String(draft) || NONE} onValueChange={(v) => set(v === NONE ? "" : v)} disabled={saving}>
        <SelectTrigger id={id} className="w-full bg-background sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {k === "Final Affectation" && <SelectItem value={NONE}>Not decided yet</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (k === "Interview Done") {
    control = (
      <label htmlFor={id} className="flex w-fit cursor-pointer items-center gap-2.5 py-1 text-sm font-medium">
        <Checkbox id={id} checked={draft === true} onCheckedChange={(c) => set(c === true)} disabled={saving} className="size-5" />
        {draft === true ? "Yes, done" : "Not yet"}
      </label>
    )
  } else if (k === "Notes") {
    control = (
      <div className="space-y-1">
        <Textarea
          id={id}
          value={String(draft)}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => onKey(e, true)}
          maxLength={NOTES_MAX}
          rows={4}
          disabled={saving}
          placeholder="How the call went, what to ask in the interview…"
          className="min-h-24 bg-background"
        />
        <p className={cn("text-right text-xs tabular-nums text-muted-foreground", String(draft).length > NOTES_MAX - 100 && "text-warning")}>
          {String(draft).length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
        </p>
      </div>
    )
  } else {
    const type = k === "Interview Date" ? "date" : k === "Interview Time" ? "time" : "number"
    control = (
      <Input
        id={id}
        type={type}
        value={String(draft)}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => onKey(e)}
        disabled={saving}
        aria-invalid={!!ratingError || undefined}
        {...(k === "Rating" ? { min: 0, max: 10, step: 0.5, inputMode: "decimal" as const, placeholder: "0 – 10" } : {})}
        className={cn("bg-background", k === "Rating" ? "w-28" : "w-full sm:w-48")}
      />
    )
  }

  return (
    <div className="min-w-0 space-y-2">
      {control}

      {form.admin && (k === "Rating" || k === "Final Affectation") && (
        <Button size="sm" variant="ghost" className="-ml-2 h-7 text-xs" onClick={() => form.admin!.fillFromForm(k)} disabled={saving || !!form.admin.filling}
          title="Writes the latest interview form's value now; later form saves update it again">
          {form.admin.filling === k ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" />} Let the form fill it
        </Button>
      )}
      {mark && !dirty && (
        <p className="text-xs text-muted-foreground">
          set by <b className="font-semibold text-foreground/80">{displayName(mark.by)}</b> · {mark.at}
        </p>
      )}

      <div aria-live="polite" className="empty:hidden">
        {form.marks[k] && form.marks[k]!.kind !== "dropped" && <PendingMark mark={form.marks[k]} />}
        <FieldDrop k={k} mark={form.marks[k]} />
        {ratingError && <p className="text-xs font-medium text-danger">{ratingError}</p>}
        {phase.s === "error" && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <b className="font-semibold">Not saved.</b> {phase.msg}
            </span>
          </div>
        )}
        {phase.s === "conflict" && (
          <div role="alert" className="space-y-2.5 rounded-xl border border-vic-orange/40 bg-warning-soft p-3 text-sm">
            <p className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <b className="font-bold">{them} changed this to {theirsLabel(k, phase.theirs)}.</b>{" "}
                <span className="text-foreground/80">Nothing of yours was written here.</span>
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pl-6">
              <Button size="sm" variant="outline" className="bg-background" onClick={() => form.revert(k)} disabled={saving}>
                <RotateCcw /> Keep theirs
              </Button>
              <Button size="sm" onClick={() => form.useMine(k)} disabled={saving}>
                <Check /> Use mine
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** A dropped field, answered where it was typed: Keep theirs, or Apply mine anyway (a fresh change); a refused value: OK. */
function FieldDrop({ k, mark }: { k: GoldKey; mark?: Mark<FieldEntry> }) {
  const form = React.useContext(FormCtx)!
  const markDrops = useVic((s) => s.markDrops)
  const accept = useVic((s) => s.accept)
  const memberSet = useVic((s) => s.memberSet)
  if (mark?.kind !== "dropped") return null
  const e = mark.entry
  const keep = () => markDrops({ keep: [e.cell] })
  const applyMine = async () => {
    const change = again(e, undefined, Date.now())
    if (change && (await accept([change])) === "ok") return
    // the pending path can't take it now: today's direct write, which says nothing itself, so the notice stays until it lands
    // a drop with a reason (retries ran out) has no sheet value: judged against what the author saw, as again() does
    const [r] = await memberSet(e.code, [{ field: k, value: e.value, seen: e.sheet !== undefined ? fromText(k, e.sheet) : e.seen }])
    if ("ok" in r) void keep()
    else toast.error("Not saved", { description: "conflict" in r ? "Your partner changed it again." : r.error })
  }
  return (
    <div role="alert" className="space-y-2.5 rounded-xl border border-vic-orange/40 bg-warning-soft p-3 text-sm">
      <p className="flex items-start gap-2">
        {e.reason ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /> : <Users className="mt-0.5 size-4 shrink-0 text-warning" />}
        <span>
          {e.reason ? (
            <><b className="font-bold">Not saved.</b> {REASON[e.reason] ?? e.reason} Yours: {theirsLabel(k, String(e.value))}.</>
          ) : (
            <><b className="font-bold">Your partner changed this to {theirsLabel(k, e.sheet ?? "")} first.</b>{" "}
              <span className="text-foreground/80">Yours, {theirsLabel(k, String(e.value))}, was not written.</span></>
          )}
        </span>
      </p>
      <div className="flex flex-wrap gap-2 pl-6">
        <Button size="sm" variant="outline" className="bg-background" onClick={keep} disabled={form.saving}>
          {e.again ? <><RotateCcw /> Keep theirs</> : "OK"}
        </Button>
        {e.again && (
          <Button size="sm" onClick={applyMine} disabled={form.saving}>
            <Check /> Apply mine anyway
          </Button>
        )}
      </div>
    </div>
  )
}
