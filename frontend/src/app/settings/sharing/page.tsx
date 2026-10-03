import { Check, Minus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useVic } from "@/lib/vic/store"
import { GROUPS, SettingsPage } from "../components/settings-form"

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
    ["An alert at or above " + min.toLowerCase(), <Yes on note="instantly" />, <Yes on={st.settings.notifyBinome && !test} note={test ? "test mode" : undefined} />, <Yes on note="in the digest" />],
    ["A new interviewee for a binome", <Yes on={false} />, <Yes on={st.settings.notifyNew && !test} note={test ? "test mode" : undefined} />, <Yes on note="in the digest" />],
    ["A hand edit of the Master or a sheet check", <Yes on note="instantly" />, <Yes on={false} note="admins only" />, <Yes on note="in the digest" />],
    ["Edit access to a binome sheet", <Yes on />, <Yes on={st.settings.shareFiles} note={test ? "test mode: nothing shared" : st.settings.shareFiles ? undefined : "sharing is off"} />, <Yes on={false} />],
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

export default function SharingSettings() {
  return <SettingsPage group={GROUPS.sharing} extra={<WhoHears />} />
}
