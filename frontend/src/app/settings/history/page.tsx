import * as React from "react"
import { Search, X } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useVic } from "@/lib/vic/store"
import { describe, fromIv, KINDS, timeKey, outcome, type Kind } from "@/lib/vic/history"

const ALL = "all" // the Binome dropdown's "All binomes": Select items can't hold an empty value

/** Audit trail after lock: binome members (Member Changes tab), interviewee moves and accepted hand edits (Interviewee Changes). */
export default function HistorySettings() {
  const members = useVic((x) => x.state?.history)
  const ivHistory = useVic((x) => x.state?.ivHistory)
  // both tabs, newest first (sort is stable: same-minute rows keep their tab's order)
  const history = React.useMemo(
    () => members && [...members, ...(ivHistory ?? []).map(fromIv)].sort((a, b) => timeKey(b.at).localeCompare(timeKey(a.at))),
    [members, ivHistory]
  )
  const binomes = useVic((x) => x.state?.binomes)
  const [q, setQ] = React.useState("")
  const [kind, setKind] = React.useState<Kind | "">("")
  const [binome, setBinome] = React.useState(ALL)

  // every binome of the snapshot, plus any code only the history still names
  const codes = React.useMemo(
    () => [...new Set([...(binomes ?? []).map((b) => b.code), ...(history ?? []).map((h) => h.binome)].filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [binomes, history]
  )

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (history ?? [])
      .map((h) => ({ h, d: describe(h) }))
      .filter(({ h, d }) => (!kind || d.kind === kind) && (binome === ALL || h.binome === binome || ((h.type === "MOVED" || h.type === "EDIT") && h.out.includes(binome))) && (!needle || [h.binome, h.by, h.out, h.inn, h.reason, h.codes.join(" "), d.text].join(" ").toLowerCase().includes(needle)))
  }, [history, q, kind, binome])

  if (!history)
    return (
      <BaseLayout title="Change history" description="Who changed which binome, cover, department or interviewee, and when." watermark="History">
        <Skeleton className="h-96 w-full rounded-2xl" />
      </BaseLayout>
    )

  return (
    <BaseLayout title="Change history" description="Who changed which binome, cover, department or interviewee, and when." watermark="History">
      <Card>
        <CardHeader className="grid-cols-1 gap-4">
          <div>
            <CardTitle className="text-lg font-bold">Timeline</CardTitle>
            <CardDescription>
              Every member change, swap, cover and department change made after lock, and every interviewee move, deletion and accepted hand edit, newest first. Read from the Member Changes and Interviewee Changes tabs.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Binome, person, code or reason" aria-label="Search history" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={binome} onValueChange={setBinome}>
              <SelectTrigger size="sm" className="w-40 rounded-full" aria-label="Filter by binome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All binomes</SelectItem>
                {codes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* six filters: on a phone the row scrolls instead of widening the card */}
            <div className="max-w-full overflow-x-auto">
            <ToggleGroup type="single" variant="outline" size="sm" value={kind} onValueChange={(v) => setKind(v as Kind | "")} aria-label="Filter by change">
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <ToggleGroupItem key={k} value={k} className="flex-auto px-3 whitespace-nowrap">
                  {KINDS[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="space-y-1 py-10 text-center">
              <p className="font-bold">{history.length ? "No match" : "Nothing changed yet"}</p>
              <p className="text-sm text-muted-foreground">
                {history.length ? "Nothing fits these filters." : "Replacing, swapping or covering members, changing a department, moving an interviewee or accepting a hand edit will show up here."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead>Binome</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ h, d }, i) => {
                  const o = outcome(h)
                  return (
                    <TableRow key={`${h.at}-${h.binome}-${i}`}>
                      <TableCell className="num whitespace-nowrap text-muted-foreground">{h.at}</TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">
                        <span className="inline-flex items-center gap-2">
                          <d.icon className="size-4 text-primary" /> {d.title}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {d.what}
                        {h.reason && !(d.kind === "swap" && /^swap /i.test(h.reason)) && <span className="block text-sm text-muted-foreground">{h.reason}</span>}
                      </TableCell>
                      <TableCell className="font-bold text-primary">{h.binome}</TableCell>
                      <TableCell className="text-muted-foreground">{h.by}</TableCell>
                      <TableCell className="whitespace-normal">
                        <Badge variant={o.variant}>{o.label}</Badge>
                        {o.detail && <span className="mt-1 block text-xs text-muted-foreground">{o.detail}</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </BaseLayout>
  )
}
