// The onboarding tour's steps and its "seen" flag (docs/onboarding-tour.md). Pure: no React, no imports, so
// test/tour.test.js runs this file as it ships.

export type TourRole = "admin" | "member"

export interface TourStep {
  id: string
  /** the page the step needs; the tour navigates there first. Omitted: wherever the tour is */
  path?: string
  /** the `data-tour` id it highlights. Omitted, or not on the page: a centered card */
  target?: string
  /** the target sits in the sidebar: on a phone the drawer opens for it */
  sidebar?: boolean
  title: string
  body: string
}

const MEMBER: TourStep[] = [
  { id: "welcome", path: "/", title: "Welcome", body: "This is your binome's dashboard: your candidates, what needs doing and the interview form, in one place." },
  { id: "partner", path: "/", target: "binome-partner", title: "Your binome", body: "Who you interview with. You share these candidates and see each other's edits." },
  { id: "progress", path: "/", target: "binome-progress", title: "Where they stand", body: "How many candidates you have and where each one is: contacted, date set, interviewed. Coming up lists your next interviews." },
  { id: "needs-you", path: "/", target: "binome-needs-you", title: "Needs you", body: "What to do next, worst first. Start here each time you open the dashboard." },
  { id: "candidates", path: "/", target: "binome-candidates", title: "Your candidates", body: "All of them, read from your binome sheet. Click a code to see everything they wrote and fill in your columns." },
  { id: "interview", path: "/", target: "binome-interview-action", title: "The interview form", body: "Fill the interview form here. Drafts are saved in this browser, and your partner's saves show up." },
  { id: "sheet", path: "/", target: "nav-binome-sheet", sidebar: true, title: "Your binome sheet", body: "The same data in Google Sheets, if you prefer the sheet. Both are the same cells." },
  { id: "you", path: "/", target: "nav-you", sidebar: true, title: "Account and Help", body: "Your account and the dashboard's look. Help answers common questions and replays this tour." },
]

const ADMIN: TourStep[] = [
  { id: "welcome", path: "/", title: "Welcome to the control room", body: "A quick round of every page. It takes about two minutes, and Help replays it whenever you need." },
  { id: "overview", path: "/", target: "overview-cards", title: "Overview", body: "What needs a person right now, and how far the launch is. Start here each time." },
  { id: "alerts", path: "/alerts", target: "alerts-toolbar", title: "Alerts", body: "What the script found, worst first. Filter by severity, tick several, then repair, nudge their binomes or keep them out in one go." },
  { id: "binomes", path: "/binomes", target: "binomes-toolbar", title: "Binomes", body: "Each pair's status, access and progress. Change members and Move interviewee are here; open a binome's menu for its access and tag." },
  { id: "interviewees", path: "/interviewees", target: "interviewees-toolbar", title: "Interviewees", body: "Every candidate, their binome, status and risk. Search by code or name; restore a candidate kept out by mistake." },
  { id: "team", path: "/team", target: "team-toolbar", title: "Team", body: "The interviewers on the OT list: who is paired, with whom, and who has interviewed before." },
  { id: "search", target: "search-trigger", title: "Search anything", body: "Ctrl K jumps to any page, candidate, binome or alert, from anywhere." },
  { id: "settings", path: "/settings/general", target: "settings-sections", title: "Settings", body: "General holds the admins, how candidates are assigned and when the script runs. Change what you need, then Save changes at the bottom." },
  { id: "settings-menu", path: "/settings/general", target: "nav-settings", sidebar: true, title: "The other settings", body: "Alert timing, sharing and test mode, the emails' texts, screening, connections and the change history, each on its own page." },
  { id: "maintenance", path: "/maintenance", target: "maintenance-tools", title: "Maintenance", body: "Checks and repairs that keep the sheets, sharing and mail in step. Each one asks before it writes anything." },
  { id: "help", path: "/help", target: "help-replay", title: "Help", body: "Answers to common questions, and this tour again whenever you need it." },
]

/** An admin who is also in a binome: their own part, on /my-binome (member steps 2 to 6). */
const CHAPTER: TourStep[] = [
  { id: "binome-intro", path: "/my-binome", title: "Your own binome", body: "You are also in a binome. Here is your part, the same page your partner sees." },
  ...MEMBER.slice(1, 6).map((s) => ({ ...s, id: "binome-" + s.id, path: "/my-binome" })),
]

export function buildTour(role: TourRole, inBinome: boolean): TourStep[] {
  if (role === "member") return MEMBER
  return inBinome ? [...ADMIN, ...CHAPTER] : ADMIN
}

/** Raise a tour's version after a real change (a new page or feature) to show it once more; never for wording. */
export const TOUR_VERSION: Record<TourRole, number> = { admin: 1, member: 1 }

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">

export const tourKey = (role: TourRole, email: string) => `vic:tour:${role}:${email.toLowerCase()}`

/** Whether the tour should start by itself: never seen, or seen at an older version. Blocked storage counts as seen. */
export function tourDue(storage: Storage, role: TourRole, email: string): boolean {
  let raw: string | null
  try {
    raw = storage.getItem(tourKey(role, email))
  } catch {
    return false
  }
  try {
    const v = raw === null ? 0 : Number(JSON.parse(raw)?.v) || 0
    return v < TOUR_VERSION[role]
  } catch {
    return true
  }
}

/** Finished or skipped: not again until the version moves. */
export function markSeen(storage: Storage, role: TourRole, email: string, at = Date.now()) {
  try {
    storage.setItem(tourKey(role, email), JSON.stringify({ v: TOUR_VERSION[role], at }))
  } catch {
    // private mode or blocked storage: tourDue already treats it as seen
  }
}
