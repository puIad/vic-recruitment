// PROTOTYPE for https://github.com/puIad/vic-recruitment/issues/177 (throwaway, mock data only, never merged).
// Three variants of the results view, switchable via ?variant=A|B|C on /results.
// Candidates come from test/webdev.js (webState). webState has no rating, proposal, form answers or 2nd choice for an admin yet,
// so mock() below makes them up from the code. Nothing is written: overrides live in this page's memory, and a reload forgets them.
import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, CircleDot, FlaskConical, Lock, MessageSquareText, RotateCcw, Search, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { STATUS_LABEL } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import type { Interviewee } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const NONE: Interviewee[] = []
const DEPTS = ["IT", "COMM", "FLER", "HR"] as const
const VALUES = [...DEPTS, "Not accepted"] as const
type Value = (typeof VALUES)[number]
const DEPT_COLOR: Record<string, string> = { IT: "var(--chart-1)", COMM: "var(--chart-5)", FLER: "var(--chart-4)", HR: "var(--chart-2)", "Not accepted": "#9aa8b4" }

// question titles as Config.gs holds them, shortened
const FIRST = ["English level"]
const SCORES: Record<string, string[]> = {
  IT: ["Purpose of the IT department", "Tight deadlines and pressure", "Open to design feedback"],
  COMM: ["Purpose of COMM", "Out-of-the-box ideas", "Social media trends", "Fluency in English", "Fluency in French"],
  HR: ["Purpose of HR", "Organized", "VIC Entertainment idea", "Works in a team", "Dealing with inactive members"],
  FLER: ["Purpose of FLER", "Managing stress in meetings", "Fluency in English", "Fluency in French", "Communication skills"],
}
const OPEN = ["Introduce yourself", "What they know about VIC", "What motivates them"]
const LINES = [
  "Calm and clear, gave concrete examples from a previous project.",
  "Knew the club's last events and asked good questions about the department.",
  "A bit shy at first, opened up once we talked about their field.",
  "Very motivated but vague on what the department does day to day.",
  "Short answers, needed prompting on most questions.",
  "Already organises events at their old school and wants to do more.",
]
const NOTES = [
  "Good energy, would fit the team well.",
  "Strong on the practical questions, weak on availability during exams.",
  "Bedelnalou dep: better profile for the other department.",
  "Hesitant, but learns quickly. Worth a chance.",
  "Chikor bzf, the best interview of our list.",
  "Late to the interview and not very prepared.",
  "",
]

interface Cand {
  code: string
  name: string
  binome: string
  status: string
  c1: string
  c2: string
  interviewed: boolean
  rating: number | null
  proposal: Value | ""
  activity: string
  notes: string
  conclusion: string
  source: string
  scores: { q: string; v: number }[]
  answers: { q: string; a: string }[]
}
interface Override {
  value: Value
  note: string
  by: string
  state: "pending" | "saved"
  /** the proposal when it was set: the view says when it has changed since */
  over: Value | ""
}
type Row = Cand & { override?: Override; result: Value | ""; offChoice: boolean; proposalChanged: boolean }

const hash = (s: string) => {
  let h = [...s].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
  return (h ^ (h >>> 13)) >>> 0
}

