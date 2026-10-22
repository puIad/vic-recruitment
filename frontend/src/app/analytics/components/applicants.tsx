import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Search, X } from "lucide-react"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEPTS, deptColor, fieldLabel, useProfile, when, yearLabel } from "@/lib/vic/analytics"
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/vic/format"
import type { Model, Row } from "../model"

const facet = (row: { getValue: (id: string) => unknown }, id: string, value: string[]) => value.includes(String(row.getValue(id) || "—"))

function columns(tz: string): ColumnDef<Row>[] {
  return [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      sortingFn: (a, b) => a.original.code.localeCompare(b.original.code, undefined, { numeric: true }),
      cell: ({ row }) => (
        <button
          type="button"
          data-profile={row.original.key}
          className="rounded font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open the profile of ${row.original.code || row.original.name || "this applicant"}`}
        >
          {row.original.code || "—"}
        </button>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="block max-w-[14rem] truncate" title={row.original.name}>{row.original.name || "—"}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      filterFn: facet,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[row.original.status] || "#9aa8b4" }} aria-hidden="true" />
          {STATUS_LABEL[row.original.status] || row.original.status || "—"}
        </span>
      ),
    },
    {
      id: "field",
      accessorFn: (r) => r.field.toUpperCase() || "—",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Field" />,
      filterFn: facet,
      cell: ({ row }) => <span title={fieldLabel(row.original.field)}>{row.original.field || "—"}</span>,
    },
    {
      id: "year",
      accessorFn: (r) => r.overall ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Year" />,
      cell: ({ row }) => <span className="whitespace-nowrap">{yearLabel(row.original)}</span>,
    },
    {
      accessorKey: "c1",
      header: ({ column }) => <DataTableColumnHeader column={column} title="1st" />,
      filterFn: facet,
      cell: ({ row }) => <Dept d={row.original.c1} />,
    },
    {
      accessorKey: "c2",
      header: ({ column }) => <DataTableColumnHeader column={column} title="2nd" />,
      cell: ({ row }) => <Dept d={row.original.c2} />,
    },
    {
      id: "age",
      accessorFn: (r) => r.age ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Age" />,
      cell: ({ row }) =>
        row.original.age === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="num">
            {row.original.age}
            {row.original.birthUsed?.guessed && <span className="ml-1 text-xs font-semibold text-warning" title="Year guessed">?</span>}
          </span>
        ),
    },
    {
      accessorKey: "binome",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Binome" />,
      cell: ({ row }) => row.original.binome || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "registered",
      accessorFn: (r) => r.registered ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Registered" />,
      cell: ({ row }) => <span className="num whitespace-nowrap text-muted-foreground">{when(row.original.registered, tz) || "—"}</span>,
    },
  ]
}

function Dept({ d }: { d: string }) {
  if (!d) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className="size-2 rounded-full" style={{ background: deptColor(d) }} aria-hidden="true" />
      {d}
    </span>
  )
}

/** Every applicant, duplicates included; a row opens the profile. */
export function ApplicantsTable({ m }: { m: Model }) {
  const show = useProfile((s) => s.show)
  const [q, setQ] = React.useState("")
  const cols = React.useMemo(() => columns(m.tz), [m.tz])
  const data = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? m.rows.filter((r) => `${r.code} ${r.name} ${r.email} ${r.typedEmail} ${r.binome}`.toLowerCase().includes(s)) : m.rows
  }, [m.rows, q])
  const opts = (vals: string[], label: (v: string) => string = (v) => v) => [...new Set(vals)].sort().map((v) => ({ value: v, label: label(v) }))

  return (
    <div
      onClick={(e) => {
        // a click anywhere on a row opens its profile: the code cell's button carries the row's key (and is the keyboard path)
        const key = (e.target as HTMLElement).closest("tr")?.querySelector("[data-profile]")?.getAttribute("data-profile")
        if (key) show(key)
      }}
      className="[&_tbody_tr]:cursor-pointer"
    >
      <DataTable
        columns={cols}
        data={data}
        getRowId={(r) => r.key}
        pageSize={25}
        initialSorting={[{ id: "registered", desc: true }]}
        initialVisibility={{ binome: false }}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{m.rows.length ? "No match" : "No registrations yet"}</p>
            <p className="text-sm text-muted-foreground">{m.rows.length ? "Nothing fits this search and these filters." : "They appear here as the registration form fills in."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name, email or binome" aria-label="Search applicants" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter column={table.getColumn("status")} title="Status" options={opts(m.rows.map((r) => r.status || "—"), (v) => STATUS_LABEL[v] || v)} />
            <DataTableFacetedFilter column={table.getColumn("field")} title="Field" options={opts(m.rows.map((r) => r.field.toUpperCase() || "—"))} />
            <DataTableFacetedFilter column={table.getColumn("c1")} title="1st choice" options={DEPTS.map((d) => ({ value: d, label: d }))} />
            {table.getState().columnFilters.length > 0 && (
              <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => table.resetColumnFilters()}>
                Reset <X />
              </Button>
            )}
            <DataTableViewOptions table={table} />
          </div>
        )}
      />
    </div>
  )
}
