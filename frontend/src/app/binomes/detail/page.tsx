import * as React from "react"
import { Link, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Database, RotateCw, UserRoundCheck } from "lucide-react"

import { AlertDetail } from "@/app/alerts/components/alert-detail"
import { CandidatesTable } from "@/app/my-binome/components/candidates"
import { BaseLayout } from "@/components/layouts/base-layout"
import { MemberNames } from "@/components/member-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useProfile } from "@/lib/vic/analytics"
import { useAlertsOf, useBinomeSlice } from "@/lib/vic/binome-view"
import { useBinomeRows } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"
import { useBinomeDialogs } from "../components/binome-dialogs"
import { AlertsCard, BinomeActions, DraftNote, MailsCard, MembersCard, PausedNote, ProgressCard, StatusLine } from "../components/binome-parts"
import { ChangesCard } from "../components/changes-card"

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

/**
 * One binome, as the admin's own page (docs/admin-features.md › One binome's panel and page), reached at /binomes/:code from the
 * palette, an alert, a candidate, Binomes behind, the Team page and Settings. In My binome's layout: header, progress and coming-up
 * interviews beside the open alerts, members and covers, candidates, changes. It writes nothing of its own: each action is the
 * one its own section describes.
 */
export default function BinomePage() {
  const { code = "" } = useParams()
  const rows = useBinomeRows()
  const loaded = useVic((s) => !!s.state)
  const updated = useVic((s) => s.state?.updated)
  const myBinome = useVic((s) => s.member?.binome ?? "")
  const covers = useVic((s) => s.state?.covers)
  const show = useProfile((s) => s.show)
  const b = rows.find((x) => x.code === code)
  const locked = !!b && b.status !== "DRAFT"
  const { slice, at, live, reading, error, read } = useBinomeSlice(code, locked)
  const alerts = useAlertsOf(code)
  const { dialogs, node } = useBinomeDialogs(rows)
  const [alertId, setAlertId] = React.useState<string | null>(null)
  const alert = alerts.find((a) => a.id === alertId) ?? null
  if (alertId && !alert) setAlertId(null) // fixed: the side panel closes

  const openCandidate = React.useCallback((c: string) => show(c), [show])
  const table = React.useMemo(
    () => ({
      badge: (c: string) => {
        const cv = covers?.find((x) => x.binome === code && x.live.includes(c))
        return cv ? (
          <Badge variant="info" className="ml-2 shrink-0">
            <UserRoundCheck className="size-3" /> covered by {cv.name.split(" ")[0]}
          </Badge>
        ) : null
      },
    }),
    [covers, code]
  )

  if (!b) {
    return (
      <BaseLayout title={code} description={loaded ? "No binome with this code." : "Loading…"} watermark="Binome">
        {!loaded ? (
          <Skeleton className="h-80 rounded-xl" />
        ) : (
          <Button asChild variant="outline" className="w-fit">
            <Link to="/binomes">
              <ArrowLeft /> All binomes
            </Link>
          </Button>
        )}
      </BaseLayout>
    )
  }

  return (
    <BaseLayout
      title={`Binome ${b.code}`}
      watermark="Binome"
      description={
        <>
          <StatusLine b={b} />
          <span className="mt-1 block">
            <MemberNames names={b.members} empty="No members" />
          </span>
          <span className="mt-1 block text-sm">
            <Link to="/binomes" className="font-semibold text-primary hover:underline">
              All binomes
            </Link>
            {myBinome === b.code && (
              <>
                {" · You're in this binome. "}
                <Link to="/my-binome" className="font-semibold text-primary hover:underline">
                  Open My binome
                </Link>{" "}
                for your member view.
              </>
            )}
          </span>
        </>
      }
      actions={<BinomeActions b={b} dialogs={dialogs} />}
    >
      <PausedNote b={b} dialogs={dialogs} />
      {b.status === "DRAFT" ? (
        <>
          <DraftNote />
          <MembersCard b={b} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <ProgressCard b={b} coming className="min-w-0 lg:col-span-3" />
            <AlertsCard code={b.code} alerts={alerts} onOpen={setAlertId} className="min-w-0 lg:col-span-2" />
          </div>

          <MembersCard b={b} />

          <MailsCard code={b.code} />

          <section aria-labelledby="cand-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="cand-title" className="text-lg font-bold">
                  Candidates
                </h2>
                <p className="text-sm text-muted-foreground">Every column of the binome's sheet: View shows more. Open one for its details and the binome's columns.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span title={live ? "Read from the binome sheet" : "The copy from the last sync, plus dashboard edits"}>
                  {live ? `Sheet read at ${hhmm(at)}` : `As of ${updated || (at ? hhmm(at) : "…")}`}
                </span>
                <Button size="sm" variant="outline" disabled={reading} onClick={() => void read(true)}>
                  <RotateCw className={cn(reading && "animate-spin")} /> Read the sheet now
                </Button>
              </div>
            </div>
            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-warning-soft p-4 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <p>
                  {error}
                  {slice && " What is on screen is the last copy."}
                </p>
              </div>
            )}
            {slice?.fromSheet && (
              <div className="flex items-start gap-3 rounded-xl bg-info-soft p-4 text-sm">
                <Database className="mt-0.5 size-4 shrink-0 text-info" />
                <p>
                  <b className="font-bold">Read straight from the binome sheet.</b> Statuses show here after the script's next sync.
                </p>
              </div>
            )}
            {slice ? (
              <CandidatesTable key={code} candidates={slice.candidates} fromSheet={!!slice.fromSheet} onOpen={openCandidate} admin={table} />
            ) : error ? null : (
              <Skeleton className="h-80 rounded-xl" />
            )}
          </section>

          <ChangesCard code={b.code} />

          <Sheet open={!!alert} onOpenChange={(o) => !o && setAlertId(null)}>
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
              <SheetHeader className="sr-only">
                <SheetTitle>Alert on {b.code}</SheetTitle>
                <SheetDescription>The quick fix for this alert.</SheetDescription>
              </SheetHeader>
              <AlertDetail alert={alert} />
            </SheetContent>
          </Sheet>
        </>
      )}
      {node}
    </BaseLayout>
  )
}