function mock(list: Interviewee[]): Cand[] {
  return list
    .filter((i) => !["DUPLICATE", "DECLINED", "WITHDRAWN"].includes(i.status))
    .map((i) => {
      const h = hash(i.code)
      const c1 = i.dept || i.code.split(".")[0]
      const others = DEPTS.filter((d) => d !== c1)
      const c2 = others[h % others.length]
      const interviewed = !["HELD", "UNASSIGNED"].includes(i.status) && h % 100 < 86
      const base = { code: i.code, name: i.name, binome: i.binome, status: i.status, c1, c2, interviewed }
      if (!interviewed) return { ...base, rating: null, proposal: "" as const, activity: "", notes: "", conclusion: "", source: "", scores: [], answers: [] }
      const qs = [...FIRST, ...(SCORES[c1] || [])]
      const level = 3.5 + (h % 50) / 10
      const scores = qs.map((q, k) => ({ q, v: Math.min(10, Math.max(1, Math.round(level + ((hash(i.code + k) % 40) - 20) / 10))) }))
      const rating = Math.round((scores.reduce((a, s) => a + s.v, 0) / scores.length) * 10) / 10
      const pick = h % 23
      const proposal: Value | "" = pick === 0 ? "" : rating < 5 ? "Not accepted" : pick < 4 ? (c2 as Value) : pick === 4 ? (others.find((d) => d !== c2) as Value) : (c1 as Value)
      return {
        ...base,
        rating,
        proposal,
        activity: ["English Bubble", "SPARK", "Training", "NON-Affiliated"][h % 4],
        notes: NOTES[h % NOTES.length],
        conclusion: LINES[(h >> 3) % LINES.length],
        source: h % 3 ? "Dashboard" : "Google Form",
        scores,
        answers: OPEN.map((q, k) => ({ q, a: LINES[(h + k) % LINES.length] })),
      }
    })
}

/** A few overrides already set, so every state shows without clicking. */
function seedOverrides(cands: Cand[]): Record<string, Override> {
  const out: Record<string, Override> = {}
  const done = cands.filter((c) => c.proposal).sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))
  const [a, b, c] = [done[1], done[4], done[6]]
  if (a) out[a.code] = { value: "Not accepted", note: "Weak availability, said so in the room.", by: "admin@g.enp.edu.dz", state: "saved", over: a.proposal }
  if (b) out[b.code] = { value: (b.c2 as Value), note: "Their binome agreed, better fit for the 2nd choice.", by: "nawel@g.enp.edu.dz", state: "saved", over: b.proposal }
  if (c) out[c.code] = { value: (c.c1 === "HR" ? "IT" : "HR"), note: "", by: "admin@g.enp.edu.dz", state: "saved", over: VALUES.find((v) => v !== c.proposal) as Value }
  return out
}

interface Results {
  rows: Row[]
  counts: Record<string, number>
  needs: Row[]
  never: Row[]
  pending: number
  final: boolean
  vicRh: boolean
  phaseClosed: boolean
  set: (code: string, value: Value, note?: string) => void
  clear: (code: string) => void
  setNote: (code: string, note: string) => void
  setMany: (codes: string[], value: Value) => void
  setFinal: (f: boolean) => void
}

function useResults(vicRh: boolean, phaseClosed: boolean): Results {
  const list = useVic((s) => s.state?.interviewees) ?? NONE
  const cands = React.useMemo(() => mock(list), [list])
  const seeds = React.useMemo(() => seedOverrides(cands), [cands])
  const [local, setLocal] = React.useState<Record<string, Override | null>>({})
  const [final, setFinal] = React.useState(false)
  const rows = React.useMemo<Row[]>(
    () =>
      cands
        .map((c) => {
          const override = local[c.code] === null ? undefined : local[c.code] || seeds[c.code]
          const result = override?.value || c.proposal
          return {
            ...c,
            override,
            result,
            offChoice: !!result && result !== "Not accepted" && result !== c.c1 && result !== c.c2,
            proposalChanged: !!override && override.over !== c.proposal,
          }
        })
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.code.localeCompare(b.code)),
    [cands, local, seeds]
  )
  const set = (code: string, value: Value, note?: string) => {
    const c = cands.find((x) => x.code === code)
    if (!c) return
    // the pending path: shown as "saving" until the queue has applied it
    if (value === c.proposal && note === undefined) {
      setLocal((l) => ({ ...l, [code]: null }))
      return
    }
    setLocal((l) => ({ ...l, [code]: { value, note: note ?? l[code]?.note ?? seeds[code]?.note ?? "", by: "admin@g.enp.edu.dz", state: "pending", over: c.proposal } }))
    setTimeout(() => setLocal((l) => (l[code] ? { ...l, [code]: { ...(l[code] as Override), state: "saved" } } : l)), 3000)
  }
  const counts = Object.fromEntries(VALUES.map((v) => [v, rows.filter((r) => r.result === v).length]))
  const needs = rows.filter((r) => !r.result)
  return {
    rows,
    counts,
    needs,
    never: needs.filter((r) => !r.interviewed),
    pending: rows.filter((r) => r.override?.state === "pending").length,
    final,
    vicRh,
    phaseClosed,
    set,
    clear: (code) => setLocal((l) => ({ ...l, [code]: null })),
    setNote: (code, note) => setLocal((l) => {
      const cur = l[code] || seeds[code]
      return cur ? { ...l, [code]: { ...cur, note } } : l
    }),
    setMany: (codes, value) => setLocal((l) => {
      const n = { ...l }
      codes.forEach((code) => { n[code] = { value, note: "Never interviewed", by: "admin@g.enp.edu.dz", state: "saved", over: "" } })
      return n
    }),
    setFinal,
  }
}

