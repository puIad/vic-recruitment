import * as React from "react"
import { toast } from "sonner"
import { useConfirm } from "./confirm"
import { useVic } from "./store"
import { acceptAlerts } from "./pending"
import { signInUrl } from "./api"
import { MemberName, MemberNames } from "@/components/member-name"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type {
  Alert,
  ChangeCheck,
  DraftPairOut,
  ChangePlan,
  Cover,
  CoverCheck,
  FixMode,
  ImportConfirm,
  LockCheck,
  NewBinomeCheck,
  Person,
  RejectionsPreview,
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
export interface NewBinomeArgs {
  emailA: string
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

/** The rejection email before it goes: who gets it, and its text (edits go to `onEdit`). */
function RejectionEditor({ p, draft, onEdit }: { p: RejectionsPreview; draft: { subject: string; body: string }; onEdit: (k: "subject" | "body", v: string) => void }) {
  return (
    <div className="space-y-4">
      {p.testMode && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
          <b>Test mode is on:</b> one copy goes to you, nobody else is emailed and nothing is marked as sent.
        </p>
      )}
      <p>
        <b className="num">{p.count}</b> applicant{p.count === 1 ? "" : "s"} declined at screening and not emailed yet
        {p.sample.length > 0 && (
          <span className="text-muted-foreground">
            {": "}
            {p.sample.join(", ")}
            {p.count > p.sample.length ? `, and ${p.count - p.sample.length} more` : ""}
          </span>
        )}
        . VIC members are never in this list.
      </p>
      <div className="space-y-2 rounded-2xl border bg-muted/40 p-3">
        <Input aria-label="Subject of the rejection email" defaultValue={draft.subject} onChange={(e) => onEdit("subject", e.target.value)} className="bg-background font-semibold" />
        <Textarea
          aria-label="Text of the rejection email"
          defaultValue={draft.body}
          rows={Math.min(14, draft.body.split("\n").length + 2)}
          onChange={(e) => onEdit("body", e.target.value)}
          className="bg-background leading-relaxed"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <b>{"{first}"}</b> becomes each applicant's first name. Sent from your account as “VIC Recruitment Bot”, one email each, and marked in the Screening column so pressing Send again only reaches those not
        emailed yet.
      </p>
    </div>
  )
}

/** The script checks this phrase too; keep both in step (Team.gs RESET_PHRASE). */
const RESET_PHRASE = "I confirm to reset the binomes"

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-bold">{children}</span>

function ChangeSummary({ p }: { p: ChangePlan }) {
  return (
    <li>
      <Mono>{p.binome}</Mono> ·{" "}
      {p.out ? <span className="text-muted-foreground line-through"><MemberName name={p.out.name || p.out.email} /></span> : <i className="text-muted-foreground">empty seat</i>} →{" "}
      {p.inn ? <b><MemberName name={p.inn.name} /></b> : <i className="text-muted-foreground">nobody</i>}
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

      // Pairing panel (before Lock). Pair, remove and the Experienced toggle don't ask: drafts are scratch, Lock previews.
      // They wait for the fresh state, so the panel can drop its pending marks the moment the real rows arrive.
      async draftPair(emailA: string, emailB: string) {
        const out = await go<DraftPairOut>("draftPair", { emailA, emailB }, "Pair")
        await refresh(true)
        return out ? out.result : null
      },
      async draftUnpair(binome: string, email: string) {
        const out = await go("draftUnpair", { binome, email }, `Remove ${binome}`)
        await refresh(true)
        return !!out
      },
      async teamSet(email: string, experienced: boolean) {
        const out = await go("teamSet", { email, experienced }, experienced ? "Mark experienced" : "Mark new")
        await refresh(true)
        return !!out
      },
      /** Draw the rest: the free members only; every draft there is stays. */
      async drawRest() {
        await go("draft", { keep: true }, "Draw the rest")
        await refresh(true)
      },
      /** Redraw all: every draft goes and everyone is drawn again. Asks only when pairs made by hand would be lost. */
      async redrawAll(drafts: number, byHand: number) {
        if (byHand) {
          const ok = await confirm({
            title: "Redraw all the pairs?",
            body: (
              <>
                <p>
                  The <b>{byHand}</b> pair{byHand > 1 ? "s" : ""} you made by hand {drafts > byHand ? <>and the <b>{drafts - byHand}</b> drawn ones </> : null}
                  go, and everyone is drawn again at random.
                </p>
                <p className="text-muted-foreground">To keep your pairs, use Draw the rest instead: it only pairs the members still free.</p>
              </>
            ),
            okLabel: "Redraw all",
            danger: true,
          })
          if (!ok) return
        }
        await go("draft", {}, "Redraw all")
        await refresh(true)
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
        if (await acceptAlerts(ids, "resolve")) return true // a pending change: the rows show it, no wait
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

      async newBinome(args: NewBinomeArgs, hint: string) {
        const check = await go<NewBinomeCheck>("newBinome", { dryRun: true, ...args }, "Check new binome")
        if (!check || !check.result || check.result.errors.length) return false
        const r = check.result
        const ok = await confirm({
          title: `Create ${r.binome}?`,
          body: (
            <>
              <p>
                <b><MemberNames names={r.members.map((m) => m.name)} /></b> become binome <Mono>{r.binome}</Mono>, tagged <Mono>{r.tag}</Mono>: it receives {r.tag === "ALL" ? "interviewees of every department" : `${r.tag.replace(" & ", " and ")} interviewees`} from now on.
              </p>
              <Warnings list={r.warnings} />
              <p className="mt-3 text-muted-foreground">{hint} Logged in the Member Changes tab.</p>
            </>
          ),
          okLabel: "Create",
        })
        if (!ok) return false
        const out = await go<NewBinomeCheck>("newBinome", { ...args }, `Create ${r.binome}`)
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
                    <b><MemberName name={r.inn.name} /></b> covers <Mono>{g.codes.join(", ")}</Mono> for <Mono>{g.binome}</Mono>
                    {g.out ? <span className="text-muted-foreground"> instead of <MemberName name={g.out.name} /></span> : null}
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
              <b><MemberName name={c.name} /></b> stops covering <Mono>{c.codes.join(", ")}</Mono> for <Mono>{c.binome}</Mono>
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
      async resetBinomes(binomes: number, interviewees: number) {
        const ok = await confirm({
          title: "Reset all binomes?",
          danger: true,
          phrase: RESET_PHRASE,
          okLabel: "Reset all binomes",
          body: (
            <>
              <p className="rounded-xl bg-destructive/10 p-3 font-bold text-destructive">
                Warning: this cannot be undone from the dashboard. Do it only to start the whole pairing over with a new team.
              </p>
              <ul>
                <li>
                  <b>{binomes}</b> binomes are removed and their Google Sheets are moved to the "Retired binomes" folder in Drive, so whatever the binomes wrote in them — contacted, dates, notes — is kept there but no longer used.
                </li>
                <li>
                  <b>{interviewees}</b> interviewees go back to Unassigned. Their codes and registration answers stay; their binome, dates and notes are cleared.
                </li>
                <li>The Team tab and the Member Changes history are emptied. Open alerts about the old binomes are closed.</li>
                <li>Afterwards you import the new team, draft and lock again, and waiting interviewees are placed in the new binomes.</li>
              </ul>
            </>
          ),
        })
        if (ok) await go("resetBinomes", { phrase: RESET_PHRASE }, "Reset binomes", true)
        after()
      },
      /** Declined applications back in: each one is placed in a binome as for a new registration. */
      async restore(code: string, name: string) {
        const ok = await confirm({
          title: `Restore ${name || code}?`,
          body: (
            <p>
              <b>{code}</b> is placed in a binome right away and the binome is emailed if new-interviewee emails are on. Screening never holds or declines them again.
            </p>
          ),
          okLabel: "Restore",
        })
        if (!ok) return false
        const out = await go("restore", { codes: [code] }, `Restore ${code}`)
        after()
        return !!out
      },

      /** Settings › Screening: read the VIC members sheet now instead of waiting for the 30-minute refresh. */
      async membersRefresh() {
        const out = await go("membersRefresh", {}, "Read the members sheet")
        after()
        return !!out
      },

      /** Settings › Emails: one mail drawn by the script with sample data from these texts; send also mails it to the caller. */
      async mailPreview(id: string, texts: Record<string, string>, send = false) {
        const out = await go<{ subject: string; html: string; sent: boolean }>("mailPreview", { id, texts, send }, send ? "Send a test mail" : "Preview a mail")
        return out?.result ?? null
      },

      /** Maintenance › Send rejections…: preview who gets it and the text, then send (admins only while test mode is on). */
      async rejections() {
        const pre = await go<RejectionsPreview>("rejections", {}, "Prepare rejections")
        const p = pre?.result
        if (!p) return false
        if (!p.count) {
          await confirm({ title: "Nobody to email", body: <p>No applicant declined at screening is waiting for the rejection email. VIC members never get it.</p>, okLabel: "OK" })
          return false
        }
        const draft = { subject: p.subject, body: p.body }
        const ok = await confirm({
          title: p.testMode ? "Send a test rejection to yourself" : `Email ${p.count} declined applicant${p.count === 1 ? "" : "s"}`,
          wide: true,
          body: <RejectionEditor p={p} draft={draft} onEdit={(k, v) => (draft[k] = v)} />,
          okLabel: p.testMode ? "Send me the test" : `Send ${p.count} email${p.count === 1 ? "" : "s"}`,
          danger: !p.testMode,
        })
        if (!ok) return false
        const out = await go("rejections", { send: true, subject: draft.subject, body: draft.body, budgetMs: 200000 }, "Send rejections", true)
        after()
        return !!out
      },

      async setup() {
        const ok = await confirm({
          title: "Run setup again?",
          body: <p>Safe to repeat: re-creates missing tabs and settings, re-checks the form links and reinstalls the triggers.</p>,
          okLabel: "Run setup",
        })
        const out = ok ? await go("setup", {}, "Setup") : null
        after()
        return !!out
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
