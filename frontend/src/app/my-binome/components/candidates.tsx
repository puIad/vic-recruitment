import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ArrowUpRight, Check, PanelRightOpen, Search, X } from "lucide-react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useConfirm } from "@/lib/vic/confirm"
import { useVic } from "@/lib/vic/store"
import { SHEET_LABEL, STAGES, STATUS_COLOR, STATUS_LABEL, cellText, fullName, sheetTime } from "@/lib/vic/format"
import { GOLD_KEYS, type Candidate, type GoldKey, type MemberState, type SheetKey } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { dropDrafts } from "./gold-drafts"
import { GoldField, GoldForm } from "./gold-fields"
import { InterviewAction } from "./interview-action"

const STATUS_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.key, i]))

/** The sheet's Contacted? options as soft pills: done is teal, a non-answer is blue, not yet stays quiet. */
const CONTACT_TONE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  Yes: "success",
  "No answer": "info",
  Withdrew: "secondary",
  "Not yet": "outline",
}

export function StatusDot({ status }: { status: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] || "#9aa8b4" }} aria-hidden="true" />
      <span className="font-medium">{STATUS_LABEL[status] || status}</span>
    </span>
  )
}

function Contacted({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return <Badge variant={CONTACT_TONE[value] ?? "outline"}>{value}</Badge>
}

/** A plain text column straight from the sheet, hidden until the View menu shows it. */
/** PROTOTYPE #171: the admin's binome page uses this table. */
export type AdminTable = { badge: (code: string) => React.ReactNode }

const textCol = (key: SheetKey, wide = false): ColumnDef<Candidate> => ({
  id: key,
  accessorFn: (c) => cellText(c[key]),
  header: ({ column }) => <DataTableColumnHeader column={column} title={SHEET_LABEL[key]} />,
  cell: ({ getValue }) => {
    const v = getValue() as string
    return v ? <span className={cn("block truncate", wide ? "max-w-[22rem]" : "max-w-[14rem]")} title={v}>{v}</span> : <span className="text-muted-foreground">—</span>
  },
})

function columns(open: (code: string) => void, fromSheet: boolean, member?: MemberState, admin?: AdminTable): ColumnDef<Candidate>[] {
  return [
    {
      id: "Code",
      accessorFn: (c) => cellText(c.Code),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      enableHiding: false,
      cell: ({ getValue }) => (
        <button type="button" onClick={() => open(getValue() as string)} className="rounded font-bold text-primary underline-offset-4 hover:underline">
          {getValue() as string}
        </button>
      ),
    },
    {
      id: "Name",
      accessorFn: fullName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      enableHiding: false,
      cell: ({ getValue, row }) => <span className="flex items-center"><span className="block max-w-[16rem] truncate font-medium">{(getValue() as string) || "—"}</span>{admin?.badge(cellText(row.original.Code))}</span>,
    },
    // the interview form, next to the name so it shows on a phone without scrolling the table
    ...(member && member.interviewForm !== undefined
      ? [
          {
            id: "Interview form",
            accessorFn: (c: Candidate) => (c.interview ? (c.interview.source === "Dashboard" ? 2 : 1) : 0),
            header: ({ column }) => <DataTableColumnHeader column={column} title="Interview form" />,
            cell: ({ row }) => <div data-tour="binome-interview-action" className="w-fit"><InterviewAction c={row.original} m={member} /></div>,
          } satisfies ColumnDef<Candidate>,
        ]
      : []),
    ...(admin
      ? [
          {
            id: "Interview form",
            accessorFn: (c: Candidate) => (c.interview ? `${c.interview.at} · ${c.interview.source}` : ""),
            header: ({ column }) => <DataTableColumnHeader column={column} title="Interview form" />,
            cell: ({ getValue }) => (getValue() ? <span className="whitespace-nowrap text-sm">{getValue() as string}</span> : <span className="text-muted-foreground">Not in</span>),
          } satisfies ColumnDef<Candidate>,
        ]
      : []),
    ...(fromSheet
      ? []
      : [
          {
            id: "Status",
            accessorFn: (c: Candidate) => c.Status,
            header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
            sortingFn: (a, b) => (STATUS_ORDER[a.original.Status] ?? 9) - (STATUS_ORDER[b.original.Status] ?? 9),
            filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
            cell: ({ row }) => <StatusDot status={row.original.Status} />,
          } satisfies ColumnDef<Candidate>,
        ]),
    {
      id: "Contacted",
      accessorFn: (c) => cellText(c.Contacted),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Contacted?" />,
      cell: ({ getValue }) => <Contacted value={getValue() as string} />,
    },
    {
      id: "Interview",
      accessorFn: (c) => sheetTime(c["Interview Date"], c["Interview Time"]),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Interview" />,
      sortingFn: (a, b) => {
        const x = a.getValue<number>("Interview"), y = b.getValue<number>("Interview")
        return (isNaN(x) ? Infinity : x) - (isNaN(y) ? Infinity : y) || 0
      },
      cell: ({ row }) => {
        const d = cellText(row.original["Interview Date"]), t = cellText(row.original["Interview Time"])
        return d ? <span className="num whitespace-nowrap">{d}{t && <span className="text-muted-foreground"> · {t}</span>}</span> : <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: "Done",
      accessorFn: (c) => cellText(c["Interview Done"]),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Done" />,
      cell: ({ getValue }) =>
        getValue() ? (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-success-soft text-success" title="Interview done">
            <Check className="size-3.5" />
            <span className="sr-only">Yes</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "Rating",
      accessorFn: (c) => cellText(c.Rating),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Rating" />,
      cell: ({ getValue }) => (getValue() ? <span className="num font-semibold">{getValue() as string}<span className="font-normal text-muted-foreground">/10</span></span> : <span className="text-muted-foreground">—</span>),
    },
    textCol("Final Affectation"),
    textCol("Email"),
    textCol("Phone"),
    textCol("1st Choice"),
    textCol("2nd Choice"),
    textCol("Field"),
    textCol("Year"),
    textCol("Registered"),
    textCol("Availability", true),
    textCol("Notes", true),
    ...(admin ? (["Birth Date", "Facebook", "Discord", "Discovered VIC", "Why VIC", "Other Clubs", "Why this department", "Department Questions", "Anything to add"] as SheetKey[]).map((k) => textCol(k, true)) : []),
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => open(cellText(row.original.Code))} aria-label={`Everything about ${cellText(row.original.Code)}`}>
            <PanelRightOpen /> <span className="hidden sm:inline">Details</span>
          </Button>
        </div>
      ),
    },
  ]
}

