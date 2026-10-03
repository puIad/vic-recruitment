import * as React from "react"
import { toast } from "sonner"
import { useConfirm } from "./confirm"
import { useVic } from "./store"
import { signInUrl } from "./api"
import type {
  Alert,
  ChangeCheck,
  ChangePlan,
  Cover,
  CoverCheck,
  FixMode,
  ImportConfirm,
  LockCheck,
  Person,
} from "./types"

/** The old dashboard's ACTIONS table, carried over one for one: same script actions, same previews, same confirmations. */

export const FIX_META: Record<FixMode, { label: string; hint: string }> = {
  apply: { label: "Apply properly", hint: "Do this change with the proper tool (Change members / Move interviewee): sheets, sharing and history follow" },
  revert: { label: "Revert", hint: "Put back the value the script had written" },
  accept: { label: "Accept as is", hint: "Keep the change as it is now and stop flagging it" },
}

export interface MemberChangeArgs {
  binome: string
  outEmail: string
  inEmail: string
  inName: string
  reason: string
}
export interface SwapArgs {
  binomeA: string
  emailA: string
  binomeB: string
  emailB: string
  reason: string
}
export interface CoverArgs {
  codes: string
  inEmail: string
  inName: string
  outEmail: string
  reason: string
}

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-bold">{children}</span>

function ChangeSummary({ p }: { p: ChangePlan }) {
  return (
    <li>
      <Mono>{p.binome}</Mono> ·{" "}
      {p.out ? <span className="text-muted-foreground line-through">{p.out.name || p.out.email}</span> : <i className="text-muted-foreground">empty seat</i>} →{" "}
      {p.inn ? <b>{p.inn.name}</b> : <i className="text-muted-foreground">nobody</i>}
    </li>
  )
}

