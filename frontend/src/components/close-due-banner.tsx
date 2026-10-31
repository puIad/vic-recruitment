import * as React from "react"
import { Link } from "react-router-dom"
import { CalendarClock } from "lucide-react"

import { useVic } from "@/lib/vic/store"

/** On top of every admin page once the interview close date has passed and the phase is still open. It comes from the date itself,
 *  so it shows even when the sync has stopped; closing the phase or moving the date clears it. */
export function CloseDueBanner() {
  const close = useVic((s) => s.state?.close)
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  if (!close || close.on || !close.date || close.date > now) return null
  return (
    <div role="alert" className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-vic-orange/40 bg-warning-soft p-4 text-sm lg:mx-6">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-foreground/90">
        <b className="font-bold">The interview close date has passed.</b> Nothing locks by itself: close the interview phase when the interviews are done.{" "}
        <Link to="/maintenance" className="font-bold text-primary underline">Open Maintenance</Link>
      </p>
    </div>
  )
}
