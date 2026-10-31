import * as React from "react"

import { call } from "./api"
import type { FormsRead, RunOut } from "./types"

/** webRun interviewForms for a candidate (code) or one Interview Log key, read when the component mounts. Key the component by what it
 *  reads: a new candidate or alert starts afresh. */
export function useFormsRead(args: { code: string } | { key: string }) {
  const [data, setData] = React.useState<FormsRead | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)
  const id = "code" in args ? "c:" + args.code : "k:" + args.key
  React.useEffect(() => {
    let live = true
    call<RunOut<FormsRead>>("webRun", ["interviewForms", id.startsWith("c:") ? { code: id.slice(2) } : { key: id.slice(2) }]).then(
      (o) => live && setData(o.result),
      (e: Error) => live && setError(e.message)
    )
    return () => {
      live = false
    }
  }, [id, tries])
  return { data, error, retry: () => { setError(""); setTries((n) => n + 1) } }
}
