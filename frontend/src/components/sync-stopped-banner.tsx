import { CircleAlert } from "lucide-react"

import { useSyncStop } from "@/lib/vic/sync-watch"

/** On top of every admin page while the timed sync is stopped. It can't be dismissed: the next finished cycle clears it. */
export function SyncStoppedBanner() {
  const stop = useSyncStop()
  if (!stop) return null
  return (
    <div role="alert" className="mx-4 mt-4 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger lg:mx-6">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          The timed sync has not finished a cycle since {stop.time}. New registrations and binome edits wait until someone presses Sync now, and the digest won't go out. Tell vic.rh.
        </p>
        {stop.script && (
          <p>
            <a href={stop.script} target="_blank" rel="noreferrer" className="font-bold underline">
              Open the project on script.google.com
            </a>
            , pick <b>reauthorize</b> in the function list, press Run, tick every box.
          </p>
        )}
        {stop.script && stop.stillStopped && <p>Still red one interval after re-authorizing? Run Setup from the Master's menu.</p>}
      </div>
    </div>
  )
}