function Warnings({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <div className="mt-3 rounded-xl bg-warning-soft p-3 text-warning">
      <b>Check before applying</b>
      <ul className="mt-1">
        {list.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

export function useActions() {
  const confirm = useConfirm()
  const run = useVic((s) => s.run)
  const refresh = useVic((s) => s.refresh)
  const dropAlerts = useVic((s) => s.dropAlerts)

  return React.useMemo(() => {
    // Long actions must not outlive the 48 h sign-in: offer to sign in again first.
    async function sessionOk() {
      const ends = useVic.getState().sessionEnds
      const left = ends - Date.now()
      if (!ends || left > 6 * 60e3) return true
      const again = await confirm({
        title: "Your sign-in ends soon",
        body: (
          <>
            <p>
              Your 48-hour sign-in ends in <b>{Math.max(0, Math.round(left / 60e3))} min</b>, possibly before this finishes. Sign in again now?
            </p>
            <p className="text-muted-foreground">Cancel runs it anyway.</p>
          </>
        ),
        okLabel: "Sign in again",
      })
      if (again) {
        window.location.href = signInUrl
        return false
      }
      return true
    }

    async function go<R>(action: string, args: Record<string, unknown>, label: string, longRunning = false) {
      if (longRunning && !(await sessionOk())) return null
      return run<R>(action, args, label)
    }
    const after = () => refresh(true)

    const A = {
      async sync() {
        await go("sync", {}, "Sync", true)
        after()
      },

      async importTeam(link: string) {
        const out = await go<ImportConfirm | null>("importTeam", { link }, "Import team")
        if (out && out.result && out.result.confirm) {
          const r = out.result
          const ok = await confirm({
            title: "Replace the Team tab?",
            body: (
              <>
                <p>
                  The Team tab already has <b>{r.existing}</b> members. Replace them with <b>{r.incoming}</b> members from “{r.source}”?
                </p>
                <p>Pair As / Exclude edits you made in the Team tab will be lost.</p>
              </>
            ),
            okLabel: "Replace team",
            danger: true,
          })
          if (ok) await go("importTeam", { link, replace: true }, "Import team")
        }
        after()
      },

      async draft(drafts: number) {
        if (drafts) {
          const ok = await confirm({
            title: "Redraw the binomes?",
            body: (
              <p>
                The <b>{drafts}</b> current DRAFT binomes (and any edits you made to them) are replaced by a new random draw. Locked binomes are kept.
              </p>
            ),
            okLabel: "Redraw",
          })
          if (!ok) return
        }
        await go("draft", {}, "Draft binomes")
        after()
      },

      async lock() {
        const out = await go<LockCheck>("lockCheck", {}, "Lock check")
        if (!out || !out.result) return
        const c = out.result
        if (!c.drafts) {
          toast("No draft binomes to lock", { description: "Run “Draft binomes” first." })
          return
        }
        const ok = await confirm({
          title: `Lock ${c.drafts} binomes?`,
          body: (
            <>
              <p>
                This creates one sheet per binome in “Binome Sheets”
                {c.share ? (
                  <>
                    , <b>shares it with both members</b> (they get a Google share email)
                  </>
                ) : null}{" "}
                and starts routing registrants to them.
              </p>
              {c.problems.length > 0 && (
                <>
                  <p>
                    <b>Problems found:</b>
                  </p>
                  <ul>
                    {c.problems.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                  <p>Continue anyway?</p>
                </>
              )}
              <p className="text-muted-foreground">Takes up to ~5 minutes for 50 binomes. If it stops early, press Lock again to finish the rest.</p>
            </>
          ),
          okLabel: `Lock ${c.drafts} binomes`,
          danger: true,
        })
        if (ok) await go("lock", { budgetMs: 200000 }, "Lock binomes", true) // ends before Vercel's 300 s limit
        after()
      },

      async resolve(ids: string[]) {
        if (!ids.length) return false
        const out = await go("resolve", { ids }, "Resolve alerts")
        if (out) dropAlerts(ids)
        after()
        return !!out
      },

      async editAccept(ids: string[]) {
        if (!ids.length) return false
        const ok = await confirm({
          title: `Accept ${ids.length} manual edit${ids.length > 1 ? "s" : ""}?`,
          body: (
            <p>
              The Master keeps these changes as they are now; the script stops flagging them. Nothing else is changed (an interviewee whose row was deleted is also removed from their binome sheet).
            </p>
          ),
          okLabel: "Accept",
        })
        if (!ok) return false
        const out = await go<unknown>("editAccept", { ids }, "Accept edits")
        if (out && out.result) dropAlerts(ids) // result is null when the script lock was busy: nothing was accepted
        after()
        return !!(out && out.result)
      },

      async fixOne(a: Alert, mode: FixMode) {
        if (mode !== "accept") {
          const ok = await confirm({
            title: mode === "apply" ? "Apply this change properly?" : "Revert this change?",
            body: (
              <>
                <p className="text-muted-foreground">{a.msg}</p>
                {mode === "apply" ? (
                  <p>Runs the matching tool with the new values: binome sheets, sharing, the Member Changes history and the emails follow, as if it had been done from the dashboard.</p>
                ) : (
                  <p>Writes back the value the script had before the hand edit.</p>
                )}
              </>
            ),
            okLabel: FIX_META[mode].label,
          })
          if (!ok) return
        }
        const out = await go<unknown>("edit" + mode.charAt(0).toUpperCase() + mode.slice(1), { ids: [a.id] }, `${FIX_META[mode].label} ${a.id}`)
        if (out && out.result) dropAlerts([a.id]) // null result = script busy, nothing changed
        after()
      },

      async reassign(code: string, name: string, from: string, binome: string) {
        const ok = await confirm({
          title: `Move ${code}?`,
          body: (
            <p>
              <b>{name || code}</b> moves from <Mono>{from || "nobody"}</Mono> to <Mono>{binome}</Mono>. The new binome is emailed if new-interviewee emails are on.
            </p>
          ),
          okLabel: "Move",
        })
        if (!ok) return false
        const out = await go("reassign", { code, binome }, `Move ${code}`)
        after()
        return !!out
      },

      async changeMember(args: MemberChangeArgs, hint: string) {
        const check = await go<ChangeCheck>("changeMember", { dryRun: true, ...args }, "Check change")
        if (!check || !check.result || check.result.errors.length) return false // the errors were shown as a toast
        const r = check.result
        const plans: ChangePlan[] = [{ binome: r.binome || args.binome, out: (r.out as Person | null) ?? null, inn: (r.inn as ChangePlan["inn"]) ?? null }]
        const ok = await confirm({
          title: `Change ${r.binome}?`,
          body: (
            <>
              <ul>{plans.map((p, i) => <ChangeSummary key={i} p={p} />)}</ul>
              <Warnings list={r.warnings} />
              <p className="mt-3 text-muted-foreground">{hint} Logged in the Member Changes tab.</p>
            </>
          ),
          okLabel: "Apply",
        })
        if (!ok) return false
        const out = await go<ChangeCheck>("changeMember", { ...args }, `Change ${r.binome}`)
        after()
        return !!(out && out.result && out.result.done)
      },

      async swapMembers(args: SwapArgs, hint: string) {
        const check = await go<ChangeCheck>("swapMembers", { dryRun: true, ...args }, "Check change")
        if (!check || !check.result || check.result.errors.length) return false
        const r = check.result
        const ok = await confirm({
          title: "Swap these members?",
          body: (
            <>
              <ul>{(r.plans || []).map((p, i) => <ChangeSummary key={i} p={p} />)}</ul>
              <Warnings list={r.warnings} />
              <p className="mt-3 text-muted-foreground">{hint} Logged in the Member Changes tab.</p>
            </>
          ),
          okLabel: "Swap",
        })
        if (!ok) return false
        const out = await go<ChangeCheck>("swapMembers", { ...args }, "Swap members")
        after()
        return !!(out && out.result && out.result.done)
      },

      async addCover(args: CoverArgs, hint: string) {
        const check = await go<CoverCheck>("addCover", { dryRun: true, ...args }, "Check cover")
        if (!check || !check.result || check.result.errors.length) return false
        const r = check.result
        const ok = await confirm({
          title: "Start this cover?",
          body: (
            <>
              <ul>
                {r.groups.map((g, i) => (
                  <li key={i}>
                    <b>{r.inn.name}</b> covers <Mono>{g.codes.join(", ")}</Mono> for <Mono>{g.binome}</Mono>
                    {g.out ? <span className="text-muted-foreground"> instead of {g.out.name}</span> : null}
                  </li>
                ))}
              </ul>
              <Warnings list={r.warnings} />
              <p className="mt-3 text-muted-foreground">{hint}</p>
            </>
          ),
          okLabel: "Start cover",
        })
        if (!ok) return false
        const out = await go<CoverCheck>("addCover", { ...args }, "Cover")
        after()
        return !!(out && out.result && out.result.done)
      },

      async endCover(c: Cover, sharing: boolean) {
        const ok = await confirm({
          title: "End this cover?",
          body: (
            <p>
              <b>{c.name}</b> stops covering <Mono>{c.codes.join(", ")}</Mono> for <Mono>{c.binome}</Mono>
              {sharing ? " and loses view access to its sheet" : ""}.
            </p>
          ),
          okLabel: "End cover",
        })
        if (!ok) return false
        const out = await go("endCover", { row: c.row }, "End cover")
        after()
        return !!out
      },

      async digest() {
        await go("digest", {}, "Digest")
        after()
      },
      async integrity() {
        await go("integrity", { budgetMs: 200000 }, "Check integrity", true) // ends before the 300 s limit; the next run carries on
        after()
      },
      async reshare() {
        const ok = await confirm({
          title: "Re-share binome sheets?",
          body: <p>Every current member who is not yet an editor of their binome sheet is added (Google emails them).</p>,
          okLabel: "Re-share",
        })
        if (ok) await go("reshare", {}, "Re-share")
        after()
      },
      async setup() {
        const ok = await confirm({
          title: "Run setup again?",
          body: <p>Safe to repeat: re-creates missing tabs and settings, re-checks the form links and reinstalls the triggers.</p>,
          okLabel: "Run setup",
        })
        if (ok) await go("setup", {}, "Setup")
        after()
      },
      async saveSettings(values: Record<string, unknown>) {
        const out = await go("saveSettings", { values }, "Save settings")
        after()
        return !!out
      },
    }
    return A
  }, [confirm, run, refresh, dropAlerts])
}
