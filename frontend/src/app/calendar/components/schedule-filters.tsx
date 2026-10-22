import { format } from "date-fns"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { BLOCK_MIN, CLASH, DEP, deptKey, deptVars, DEPTS, hhmm, STATES, type Filters, type IvState, type ScheduleItem } from "../schedule"
import { DatePicker } from "./date-picker"

const ALL = "all"

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1 px-4">
      <legend className="mb-1.5 text-sm font-bold">{title}</legend>
      {children}
    </fieldset>
  )
}

function Check({ id, checked, onChange, children, count }: { id: string; checked: boolean; onChange: () => void; children: React.ReactNode; count: number }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/60">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <span className={cn("flex min-w-0 flex-1 items-center gap-2", !checked && "text-muted-foreground")}>{children}</span>
      <span className="num text-xs font-semibold text-muted-foreground">{count}</span>
    </label>
  )
}

const toggle = <T,>(set: Set<T>, v: T) => {
  const next = new Set(set)
  if (!next.delete(v)) next.add(v)
  return next
}

/** The calendar sidebar: the mini month, then department, state and binome filters, then the clashes to look at. */
export function ScheduleFilters({
  items,
  filters,
  onFilters,
  date,
  onDate,
  binomes,
  onOpen,
}: {
  items: ScheduleItem[]
  filters: Filters
  onFilters: (f: Filters) => void
  date: Date
  onDate: (d: Date) => void
  binomes: string[]
  onOpen: (it: ScheduleItem) => void
}) {
  const busy = new Set(items.filter((it) => it.start).map((it) => it.start!.toDateString()))
  const n = (pred: (it: ScheduleItem) => boolean) => items.filter(pred).length
  const other = n((it) => deptKey(it.dept) === "")
  const clashes = items.filter((it) => it.clash && it.start).sort((a, b) => a.binome.localeCompare(b.binome, undefined, { numeric: true }) || a.start!.getTime() - b.start!.getTime())

  return (
    <div className="flex flex-col gap-5 pb-6">
      <DatePicker selectedDate={date} onDateSelect={onDate} busy={busy} />
      <Separator />

      <Group title="Department">
        {DEPTS.map((d) => (
          <Check key={d.key} id={`dep-${d.key}`} checked={filters.depts.has(d.key)} onChange={() => onFilters({ ...filters, depts: toggle(filters.depts, d.key) })} count={n((it) => deptKey(it.dept) === d.key)}>
            <span className={cn(DEP, "size-2.5 shrink-0 rounded-full bg-[var(--dep)]")} style={deptVars(d.key)} aria-hidden="true" />
            {d.label}
          </Check>
        ))}
        {other > 0 && (
          <Check id="dep-other" checked={filters.depts.has("")} onChange={() => onFilters({ ...filters, depts: toggle(filters.depts, "") })} count={other}>
            <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
            Other
          </Check>
        )}
      </Group>

      <Group title="State">
        {STATES.map((s) => (
          <Check key={s.key} id={`state-${s.key}`} checked={filters.states.has(s.key)} onChange={() => onFilters({ ...filters, states: toggle(filters.states, s.key as IvState) })} count={n((it) => it.state === s.key)}>
            <s.icon className={cn("size-4 shrink-0", s.tone)} aria-hidden="true" />
            <span title={s.hint}>{s.label}</span>
          </Check>
        ))}
      </Group>

      <Group title="Binome">
        <Select value={filters.binome || ALL} onValueChange={(v) => onFilters({ ...filters, binome: v === ALL ? "" : v })}>
          <SelectTrigger className="w-full" aria-label="Binome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All binomes</SelectItem>
            {binomes.map((b) => (
              <SelectItem key={b} value={b}>
                {b} <span className="text-muted-foreground">· {n((it) => it.binome === b)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Group>

      <Separator />
      <section aria-labelledby="clash-title" className="px-4">
        <h3 id="clash-title" className="mb-1.5 flex items-center gap-2 text-sm font-bold">
          <CLASH.icon className={cn("size-4", clashes.length ? CLASH.tone : "text-muted-foreground")} aria-hidden="true" />
          Clashes
          <span className="num ml-auto text-xs font-semibold text-muted-foreground">{clashes.length}</span>
        </h3>
        {clashes.length ? (
          <ul className="space-y-0.5">
            {clashes.map((it) => (
              <li key={it.code}>
                <button type="button" onClick={() => onOpen(it)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring">
                  <b className="w-10 shrink-0 font-semibold">{it.binome}</b>
                  <span className="min-w-0 flex-1 truncate font-bold text-primary">{it.code}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {format(it.start!, "EEE d")} · {hhmm(it.start!)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No binome has two interviews less than {BLOCK_MIN} min apart.</p>
        )}
      </section>
    </div>
  )
}