/* ---------- small shared bits ---------- */

function Dot({ v }: { v: string }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ background: DEPT_COLOR[v] || "#9aa8b4" }} aria-hidden="true" />
}

function RatingBar({ r, wide }: { r: Row; wide?: boolean }) {
  if (r.rating === null) return <span className="text-xs text-muted-foreground">{r.interviewed ? "No rating" : STATUS_LABEL[r.status] || "Not interviewed"}</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-7 text-right font-bold">{r.rating.toFixed(1)}</span>
      <span className={cn("h-1.5 overflow-hidden rounded-full bg-muted", wide ? "w-20" : "w-12")}>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${r.rating * 10}%` }} />
      </span>
    </span>
  )
}

/** The small marks a result can carry: off-choice, proposal changed, saving, note. */
function Marks({ r }: { r: Row }) {
  return (
    <span className="inline-flex items-center gap-1">
      {r.offChoice && <span title={`Not their 1st (${r.c1}) or 2nd (${r.c2}) choice`} className="text-warning"><AlertTriangle className="size-3.5" /></span>}
      {r.proposalChanged && <span title={`The binome's proposal changed to ${r.proposal || "nothing"} after this override`} className="text-info"><CircleDot className="size-3.5" /></span>}
      {r.override?.note && <span title={r.override.note} className="text-muted-foreground"><MessageSquareText className="size-3.5" /></span>}
      {r.override?.state === "pending" && <span className="text-xs text-muted-foreground">Saving</span>}
    </span>
  )
}

