import { ClipboardList, Cloud, ExternalLink, FileSpreadsheet, FolderOpen, FormInput, Globe, ScrollText, type LucideIcon } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useVic } from "@/lib/vic/store"

interface Item {
  icon: LucideIcon
  name: string
  text: string
  href?: string
  status: string
}

function List({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.name} className="flex flex-wrap items-center gap-4 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <i.icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{i.name}</p>
            <p className="text-sm text-muted-foreground">{i.text}</p>
          </div>
          <Badge variant={i.href || i.status === "Running" ? "success" : "outline"}>{i.href ? "Linked" : i.status}</Badge>
          {i.href && (
            <Button asChild variant="outline" size="sm">
              <a href={i.href} target="_blank" rel="noopener noreferrer">
                Open <ExternalLink />
              </a>
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Where the dashboard's data lives and what it talks to. Read-only: the links come from the script's state. */
export default function ConnectionSettings() {
  const s = useVic((x) => x.state)
  if (!s)
    return (
      <BaseLayout title="Connections" description="What the dashboard reads and writes.">
        <Skeleton className="h-96 w-full rounded-2xl" />
      </BaseLayout>
    )
  const google: Item[] = [
    { icon: FileSpreadsheet, name: "Master sheet", text: "The single source of truth: Registrations, Interviewees, Binomes, Team, Alerts, Settings.", href: s.links.master, status: "" },
    { icon: ClipboardList, name: "Registration form", text: "Where candidates register. Share it at launch.", href: s.links.registrationForm, status: "Not found" },
    { icon: FormInput, name: "Interview form", text: "Filled by binomes after each interview; the script checks and autocorrects it.", href: s.links.interviewForm, status: "Not found" },
    { icon: FolderOpen, name: "Binome sheets folder", text: "One sheet per locked binome.", href: s.links.binomeFolder, status: "Not found" },
  ]
  const services: Item[] = [
    { icon: ScrollText, name: "Apps Script", text: `Runs as whoever is signed in. Syncs every ${s.settings.syncEvery} min, sends the daily digest at ${String(s.settings.digestHour).padStart(2, "0")}:00.`, status: "Running" },
    { icon: Globe, name: "This dashboard", text: "Hosted on Vercel. Your sign-in lives in a sealed cookie; the page never sees the Google token.", status: "Running" },
    { icon: Cloud, name: "Google Cloud project", text: "vic-recruitment: Drive and Apps Script APIs, consent screen limited to ENP accounts.", status: "Internal" },
  ]
  return (
    <BaseLayout title="Connections" description="What the dashboard reads and writes." watermark="Connections">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Google files</CardTitle>
            <CardDescription>The sheets and forms the script works on.</CardDescription>
          </CardHeader>
          <CardContent>
            <List items={google} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Services</CardTitle>
            <CardDescription>What runs behind the buttons.</CardDescription>
          </CardHeader>
          <CardContent>
            <List items={services} />
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
