import * as React from "react"
import { Link, useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { EyeOff, Eye, MoveRight, Pencil, RotateCcw, Search, ShieldQuestionMark, Trash2, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SCREEN_STAGES, STAGES, STATUS_COLOR, STATUS_LABEL } from "@/lib/vic/format"
import { useActions } from "@/lib/vic/actions"
import { cn } from "@/lib/utils"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import { useProfile } from "@/lib/vic/analytics"
import type { Interviewee } from "@/lib/vic/types"

const NONE: Interviewee[] = []
const STATUS_ORDER: Record<string, number> = Object.fromEntries(STAGES.concat(SCREEN_STAGES).map((s, i) => [s.key, i]))

const columns: ColumnDef<Interviewee>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
    cell: ({ row }) => <ProfileLink code={row.original.code} />,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <span className="block max-w-[20rem] truncate" title={row.original.name}>{row.original.name || "—"}</span>,
  },
  {
    accessorKey: "binome",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Binome" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id) || "__none"),
    cell: ({ row }) => (row.original.binome ? <span className="font-medium">{row.original.binome}</span> : <span className="text-muted-foreground">No binome</span>),
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    sortingFn: (a, b) => (STATUS_ORDER[a.original.status] ?? 9) - (STATUS_ORDER[b.original.status] ?? 9),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[row.original.status] || "#9aa8b4" }} aria-hidden="true" />
        <span className="font-medium">{STATUS_LABEL[row.original.status] || row.original.status}</span>
      </span>
    ),
  },
  {
    id: "risk",
    accessorFn: (i) => i.risk ?? -1,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Risk" />,
    cell: ({ row }) => {
      const r = row.original.risk
      if (r === null || r === undefined) return <span className="text-muted-foreground">—</span>
      return <RiskBadge risk={r} />
    },
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => <RowAction iv={row.original} />,
  },
]

/** The code opens the applicant profile (admins only: members never see this page). */
function ProfileLink({ code }: { code: string }) {
  const show = useProfile((s) => s.show)
  return (
    <button
      type="button"
      onClick={() => show(code)}
      className="rounded font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open the profile of ${code}`}
    >
      {code}
    </button>
  )
}

function RiskBadge({ risk }: { risk: number }) {
  const holdAt = useVic((s) => s.state?.screening?.holdAt ?? 50)
  return (
    <span
      className={cn("num inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-xs font-bold", risk >= holdAt ? "bg-warning-soft text-warning" : risk > 0 ? "bg-secondary text-foreground" : "text-muted-foreground")}
      title={risk >= holdAt ? `At or above ${holdAt}: held for review` : "Screening score"}
    >
      {risk}
    </span>
  )
}

/** Move for a candidate in the pipeline; Review for one on hold (the decision lives on its alert); Restore for a declined one.
 *  Delete for every one. */
function RowAction({ iv }: { iv: Interviewee }) {
  const busy = useVic((s) => s.busy)
  const { deleteApplication } = useActions()
  const openEdit = useUi((s) => s.openEditDialog)
  return (
    <div className="flex justify-end gap-1">
      <MainAction iv={iv} />
      {iv.status !== "DECLINED" && iv.status !== "DUPLICATE" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => openEdit({ code: iv.code })} aria-label={`Edit ${iv.code}`} title="Edit their data" className="text-muted-foreground">
          <Pencil />
        </Button>
      )}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => deleteApplication(iv.code, iv.name, iv.binome)} aria-label={`Delete ${iv.code}`} title="Delete this application" className="text-muted-foreground hover:text-destructive">
        <Trash2 />
      </Button>
    </div>
  )
}

