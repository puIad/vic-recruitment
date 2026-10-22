import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns"
import { cn } from "@/lib/utils"
import type { ScheduleItem } from "../schedule"
import { InterviewChip } from "./interview-block"

const SHOWN = 3
const WEEK = { weekStartsOn: 0 } as const

/** A month of days, Sunday first; up to three interviews per day, then "+n more" opens the day. */
export function MonthGrid({ month, items, now, onOpen, onDay }: { month: Date; items: ScheduleItem[]; now: Date; onOpen: (code: string) => void; onDay: (day: Date) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), WEEK), end: endOfWeek(endOfMonth(month), WEEK) })
  const byDay = new Map<string, ScheduleItem[]>()
  for (const it of items) if (it.start) byDay.set(it.start.toDateString(), [...(byDay.get(it.start.toDateString()) ?? []), it])
  byDay.forEach((list) => list.sort((a, b) => a.start!.getTime() - b.start!.getTime()))

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[42rem] grid-cols-7">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()} className="border-b py-2 text-center text-xs font-medium text-muted-foreground">
            {format(d, "EEE")}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d.toDateString()) ?? []
          const inMonth = isSameMonth(d, month)
          const today = isSameDay(d, now)
          return (
            <div
              key={d.toISOString()}
              className={cn("flex min-h-28 flex-col gap-1 border-b border-l p-1.5 [&:nth-child(7n+1)]:border-l-0", !inMonth && "bg-muted/40", (d.getDay() === 5 || d.getDay() === 6) && inMonth && "bg-muted/20")}
            >
              <button
                type="button"
                onClick={() => onDay(d)}
                aria-label={`Open ${format(d, "EEEE d MMMM")}${list.length ? `, ${list.length} interview${list.length > 1 ? "s" : ""}` : ""}`}
                className={cn(
                  "num flex size-7 items-center justify-center self-start rounded-full text-xs font-bold transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                  today ? "bg-primary text-primary-foreground hover:bg-primary/90" : inMonth ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {format(d, "d")}
              </button>
              {list.slice(0, SHOWN).map((it) => (
                <InterviewChip key={it.code} item={it} onOpen={onOpen} showBinome={false} />
              ))}
              {list.length > SHOWN && (
                <button type="button" onClick={() => onDay(d)} className="self-start rounded-md px-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  +{list.length - SHOWN} more
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
