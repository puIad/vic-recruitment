import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "./confirm"
import { useVic } from "./store"
import { acceptAlerts, acceptFix } from "./pending"
import type { Alert, MailDraft, QuickOut, RepairKind } from "./types"

/**
 * Quick actions on alerts: one script action, webRun('quick', {op, ids, …}) (QuickFix.gs). Writes that move a candidate,
 * delete rows, change Drive access or send email preview and confirm first; value fixes and links run at once.
 */

export type MailTo = "binome" | "candidate" | "submitter"
export type SnoozeFor = "4h" | "24h" | "3d" | "interview"
export type LocateTarget = "form" | "iv" | "log" | "team" | "binomes" | "cell"

// ops after which the alerts they acted on leave the open list
const LEAVES = new Set(["edit", "setCell", "exclude", "pickCandidate", "keepForm", "dupNew", "dupSeparate", "repair", "snooze", "mute", "approve", "decline"])

export const REPAIR_LABEL: Record<Exclude<RepairKind, "">, string> = {
  rename: "Rename the sheet",
  reorder: "Move our tab back first",
  protect: "Protect the tab again",
  dedupe: "Delete the duplicate row",
  remove: "Remove the row",
  putback: "Put the rows back",
  reshare: "Re-share this sheet",
  unshare: "Remove their access",
  retry: "Retry now",
}
// repairs that delete, share or take access away: their dry run is shown and confirmed first
const RISKY: RepairKind[] = ["dedupe", "remove", "unshare", "reshare"]

export const repairOf = (a: Alert): RepairKind => (a.q && (a.q.kind === "integ" || a.q.kind === "file") ? a.q.repair : "")

/** what snooze / mute / unmute return when they went down the pending path (nothing ran on the script yet) */
const pending = (ids: string[]): QuickOut => ({ lines: [], done: ids })

const noId = (l: string) => l.replace(/^A-\d+: /, "").replace(/^./, (c) => c.toUpperCase())

