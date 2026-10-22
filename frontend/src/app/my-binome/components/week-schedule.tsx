import * as React from "react"
import { addDays, eachDayOfInterval, endOfWeek, format, isSameDay, startOfDay, startOfWeek } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Agenda } from "@/app/calendar/components/agenda"
import { NoDateList } from "@/app/calendar/components/no-date-list"
import { TimeGrid } from "@/app/calendar/components/time-grid"
import { BLOCK_MIN, CLASH, fromMember, noDateYet } from "@/app/calendar/schedule"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useVic } from "@/lib/vic/store"
import type { MemberState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const WEEK = { weekStartsOn: 0 } as const

/** The binome's own week, from the Interview Date and Time in their sheet: the Schedule's blocks, read-only. A click opens the
 *  candidate. Phones get the days as a list instead of the grid. */
export function WeekSchedule({ m, onOpen }: { m: MemberState; onOpen: (code: string) => void }) {
  const loadedAt = useVic((s) => s.loadedAt)
  const now = new Date(loadedAt)
  const items = React.useMemo(() => fromMember(m), [m])
  const [anchor, setAnchor] = React.useState(() => startOfDay(new Date(loadedAt)))
  const days = eachDayOfInterval({ start: startOfWeek(anchor, WEEK), end: endOfWeek(anchor, WEEK) })
  const thisWeek = days.some((d) => isSameDay(d, now))
  const inWeek = items.filter((it) => it.start && days.some((d) => isSameDay(d, it.start!)))
  const clashes = inWeek.filter((it) => it.clash).length
  const waiting = noDateYet(items)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-4 lg:px-6">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-lg font-bold">{thisWeek ? "This week" : `Week of ${format(days[0], "d MMMM")}`}</CardTitle>
          <CardDescription className="mt-1">
            {inWeek.length ? `${inWeek.length} interview${inWeek.length > 1 ? "s" : ""}, ${BLOCK_MIN} min each, as set in your sheet` : "No interview set in your sheet this week"}
            {clashes > 0 && (
              <span className={cn("ml-2 inline-flex items-center gap-1 font-semibold", CLASH.tone)}>
                <CLASH.icon className="size-3.5" aria-hidden="true" /> {clashes} less than 45 min apart
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="size-8" onClick={() => setAnchor((d) => addDays(d, -7))} aria-label="Previous week">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setAnchor((d) => addDays(d, 7))} aria-label="Next week">
            <ChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(startOfDay(now))} disabled={thisWeek}>
            This week
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="hidden min-w-0 md:block">
          <TimeGrid days={days} items={items} now={now} onOpen={onOpen} showBinome={false} />
        </div>
        <div className="px-4 md:hidden">
          <Agenda days={days} items={items} now={now} onOpen={onOpen} showBinome={false} />
        </div>
        <section aria-labelledby="nodate-title" className="border-t px-4 py-4 lg:border-l lg:border-t-0 lg:px-5">
          <h3 id="nodate-title" className="text-sm font-bold">
            No date yet <span className="num font-semibold text-muted-foreground">· {waiting.length}</span>
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">Set the day and time in your sheet once you've reached them.</p>
          <NoDateList items={waiting} onOpen={onOpen} now={loadedAt} showBinome={false} empty="Every candidate has an interview time." />
        </section>
      </CardContent>
    </Card>
  )
}