function ResultChip({ r, res, compact }: { r: Row; res: Results; compact?: boolean }) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
        !r.result && "border-warning/40 bg-warning-soft text-warning",
        r.override && "border-foreground/50",
        res.final && "opacity-80"
      )}
    >
      {r.result ? <Dot v={r.result} /> : null}
      {r.result || (compact ? "Decide" : "Needs a decision")}
    </span>
  )
  if (res.final) return chip
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Set the result of ${r.code}`}>{chip}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {VALUES.map((v) => (
          <DropdownMenuItem key={v} onSelect={() => res.set(r.code, v)}>
            <Dot v={v} /> {v}
            {v === r.c1 && <span className="ml-auto text-xs text-muted-foreground">1st</span>}
            {v === r.c2 && <span className="ml-auto text-xs text-muted-foreground">2nd</span>}
            {v === r.result && <Check className="ml-1 size-3.5" />}
          </DropdownMenuItem>
        ))}
        {r.override && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => res.clear(r.code)}><Undo2 /> Follow the binome{r.proposal ? ` (${r.proposal})` : ""}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Everything the room reads about one candidate. */
function Dossier({ r, res, hideControl }: { r: Row; res: Results; hideControl?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Fact k="Binome" v={r.binome || "None"} />
        <Fact k="1st / 2nd choice" v={`${r.c1} / ${r.c2}`} />
        <Fact k="Binome proposed" v={r.proposal || "Nothing yet"} />
        <Fact k="Activity" v={r.activity || "None"} />
      </div>
      {!hideControl && !res.final && <ResultButtons r={r} res={res} />}
      {!res.final && r.result && r.override && <NoteBox r={r} res={res} />}
      {r.proposalChanged && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          The binome's proposal is now {r.proposal || "empty"}; it was {r.override?.over || "empty"} when this override was set.
        </p>
      )}
      {r.interviewed ? (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">Binome's notes</h3>
            <p className="rounded-lg border bg-card px-3 py-2 text-sm">{r.notes || <span className="text-muted-foreground">No notes in the sheet.</span>}</p>
            <p className="rounded-lg border bg-card px-3 py-2 text-sm"><span className="font-semibold">Conclusion in the form: </span>{r.conclusion}</p>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">Scores <span className="font-normal text-muted-foreground">average {r.rating?.toFixed(1)}, form from {r.source}</span></h3>
            <ul className="space-y-1.5">
              {r.scores.map((s) => (
                <li key={s.q} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{s.q}</span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${s.v * 10}%` }} /></span>
                  <span className="num w-5 text-right font-bold">{s.v}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-bold">Answers</h3>
            {r.answers.map((a) => (
              <div key={a.q} className="text-sm"><p className="font-semibold">{a.q}</p><p className="text-muted-foreground">{a.a}</p></div>
            ))}
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Never interviewed ({STATUS_LABEL[r.status] || r.status}). No form and no notes.
        </p>
      )}
    </div>
  )
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{v}</p></div>
}

function ResultButtons({ r, res }: { r: Row; res: Results }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {VALUES.map((v, k) => (
        <Button key={v} size="sm" variant={r.result === v ? "default" : "outline"} onClick={() => res.set(r.code, v)} className="gap-1.5">
          <Dot v={v} /> {v}
          <kbd className="hidden text-[10px] opacity-60 lg:inline">{k + 1}</kbd>
        </Button>
      ))}
      {r.override && <Button size="sm" variant="ghost" onClick={() => res.clear(r.code)}><Undo2 /> Follow the binome</Button>}
      <Marks r={r} />
    </div>
  )
}

function NoteBox({ r, res }: { r: Row; res: Results }) {
  return (
    <Textarea
      key={r.code}
      defaultValue={r.override?.note || ""}
      onBlur={(e) => res.setNote(r.code, e.target.value)}
      placeholder="Note for admins (optional): why the room overrode the binome"
      rows={2}
      className="text-sm"
    />
  )
}

