import * as React from "react"
import { Link } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { describe, fromIv, KINDS, outcome, timeKey, type Kind } from "@/lib/vic/history"
import { useVic } from "@/lib/vic/store"

/**
 * One binome's changes, newest first: Member Changes and Interviewee Changes merged (who joined or left, covers, department,
 * pauses, moves in and out, admin edits on its candidates), with a filter by kind. What the binome types itself isn't logged. The
 * dashboard holds the last 300 rows of each log, so older ones are gone from here.
 */
export function ChangesCard({ code }: { code: string }) {
  const members = useVic((s) => s.state?.history)
  const iv = useVic((s) => s.state?.ivHistory)
  const all = useVic((s) => s.state?.interviewees)
  const [kind, setKind] = React.useState<Kind | "all">("all")
  const rows = React.useMemo(() => {
    const mine = new Set((all ?? []).filter((i) => i.binome === code).map((i) => i.code))
    return [...(members ?? []), ...(iv ?? []).map(fromIv)]
      .filter((h) => h.binome === code || ((h.type === "MOVED" || h.type === "EDIT") && (h.out.includes(code) || h.codes.some((c) => mine.has(c)))))
      .sort((a, b) => timeKey(b.at).localeCompare(timeKey(a.at)))
      .map((h) => ({ h, d: describe(h) }))
  }, [members, iv, all, code])
  const shown = rows.filter((r) => kind === "all" || r.d.kind === kind)
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-lg font-bold">Changes</CardTitle>
          <CardDescription>
            Who joined or left, covers, department, pauses, moves and admin edits.{" "}
            <Link to="/settings/history" className="font-semibold text-primary hover:underline">
              Change history
            </Link>
          </CardDescription>
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as Kind | "all")}>
          <SelectTrigger className="w-44" aria-label="Filter changes by kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KINDS[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {shown.length ? (
          <ul className="divide-y">
            {shown.map(({ h, d }, i) => {
              const o = outcome(h)
              return (
                <li key={`${h.at}-${i}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <d.icon className="size-4 shrink-0 text-muted-foreground" />
                  <b className="w-28 shrink-0 font-bold">{d.title}</b>
                  <span className="min-w-0 flex-1 basis-48">{d.what}</span>
                  <Badge variant={o.variant} title={o.detail}>
                    {o.label}
                  </Badge>
                  <span className="num shrink-0 text-xs text-muted-foreground" title={h.by}>
                    {h.at}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">{rows.length ? "No changes of this kind." : "No change logged for this binome yet."}</p>
        )}
      </CardContent>
    </Card>
  )
}
