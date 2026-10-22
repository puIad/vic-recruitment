import { format, isSameDay } from "date-fns"
import { cn } from "@/lib/utils"
import { BLOCK_MIN, type ScheduleItem } from "../schedule"
import { GroupBlock, InterviewBlock } from "./interview-block"

const HOUR_PX = 56
/** The working day the grid always shows; it widens to fit an earlier or later interview. */
const FIRST_HOUR = 8
const LAST_HOUR = 19

type Placed = { item: ScheduleItem; lane: number; of: number; cluster: number }

/** Side-by-side lanes for blocks that overlap in time (different binomes at the same hour, or a clash). */
function lay(list: ScheduleItem[]): Placed[] {
  const sorted = [...list].sort((a, b) => a.start!.getTime() - b.start!.getTime())
  const out: Placed[] = []
  let cluster: Placed[] = []
  let ends: number[] = []
  let clusterEnd = -Infinity
  let id = 0
  const flush = () => {
    cluster.forEach((p) => (p.of = ends.length))
    cluster = []
    ends = []
  }
  for (const item of sorted) {
    const s = item.start!.getTime()
    const e = s + BLOCK_MIN * 6e4
    if (s >= clusterEnd) {
      flush()
      id++
    }
    let lane = ends.findIndex((x) => x <= s)
    if (lane < 0) lane = ends.push(e) - 1
    else ends[lane] = e
    const p = { item, lane, of: 1, cluster: id }
    out.push(p)
    cluster.push(p)
    clusterEnd = Math.max(clusterEnd, e)
  }
  flush()
  return out
}

/** merge: overlapping interviews become one group (a week column is too narrow for side-by-side lanes); otherwise one each. */
function groups(placed: Placed[], merge: boolean): Placed[][] {
  if (!merge) return placed.map((p) => [p])
  const by = new Map<number, Placed[]>()
  placed.forEach((p) => by.set(p.cluster, [...(by.get(p.cluster) ?? []), p]))
  return [...by.values()]
}

/** Week or day columns of hours, one BLOCK_MIN block per interview. now = the Master's wall-clock time, drawn as a line across today. */
export function TimeGrid({
  days,
  items,
  now,
  onOpen,
  onDayClick,
  showBinome = true,
}: {
  days: Date[]
  items: ScheduleItem[]
  now: Date
  onOpen: (code: string) => void
  onDayClick?: (day: Date) => void
  showBinome?: boolean
}) {
  const dated = items.filter((it) => it.start && days.some((d) => isSameDay(d, it.start!)))
  const first = Math.min(FIRST_HOUR, ...dated.map((it) => it.start!.getHours()))
  const last = Math.max(LAST_HOUR, ...dated.map((it) => Math.ceil((it.start!.getHours() * 60 + it.start!.getMinutes() + BLOCK_MIN) / 60)))
  const hours = Array.from({ length: last - first }, (_, i) => first + i)
  const y = (d: Date) => ((d.getHours() - first) * 60 + d.getMinutes()) * (HOUR_PX / 60)
  const nowY = now.getHours() >= first && now.getHours() < last ? y(now) : null
  const wide = days.length > 1

  return (
    <div className="overflow-x-auto">
      <div className={cn("grid", wide && "min-w-[46rem]")} style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
        {/* day headers */}
        <div className="sticky top-0 z-10 border-b bg-card" />
        {days.map((d) => {
          const today = isSameDay(d, now)
          const label = (
            <>
              <span className="text-xs font-medium text-muted-foreground">{format(d, wide ? "EEE" : "EEEE")}</span>
              <span className={cn("num flex size-7 items-center justify-center rounded-full text-sm font-bold", today ? "bg-primary text-primary-foreground" : "text-foreground")}>
                {format(d, "d")}
              </span>
            </>
          )
          return (
            <div key={d.toISOString()} className="sticky top-0 z-10 border-b border-l bg-card">
              {onDayClick ? (
                <button
                  type="button"
                  onClick={() => onDayClick(d)}
                  className="flex w-full items-center justify-center gap-1.5 py-2 transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  aria-label={`Open ${format(d, "EEEE d MMMM")}`}
                >
                  {label}
                </button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-2">{label}</div>
              )}
            </div>
          )
        })}

        {/* hour gutter */}
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h, i) => (
            <span key={h} className="num absolute right-2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground" style={{ top: i * HOUR_PX }}>
              {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
            </span>
          ))}
        </div>

        {days.map((d) => {
          const weekend = d.getDay() === 5 || d.getDay() === 6 // Friday and Saturday in Algeria
          const today = isSameDay(d, now)
          return (
            <div
              key={d.toISOString()}
              className={cn("relative border-l", weekend && "bg-muted/40")}
              style={{
                height: hours.length * HOUR_PX,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border) ${HOUR_PX - 1}px, var(--border) ${HOUR_PX}px)`,
              }}
            >
              {groups(lay(dated.filter((it) => isSameDay(it.start!, d))), wide && !!onDayClick).map((g) => {
                const first = g[0].item.start!
                const style = { top: y(first) + 1, ["--z" as string]: g[0].lane + 1 }
                if (g.length > 1) {
                  const end = Math.max(...g.map((p) => p.item.start!.getTime())) + BLOCK_MIN * 6e4
                  return (
                    <GroupBlock
                      key={g[0].item.code}
                      items={g.map((p) => p.item)}
                      onOpen={() => onDayClick!(d)}
                      style={{ ...style, height: ((end - first.getTime()) / 6e4) * (HOUR_PX / 60) - 2, left: 3, right: 3 }}
                    />
                  )
                }
                const { item, lane, of } = g[0]
                return (
                  <InterviewBlock
                    key={item.code}
                    item={item}
                    onOpen={onOpen}
                    showBinome={showBinome}
                    quiet={wide}
                    style={{ ...style, height: BLOCK_MIN * (HOUR_PX / 60) - 2, left: `calc(${(lane / of) * 100}% + 3px)`, width: `calc(${100 / of}% - 6px)` }}
                  />
                )
              })}
              {today && nowY !== null && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowY }} aria-hidden="true">
                  <span className="-ml-1 size-2 rounded-full bg-primary" />
                  <span className="h-px flex-1 bg-primary" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
