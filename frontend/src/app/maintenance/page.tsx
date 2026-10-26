import { Check, FileSpreadsheet, Mail, MailX, Play, RotateCcw, Send, Share2, SlidersHorizontal, TriangleAlert, type LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/lib/vic/confirm"
import { useActions } from "@/lib/vic/actions"
import { useVic } from "@/lib/vic/store"

interface Tool {
  action: string
  icon: LucideIcon
  button: LucideIcon
  title: string
  text: string
  label: string
  run: () => void
  ownerOnly?: boolean
}

/** The old Maintenance tools, one row each. Setup installs triggers, so only the owner sees it (the script enforces it too). */
export default function MaintenancePage() {
  const { integrity, digest, reshare, setup, resetBinomes, rejections } = useActions()
  const busy = useVic((s) => s.busy)
  const jobs = useVic((s) => s.jobs), runs = (a: string) => jobs.some((j) => j.action === a)
  const owner = useVic((s) => !!s.access?.owner)
  const st = useVic((s) => s.state)

  const tools: Tool[] = [
    { action: "integrity", icon: FileSpreadsheet, button: Check, title: "Check integrity", label: "Check", run: integrity, text: "Syncs, then opens every binome sheet: missing or extra rows, moved tabs, lost protection, who can edit. Also runs with the daily digest. It stops in time for the web limit and resumes where it stopped." },
    { action: "digest", icon: Mail, button: Send, title: "Send me the digest now", label: "Send", run: digest, text: "Syncs, then emails the admins the daily summary." },
    { action: "reshare", icon: Share2, button: Share2, title: "Re-share binome sheets", label: "Re-share", run: reshare, text: "Adds current members as editors after you swap someone. Refuses while test mode is on." },
    { action: "rejections", icon: MailX, button: Send, title: "Send rejections", label: "Send…", run: rejections, text: "Once recruitment closes: one polite email to each applicant declined at screening (never to VIC members), with the text shown first so you can edit it. Each one is marked as sent, so pressing it again reaches only those not emailed yet. Never automatic." },
    { action: "setup", icon: SlidersHorizontal, button: Play, title: "Run setup again", label: "Run", run: setup, ownerOnly: true, text: "Safe to repeat: re-checks tabs, form links and triggers, and re-applies the sync interval and digest hour after you change them in Settings." },
  ]

  return (
    <BaseLayout title="Maintenance" description="Checks and repairs that keep the sheets, sharing and mail in step." watermark="Maintenance">
      <Card data-tour="maintenance-tools">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Tools</CardTitle>
          <CardDescription>
            Each one asks before it writes anything{st ? `. The script syncs by itself every ${st.settings.syncEvery} min and sends the digest at ${String(st.settings.digestHour).padStart(2, "0")}:00` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {tools
              .filter((t) => !t.ownerOnly || owner)
              .map((t) => (
                <li key={t.action} className="flex flex-wrap items-center gap-4 py-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <t.icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 basis-72">
                    <p className="font-bold">{t.title}</p>
                    <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                  </div>
                  <Button variant="outline" disabled={busy || runs(t.action)} onClick={t.run} className="min-w-28">
                    {runs(t.action) ? <Spinner /> : <t.button />} {t.label}
                  </Button>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold text-destructive">
            <TriangleAlert className="size-5" /> Danger zone
          </CardTitle>
          <CardDescription>Drafting is closed once binomes are locked. To pair again with a new team, reset first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1 basis-72">
              <p className="font-bold">Reset all binomes</p>
              <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
                Deletes every binome and its sheet, empties the Team tab and sends every interviewee back to Unassigned, so you can import a new team and start over. You will be asked to type a confirmation.
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={busy || !st}
              onClick={() => st && resetBinomes(st.binomes.length, st.interviewees.length)}
              className="min-w-28"
            >
              {runs("resetBinomes") ? <Spinner /> : <RotateCcw />} Reset…
            </Button>
          </div>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Thresholds, sharing and email live in <Link to="/settings/timing" className="font-semibold text-primary hover:underline">Settings</Link>. Past runs are listed under Activity: open the live status ring in the top bar.
      </p>
    </BaseLayout>
  )
}
