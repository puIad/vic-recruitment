"use client"

import * as React from "react"
import { Check, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { DEPTS } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import type { AnalyticsRow, CandidateData } from "@/lib/vic/types"
import type { CellField } from "./cell-fields"

/** A value in the table that opens a small editor on a click. One cell, one save, same checks as the Edit form. */
export function EditCell({ iv, field, row, shown }: { iv: { code: string; name: string }; field: CellField; row: AnalyticsRow | undefined; shown: React.ReactNode }) {
  const { editCandidate, candidateGet } = useActions()
  const busy = useVic((s) => s.busy)
  const [open, setOpen] = React.useState(false)
  const [vals, setVals] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [cand, setCand] = React.useState<CandidateData | null>(null)
  const start = row ? field.read(row) : []

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const c = cand ?? (await candidateGet(iv.code))
      if (!c) return
      const values = Object.fromEntries(field.keys.map((k, i) => [k, vals[i] ?? ""]).filter(([k, v]) => v.trim() !== (c.values[k] ?? "").trim()))
      if (!Object.keys(values).length) return setOpen(false)
      if (await editCandidate(c, values, true)) setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setVals(start)
          setCand(null)
          if (field.options) void candidateGet(iv.code).then(setCand) // the server's own option lists
        }
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!row}
          aria-label={`Edit ${field.title} of ${iv.code}`}
          className="group -mx-1.5 inline-flex max-w-[16rem] items-center gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
        >
          <span className="truncate" title={typeof shown === "string" ? shown : undefined}>{shown}</span>
          {row && <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm font-semibold">
            {field.title} <span className="font-normal text-muted-foreground">· {iv.code}</span>
          </p>
          {field.keys.map((k, i) => {
            const list = field.options === "depts" ? DEPTS : field.options === "fields" ? cand?.fields : field.options === "years" ? cand?.years : undefined
            return field.options ? (
              <Select key={k} value={vals[i] ?? ""} onValueChange={(v) => setVals((p) => p.map((x, j) => (j === i ? v : x)))}>
                <SelectTrigger className="w-full" aria-label={k}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {(vals[i] && !(list ?? []).includes(vals[i]) ? [vals[i], ...(list ?? [])] : list ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                key={k}
                aria-label={k}
                value={vals[i] ?? ""}
                placeholder={field.keys.length > 1 ? k : undefined}
                onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                autoComplete="off"
                autoFocus={i === 0}
              />
            )
          })}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || saving}>
              {saving ? <Spinner /> : <Check />} Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
