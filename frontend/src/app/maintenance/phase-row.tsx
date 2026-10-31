import * as React from "react"
import { CalendarClock, Lock, LockOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useActions } from "@/lib/vic/actions"
import { Spinner } from "@/lib/vic/confirm"
import { resumeLabel } from "@/lib/vic/pause"
import { useVic } from "@/lib/vic/store"
import type { ClosePreview } from "@/lib/vic/types"

const KEY = "INTERVIEW_CLOSE_DATE"

/** Close: the preview first (nothing blocks), then the confirm. */
function CloseDialog({ preview, onClose }: { preview: ClosePreview["preview"]; onClose: () => void }) {
  const { interviewClose } = useActions()
  const [saving, setSaving] = React.useState(false)
  async function submit() {
    setSaving(true)
    const ok = await interviewClose("close")
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Close the interview phase?</DialogTitle>
          <DialogDescription>
            Binomes stop changing the results of interviews already done. Late interviews stay possible and admins keep every edit. Every member of an active or paused binome is emailed.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          <li>
            <b className="num">{preview.forms}</b> candidate{preview.forms === 1 ? "" : "s"} with a form on file will lock: the form, Rating and Final Affectation.
          </li>
          <li>
            <b className="num">{preview.doneNoForm.length}</b> with Interview Done ticked and no form: they stay open, so the binome can still file it
            {preview.doneNoForm.length > 0 && <span className="text-muted-foreground">: {preview.doneNoForm.join(", ")}</span>}.
          </li>
          <li>
            <b className="num">{preview.notInterviewed}</b> not interviewed yet: still open. Their timing alerts stop while the phase is closed.
          </li>
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Spinner className="size-4" />} Close the phase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Reopen: a reason is required; a passed reminder date is cleared, or give a new one. */
function ReopenDialog({ date, onClose }: { date: number | null; onClose: () => void }) {
  const { interviewClose } = useActions()
  const [reason, setReason] = React.useState("")
  const [next, setNext] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [openedAt] = React.useState(() => Date.now())
  async function submit() {
    setSaving(true)
    const ok = await interviewClose("reopen", reason.trim(), next || undefined)
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Reopen the interview phase?</DialogTitle>
          <DialogDescription>Rows unlock at once and every member of an active or paused binome is emailed. Closing again later locks by the same rule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea id="reopen-reason" value={reason} maxLength={500} rows={2} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reopen-date">New reminder date (optional, Algiers time)</Label>
            <Input id="reopen-date" type="date" className="w-44" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {date && date <= openedAt ? "The reminder date has passed: it is cleared unless you give a new one, so the alert does not fire again at once." : "Blank keeps the date as it is."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!reason.trim() || saving}>
            {saving && <Spinner className="size-4" />} Reopen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Open = null | { op: "close"; preview: ClosePreview["preview"] } | { op: "reopen" }

/** Maintenance › Interview phase: the reminder date, Close and Reopen (docs/admin-features.md › Closing the interview phase). */
export function PhaseRow() {
  const { closePreview, closeDate } = useActions()
  const busy = useVic((s) => s.busy)
  const close = useVic((s) => s.state?.close)
  const saved = useVic((s) => String(s.state?.settingsAll.find((r) => r.key === KEY)?.value ?? "").trim())
  const [typed, setTyped] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<Open>(null)
  const [asking, setAsking] = React.useState(false)
  const day = typed ?? saved.slice(0, 10)
  const changed = typed !== null && typed !== saved.slice(0, 10)

  async function openClose() {
    setAsking(true)
    const p = await closePreview()
    setAsking(false)
    if (p) setDialog({ op: "close", preview: p.preview })
  }
  async function saveDate() {
    if (await closeDate(day, saved)) setTyped(null)
  }

  return (
    <>
      <li className="flex flex-wrap items-center gap-4 py-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{close?.on ? <Lock className="size-5" /> : <LockOpen className="size-5" />}</span>
        <div className="min-w-0 flex-1 basis-72">
          <p className="font-bold">Interview phase ({close?.on ? "closed" : "open"})</p>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {close?.on
              ? `Closed${close.at ? ` ${resumeLabel(close.at)}` : ""}${close.by ? ` by ${close.by}` : ""}. A candidate with a form on file has the form, Rating and Final Affectation locked for the binome; admins keep every edit and late interviews stay possible.`
              : "Closing stops binomes changing the results of interviews already done. Late interviews stay possible and admins keep every edit."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            <Label htmlFor="close-date" className="text-sm font-normal text-muted-foreground">Reminder date (Algiers, never locks by itself)</Label>
            <Input id="close-date" type="date" className="w-44" value={day} onChange={(e) => setTyped(e.target.value)} />
            {changed && (
              <Button size="sm" variant="outline" disabled={busy} onClick={saveDate}>
                Save
              </Button>
            )}
          </div>
        </div>
        {close?.on ? (
          <Button variant="outline" disabled={busy} onClick={() => setDialog({ op: "reopen" })} className="min-w-28">
            <LockOpen /> Reopen…
          </Button>
        ) : (
          <Button variant="outline" disabled={busy || asking} onClick={openClose} className="min-w-28">
            {asking ? <Spinner /> : <Lock />} Close…
          </Button>
        )}
      </li>
      {dialog?.op === "close" && <CloseDialog preview={dialog.preview} onClose={() => setDialog(null)} />}
      {dialog?.op === "reopen" && <ReopenDialog date={close?.date ?? null} onClose={() => setDialog(null)} />}
    </>
  )
}
