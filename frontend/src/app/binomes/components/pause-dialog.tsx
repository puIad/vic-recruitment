import * as React from "react"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useActions } from "@/lib/vic/actions"
import { Spinner } from "@/lib/vic/confirm"
import { lastFor, movable, resumeFields, resumeLabel, resumeMs } from "@/lib/vic/pause"
import { useVic } from "@/lib/vic/store"
import type { Binome, BinomeOp, Interviewee } from "@/lib/vic/types"

const TITLE: Record<BinomeOp, string> = { pause: "Pause", resume: "Resume", date: "Change the resume date of" }

/**
 * Binomes › ⋯ › Pause…, Resume now… and Change resume date…: one binome at a time. A paused binome keeps its interviewees and
 * gets no new ones. Its one change holds the pause and the ticked moves (docs/admin-features.md › Pause and resume a binome).
 */
export function PauseDialog({ binome, op, all, interviewees, onClose }: { binome: Binome; op: BinomeOp; all: Binome[]; interviewees: Interviewee[]; onClose: () => void }) {
  const { binomeStatus } = useActions()
  const busy = useVic((s) => s.busy || s.jobs.some((j) => j.action === "binomeStatus"))
  const code = binome.code
  const [note, setNote] = React.useState("")
  const [fields, setFields] = React.useState(() => resumeFields(op === "date" ? binome.pausedUntil : null))
  const [armed, setArmed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const moves = React.useMemo(() => (op === "pause" ? movable(interviewees, all, binome) : []), [op, interviewees, all, binome])
  const [unticked, setUnticked] = React.useState<Set<string>>(new Set())

  const last = op === "pause" ? lastFor(all, binome) : []
  const until = resumeMs(fields.date, fields.time)
  const [openedAt] = React.useState(() => Date.now())
  const past = until !== null && until <= openedAt
  const needsNote = op === "pause" && !note.trim()
  const ready = !needsNote && !past && !busy && !saving
  const depts = [...new Set(moves.map((i) => i.dept))]

  function toggle(c: string) {
    setUnticked((u) => {
      const n = new Set(u)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })
  }

  async function submit() {
    if (!ready) return
    if (last.length && !armed) return setArmed(true) // the second click: the pause still goes through
    setSaving(true)
    const ok = await binomeStatus(code, op, note.trim(), op === "resume" ? null : until, moves.filter((i) => !unticked.has(i.code)).map((i) => i.code))
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">{TITLE[op]} {code}</DialogTitle>
          <DialogDescription>
            {op === "pause" && `${code} keeps its interviewees and gets no new ones. Both members are emailed.`}
            {op === "resume" && `${code} gets new candidates again. Both members are emailed.`}
            {op === "date" && (binome.pausedUntil ? `It resumes on ${resumeLabel(binome.pausedUntil)}. Nobody is emailed.` : "It has no resume date yet. Nobody is emailed.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {op !== "date" && (
            <div className="space-y-1.5">
              <Label htmlFor="pause-note">Reason{op === "resume" && " (optional)"}</Label>
              <Textarea id="pause-note" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}

          {op !== "resume" && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Resume date (optional, Algiers time)</legend>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" aria-label="Resume date" className="w-44" value={fields.date} onChange={(e) => setFields((f) => ({ ...f, date: e.target.value }))} />
                <Input type="time" aria-label="Resume time" className="w-32" value={fields.time} onChange={(e) => setFields((f) => ({ ...f, time: e.target.value }))} />
                {fields.date && (
                  <Button size="sm" variant="ghost" onClick={() => setFields((f) => ({ ...f, date: "" }))}>
                    Clear
                  </Button>
                )}
              </div>
              {past && <p role="alert" className="text-sm text-danger">The resume date has to be in the future.</p>}
              <p className="text-xs text-muted-foreground">The first sync after this date resumes it, so it can be up to one sync late.</p>
            </fieldset>
          )}

          {last.length > 0 && (
            <div role="alert" className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                No ACTIVE binome takes {last.join(", ")} after this: new {last.join(", ")} registrants will wait, NO_BINOME.
                {armed && " Press again to pause anyway."}
              </span>
            </div>
          )}

          {moves.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Move to other {depts.join(" / ")} binomes (optional)</legend>
              <p className="text-xs text-muted-foreground">Assigned and not contacted yet. Each goes to the least-loaded binome when this is applied; untick any who should stay.</p>
              <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border">
                {moves.map((i) => (
                  <li key={i.code}>
                    <Label className="flex cursor-pointer items-center gap-3 px-3 py-2 font-normal">
                      <Checkbox checked={!unticked.has(i.code)} onCheckedChange={() => toggle(i.code)} />
                      <span className="w-16 shrink-0 font-bold text-primary">{i.code}</span>
                      <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready}>
            {saving && <Spinner className="size-4" />}
            {op === "pause" ? (armed ? "Pause anyway" : "Pause") : op === "resume" ? "Resume now" : "Save the date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