const HIDDEN = { "Birth Date": false, Facebook: false, Discord: false, "Discovered VIC": false, "Why VIC": false, "Other Clubs": false, "Why this department": false, "Department Questions": false, "Anything to add": false, Email: false, Phone: false, "1st Choice": false, "2nd Choice": false, Field: false, Year: false, Registered: false, Availability: false, Notes: false }

/** member: the interview form column (absent on a script without it). */
export function CandidatesTable({ candidates, fromSheet, onOpen, member, admin }: { candidates: Candidate[]; fromSheet: boolean; onOpen: (code: string) => void; member?: MemberState; admin?: AdminTable }) {
  const [q, setQ] = React.useState("")
  const cols = React.useMemo(() => columns(onOpen, fromSheet, member, admin), [onOpen, fromSheet, member, admin])
  const data = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return candidates.filter((c) => !s || `${cellText(c.Code)} ${fullName(c)} ${cellText(c.Email)}`.toLowerCase().includes(s))
  }, [candidates, q])
  const present = React.useMemo(() => new Set(candidates.map((c) => c.Status)), [candidates])

  return (
    <DataTable
      // remount when the Status column comes or goes, so the table's column state matches
      key={fromSheet ? "sheet" : "master"}
      columns={cols}
      data={data}
      getRowId={(c) => cellText(c.Code)}
      onRowClick={(c) => onOpen(cellText(c.Code))}
      pageSize={25}
      initialSorting={[{ id: "Code", desc: false }]}
      initialVisibility={HIDDEN}
      empty={
        <div className="space-y-1 py-6">
          <p className="font-bold">{candidates.length ? "No match" : "No candidates yet"}</p>
          <p className="text-sm text-muted-foreground">
            {candidates.length ? "Nothing fits this search." : "Registrants are routed to your binome as they sign up. They show here and in your sheet."}
          </p>
        </div>
      }
      toolbar={(table) => (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or e-mail" aria-label="Search your candidates" className="h-9 rounded-full pl-9" />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          {!fromSheet && (
            <DataTableFacetedFilter
              column={table.getColumn("Status")}
              title="Status"
              options={STAGES.filter((s) => present.has(s.key)).map((s) => ({ value: s.key, label: s.label }))}
            />
          )}
          <DataTableViewOptions table={table} />
        </div>
      )}
    />
  )
}

