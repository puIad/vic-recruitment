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
  const owner = useVic((x) => x.access?.owner)
  if (!s)
    return (
      <BaseLayout title="Connections" description="The Google files the dashboard works with.">
        <Skeleton className="h-96 w-full rounded-2xl" />
      </BaseLayout>
    )
  const google: Item[] = [
    { icon: FileSpreadsheet, name: "Master sheet", text: "The main spreadsheet. Registrations, interviewees, binomes, the team, alerts and settings all live here.", href: s.links.master, status: "Not linked" },
    { icon: ClipboardList, name: "Registration form", text: "Where candidates sign up. Share its link when registration opens.", href: s.links.registrationForm, status: "Not linked" },
    { icon: FormInput, name: "Interview form", text: "Each binome fills it in after an interview. The answers are checked and small mistakes fixed.", href: s.links.interviewForm, status: "Not linked" },
    { icon: FolderOpen, name: "Binome sheets folder", text: "One spreadsheet per binome, made once the binomes are locked.", href: s.links.binomeFolder, status: "Not linked" },
  ]
  const services: Item[] = [
    { icon: ScrollText, name: "Background tasks", text: `Run on your Google account. They check the sheets every ${s.settings.syncEvery} min and send the daily summary email at ${String(s.settings.digestHour).padStart(2, "0")}:00.`, status: "Running" },
    { icon: Globe, name: "This dashboard", text: "Hosted on Vercel. Your Google sign-in stays on the server: this page never handles it.", status: "Running" },
    { icon: Cloud, name: "Google Cloud project", text: "vic-recruitment. Lets the system use Drive and Apps Script. Only ENP accounts can sign in.", status: "ENP only" },
  ]
  return (
    <BaseLayout title="Connections" description="The Google files the dashboard works with." watermark="Connections">
      <div className={owner ? "grid gap-6 xl:grid-cols-2" : "grid gap-6"}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Google files</CardTitle>
            <CardDescription>The sheets and forms behind the dashboard. Open one to see it in Google.</CardDescription>
          </CardHeader>
          <CardContent>
            <List items={google} />
          </CardContent>
        </Card>
        {owner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">Services</CardTitle>
              <CardDescription>What keeps the dashboard running. Only you see this card.</CardDescription>
            </CardHeader>
            <CardContent>
              <List items={services} />
            </CardContent>
          </Card>
        )}
      </div>
    </BaseLayout>
  )
}
