import * as React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { dayLabel, hours } from "@/lib/vic/analytics"
import { cn } from "@/lib/utils"
import type { Model } from "../model"
import { axis } from "./chart-style"
import { Figure, Key, Panel } from "./kit"

const dayCfg = { count: { label: "Registrations", color: "var(--chart-1)" } } satisfies ChartConfig
const raceCfg = {
  y2026: { label: "2026", color: "var(--primary)" },
  y2025: { label: "2025", color: "var(--muted-foreground)" },
} satisfies ChartConfig

/** The page's lead: 2026's running total against 2025's, both counted from their own day 1. */
export function RaceCard({ m }: { m: Model }) {
  const lastN = m.daily.length ? m.daily[m.daily.length - 1].n : 0
  const now26 = m.daily.length ? m.daily[m.daily.length - 1].cum : 0
  const then25 = m.race[lastN - 1]?.y2025 ?? null
  const final25 = m.has2025 ? m.race.reduce((t, x) => Math.max(t, x.y2025 ?? 0), 0) : null
  const diff = then25 !== null ? now26 - then25 : null

  return (
    <Panel
      title="Registrations so far"
      description={
        m.has2025
          ? "Running total from the opening day, next to 2025 on the same day of its own opening."
          : "Running total from the opening day. 2025's curve joins it once its daily counts are in the code."
      }
      className="lg:col-span-3"
    >
      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-4">
        <Figure value={now26} label={lastN ? `by day ${lastN} of the opening` : "registered so far"} />
        {then25 !== null && (
          <Figure
            value={
              <span className="inline-flex items-center gap-1.5">
                {then25}
                {diff !== 0 && diff !== null && (
                  <span className={cn("inline-flex items-center text-sm font-bold", diff > 0 ? "text-success" : "text-muted-foreground")}>
                    {diff > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                    {Math.abs(diff)}
                  </span>
                )}
              </span>
            }
            label={`2025 by day ${lastN}`}
          />
        )}
        {final25 !== null && <Figure value={final25} label="2025 in all" />}
      </div>
      {m.race.length ? (
        <>
          <ChartContainer config={raceCfg} className="aspect-auto h-60 w-full">
            <LineChart data={m.race} margin={{ left: -12, right: 12, top: 8 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="n" {...axis} tickFormatter={(n) => `Day ${n}`} minTickGap={24} />
              <YAxis {...axis} width={40} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, p) => `Day ${p?.[0]?.payload?.n}`} />} />
              {m.has2025 && <Line dataKey="y2025" type="monotone" stroke="var(--color-y2025)" strokeWidth={2} dot={false} connectNulls />}
              <Line dataKey="y2026" type="monotone" stroke="var(--color-y2026)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            </LineChart>
          </ChartContainer>
          {m.has2025 && (
            <div className="mt-3 flex gap-4">
              <Key color="var(--primary)" line>2026</Key>
              <Key color="var(--muted-foreground)" line>2025</Key>
            </div>
          )}
        </>
      ) : (
        <Nothing />
      )}
    </Panel>
  )
}

export function PerDayCard({ m }: { m: Model }) {
  const data = m.daily.map((d) => ({ ...d, label: dayLabel(d.day) }))
  const best = m.daily.reduce<(typeof m.daily)[number] | null>((b, d) => (!b || d.count > b.count ? d : b), null)
  return (
    <Panel
      title="Per day"
      description={best && best.count ? `Busiest: ${dayLabel(best.day)}, day ${best.n}, with ${best.count}. A spike after a post or a stand shows what worked.` : "Registrations each calendar day."}
      className="lg:col-span-2"
    >
      {data.length ? (
        <ChartContainer config={dayCfg} className="aspect-auto h-60 w-full">
          <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} minTickGap={16} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={(_, p) => `${p?.[0]?.payload?.label} · day ${p?.[0]?.payload?.n}`} />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      ) : (
        <Nothing />
      )}
    </Panel>
  )
}