/** Every column of the sheet for one candidate, grouped the way an interviewer reads them. */
const GROUPS: { title: string; keys: SheetKey[] }[] = [
  { title: "Your interview", keys: ["Contacted", "Interview Date", "Interview Time", "Interview Done", "Rating", "Final Affectation", "Interview Form", "Notes"] },
  { title: "Contact", keys: ["Email", "Phone", "Facebook", "Discord", "Birth Date", "Registered"] },
  { title: "Studies and choices", keys: ["Field", "Year", "1st Choice", "2nd Choice", "Why this department", "Department Questions"] },
  { title: "About them", keys: ["Discovered VIC", "Why VIC", "Other Clubs", "Availability", "Anything to add"] },
]

function Value({ k, v }: { k: SheetKey; v: string }) {
  if (!v) return <span className="text-muted-foreground">—</span>
  if (k === "Email") return <a href={`mailto:${v}`} className="break-all font-medium text-primary hover:underline">{v}</a>
  if (k === "Phone") return <a href={`tel:${v.replace(/\s+/g, "")}`} className="num font-medium text-primary hover:underline">{v}</a>
  if (/^https?:\/\//i.test(v)) {
    return (
      <a href={v} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-primary hover:underline">
        {v.replace(/^https?:\/\/(www\.)?/i, "")} <ArrowUpRight className="size-3.5 shrink-0" />
      </a>
    )
  }
  if (k === "Contacted") return <Contacted value={v} />
  return <span className="whitespace-pre-line break-words">{v}</span>
}

const isGold = (k: SheetKey): k is GoldKey => (GOLD_KEYS as readonly string[]).includes(k)

/** editable: a member (not a cover) fills the binome's own columns here; they are written into the binome sheet. member: the
 *  interview form's button at the top. */
