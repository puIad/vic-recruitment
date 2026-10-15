import { CircleAlert, RefreshCw, ShieldCheck, Table2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"
import { GROUPS, SettingsPage } from "../components/settings-form"

/** The linked members sheet: how many emails the script read, when, and Refresh now (read as the admin pressing it). */
function MembersList() {
  const sc = useVic((s) => s.state?.screening)
  const team = useVic((s) => s.state?.team.total ?? 0)
  const busy = useVic((s) => s.busy)
  const action = useVic((s) => s.busyAction)
  const { membersRefresh } = useActions()
  if (!sc) return null
  const m = sc.members
  const broken = sc.linked && !!m.error
  return (
    <Card className={cn(broken && "border-destructive/40")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <Table2 className="size-5 text-primary" aria-hidden="true" /> VIC members list
        </CardTitle>
        <CardDescription>
          An application from one of these emails is declined and nobody is told, not even the admins by mail: it shows once in the history. The Team tab's {team} members always count too.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {!sc.linked ? (
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">No sheet linked yet. Paste its link in <b className="text-foreground">VIC members sheet</b> above and save.</p>
          ) : broken ? (
            <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <b>Can't read it:</b> {m.error}. Registrations carry on without this check until it reads again.
              </span>
            </p>
          ) : (
            <dl className="flex min-w-0 flex-1 flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Emails read</dt>
                <dd className="num text-3xl font-extrabold leading-tight text-heading">{m.at ? m.n : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Last read</dt>
                <dd className="num mt-1.5 font-semibold">{m.at || "not yet"}</dd>
              </div>
            </dl>
          )}
          <Button variant="outline" disabled={busy || !sc.linked} onClick={membersRefresh} className="min-w-36">
            {busy && action === "membersRefresh" ? <Spinner /> : <RefreshCw />} Refresh now
          </Button>
        </div>
        <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          The sync reads the sheet as the trigger account (<b>vic.rh</b>) at most every 30 minutes; Refresh now reads it as you. Both need view access. The script finds the column whose header contains
          “mail” on the tab the link opens, or on the first tab that has one. Nothing from it is copied anywhere.
        </p>
      </CardContent>
    </Card>
  )
}

const RULES: [string, string, string][] = [
  ["Only punctuation or emoji", "“.”, “..”, “/”, “🔥🔥”", "60"],
  ["One word", "“Yes”, “Creativity”, a name typed where the answer goes", "50"],
  ["A non-answer", "“I don't know”, “idk”, “no idea”, “nothing”, “rien”, “je sais pas”, “test”", "50"],
  ["Under 10 words in all", "Why VIC, Why this department and Anything to add together. Never holds by itself", "10"],
]

/** The owner's rules of 2026-10-15, so admins know why something was held. Rules.gs screenApplication is the truth. */
function HowItDecides() {
  const sc = useVic((s) => s.state?.screening)
  const holdAt = sc?.holdAt ?? 50
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-5 text-primary" aria-hidden="true" /> How screening decides
        </CardTitle>
        <CardDescription>
          It reads Why VIC and Why this department. Each answer that matches a rule adds its points; at <b className="num text-foreground">{holdAt}</b> or more the application waits in Alerts for a person.
          Nothing is ever declined on the score.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {RULES.map(([title, eg, pts]) => (
            <li key={title} className="flex items-start gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{eg}</p>
              </div>
              <Badge variant={Number(pts) >= holdAt ? "warning" : "secondary"} className="num shrink-0">
                +{pts}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          Words are counted on spaces, so Arabic, French and Darija count like English. On the 273 applications of 2025 these rules hold 11. Names typed the wrong way round (the family name in the
          first-name field, as their ENP email shows) are swapped whether screening is on or not, and marked NAMES_SWAPPED in Flags.
        </p>
      </CardContent>
    </Card>
  )
}

export default function ScreeningSettings() {
  return (
    <SettingsPage
      group={GROUPS.screening}
      extra={
        <>
          <MembersList />
          <HowItDecides />
        </>
      }
    />
  )
}
