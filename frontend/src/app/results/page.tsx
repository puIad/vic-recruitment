import * as React from "react"
import { RotateCw, Search } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { RESULT_VALUES, setResult, useReloadOnEnd, useResultRows, useResults, type ResultRow } from "@/lib/vic/results"
import { cn } from "@/lib/utils"
import { FinalBar } from "./final-bar"
import { Dot, Marks, RatingBar, ResultChip } from "./result-parts"
import { ResultPanel } from "./result-panel"

type Basis = "result" | "first"

/** Phase 1 results (docs/admin-features.md › The results view): one table for the room, one open candidate at a time. */
export default function ResultsPage() {
  const { view, rows: all, counts, needs, saving, undealt } = useResultRows()
  const load = useResults((s) => s.load)
  const loading = useResults((s) => s.loading)
  const error = useResults((s) => s.error)
  React.useEffect(() => { void load() }, [load])
  useReloadOnEnd()

  const [tab, setTab] = React.useState("All")
  const [basis, setBasis] = React.useState<Basis>("result")
  const [q, setQ] = React.useState("")
  const [open, setOpen] = React.useState<string | null>(null)
  const [cursor, setCursor] = React.useState<string | null>(null)
  const final = !!view?.final

  // best rating first, nobody rated last
  const sorted = React.useMemo(() => [...all].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.code.localeCompare(b.code)), [all])
  // Not accepted has no tab while the departments show who chose them first
  const tabKey = basis === "first" && tab === "Not accepted" ? "All" : tab
  const rows = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return sorted.filter((r) => {
      if (s && !`${r.code} ${r.name} ${r.binome}`.toLowerCase().includes(s)) return false
      if (tabKey === "All") return true
      if (tabKey === "Needs") return r.needs
      return basis === "first" ? r.c1 === tabKey : r.result === tabKey
    })
  }, [sorted, q, tabKey, basis])

  // Up and down move the highlighted row (the open panel follows); a row that leaves the tab hands the highlight to the row that takes its place.
  const [lastAt, setLastAt] = React.useState(0)
  const found = rows.findIndex((r) => r.code === (open ?? cursor))
  const at = found >= 0 ? found : Math.min(lastAt, rows.length - 1)
  const active: ResultRow | undefined = cursor === null && !open ? undefined : rows[at]
  if (found >= 0 && found !== lastAt) setLastAt(found) // remembered, so a row that leaves the tab leaves the highlight at its place
  React.useEffect(() => {
    if (active) document.querySelector(`[data-row="${active.code}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])
  React.useEffect(() => {
    const move = (d: number) => {
      const n = rows[Math.max(0, Math.min(rows.length - 1, (cursor === null && !open ? -1 : found < 0 && d > 0 ? at - 1 : at) + d))]
      if (!n) return
      setCursor(n.code)
      if (open) setOpen(n.code)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // not while typing, nor behind a menu, another dialog or a focused button; the candidate's own panel keeps the keys
      const t = e.target as HTMLElement, inSheet = t.closest('[data-slot="sheet-content"]')
      if (t.closest("input, textarea, select, [contenteditable]") || (!inSheet && t.closest("button")) || document.querySelector('[role="menu"], [role="dialog"]:not([data-slot="sheet-content"])')) return
      if (e.key === "ArrowDown") { e.preventDefault(); move(1) }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1) }
      else if (e.key === "Enter" && active && !open && !inSheet) { e.preventDefault(); setOpen(active.code) }
      else if (/^[1-5]$/.test(e.key) && !final) {
        const target = open ? all.find((r) => r.code === open) : active // the panel's candidate, even if it left the tab
        if (target) void setResult(target, RESULT_VALUES[+e.key - 1])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows, all, at, found, active, cursor, open, final])

  const tabs = [
    { k: "All", label: "Everyone", n: all.length },
    ...RESULT_VALUES.filter((v) => basis === "result" || v !== "Not accepted").map((v) => ({ k: v as string, label: v as string, n: basis === "first" ? all.filter((r) => r.c1 === v).length : counts[v] ?? 0 })),
    { k: "Needs", label: "Needs a decision", n: needs },
  ]
  const opened = open ? all.find((r) => r.code === open) : undefined

  return (
    <BaseLayout title="Results" description="Everyone who needs a result, best rating first. The binome's Final Affectation is the result unless you change it." watermark="Results">
      {error && !view ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft p-4 text-sm text-danger">
          <p className="flex-1">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}><RotateCw /> Try again</Button>
        </div>
      ) : !view ? (
        <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} aria-pressed={tabKey === t.k}
                className={cn("inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-base font-semibold transition-colors", tabKey === t.k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent", t.k === "Needs" && t.n > 0 && tabKey !== t.k && "border-warning/50 text-warning")}>
                {t.k !== "All" && t.k !== "Needs" && <Dot v={t.k} />}{t.label}<span className="num font-bold">{t.n}</span>
              </button>
            ))}
            <span className="ml-auto inline-flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Departments show</span>
              <button type="button" onClick={() => setBasis(basis === "result" ? "first" : "result")} className="rounded-full border px-3 py-1 text-sm font-bold hover:bg-accent">
                {basis === "result" ? "who they get" : "who chose them first"}
              </button>
            </span>
          </div>
          <FinalBar view={view} rows={all} needs={needs} saving={saving} undealt={undealt} />
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or binome" className="h-10 rounded-full pl-9" aria-label="Search by code, name or binome" />
            </div>
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void load()}><RotateCw className={cn(loading && "animate-spin")} /> Reload</Button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[1040px] text-base">
              <thead className="sticky top-0 bg-card text-left text-sm text-muted-foreground">
                <tr className="border-b">
                  <th className="w-12 px-3 py-2.5 text-right font-semibold">#</th>
                  <th className="px-2 py-2.5 font-semibold">Candidate</th>
                  <th className="px-2 py-2.5 font-semibold">Binome</th>
                  <th className="px-2 py-2.5 font-semibold">Choices</th>
                  <th className="px-2 py-2.5 font-semibold">Rating</th>
                  <th className="px-2 py-2.5 font-semibold">Proposed</th>
                  <th className="px-2 py-2.5 font-semibold">Result</th>
                  <th className="px-2 py-2.5 font-semibold">Binome's notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, k) => (
                  <tr key={r.code} data-row={r.code} onClick={() => { setCursor(r.code); setOpen(r.code) }}
                    className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/50", active?.code === r.code && "bg-accent ring-2 ring-inset ring-primary")}>
                    <td className="num px-3 py-2.5 text-right text-muted-foreground">{k + 1}</td>
                    <td className="px-2 py-2.5"><span className="font-semibold">{r.name || r.code}</span> <span className="text-sm text-muted-foreground">{r.code}</span></td>
                    <td className="px-2 py-2.5">{r.binome || <span className="text-muted-foreground">None</span>}</td>
                    <td className="px-2 py-2.5 text-sm"><span className="font-bold">{r.c1 || "—"}</span> <span className="text-muted-foreground">/ {r.c2 || "—"}</span></td>
                    <td className="px-2 py-2.5"><RatingBar r={r} /></td>
                    <td className="px-2 py-2.5 text-sm">{r.proposal || <span className="text-muted-foreground">Nothing</span>}</td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-2"><ResultChip r={r} final={final} /><Marks r={r} /></span></td>
                    <td className="max-w-[18rem] truncate px-2 py-2.5 text-sm text-muted-foreground" title={r.notes}>{r.notes.split("\n")[0]}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">Nobody fits this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ResultPanel r={opened} final={final} onClose={() => setOpen(null)} />
    </BaseLayout>
  )
}
