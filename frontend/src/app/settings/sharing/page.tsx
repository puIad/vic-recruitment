import { Link } from "react-router-dom"
import { Check, FlaskConical, Minus, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"
import { PendingMark } from "@/app/alerts/components/pending-mark"
import { isTrue } from "@/lib/vic/settings-ui"
import { GROUPS } from "../components/settings-groups"
import { SettingDrop, SettingsPage, type SettingsForm } from "../components/settings-form"

function Yes({ on, note }: { on: boolean; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {on ? <Check className="size-4 text-success" aria-label="Yes" /> : <Minus className="size-4 text-muted-foreground" aria-label="No" />}
      {note && <span className="text-sm text-muted-foreground">{note}</span>}
    </span>
  )
}

/** Read-only summary of the toggles above: who actually gets mail or file access, given the current settings. */
function WhoHears() {
  const st = useVic((s) => s.state)
  if (!st) return null
  const min = String(st.settingsAll.find((s) => s.key === "INSTANT_EMAIL_MIN_SEVERITY")?.value || "MEDIUM")
  const test = st.settings.testMode
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    [min === "INFO" ? "Any alert" : min === "HIGH" ? "A high alert" : "A medium or high alert", <Yes on note="instantly" />, <Yes on={st.settings.notifyBinome && !test} note={test ? "test mode" : undefined} />, <Yes on note="in the digest" />],
    ["A new interviewee for a binome", <Yes on={false} />, <Yes on={st.settings.notifyNew && !test} note={test ? "test mode" : undefined} />, <Yes on note="in the digest" />],
    ["A hand edit of the Master or a sheet check", <Yes on note="instantly" />, <Yes on={false} note="admins only" />, <Yes on note="in the digest" />],
    ["Edit access to a binome sheet", <Yes on />, <Yes on={st.settings.shareFiles && !test} note={test ? "test mode: nothing shared" : st.settings.shareFiles ? undefined : "sharing is off"} />, <Yes on={false} />],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Who hears about what</CardTitle>
        <CardDescription>What the settings above add up to right now{test ? ". Test mode is on, so mail reaches the admins only" : ""}.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Admins</TableHead>
              <TableHead>The binome</TableHead>
              <TableHead>Daily digest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(([when, a, b, d]) => (
              <TableRow key={when}>
                <TableCell className="font-semibold whitespace-normal">{when}</TableCell>
                <TableCell>{a}</TableCell>
                <TableCell>{b}</TableCell>
                <TableCell>{d}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** Test mode as the page's headline: what it means right now, and Go live… (the confirmation of commit) or Back to test mode. */
function TestMode({ f }: { f: SettingsForm }) {
  const busy = useVic((s) => s.busy || s.accepting > 0)
  const s = f.row("TEST_MODE")
  if (!s) return null
  const on = isTrue(f.value("TEST_MODE"))
  return (
    <Card className={cn(on ? "border-info/40 bg-info-soft/40" : "border-success/40 bg-success/5")}>
      <CardContent className="flex flex-wrap items-start gap-4">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", on ? "bg-info/15 text-info" : "bg-success/15 text-success")}>
          {on ? <FlaskConical className="size-5" aria-hidden="true" /> : <Rocket className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
            {on ? "Test mode is on" : "Live"}
            <PendingMark mark={f.mark("TEST_MODE")} />
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {on ? (
              "Mail goes to the admins only and no binome sheet is shared. Keep it on until launch day."
            ) : (
              <>
                Real emails go to binome members and registrants, and binome sheets are shared with their members. Just gone live? Run{" "}
                <Link to="/maintenance" className="font-semibold text-primary hover:underline">Maintenance › Re-share binome sheets</Link> once.
              </>
            )}
          </p>
          <SettingDrop mark={f.mark("TEST_MODE")} s={s} />
        </div>
        <Button variant={on ? "default" : "outline"} disabled={busy} onClick={() => f.commit({ TEST_MODE: !on })} className="shrink-0">
          {on ? <Rocket /> : <FlaskConical />} {on ? "Go live…" : "Back to test mode"}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SharingSettings() {
  return <SettingsPage group={GROUPS.sharing} top={(f) => <TestMode f={f} />} extra={<WhoHears />} />
}
