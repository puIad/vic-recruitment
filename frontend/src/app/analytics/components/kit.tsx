import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** One stat block: a card with a Bold title, a muted line saying what it counts, an optional control on the right. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={cn("min-w-0 gap-5", className)}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="text-lg font-bold leading-tight">{title}</CardTitle>
          {description && <CardDescription className="max-w-prose leading-relaxed">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className={cn("min-w-0", bodyClassName)}>{children}</CardContent>
    </Card>
  )
}

/** A figure inside a sentence-like row: the number Heavy, its words Regular. Not a tile: several sit on one line. */
export function Figure({ value, label, hint, className }: { value: React.ReactNode; label: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)} title={hint}>
      <div className="text-2xl font-extrabold leading-none tracking-tight text-foreground">{value}</div>
      <div className="mt-1.5 text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  )
}

export interface BarItem {
  key: string
  label: React.ReactNode
  /** a short code shown before the label (field codes) */
  tag?: string
  value: number
  /** the bar's colour (a CSS colour); default the working blue */
  color?: string
  /** a second, paler bar under the first (department 2nd choice) */
  value2?: number
  onClick?: () => void
}

/**
 * Horizontal bars in plain HTML: label left, a thin bar, the value at its tip. Used where categories have long names
 * (fields, how they heard, flags), so nothing rotates and every label stays readable at phone width.
 */
export function BarList({ items, max, total, empty = "Nothing yet", className }: { items: BarItem[]; max?: number; total?: number; empty?: string; className?: string }) {
  const top = max ?? Math.max(1, ...items.map((i) => Math.max(i.value, i.value2 ?? 0)))
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((i) => {
        const Row = i.onClick ? "button" : "div"
        return (
          <li key={i.key}>
            <Row
              {...(i.onClick ? { type: "button" as const, onClick: i.onClick } : {})}
              className={cn(
                "grid w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-x-3 text-left text-sm",
                i.onClick && "-mx-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                {i.tag && <span className="shrink-0 text-xs font-bold text-muted-foreground">{i.tag}</span>}
                <span className="truncate font-medium" title={typeof i.label === "string" ? i.label : undefined}>{i.label}</span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <Bar value={i.value} top={top} color={i.color} total={total} />
                {i.value2 !== undefined && <Bar value={i.value2} top={top} color={i.color} pale />}
              </span>
            </Row>
          </li>
        )
      })}
    </ul>
  )
}

function Bar({ value, top, color, total, pale }: { value: number; top: number; color?: string; total?: number; pale?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="relative h-2.5 min-w-0 flex-1">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-r-[4px] rounded-l-[2px]", pale && "opacity-40")}
          style={{ width: value ? `max(3px, ${(value / top) * 100}%)` : 0, background: color || "var(--primary)" }}
        />
      </span>
      <span className="num w-14 shrink-0 text-right text-xs font-semibold text-foreground">
        {value}
        {total ? <span className="font-normal text-muted-foreground"> · {Math.round((value * 100) / total)}%</span> : null}
      </span>
    </span>
  )
}

/** A swatch beside a word: the identity channel next to text that stays in ink. */
export function Key({ color, children, pale, line }: { color: string; children: React.ReactNode; pale?: boolean; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-full", pale && "opacity-40")}
        style={{ background: color }}
      />
      {children}
    </span>
  )
}
