import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import { CLASH, DEP, deptVars, itemTitle as title, endOf, hhmm, STATE_BY_KEY, type ScheduleItem } from "../schedule"

/** The state's icon, plus the clash mark. Icons always carry a label for screen readers (and a title on hover). */
/** quiet: leave out Booked, the usual state, where space is tight. */
export function StateMarks({ item, className, labels, quiet }: { item: ScheduleItem; className?: string; labels?: boolean; quiet?: boolean }) {
  const s = STATE_BY_KEY[item.state]
  const marks = [...(quiet && item.state === "booked" ? [] : [s]), ...(item.clash ? [CLASH] : [])]
  if (!marks.length) return null
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      {marks.map((m) => (
        <span key={m.label} title={m.hint} className={cn("flex items-center gap-1", m.tone)}>
          <m.icon className="size-3.5 shrink-0" aria-hidden="true" />
          {labels ? <span className="text-xs font-semibold">{m.label}</span> : <span className="sr-only">{m.label}</span>}
        </span>
      ))}
    </span>
  )
}

/** An interview on the time grid: one BLOCK_MIN block, tinted by 1st-choice department. The parent positions it. */
export function InterviewBlock({ item, onOpen, style, showBinome = true, quiet }: { item: ScheduleItem; onOpen: (code: string) => void; style?: CSSProperties; showBinome?: boolean; quiet?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.code)}
      style={{ ...deptVars(item.dept), ...style }}
      className={cn(
        DEP,
        "group absolute flex min-w-0 flex-col overflow-hidden rounded-lg border px-2 py-1 text-left text-xs transition-[box-shadow,transform] duration-200 ease-out",
        "border-[color-mix(in_oklab,var(--dep)_50%,transparent)] bg-[color-mix(in_oklab,var(--dep)_16%,var(--card))] text-foreground",
        "z-[var(--z,1)] shadow-xs hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.98]",
        item.state === "done" && "opacity-75",
        item.clash && "ring-2 ring-vic-orange/70 ring-offset-1 ring-offset-background"
      )}
      aria-label={`${title(item)}, ${hhmm(item.start!)}, binome ${item.binome}, ${STATE_BY_KEY[item.state].label}${item.clash ? ", clash" : ""}`}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-semibold">
          <b className="font-bold">{item.code}</b>
          {item.name && <span className="font-medium"> · {item.name}</span>}
        </span>
        <StateMarks item={item} quiet={quiet} />
      </span>
      <span className="num truncate text-muted-foreground">
        {hhmm(item.start!)}–{hhmm(endOf(item.start!))}
        {showBinome && <> · {item.binome}</>}
      </span>
    </button>
  )
}

/** A one-line interview: month cells, the day agenda on phones. */
export function InterviewChip({ item, onOpen, className, showBinome = true, showName }: { item: ScheduleItem; onOpen: (code: string) => void; className?: string; showBinome?: boolean; showName?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(item.code)
      }}
      style={deptVars(item.dept)}
      className={cn(
        DEP,
        "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs transition-colors",
        "bg-[color-mix(in_oklab,var(--dep)_12%,transparent)] hover:bg-[color-mix(in_oklab,var(--dep)_22%,transparent)]",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        item.state === "done" && "opacity-75",
        item.clash && "ring-1 ring-vic-orange/80",
        className
      )}
      title={`${title(item)} · ${item.binome}`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--dep)]" aria-hidden="true" />
      <span className="num shrink-0 font-medium text-muted-foreground">{item.start ? hhmm(item.start) : "—"}</span>
      <b className="shrink-0 font-bold">{item.code}</b>
      <span className="min-w-0 flex-1 truncate">
        {showName && item.name && <span> · {item.name}</span>}
        {showBinome && <span className="text-muted-foreground"> · {item.binome}</span>}
      </span>
      <StateMarks item={item} quiet={!showName} />
    </button>
  )
}

/** Interviews that overlap in a week column, as one block: how many, when, a dot per department, a clash mark if any clash.
 *  Opens the day, where they sit side by side. */
export function GroupBlock({ items, onOpen, style }: { items: ScheduleItem[]; onOpen: () => void; style?: CSSProperties }) {
  const start = items[0].start!
  const end = endOf(new Date(Math.max(...items.map((it) => it.start!.getTime()))))
  const clash = items.some((it) => it.clash)
  const late = items.some((it) => it.state === "late")
  const L = STATE_BY_KEY.late
  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      className={cn(
        "absolute z-[var(--z,1)] flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-lg border bg-card px-2 py-1 text-left text-xs shadow-xs transition-[box-shadow,transform] duration-200 ease-out",
        "hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.98]",
        clash && "ring-2 ring-vic-orange/70 ring-offset-1 ring-offset-background"
      )}
      aria-label={`${items.length} interviews from ${hhmm(start)} to ${hhmm(end)}${clash ? ", with a clash" : ""}: ${items.map((it) => it.code).join(", ")}. Open the day`}
    >
      <span className="flex min-w-0 items-center gap-1">
        <b className="min-w-0 flex-1 truncate font-bold">{items.length} interviews</b>
        {late && <L.icon className={cn("size-3.5 shrink-0", L.tone)} aria-hidden="true" />}
        {clash && <CLASH.icon className={cn("size-3.5 shrink-0", CLASH.tone)} aria-hidden="true" />}
      </span>
      <span className="num truncate text-muted-foreground">
        {hhmm(start)}–{hhmm(end)}
      </span>
      <span className="flex flex-wrap gap-1" aria-hidden="true">
        {items.map((it) => (
          <span key={it.code} className={cn(DEP, "size-2 rounded-full bg-[var(--dep)]")} style={deptVars(it.dept)} />
        ))}
      </span>
    </button>
  )
}