export function CandidateSheet({ candidate, candidates, fileUrl, editable, onClose, member, admin }: { candidate: Candidate | null; candidates: Candidate[]; fileUrl: string; editable: boolean; onClose: () => void; member?: MemberState; admin?: boolean }) {
  // keep the last candidate while the sheet slides out, but only while they are still in this binome's slice:
  // someone moved away (or a cover that ended) must not linger on screen or in memory
  const [shown, setShown] = React.useState(candidate)
  const stillHere = !!shown && candidates.some((x) => cellText(x.Code) === cellText(shown.Code))
  if (candidate ? candidate !== shown : shown && !stillHere) setShown(candidate)
  const c = candidate ?? (stillHere ? shown : null)

  // closing with unsaved fields asks first: they would be lost
  const confirm = useConfirm()
  const binome = useVic((s) => s.member?.binome ?? "")
  const unsaved = React.useRef(0)
  const onDirty = React.useCallback((n: number) => void (unsaved.current = n), [])
  async function close() {
    const n = unsaved.current
    if (
      n &&
      !(await confirm({
        title: "Discard unsaved changes?",
        body: <p>{n > 1 ? `${n} fields you changed aren't` : "A field you changed isn't"} saved to your sheet yet. Close anyway and lose them?</p>,
        okLabel: "Discard changes",
        danger: true,
      }))
    )
      return
    if (n && c) dropDrafts(binome, cellText(c.Code)) // discarded: the drafts kept in this browser go too
    unsaved.current = 0
    onClose()
  }

  return (
    <Sheet open={!!candidate} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {c && (
          <>
            <SheetHeader className="border-b p-6">
              <p className="text-sm font-bold text-primary">{cellText(c.Code)}</p>
              <SheetTitle className="text-2xl font-extrabold leading-tight text-heading">{fullName(c) || "Unnamed candidate"}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {c.Status ? <StatusDot status={c.Status} /> : <span>Status shows after the next sync</span>}
                  <span aria-hidden="true">·</span>
                  <span>{admin ? "Fill in the binome's columns; this overwrites what they typed unless they changed it since" : editable ? "Fill in your columns, then Save them to your binome sheet" : "As in your binome sheet"}</span>
                </div>
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 p-6">
              {member && member.interviewForm !== undefined && (
                <section aria-label="Interview form" className="rounded-xl border border-vic-aqua/50 bg-accent/30 p-4">
                  <h3 className="mb-3 text-sm font-bold">Interview form</h3>
                  <InterviewAction c={c} m={member} wide />
                </section>
              )}
              {GROUPS.map((g, gi) => {
                const edits = editable && gi === 0
                const dl = (
                    <dl className={cn("divide-y rounded-xl border", edits && "border-vic-aqua/50 bg-accent/30")}>
                      {g.keys.map((k) =>
                        edits && isGold(k) ? (
                          <div key={k} className="grid grid-cols-1 gap-1.5 px-3 py-3 text-sm sm:grid-cols-[9rem_1fr] sm:gap-3">
                            <dt className="pt-2 font-medium text-foreground/80">
                              <label htmlFor={`gold-${cellText(c.Code)}-${k.replace(/\s+/g, "-")}`}>{admin && k === "Notes" ? "Notes" : SHEET_LABEL[k]}</label>
                            </dt>
                            <dd className="min-w-0">
                              <GoldField k={k} />
                            </dd>
                          </div>
                        ) : (
                          <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-3 py-2.5 text-sm">
                            <dt className="text-muted-foreground">{SHEET_LABEL[k]}</dt>
                            <dd className="min-w-0">
                              <Value k={k} v={cellText(c[k])} />
                            </dd>
                          </div>
                        )
                      )}
                    </dl>
                )
                return (
                  <section key={g.title} aria-label={g.title}>
                    <h3 className="mb-2 flex items-baseline justify-between gap-2 text-sm font-bold">
                      {admin && gi === 0 ? "Binome's columns" : g.title}
                      {edits && <span className="text-xs font-medium text-muted-foreground">{admin ? "Written to the binome sheet when you press Save" : "Written to your sheet when you press Save"}</span>}
                      {admin && gi === 1 && <Button size="sm" variant="ghost" className="h-7" onClick={() => toast("Prototype: Edit a candidate's data (#167)", { description: "Decided on the map, not built." })}>Edit registration</Button>}
                    </h3>
                    {edits ? (
                      // keyed by candidate: switching candidates starts the form afresh
                      <GoldForm key={cellText(c.Code)} code={cellText(c.Code)} candidate={c} onDirty={onDirty}>
                        {dl}
                      </GoldForm>
                    ) : (
                      dl
                    )}
                  </section>
                )
              })}
            </div>
            {fileUrl && (
              <SheetFooter className="border-t p-6">
                <Button asChild variant="outline">
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    {admin ? "Open the binome sheet" : "Open my binome sheet"} <ArrowUpRight />
                  </a>
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
