import * as React from "react"
import { useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { MoveRight, Search, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { STAGES, STATUS_COLOR, STATUS_LABEL } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Interviewee } from "@/lib/vic/types"

const NONE: Interviewee[] = []
const STATUS_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.key, i]))

const columns: ColumnDef<Interviewee>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
    cell: ({ row }) => <span className="font-bold text-primary">{row.original.code}</span>,
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
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => <MoveButton iv={row.original} />,
  },
]

function MoveButton({ iv }: { iv: Interviewee }) {
  const openMove = useUi((s) => s.openMoveDialog)
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" onClick={() => openMove({ code: iv.code })} aria-label={`Move ${iv.code} to another binome`}>
        <MoveRight /> <span className="hidden sm:inline">Move</span>
      </Button>
    </div>
  )
}

export default function IntervieweesPage() {
  const list = useVic((s) => s.state?.interviewees) ?? NONE
  const loading = useVic((s) => !s.state)
  const [params, setParams] = useSearchParams()
  const q = params.get("q") || ""
  const setQ = (v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set("q", v)
    else n.delete("q")
    setParams(n, { replace: true })
  }

  const data = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return list.filter((i) => !s || `${i.code} ${i.name} ${i.binome}`.toLowerCase().includes(s))
  }, [list, q])
  const binomeOptions = React.useMemo(
    () => [...new Set(list.map((i) => i.binome || "__none"))].sort().map((b) => ({ value: b, label: b === "__none" ? "No binome" : b })),
    [list]
  )

  return (
    <BaseLayout
      title="Interviewees"
      description={loading ? "Loading…" : `${list.length} candidates with a code. Search by code, name or binome; move one to another binome from its row.`}
      watermark="Candidates"
    >
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(i) => i.code}
        pageSize={25}
        initialSorting={[{ id: "code", desc: false }]}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{list.length ? "No match" : "No interviewees yet"}</p>
            <p className="text-sm text-muted-foreground">{list.length ? "Nothing fits this search." : "Candidates get a code when they register through the registration form."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or binome" aria-label="Search interviewees" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={STAGES.map((s) => ({ value: s.key, label: s.label }))} />
            <DataTableFacetedFilter column={table.getColumn("binome")} title="Binome" options={binomeOptions} />
            <DataTableViewOptions table={table} />
          </div>
        )}
      />
    </BaseLayout>
  )
}
