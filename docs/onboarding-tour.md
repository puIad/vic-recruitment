# Onboarding tour (spec)

Status: specified 2026-10-20, not built. Decisions come from a grilling session with the owner on 2026-10-20.

## Problem

Members who tried the dashboard did not find their way around: what each page is for, which settings exist and where
they live. The dashboard has no first-run guidance, and members (role `member`) have no Help page at all.

## What we build

A **spotlight tour** for first-time visitors. It dims the page, highlights one real element at a time and puts a short
card next to it with Back, Next and Skip. It walks across pages, navigating for the user. There are two tours, one per
role, and each one can be replayed from a Help page.

## Decisions

| Decision | Choice |
|---|---|
| Format | Spotlight tour on real UI elements (not a modal carousel, not a checklist) |
| Scope | Walks across pages: the tour navigates to each page and highlights its key control |
| Roles | A member tour (8 steps) and an admin tour (11 steps) |
| Admin in a binome | The admin tour, plus a "Your own binome" chapter at the end made of member steps 2 to 6 on `/my-binome` |
| Member replay | A new **Help** item in the member sidebar: a Replay tour button plus the FAQs of the `My binome` and `Access` categories |
| Admin replay | A Replay tour button at the top of the existing `/help` page |
| Auto-start | Only on `/` (Overview or My binome), after the gate is `ok`/`member` and the first snapshot has loaded. A user who lands deep (an interview link from an email) is not interrupted; the tour starts the next time they reach `/` |
| Seen flag | `localStorage`, keyed per role and email: `vic:tour:<role>:<email>` → `{"v": <version>, "at": <ms>}` |
| Versioning | Each tour has a `version` number. If the stored `v` is lower than the version, the tour auto-starts once more. Raise it only for real changes (a new page or feature), never for wording |
| Seen means | Finish **or** Skip. Skip also shows a toast: "Replay it any time from Help" |
| Interaction | Look only. The overlay takes every click, and only Back, Next, Skip and the keyboard work. Admin controls are live (send mail, repair, lock), so a click during the tour must not reach them |
| Missing target | If a step's element is not on the page (no candidates yet, nothing locked, no alerts), the same text shows as a centered card with no highlight. Never skip it silently |
| Phone | The same steps, with the card docked to the bottom of the screen. Steps that point at the sidebar open the mobile drawer first (`useSidebar().setOpenMobile(true)`) and close it after |
| Build | Custom component on the existing Radix Popover with an SVG cutout overlay. No new dependency |

## The tours

Each step lists the element it highlights (`data-tour` id), the page it needs and what the card says. Card texts are
drafts: keep them to one or two sentences, in the dashboard's own words (see `GLOSSARY.md`).

### Member tour (`member`, version 1), from `/`

| # | Page | Target | Card |
|---|---|---|---|
| 1 | `/` | none (centered) | Welcome. This is your binome's dashboard: your candidates, what needs doing and the interview form, in one place. |
| 2 | `/` | `binome-partner`: the "Your binome" chip list | Who you interview with. You share these candidates and see each other's edits. |
| 3 | `/` | `binome-stages`: the stage bar | Where your candidates are: contacted, date set, interviewed. |
| 4 | `/` | `binome-needs-you`: the "Needs you" card | What to do next, worst first. Start here each time you open the dashboard. |
| 5 | `/` | `binome-candidates`: the "Your candidates" list | All your candidates, read straight from your binome sheet. |
| 6 | `/` | `binome-interview-action`: the interview action on the first candidate row | Fill the interview form here. Drafts are saved in this browser, and your partner's saves show up. |
| 7 | `/` | `nav-binome-sheet`: the sidebar binome sheet link | The same data in Google Sheets, if you prefer the sheet. |
| 8 | `/` | `nav-you`: the sidebar "You" group (Account, Appearance, Help) | Your account and the dashboard's look. Help has the answers to common questions and replays this tour. |

### Admin tour (`admin`, version 1), from `/`

| # | Page | Target | Card |
|---|---|---|---|
| 1 | `/` | none (centered) | Welcome to the control room. A quick round of every page; it takes about two minutes. |
| 2 | `/` | `overview-launch` and `overview-attention` (the launch card, then the attention card; one step, launch card highlighted) | Overview: launch progress and what needs a person right now. |
| 3 | `/alerts` | `alerts-toolbar`: the severity filter and the select-all and bulk action bar | Alerts: what the script found, worst first. Select some to repair, send to a binome, keep out or mail the binomes in one go. |
| 4 | `/binomes` | `binomes-table` | Binomes: each pair's status, who can open it and how far they are. Pairing and access are changed from here. |
| 5 | `/interviewees` | `interviewees-search` | Interviewees: every candidate, their binome and risk. Search by code or name; restore a candidate kept out by mistake. |
| 6 | `/team` | `team-table` | Team: the interviewers on the OT list and who is paired with whom. |
| 7 | any | `search-trigger`: the header search (Ctrl K) | Ctrl K jumps to any page, candidate, binome or alert. |
| 8 | `/settings/general` | `settings-sections` | Settings, General: the admins, how candidates are assigned and when the script runs. |
| 9 | `/settings/general` | `nav-settings`: the Settings submenu in the sidebar, opened | The other settings: alert timing, sharing and test mode, the emails' texts, screening, connections and change history. |
| 10 | `/maintenance` | `maintenance-checks` | Maintenance: checks and repairs that keep the sheets, sharing and mail in step. |
| 11 | `/help` | `nav-help` | Help: answers to common questions, and this tour again whenever you need it. |

