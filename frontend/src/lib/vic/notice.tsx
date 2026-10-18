import * as React from "react"
import { toast, type ExternalToast } from "sonner"
import { create } from "zustand"
import { SETTING_UI } from "./settings-ui"

/**
 * The bottom-right notices of dashboard actions: a "running" notice while the script works, which turns into the result.
 * Results show at most 3 lines; once two or more are on screen each shows its first line only, with Details for the rest.
 */

/** ids of the result notices still on screen */
const useLive = create<{ ids: string[] }>(() => ({ ids: [] }))
const live = (id: string, on: boolean) => useLive.setState((s) => ({ ids: on ? [...s.ids.filter((x) => x !== id), id] : s.ids.filter((x) => x !== id) }))

const KEYS = new RegExp(`\\b(${Object.keys(SETTING_UI).join("|")})\\b`, "g")
const ALERT_ID = /^A-\d+: /

/** Script wording → dashboard wording: setting names instead of their keys, real plurals instead of "alert(s)". */
export function friendly(text: string) {
  return text
    .replace(KEYS, (k) => `“${SETTING_UI[k].label}”`)
    .replace(/\b(\d+)(\D{0,24}?)\(s\)/g, (_, n: string, mid: string) => n + mid + (n === "1" ? "" : "s"))
    .replace(/\(s\)/g, "s")
}

/** lines: what the notice shows, first line first. details: everything, for the Details view. */
export function summarize(text: string) {
  let details = friendly(text).split("\n").map((l) => l.trim()).filter(Boolean)
  // Setup's next steps point at the Sheets menu, not at the dashboard
  const steps = details.findIndex((l) => /^Next steps:?$/i.test(l))
  if (steps >= 0) details = details.slice(0, steps)
  // one line per alert ("A-0005: snoozed until …"): counted, so twelve snoozed alerts read as one line
  const perAlert = details.filter((l) => ALERT_ID.test(l))
  if (perAlert.length < 2) return { lines: details, details }
  const groups = new Map<string, number>()
  perAlert.forEach((l) => {
    const t = l.replace(ALERT_ID, "").replace(/\.$/, "")
    groups.set(t, (groups.get(t) || 0) + 1)
  })
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const counted = [...groups].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${cap(t)} (${n} alert${n === 1 ? "" : "s"}).`)
  const lines = [...counted, ...details.filter((l) => !ALERT_ID.test(l))]
  return { lines, details: [...lines, ...perAlert.map((l) => l.replace(/^(A-\d+: )(.)/, (_, id: string, c: string) => id + c.toUpperCase()))] }
}

type Kind = "success" | "error"
interface NoticeProps {
  id: string
  kind: Kind
  lines: string[]
  details: string[]
}

function Notice({ id, kind, lines, details }: NoticeProps) {
  const compact = useLive((s) => s.ids.length >= 2)
  const [open, setOpen] = React.useState(false)
  const [clipped, setClipped] = React.useState(false)
  const ref = React.useRef<HTMLParagraphElement>(null)
  const shown = compact ? lines.slice(0, 1) : lines

  React.useLayoutEffect(() => {
    const el = ref.current
    if (el) setClipped(el.scrollHeight > el.clientHeight + 1)
  }, [compact, open, lines])

  const more = clipped || shown.length < lines.length || details.length > lines.length
  const toggle = () => {
    if (!open) toast[kind](<Notice {...{ id, kind, lines, details }} />, { id, duration: Infinity }) // stays while it is read
    setOpen(!open)
  }

  return (
    <div className="min-w-0 space-y-1.5">
      {open ? (
        <div className="-mr-1 max-h-60 space-y-1 overflow-y-auto pr-1 text-[0.8rem] leading-snug font-normal">
          {details.map((l, i) => (
            <p key={i} className={i === 0 ? "font-semibold" : i >= lines.length ? "opacity-75" : undefined}>
              {l}
            </p>
          ))}
        </div>
      ) : (
        <p ref={ref} className={"leading-snug font-normal break-words " + (compact ? "line-clamp-2" : "line-clamp-3")}>
          {shown.map((l, i) =>
            i === 0 ? (
              <b key={i} className="font-semibold">
                {l}
              </b>
            ) : (
              <React.Fragment key={i}>
                <br />
                {l}
              </React.Fragment>
            )
          )}
        </p>
      )}
      {(more || open) && (
        <button type="button" onClick={toggle} className="text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100">
          {open ? "Hide details" : "Details"}
        </button>
      )}
    </div>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = React.useState(since)
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - since) / 1000))
  return (
    <span className="num">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} · keep this tab open until it finishes
    </span>
  )
}

let seq = 0

/** Shows "<name>…" with a loader until finish() turns it into the result (or removes it when the script said nothing). */
export function startNotice(name: string) {
  const id = `run-${++seq}`
  toast.loading(`${name}…`, { id, description: <Elapsed since={Date.now()} />, duration: Infinity, dismissible: false })

  return function finish(kind: Kind, text: string, opts: Pick<ExternalToast, "action"> & { head?: string } = {}) {
    if (!text && !opts.head) return toast.dismiss(id)
    const s = summarize(text)
    const lines = opts.head ? [opts.head, ...s.lines] : s.lines
    const details = opts.head ? [opts.head, ...s.details] : s.details
    live(id, true)
    const gone = () => live(id, false)
    toast[kind](<Notice {...{ id, kind, lines, details }} />, {
      id,
      description: undefined,
      dismissible: true,
      duration: kind === "error" ? 15000 : details.length > 2 ? 10000 : 6000,
      action: opts.action,
      onDismiss: gone,
      onAutoClose: gone,
    })
    return s.lines[0] || opts.head || ""
  }
}
