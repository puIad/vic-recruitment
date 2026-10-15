import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { Check, CircleCheckBig, Hand, Lock, RotateCcw, Search, Shuffle, Sparkles, UsersRound, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MemberName } from "@/components/member-name"
import { useActions } from "@/lib/vic/actions"
import { Spinner } from "@/lib/vic/confirm"
import { initials } from "@/lib/vic/format"
import { MIX, draftCounts, experienceOf, freeMembers, mixOf, pairTag, pairWarning } from "@/lib/vic/pairing"
import { useVic } from "@/lib/vic/store"
import type { Binome, TeamMember, WebState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

const SIDES: { key: string; label: string; dot: string }[] = [
  { key: "HR", label: "HR side", dot: "bg-dep-hr" },
  { key: "IT", label: "IT", dot: "bg-dep-it" },
  { key: "COMM", label: "COMM", dot: "bg-dep-comm" },
  { key: "FLER", label: "FLER", dot: "bg-dep-fler" },
  { key: "ALL", label: "Board leads", dot: "bg-primary" },
]
const lc = (s: string) => s.trim().toLowerCase()

/** A good partner for `a`: the side the draw would give (HR with another department, a board lead with anyone) and the
 *  other experience class. Only a hint: any two free members can be paired. */
function goodMatch(a: TeamMember, m: TeamMember, isExp: (e: string) => boolean) {
  if (lc(a.email) === lc(m.email) || isExp(a.email) === isExp(m.email)) return false
  if (a.pairAs === "ALL" || m.pairAs === "ALL") return a.pairAs !== m.pairAs
  return (a.pairAs === "HR") !== (m.pairAs === "HR")
}

/** Experienced / New, as a pill the owner toggles (Team tab › Experienced). */
function ExperienceToggle({ m, on, disabled, onToggle }: { m: TeamMember; on: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      aria-label={`${m.name || m.email}: ${on ? "experienced" : "new"}. Mark as ${on ? "new" : "experienced"}`}
      title={on ? "Has interviewed before. Click to mark as new" : "New interviewer. Click to mark as experienced"}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors duration-200 outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
        on ? "bg-success-soft text-success hover:bg-success-soft/70" : "bg-secondary text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {on ? <Check className="size-3" aria-hidden="true" /> : null}
      {on ? "Experienced" : "New"}
    </button>
  )
}

/** Small disc in front of a draft member: filled = experienced, ring = new. */
function ExpDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", on ? "bg-vic-aqua" : "border border-muted-foreground/60")}
      title={on ? "Experienced" : "New"}
      aria-hidden="true"
    />
  )
}

