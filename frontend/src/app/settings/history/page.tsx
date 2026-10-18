import * as React from "react"
import { ArrowRightLeft, Building2, Repeat, Search, UserMinus, UserRoundPlus, UsersRound, X, type LucideIcon } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useVic } from "@/lib/vic/store"
import type { HistoryRow } from "@/lib/vic/types"
import { MemberName } from "@/components/member-name"

type Kind = "replace" | "swap" | "cover" | "tag"

const KINDS: Record<Kind, { label: string }> = {
  replace: { label: "Replaced" },
  swap: { label: "Swapped" },
  cover: { label: "Cover" },
  tag: { label: "Department" },
}

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

/** Audit trail of everything done to binome members after lock, read from the Member Changes tab. */
export default function HistorySettings() {
  const history = useVic((x) => x.state?.history)
  const [q, setQ] = React.useState("")
  const [kind, setKind] = React.useState<Kind | "">("")

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (history ?? [])
      .map((h) => ({ h, d: describe(h) }))
      .filter(({ h, d }) => (!kind || d.kind === kind) && (!needle || [h.binome, h.by, h.out, h.inn, h.reason, h.codes.join(" "), d.text].join(" ").toLowerCase().includes(needle)))
  }, [history, q, kind])

  if (!history)
    return (
      <BaseLayout title="Change history" description="Who changed which binome, cover or department, and when." watermark="History">
        <Skeleton className="h-96 w-full rounded-2xl" />
      </BaseLayout>
    )

  return (
    <BaseLayout title="Change history" description="Who changed which binome, cover or department, and when." watermark="History">
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-lg font-bold">Timeline</CardTitle>
            <CardDescription>
              Every member change, swap, cover and department change made after lock, newest first. Read from the Member Changes tab, so it is the same record the script checks.
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
            <ToggleGroup type="single" variant="outline" size="sm" value={kind} onValueChange={(v) => setKind(v as Kind | "")} aria-label="Filter by change">
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <ToggleGroupItem key={k} value={k} className="px-3">
                  {KINDS[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="space-y-1 py-10 text-center">
              <p className="font-bold">{history.length ? "No match" : "Nothing changed yet"}</p>
              <p className="text-sm text-muted-foreground">
                {history.length ? "Nothing fits this search." : "Replacing, swapping or covering members, or changing a department, after lock (Binomes page) will show up here."}
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