/** Editable preview of the emails about to go out. Edits go to `onEdit`. */
function MailEditor({ drafts, testMode, onEdit }: { drafts: MailDraft[]; testMode: boolean; onEdit: (i: number, k: "subject" | "body", v: string) => void }) {
  return (
    <div className="space-y-4">
      {testMode && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-warning">
          <b>Test mode is on:</b> only admins really receive these emails.
        </p>
      )}
      {drafts.map((d, i) => (
        <div key={d.group} className="space-y-2 rounded-2xl border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            To <b className="text-foreground">{d.to}</b>
            {d.ids.length > 1 && <span> · covers {d.ids.length} alerts</span>}
          </p>
          <Input aria-label={`Subject of the email to ${d.to}`} defaultValue={d.subject} onChange={(e) => onEdit(i, "subject", e.target.value)} className="bg-background font-semibold" />
          <Textarea
            aria-label={`Text of the email to ${d.to}`}
            defaultValue={d.body}
            rows={Math.min(16, d.body.split("\n").length + 1)}
            onChange={(e) => onEdit(i, "body", e.target.value)}
            className="bg-background leading-relaxed"
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Sent as plain text from “VIC Recruitment Bot”. Your edits apply to this email only; the alert stays open until the problem is fixed.</p>
    </div>
  )
}

export function useQuick() {
  const confirm = useConfirm()
  const run = useVic((s) => s.run)
  const refresh = useVic((s) => s.refresh)
  const dropAlerts = useVic((s) => s.dropAlerts)

  return React.useMemo(() => {
    async function q(op: string, ids: string[], args: Record<string, unknown> = {}, label = "Quick fix") {
      const out = await run<QuickOut>("quick", { op, ids, ...args }, label)
      const res = out?.result ?? null
      if (args.dryRun) return res
      if (res && LEAVES.has(op)) dropAlerts(res.done)
      refresh(true)
      return res
    }
    const name = (a: Alert) => (a.q?.kind === "reg" ? `${a.q.iv.first} ${a.q.iv.family}`.trim() : "") || a.code || a.binome

    const Q = {
      /** Opens the exact row or cell in a new tab. The tab opens on the click itself, so no popup blocker stops it. */
      async locate(a: Alert, target: LocateTarget) {
        const w = window.open("about:blank", "_blank")
        const out = await run<{ url: string }>("quick", { op: "locate", ids: [a.id], target }, "Open")
        const url = out?.result?.url
        if (url && w) {
          w.opener = null
          w.location.href = url
        } else {
          w?.close()
          if (url) window.open(url, "_blank", "noopener")
        }
      },

      async mail(ids: string[], to: MailTo) {
        const out = await run<{ drafts: MailDraft[]; testMode: boolean }>("quick", { op: "draft", ids, to }, "Prepare email")
        const d = out?.result
        if (!d) return false
        const drafts = d.drafts.map((x) => ({ ...x }))
        const n = drafts.length
        const ok = await confirm({
          title: to === "binome" ? (n > 1 ? `Email ${n} binomes` : `Email ${drafts[0].group}`) : to === "candidate" ? "Email the candidate" : "Ask for the form again",
          wide: true,
          body: <MailEditor drafts={drafts} testMode={d.testMode} onEdit={(i, k, v) => (drafts[i][k] = v)} />,
          okLabel: n > 1 ? `Send ${n} emails` : "Send email",
        })
        if (!ok) return false
        const sent = await run("quick", { op: "send", ids, to, drafts: drafts.map((x) => ({ group: x.group, subject: x.subject, body: x.body })) }, "Send email")
        refresh(true)
        return !!sent
      },

      // pending changes first when the owner's switch is on; otherwise (or if the accept step fails) today's direct write
      snooze: async (ids: string[], dur: SnoozeFor) => ((await acceptAlerts(ids, "snooze", dur)) ? pending(ids) : q("snooze", ids, { for: dur }, "Snooze")),
      mute: async (ids: string[]) => ((await acceptAlerts(ids, "mute")) ? pending(ids) : q("mute", ids, {}, "Mute")),
      unmute: async (ids: string[]) => ((await acceptAlerts(ids, "unmute")) ? pending(ids) : q("unmute", ids, {}, "Unmute")),

      /** values: Interviewees fields. assigns = this places an unassigned candidate in a binome (it gets emailed). */
      async edit(a: Alert, values: Record<string, string>, assigns = false) {
        if (assigns) {
          const ok = await confirm({
            title: `Place ${name(a)} now?`,
            body: (
              <p>
                Their 1st choice becomes <b>{values["1st Choice"]}</b> and the routing gives them a code and a binome that takes it, as for any new registration. The binome is emailed if new-interviewee emails are on.
              </p>
            ),
            okLabel: "Save and place",
          })
          if (!ok) return null
        }
        return q("edit", [a.id], { values }, `Fix ${name(a)}`)
      },
      setCell: async (a: Alert, args: { contacted?: string; date?: string; time?: string }) => ((await acceptFix(a, args)) ? pending([a.id]) : q("setCell", [a.id], args, `Fix ${a.code}`)),
      exclude: (a: Alert) => q("exclude", [a.id], {}, "Exclude"),
      pickCandidate: (a: Alert, code: string) => q("pickCandidate", [a.id], { code }, `Link the form to ${code}`),

      async keepForm(a: Alert, which: "first" | "latest") {
        const ok = await confirm({
          title: `Keep the ${which} form?`,
          body: (
            <p>
              The {which === "first" ? "latest" : "first"} form of <b>{a.code}</b> is marked <b>IGNORED</b> in the Interview Log; its answers stay there but no longer count.
              {which === "latest" && " The binome sheet shows the time of the latest form."}
            </p>
          ),
          okLabel: `Keep the ${which}`,
        })
        return ok ? q("keepForm", [a.id], { which }, "Keep form") : null
      },

      async dupNew(a: Alert, earlier: string) {
        const ok = await confirm({
          title: "Use the new answers?",
          body: (
            <p>
              The answers of the second registration replace those of <b>{earlier}</b>, in the Master and in their binome sheet. Their code, binome and everything the binome wrote stay as they are.
            </p>
          ),
          okLabel: "Use the new answers",
        })
        return ok ? q("dupNew", [a.id], {}, "Use new answers") : null
      },

      async dupSeparate(a: Alert) {
        const ok = await confirm({
          title: "Treat as a different person?",
          body: <p>The second registration gets a code of its own and is placed in a binome, which is emailed if new-interviewee emails are on. Only do this if these are two different people.</p>,
          okLabel: "Make them a candidate",
        })
        return ok ? q("dupSeparate", [a.id], {}, "Different person") : null
      },

      /** Screening: send held applications to a binome. The binomes and the applicants are emailed, as for any new registration. */
      async approve(alerts: Alert[]) {
        const n = alerts.length
        const ok = await confirm({
          title: n > 1 ? `Approve ${n} applications?` : `Approve ${name(alerts[0])}?`,
          body: (
            <p>
              They are placed in a binome right away, as for any new registration. The binome is emailed if new-interviewee emails are on, and
              the applicant gets their confirmation if confirmation emails are on. Screening never holds {n > 1 ? "them" : "this application"} again.
            </p>
          ),
          okLabel: n > 1 ? `Approve ${n}` : "Approve",
        })
        return ok ? q("approve", alerts.map((a) => a.id), {}, n > 1 ? `Approve ${n}` : `Approve ${name(alerts[0])}`) : null
      },

      /** Screening: keep held applications (or VIC members already with a binome) out. Nobody is emailed now. */
      async decline(alerts: Alert[]) {
        const n = alerts.length
        const members = alerts.every((a) => a.type === "VIC_MEMBER")
        const placed = alerts.filter((a) => a.binome)
        const ok = await confirm({
          title: n > 1 ? `Decline ${n} applications?` : `Decline ${name(alerts[0])}?`,
          danger: true,
          body: (
            <>
              {placed.length > 0 && (
                <p>
                  {placed.length > 1 ? `${placed.length} of them are` : "They are"} taken out of {[...new Set(placed.map((a) => a.binome))].join(", ")}'s sheet, with whatever the
                  binome wrote about them.
                </p>
              )}
              <p>
                Nobody is emailed now.{" "}
                {members
                  ? "As VIC members, they never get the rejection email."
                  : "Declined applicants get one polite email when an admin presses Maintenance › Send rejections… after recruitment closes."}
              </p>
              <p className="text-muted-foreground">Interviewees › Declined › Restore brings an application back.</p>
            </>
          ),
          okLabel: n > 1 ? `Decline ${n}` : "Decline",
        })
        return ok ? q("decline", alerts.map((a) => a.id), {}, n > 1 ? `Decline ${n}` : `Decline ${name(alerts[0])}`) : null
      },

      /** Sheet repairs and retries, one or many. Deleting, sharing or unsharing shows the script's dry run first. */
      async repair(alerts: Alert[]) {
        const ids = alerts.map((a) => a.id)
        const kinds = alerts.map(repairOf)
        const sharing = !!useVic.getState().state?.settings.shareFiles
        if (kinds.some((k) => RISKY.includes(k)) || (sharing && kinds.includes("retry"))) {
          const pre = await q("repair", ids, { dryRun: true }, "Check repair")
          if (!pre) return null
          const ok = await confirm({
            title: alerts.length > 1 ? `Repair ${alerts.length} alerts?` : "Repair this?",
            body: (
              <>
                <p>The script will:</p>
                <ul>{pre.lines.map((l, i) => <li key={i}>{alerts.length > 1 ? l : noId(l)}</li>)}</ul>
              </>
            ),
            okLabel: "Repair",
            danger: kinds.some((k) => k === "remove" || k === "dedupe" || k === "unshare"),
          })
          if (!ok) return null
        }
        return q("repair", ids, {}, alerts.length > 1 ? `Repair ${alerts.length} alerts` : "Repair")
      },
    }
    return Q
  }, [confirm, run, refresh, dropAlerts])
}
