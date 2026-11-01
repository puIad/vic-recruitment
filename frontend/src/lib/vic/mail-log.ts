import { call } from "@/lib/vic/api"
import type { RunOut } from "@/lib/vic/types"

/** One line of the Mail Log (webRun mailLog / mailResendPreview). Google reports nothing about delivery: Sent means it accepted the mail. */
export interface MailRow {
  id: string
  /** ms */
  at: number
  when: string
  kind: string
  to: string
  concerns: string
  by: string
  outcome: "Sent" | "Held" | "Failed" | "Resent" | "Dismissed" | string
  error: string
  subject: string
}

export interface MailLogOut {
  rows: MailRow[]
  /** marks from before the log: "queued", "sent", "told" */
  older: { label: string; text: string; date: string }[]
  /** an alert older than the log: who it was meant to reach (Emailed To) */
  intended: string
  /** a binome's newest mail */
  last: { when: string; kind: string; outcome: string } | null
  /** when the log starts */
  since: string
  testMode: boolean
}

export interface ResendMail extends MailRow {
  /** why it can't be resent any more, or "" */
  stale: string
  /** a drop mail: the next cycle retries it */
  retrying: boolean
}

export interface ResendOut {
  sent: number
  failed: number
  held: number
  dismissed: number
  lines: string[]
}

export type MailScope = { code: string } | { binome: string } | { alertId: string }

export const readMailLog = (scope: MailScope) => call<RunOut<MailLogOut>>("webRun", ["mailLog", scope]).then((o) => o.result)
export const readResendPreview = () => call<RunOut<{ mails: ResendMail[]; testMode: boolean }>>("webRun", ["mailResendPreview", {}]).then((o) => o.result)

const KIND: Record<string, string> = {
  CONFIRM: "Registration confirmation",
  NEW_IV: "New interviewees",
  ALERT: "Alert",
  DROP: "Changes not applied",
  PAIRED: "New binome",
  JOINED: "Joined a binome",
  LEFT: "Left a binome",
  EMAIL_FIXED: "Email address corrected",
  COVER: "You cover",
  COVERED: "Someone covers for you",
  BINOME_PAUSED: "Binome paused",
  BINOME_RESUMED: "Binome resumed",
  INTERVIEW_CLOSED: "Interview phase closed",
  INTERVIEW_REOPENED: "Interview phase reopened",
  REJECT: "Rejection",
  QUICKFIX: "Quick-fix email",
  QUICKFIX_CAND: "Quick-fix email",
  DIGEST: "Daily digest",
  TEST: "Test mail",
  WATCHDOG: "Sync watchdog",
}
export const mailKind = (k: string) => KIND[k] ?? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, " ")
