import { format, isSameDay } from "date-fns"
import { cn } from "@/lib/utils"
import type { ScheduleItem } from "../schedule"
import { InterviewChip } from "./interview-block"

/** The days as a plain list, for phones: each day with its interviews in time order; a day with none says so in one line. */
export function Agenda({ days, items, now, onOpen, showBinome = true }: { days: Date[]; items: ScheduleItem[]; now: Date; onOpen: (code: string) => void; showBinome?: boolean }) {
  return (
    <ol className="divide-y">
      {days.map((d) => {
        const list = items.filter((it) => it.start && isSameDay(it.start, d)).sort((a, b) => a.start!.getTime() - b.start!.getTime())
        const today = isSameDay(d, now)
        return (
          <li key={d.toISOString()} className="flex gap-3 py-2.5">
            <span className={cn("flex w-11 shrink-0 flex-col items-center rounded-lg py-1 leading-tight", today ? "bg-primary text-primary-foreground" : "text-foreground")}>
              <span className={cn("text-[11px] font-medium", !today && "text-muted-foreground")}>{format(d, "EEE")}</span>
              <span className="num text-base font-bold">{format(d, "d")}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              {list.length ? (
                list.map((it) => <InterviewChip key={it.code} item={it} onOpen={onOpen} showBinome={showBinome} showName className="py-1.5 text-sm" />)
              ) : (
                <span className="text-sm text-muted-foreground">No interview</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
