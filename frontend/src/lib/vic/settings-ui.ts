import {
  ArrowUpDown,
  Bell,
  ClipboardList,
  Clock,
  FlaskConical,
  Gauge,
  Mail,
  MailCheck,
  Play,
  RefreshCw,
  Scale,
  Repeat,
  Send,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"
import type { WebState } from "./types"

export const isTrue = (v: unknown) => v === true || /^(true|yes|oui|1|vrai)$/i.test(String(v))

/** How a setting is edited on the page. Without one, the row follows the script's kind (switch, raw dropdown, box). */
export type Control =
  | { type: "switch"; on?: string; off?: string }
  /** a dropdown of CHOICES[key]; custom adds "Custom…" with a number box, else a value outside the list shows as "Custom: N" */
  | { type: "choice"; custom?: { unit: string; min: number; max?: number } }
  | { type: "emails" }
  /** read-only on the page: changed in the Settings tab of the Master */
  | { type: "fixed"; show: (v: string) => string }

export interface SettingUi {
  label: string
  icon: LucideIcon
  /** the dashboard's own help line; the sheet's help column keeps the script's notes */
  help: string
  control?: Control
  /** the owner runs Setup for a new value to take effect (the triggers) */
  setup?: boolean
  /** shown only when this holds */
  show?: (st: WebState) => boolean
}

/** [stored value, label, hint shown under the dropdown]. The values of every key in WebApp.gs SETTING_ENUMS are exactly
 *  the script's (test/vercel.test.js), so a dropdown never writes a value the script refuses. */
export type Choice = [string | number, string, string?]

const HOURS: Choice[] = [
  [6, "6 hours"],
  [12, "12 hours"],
  [24, "1 day"],
  [36, "36 hours"],
  [48, "2 days"],
  [72, "3 days"],
]

export const CHOICES: Record<string, Choice[]> = {
  INSTANT_EMAIL_MIN_SEVERITY: [
    ["HIGH", "High alerts only"],
    ["MEDIUM", "Medium and high alerts"],
    ["INFO", "Every alert, info too"],
  ],
  BALANCE_BY: [
    ["ACTIVE", "Fewest candidates waiting", "Counts the candidates a binome is still working on."],
    ["TOTAL", "Fewest candidates in all", "Counts every candidate a binome holds, finished ones too."],
  ],
  SYNC_EVERY_MINUTES: [
    [1, "Every minute"],
    [5, "Every 5 minutes"],
    [10, "Every 10 minutes"],
    [15, "Every 15 minutes"],
    [30, "Every 30 minutes"],
  ],
  HR_ONLY_WEIGHT: [
    [1, "1×", "The same share as the lightest mixed binome."],
    [1.5, "1.5×", "About one and a half times the lightest mixed binome."],
    [2, "2×", "About twice the lightest mixed binome."],
    [2.5, "2.5×", "About two and a half times the lightest mixed binome."],
    [3, "3×", "About three times the lightest mixed binome."],
    [4, "4×", "About four times the lightest mixed binome."],
  ],
  ALL_BINOME_WEIGHT: [
    [1, "1×", "The same share as the other binomes."],
    [1.5, "1.5×", "About two thirds of the other binomes' share."],
    [2, "2×", "About half the other binomes' share."],
    [3, "3×", "About a third of the other binomes' share."],
  ],
  HOURS_NOT_CONTACTED: HOURS,
  HOURS_NO_INTERVIEW_DATE: HOURS,
  HOURS_AFTER_INTERVIEW_NO_FORM: HOURS,
  DIGEST_HOUR: Array.from({ length: 24 }, (_, h): Choice => [h, String(h).padStart(2, "0") + ":00"]),
  // from Rules.gs screenApplication: an empty answer 60, one word or a non-answer 50, +10 under 10 words in all
  SCREEN_HOLD_AT: [
    [50, "Standard", "Any one weak answer (one word, “idk”, empty) holds it."],
    [60, "Lenient", "An empty answer holds it, or one weak answer in an application under 10 words."],
    [100, "Only clear junk", "Holds it only when both answers are weak."],
  ],
}

const hours = { type: "choice", custom: { unit: "hours", min: 1 } } as const

/** key → how the dashboard shows it. A new setting in SETTINGS_DEFAULTS without a row here still shows, under its key. */
export const SETTING_UI: Record<string, SettingUi> = {
  ADMIN_EMAIL: { label: "Admins who get alert emails", icon: Mail, help: "They get the instant alert emails and the daily digest.", control: { type: "emails" } },
  TEST_MODE: { label: "Test mode", icon: FlaskConical, help: "Mail goes to the admins only and no binome sheet is shared. Keep it on until launch day." },
  TIMEZONE: {
    label: "Timezone",
    icon: Clock,
    help: "Every date and time of the recruitment uses it. Change it in the Settings tab of the Master if you ever need to.",
    control: { type: "fixed", show: (v) => (v === "Africa/Algiers" ? "Algeria (Africa/Algiers)" : v) },
  },
  HOURS_NOT_CONTACTED: { label: "Not contacted yet", icon: Bell, help: "Alert when a binome still hasn't contacted a candidate this long after the candidate was given to them.", control: hours },
  HOURS_NO_INTERVIEW_DATE: { label: "No interview date", icon: Clock, help: "Alert when a candidate still has no interview date this long after being given to a binome.", control: hours },
  HOURS_AFTER_INTERVIEW_NO_FORM: { label: "Interview form missing", icon: ClipboardList, help: "Alert when the interview form still isn't filled in this long after the interview time.", control: hours },
  INSTANT_EMAIL_MIN_SEVERITY: { label: "Email the admins at once for", icon: Bell, help: "Alerts below this level wait for the daily digest.", control: { type: "choice" } },
  NOTIFY_BINOME_ON_ALERT: { label: "Email binomes about their alerts", icon: Send, help: "Also tell the binome when an alert concerns them: a big mistake or a delay." },
  NOTIFY_BINOME_ON_NEW_INTERVIEWEE: { label: "Email binomes about new candidates", icon: UserPlus, help: "Tell the binome each time a candidate is given to them." },
  CONFIRM_REGISTRANTS: { label: "Confirmation email to registrants", icon: MailCheck, help: "Send every new registrant an email with their code. Not sent for a duplicate registration or a declined VIC member." },
  SHARE_FILES_WITH_BINOME: { label: "Share binome sheets", icon: Share2, help: "Give both members of a binome edit access to their own sheet." },
  ASSIGNMENTS_OPEN: {
    label: "Give new registrants to binomes",
    icon: Play,
    help: "Paused: new registrants wait unassigned and are given out once it's back on.",
    control: { type: "switch", on: "On", off: "Paused" },
  },
  BALANCE_BY: { label: "Next candidate goes to the binome with", icon: SlidersHorizontal, help: "Only binomes that take the candidate's department are compared.", control: { type: "choice" } },
  ALL_BINOME_WEIGHT: {
    label: "Board binome share",
    icon: ArrowUpDown,
    help: "A board (ALL) binome counts its load this many times, so a higher value gives it fewer candidates.",
    control: { type: "choice" },
    // no board binome this year: the row appears once a locked binome is tagged ALL
    show: (st) => st.binomes.some((b) => b.status === "ACTIVE" && /\ball\b/i.test(b.tag)),
  },
  HR_ONLY_WEIGHT: {
    label: "HR-only binome share",
    icon: Scale,
    help: "How many HR candidates a binome of two HR members takes, next to the lightest mixed binome. Shown below on today's loads.",
    control: { type: "choice" },
  },
  EMAIL_DOMAIN: {
    label: "Registrant email domain",
    icon: Mail,
    help: "A registrant using another email gets an info alert. Change it in the Settings tab of the Master if you ever need to.",
    control: { type: "fixed", show: (v) => (v ? "@" + v.replace(/^@/, "") : "Any") },
  },
  TRUSTED_BACKUPS: {
    label: "Trusted backup interviewers",
    icon: Users,
    help: "People who often step in for an interviewer, like the HR head. An interview they run for another binome is an info alert, not an email.",
    control: { type: "emails" },
  },
  SYNC_EVERY_MINUTES: { label: "Read the binome sheets", icon: RefreshCw, help: "How often the script reads every binome sheet into the Master.", control: { type: "choice" }, setup: true },
  DIGEST_HOUR: { label: "Daily digest at", icon: Repeat, help: "When the admins get the day's summary email.", control: { type: "choice" }, setup: true },
  SCREENING: {
    label: "Screening",
    icon: ShieldCheck,
    help: "Hold low-effort applications for an admin to read before any binome sees them, and decline VIC members without telling them. Off: every application goes to a binome.",
  },
  SCREEN_HOLD_AT: {
    label: "How strict",
    icon: Gauge,
    help: "Which applications wait for an admin. The rules and their points are in How screening decides, below.",
    control: { type: "choice", custom: { unit: "points", min: 0, max: 100 } },
  },
  VIC_MEMBERS_SHEET: { label: "VIC members sheet", icon: Table2, help: "The Google Sheet listing the VIC members." },
}
