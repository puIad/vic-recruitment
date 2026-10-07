# STATUS — VIC Recruitment 2026

Updated 2026-10-07. Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything
else: [docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

## Live now

- **Dashboard:** the new UI (`frontend/`, Vite + React + shadcn in the VIC charter look) has served production since
  [#14](https://github.com/puIad/vic-recruitment-2026/pull/14) (2026-10-03). The old hand-written `web/index.html` was
  deleted the same night. Map of the UI: [docs/frontend.md](docs/frontend.md).
  Latest UI: `b9f84c0` (2026-10-07, [#28](https://github.com/puIad/vic-recruitment-2026/pull/28)): members get **My binome**
  (their candidates, statuses, open alerts, a link to their sheet; read-only) and poll every 15 s; admins unchanged (load-test
  plan, task 7). UI only, no script deploy. Before that `6f3cbc3` (2026-10-07, [#27](https://github.com/puIad/vic-recruitment-2026/pull/27)): `API_VERSION` 3. Before that `963144d` (2026-10-06, [#23](https://github.com/puIad/vic-recruitment-2026/pull/23)): one poll call per tick, a 20 s
  poll timeout, a quiet 30 s pause on Google's rate limit (load-test plan, task 3).
- **Script, latest:** web app **@65**, API **@66**, deployed from `6f3cbc3` (2026-10-07,
  [#27](https://github.com/puIad/vic-recruitment-2026/pull/27)): a member role (load-test plan, task 6). Admins are the
  Master's editors exactly as before and every admin entry point now checks the role; anyone in `MEMBER_MAP` (members of
  locked binomes, live covers) gets only their binome's slice of the snapshot, read-only. `API_VERSION` 3, with the UI of
  the same merge (Vercel production from `6f3cbc3`). Since `b9f84c0` members get the My binome page. Nothing changes for admins.
- **Script, before that:** web app **@63**, API **@64**, deployed from `47aee3f` (2026-10-07,
  [#26](https://github.com/puIad/vic-recruitment-2026/pull/26)): the admin dashboard is served from a cached snapshot
  (script cache), republished by every sync and every dashboard action that writes; the pulse is now the snapshot's
  version, so screens reload only when what they show changed. A hand edit in the Master shows after the next sync
  (load-test plan, task 5). Live check still to do: `webState` times (needs a fresh `cookies.txt` or a few minutes of use),
  in [docs/load-test.md](docs/load-test.md#task-5--admin-dashboard-served-from-a-cached-snapshot).
- **Script, before that:** web app **@61**, API **@62**, deployed from `a2e09db` (2026-10-07,
  [#24](https://github.com/puIad/vic-recruitment-2026/pull/24)): the sync writes only what changed, so a quiet sync writes
  nothing and the Master's "last edited" (the dashboards' pulse) only moves on a real change; the Tracker's clock cell
  now reads "Last change: …" (load-test plan, task 4). It also carries [#21](https://github.com/puIad/vic-recruitment-2026/pull/21)
  and [#22](https://github.com/puIad/vic-recruitment-2026/pull/22), which were found already live (@55–@58, not recorded).
  Live check still to do: ~20 `cycle` lines for the new average.
- **Script, before that:** web app **@53**, API **@54**, deployed from `2264a74` (2026-10-06,
  [#20](https://github.com/puIad/vic-recruitment-2026/pull/20)): the triggers can move to `vic.rh` (load-test plan, task 9: an unset
  `TRIGGER_OWNER` is taken by whoever runs Setup; binome sheet protections keep the trigger account and the Master's owner). **Owner steps still to
  do**, in [docs/load-test.md](docs/load-test.md#task-9--triggers-on-the-club-account).
- **Script, before that:** web app **@51**, API **@52**, from `07e8b35` (2026-10-05,
  [#19](https://github.com/puIad/vic-recruitment-2026/pull/19)): a refused action (script lock busy) is a `BUSY` error the page
  shows as an error with Try again, never a green toast (load-test plan, task 2). Live check still to do: hold the lock with
  Sync now and press a quick action.
- **Script, before that:** web app **@49**, API **@50**, from `7fd7ca5` (
  [#18](https://github.com/puIad/vic-recruitment-2026/pull/18)): each sync logs one `cycle` line with the time of every phase
  (load-test plan, task 1). The owner reads ~20 `syncAll` runs in Apps Script › Executions and copies them into
  [docs/load-test.md](docs/load-test.md#task-1--time-each-step-of-the-sync) › Notes.
- **Script, before that:** web app **@45**, API **@46**, deployed from `13cc147` (2026-10-04 night,
  [#16](https://github.com/puIad/vic-recruitment-2026/pull/16)): binome sheets in the 2025 layout with Hogwarts colours
  and Montserrat, new gold columns Interview Done / Rating /10 / Final Affectation (synced to Interviewees), more of the
  registration shown. The 32 old sheets rebuild themselves, 6 per sync. **Run setup again (owner) once** to restyle the
  Master. Dashboard: Vercel production at `fef4bc6`'s UI (unchanged).
- **TEST_MODE is on**: mail goes to admins only, nothing is shared. Keep it until launch.
- **Master** (redone on the evening of 2026-10-03 with Reset all binomes, then Import team → Draft → Lock):
  - Team: 63 rows (33 HR, 12 IT, 10 FLER, 8 COMM, no board / ALL rows). The two IT rows that had no email got their
    emails on 2026-10-04 and were paired into a new binome with **Pair two…**: B.32.
  - 32 binomes locked, sheets created, **not shared**: B.01–B.28 pair HR with IT / FLER / COMM; B.29 and B.30 are two
    HR members (tag `HR`, so they only get HR candidates); **B.31 is one HR member alone** (all three kept for now,
    2026-10-04); B.32 from Pair two… (tag `IT & HR`).
  - No registrations, interviewees, forms or member changes. The ~185 alerts raised by the re-import and reset are all
    closed. The 49 old binome sheets are in the owner's Drive trash (Drive deletes them after 30 days).
  - Setup's v2 changes are in place (every Settings row, the Member Changes tab, Team column E "Exclude").
  - Timing limits are still the test values 32 / 40 / 5 (24 / 48 / 12 before launch).
- Phases A–D, the timing and interview-form cases and the Reset were all tested live on 2026-10-03:
  [docs/history.md](docs/history.md#live-test-2026-10-03).

## In review

- **Alert quick actions** (branch `alert-quick-actions`): a quick fix for every alert type that has one, snooze / mute,
  emails with an editable preview, links to the exact row or cell, bulk Nudge / Repair / Snooze. Settled with the owner on
  2026-10-04; how it works: [architecture.md](docs/architecture.md#quick-actions-alerts-page). Ships as usual: merge,
  `npm run deploy` (new `QuickFix.gs`, no `API_VERSION` bump: the fields are only added), then Vercel. Run Setup once
  after deploy so the Alerts tab's Status dropdown lists SNOOZED and MUTED.

## Next: members on the dashboard (plan of 2026-10-05)

The load test (100 people at once, model + a live run on production) says the dashboard isn't ready for the binomes
yet: every refresh takes 8–11 s, a refused action shows as a green toast, the owner's trigger time is 89 % used
(`syncAll` 13.4 s on average) and Google limits requests per account per minute. Nothing is lost silently in the sheet
and form paths. The fix is planned as **10 tasks, one per session**, in [docs/load-test.md](docs/load-test.md):
members read and edit their own binome from the dashboard (written into their binome sheet, never the Master),
cached snapshots rebuilt only where something changed, the sync writes only what changed, one poll call per tick,
refused = error, triggers on `vic.rh`. Open the dashboard to the binomes only after task 10 signs it off.
Progress: task 1 (sync timing lines) is deployed; its reading of the first `cycle` lines is open. Task 2 (refused = error) is deployed
([#19](https://github.com/puIad/vic-recruitment-2026/pull/19)). Task 3 (one poll call per tick, 20 s timeout, rate-limit pause) is live ([#23](https://github.com/puIad/vic-recruitment-2026/pull/23), UI only, Vercel production from `963144d`). Task 9: code deployed ([#20](https://github.com/puIad/vic-recruitment-2026/pull/20)); the owner moved the triggers to `vic.rh` (2026-10-06). Follow-ups [#21](https://github.com/puIad/vic-recruitment-2026/pull/21) and [#22](https://github.com/puIad/vic-recruitment-2026/pull/22) are live: Check integrity flags binome sheets whose protection doesn't list `vic.rh`, the owner repairs them in bulk from Alerts or with the menu's Re-protect binome sheets. Task 4 (write only what changed) is deployed ([#24](https://github.com/puIad/vic-recruitment-2026/pull/24), @61/@62); its ~20 `cycle` lines are open. Task 5 (cached admin snapshot) is deployed ([#26](https://github.com/puIad/vic-recruitment-2026/pull/26), @63/@64); its live `webState` times are open. Task 6 (member role, read side) is deployed ([#27](https://github.com/puIad/vic-recruitment-2026/pull/27), @65/@66). Task 7 (My binome page, 15 s member polling) is live ([#28](https://github.com/puIad/vic-recruitment-2026/pull/28), UI only, Vercel production from `b9f84c0`); a real member sign-in on the live site is still to check (with TEST_MODE on, nothing is shared, so expect "Your binome sheet isn't shared with you yet"). Next: 8 (members edit their binome).

## Brief for 2026-10-04 (settled with the owner)

In order. Each step says where to do it.

1. ~~**Fix the two IT members without an email.**~~ Done 2026-10-04: emails added, paired with Pair two… (#15) as
   B.32. **One of the two emails has a typo:** `mohamed_louai.bahlouli@g.enp.enp.edu.dz` (`enp` twice). Fix it before
   launch (Change members › Replace with the right address, or edit the Binomes cell and Apply).
2. ~~**Settle the leftovers of the draft.**~~ Settled: B.29 / B.30 (HR + HR) and B.31 (alone) stay as they are for
   now. The Team tab is the live OT list; the owner adjusts them with Change members as it settles
   ([decisions.md](docs/decisions.md#open-questions), question 2).
3. ~~**Check the new sheets once.**~~ Done by the owner 2026-10-04: Check integrity found nothing.
4. **Other-account checks on the new UI** (owner, later on 2026-10-04; [vercel.md](docs/vercel.md#still-open)): an
   editor, a removed ENP account ("No access", no flash of the dashboard), a viewer ("View only"), a multi-account
   browser, sign-out then sign-in within 48 h. Then share the URL with the editors.
5. **Before launch, by about 2026-10-20:** reword the 2026 forms (they still say 2025 in places); verify the guessed
   email `rami.ahmane@g.enp.edu.dz` (now in B.19); fix the B.32 email (step 1); answer the
   [open questions](docs/decisions.md#open-questions); give admins edit access to the Binome Sheets folder (Change
   members / Cover / Apply need it); timing limits back to 24 / 48 / 12 in Settings › Alerts and timing.
6. **Full simulation on real data, before TEST_MODE goes off.** Feed the 273 applications of 2025 (Drive: VIC
   Recruitment 2026 › "Last Year Registration Applications", tab RAW, same 34 columns as Registration Responses) into
   Registration Responses one at a time, each stamped with its arrival time. The 1-minute sync routes them into the 32
   binomes. Then the owner plays each binome and fills its sheet. **Fed 2026-10-04 20:18–20:50**: all 273 assigned,
   none waiting, no duplicates; IT & HR binomes 13–14 each, FLER/COMM & HR 5–6, HR-only 5. The owner is now filling
   the sheets. (The 1-minute sync had stopped at 20:10; re-running Setup brought it back.)
   - Rows written through the Sheets API don't fire the form trigger; the 1-minute sync picks them up the same way.
   - The test timing limits (32 / 40 / 5) apply: candidates not handled in time raise NOT_CONTACTED / NO_DATE alerts,
     emailed to both admins.
   - Clean up before launch as on 2026-10-03 ([testing.md](docs/testing.md), "Clean up at the end"): delete the rows
     of Registration Responses, Interview Responses and Interview Log, Accept the Interviewees deletions (this also
     empties the binome sheets), clear Alerts.
7. **Launch:** TEST_MODE off (Settings › Sharing and email) → Maintenance › Re-share binome sheets → share the
   registration form → watch Alerts.
8. **After recruitment:** hand over the Cloud project, Vercel and the trigger owner
   ([vercel.md](docs/vercel.md#still-open)).

## Later (not needed for launch)

- **Schedule** (calendar of the interviews set, plus admin events saved in the Master) and **Analytics** (a profile
  for each applicant and stats, birth-year fixes included) are planned in [docs/plans.md](docs/plans.md).
- **Binome desk** dropped (2026-10-04); remove the page in the next UI PR.
- **Binome view**, an idea kept but not planned: members use the dashboard instead of their binome sheet, and the
  script fills the sheet for them.
- Retire the Apps Script web app too (`Index.html`, `NoAccess.html`, `doGet`): once the other-account checks pass,
  make `doGet` send people to Vercel. It is the last copy of the old dashboard, kept as a read-only fallback.