**"Your own binome" chapter**, appended only when the store's `member` is set for an admin (`inBinome`): member steps
2 to 6 on `/my-binome`, introduced by a centered card ("You are also in a binome. Here is your own part."). The tour
ends on `/my-binome`.

The tour ends where its last step is. It does not jump back to the start page.

## Behaviour

- **Controls**: Back (hidden on step 1), Next (Finish on the last step), Skip (a text button), and a step counter
  ("3 of 11"). Keyboard: Right and Enter go to the next step, Left goes back, Esc skips. Focus moves into the card on each
  step and returns to the page when the tour ends.
- **Navigation**: when a step needs another page, `navigate(path)` runs, then the step waits for its target (polled
  for up to about 2 s, since pages are lazy-loaded and wait for the snapshot). On timeout it falls back to a centered card.
- **Scrolling**: the target is scrolled into view (`block: "center"`; instant when `prefers-reduced-motion`, else smooth),
  and the cutout follows it on resize and scroll.
- **Overlay**: a fixed full-screen SVG with a rounded cutout around the target (8 px padding), above the app and below
  the card. It catches every pointer event, including inside the cutout. The highlighted element is not focusable
  during the tour.
- **No conflicting UI**: the tour does not start while a dialog, sheet or the command palette is open, and closes the
  command palette before step 7 highlights its trigger. Live polling and toasts continue as usual.
- **Theme**: card and overlay use the charter tokens (DESIGN.md), and work in light and dark mode. Motion is a short fade
  and slide, off under `prefers-reduced-motion`.
- **Storage failures**: if `localStorage` throws (private mode, blocked storage), treat the tour as seen for this
  session so it does not loop. Replay still works.
- **Replay** starts the tour from step 1 on `/`, whatever the stored flag says. It does not
  change the flag until Finish or Skip.

## Code shape

- `frontend/src/lib/vic/tour.ts`: pure logic, no React. Holds the step definitions (`TourStep = { id, path?, target?, title, body }`),
  `buildTour(role, inBinome)` returning the step list (admin plus the chapter when `inBinome`), `tourKey(role, email)`,
  `TOUR_VERSION` per tour, `shouldAutoStart(stored, version)`, and `readSeen` / `markSeen` with the storage guards.
- `frontend/src/components/tour/`: the `<Tour>` provider, mounted once in the app shell. It provides `useTour().start()`
  and renders the overlay and card. The auto-start check lives here: it runs on `/` once the gate is open and the snapshot
  is in.
- Targets are marked with `data-tour="<id>"` attributes on the existing elements. No new wrappers.
- Member Help: add `{ title: "Help", url: "/help", icon: CircleHelp }` to the "You" group of `memberNavGroups`, a `/help`
  route to `memberRoutes`, and a filter on `FAQList` (a `categories` subset: `My binome`, `Access`). Review those FAQ
  answers for member wording, since they were written for admins.
- Both Help pages get a "Replay the tour" button above the FAQ list, calling `useTour().start()`.

## Testing

- **Unit** (`test/tour.test.js`, added to `npm test`, in the style of `test/vercel.test.js` reading the TS source):
  `buildTour` gives 8 member steps, 11 admin steps, and 16 for an admin in a binome (11 + 1 intro + 5); `tourKey` is per
  role and email; `shouldAutoStart` is true for no flag and for a lower version, false for the same or a higher one; a
  throwing storage counts as seen.
- **Browser** (Playwright with `playwright-chrome`, against `npm run mock` + `npm run dev`): sign in with
  `/dev-login?as=member`, `?as=adminmember` and an admin. For each, check that the tour auto-starts on `/`, walks every
  step with its target highlighted (or centered when missing), that Skip and Finish both stop the next auto-start, that
  Replay from Help works, and that a click inside the cutout does nothing. Repeat the member and admin runs at phone width
  (375 px). `?as=closed` must never show the tour (the gate screen is up).
- PR screenshots go on the `shots` branch, as for other VIC PRs.

## Out of scope

- Per-page tips the first time a page is opened (the "main tour + per-page tips" option was not chosen).
- Server-side or cross-device "seen" state.
- Translations: the dashboard is English only.
