# New frontend (`frontend/`)

Started 2026-10-03. A rebuild of the dashboard UI on a component stack, dressed in the VIC IT Charter 2026. The legacy
`web/index.html` stays live until this one is accepted. How to run it: [../frontend/README.md](../frontend/README.md).
Product record: [../PRODUCT.md](../PRODUCT.md); visual system: `DESIGN.md` at the project root.

## Decisions

| Decision | Why |
|---|---|
| Vite + React + shadcn/ui from the ShadcnStore template (`vite-version`) | The app is a signed-in SPA calling `POST /api/run`; the Next.js version would add a server for nothing |
| Same API contract, `API_VERSION` 2 | The Apps Script is unchanged; old and new fronts can run side by side |
| Light default, dark supported, English only | Confirmed with the owner |
| Gilroy is the only family, files from the club (`assets/Gilroy`) | The charter prescribes it; the repo is private, check before making it public |
| Charter decoration in the frame (sign-in, sidebar, headers, empty states, errors), calm data | Confirmed with the owner |
| Dev against `test/webdev.js` (mock Google), proxied by Vite | Real data shapes, no Google account needed |
| Replaces `web/` at the same URL once accepted (owner, 2026-10-03) | No second URL to maintain; rely on Vercel's instant rollback to the previous deployment if needed |
| First placeholder to build for real: Change history (owner, 2026-10-03) | Smallest: the Member Changes tab already logs every tool run |
| Binome members get a read-only "my binome" view later (owner, 2026-10-03) | Not built; needs a new access rule in WebApp.gs, today access is Master editors only |
| Gilroy files stay committed in the private repo (owner, 2026-10-03) | Revisit if the repo ever goes public |

## Old action to new place

| Old dashboard | New |
|---|---|
| Tabs Overview / Alerts / Binomes / Maintenance | Sidebar groups (Control room, People, Coming up, System); Alerts carries a live count |
| Refresh, Sync now (page header) | Header: live status button (reload) and the primary Sync now |
| KPI tiles (6) and status bar | One Pipeline card on Overview |
| Launch sequence (Import team, Draft, Lock) | Launch sequence card on Overview, only the current step is primary |
| Activity (this session) | Activity card on Overview |
| Alerts list, severity filter, search, select, Mark resolved, Accept edits, Apply / Revert / Accept | Alerts inbox: list left, reading pane right, same fixes, bulk bar above the list |
| Binome list | Binomes table (filter, sort, status facet, row menu) |
| Move an interviewee form | Dialog, opened from Binomes, an interviewee row, or a binome row menu |
| Change members (Replace / Swap / Cover) | Sheet with the same three modes and the same dry-run preview |
| Unpaired members, Active covers cards | Cards on the Binomes page (Place… opens the sheet prefilled) |
| Maintenance tools | Maintenance page, one row each; Setup only for the owner |
| Settings form | Settings pages: General, Alerts and timing, Sharing and email (turning Test mode off now asks first) |
| Google files links | Collapsed "Google files" row in the sidebar, and Settings > Connections |
| Account menu (switch / sign out) | Account menu at the foot of the sidebar, Settings > Account (shows session time left) |
| Test mode chip | Header pill and a sidebar notice |
| Gate (sign in, expired, no access, error) | Same states, set in the iris of the charter's divider disc |

New without an old equivalent: command palette (Ctrl K: pages, candidates by code or name, binomes, alerts, Sync), Interviewees and Team tables,
Help (FAQ), Appearance with charter palettes (VIC, SPARK, English Bubble, Training).

## Placeholders (sample data, each labelled) and what makes them real

Three are left. **Change history is real** (2026-10-03): `webState.history` reads the Member Changes tab (`historyRows_` in WebApp.gs, newest first, last 300) and Settings > Change history shows it, with search and a Replaced / Swapped / Cover filter. It only knows what that tab logs: member replacements, swaps and covers. Interviewee moves and accepted hand edits are *not* in it yet (they only leave an INFO alert); logging them would need new rows or a new tab.

