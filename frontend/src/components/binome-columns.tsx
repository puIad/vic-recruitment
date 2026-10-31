import * as React from "react"
import { AlertCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { call, ApiError } from "@/lib/vic/api"
import { GoldField, GoldForm, type AdminWrite } from "@/app/my-binome/components/gold-fields"
import type { MemberSetResult } from "@/lib/vic/store"
import { SHEET_LABEL } from "@/lib/vic/format"
import { GOLD_KEYS, type AdminColumns, type AdminFillOut, type AdminSetOut, type GoldKey, type RunOut } from "@/lib/vic/types"

const run = <R,>(action: string, args: Record<string, unknown>) => call<RunOut<R>>("webRun", [action, args])

/**
 * The binome's seven columns for one candidate, in the details panel (docs/admin-features.md): the same form as My binome, written
 * straight into the binome sheet with the admin's own access (webRun adminSet). Read fresh from that sheet when it opens, so the
 * value each field sends back as `seen` is the sheet's. A field the binome changed meanwhile is refused and shows the new value.
 * Key it by candidate: switching candidates starts afresh.
 */
export function BinomeColumns({ code }: { code: string }) {
  const [data, setData] = React.useState<AdminColumns | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    run<AdminColumns>("binomeColumnsGet", { code }).then(
      (o) => live && setData(o.result),
      (e: Error) => live && setError(e.message)
    )
    return () => {
      live = false
    }
  }, [code, tries])

  if (error)
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-2">
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={() => { setError(""); setTries((n) => n + 1) }}>
            <RotateCw /> Try again
          </Button>
        </div>
      </div>
    )
  if (!data) return <Skeleton className="h-64 rounded-xl" />

  const admin: AdminWrite = {
    binome: data.binome,
    async save(c, fields) {
      try {
        const out = await run<AdminSetOut>("adminSet", { code: c, fields })
        setData((d) => d && { ...d, setBy: out.result.setBy })
        return out.result.fields.map((r): MemberSetResult => ("value" in r ? { ok: true, value: r.value } : "conflict" in r ? { conflict: r.conflict } : { error: r.error }))
      } catch (e) {
        const err = { error: (e as Error).message, busy: e instanceof ApiError && e.code === "BUSY" }
        return fields.map(() => err)
      }
    },
    async fill(k) {
      const out = await run<AdminFillOut>("adminFormFill", { code, field: k })
      setData((d) => d && { ...d, setBy: out.result.setBy })
      return out.result.value
    },
  }

  return (
    <GoldForm key={code} code={code} candidate={{ ...data.candidate, setBy: data.setBy }} admin={admin}>
      <dl className="divide-y rounded-xl border border-vic-aqua/50 bg-accent/30">
        {GOLD_KEYS.map((k: GoldKey) => (
          <div key={k} className="grid grid-cols-1 gap-1.5 px-3 py-3 text-sm sm:grid-cols-[9rem_1fr] sm:gap-3">
            <dt className="pt-2 font-medium text-foreground/80">
              <label htmlFor={`gold-${code}-${k.replace(/\s+/g, "-")}`}>{SHEET_LABEL[k]}</label>
            </dt>
            <dd className="min-w-0">
              <GoldField k={k} />
            </dd>
          </div>
        ))}
      </dl>
    </GoldForm>
  )
}
