import * as React from "react"

import { call } from "./api"
import { useProfile } from "./analytics"
import { SEVERITY } from "./format"
import { useAlertView } from "./pending"
import { useVic } from "./store"
import type { Alert, MemberState, RunOut } from "./types"

/** The binome's open alerts, worst first, as the inbox sees them (a pending resolve or snooze already applied). */
export function useAlertsOf(code: string): Alert[] {
  const { alerts } = useAlertView()
  return React.useMemo(() => alerts.filter((a) => a.binome === code).sort((x, y) => SEVERITY[y.severity].rank - SEVERITY[x.severity].rank), [alerts, code])
}

type Held = { code: string; slice: MemberState; at: number; live: boolean }

/**
 * One binome's slice for an admin (webRun binomeView, docs/admin-features.md › One binome's panel and page): the last sync's copy
 * plus dashboard edits, read when the page opens and again when a new snapshot lands or the candidate's details close (an edit
 * there changes the copy). read(true) is "Read the sheet now": the sheet itself, with the admin's own access. A failed read keeps
 * the slice on screen and says why. at = when what is shown was read; live = it came from the sheet.
 */
export function useBinomeSlice(code: string, locked: boolean) {
  const built = useVic((s) => s.state?.built)
  const profileOpen = useProfile((s) => s.open)
  const [held, setHeld] = React.useState<Held | null>(null)
  const [fail, setFail] = React.useState<{ code: string; message: string } | null>(null)
  const [reading, setReading] = React.useState(false)
  const seq = React.useRef(0) // the newest read wins: a slow copy never lands over the sheet read after it

  const get = React.useCallback(
    (fresh: boolean) => {
      const mine = ++seq.current
      return call<RunOut<MemberState>>("webRun", ["binomeView", { binome: code, live: fresh }]).then(
        (out) => {
          if (mine !== seq.current) return
          setHeld({ code, slice: out.result, at: Date.now(), live: fresh })
          setFail(null)
        },
        (e: Error) => {
          if (mine === seq.current) setFail({ code, message: e.message })
        }
      )
    },
    [code]
  )

  // a new snapshot, or the details just closed: the copy again (a live read is the admin's to ask for)
  React.useEffect(() => {
    if (locked && !profileOpen) void get(false)
  }, [get, locked, built, profileOpen])

  const read = React.useCallback(
    async (fresh: boolean) => {
      setReading(true)
      try {
        await get(fresh)
      } finally {
        setReading(false)
      }
    },
    [get]
  )

  const mine = held?.code === code ? held : null
  return { slice: mine?.slice ?? null, at: mine?.at ?? 0, live: !!mine?.live, reading, error: fail?.code === code ? fail.message : "", read }
}
