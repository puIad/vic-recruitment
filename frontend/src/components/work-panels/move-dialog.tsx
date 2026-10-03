"use client"

import * as React from "react"
import { MoveRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { STATUS_LABEL } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { WebState } from "@/lib/vic/types"
import { toast } from "sonner"

function Form({ init, state }: { init: { code?: string; binome?: string }; state: WebState }) {
  const { reassign } = useActions()
  const busy = useVic((s) => s.busy)
  const action = useVic((s) => s.busyAction)
  const close = useUi((s) => s.closeMoveDialog)
  const [code, setCode] = React.useState(init.code || "")
  const [binome, setBinome] = React.useState(init.binome || "")

  const targets = state.binomes.filter((b) => b.status !== "DRAFT")
  const iv = code.trim() ? state.interviewees.find((x) => x.code.toUpperCase() === code.trim().toUpperCase()) : undefined

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!iv) return toast.error(`Unknown interviewee code “${code.trim().toUpperCase()}”.`)
    if (!binome) return toast.error("Choose the binome to move them to.")
    if (await reassign(iv.code, iv.name, iv.binome, binome)) close()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mv-code" className="font-semibold">Interviewee code</Label>
        <Input id="mv-code" value={code} onChange={(e) => setCode(e.target.value)} list="vic-iv-codes" placeholder="IT.07" autoComplete="off" autoFocus />
        <datalist id="vic-iv-codes">
          {state.interviewees.map((i) => (
            <option key={i.code} value={i.code}>
              {i.name + (i.binome ? " · " + i.binome : "")}
            </option>
          ))}
        </datalist>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mv-bin" className="font-semibold">New binome</Label>
        <Select value={binome} onValueChange={setBinome}>
          <SelectTrigger id="mv-bin" className="w-full">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {targets.map((b) => (
              <SelectItem key={b.code} value={b.code}>
                {b.code} · {b.members.join(" & ")}
                {b.status === "PAUSED" ? " (paused)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="rounded-2xl bg-muted/70 p-3 text-sm leading-relaxed text-muted-foreground">
        {iv ? (
          <>
            <b className="text-foreground">{iv.name}</b> · now in <b className="text-foreground">{iv.binome || "no binome"}</b> · {(STATUS_LABEL[iv.status] || iv.status).toLowerCase()}. Contacted, date and notes are carried over to the new binome sheet.
          </>
        ) : (
          "Contacted, date and notes are carried over to the new binome sheet."
        )}
      </p>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !code.trim() || !binome}>
          {busy && action === "reassign" ? <Spinner /> : <MoveRight />} Move…
        </Button>
      </DialogFooter>
    </form>
  )
}

export function MoveDialog() {
  const d = useUi((s) => s.moveDialog)
  const close = useUi((s) => s.closeMoveDialog)
  const state = useVic((s) => s.state)
  return (
    <Dialog open={!!d?.open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-heading">Move an interviewee</DialogTitle>
          <DialogDescription>Hand a candidate to another binome. You confirm the move before it is written.</DialogDescription>
        </DialogHeader>
        {d && state && <Form key={d.nonce} init={d} state={state} />}
      </DialogContent>
    </Dialog>
  )
}
