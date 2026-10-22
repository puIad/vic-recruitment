import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { AlertCircle, RotateCw } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DEPT_VARS, useAnalytics } from "@/lib/vic/analytics"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"
import { buildModel } from "./model"
import { BinomeSpeedCard, FunnelCard, PerDayCard, PerHourCard, RaceCard } from "./components/registrations"
import { AgeCard, BirthdaysCard, FieldCard, HeardCard, YearCard } from "./components/people"
import { DemandCard, FieldDeptCard, PairsCard } from "./components/departments"
import { AnswersCard, LengthCard, WordsCard } from "./components/motivation"
import { BirthChecksCard, QualityCard } from "./components/quality"
import { ApplicantsTable } from "./components/applicants"

const TABS = [
  { id: "flow", label: "Registrations" },
  { id: "who", label: "Who applied" },
  { id: "depts", label: "Departments" },
  { id: "why", label: "Motivation" },
  { id: "quality", label: "Data quality" },
  { id: "all", label: "All applicants" },
] as const

/**
 * Who applied, and how the recruitment is moving (docs/plans.md › Analytics, Launch scope 2026-10-22). webAnalytics loads once
 * per session when this page or a profile first opens; Reload reads the Master again. Every count is made here, in the browser.
 */
export default function AnalyticsPage() {
  const { data, loading, error, loadedAt, load } = useAnalytics()
  const team = useVic((s) => s.state?.teamList)
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "flow"
  const setTab = (t: string) => {
    const n = new URLSearchParams(params)
    if (t === "flow") n.delete("tab")
    else n.set("tab", t)
    setParams(n, { replace: true })
  }
  const [q, setQ] = React.useState("")

  React.useEffect(() => {
    void load()
  }, [load])

  const m = React.useMemo(() => (data ? buildModel(data.rows, data.tz || "Africa/Algiers", (team ?? []).map((t) => t.name)) : null), [data, team])

  const description = m
    ? `${m.live.length} applicants${m.rows.length > m.live.length ? ` (plus ${m.rows.length - m.live.length} duplicate or declined, counted only under Data quality)` : ""}, read from the Master at ${new Date(loadedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`
    : error
      ? "The registrations did not load."
      : "Reading every registration from the Master…"

  return (
    <BaseLayout title="Analytics" description={description} watermark="Analytics">
      <Tabs value={tab} onValueChange={setTab} className={cn("gap-6", DEPT_VARS)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-4 max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-10 rounded-full p-1">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="rounded-full px-3.5">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}>
            <RotateCw className={cn(loading && "animate-spin")} /> {loading ? "Reading…" : "Reload"}
          </Button>
        </div>

        {error && !m ? (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-danger-soft p-5 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-3">
              <p className="font-semibold">{error}</p>
              <Button size="sm" variant="outline" onClick={() => void load(true)}>
                <RotateCw /> Try again
              </Button>
            </div>
          </div>
        ) : !m ? (
          <Loading />
        ) : (
          <>
            <TabsContent value="flow" className="grid gap-6 lg:grid-cols-5">
              <RaceCard m={m} />
              <PerDayCard m={m} />
              <FunnelCard m={m} />
              <BinomeSpeedCard m={m} />
              <div className="lg:col-span-5 [&>*]:h-full">
                <PerHourCard m={m} />
              </div>
            </TabsContent>

            <TabsContent value="who" className="grid gap-6 lg:grid-cols-2">
              <YearCard m={m} />
              <div className="lg:row-span-2 [&>*]:h-full">
                <FieldCard m={m} />
              </div>
              <AgeCard m={m} />
              <BirthdaysCard m={m} />
              <HeardCard m={m} />
            </TabsContent>

            <TabsContent value="depts" className="grid gap-6 lg:grid-cols-5">
              <DemandCard m={m} />
              <div className="lg:col-span-3 [&>*]:h-full">
                <PairsCard m={m} />
              </div>
              <div className="lg:col-span-5 [&>*]:h-full">
                <FieldDeptCard m={m} />
              </div>
            </TabsContent>

            <TabsContent value="why" className="grid items-start gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 lg:row-span-2 [&>*]:h-full">
                <AnswersCard m={m} q={q} setQ={setQ} />
              </div>
              <WordsCard m={m} onPick={setQ} />
              <LengthCard m={m} />
            </TabsContent>

            <TabsContent value="quality" className="grid items-start gap-6 lg:grid-cols-3">
              <QualityCard m={m} />
              <BirthChecksCard m={m} />
            </TabsContent>

            <TabsContent value="all">
              <ApplicantsTable m={m} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </BaseLayout>
  )
}

function Loading() {
  return (
    <div className="grid gap-6 lg:grid-cols-5" aria-busy="true" aria-label="Loading the registrations">
      <Skeleton className="h-96 rounded-[18px] lg:col-span-3" />
      <Skeleton className="h-96 rounded-[18px] lg:col-span-2" />
      <Skeleton className="h-64 rounded-[18px] lg:col-span-2" />
      <Skeleton className="h-64 rounded-[18px] lg:col-span-3" />
    </div>
  )
}