export function PerHourCard({ m }: { m: Model }) {
  const peak = m.byHour.reduce((b, h) => (h.count > b.count ? h : b), m.byHour[0])
  const total = m.byHour.reduce((t, h) => t + h.count, 0)
  return (
    <Panel
      title="Hour of the day"
      description={total ? `Most register around ${String(peak.h).padStart(2, "0")}:00, ${(m.tz.split("/").pop() || m.tz).replace(/_/g, " ")} time. The best hour to post.` : "When in the day people register."}
    >
      {total ? (
        <ChartContainer config={dayCfg} className="aspect-auto h-48 w-full">
          <BarChart data={m.byHour} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="h" {...axis} interval={2} tickFormatter={(h) => `${String(h).padStart(2, "0")}h`} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={(_, p) => `${String(p?.[0]?.payload?.h).padStart(2, "0")}:00 to ${String(p?.[0]?.payload?.h).padStart(2, "0")}:59`} />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      ) : (
        <Nothing />
      )}
    </Panel>
  )
}

/** How far registrants got, and how fast binomes move them, counted from the assignment. */
export function FunnelCard({ m }: { m: Model }) {
  const top = m.funnel[0].count || 1
  return (
    <Panel title="Funnel and speed" description="How far everyone got, and the median time from the assignment to each step." className="lg:col-span-2">
      <ol className="space-y-3">
        {m.funnel.map((s, i) => (
          <li key={s.key} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_auto]">
            <span className="font-medium">{s.label}</span>
            <span className="relative h-6 overflow-hidden rounded-[6px] bg-muted">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary" style={{ width: `${(s.count / top) * 100}%`, opacity: 1 - i * 0.14 }} />
            </span>
            <span className="num w-20 text-right">
              <b className="font-bold">{s.count}</b>
              {i > 0 && <span className="text-xs text-muted-foreground"> · {Math.round((s.count * 100) / top)}%</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid grid-cols-3 gap-4 border-t pt-5">
        <Figure value={hours(m.speed.contact)} label="to contact" />
        <Figure value={hours(m.speed.interview)} label="to the interview" />
        <Figure value={hours(m.speed.form)} label="to the form" />
      </div>
    </Panel>
  )
}

type SpeedKey = "binome" | "n" | "contact" | "interview" | "form"

/** Median times per binome: which binomes are slow, before the alerts fire. */
export function BinomeSpeedCard({ m }: { m: Model }) {
  const [sort, setSort] = React.useState<{ k: SpeedKey; desc: boolean }>({ k: "contact", desc: true })
  const per = m.perBinome
  const rows = React.useMemo(() => {
    const v = (r: (typeof per)[number]) => r[sort.k]
    return [...per].sort((a, b) => {
      const x = v(a), y = v(b)
      if (x === y) return a.binome.localeCompare(b.binome, undefined, { numeric: true })
      if (x === null) return 1
      if (y === null) return -1
      const c = typeof x === "string" ? x.localeCompare(y as string, undefined, { numeric: true }) : x - (y as number)
      return sort.desc ? -c : c
    })
  }, [per, sort])
  const slow = m.speed.contact !== null ? m.speed.contact * 2 : null
  const head = (k: SpeedKey, label: string, right = true) => (
    <th scope="col" className={cn("px-3 py-2 font-semibold", right && "text-right")} aria-sort={sort.k === k ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k !== "binome" }))}
        className={cn("inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", sort.k === k && "text-foreground")}
      >
        {label}
        {sort.k === k && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  )
  return (
    <Panel
      title="Speed per binome"
      description={slow !== null ? `Medians from the assignment. Twice the overall time to contact (${hours(slow)}) or more is marked.` : "Medians from the assignment, once binomes start contacting."}
      className="lg:col-span-3"
      bodyClassName="px-0"
    >
      {rows.length ? (
        <div className="max-h-[22rem] overflow-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
              <tr>
                {head("binome", "Binome", false)}
                {head("n", "Candidates")}
                {head("contact", "To contact")}
                {head("interview", "To interview")}
                {head("form", "To form")}
              </tr>
            </thead>
            <tbody className="num">
              {rows.map((r) => (
                <tr key={r.binome} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-bold first:pl-6">{r.binome}</td>
                  <td className="px-3 py-2 text-right">{r.n}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cn(slow !== null && r.contact !== null && r.contact >= slow && "rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning")}>{hours(r.contact)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{hours(r.interview)}</td>
                  <td className="px-3 py-2 pr-6 text-right">{hours(r.form)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Nothing />
      )}
    </Panel>
  )
}

export const Nothing = ({ children = "Nothing to count yet." }: { children?: React.ReactNode }) => (
  <p className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">{children}</p>
)
