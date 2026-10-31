import * as React from "react"

import { useVic } from "@/lib/vic/store"
import type { Binome, BinomeOp } from "@/lib/vic/types"
import { AccessDialog } from "./access-dialog"
import { PauseDialog } from "./pause-dialog"
import { TagDialog } from "./tag-dialog"

/** What a binome's menu opens: its sheet and dashboard access, its department, a pause or resume. */
export type BinomeDialogs = { access: (b: Binome) => void; tag: (b: Binome) => void; pause: (b: Binome, op: BinomeOp) => void }

/**
 * The three dialogs the Binomes table, the binome panel and the binome page share. `dialogs` opens them; render `node` once
 * anywhere on the page. rows = the binomes as the author's screen shows them (pending pauses over the snapshot).
 */
export function useBinomeDialogs(rows: Binome[]) {
  const interviewees = useVic((s) => s.state?.interviewees) ?? []
  const [accessOf, setAccessOf] = React.useState<string | null>(null)
  const [tagOf, setTagOf] = React.useState<string | null>(null)
  const [pauseOf, setPauseOf] = React.useState<{ code: string; op: BinomeOp } | null>(null)
  const dialogs = React.useMemo<BinomeDialogs>(() => ({ access: (b) => setAccessOf(b.code), tag: (b) => setTagOf(b.code), pause: (b, op) => setPauseOf({ code: b.code, op }) }), [])
  const pauseBinome = rows.find((b) => b.code === pauseOf?.code) ?? null
  const node = (
    <>
      <AccessDialog binome={rows.find((b) => b.code === accessOf) ?? null} onClose={() => setAccessOf(null)} />
      <TagDialog binome={rows.find((b) => b.code === tagOf) ?? null} onClose={() => setTagOf(null)} />
      {pauseBinome && pauseOf && <PauseDialog key={pauseOf.code + pauseOf.op} binome={pauseBinome} op={pauseOf.op} all={rows} interviewees={interviewees} onClose={() => setPauseOf(null)} />}
    </>
  )
  return { dialogs, node }
}
