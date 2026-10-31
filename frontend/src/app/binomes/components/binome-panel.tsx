import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Maximize2 } from "lucide-react"

import { AlertDetail } from "@/app/alerts/components/alert-detail"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAlertsOf } from "@/lib/vic/binome-view"
import { useBinomeRows } from "@/lib/vic/pending"
import type { BinomeDialogs } from "./binome-dialogs"
import { AlertsCard, BinomeActions, DraftNote, MailsCard, MembersCard, PausedNote, ProgressCard, StatusLine } from "./binome-parts"

/**
 * One binome's summary from the Binomes table (docs/admin-features.md › One binome's panel and page): header and actions, members
 * and covers, progress, open alerts. It needs nothing the dashboard doesn't already hold. An alert's Fix, Compare or Review
 * replaces the content with its form, and a back button returns. Full page goes to /binomes/:code.
 */
export function BinomePanel({ code, onClose, dialogs }: { code: string | null; onClose: () => void; dialogs: BinomeDialogs }) {
  const rows = useBinomeRows()
  const b = rows.find((x) => x.code === code)
  const alerts = useAlertsOf(code ?? "")
  const [alertId, setAlertId] = React.useState<string | null>(null)
  const alert = alerts.find((a) => a.id === alertId) ?? null
  if (alertId && !alert) setAlertId(null) // fixed: back to the list
  return (
    <Sheet
      open={!!code}
      onOpenChange={(o) => {
        if (!o) {
          setAlertId(null)
          onClose()
        }
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {alert ? (
          <>
            <SheetHeader className="border-b p-4">
              <SheetTitle className="sr-only">Alert on {code}</SheetTitle>
              <SheetDescription className="sr-only">The quick fix for this alert.</SheetDescription>
              <Button size="sm" variant="ghost" className="w-fit" onClick={() => setAlertId(null)}>
                <ArrowLeft /> Back to {code}
              </Button>
            </SheetHeader>
            <AlertDetail alert={alert} />
          </>
        ) : b ? (
          <>
            <SheetHeader className="gap-3 border-b p-6">
              <SheetTitle className="text-3xl font-extrabold text-heading">{b.code}</SheetTitle>
              <SheetDescription asChild>
                <div>
                  <StatusLine b={b} />
                </div>
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link to={`/binomes/${encodeURIComponent(b.code)}`}>
                    <Maximize2 /> Full page
                  </Link>
                </Button>
                <BinomeActions b={b} dialogs={dialogs} compact />
              </div>
            </SheetHeader>
            <div className="space-y-5 p-4">
              <PausedNote b={b} dialogs={dialogs} />
              {b.status === "DRAFT" && <DraftNote />}
              <MembersCard b={b} />
              {b.status !== "DRAFT" && (
                <>
                  <ProgressCard b={b} />
                  <AlertsCard code={b.code} alerts={alerts} onOpen={setAlertId} />
                  <MailsCard code={b.code} />
                </>
              )}
            </div>
          </>
        ) : (
          <SheetHeader className="p-6">
            <SheetTitle>{code}</SheetTitle>
            <SheetDescription>This binome is gone.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
