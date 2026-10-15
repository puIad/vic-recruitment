import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Check, Search, UserPlus, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { initials } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { TeamMember, WebState } from "@/lib/vic/types"
import { MemberName } from "@/components/member-name"

type Row = TeamMember & { binome: string; state: "Paired" | "Unpaired" | "In draft" }

function rowsOf(s: WebState): Row[] {
  return s.teamList.map((m) => {
    const real = s.binomes.find((b) => b.status !== "DRAFT" && b.people.some((p) => p.email.toLowerCase() === m.email.toLowerCase()))
    const draft = s.binomes.find((b) => b.status === "DRAFT" && b.people.some((p) => p.email.toLowerCase() === m.email.toLowerCase()))
    return { ...m, binome: real?.code || draft?.code || "", state: real ? "Paired" : draft ? "In draft" : "Unpaired" }
  })
}

function PlaceButton({ m }: { m: Row }) {
  const openSheet = useUi((s) => s.openMemberSheet)
  if (m.state === "Paired") return null
  return (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" onClick={() => openSheet({ mode: "replace", inEmail: m.email, inName: m.name })}>
        <UserPlus /> Place…
      </Button>
    </div>
  )
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Member" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground" aria-hidden="true">
          {initials(row.original.name || row.original.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{row.original.name ? <MemberName name={row.original.name} /> : "—"}</p>
          <p className="truncate text-sm text-muted-foreground">{row.original.email}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "pairAs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pairs as" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => <Badge variant="outline">{row.original.pairAs}</Badge>,
  },
  {
    id: "experience",
    accessorFn: (m) => (m.experienced ? "Experienced" : "New"),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Experience" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) =>
      row.original.experienced ? (
        <Badge variant="success" title="Has interviewed before (Team tab › Experienced)">
          <Check aria-hidden="true" /> Experienced
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-muted-foreground">New</Badge>
      ),
  },
  {
    accessorKey: "binome",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Binome" />,
    cell: ({ row }) =>
      row.original.binome ? (
        <Link to={`/binomes?q=${encodeURIComponent(row.original.binome)}`} className="font-bold text-primary hover:underline">
          {row.original.binome}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "state",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Paired" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => <Badge variant={row.original.state === "Paired" ? "success" : row.original.state === "In draft" ? "info" : "warning"}>{row.original.state}</Badge>,
  },
  { id: "actions", enableHiding: false, cell: ({ row }) => <PlaceButton m={row.original} /> },
]

export default function TeamPage() {
  const s = useVic((x) => x.state)
  const [q, setQ] = React.useState("")
  const rows = React.useMemo(() => (s ? rowsOf(s) : []), [s])
  const data = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => !t || `${r.name} ${r.email} ${r.pairAs} ${r.binome}`.toLowerCase().includes(t))
  }, [rows, q])

  const paired = rows.filter((r) => r.state === "Paired").length
  const unpaired = rows.filter((r) => r.state === "Unpaired").length
  const stats: [string, number | string, string][] = s
    ? [
        ["On the team", s.team.total, s.team.source ? `from “${s.team.source}”` : "Team tab"],
        ["Paired", paired, `${rows.length ? Math.round((paired * 100) / rows.length) : 0}% of interviewers`],
        ["Without a binome", unpaired, unpaired ? "place them from their row" : "everyone has a seat"],
        ["Excluded", s.team.excluded, "ticked Exclude in the Team tab"],
      ]
    : []

  return (
    <BaseLayout title="Team" description="The interviewers on the OT list, and where each one sits." watermark="Team">
      <Card className="py-5">
        <CardContent>
          {s ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4 md:divide-x">
              {stats.map(([label, value, note], i) => (
                <div key={label} className={i ? "md:pl-6" : undefined}>
                  <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
                  <dd className="num mt-0.5 text-3xl font-extrabold leading-tight">{value}</dd>
                  <dd className="text-xs text-muted-foreground">{note}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </CardContent>
      </Card>
      <DataTable
        columns={columns}
        data={data}
        loading={!s}
        getRowId={(r) => r.email}
        pageSize={25}
        initialSorting={[{ id: "name", desc: false }]}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{rows.length ? "No match" : "The Team tab is empty"}</p>
            <p className="text-sm text-muted-foreground">{rows.length ? "Nothing fits this search." : "Import the team from the launch sequence on the Overview."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or binome" aria-label="Search the team" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter column={table.getColumn("state")} title="Paired" options={[{ label: "Paired", value: "Paired" }, { label: "In draft", value: "In draft" }, { label: "Unpaired", value: "Unpaired" }]} />
            <DataTableFacetedFilter column={table.getColumn("experience")} title="Experience" options={[{ label: "Experienced", value: "Experienced" }, { label: "New", value: "New" }]} />
            <DataTableFacetedFilter column={table.getColumn("pairAs")} title="Pairs as" options={[...new Set(rows.map((r) => r.pairAs))].sort().map((v) => ({ label: v, value: v }))} />
            <DataTableViewOptions table={table} />
          </div>
        )}
      />
    </BaseLayout>
  )
}
