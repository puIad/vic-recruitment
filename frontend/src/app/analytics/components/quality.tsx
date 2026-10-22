import { CheckCircle2 } from "lucide-react"
import { longDate, useProfile, when, yearLabel } from "@/lib/vic/analytics"
import { alertLabel } from "@/lib/vic/format"
import type { Model } from "../model"
import { BarList, Figure, Panel } from "./kit"

export function QualityCard({ m }: { m: Model }) {
  const e = m.emails
  return (
    <Panel title="Data quality" description="Every registration, duplicates included: how clean the form's answers are. It may show what to change in next year's form." className="lg:col-span-2">
      <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
        <Figure value={m.rows.length} label="registrations in all" />
        <Figure value={m.duplicates.length} label="duplicates" />
        <Figure value={m.toCheck.length} label="birth dates to check" />
        <Figure value={e.total ? `${Math.round((e.personal * 100) / e.total)}%` : "—"} label="typed a personal email" hint={`${e.personal} personal, ${e.enp} @g.enp.edu.dz`} />
      </div>
      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        <div>
          <h4 className="mb-3 text-sm font-bold">Flags raised at registration</h4>
          <BarList total={m.rows.length} items={m.flags.map(([f, n]) => ({ key: f, label: alertLabel(f), value: n }))} empty="No flags: every registration passed the checks." />
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold">Email they typed</h4>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${e.enp} ENP emails, ${e.personal} personal`}>
            <span className="bg-primary" style={{ width: e.total ? `${(e.enp * 100) / e.total}%` : 0 }} />
            <span className="ml-[2px] bg-chart-3/40 first:ml-0" style={{ width: e.total ? `${(e.personal * 100) / e.total}%` : 0 }} />
          </div>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />@g.enp.edu.dz</dt>
            <dd className="num font-semibold">{e.enp}</dd>
            <dt className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-chart-3/40" aria-hidden="true" />Personal (Gmail and others)</dt>
            <dd className="num font-semibold">{e.personal}</dd>
          </dl>
        </div>
      </div>
    </Panel>
  )
}

/** Suspect birth dates (unreadable, or an age outside 15–35): what was typed, and the year the stats use instead. */
export function BirthChecksCard({ m }: { m: Model }) {
  const show = useProfile((s) => s.show)
  return (
    <Panel
      title="Birth dates to check"
      description="Typed with an impossible year, usually this year. The stats use the guess: same day and month, the year expected from their year of study. Nothing is saved: fix the form answer in the Master if it matters."
    >
      {m.toCheck.length ? (
        <ul className="divide-y">
          {m.toCheck.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => show(r.key)}
                className="grid w-full grid-cols-[4.5rem_1fr] items-baseline gap-x-3 gap-y-0.5 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <b className="font-bold text-primary">{r.code || "—"}</b>
                <span className="min-w-0 truncate font-medium">{r.name || "No name"}</span>
                <span />
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Typed <s className="text-foreground/70">{longDate(r.birth.date) || "nothing"}</s>
                  </span>
                  <span aria-hidden="true">→</span>
                  {r.birth.guess ? (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning">{longDate(r.birth.guess)}, guessed</span>
                  ) : (
                    <span>no guess: year of study missing</span>
                  )}
                </span>
                <span />
                <span className="text-xs text-muted-foreground">
                  {[r.field || "No field", yearLabel(r), r.registered ? `registered ${when(r.registered, m.tz, false)}` : ""].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-success" /> Every birth date reads as a plausible age.
        </p>
      )}
    </Panel>
  )
}
