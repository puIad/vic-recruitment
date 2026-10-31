import { AlertTriangle, Check, CircleDot, MessageSquareText, Undo2 } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { STATUS_LABEL } from "@/lib/vic/format"
import { RESULT_VALUES, setResult, type ResultRow } from "@/lib/vic/results"
import { cn } from "@/lib/utils"

const COLOR: Record<string, string> = { IT: "var(--dep-it)", COMM: "var(--dep-comm)", FLER: "var(--dep-fler)", HR: "var(--dep-hr)" }

export function Dot({ v }: { v: string }) {
  return <span className="size-3 shrink-0 rounded-full" style={{ background: COLOR[v] ?? "var(--muted-foreground)" }} aria-hidden="true" />
}

export function RatingBar({ r }: { r: ResultRow }) {
  if (r.rating === null) return <span className="text-sm text-muted-foreground">{r.interviewed ? "No rating" : STATUS_LABEL[r.status] || "Not interviewed"}</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-9 text-right text-base font-bold">{r.rating.toFixed(1)}</span>
      <span className="h-2 w-14 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.rating * 10)}%` }} />
      </span>
    </span>
  )
}

/** The small marks a result can carry: off-choice, proposal changed, a note, saving, not applied. */
export function Marks({ r }: { r: ResultRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {r.warn && <span title={`Not their 1st (${r.c1}) or 2nd (${r.c2}) choice`} className="text-warning"><AlertTriangle className="size-4" /><span className="sr-only">Not a choice they made</span></span>}
      {r.changed && <span title={`The binome's proposal changed to ${r.proposal || "nothing"} after this override`} className="text-info"><CircleDot className="size-4" /><span className="sr-only">Proposal changed</span></span>}
      {r.note && <span title={r.note} className="text-muted-foreground"><MessageSquareText className="size-4" /><span className="sr-only">Has a note</span></span>}
      {r.pending && <span className="text-sm text-muted-foreground">Saving</span>}
      {r.dropped && <span title={`Your change was not applied; the sheet kept ${r.override || "the binome's proposal"}`} className="text-sm font-semibold text-warning">Not applied</span>}
    </span>
  )
}

/** The chip on a row: the result, and a menu of the five values with the choices marked. Read only once final. */
export function ResultChip({ r, final }: { r: ResultRow; final: boolean }) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold",
        !r.result && "border-warning/50 bg-warning-soft text-warning",
        r.override && "border-2 border-foreground/70",
        final && "opacity-80"
      )}
    >
      {r.result ? <Dot v={r.result} /> : null}
      {r.result || "Needs a decision"}
    </span>
  )
  if (final) return chip
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Set the result of ${r.code}`}>{chip}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {RESULT_VALUES.map((v) => (
          <DropdownMenuItem key={v} onSelect={() => void setResult(r, v)}>
            <Dot v={v} /> {v}
            {v === r.c1 && <span className="ml-auto text-xs text-muted-foreground">1st</span>}
            {v === r.c2 && <span className="ml-auto text-xs text-muted-foreground">2nd</span>}
            {v === r.result && <Check className="ml-1 size-3.5" />}
          </DropdownMenuItem>
        ))}
        {r.override && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void setResult(r, r.proposal)}><Undo2 /> Follow the binome{r.proposal ? ` (${r.proposal})` : ""}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
