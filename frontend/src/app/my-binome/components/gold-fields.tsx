import * as React from "react"
import { AlertTriangle, Check, RotateCcw, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import { AFFECTATION_OPTIONS, CONTACT_OPTIONS, type GoldKey } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

type Cell = string | number | boolean
type Phase = { s: "idle" } | { s: "saving" } | { s: "saved" } | { s: "error"; msg: string } | { s: "conflict"; theirs: string }

/** Selects and the checkbox save on change; the typed fields wait for Save (or Enter). */
const INSTANT: GoldKey[] = ["Contacted", "Final Affectation", "Interview Done"]
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

/** A conflict carries the cell as text (WebApp.gs goldText_); back to the slice's own form for "Keep theirs". */
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

/**
 * One of the binome's own columns, edited from the dashboard and written into their sheet (webRun memberSet).
 * Nothing shows as saved until the script says so. `base` is the value the edit started from: if the partner changed the
 * cell meanwhile, the script refuses and the field offers Keep theirs / Use mine.
 */
export function GoldField({ code, k, value }: { code: string; k: GoldKey; value: Cell | undefined }) {
  const memberSet = useVic((s) => s.memberSet)
  const patchMember = useVic((s) => s.patchMember)
  const [base, setBase] = React.useState<Cell | undefined>(value)
  const [draft, setDraft] = React.useState(() => toDraft(k, value))
  const [phase, setPhase] = React.useState<Phase>({ s: "idle" })
  const dirty = draft !== toDraft(k, base)
  const saving = phase.s === "saving"
  const id = `gold-${code}-${k.replace(/\s+/g, "-")}`

  // a poll brought a new value: follow it unless the member is in the middle of an edit (then the save checks it)
  const editing = dirty || saving || phase.s === "conflict"
  React.useEffect(() => {
    if (editing) return
    setBase(value)
    setDraft(toDraft(k, value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, k])

  React.useEffect(() => {
    if (phase.s !== "saved") return
    const t = setTimeout(() => setPhase({ s: "idle" }), 2500)
    return () => clearTimeout(t)
  }, [phase])

  async function save(next: string | boolean, seen: unknown = base) {
    setDraft(next)
    setPhase({ s: "saving" })
    const r = await memberSet(code, k, toWire(k, next), seen)
    if ("ok" in r) {
      setBase(r.value)
      setDraft(toDraft(k, r.value))
      setPhase({ s: "saved" })
    } else if ("conflict" in r) setPhase({ s: "conflict", theirs: r.conflict })
    else setPhase({ s: "error", msg: r.error })
  }

  function keepTheirs(t: string) {
    const v = fromText(k, t)
    patchMember(code, k, v)
    setBase(v)
    setDraft(toDraft(k, v))
    setPhase({ s: "idle" })
  }

  function cancel() {
    setDraft(toDraft(k, base))
    setPhase({ s: "idle" })
  }

  const ratingError = k === "Rating" ? ratingProblem(String(draft)) : ""
  // Enter saves (Ctrl/Cmd+Enter in the notes box), Escape drops the edit
  const onKey = (e: React.KeyboardEvent, needMod = false) => {
    if (e.key === "Enter" && (!needMod || e.ctrlKey || e.metaKey) && dirty && !saving && !ratingError) save(draft)
    if (e.key === "Escape" && dirty) {
      e.stopPropagation() // Escape cancels the edit, not the whole details panel
      cancel()
    }
  }

  let control: React.ReactNode
  if (k === "Contacted" || k === "Final Affectation") {
    const options = k === "Contacted" ? CONTACT_OPTIONS : AFFECTATION_OPTIONS
    control = (
      <Select value={String(draft) || NONE} onValueChange={(v) => save(v === NONE ? "" : v)} disabled={saving}>
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
        <Checkbox id={id} checked={draft === true} onCheckedChange={(c) => save(c === true)} disabled={saving} className="size-5" />
        {draft === true ? "Yes, done" : "Not yet"}
      </label>
    )
  } else if (k === "Notes") {
    control = (
      <div className="space-y-1">
        <Textarea
          id={id}
          value={String(draft)}
          onChange={(e) => setDraft(e.target.value)}
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
        onChange={(e) => setDraft(e.target.value)}
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

      {dirty && !INSTANT.includes(k) && phase.s !== "conflict" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => save(draft)} disabled={saving || !!ratingError}>
            {saving ? <Spinner className="size-3.5" /> : <Check />} Save
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
          {ratingError && <span className="text-xs font-medium text-danger">{ratingError}</span>}
        </div>
      )}

      <div aria-live="polite" className="empty:hidden">
        {saving && INSTANT.includes(k) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Saving to your sheet…
          </p>
        )}
        {phase.s === "saved" && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
            <Check className="size-3.5" /> Saved to your sheet
          </p>
        )}
        {phase.s === "error" && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <b className="font-semibold">Not saved.</b> {phase.msg}
            </span>
            <button type="button" onClick={() => save(draft)} className="shrink-0 font-semibold text-primary hover:underline">
              Try again
            </button>
          </div>
        )}
        {phase.s === "conflict" && (
          <div role="alert" className="space-y-2.5 rounded-xl border border-vic-orange/40 bg-warning-soft p-3 text-sm">
            <p className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <b className="font-bold">Your partner changed this to {theirsLabel(k, phase.theirs)}.</b>{" "}
                <span className="text-foreground/80">Nothing of yours was written.</span>
              </span>
            </p>
            <div className="flex flex-wrap gap-2 pl-6">
              <Button size="sm" variant="outline" className="bg-background" onClick={() => keepTheirs(phase.theirs)}>
                <RotateCcw /> Keep theirs
              </Button>
              <Button size="sm" onClick={() => save(draft, phase.theirs)}>
                <Check /> Use mine
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
