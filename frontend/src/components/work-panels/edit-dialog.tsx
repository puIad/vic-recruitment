"use client"

import * as React from "react"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { DEPTS } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { CandidateData } from "@/lib/vic/types"

type Kind = "text" | "email" | "tel" | "choice" | "days"
const FIELDS: { key: string; label: string; kind: Kind; options?: (d: CandidateData) => string[]; hint?: string }[] = [
  { key: "First Name", label: "First name", kind: "text" },
  { key: "Family Name", label: "Family name", kind: "text" },
  { key: "Email", label: "Email", kind: "email" },
  { key: "Phone", label: "Phone", kind: "tel", hint: "An Algerian number" },
  { key: "Birth Date", label: "Birth date", kind: "text", hint: "dd/mm/yyyy" },
  { key: "1st Choice", label: "1st choice", kind: "choice", options: () => DEPTS },
  { key: "2nd Choice", label: "2nd choice", kind: "choice", options: () => DEPTS },
  { key: "Field", label: "Field of study", kind: "choice", options: (d) => d.fields },
  { key: "Year", label: "Year of study", kind: "choice", options: (d) => d.years },
  { key: "Availability", label: "Availability", kind: "days", hint: "Days of the week, comma separated" },
  { key: "Facebook", label: "Facebook", kind: "text" },
  { key: "Discord", label: "Discord", kind: "text" },
]

function Form({ code, focus }: { code: string; focus?: string }) {
  const { candidateGet, editCandidate } = useActions()
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs)
  const close = useUi((s) => s.closeEditDialog)
  const [data, setData] = React.useState<CandidateData | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [values, setValues] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    let live = true
    void candidateGet(code).then((d) => {
      if (!live) return
      if (!d) return setFailed(true)
      setData(d)
      setValues(d.values)
    })
    return () => {
      live = false
    }
  }, [code, candidateGet])

  if (failed) return <p className="text-sm text-danger">Their data did not load. Close this and try again.</p>
  if (!data)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-10 rounded-xl" />
      </div>
    )

  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v.trim() !== (data.values[k] ?? "").trim()))
  const n = Object.keys(changed).length
  const locked = data.status === "DECLINED" || data.status === "DUPLICATE"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!n) return
    if (await editCandidate(data, changed)) close()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {locked && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">This application is {data.status.toLowerCase()}: restore it before editing.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const id = "ed-" + f.key.replace(/\W/g, "")
          const v = values[f.key] ?? ""
          const set = (x: string) => setValues((p) => ({ ...p, [f.key]: x }))
          const opts = f.options?.(data) ?? []
          return (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={id} className="font-semibold">
                {f.label}
                {changed[f.key] !== undefined && <span className="ml-2 text-xs font-normal text-primary">edited</span>}
              </Label>
              {f.kind === "choice" ? (
                <Select value={v} onValueChange={set} disabled={locked}>
                  <SelectTrigger id={id} className="w-full" autoFocus={focus === f.key}>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(v && !opts.includes(v) ? [v, ...opts] : opts).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id={id} type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : "text"} value={v} onChange={(e) => set(e.target.value)} placeholder={f.hint} autoComplete="off" disabled={locked} autoFocus={focus === f.key} />
              )}
            </div>
          )
        })}
      </div>
      <p className="rounded-2xl bg-muted/70 p-3 text-sm leading-relaxed text-muted-foreground">
        Saved straight to the Master and to {data.binome ? `the sheet of ${data.binome}` : "their binome sheet once they have one"}. The registration check runs again and each change goes in Change history. Nobody is emailed{data.status === "UNASSIGNED" ? ", unless a new 1st choice places them in a binome (that binome gets its usual new-interviewee email)" : ""}. Their own written answers stay read-only.
      </p>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || locked || !n}>
          {jobs.some((j) => j.action === "editCandidate") ? <Spinner /> : <Save />} Save{n ? ` ${n} change${n > 1 ? "s" : ""}` : ""}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Edit a candidate's data (docs/admin-features.md): twelve registration fields, one form, opened from a profile, an Interviewees row or Ctrl K. */
export function EditDialog() {
  const d = useUi((s) => s.editDialog)
  const close = useUi((s) => s.closeEditDialog)
  return (
    <Dialog open={!!d?.open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Edit {d?.code}</DialogTitle>
          <DialogDescription>Fix what they typed. The checks are the registration form's own.</DialogDescription>
        </DialogHeader>
        {d && <Form key={d.nonce} code={d.code} focus={d.field} />}
      </DialogContent>
    </Dialog>
  )
}
