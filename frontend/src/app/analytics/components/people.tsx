import { CakeSlice } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { dayLabel, fieldLabel, median, MONTH_NAMES, useProfile } from "@/lib/vic/analytics"
import type { Model } from "../model"
import { axis } from "./chart-style"
import { BarList, Figure, Key, Panel } from "./kit"
import { Nothing } from "./registrations"

const cfg = { count: { label: "Applicants", color: "var(--chart-1)" } } satisfies ChartConfig
const OVERALL = ["", "1st prépa", "2nd prépa", "1st specialty", "2nd specialty", "3rd specialty"]

export function YearCard({ m }: { m: Model }) {
  const data = m.byOverall.map((x) => ({ ...x, label: `Year ${x.y}`, sub: OVERALL[x.y] }))
  const known = m.prepa + m.special
  return (
    <Panel title="Year of study" description="Overall year at ENP: the count starts again after prépa, so a 1st-year specialty student is in year 3.">
      <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
        <Figure value={m.prepa} label="in prépa" />
        <Figure value={m.special} label="in a specialty" />
        {known < m.live.length && <Figure value={m.live.length - known} label="year not given" />}
      </div>
      {known ? (
        <ChartContainer config={cfg} className="aspect-auto h-48 w-full">
          <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={(_, p) => `${p?.[0]?.payload?.label} · ${p?.[0]?.payload?.sub}`} />} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24}>
              {/* prépa and specialty years read apart: the same blue, the specialty years a step deeper */}
              {data.map((d) => (
                <Cell key={d.y} fill={d.y <= 2 ? "var(--chart-1)" : "var(--chart-3)"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : (
        <Nothing />
      )}
      <div className="mt-3 flex gap-4">
        <Key color="var(--chart-1)">Prépa</Key>
        <Key color="var(--chart-3)">Specialty</Key>
      </div>
    </Panel>
  )
}

export function FieldCard({ m }: { m: Model }) {
  return (
    <Panel title="Field of study" description={`${m.byField.length} fields. The code is the form's; the name beside it is ours.`}>
      <BarList
        total={m.live.length}
        items={m.byField.map(([f, n]) => ({ key: f, tag: f === "—" ? undefined : f, label: f === "—" ? "Not given" : fieldLabel(f), value: n }))}
      />
    </Panel>
  )
}

export function AgeCard({ m }: { m: Model }) {
  const med = median(m.ages)
  return (
    <Panel
      title="Age"
      description={
        m.guessedAges
          ? `At registration. ${m.guessedAges} typed an impossible year; their age uses the year guessed from their year of study.`
          : "At registration."
      }
    >
      <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
        <Figure value={med ?? "—"} label="median age" />
        <Figure value={m.ages.length ? `${Math.min(...m.ages)}–${Math.max(...m.ages)}` : "—"} label="youngest to oldest" />
      </div>
      {m.ages.length ? (
        <ChartContainer config={cfg} className="aspect-auto h-44 w-full">
          <BarChart data={m.byAge} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="age" {...axis} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={(_, p) => `${p?.[0]?.payload?.age} years old`} />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      ) : (
        <Nothing>No readable birth dates yet.</Nothing>
      )}
    </Panel>
  )
}

export function BirthdaysCard({ m }: { m: Model }) {
  const show = useProfile((s) => s.show)
  const data = m.byMonth.map((x) => ({ ...x, label: MONTH_NAMES[x.m] }))
  const today = m.today
  return (
    <Panel
      title="Birthdays"
      description={`Per month, and the birthdays that fall during the recruitment (${dayLabel(m.window.from)} to ${dayLabel(m.window.to)}: the opening to the last interview set, four weeks at least).`}
      className="lg:col-span-2"
    >
      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <ChartContainer config={cfg} className="aspect-auto h-52 w-full">
          <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} interval={0} tickFormatter={(l: string) => l.slice(0, 1)} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-bold">During the recruitment</h4>
          {m.birthdays.length ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {m.birthdays.map(({ row, day, turns }) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => show(row.key)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="num w-14 shrink-0 font-semibold">{dayLabel(day)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <b className="font-bold text-primary">{row.code}</b> {row.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {day === today ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <CakeSlice className="size-3.5" /> today
                        </span>
                      ) : turns !== null ? (
                        `turns ${turns}${row.birthUsed?.guessed ? "?" : ""}`
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None in this window.</p>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function HeardCard({ m }: { m: Model }) {
  const show = useProfile((s) => s.show)
  const items = [...m.heardCount].sort((a, b) => b.count - a.count).map((h) => ({ key: h.option, label: h.option, value: h.count }))
  if (m.others.length) items.push({ key: "other", label: "Other (typed)", value: m.others.length })
  return (
    <Panel
      title="How they heard of VIC"
      description={`Several boxes can be ticked, so the bars add up to more than ${m.heardAnswered}. Other answers naming a member, or a member's name, count as referrals.`}
      className="lg:col-span-2"
    >
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3">
            <Figure value={m.heardAnswered} label="answered" />
            <Figure value={m.referrals} label="referred by a member" />
          </div>
          <BarList total={m.heardAnswered} items={items} />
        </div>
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-bold">Other answers</h4>
          {m.others.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {m.others.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => show(r.key)}
                    className="flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <b className="w-16 shrink-0 font-bold text-primary">{r.code || "—"}</b>
                    <span className="min-w-0 flex-1">“{r.heard.other}”</span>
                    {r.referral && <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">referral</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody typed their own answer yet.</p>
          )}
        </div>
      </div>
    </Panel>
  )
}
