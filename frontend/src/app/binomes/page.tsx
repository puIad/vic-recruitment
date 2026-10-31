import * as React from "react"
import { useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowRightLeft, Building2, CalendarClock, ExternalLink, KeyRound, MoveRight, MoreHorizontal, PauseCircle, PlayCircle, Repeat, Search, UserRoundX, UsersRound, X } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { OpenChip } from "@/components/open-chip"
import { DataTable } from "@/components/data-table/data-table"
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { DataTableFacetedFilter } from "@/components/data-table/data-table-faceted-filter"
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useActions } from "@/lib/vic/actions"
import { BINOME_STATUS, pct } from "@/lib/vic/format"
import { pausedLabel } from "@/lib/vic/pause"
import { useBinomeRows, type BinomeRow } from "@/lib/vic/pending"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"
import type { Binome, Cover, Unpaired } from "@/lib/vic/types"
import { cn } from "@/lib/utils"
import { MemberName, MemberNames } from "@/components/member-name"
import { PendingMark } from "@/app/alerts/components/pending-mark"
import { ACCESS_BADGE } from "./components/access-badge"
import { BinomePanel } from "./components/binome-panel"
import { useBinomeDialogs, type BinomeDialogs } from "./components/binome-dialogs"
import { PairingPanel } from "./components/pairing-panel"

const NONE: Binome[] = []
/** The Tracker tab's counts: sortable, off until View turns them on. */
const TRACKER_HIDDEN = { contacted: false, scheduled: false, withdrew: false, "not contacted": false, "no date": false, overdue: false }
type Row = BinomeRow

/** The row menus open the page's dialogs (access, department, pause) on their binome; a code opens its panel. */
const DialogCtx = React.createContext<BinomeDialogs & { panel: (code: string) => void }>({ access: () => {}, tag: () => {}, pause: () => {}, panel: () => {} })

/** A binome's code opens its summary panel: here an admin is comparing binomes. */
function CodeLink({ code }: { code: string }) {
  const { panel } = React.useContext(DialogCtx)
  return (
    <button type="button" onClick={() => panel(code)} className="rounded font-bold text-primary underline-offset-4 hover:underline">
      {code}
    </button>
  )
}

