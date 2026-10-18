import { Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useConfirm } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import { GROUPS, SettingsPage } from "../components/settings-form"

export default function GeneralSettings() {
  return <SettingsPage group={GROUPS.general} extra={<PendingSwitch />} />
}

/** The owner's switch between pending changes and direct writes (issue 57): a script property, not a Settings row, so
 *  only the owner flips it. Off = every save waits for the sheet, as before. Pages pick it up at their next pulse. */
function PendingSwitch() {
  const owner = useVic((s) => !!s.access?.owner)
  const on = useVic((s) => s.pendingOn)
  const busy = useVic((s) => s.busy)
  const run = useVic((s) => s.run)
  const confirm = useConfirm()
  if (!owner) return null
  const flip = async (next: boolean) => {
    const ok = await confirm({
      title: next ? "Turn pending changes on?" : "Turn pending changes off?",
      body: next ? (
        <>
          <p>Resolve, Snooze, Mute and Unmute show at once with a Pending pill and reach the sheet about a minute later, as the admin who clicked, even with the tab closed.</p>
          <p className="text-muted-foreground">A change the sheet overtook comes back on its row as Not applied, with Keep the sheet's value or Apply mine anyway.</p>
        </>
      ) : (
        <p>Every save waits for the sheet again. Changes already pending still go in.</p>
      ),
      okLabel: next ? "Turn on" : "Turn off",
    })
    if (!ok) return
    const out = await run<{ pending: boolean }>("pendingSwitch", { on: next }, next ? "Pending changes on" : "Pending changes off")
    if (out?.result) useVic.setState({ pendingOn: out.result.pending })
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <Clock className="size-4 text-primary" aria-hidden="true" /> Pending changes
          <Badge variant="info" className="ml-1">Owner only</Badge>
        </CardTitle>
        <CardDescription>Alert actions save in under a second and go into the Master in the background. Other admins see them after the next sync.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <Switch checked={on} disabled={busy} onCheckedChange={flip} aria-label="Pending changes" />
          {on ? "On: alert actions are pending changes" : "Off: every save is a direct write"}
        </label>
      </CardContent>
    </Card>
  )
}