function Stat({ label, value, note, warn }: { label: string; value: React.ReactNode; note: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0 sm:px-5 sm:first:pl-0">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn("num mt-0.5 text-2xl font-extrabold leading-tight", warn && "text-warning")}>{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

function FreeRow({
  m,
  exp,
  picked,
  order,
  match,
  disabled,
  onPick,
  onToggle,
}: {
  m: TeamMember
  exp: boolean
  picked: boolean
  order: number
  match: boolean
  disabled: boolean
  onPick: () => void
  onToggle: () => void
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-xl border border-transparent pr-2 transition-colors duration-200",
        picked ? "border-primary/40 bg-accent" : match ? "bg-success-soft/50 hover:bg-success-soft" : "hover:bg-muted"
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-pressed={picked}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200",
            picked ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground group-hover:bg-background"
          )}
          aria-hidden="true"
        >
          {picked ? order : initials(m.name || m.email)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-bold">{m.name ? <MemberName name={m.name} /> : m.email}</span>
            {match && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-success" title="Good match">
                <Sparkles className="size-3" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">good match</span>
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
        </span>
      </button>
      <ExperienceToggle m={m} on={exp} disabled={disabled} onToggle={onToggle} />
    </li>
  )
}

function DraftRow({
  b,
  isExp,
  removing,
  disabled,
  onRemove,
}: {
  b: Binome
  isExp: (e: string) => boolean
  removing: boolean
  disabled: boolean
  onRemove: () => void
}) {
  const team = useVic((s) => s.state?.teamList)
  const side = (e: string) => team?.find((m) => lc(m.email) === lc(e))?.pairAs || ""
  const exp = b.people.map((p) => isExp(p.email))
  const mix = MIX[mixOf(exp)]
  const warn = b.people.length === 2 ? pairWarning(side(b.people[0].email), side(b.people[1].email)) : ""
  return (
    <li className={cn("flex items-start gap-3 py-3 transition-opacity duration-200 animate-in fade-in-0", removing && "opacity-50")}>
      <span className="num w-11 shrink-0 pt-0.5 font-bold text-primary">{b.code}</span>
      <div className="min-w-0 flex-1">
        <ul className="space-y-0.5">
          {b.people.map((p, i) => (
            <li key={p.email || i} className="flex min-w-0 items-center gap-2">
              <ExpDot on={exp[i]} />
              <span className="truncate font-semibold" title={p.email}>
                <MemberName name={p.name || p.email} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{b.tag === "ALL" ? "Any department" : b.tag}</Badge>
          <Badge variant={mix.tone}>{mix.label}</Badge>
          {b.byHand && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Paired by hand: Draw the rest keeps it, Redraw all asks first">
              <Hand className="size-3" aria-hidden="true" /> by hand
            </span>
          )}
        </div>
        {warn && <p className="mt-1 text-xs text-warning">{warn}</p>}
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${b.code}: ${b.people.map((p) => p.name || p.email).join(" and ")} ${b.people.length > 1 ? "go" : "goes"} back to the free members`}
        title="Remove this pair"
      >
        {removing ? <Spinner /> : <X />}
      </Button>
    </li>
  )
}

/** The pair being written: shown at once, until the fresh state has the real row. */
function PendingRow({ people, isExp }: { people: TeamMember[]; isExp: (e: string) => boolean }) {
  return (
    <li className="flex items-start gap-3 py-3 animate-in fade-in-0 slide-in-from-bottom-1" aria-live="polite">
      <span className="flex w-11 shrink-0 pt-0.5 text-primary">
        <Spinner />
      </span>
      <div className="min-w-0 flex-1">
        <ul className="space-y-0.5">
          {people.map((p) => (
            <li key={p.email} className="flex min-w-0 items-center gap-2">
              <ExpDot on={isExp(p.email)} />
              <span className="truncate font-semibold">
                <MemberName name={p.name || p.email} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs text-muted-foreground">Writing the draft…</p>
      </div>
    </li>
  )
}

/** What the two picked members would make, and the Pair button. On a phone it comes after the list and sticks to the bottom of
 *  the screen while the list scrolls; on a wide screen it sits above the list, which scrolls on its own. */
function PairTray({
  picked,
  isExp,
  busy,
  onUnpick,
  onPair,
}: {
  picked: TeamMember[]
  isExp: (e: string) => boolean
  busy: boolean
  onUnpick: (email: string) => void
  onPair: () => void
}) {
  const [a, b] = picked
  const mix = picked.length === 2 ? MIX[mixOf(picked.map((m) => isExp(m.email)))] : null
  const warn = a && b ? pairWarning(a.pairAs, b.pairAs) : ""
  const hint = !a
    ? "Pick two members to pair them."
    : !b
      ? isExp(a.email)
        ? `${a.name.split(" ")[0] || "They"} has interviewed before: a new partner learns from them.`
        : `${a.name.split(" ")[0] || "They"} is new: an experienced partner is best.`
      : ""
  return (
    <div className="sticky bottom-3 z-10 order-last mt-3 rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:static lg:order-none lg:bg-accent/40 lg:shadow-none lg:backdrop-blur-none">
      <div className="flex flex-wrap items-center gap-2">
        {[a, b].map((m, i) =>
          m ? (
            <span key={m.email} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent py-1 pl-1 pr-1.5 text-sm font-semibold text-accent-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground" aria-hidden="true">
                {i + 1}
              </span>
              <span className="truncate">
                <MemberName name={m.name || m.email} />
              </span>
              <button
                type="button"
                onClick={() => onUnpick(m.email)}
                className="rounded-full p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label={`Unpick ${m.name || m.email}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <span key={i} className="inline-flex h-8 items-center rounded-full border-2 border-dashed border-primary/30 px-3 text-xs text-muted-foreground">
              {i === 0 ? "First member" : "Partner"}
            </span>
          )
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {a && b && (
            <>
              <Badge variant="outline">{pairTag(a.pairAs, b.pairAs) === "ALL" ? "Any department" : pairTag(a.pairAs, b.pairAs)}</Badge>
              {mix && <Badge variant={mix.tone}>{mix.label}</Badge>}
            </>
          )}
          {(hint || warn) && <p className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground", a && b && "basis-full")}>{warn || hint}</p>}
        </div>
        <Button size="sm" disabled={!a || !b || busy} onClick={onPair}>
          {busy ? <Spinner /> : <UsersRound />} Pair
        </Button>
      </div>
    </div>
  )
}

/**
 * Pairing before Lock (launch-features.md, section 1): the free members on the left, grouped by side, each with an
 * Experienced pill to toggle; pick two and Pair writes a DRAFT row at once. The drafts on the right, with their tag and
 * experience mix, each removable. Draw the rest pairs everyone still free (new members get an experienced partner when there
 * are enough); Redraw all starts the draw over. Nothing is shared or mailed before Lock.
 */
export function PairingPanel({ state }: { state: WebState }) {
  const { draftPair, draftUnpair, teamSet, drawRest, redrawAll } = useActions()
  const busy = useVic((s) => s.busy)
  const [q, setQ] = React.useState("")
  const [picked, setPicked] = React.useState<string[]>([])
  const [pending, setPending] = React.useState<TeamMember[] | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [drawing, setDrawing] = React.useState<"rest" | "all" | null>(null)
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({})
  const ref = React.useRef<HTMLDivElement>(null)
  const { hash } = useLocation()

  React.useEffect(() => {
    if (hash === "#pairing") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [hash])

  const isExp = React.useMemo(() => experienceOf(state.teamList, overrides), [state.teamList, overrides])
  const pendingSet = React.useMemo(() => new Set((pending || []).map((m) => lc(m.email))), [pending])
  const free = React.useMemo(() => freeMembers(state).filter((m) => !pendingSet.has(lc(m.email))), [state, pendingSet])
  const drafts = state.binomes.filter((b) => b.status === "DRAFT").sort((a, b) => a.code.localeCompare(b.code))
  const c = draftCounts(state, isExp)

  // picks that left the free list (paired elsewhere, excluded in the sheet) drop out
  const freeByEmail = React.useMemo(() => new Map(free.map((m) => [lc(m.email), m])), [free])
  React.useEffect(() => {
    setPicked((p) => (p.every((e) => freeByEmail.has(e)) ? p : p.filter((e) => freeByEmail.has(e))))
  }, [freeByEmail])
  const pickedMembers = picked.map((e) => freeByEmail.get(e)).filter(Boolean) as TeamMember[]

  const s = q.trim().toLowerCase()
  const shown = free.filter((m) => !s || `${m.name} ${m.email} ${m.pairAs}`.toLowerCase().includes(s))
  const known = new Set(SIDES.map((x) => x.key))
  const groups = [...SIDES, { key: "?", label: "Other", dot: "bg-muted-foreground" }]
    .map((g) => ({ ...g, list: shown.filter((m) => (g.key === "?" ? !known.has(m.pairAs) : m.pairAs === g.key)) }))
    .filter((g) => g.list.length)

  const pick = (email: string) => {
    const e = lc(email)
    setPicked((p) => (p.includes(e) ? p.filter((x) => x !== e) : p.length < 2 ? [...p, e] : [p[0], e]))
  }
  const toggle = async (m: TeamMember) => {
    const e = lc(m.email), next = !isExp(m.email)
    setOverrides((o) => ({ ...o, [e]: next }))
    await teamSet(m.email, next)
    setOverrides((o) => {
      const n = { ...o }
      delete n[e] // the fresh state has the real value now (or the old one, if it failed)
      return n
    })
  }
  const pair = async () => {
    const [a, b] = pickedMembers
    if (!a || !b) return
    setPending([a, b])
    setPicked([])
    await draftPair(a.email, b.email)
    setPending(null)
  }
  const remove = async (b: Binome) => {
    setRemoving(b.code)
    await draftUnpair(b.code, b.people[0]?.email || "")
    setRemoving(null)
  }
  const draw = async (all: boolean) => {
    setDrawing(all ? "all" : "rest")
    setPicked([])
    if (all) await redrawAll(c.drafts, c.byHand)
    else await drawRest()
    setDrawing(null)
  }
  const pct = c.pool ? Math.round((c.paired * 100) / c.pool) : 0

  return (
    <Card ref={ref} id="pairing" className="scroll-mt-20 gap-5">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <UsersRound className="size-5 text-primary" aria-hidden="true" /> Pairing
              <Badge variant="outline" className="font-semibold">
                <Lock aria-hidden="true" /> before Lock
              </Badge>
            </CardTitle>
            <CardDescription className="max-w-prose">
              Pick two members to pair them, or let the draw pair everyone still free: new members get an experienced partner when
              there are enough. Drafts are scratch: nothing is shared or emailed until you lock them.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy || !c.pool} onClick={() => draw(true)}>
              {drawing === "all" ? <Spinner /> : <RotateCcw />} Redraw all
            </Button>
            <Button size="sm" disabled={busy || !c.free} onClick={() => draw(false)}>
              {drawing === "rest" ? <Spinner /> : <Shuffle />} Draw the rest
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 pt-2 sm:grid-cols-4 sm:gap-x-0 sm:divide-x">
          <Stat label="Free" value={c.free} note={`of ${c.pool} interviewers`} />
          <Stat label="Draft pairs" value={c.drafts} note={c.byHand ? `${c.byHand} made by hand` : c.drafts ? "all drawn" : "none yet"} />
          <Stat
            label="No experienced member"
            value={c.without}
            warn={c.without > 0}
            note={c.drafts ? (c.without ? "pairs of new members only" : "every pair has one") : "counted once paired"}
          />
          <Stat label="Experienced" value={c.experienced} note={`for ${c.pool - c.experienced} new`} />
        </dl>
        <div className="space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of interviewers paired">
            <div className="h-full rounded-full bg-vic-ring transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
          <p className="num text-xs text-muted-foreground">
            {c.paired} of {c.pool} paired · {pct}%
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* free members */}
          <section aria-labelledby="free-title" className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="free-title" className="flex items-center gap-2 font-bold">
                Free members <Badge variant="secondary" className="num">{free.length}</Badge>
              </h3>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a member" aria-label="Find a free member" className="h-9 rounded-full pl-9" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-4" />
                </button>
              )}
            </div>

            {free.length > 0 && <PairTray picked={pickedMembers} isExp={isExp} busy={busy} onUnpick={pick} onPair={pair} />}
            {free.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 bg-accent/40 px-6 py-8 text-center">
                <CircleCheckBig className="size-7 text-success" aria-hidden="true" />
                <p className="font-bold">{c.pool ? "Everyone has a pair" : "No team yet"}</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {c.pool ? "Check the pairs, then lock them from the launch sequence." : "Import the team from the launch sequence first."}
                </p>
                <Button asChild variant="secondary" size="sm" className="mt-1">
                  <Link to="/">{c.pool ? "Go to Lock" : "Go to Import"}</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-4 lg:max-h-[34rem] lg:overflow-y-auto lg:pr-1">
                {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nobody free matches “{q}”.</p>}
                {groups.map((g) => {
                  const n = g.list.filter((m) => isExp(m.email)).length
                  return (
                    <div key={g.key}>
                      <p className="flex items-center gap-2 px-2 text-sm font-semibold">
                        <span className={cn("size-2.5 rounded-full", g.dot)} aria-hidden="true" />
                        {g.label}
                        <span className="num font-normal text-muted-foreground">
                          {g.list.length} · {n} experienced
                        </span>
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {g.list.map((m) => {
                          const i = picked.indexOf(lc(m.email))
                          return (
                            <FreeRow
                              key={m.email}
                              m={m}
                              exp={isExp(m.email)}
                              picked={i >= 0}
                              order={i + 1}
                              match={pickedMembers.length === 1 && goodMatch(pickedMembers[0], m, isExp)}
                              disabled={busy}
                              onPick={() => pick(m.email)}
                              onToggle={() => toggle(m)}
                            />
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* draft pairs */}
          <section aria-labelledby="drafts-title" className="min-w-0 lg:border-l lg:pl-8">
            <h3 id="drafts-title" className="flex items-center gap-2 font-bold">
              Draft pairs <Badge variant="secondary" className="num">{drafts.length}</Badge>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              <ExpDot on /> <span className="ml-1 align-middle">experienced</span>
              <span className="ml-3 inline-flex align-middle"><ExpDot on={false} /></span> <span className="ml-1 align-middle">new</span>
              <span className="ml-3 align-middle">Codes close up when a pair is removed.</span>
            </p>
            {drafts.length === 0 && !pending ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/30 px-6 py-8 text-center">
                <UsersRound className="size-7 text-primary" aria-hidden="true" />
                <p className="font-bold">No pairs yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">Pick two members on the left, or press Draw the rest to pair everyone at random.</p>
              </div>
            ) : (
              <ul className="mt-2 divide-y lg:max-h-[38rem] lg:overflow-y-auto lg:pr-1">
                {drafts.map((b) => (
                  <DraftRow key={b.code + b.people.map((p) => p.email).join()} b={b} isExp={isExp} removing={removing === b.code} disabled={busy} onRemove={() => remove(b)} />
                ))}
                {pending && <PendingRow people={pending} isExp={isExp} />}
              </ul>
            )}
          </section>
        </div>
      </CardContent>
    </Card>
  )
}
