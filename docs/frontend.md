# Dashboard UI (`frontend/`)

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui, started from the ShadcnStore dashboard template and dressed in
the VIC IT Charter 2026. Live at https://vic-recruitment.vercel.app since 2026-10-03
([#14](https://github.com/puIad/vic-recruitment-2026/pull/14)). It replaced the hand-written `web/index.html`, deleted
in `c64f118` (`git show c64f118^:web/index.html` if it is ever needed). How to run it and where the code is:
[../frontend/README.md](../frontend/README.md). Product record: [../PRODUCT.md](../PRODUCT.md); visual system:
[../DESIGN.md](../DESIGN.md). How Vercel builds it: [vercel.md](vercel.md#files).

## Decisions

| Decision | Why |
|---|---|
| Vite + React + shadcn/ui from the ShadcnStore template (`vite-version`) | The app is a signed-in SPA calling `POST /api/run`; the Next.js version would add a server for nothing |
| Same API contract as the old page, `API_VERSION` 2 | The Apps Script did not change for the UI; old and new could run side by side during the cut-over |
| Light default, dark supported, English only | Confirmed with the owner |
| Gilroy is the only family, files from the club (`assets/Gilroy`), committed in the private repo | The charter prescribes it; revisit if the repo ever goes public |
| Charter decoration in the frame (sign-in, sidebar, headers, empty states, errors), calm data | Confirmed with the owner |
| Dev against `test/webdev.js` (mock Google), proxied by Vite | Real data shapes, no Google account needed |
| Replaces `web/index.html` at the same URL, built into `web/dist`; the Vercel root stays `web/` (owner, 2026-10-03) | No second URL; `api/`, `lib/` and the env vars stay untouched; Instant Rollback undoes a bad deploy |
| Change history was the first placeholder made real (owner, 2026-10-03) | Smallest: the Member Changes tab already logs every tool run |
| Binome members get a read-only "my binome" view later (owner, 2026-10-03) | Not built; needs a new access rule in WebApp.gs, today access is Master editors only |
| Reset all binomes asks for a typed phrase, checked again by the script (2026-10-03) | It trashes every binome sheet and empties Team and Member Changes; a misclick must not do that |
| Schedule and Analytics kept, Binome desk dropped (owner, 2026-10-04) | Plans in [plans.md](plans.md). The binome view grew into an idea: members would use the dashboard instead of their sheet. Kept, not planned |

## Where things are in the UI

The sidebar has four groups: Control room, People, Coming up, System. Alerts carries a live count.

| Place | What it does |
|---|---|
| Header | Live status button (reload; numbers also refresh every 15 s from the Master's last edit), the primary **Sync now**, Test mode pill |
| Overview | Pipeline card (registrants by status), Launch sequence (Import team → Draft → Lock, only the current step is primary), attention, binome load, departments, Activity of this session |
| Alerts | Inbox: list left, reading pane right; severity filter and Manual edits, search, select, Mark resolved, Accept edits on several, Apply / Revert / Accept per manual edit |
| Binomes | Table (filter, sort, status facet, row menu); Unpaired members and Active covers cards (Place… opens Change members prefilled; Pair two… opens its New binome tab) |
| Change members | Sheet with Replace / Swap / New binome / Cover, each with the script's dry-run preview; opened from Binomes or a row menu |
| Move interviewee | Dialog, from Binomes, an interviewee row or a binome row menu |
| Interviewees, Team | Tables of the two tabs |
| Maintenance | Check integrity, Send me the digest now, Re-share binome sheets, Run setup again (owner only); Danger zone: Reset all binomes (phrase "I confirm to reset the binomes") |
| Settings | General, Alerts and timing, Sharing and email (turning Test mode off asks first), Change history, Connections (Google files), Account (session time left), Appearance (charter palettes: VIC, SPARK, English Bubble, Training) |
| Elsewhere | Command palette (Ctrl K: pages, candidates by code or name, binomes, alerts, Sync), Help (FAQ), Google files row in the sidebar, account menu at its foot |
| Gate | Sign in, session expired, no access, script unreachable, set in the iris of the charter's divider disc |

**Reset all binomes** (`resetBinomesCore_` in Team.gs): trashes every binome sheet (recoverable from the owner's Drive
trash for 30 days), empties the Binomes, Team and Member Changes tabs, puts interviewees back to Unassigned, closes the
open alerts tied to binomes, and forgets the sync and baseline state of the old sheets. Registrations deleted on purpose
stay remembered. Used live on 2026-10-03 to redo the binomes.

## Placeholders (sample data, each labelled) and what makes them real

**Change history is real**: `webState.history` reads the Member Changes tab (`historyRows_` in WebApp.gs, newest first,
last 300); Settings › Change history shows it with search and a Replaced / Swapped / Cover filter. It only knows what
that tab logs: member replacements, swaps and covers. Interviewee moves and accepted hand edits are not in it (they
only leave an INFO alert).

| Page | State |
|---|---|
| Schedule (template calendar) | Planned: [plans.md › Schedule](plans.md#schedule) |
| Analytics (template dashboard 2) | Planned: [plans.md › Analytics](plans.md#analytics) |
| Binome desk (template chat) | Dropped 2026-10-04; remove it in the next UI PR ([plans.md](plans.md)) |

## Still open

- Schedule and Analytics ([plans.md](plans.md)); remove the Binome desk page.
- Binome view: members see their binome in the dashboard, maybe instead of the sheet. An idea, not planned
  (needs an access rule in WebApp.gs).
- Log interviewee moves and accepted hand edits in a history source, then show them in Change history.
- No automated tests for the UI itself; `test/vercel.test.js` only checks its RPC wrapper and `API_VERSION`. The data
  layer is thin enough to add cases against `webdev.js`.
- `npm run lint` fails on the ESLint config (flat-config migration); `tsc -b` is the check that works.
