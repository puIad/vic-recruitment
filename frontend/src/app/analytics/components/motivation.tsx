import * as React from "react"
import { Search, X } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { useProfile, wordCount } from "@/lib/vic/analytics"
import type { Model } from "../model"
import { axis } from "./chart-style"
import { BarList, Figure, Panel } from "./kit"
import { Nothing } from "./registrations"

const cfg = { count: { label: "Answers", color: "var(--chart-1)" } } satisfies ChartConfig

export function WordsCard({ m, onPick }: { m: Model; onPick: (w: string) => void }) {
  return (
    <Panel title="Most frequent words" description="Counted once per answer, English and French stop words left out. Pick a word to read the answers that use it.">
      <BarList items={m.words.slice(0, 16).map((w) => ({ key: w.word, label: w.word, value: w.count, onClick: () => onPick(w.word) }))} empty="No answers yet." />
    </Panel>
  )
}

export function LengthCard({ m }: { m: Model }) {
  return (
    <Panel title="Answer length" description="Words per answer to “Why do you want to be part of VIC?”">
      <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
        <Figure value={m.whys.length} label="answered" />
        <Figure value={m.medianWords ?? "—"} label="median words" />
      </div>
      {m.whys.length ? (
        <ChartContainer config={cfg} className="aspect-auto h-44 w-full">
          <BarChart data={m.byLength} margin={{ left: -12, right: 4, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={40} allowDecimals={false} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent labelFormatter={(l) => `${l} words`} />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      ) : (
        <Nothing />
      )}
    </Panel>
  )
}

/** Every answer, searchable: the words a reader is looking for, highlighted. */
export function AnswersCard({ m, q, setQ }: { m: Model; q: string; setQ: (q: string) => void }) {
  const show = useProfile((s) => s.show)
  const needle = q.trim().toLowerCase()
  const list = React.useMemo(
    () => (needle ? m.whys.filter((r) => `${r.code} ${r.name} ${r.whyVic}`.toLowerCase().includes(needle)) : m.whys),
    [m.whys, needle]
  )
  return (
    <Panel
      title="Why they want to join"
      description={needle ? `${list.length} of ${m.whys.length} answers mention “${q.trim()}”.` : `All ${m.whys.length} answers, in full. Open one to see the whole profile.`}
      className="lg:col-span-2"
      action={
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the answers" aria-label="Search the answers" className="h-9 rounded-full pl-9 pr-8" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>
      }
      bodyClassName="px-3 sm:px-4"
    >
      {list.length ? (
        <ul className="max-h-[36rem] divide-y overflow-y-auto">
          {list.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => show(r.key)}
                className="grid w-full gap-x-4 gap-y-1 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[8rem_1fr]"
              >
                <span className="min-w-0 text-sm">
                  <b className="block font-bold text-primary">{r.code || "—"}</b>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.name} · {wordCount(r.whyVic)} words
                  </span>
                </span>
                <span className="max-w-prose text-sm leading-relaxed">
                  <Mark text={r.whyVic} q={needle} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Nothing>{m.whys.length ? "No answer matches." : "No answers yet."}</Nothing>
      )}
    </Panel>
  )
}

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const out: React.ReactNode[] = []
  const low = text.toLowerCase()
  let i = 0
  for (let at = low.indexOf(q); at >= 0; at = low.indexOf(q, i)) {
    out.push(text.slice(i, at), <mark key={at} className="rounded-[3px] bg-vic-aqua/45 px-0.5 text-foreground">{text.slice(at, at + q.length)}</mark>)
    i = at + q.length
  }
  out.push(text.slice(i))
  return <>{out}</>
}