/** What stands between now and final, and who can do it. */
function FinalBar({ res, className }: { res: Results; className?: string }) {
  const [preview, setPreview] = React.useState(false)
  const [bulk, setBulk] = React.useState(false)
  const blocks = [
    !res.phaseClosed && "the interview phase is still open",
    res.needs.length > 0 && `${res.needs.length} need a decision`,
    res.pending > 0 && `${res.pending} still saving`,
  ].filter(Boolean)
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border bg-card px-3 py-2 text-sm", className)}>
      {res.final ? (
        <span className="inline-flex items-center gap-1.5 font-bold text-success"><Lock className="size-4" /> Results are final</span>
      ) : (
        <span className="text-muted-foreground">Not final{blocks.length ? `: ${blocks.join(", ")}.` : ". Ready."}</span>
      )}
      {!res.final && res.never.length > 0 && (
        <Button size="sm" variant="outline" className="h-7" onClick={() => setBulk(true)}>Set {res.never.length} never interviewed to Not accepted…</Button>
      )}
      <span className="ml-auto">
        {res.final ? (
          res.vicRh && <Button size="sm" variant="outline" className="h-7" onClick={() => res.setFinal(false)}><RotateCcw /> Reopen</Button>
        ) : res.vicRh ? (
          <Button size="sm" className="h-7" disabled={blocks.length > 0} onClick={() => setPreview(true)}><Lock /> Make results final…</Button>
        ) : (
          <span className="text-xs text-muted-foreground">Only the vic.rh sign-in can make results final</span>
        )}
      </span>
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make results final</DialogTitle>
            <DialogDescription>Each result is copied into Phase 1 Result. Later edits to Final Affectation change nothing. You can reopen until the first result mail.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">{VALUES.map((v) => <li key={v} className="flex items-center gap-2"><Dot v={v} /> {v}<span className="num ml-auto font-bold">{res.counts[v]}</span></li>)}</ul>
          <DialogFooter><Button onClick={() => { res.setFinal(true); setPreview(false); toast("Prototype: final, nothing was written") }}>Make final</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulk} onOpenChange={setBulk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set {res.never.length} to Not accepted</DialogTitle>
            <DialogDescription>Candidates with no interview and no proposal. Each stays changeable afterwards.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">{res.never.map((r) => <li key={r.code} className="flex gap-2"><span className="font-bold">{r.code}</span> {r.name}<span className="ml-auto text-xs text-muted-foreground">{STATUS_LABEL[r.status] || r.status}</span></li>)}</ul>
          <DialogFooter><Button onClick={() => { res.setMany(res.never.map((r) => r.code), "Not accepted"); setBulk(false) }}>Set Not accepted</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DossierSheet({ code, res, onClose }: { code: string | null; res: Results; onClose: () => void }) {
  const r = res.rows.find((x) => x.code === code)
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto px-5 pb-16 sm:max-w-xl">
        {r && (
          <>
            <SheetHeader className="px-0">
              <SheetTitle>{r.name}</SheetTitle>
              <SheetDescription>{r.code}</SheetDescription>
            </SheetHeader>
            <Dossier r={r} res={res} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ---------- A: the ranked table ---------- */

type Basis = "result" | "first"

function VariantA({ res }: { res: Results }) {
  const [tab, setTab] = React.useState("All")
  const [basis, setBasis] = React.useState<Basis>("result")
  const [q, setQ] = React.useState("")
  const [open, setOpen] = React.useState<string | null>(null)
  const rows = res.rows.filter((r) => {
    const s = q.trim().toLowerCase()
    if (s && !`${r.code} ${r.name} ${r.binome}`.toLowerCase().includes(s)) return false
    if (tab === "All") return true
    if (tab === "Needs") return !r.result
    return basis === "first" ? r.c1 === tab : r.result === tab
  })
  // B's keys, as the owner picked: arrows move the row (and the open panel), 1 to 5 set its result, Enter opens it.
  // A row that leaves the tab once set hands the cursor to the row that takes its place.
  const [cursor, setCursor] = React.useState<string | null>(null)
  const lastAt = React.useRef(0)
  const found = rows.findIndex((r) => r.code === (open ?? cursor))
  const at = found >= 0 ? found : Math.min(lastAt.current, rows.length - 1)
  const active = cursor === null && !open ? undefined : rows[at]
  React.useEffect(() => { lastAt.current = at }, [at])
  React.useEffect(() => {
    if (active) document.querySelector(`[data-row="${active.code}"]`)?.scrollIntoView({ block: "nearest" })
  }, [active])
  React.useEffect(() => {
    const move = (d: number) => {
      const n = rows[Math.max(0, Math.min(rows.length - 1, (cursor === null && !open ? -1 : at) + d))]
      if (!n) return
      setCursor(n.code)
      if (open) setOpen(n.code)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return
      if (e.key === "ArrowDown") { e.preventDefault(); move(1) }
      if (e.key === "ArrowUp") { e.preventDefault(); move(-1) }
      if (e.key === "Enter" && active && !open) { e.preventDefault(); setOpen(active.code) }
      const v = VALUES[+e.key - 1]
      if (v && active && !res.final) res.set(active.code, v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows, at, active, cursor, open, res])
  const tabs = [
    { k: "All", label: "Everyone", n: res.rows.length },
    ...VALUES.map((v) => ({ k: v, label: v, n: basis === "first" ? res.rows.filter((r) => r.c1 === v).length : res.counts[v] })).filter((t) => basis === "result" || t.k !== "Not accepted"),
    { k: "Needs", label: "Needs a decision", n: res.needs.length },
  ]
  return (
    <BaseLayout title="Results" description="Everyone who needs a result, best rating first. The binome's Final Affectation is the result unless you change it." watermark="Results">
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)} aria-pressed={tab === t.k}
            className={cn("inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors", tab === t.k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent", t.k === "Needs" && t.n > 0 && tab !== t.k && "border-warning/40 text-warning")}>
            {t.k in DEPT_COLOR && <Dot v={t.k} />}{t.label}<span className="num font-bold">{t.n}</span>
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Departments by</span>
          <button type="button" onClick={() => setBasis(basis === "result" ? "first" : "result")} className="rounded-full border px-2.5 py-1 text-xs font-bold hover:bg-accent">{basis === "result" ? "Result" : "1st choice"}</button>
        </span>
      </div>
      <FinalBar res={res} />
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or binome" className="h-9 rounded-full pl-9" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="w-10 px-3 py-2 text-right font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Candidate</th>
              <th className="px-2 py-2 font-semibold">Binome</th>
              <th className="px-2 py-2 font-semibold">Choices</th>
              <th className="px-2 py-2 font-semibold">Rating</th>
              <th className="px-2 py-2 font-semibold">Proposed</th>
              <th className="px-2 py-2 font-semibold">Result</th>
              <th className="px-2 py-2 font-semibold">Binome's notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={r.code} data-row={r.code} onClick={() => { setCursor(r.code); setOpen(r.code) }} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/50", active?.code === r.code && "bg-accent ring-2 ring-inset ring-primary")}>
                <td className="num px-3 py-2 text-right text-muted-foreground">{k + 1}</td>
                <td className="px-2 py-2"><span className="font-semibold">{r.name}</span> <span className="text-xs text-muted-foreground">{r.code}</span></td>
                <td className="px-2 py-2">{r.binome || <span className="text-muted-foreground">None</span>}</td>
                <td className="px-2 py-2 text-xs"><span className="font-bold">{r.c1}</span> <span className="text-muted-foreground">/ {r.c2}</span></td>
                <td className="px-2 py-2"><RatingBar r={r} /></td>
                <td className="px-2 py-2 text-xs">{r.proposal || <span className="text-muted-foreground">Nothing</span>}</td>
                <td className="px-2 py-2"><span className="inline-flex items-center gap-1.5"><ResultChip r={r} res={res} /><Marks r={r} /></span></td>
                <td className="max-w-[18rem] truncate px-2 py-2 text-xs text-muted-foreground" title={r.notes}>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DossierSheet code={open} res={res} onClose={() => setOpen(null)} />
    </BaseLayout>
  )
}

/* ---------- B: the deliberation desk, one candidate at a time (not picked; its keys moved to A) ---------- */

function VariantB({ res }: { res: Results }) {
  const [dept, setDept] = React.useState("All")
  const [undecided, setUndecided] = React.useState(false)
  const rows = res.rows.filter((r) => (dept === "All" || r.c1 === dept) && (!undecided || !r.result))
  const [code, setCode] = React.useState<string | null>(null)
  const cur = rows.find((r) => r.code === code) || rows[0]
  const at = cur ? rows.indexOf(cur) : -1
  const go = React.useCallback((d: number) => { const n = rows[at + d]; if (n) setCode(n.code) }, [rows, at])
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (cur) listRef.current?.querySelector(`[data-code="${cur.code}"]`)?.scrollIntoView({ block: "nearest" })
  }, [cur])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, [contenteditable]")) return
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); go(1) }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); go(-1) }
      const v = VALUES[+e.key - 1]
      if (v && cur && !res.final) res.set(cur.code, v)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, cur, res])
  return (
    <BaseLayout fullBleed>
      <div className="flex h-[calc(100svh-4.5rem)] min-h-[34rem] flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b md:w-[22rem] md:border-b-0 md:border-r">
          <div className="space-y-2 border-b p-3">
            <div className="grid grid-cols-5 gap-1 text-center">
              {VALUES.map((v) => (
                <div key={v} className="rounded-md border bg-card py-1">
                  <p className="num text-base font-bold leading-tight">{res.counts[v]}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{v === "Not accepted" ? "Not acc." : v}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {["All", ...DEPTS].map((d) => (
                <button key={d} type="button" aria-pressed={dept === d} onClick={() => setDept(d)} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", dept === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{d}</button>
              ))}
              <button type="button" aria-pressed={undecided} onClick={() => setUndecided(!undecided)} className={cn("ml-auto rounded-full border px-2.5 py-0.5 text-xs font-bold", undecided ? "border-warning bg-warning-soft text-warning" : "hover:bg-accent")}>Undecided {res.needs.length}</button>
            </div>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((r) => (
              <button key={r.code} data-code={r.code} type="button" onClick={() => setCode(r.code)}
                className={cn("flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm hover:bg-accent/50", cur?.code === r.code && "bg-accent")}>
                <span className="num w-7 shrink-0 text-right font-bold">{r.rating?.toFixed(1) ?? "–"}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.code} · {r.c1}/{r.c2}</span></span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold">
                  {r.offChoice && <AlertTriangle className="size-3 text-warning" />}
                  {r.result ? <><Dot v={r.result} />{r.result === "Not accepted" ? "No" : r.result}</> : <span className="text-warning">?</span>}
                </span>
              </button>
            ))}
          </div>
          <FinalBar res={res} className="m-2 rounded-lg text-xs" />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          {cur ? (
            <div className="mx-auto max-w-3xl space-y-5 p-5 lg:p-8">
              <header className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{at + 1} of {rows.length} · {cur.code}</p>
                  <h1 className="truncate text-2xl font-bold">{cur.name}</h1>
                </div>
                <div className="text-right">
                  <p className="num text-4xl font-bold leading-none">{cur.rating?.toFixed(1) ?? "–"}</p>
                  <p className="text-xs text-muted-foreground">Rating</p>
                </div>
              </header>
              <div className="sticky top-0 z-10 -mx-2 rounded-xl border bg-background/95 p-2 backdrop-blur">
                {res.final ? <p className="px-1 text-sm font-bold"><Dot v={cur.result} /> {cur.result} (final)</p> : <ResultButtons r={cur} res={res} />}
              </div>
              <Dossier r={cur} res={res} hideControl />
              <div className="flex justify-between pb-14">
                <Button variant="outline" size="sm" disabled={at <= 0} onClick={() => go(-1)}><ArrowUp /> Previous</Button>
                <Button variant="outline" size="sm" disabled={at >= rows.length - 1} onClick={() => go(1)}>Next <ArrowDown /></Button>
              </div>
            </div>
          ) : <p className="p-8 text-sm text-muted-foreground">Nobody fits this filter.</p>}
        </main>
      </div>
    </BaseLayout>
  )
}