function MainAction({ iv }: { iv: Interviewee }) {
  const openMove = useUi((s) => s.openMoveDialog)
  const busy = useVic((s) => s.busy)
  const review = useVic((s) => (iv.status === "HELD" ? s.state?.alerts.find((a) => a.type === "NEEDS_REVIEW" && a.code === iv.code) : undefined))
  const { restore } = useActions()
  if (iv.status === "DECLINED") {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => restore(iv.code, iv.name)} aria-label={`Restore ${iv.code}`}>
        <RotateCcw /> <span className="hidden sm:inline">Restore</span>
      </Button>
    )
  }
  if (iv.status === "HELD") {
    return (
      <Button asChild variant="ghost" size="sm" aria-label={`Review ${iv.code}`}>
        <Link to={review ? `/alerts?id=${encodeURIComponent(review.id)}` : "/alerts"}>
          <ShieldQuestionMark /> <span className="hidden sm:inline">Review</span>
        </Link>
      </Button>
    )
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => openMove({ code: iv.code })} aria-label={`Move ${iv.code} to another binome`}>
      <MoveRight /> <span className="hidden sm:inline">Move</span>
    </Button>
  )
}

export default function IntervieweesPage() {
  const list = useVic((s) => s.state?.interviewees) ?? NONE
  const loading = useVic((s) => !s.state)
  const showProfile = useProfile((s) => s.show)
  const [params, setParams] = useSearchParams()
  const q = params.get("q") || ""
  const setQ = (v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set("q", v)
    else n.delete("q")
    setParams(n, { replace: true })
  }

  // declined applications stay out of the way unless asked for (like duplicates, which have no code at all)
  const showDeclined = params.get("declined") === "1"
  const declined = React.useMemo(() => list.filter((i) => i.status === "DECLINED").length, [list])
  const toggleDeclined = () => {
    const n = new URLSearchParams(params)
    if (showDeclined) n.delete("declined")
    else n.set("declined", "1")
    setParams(n, { replace: true })
  }
  const scored = useVic((s) => !!s.state?.screening?.on) || list.some((i) => i.risk !== null && i.risk !== undefined)
  const statusOptions = STAGES.concat(SCREEN_STAGES.filter((s) => s.key === "HELD" || showDeclined)).map((s) => ({ value: s.key, label: s.label }))

  const data = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((i) => (showDeclined || i.status !== "DECLINED") && (!s || `${i.code} ${i.name} ${i.binome}`.toLowerCase().includes(s)))
  }, [list, q, showDeclined])
  const binomeOptions = React.useMemo(
    () => [...new Set(list.map((i) => i.binome || "__none"))].sort().map((b) => ({ value: b, label: b === "__none" ? "No binome" : b })),
    [list]
  )

  return (
    <BaseLayout
      title="Interviewees"
      description={loading ? "Loading…" : `${list.length - declined} candidates with a code${declined ? `, plus ${declined} declined` : ""}. Search by code, name or binome; move one to another binome or delete it from its row.`}
      watermark="Candidates"
    >
      <DataTable
        key={scored ? "scored" : "plain"}
        initialVisibility={scored ? {} : { risk: false }}
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(i) => i.code}
        onRowClick={(i) => showProfile(i.code)}
        pageSize={25}
        initialSorting={[{ id: "code", desc: false }]}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{list.length ? "No match" : "No interviewees yet"}</p>
            <p className="text-sm text-muted-foreground">{list.length ? "Nothing fits this search." : "Candidates get a code when they register through the registration form."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2" data-tour="interviewees-toolbar">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or binome" aria-label="Search interviewees" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={statusOptions} />
            <DataTableFacetedFilter column={table.getColumn("binome")} title="Binome" options={binomeOptions} />
            {declined > 0 && (
              <Button variant="outline" size="sm" className={cn("h-8 rounded-full border-dashed", showDeclined && "border-solid bg-accent")} aria-pressed={showDeclined} onClick={toggleDeclined}>
                {showDeclined ? <Eye /> : <EyeOff />} Declined
                <span className="num rounded-full bg-secondary px-1.5 text-xs font-bold">{declined}</span>
              </Button>
            )}
            <DataTableViewOptions table={table} />
          </div>
        )}
      />
    </BaseLayout>
  )
}
