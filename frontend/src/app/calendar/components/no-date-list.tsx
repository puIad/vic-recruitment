import { CalendarPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEP, deptVars, STATE_BY_KEY, waited, type ScheduleItem } from "../schedule"

/** Interviewees without an interview time, oldest assignment first. now = when to measure "assigned … ago" from. */
/** columns: flow into two or three columns when the list runs full width (it stays one column once it sits in a side column). */
export function NoDateList({ items, onOpen, now, showBinome = true, empty, columns }: { items: ScheduleItem[]; onOpen: (code: string) => void; now: number; showBinome?: boolean; empty: string; columns?: boolean }) {
  if (!items.length)
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-sm text-muted-foreground">
        <CalendarPlus className="size-5 shrink-0 text-primary" aria-hidden="true" />
        {empty}
      </div>
    )
  return (
    <ul className={cn("-mx-2 divide-y", columns && "md:grid md:grid-cols-2 md:gap-x-8 md:divide-y-0 xl:grid-cols-3 min-[1800px]:block min-[1800px]:divide-y")}>
      {items.map((it) => {
        const bad = it.state === "unreadable"
        const S = STATE_BY_KEY.unreadable
        return (
          <li key={it.code} className={cn(columns && "md:border-b min-[1800px]:border-b-0")}>
            <button
              type="button"
              onClick={() => onOpen(it.code)}
              style={deptVars(it.dept)}
              className={cn(DEP, "flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--dep)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <b className="font-bold text-primary">{it.code}</b> {it.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {showBinome && <span className="font-semibold text-foreground/80">{it.binome}</span>}
                  {bad ? (
                    <span className={cn("flex items-center gap-1 font-semibold", S.tone)}>
                      <S.icon className="size-3.5" aria-hidden="true" /> Date unreadable
                    </span>
                  ) : it.note ? (
                    <span>{it.note}</span>
                  ) : (
                    <span>{it.contacted === "Yes" ? "Contacted" : !it.contacted || it.contacted === "Not yet" ? "Not contacted yet" : it.contacted}</span>
                  )}
                </span>
              </span>
              {it.assignedAt ? (
                <span className="num shrink-0 pt-0.5 text-xs text-muted-foreground" title="Time since it was assigned">
                  {waited(it.assignedAt, now)}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
