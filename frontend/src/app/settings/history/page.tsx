import * as React from "react"
import { ArrowRightLeft, Building2, MoveRight, PenLine, Repeat, Search, Trash2, UserMinus, UserRoundPlus, UsersRound, X, type LucideIcon } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useVic } from "@/lib/vic/store"
import type { HistoryRow, IvHistoryRow } from "@/lib/vic/types"
import { MemberName } from "@/components/member-name"

type Kind = "replace" | "swap" | "cover" | "tag" | "moved" | "deleted" | "edit"

const ALL = "all" // the Binome dropdown's "All binomes": Select items can't hold an empty value

const KINDS: Record<Kind, { label: string }> = {
  replace: { label: "Replaced" },
  swap: { label: "Swapped" },
  cover: { label: "Cover" },
  tag: { label: "Department" },
  moved: { label: "Moved" },
  deleted: { label: "Deleted" },
  edit: { label: "Edit accepted" },
}

/** An Interviewee Changes row in Member Changes' shape: MOVED (out → inn = the binomes), DELETED (out = the binome it left) or
 *  EDIT (out → inn = "Field: value"). They file under the binome they end in (an edit: the one it names, if any; a deletion:
 *  the one it left); the binome filter also finds the one they left. */
function fromIv(r: IvHistoryRow): HistoryRow {
  if (r.what === "Deleted") return { at: r.at, by: r.by, type: "DELETED", binome: r.from, out: r.from, inn: "", codes: [r.code], reason: "", status: "" }
  const moved = r.what === "Moved"
  const named = (s: string) => (/\bB\.\d+/.exec(s) ?? [])[0]
  const binome = moved ? r.to : /^B\.\d+$/.test(r.code) ? r.code : named(r.to) ?? named(r.from) ?? ""
  return { at: r.at, by: r.by, type: moved ? "MOVED" : "EDIT", binome, out: r.from, inn: r.to, codes: [r.code], reason: "", status: "" }
}

/** dd/MM/yyyy HH:mm → a key that sorts by time */
const timeKey = (at: string) => at.replace(/^(\d\d)\/(\d\d)\/(\d{4}) (\d\d:\d\d)$/, "$3$2$1$4")

/** What a Member Changes row means: a swap is two PERMANENT rows whose reason the script writes as "swap B.01 ↔ B.02". */
function describe(h: HistoryRow): { kind: Kind; title: string; icon: LucideIcon; what: React.ReactNode; text: string } {
  const out = h.out && <MemberName name={h.out} />
  const inn = h.inn && <MemberName name={h.inn} />
  if (h.type === "TEMPORARY") {
    const codes = h.codes.join(", ") || "some interviews"
    return {
      kind: "cover",
      title: "Cover",
      icon: UsersRound,
      what: <>{inn} covers {codes}{out && <> instead of {out}</>}</>,
      text: `${h.inn} covers ${codes}${h.out ? ` instead of ${h.out}` : ""}`,
    }
  }
  if (h.type === "MOVED") {
    const code = h.codes[0]
    return { kind: "moved", title: "Moved", icon: MoveRight, what: <>{code}: {h.out || "nobody"} → <b>{h.inn}</b></>, text: `${code} ${h.out} → ${h.inn}` }
  }
  if (h.type === "DELETED") {
    const code = h.codes[0]
    return { kind: "deleted", title: "Deleted", icon: Trash2, what: <>{code}{h.out && <span className="text-muted-foreground"> · was in {h.out}</span>}</>, text: `${code} deleted ${h.out}` }
  }
  if (h.type === "EDIT") {
    const code = h.codes[0]
    return {
      kind: "edit",
      title: "Edit accepted",
      icon: PenLine,
      what: <>{code}: <span className="text-muted-foreground">{h.out}</span> → {h.inn}</>,
      text: `${code} ${h.out} → ${h.inn}`,
    }
  }
  if (h.type === "TAG") {
    const kept = h.codes.length ? ` · kept ${h.codes.join(", ")}` : ""
    return {
      kind: "tag",
      title: "Department",
      icon: Building2,
      what: <>{h.out || "no tag"} → <b>{h.inn}</b>{kept && <span className="text-muted-foreground">{kept}</span>}</>,
      text: `${h.out} → ${h.inn}${kept}`,
    }
  }
  const arrow = { what: <>{out} → {inn}</>, text: `${h.out} → ${h.inn}` }
  if (/^swap /i.test(h.reason)) return { kind: "swap", title: "Swapped", icon: ArrowRightLeft, ...arrow }
  if (h.out && h.inn) return { kind: "replace", title: "Replaced", icon: Repeat, ...arrow }
  if (h.inn) return { kind: "replace", title: "Seat filled", icon: UserRoundPlus, what: <>{inn} joins</>, text: `${h.inn} joins` }
  return { kind: "replace", title: "Member left", icon: UserMinus, what: <>{out} leaves</>, text: `${h.out} leaves` }
}

/** The tab keeps the outcome as free text: DONE, FILE NOT UPDATED: …, ACTIVE, ENDED …, ENDING …. */
function outcome(h: HistoryRow): { label: string; variant: "success" | "warning" | "outline"; detail?: string } {
  const s = h.status
  if (/^FILE NOT UPDATED/i.test(s)) return { label: "Sheet not updated", variant: "warning", detail: s.replace(/^FILE NOT UPDATED:\s*/i, "") }
  if (/^ENDING/i.test(s)) return { label: "Ending", variant: "warning", detail: s.replace(/^ENDING\s*·?\s*/i, "") }
  if (/^ENDED/i.test(s)) return { label: "Ended", variant: "outline", detail: s.replace(/^ENDED\s*/i, "") }
  if (/^ACTIVE/i.test(s)) return { label: "Active", variant: "success" }
  return s === "DONE" || !s ? { label: "Done", variant: "success" } : { label: s, variant: "outline" }
}

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
      .filter(({ h, d }) => (!kind || d.kind === kind) && (binome === ALL || h.binome === binome || ((h.type === "MOVED" || h.type === "EDIT" || h.type === "DELETED") && h.out.includes(binome))) && (!needle || [h.binome, h.by, h.out, h.inn, h.reason, h.codes.join(" "), d.text].join(" ").toLowerCase().includes(needle)))
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