/* ---------- C: the board, drag between departments ---------- */

function VariantC({ res }: { res: Results }) {
  const [first, setFirst] = React.useState("All")
  const [over, setOver] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  const cols: { key: string; label: string }[] = [{ key: "", label: "Needs a decision" }, ...VALUES.map((v) => ({ key: v as string, label: v as string }))]
  return (
    <BaseLayout title="Results" description="Each column is who the department gets. Drag a card to override the binome; a card outlined in black is an override." watermark="Results">
      <FinalBar res={res} />
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">1st choice</span>
        {["All", ...DEPTS].map((d) => (
          <button key={d} type="button" aria-pressed={first === d} onClick={() => setFirst(d)} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", first === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}>{d}</button>
        ))}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-14">
        {cols.map((c) => {
          const cards = res.rows.filter((r) => r.result === c.key)
          return (
            <section
              key={c.key || "needs"}
              onDragOver={(e) => { if (c.key && !res.final) { e.preventDefault(); setOver(c.key) } }}
              onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const code = e.dataTransfer.getData("text/plain"); if (code && c.key) res.set(code, c.key as Value) }}
              className={cn("flex h-[calc(100svh-17rem)] min-h-96 min-w-44 flex-1 flex-col rounded-xl border bg-muted/40", over === c.key && "border-primary bg-accent", !c.key && "border-warning/40")}
            >
              <header className="flex items-center gap-2 border-b px-3 py-2">
                {c.key && <Dot v={c.key} />}
                <h2 className={cn("truncate text-sm font-bold", !c.key && "text-warning")}>{c.label}</h2>
                <span className="num ml-auto text-lg font-bold">{cards.length}</span>
              </header>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                {cards.map((r) => (
                  <article
                    key={r.code}
                    draggable={!res.final}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", r.code)}
                    onClick={() => setOpen(r.code)}
                    className={cn("cursor-grab rounded-lg border bg-card p-2 text-sm shadow-xs transition-opacity active:cursor-grabbing", r.override && "border-foreground/70", first !== "All" && r.c1 !== first && "opacity-25")}
                  >
                    <div className="flex items-start gap-2">
                      <span className="num text-lg font-bold leading-none">{r.rating?.toFixed(1) ?? "–"}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold leading-tight">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.code} · {r.binome || "no binome"}</span></span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <span className={cn("font-bold", r.result === r.c1 && "text-primary")}>{r.c1}</span>
                      <span className={cn("text-muted-foreground", r.result === r.c2 && "font-bold text-primary")}>{r.c2}</span>
                      <span className="ml-auto"><Marks r={r} /></span>
                    </div>
                    {r.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.notes}</p>}
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <DossierSheet code={open} res={res} onClose={() => setOpen(null)} />
    </BaseLayout>
  )
}

/* ---------- the switcher ---------- */

const VARIANTS = [
  { key: "A", name: "Ranked table", C: VariantA },
  { key: "B", name: "Deliberation desk", C: VariantB },
  { key: "C", name: "Department board", C: VariantC },
]

export default function ResultsPrototype() {
  const [params, setParams] = useSearchParams()
  const at = Math.max(0, VARIANTS.findIndex((v) => v.key === params.get("variant")))
  const go = React.useCallback((d: number) => {
    const n = new URLSearchParams(window.location.search)
    n.set("variant", VARIANTS[(at + d + VARIANTS.length) % VARIANTS.length].key)
    setParams(n, { replace: true })
  }, [at, setParams])
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])
  const [vicRh, setVicRh] = React.useState(false)
  const [phaseClosed, setPhaseClosed] = React.useState(false)
  // above the variants, so an override set in one shows in the others
  const res = useResults(vicRh, phaseClosed)
  const V = VARIANTS[at]
  return (
    <>
      <V.C res={res} />
      {import.meta.env.DEV && (
        <div className="fixed bottom-3 right-3 z-50 flex items-center gap-3 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-white shadow-lg">
          <FlaskConical className="size-3.5 text-amber-300" />
          <button type="button" onClick={() => go(-1)} aria-label="Previous variant"><ChevronLeft className="size-4" /></button>
          <span className="whitespace-nowrap font-bold">{V.key} ({V.name})</span>
          <button type="button" onClick={() => go(1)} aria-label="Next variant"><ChevronRight className="size-4" /></button>
          <span className="h-4 w-px bg-white/30" />
          <label className="flex items-center gap-1.5 whitespace-nowrap"><Switch checked={vicRh} onCheckedChange={setVicRh} /> vic.rh</label>
          <label className="flex items-center gap-1.5 whitespace-nowrap"><Switch checked={phaseClosed} onCheckedChange={setPhaseClosed} /> phase closed</label>
        </div>
      )}
    </>
  )
}
