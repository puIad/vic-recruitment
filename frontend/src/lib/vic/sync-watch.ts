import { useVic } from "@/lib/vic/store"

/** Whether the timed sync has stopped, from webPulse's sync field (docs/admin-features.md, When the timed sync stops). Same rule as syncStaleMs_ in Sync.gs. */
export function syncStop(age: number, everyMin: number) {
  const staleMs = Math.max(3 * everyMin, 15) * 60e3
  return { stopped: age >= staleMs, stillStopped: age >= staleMs + everyMin * 60e3 }
}

/** The stop an admin should see, or null: the last cycle's time in the Master's zone, the project's id for the trigger owner, and whether one interval has passed since it turned red. */
export function useSyncStop() {
  const sync = useVic((s) => s.sync)
  const every = useVic((s) => s.state?.settings.syncEvery ?? 15)
  const tz = useVic((s) => s.state?.settings.tz)
  if (!sync) return null
  const { stopped, stillStopped } = syncStop(sync.age, every)
  if (!stopped) return null
  const time = new Date(sync.at).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "")
  return { time, script: sync.script, stillStopped }
}
