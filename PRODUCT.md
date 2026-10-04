# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- `frontend/` (live at https://vic-recruitment.vercel.app since 2026-10-03): Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui, started from the ShadcnStore dashboard template (`vite-version`). Chosen over the template's Next.js version because the app is a signed-in SPA that only talks to the existing `/api/run` proxy; no server rendering is needed. Vercel builds it into `web/dist`.
- `web/`: plain Node functions on Vercel (`api/login`, `api/callback`, `api/run`, `api/logout`). The hand-written `web/index.html` it replaced was deleted on 2026-10-03.
- Backend: Google Apps Script over the Master Google Sheet, reached through `POST /api/run` (`webAccess`, `webState`, `webPulse`, `webRun`). `API_VERSION` 2.

## Users

The VIC recruitment team: members of the Vision & Innovation Club (ENP Algiers) who are editors or owner of the "VIC Recruitment 2026" master sheet and sign in with an `@g.enp.edu.dz` account. Mostly the HR team and the IT department. They run the 2026 recruitment from a laptop during the working day, and check alerts from a phone. The owner (Mourad Fernane) additionally runs Setup; everyone else is an editor. Accounts that cannot edit the Master see "View only" or "No access" and no dashboard. Confirmed direction (2026-10-03, not built): binome members will later get a read-only "my binome" view of their own candidates and alerts, which needs a new access rule in the script; until then access stays editors only.

## Product Purpose

A control room over the Apps Script + Google Sheets automation that runs VIC's recruitment: registrants are routed to **binomes** (two interviewers, one from HR plus one from another department), each binome has its own Google Sheet, and the script raises **alerts** when a candidate has not been contacted, scheduled or reviewed in time. The dashboard shows where every candidate stands, lets the team run the launch sequence (import team, draft binomes, lock), fix binomes after lock (replace, swap, cover, move an interviewee), clear alerts, and maintain the system.

Success: every registrant is contacted, scheduled and interviewed inside the timing limits, nobody has to open the Master by hand to find out what is wrong, and a hand edit of the Master is caught before it silently breaks sharing or history.

## Positioning

Not a generic admin template: every screen and button maps to a rule VIC decided for this recruitment (random HR + other-department pairing, routing by department, no auto-pairing after lock, manual-edit detection with Apply / Revert / Accept, TEST_MODE) and to the ENP / Google Drive access model (access = Master editor, checked on every call). Another club's dashboard could not reuse it unchanged.

## Operating Context

- The live Master has 31 binomes locked (redone 2026-10-03 with Reset all binomes), sheets created but **not shared**. TEST_MODE is on: mail goes to admins only and nothing is shared, until launch. No registrations, interviewees or forms yet; the empty states are real states for now.
- Long actions (Lock, Sync, Check integrity) take up to ~200 s against Vercel's 300 s limit and resume when run again. Sign-in lasts 48 h from sign-in.
- The numbers refresh by polling the Master's last-edit time every 15 s, plus a manual refresh.
- The script runs as the visitor. Tokens never reach browser JS. Logs hold email, action, duration and result, never arguments or candidate data.
- Local development uses `test/webdev.js` (mock Google, 40 seeded registrations, two hand edits) behind the Vite dev server: `http://localhost:5173/dev-login?as=admin@g.enp.edu.dz`.
- Terminology: **binome** (the pair), **interviewee** / registrant (the candidate, code like `IT.07`), **Master** (the sheet), **Lock** (create one sheet per binome and start routing), **cover** (temporary stand-in for a binome member), **unpaired** (member without a binome after lock).

## Capabilities and Constraints

Actions, all through `webRun(action, args)`: `sync`, `importTeam` (with replace confirm), `draft` (redraw confirm), `lockCheck` then `lock`, `resolve`, `editApply` / `editRevert` / `editAccept`, `reassign` (move interviewee), `changeMember`, `swapMembers` and `newBinome` (each with a dry-run preview), `addCover` (dry-run preview) and `endCover`, `digest`, `integrity`, `reshare`, `setup` (owner only), `saveSettings`, `resetBinomes` (typed phrase). Reads: `webAccess` (gate), `webState`, `webPulse`.

Gate states: sign in, session expired, no access (domain / no email / read-only / no project), script unreachable. States per status: Waiting, Assigned, Contacted, Scheduled, Interviewed, Withdrew. Alert severities: High, Medium, Info, plus Manual edits.

Done 2026-10-03: `frontend/` replaced `web/index.html` at the same URL (built into `web/dist`, the Vercel root stays `web/`); Change history is the first placeholder made real; Reset all binomes (typed phrase) added. Open: the three other placeholders, the 2026 forms still say 2025 in places, the open questions in `docs/decisions.md`.

Language: English only (confirmed). No right-to-left support needed now.

## Brand Commitments

The VIC IT Charter 2026 (`assets/IT-Charter-2026.pdf`) is the binding visual source: the user asked to match its colours, gradients and fonts, use its logo, and take its decorative language. The Gilroy font files (Light, Regular, Medium, Bold, Heavy) are provided at `assets/Gilroy`. The Charter's own rules apply to anything that carries the logo or type (for example: no all-caps or all-lowercase setting of Gilroy, logo never recoloured, distorted, shadowed or placed on photos). This file records the commitment only; the visual system lives in DESIGN.md and the surface brief.

## Evidence on Hand

- `assets/IT-Charter-2026.pdf` (45 pages): logo, colour proportions, typography, decorative section dividers, event and digital templates.
- `assets/Gilroy/` font files.
- Seeded mock data via `test/webdev.js`. The old `web/index.html`, the behavioural reference the actions were ported from, is in git history (`git show c64f118^:web/index.html`).
- Not available, do not fabricate: real candidate or binome data, registration time series, interview dates per candidate in the current state payload, any launch-day numbers.

## Product Principles

1. The Master sheet is the source of truth. The dashboard never invents state; every number and button maps to a script action or a field of `webState`.
2. Anything that writes to sheets, shares files or sends mail previews first and asks for confirmation; long actions say how far they got and resume.
3. Calm when nothing is wrong. "All clear" and "nothing yet" are designed states, not leftovers.
4. Candidate data is personal: shown to the team that needs it, never logged, never put in URLs.
5. The script ships first and only adds: the UI checks `API_VERSION`, and a new field reaches the UI only after the script is deployed.

## Accessibility & Inclusion

WCAG 2.1 AA as the floor. Keyboard-operable tabs, menus and dialogs; status and toasts announced politely; colour never the only carrier of severity or status (labels and icons stay). The Charter approves white text on its blue and dark green and dark text on its aquamarine and gray; the UI follows those pairings.
