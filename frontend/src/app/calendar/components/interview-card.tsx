import * as React from "react"
import { format } from "date-fns"
import { ArrowUpRight, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { MemberName } from "@/components/member-name"
import { cn } from "@/lib/utils"
import type { Binome } from "@/lib/vic/types"
import { BLOCK_MIN, CLASH, DEP, deptVars, endOf, hhmm, STATE_BY_KEY, type ScheduleItem } from "../schedule"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** The read-only card of one interview. To change a date, the binome edits its sheet: the sync treats the sheet as the source. */
export function InterviewCard({ item, binome, clashWith, tzLabel, onClose }: { item: ScheduleItem | null; binome?: Binome; clashWith: ScheduleItem[]; tzLabel: string; onClose: () => void }) {
  // keep the last one on screen while the sheet slides out
  const [shown, setShown] = React.useState(item)
  if (item && item !== shown) setShown(item)
  const it = item ?? shown
  const S = it && STATE_BY_KEY[it.state]
  const people = binome?.people.length ? binome.people.map((p) => p.name || p.email) : (binome?.members ?? [])

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {it && S && (
          <>
            <SheetHeader className="border-b p-6" style={deptVars(it.dept)}>
              <p className={cn(DEP, "flex items-center gap-2 text-sm font-bold text-primary")}>
                <span className="size-2.5 rounded-full bg-[var(--dep)]" aria-hidden="true" />
                {it.code}
                <span className="font-medium text-muted-foreground">· 1st choice {it.dept || "unknown"}</span>
              </p>
              <SheetTitle className="text-2xl font-extrabold leading-tight text-heading">{it.name || "Unnamed candidate"}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("flex items-center gap-1.5 font-semibold", S.tone)}>
                    <S.icon className="size-4" aria-hidden="true" /> {S.label}
                  </span>
                  <span>{S.hint}</span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 p-6">
              {it.clash && (
                <p className="flex gap-2.5 rounded-xl bg-warning-soft px-3 py-2.5 text-sm text-warning">
                  <CLASH.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <b className="font-bold">Clash.</b> Less than {BLOCK_MIN} min from{" "}
                    {clashWith.map((c, i) => (
                      <React.Fragment key={c.code}>
                        {i > 0 && ", "}
                        <b className="font-bold">{c.code}</b> at {hhmm(c.start!)}
                      </React.Fragment>
                    ))}
                    , same binome.
                  </span>
                </p>
              )}

              <section aria-label="Interview">
                <h3 className="mb-2 text-sm font-bold">Interview</h3>
                <dl className="divide-y rounded-xl border">
                  <Row label="When">
                    {it.start ? (
                      <>
                        <span className="font-semibold">{format(it.start, "EEEE d MMMM")}</span>
                        <span className="num"> · {hhmm(it.start)}–{hhmm(endOf(it.start))}</span>
                        <span className="block text-xs text-muted-foreground">{tzLabel}</span>
                      </>
                    ) : it.state === "unreadable" ? (
                      <span className="text-danger">The date in the sheet can't be read</span>
                    ) : (
                      <span className="text-muted-foreground">No date yet</span>
                    )}
                  </Row>
                  <Row label="Contacted">{it.contacted || <span className="text-muted-foreground">Not yet</span>}</Row>
                  <Row label="Availability">
                    {it.avail ? <span className="whitespace-pre-line break-words">{it.avail}</span> : <span className="text-muted-foreground">Not given</span>}
                  </Row>
                </dl>
              </section>

              <section aria-label="Binome">
                <h3 className="mb-2 text-sm font-bold">Binome {it.binome}</h3>
                <dl className="divide-y rounded-xl border">
                  <Row label="Members">
                    {people.length ? (
                      <ul className="space-y-0.5">
                        {people.map((p) => (
                          <li key={p} className="font-semibold">
                            <MemberName name={p} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-muted-foreground">Not known</span>
                    )}
                  </Row>
                  {binome?.tag && <Row label="Departments">{binome.tag}</Row>}
                </dl>
              </section>

              <p className="flex gap-2.5 text-sm text-muted-foreground">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Read-only. To change the day or time, edit the binome sheet: the next sync brings it here.
              </p>
            </div>

            {binome?.fileUrl && (
              <SheetFooter className="border-t p-6">
                <Button asChild>
                  <a href={binome.fileUrl} target="_blank" rel="noopener noreferrer">
                    Open binome sheet <ArrowUpRight />
                  </a>
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
