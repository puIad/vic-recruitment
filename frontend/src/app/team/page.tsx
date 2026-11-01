import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { Building2, Check, MoreHorizontal, PenLine, Search, UserMinus, UserPlus, UserRoundX, UserRoundCheck, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { initials } from "@/lib/vic/format"
import { useActions } from "@/lib/vic/actions"
import { useTeamCells } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { TeamField, TeamMember, WebState } from "@/lib/vic/types"
import { seatsOf } from "@/components/work-panels/team-dialog"
import { MemberName } from "@/components/member-name"

type Row = TeamMember & { binome: string; draft: string; state: "Paired" | "Unpaired" | "In draft"; interviewing: "Interviewing" | "Not interviewing"; pending: boolean }

/** The Team list with the author's pending cells over it (a SKIP row shows as not interviewing). */
function rowsOf(s: WebState, mine: ReturnType<typeof useTeamCells>): Row[] {
  return s.teamList.map((t) => {
    const over = mine[t.email.toLowerCase()] || {}
    const m = { ...t, name: String(over["Full Name"] ?? t.name), dept: String(over.Department ?? t.dept ?? ""), pairAs: String(over["Pair As"] ?? t.pairAs),
      exclude: !!(over.Exclude ?? t.exclude), experienced: !!(over.Experienced ?? t.experienced) }
    const { binome, draft } = seatsOf(s, m.email)
    return { ...m, binome: binome?.code || draft?.code || "", draft: draft?.code || "", state: binome ? "Paired" : draft ? "In draft" : "Unpaired",
      interviewing: m.exclude || m.pairAs === "SKIP" ? "Not interviewing" : "Interviewing", pending: Object.keys(over).length > 0 }
  })
}

function RowActions({ m }: { m: Row }) {
  const openSheet = useUi((s) => s.openMemberSheet)
  const openTeam = useUi((s) => s.openTeamDialog)
  const { teamCells, teamRemove } = useActions()
  const set = (field: TeamField, value: boolean, seen: boolean, direct = false) => void teamCells(m.email, [{ field, value, seen }], direct)
  const out = m.interviewing === "Not interviewing"
  return (
    <div className="flex items-center justify-end gap-1">
      {m.state !== "Paired" && !out && (
        <Button variant="ghost" size="sm" onClick={() => openSheet({ mode: "replace", inEmail: m.email, inName: m.name })}>
          <UserPlus /> Place…
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name || m.email}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-xl">
          <DropdownMenuItem className="cursor-pointer" onSelect={() => openTeam({ mode: "fix", email: m.email })}>
            <PenLine /> Correct name or email…
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={() => openTeam({ mode: "dept", email: m.email })}>
            <Building2 /> Department and Pair As…
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={() => set("Experienced", !m.experienced, !!m.experienced)}>
            <Check /> {m.experienced ? "Mark as new" : "Mark as experienced"}
          </DropdownMenuItem>
          {out ? (
            <DropdownMenuItem className="cursor-pointer" onSelect={() => (m.pairAs === "SKIP" ? openTeam({ mode: "dept", email: m.email, resume: true }) : set("Exclude", false, true))}>
              <UserRoundCheck /> Interviewing again{m.pairAs === "SKIP" ? "…" : ""}
            </DropdownMenuItem>
          ) : (
            // in a draft: a direct write, which drops the draft and frees the partner
            <DropdownMenuItem className="cursor-pointer" onSelect={() => set("Exclude", true, false, !!m.draft)}>
              <UserRoundX /> Not interviewing{m.binome && !m.draft ? ` (stays in ${m.binome})` : ""}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer text-danger" onSelect={() => void teamRemove(m, m.draft ? "" : m.binome, m.draft)}>
            <UserMinus /> Remove from the team…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
          <p className="truncate font-bold">
            {row.original.name ? <MemberName name={row.original.name} /> : "—"}
            {row.original.pending && <span className="ml-2 text-xs font-normal text-primary">saving</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{row.original.email}</p>
          {row.original.notes && <p className="truncate text-xs text-warning" title="Team tab › Notes">{row.original.notes}</p>}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "pairAs",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pairs as" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{row.original.pairAs}</Badge>
        {row.original.dept && row.original.dept !== row.original.pairAs && <span className="text-xs text-muted-foreground">{row.original.dept}</span>}
      </div>
    ),
  },
  {
    accessorKey: "interviewing",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Interviewing" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => (row.original.interviewing === "Interviewing" ? <span className="text-sm">Yes</span> : <Badge variant="secondary">Not interviewing</Badge>),
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
        <Link to={`/binomes/${encodeURIComponent(row.original.binome)}`} className="font-bold text-primary hover:underline">
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
  { id: "actions", enableHiding: false, cell: ({ row }) => <RowActions m={row.original} /> },
]

export default function TeamPage() {
  const s = useVic((x) => x.state)
  const mine = useTeamCells()
  const openTeam = useUi((x) => x.openTeamDialog)
  const [q, setQ] = React.useState("")
  const rows = React.useMemo(() => (s ? rowsOf(s, mine) : []), [s, mine])
  const data = React.useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => !t || `${r.name} ${r.email} ${r.pairAs} ${r.binome}`.toLowerCase().includes(t))
  }, [rows, q])

  const paired = rows.filter((r) => r.state === "Paired").length
  const unpaired = rows.filter((r) => r.state === "Unpaired" && r.interviewing === "Interviewing").length
  const out = rows.length - rows.filter((r) => r.interviewing === "Interviewing").length
  const stats: [string, number | string, string][] = s
    ? [
        ["On the team", s.team.total, s.team.source ? `from “${s.team.source}”` : "Team tab"],
        ["Paired", paired, `${rows.length - out ? Math.round((paired * 100) / (rows.length - out)) : 0}% of interviewers`],
        ["Without a binome", unpaired, unpaired ? "place them from their row" : "everyone has a seat"],
        ["Not interviewing", out, "filter them with Interviewing"],
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
        initialFilters={[{ id: "interviewing", value: ["Interviewing"] }]}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{rows.length ? "No match" : "The Team tab is empty"}</p>
            <p className="text-sm text-muted-foreground">{rows.length ? "Nothing fits this search." : "Import the team from the launch sequence on the Overview."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2" data-tour="team-toolbar">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or binome" aria-label="Search the team" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter column={table.getColumn("interviewing")} title="Interviewing" options={[{ label: "Interviewing", value: "Interviewing" }, { label: "Not interviewing", value: "Not interviewing" }]} />
            <DataTableFacetedFilter column={table.getColumn("state")} title="Paired" options={[{ label: "Paired", value: "Paired" }, { label: "In draft", value: "In draft" }, { label: "Unpaired", value: "Unpaired" }]} />
            <DataTableFacetedFilter column={table.getColumn("experience")} title="Experience" options={[{ label: "Experienced", value: "Experienced" }, { label: "New", value: "New" }]} />
            <DataTableFacetedFilter column={table.getColumn("pairAs")} title="Pairs as" options={[...new Set(rows.map((r) => r.pairAs))].sort().map((v) => ({ label: v, value: v }))} />
            <DataTableViewOptions table={table} />
            <Button size="sm" className="ml-auto" onClick={() => openTeam({ mode: "add" })}>
              <UserPlus /> Add member
            </Button>
          </div>
        )}
      />
    </BaseLayout>
  )
}
