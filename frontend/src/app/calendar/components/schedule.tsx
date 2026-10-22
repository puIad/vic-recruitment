import * as React from "react"
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isSameYear, startOfDay, startOfMonth, startOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { WebState } from "@/lib/vic/types"
import { allFilters, applyFilters, BLOCK_MIN, DEFAULT_TZ, fromWebState, noDateYet, wallTime, zoneLabel, type Filters, type ScheduleItem } from "../schedule"
import { InterviewCard } from "./interview-card"
import { MonthGrid } from "./month-grid"
import { NoDateList } from "./no-date-list"
import { ScheduleFilters } from "./schedule-filters"
import { TimeGrid } from "./time-grid"

type View = "month" | "week" | "day"
const WEEK = { weekStartsOn: 0 } as const
const VIEWS: { key: View; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
]

function rangeTitle(view: View, d: Date) {
  if (view === "month") return format(d, "MMMM yyyy")
  if (view === "day") return format(d, "EEEE d MMMM yyyy")
  const a = startOfWeek(d, WEEK)
  const b = endOfWeek(d, WEEK)
  if (isSameMonth(a, b)) return `${format(a, "d")}–${format(b, "d MMMM yyyy")}`
  return isSameYear(a, b) ? `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}` : `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`
}

function daysOf(view: View, d: Date): Date[] {
  if (view === "day") return [d]
  if (view === "week") return eachDayOfInterval({ start: startOfWeek(d, WEEK), end: endOfWeek(d, WEEK) })
  return eachDayOfInterval({ start: startOfMonth(d), end: endOfMonth(d) })
}

/** The admin Schedule: every interview the binomes have set, month, week or day, read-only. */
export function Schedule({ state, loadedAt }: { state: WebState; loadedAt: number }) {
  const tz = state.settings.tz || DEFAULT_TZ
  const now = wallTime(loadedAt, tz)
  const all = React.useMemo(() => fromWebState(state), [state])

  const [view, setView] = React.useState<View>(() => (window.matchMedia?.("(max-width: 639px)").matches ? "day" : "week"))
  const [date, setDate] = React.useState(() => startOfDay(wallTime(loadedAt, tz)))
  const [filters, setFilters] = React.useState<Filters>(allFilters)
  const [openCode, setOpenCode] = React.useState<string | null>(null)
  const [sheet, setSheet] = React.useState(false)

  const shown = applyFilters(all, filters)
  const waiting = noDateYet(shown)
  const days = daysOf(view, date)
  const inRange = shown.filter((it) => it.start && days.some((d) => isSameDay(d, it.start!))).length
  const open = (openCode && all.find((it) => it.code === openCode)) || null
  const binomeCodes = state.binomes.map((b) => b.code)

  const step = (dir: 1 | -1) => setDate((d) => (view === "month" ? addMonths(d, dir) : addDays(d, view === "week" ? 7 * dir : dir)))
  const openDay = (d: Date) => {
    setDate(d)
    setView("day")
  }
  const jumpTo = (it: ScheduleItem) => {
    if (it.start) setDate(startOfDay(it.start))
    setSheet(false)
    setOpenCode(it.code)
  }

  const filtersPanel = (
    <ScheduleFilters items={all} filters={filters} onFilters={setFilters} date={date} onDate={(d) => setDate(startOfDay(d))} binomes={binomeCodes} onOpen={jumpTo} />
  )

  return (
    <div className="grid items-start gap-6 min-[1800px]:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="flex min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
        <aside aria-label="Filters" className="hidden w-72 shrink-0 border-r pt-3 xl:block">
          {filtersPanel}
        </aside>

        <section aria-label="Calendar" className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3 lg:px-5">
            <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setSheet(true)}>
              <SlidersHorizontal /> Filters
            </Button>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="size-8" onClick={() => step(-1)} aria-label={`Previous ${view}`}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" className="size-8" onClick={() => step(1)} aria-label={`Next ${view}`}>
                <ChevronRight />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDate(startOfDay(now))}>
                Today
              </Button>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold leading-tight text-heading" aria-live="polite">
                {rangeTitle(view, date)}
              </h2>
              <p className="num text-xs text-muted-foreground">
                {inRange ? `${inRange} interview${inRange > 1 ? "s" : ""}` : "No interview"} · {BLOCK_MIN} min each · {zoneLabel(tz)}
              </p>
            </div>
            <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="View" className="ml-auto">
              {VIEWS.map((v) => (
                <ToggleGroupItem key={v.key} value={v.key} className="px-3">
                  {v.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {view === "month" ? (
            <MonthGrid month={date} items={shown} now={now} onOpen={setOpenCode} onDay={openDay} />
          ) : (
            <TimeGrid days={days} items={shown} now={now} onOpen={setOpenCode} onDayClick={view === "week" ? openDay : undefined} />
          )}
        </section>
      </div>

      <Card className="gap-4 min-[1800px]:sticky min-[1800px]:top-20">
        <CardHeader>
          <CardTitle className="text-lg font-bold">No date yet</CardTitle>
          <CardDescription>
            {waiting.length
              ? `${waiting.length} with a binome and no interview time, oldest assignment first`
              : "Everyone with a binome has an interview time"}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-[1800px]:max-h-[40rem] min-[1800px]:overflow-y-auto">
          <NoDateList items={waiting} onOpen={setOpenCode} now={loadedAt} empty="Nobody is waiting for a date." columns />
        </CardContent>
      </Card>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="left" className="w-80 gap-0 overflow-y-auto p-0">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Pick a day, or narrow the calendar down.</SheetDescription>
          </SheetHeader>
          {filtersPanel}
        </SheetContent>
      </Sheet>

      <InterviewCard
        item={open}
        binome={open ? state.binomes.find((b) => b.code === open.binome) : undefined}
        clashWith={open?.clash ? all.filter((x) => x !== open && x.binome === open.binome && x.start && Math.abs(x.start.getTime() - open.start!.getTime()) < BLOCK_MIN * 6e4) : []}
        tzLabel={zoneLabel(tz)}
        onClose={() => setOpenCode(null)}
      />
    </div>
  )
}