| Page | Idea | Needs |
|---|---|---|
| Schedule (template calendar) | One calendar of every booked interview, clashes and free days | Interview date and time per candidate in `webState` (already in the binome sheets) |
| Binome desk (template chat) | A thread per binome with one-click Nudge from an alert | A Messages tab in the Master, `postMessage` action, `messages` in `webState` |
| Analytics (template dashboard 2) | Registrations per day, time to first contact, interview capacity | Timestamps per registration, assignment and contact in `webState`, series computed in the script |

## Cut-over to Vercel (plan)

Goal: `https://vic-recruitment.vercel.app` serves `frontend/` instead of `web/index.html`, same URL, same `api/`. Merging to `main` is the cut-over, so it is one reversible step: **Vercel > Deployments > previous production deployment > Instant Rollback** restores `web/index.html` in seconds, no git needed.

**How (wired on branch `frontend-cutover`, not merged):**

- `frontend/vite.config.ts` builds into `web/dist` (git-ignored).
- `web/vercel.json` gets `buildCommand` (`npm --prefix ../frontend ci && npm --prefix ../frontend run build`), `outputDirectory: dist`, and a rewrite of every non-`/api/` path to `/index.html` so deep links (`/settings/history`) and reloads work. The Vercel project root stays `web/`, so `api/`, `lib/` and the env vars are untouched.
- CSP: `font-src` was `https://fonts.gstatic.com` only, which would have blocked the self-hosted Gilroy files (this file used to claim otherwise). Now `font-src 'self'`; the Google Fonts hosts are gone because only the old page used them.
- Checked locally 2026-10-03: `vite build` from `web/` works (about 19 s), and `web/dist` served with the exact `vercel.json` headers and rewrite loads a deep link, all five Gilroy weights, no CSP errors.

**Order:**

1. **Deploy the script first.** `npm run deploy` (tests, `clasp push`, both deployments): the new UI reads `webState.history`, and an older script just leaves the page empty. Adding a field needs no `API_VERSION` bump.
2. **Check the Vercel project** (dashboard, I cannot see it from the API): Settings > General > *Include source files outside of the Root Directory* is on (the build reads `../frontend`), Node 24.x, Framework Preset *Other*, no Build Command / Output Directory override in the dashboard (those would win over `vercel.json`).
3. **Push `frontend-cutover` and open a PR.** The preview deployment must show a green build. Previews are SSO-protected and sign-in only works on production, so this proves the build, not the sign-in. Read the build log through the Vercel MCP if it fails.
4. **Merge** (squash is fine) to `main`. Production deploys on its own. Open the URL signed in as the owner: Overview loads, Alerts and Binomes match the Master, Sync now works, Settings > Change history lists the member changes, a deep link reload works, and a hard refresh after sign-out shows the sign-in gate.
5. **Other accounts** (the still-open list in [vercel.md](vercel.md#still-open)): an editor, a removed ENP account ("No access", no flash of the dashboard), a viewer ("View only"), a multi-account browser, sign-out then sign-in within 48 h, Lock near the limit. The gate states are built but only ever exercised on the mock.
6. **If anything is wrong**: Instant Rollback, fix on the branch, repeat from step 3.
7. **Clean up** once accepted: delete `web/index.html`; point `test/webdev.js` at `web/dist` (or at Vite) and port the `index.html` assertions in `test/vercel.test.js` (line 178) to the API-only contract; update [vercel.md](vercel.md#files), `HANDOFF.md` (`API_VERSION` and `SETTING_UI` now live in `frontend/src/lib/vic/`) and the `web/` row in [architecture.md](architecture.md).

**Not decided:** whether the old `doGet` web app should redirect to Vercel (already listed in vercel.md).

## Still open for the new UI

- No automated tests for the UI; the data layer is thin enough to add `test/` cases against `webdev.js`.
- Three placeholders: Schedule, Binome desk, Analytics (table above).
- A read-only "my binome" view for binome members (needs an access rule in WebApp.gs).
- Log interviewee moves and accepted hand edits in a history source, then show them in Change history.
- `npm run lint` in `frontend/` fails on the ESLint config (flat-config migration), unrelated to any page; `tsc -b` is the check that works today.
