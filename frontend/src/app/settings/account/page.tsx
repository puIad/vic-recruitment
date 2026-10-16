import * as React from "react"
import { LogOut, Repeat, ShieldCheck } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { signInUrl, signOut } from "@/lib/vic/api"
import { displayName, initials } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"

const SESSION_MS = 48 * 3600e3

export default function AccountSettings() {
  const access = useVic((s) => s.access)
  const canEdit = useVic((s) => !!s.member?.edit)
  const email = useVic((s) => s.state?.user || s.member?.user) || access?.email || ""
  const member = access?.role === "member"
  const ends = useVic((s) => s.sessionEnds)
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  const left = ends ? Math.max(0, ends - now) : 0
  const hours = Math.floor(left / 3600e3)
  const mins = Math.round((left % 3600e3) / 60e3)

  return (
    <BaseLayout title="Account" description="Who is signed in, what that account may do, and when the sign-in ends." watermark="Account">
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Signed in</CardTitle>
            <CardDescription>The script runs as this account, so Google decides what it can touch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-vic-aqua text-xl font-extrabold text-vic-ink" aria-hidden="true">
                {initials(email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-2xl font-extrabold leading-tight">{displayName(email)}</p>
                <p className="truncate text-muted-foreground">{email}</p>
              </div>
              <Badge variant={access?.owner ? "success" : "info"} className="ml-auto self-start">
                {member ? (access?.cover ? "Cover" : "Member") : access?.owner ? "Owner" : "Editor"}
              </Badge>
            </div>
            {member ? (
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  {access?.cover
                    ? `An ENP account covering for binome ${access.binome}: you see the candidates you cover, read-only.`
                    : canEdit
                      ? `An ENP account in binome ${access?.binome}: you see its candidates and alerts, and fill in your columns.`
                      : `An ENP account in binome ${access?.binome}: you see its candidates and alerts, read-only.`}
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />{" "}
                  {access?.cover
                    ? "A cover stays read-only: the binome's own members fill in its sheet"
                    : canEdit
                      ? "Your edits go into your binome sheet"
                      : "Editing opens when an admin gives your binome edit access"}
                  ; the rest of the recruitment stays with the admins.
                </li>
              </ul>
            ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> An ENP account that can edit the VIC Recruitment 2026 master sheet.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> {access?.owner ? "You run the sync triggers: you may also run Setup." : "Setup is reserved for the owner, the account that runs the sync triggers."}
              </li>
            </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => signOut(signInUrl)}>
                <Repeat /> Switch account
              </Button>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => signOut("/")}>
                <LogOut /> Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Session</CardTitle>
            <CardDescription>Sign-ins last 48 hours from the moment you sign in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ends ? (
              <>
                <p className="num text-4xl font-extrabold text-heading">
                  {hours}
                  <span className="text-lg font-bold text-muted-foreground"> h </span>
                  {mins}
                  <span className="text-lg font-bold text-muted-foreground"> min left</span>
                </p>
                <Progress value={Math.min(100, (left / SESSION_MS) * 100)} aria-label="Sign-in time left" />
                <p className="text-sm text-muted-foreground">
                  Ends {new Date(ends).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}. Signing back in within the window skips Google's permission screen.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The end time appears after the first request.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