function RowActions({ b }: { b: Row }) {
  const open = React.useContext(DialogCtx)
  const openSheet = useUi((s) => s.openMemberSheet)
  const openMove = useUi((s) => s.openMoveDialog)
  const locked = b.status !== "DRAFT"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${b.code}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        {b.fileUrl && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <a href={b.fileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open {b.code} sheet
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!locked || !b.fileUrl} className="cursor-pointer" onSelect={() => open.access(b)}>
          <KeyRound /> Sheet &amp; dashboard access…
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onSelect={() => open.tag(b)}>
          <Building2 /> Change department…
        </DropdownMenuItem>
        {b.status === "ACTIVE" && (
          <DropdownMenuItem disabled={b.mark?.kind === "pending"} className="cursor-pointer" onSelect={() => open.pause(b, "pause")}>
            <PauseCircle /> Pause…
          </DropdownMenuItem>
        )}
        {b.status === "PAUSED" && (
          <>
            <DropdownMenuItem disabled={b.mark?.kind === "pending"} className="cursor-pointer" onSelect={() => open.pause(b, "resume")}>
              <PlayCircle /> Resume now…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={b.mark?.kind === "pending"} className="cursor-pointer" onSelect={() => open.pause(b, "date")}>
              <CalendarClock /> Change resume date…
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openSheet({ mode: "replace", binome: b.code })}>
          <Repeat /> Replace a member…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openSheet({ mode: "swap", binome: b.code })}>
          <ArrowRightLeft /> Swap with another binome…
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!locked} className="cursor-pointer" onSelect={() => openMove({ binome: b.code })}>
          <MoveRight /> Move an interviewee here…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "code",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Binome" />,
    cell: ({ row }) => <CodeLink code={row.original.code} />,
  },
  {
    id: "members",
    accessorFn: (b) => b.members.join(" & "),
    header: "Members",
    cell: ({ row }) => <span className="block max-w-[22rem] truncate" title={row.getValue("members")}><MemberNames names={row.original.members} /></span>,
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    cell: ({ row }) => {
      const s = BINOME_STATUS[row.original.status]
      return (
        <span className="inline-flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", s.dot)} aria-hidden="true" />
          <span className="font-medium">{row.original.status === "PAUSED" ? pausedLabel(row.original.pausedUntil) : s.label}</span>
          <PendingMark mark={row.original.mark} />
          {row.original.tag && <span className="text-muted-foreground">· {row.original.tag === "ALL" ? "takes any department" : row.original.tag}</span>}
          {ACCESS_BADGE[row.original.access || ""] && (
            <span
              className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", ACCESS_BADGE[row.original.access || ""]!.tone)}
              title="Opened to its members from the dashboard (sheet and My binome)"
            >
              {ACCESS_BADGE[row.original.access || ""]!.label}
            </span>
          )}
        </span>
      )
    },
  },
  {
    id: "progress",
    accessorFn: (b) => (b.status === "DRAFT" ? -1 : pct(b.interviewed, b.assigned - b.withdrew)),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Interviewed" />,
    cell: ({ row }) => {
      const b = row.original
      if (b.status === "DRAFT") return <span className="text-muted-foreground">Not locked</span>
      const denom = b.assigned - b.withdrew
      return (
        <div className="flex min-w-36 items-center gap-3">
          <span className="num w-12 text-sm">
            <b>{b.interviewed}</b>
            <span className="text-muted-foreground">/{denom}</span>
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct(b.interviewed, denom)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.code} interviewed share`}>
            <div className="h-full rounded-full bg-vic-ring" style={{ width: `${pct(b.interviewed, denom)}%` }} />
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "open",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Open alerts" />,
    cell: ({ row }) => <OpenChip code={row.original.code} open={row.original.open} />,
  },
  ...(
    [
      ["contacted", "Contacted", "contacted"],
      ["scheduled", "Scheduled", "scheduled"],
      ["withdrew", "Withdrew", "withdrew"],
      ["not contacted", "Not contacted", "notContacted"],
      ["no date", "No date", "noDate"],
      ["overdue", "Overdue", "overdue"],
    ] as const
  ).map(([id, title, k]): ColumnDef<Row> => ({
    id,
    accessorFn: (b) => b[k] ?? 0,
    header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
    cell: ({ row }) => <span className="num text-sm">{row.original[k] ?? 0}</span>,
  })),
  { id: "actions", enableHiding: false, cell: ({ row }) => <div className="flex justify-end"><RowActions b={row.original} /></div> },
]

function UnpairedCard({ list }: { list: Unpaired[] }) {
  const openSheet = useUi((s) => s.openMemberSheet)
  if (!list.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <UserRoundX className="size-5 text-warning" /> Unpaired members <Badge variant="warning" className="num">{list.length}</Badge>
        </CardTitle>
        <CardDescription>Team members left without a binome after lock. Nobody is paired automatically any more, so place them yourself.</CardDescription>
        {list.filter((m) => !m.draft).length >= 2 && (
          <CardAction>
            <Button size="sm" variant="secondary" onClick={() => openSheet({ mode: "pair" })}>
              <UsersRound /> Pair two…
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold" title={m.name}>{m.name ? <MemberName name={m.name} /> : m.email}</p>
                <p className="truncate text-sm text-muted-foreground">{m.email}</p>
              </div>
              {m.draft && <Badge variant="warning">in draft {m.draft}</Badge>}
              <Badge variant="outline">{m.pairAs}</Badge>
              <Button size="sm" variant="secondary" onClick={() => openSheet({ mode: "replace", inEmail: m.email, inName: m.name })}>
                Place…
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function CoversCard({ list }: { list: Cover[] }) {
  const { endCover } = useActions()
  const busy = useVic((s) => s.busy)
  const sharing = useVic((s) => !!s.state?.settings.shareFiles)
  if (!list.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <UsersRound className="size-5 text-primary" /> Active covers <Badge variant="info" className="num">{list.length}</Badge>
        </CardTitle>
        <CardDescription>Temporary stand-ins for chosen candidates. A cover ends the moment you end it, or when its interviews are done.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map((c) => (
            <li key={c.row} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1" title={c.reason}>
                <p className="truncate">
                  <b><MemberName name={c.name} /></b> <span className="text-muted-foreground">for</span> <b className="text-primary">{c.binome}</b>
                </p>
                <p className="text-sm text-muted-foreground">
                  {c.outName ? <>instead of <MemberName name={c.outName} /> · </> : null}
                  {c.codes.map((x, i) => (
                    <React.Fragment key={x}>
                      {i > 0 && ", "}
                      {c.live.includes(x) ? x : <s>{x}</s>}
                    </React.Fragment>
                  ))}
                  {c.reason ? ` · ${c.reason}` : ""}
                </p>
              </div>
              <Badge variant="outline" className="num">{c.live.length} left</Badge>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => endCover(c, sharing)}>
                End
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default function BinomesPage() {
  const state = useVic((s) => s.state)
  const binomes = state?.binomes ?? NONE
  const unpaired = useVic((s) => s.state?.unpaired) ?? []
  const covers = useVic((s) => s.state?.covers) ?? []
  const loading = useVic((s) => !s.state)
  const openSheet = useUi((s) => s.openMemberSheet)
  const openMove = useUi((s) => s.openMoveDialog)
  const [params, setParams] = useSearchParams()
  const q = params.get("q") || ""
  const setQ = (v: string) => {
    const n = new URLSearchParams(params)
    if (v) n.set("q", v)
    else n.delete("q")
    setParams(n, { replace: true })
  }

  const order = { ACTIVE: 0, PAUSED: 1, DRAFT: 2 } as const
  const rows = useBinomeRows()
  const data = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows
      .slice()
      .sort((a, b) => order[a.status] - order[b.status] || a.code.localeCompare(b.code))
      .filter((b) => !s || `${b.code} ${b.tag} ${b.status} ${b.members.join(" ")}`.toLowerCase().includes(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q])

  const locked = binomes.filter((b) => b.status !== "DRAFT").length
  const { dialogs: binomeDialogs, node: dialogNodes } = useBinomeDialogs(rows)
  const [panelOf, setPanelOf] = React.useState<string | null>(null)
  const dialogs = React.useMemo(() => ({ ...binomeDialogs, panel: setPanelOf }), [binomeDialogs])

  return (
    <DialogCtx.Provider value={dialogs}>
    <BaseLayout
      title="Binomes"
      description={loading ? "Loading…" : `${binomes.length} pairs of interviewers, ${locked} locked. Each locked binome has its own sheet.`}
      watermark="Binomes"
    >
      {state && !state.locked && <PairingPanel state={state} />}
      <UnpairedCard list={unpaired} />
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        getRowId={(b) => b.code}
        onRowClick={(b) => setPanelOf(b.code)}
        initialSorting={[]}
        initialVisibility={TRACKER_HIDDEN}
        empty={
          <div className="space-y-1 py-6">
            <p className="font-bold">{binomes.length ? "No match" : "No binomes yet"}</p>
            <p className="text-sm text-muted-foreground">{binomes.length ? "Nothing fits this filter." : "Import the team from the Overview, then pair them in the panel above."}</p>
          </div>
        }
        toolbar={(table) => (
          <div className="flex flex-wrap items-center gap-2" data-tour="binomes-toolbar">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a binome or a member" aria-label="Filter binomes" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear filter" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <DataTableFacetedFilter
              column={table.getColumn("status")}
              title="Status"
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Paused", value: "PAUSED" },
                { label: "Draft", value: "DRAFT" },
              ]}
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <DataTableViewOptions table={table} />
              <Button variant="outline" size="sm" onClick={() => openMove()} disabled={!locked}>
                <MoveRight /> Move interviewee
              </Button>
              <Button size="sm" onClick={() => openSheet()} disabled={!locked}>
                <Repeat /> Change members
              </Button>
            </div>
          </div>
        )}
      />
      <CoversCard list={covers} />
      <BinomePanel code={panelOf} onClose={() => setPanelOf(null)} dialogs={binomeDialogs} />
      {dialogNodes}
    </BaseLayout>
    </DialogCtx.Provider>
  )
}
