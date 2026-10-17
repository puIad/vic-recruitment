# STATUS — VIC Recruitment 2026

Updated 2026-10-17. Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything
else: [docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

## Launch checklist (2026-10-17)

One list of what is done and what is left before the registration form opens. Details are in the sections below.
No PR or issue is open.

Launch features ([launch-features.md](docs/launch-features.md)):

- Done: **pairing with experience** (#32, live 2026-10-15; the 32 production binomes were made with it and locked).
- Done in code: **screening** (#33, live 2026-10-17). Off until the owner does rollout steps 3 and 4: Setup once as
  `vic.rh`, link and share the members sheet in Settings › Screening, turn it on, test one member / one junk / one
  decent application in TEST_MODE, then Send rejections… once.
- Not built: **change a binome's department** from the dashboard (launch-features section 3; a hand edit of the Tag
  plus Accept works meanwhile).
- Not built, planned 2026-10-15 in a session note only (not yet written into launch-features): `HR_ONLY_WEIGHT`, a
  weight that gives pure `HR` binomes (B.29, B.30) their share of HR candidates. The owner wants it after screening.

Done since 2026-10-15: the 2026-10-17 audit fixes (#37–#43, @81/@82), the Google profile picture (#36), the Owner
check on `TRIGGER_OWNER` (#34), the old Apps Script dashboard retired, and every open and muted alert loaded (#44).

Left, owner (in order):

1. Setup once as `vic.rh` from the Master's menu (pairing's checkbox rule, screening's status colours).
2. Screening rollout steps 3 and 4 (above).
3. Fix the B.03 email typo (`enp` twice) and verify B.08's guessed email: Change members › Replace.
4. Reword the 2026 forms (they still say 2025; the confirmation must not promise an interview).
5. Answer the [open questions](docs/decisions.md#open-questions) (board members interviewing, confirmation email…).
6. Give admins edit access to the Binome Sheets folder; timing limits back to 24 / 48 / 12.
7. Live checks still open: #37 (`=1+1` in a form, a Discord handle starting with `-`), #30 (the member shared by hand
   during task 8 still gets in: set that binome to No access), the other-account checks
   ([vercel.md](docs/vercel.md#still-open)), task 1 / task 4 `cycle` lines.
8. Clean the 273 test candidates out of the production binomes (brief step 6, "Clean up before launch").
9. Load-test task 10: load test again and sign off before members get the dashboard.
10. Launch: TEST_MODE off → Re-share binome sheets → share the registration form → watch Alerts.

## Live now

- **Dashboard:** the new UI (`frontend/`, Vite + React + shadcn in the VIC charter look) has served production since
  [#14](https://github.com/puIad/vic-recruitment-2026/pull/14) (2026-10-03). The old hand-written `web/index.html` was
  deleted the same night. Map of the UI: [docs/frontend.md](docs/frontend.md).
  Latest UI: `9aaad16` (2026-10-17, [#33](https://github.com/puIad/vic-recruitment-2026/pull/33)): **Settings › Screening**,
  plus the screening changes on Alerts (quick actions), Interviewees and the Overview Pipeline card. Vercel production
  built from `9aaad16` (`npm install` 316 packages, `tsc -b && vite build`; "Deployment completed"; no runtime errors in the
  first hour). Before that `87a7871` (2026-10-15, [#32](https://github.com/puIad/vic-recruitment-2026/pull/32)): the **Pairing** panel on the
  Binomes page while nothing is locked (pair two by hand, remove, Draw the rest, Redraw all), an Experience column and filter on
  the Team page, the Launch card's step 2 "Pair the binomes". Vercel production built from `87a7871` (the real build: `npm
  install` 316 packages, `tsc -b && vite build`; "Deployment completed"). Before that `8f86b70` (2026-10-10,
  [#31](https://github.com/puIad/vic-recruitment-2026/pull/31)): My binome saves every changed field with one Save.
  Before that `6b690e5` (2026-10-07, [#30](https://github.com/puIad/vic-recruitment-2026/pull/30)): a member gets the dashboard
  only while they can open their binome sheet ("Binome B.xx isn't open yet" otherwise; view = read-only, edit = fills in);
  admins open a binome from Binomes › ⋯ › **Sheet & dashboard access…** (No access / View / Edit for both members, no email,
  works in TEST_MODE), shown as an "Open · view / edit" badge. Before that `9f20f26` (2026-10-07, [#29](https://github.com/puIad/vic-recruitment-2026/pull/29)): members fill in their
  binome's columns (Contacted, day, time, done, rating, affectation, notes) from My binome's details panel, written into their
  binome sheet; a partner's change in between is caught and shown (Keep theirs / Use mine); covers stay read-only (load-test
  plan, task 8). Before that `b9f84c0` (2026-10-07, [#28](https://github.com/puIad/vic-recruitment-2026/pull/28)): members get **My binome**
  (their candidates, statuses, open alerts, a link to their sheet; read-only) and poll every 15 s; admins unchanged (load-test
  plan, task 7). UI only, no script deploy. Before that `6f3cbc3` (2026-10-07, [#27](https://github.com/puIad/vic-recruitment-2026/pull/27)): `API_VERSION` 3. Before that `963144d` (2026-10-06, [#23](https://github.com/puIad/vic-recruitment-2026/pull/23)): one poll call per tick, a 20 s
  poll timeout, a quiet 30 s pause on Google's rate limit (load-test plan, task 3).
- **Script, latest:** web app **@83**, API **@84**, most likely from `75f64c4` (2026-10-17,
  [#44](https://github.com/puIad/vic-recruitment-2026/pull/44); not logged at deploy time, found 2026-10-17 with
  `clasp deployments`): the dashboard payload no longer cuts open alerts at 300 and snoozed / muted ones at 200. The live
  `QuickFix.gs` and `WebApp.gs` pulled back equal `main`. Vercel production from `75f64c4` ("Deployment has completed").
- **Script, before that:** web app **@81**, API **@82**, deployed from `e80e7fd` (2026-10-17, the 2026-10-17 audit fixes
  [#37](https://github.com/puIad/vic-recruitment-2026/pull/37)–[#43](https://github.com/puIad/vic-recruitment-2026/pull/43)):
  candidate text starting with `=` `+` `-` written as text (plain-text columns left as they are); the Interview Log written
  after Interviewees is saved; alert IDs numbered from the highest one; placing waiting candidates stops before the 6-min
  limit; row deletes in binome sheets take the members' lock; the old Apps Script dashboard retired (`doGet` = a link to
  Vercel, `Index.html` / `NoAccess.html` deleted, `switchUrl` gone); My binome saves every changed field in one `memberSet`
  call. 17 files pushed, all equal to `main` when pulled back. Vercel production from `e80e7fd` (real build: npm install +
  Vite, 3,458 modules), no runtime errors. The new page went live ~20 s before the script (17:20:15 vs ~17:20:36 UTC): a
  My binome Save in that window would have said "Not allowed".
  Live load test after the deploy (`vic.rh`, read-only, 3 min): 15 editors, 1,141 calls, 2 failed (Google's per-account
  limit, right after the 25-editor run), first dashboard p50 4.9 s, `webState` p50 1.7 s. 25 editors on one account hit
  that limit 319 times (12.3 calls/s), a test artifact: people use their own accounts. First dashboard p50 5.2 s against
  11.6 s on 2026-10-05. Still open: the live checks in #37 (`=1+1` in a form, a Discord handle starting with `-`) and the
  old web app URL showing the link.
- **Script, before that:** web app **@79**, API **@80**, deployed from `6cec554` (2026-10-17,
  [#36](https://github.com/puIad/vic-recruitment-2026/pull/36)): `webAccess` returns `photo` (Drive `about.get` photoLink,
  per-user cache 6h); the sidebar, Account page and no-access gate show it, initials as fallback. CSP `img-src` allows
  `*.googleusercontent.com`. Vercel production from `6cec554`.
- **Script, earlier:** web app **@77**, API **@78**, deployed from `634193a` (2026-10-17,
  [#34](https://github.com/puIad/vic-recruitment-2026/pull/34)): the dashboard's **Owner** (role badge, Setup button, the
  `webRun('setup')` gate) is now `TRIGGER_OWNER` (`vic.rh`), or the Master's Drive owner while it is unset. Drive still lists
  `mourad_islam.fernane@` as the Master's owner and `vic.rh@` as a writer; re-protecting binome sheets still needs that Drive
  owner. Vercel production from `634193a`, no runtime errors. 19 files pushed, all equal to `main` when pulled back.
- **Script, earlier:** web app **@75**, API **@76**, deployed from `9aaad16` (2026-10-17,
  [#33](https://github.com/puIad/vic-recruitment-2026/pull/33)): screening (`Screening.gs`), the silent VIC-member decline, the
  rejection email, the name swap. `npm test` passed, 19 files pushed; the live project pulled back afterwards: all 19 equal to
  `main`. **To do (owner):** run Setup once as `vic.rh` from the Master's menu, then link the members sheet in Settings ›
  Screening and turn screening on.
- **Script, before that:** web app **@73**, API **@74**, deployed from `87a7871` (2026-10-15,
  [#32](https://github.com/puIad/vic-recruitment-2026/pull/32)): pairing with experience. Team column G **Experienced**
  (Import ticks the 2025 team), the draw gives new members an experienced partner when there are enough, and the draft
  actions `draftPair` / `draftUnpair` / `draft {keep}` / `teamSet`. No `API_VERSION` bump. 18 files pushed; the live project
  pulled back afterwards: all 18 equal to `main`. **To do (owner):** run Setup once as `vic.rh` from the Master's menu (the
  checkbox rule on column G), then the production pairing: [launch-features.md](docs/launch-features.md#rollout).
  Versions @71 / @72 were cut after @69 / @70 without an entry here (most likely #31's deploy on 2026-10-10); this deploy
  pushed all of `main`, so #31's Interview Day fix is live either way.
- **Script, before that:** web app **@69**, API **@70**, deployed from `6b690e5` (2026-10-07,
  [#30](https://github.com/puIad/vic-recruitment-2026/pull/30)): the dashboard follows the binome sheet. `access_()` asks Drive
  (as the member) whether they can open their sheet: no → `NOT_SHARED`, view → read-only, edit → can fill in. New
  `webRun('binomeAccess')` sets both members' access silently through the Drive advanced service (now in the manifest, same
  `drive` scope), also in TEST_MODE; the level is kept in `BIN_ACCESS`. With sharing off, a member change carries the level to the
  newcomer and removes the leaver's access. The bulk Re-share and the other automatic shares are unchanged (Drive's email, TEST_MODE
  gate). **To do now:** the member shared by hand during the task-8 live check still gets in: set that binome to No access, or
  remove the share in Drive. Live check of #30 in [docs/load-test.md](docs/load-test.md#task-8--members-edit-their-binome-from-the-dashboard).
- **Script, before that:** web app **@67**, API **@68**, deployed from `9f20f26` (2026-10-07,
  [#29](https://github.com/puIad/vic-recruitment-2026/pull/29)): `webRun('memberSet')` (load-test plan, task 8). A member writes
  one of their binome's columns into their own sheet under the document lock (not the sync's script lock), checked like the
  sheet's validations, refused with the cell's value when the partner changed it; the binome is marked dirty so the next sync
  reads its sheet even when Drive lags, and its cached slice is patched for the partner's next poll. Nothing changes for admins;
  no `API_VERSION` bump. Live check still to do (task 8's Notes): a second account editing every field, the fr_FR date / time,
  whether the document lock is available under `scripts.run`.
- **Script, before that:** web app **@65**, API **@66**, deployed from `6f3cbc3` (2026-10-07,
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
- **Master: production binomes** (2026-10-15: Setup, Reset all binomes, Import team, pairs made on the Pairing
  panel, Lock; TEST_MODE on). This replaced the 32 test binomes of 2026-10-03.
  - Team: 65 rows (34 HR, 12 IT, 10 FLER, 9 COMM, no board / ALL rows), one FLER member excluded; 37 ticked
    Experienced.
  - 32 binomes locked, every one a pair, sheets created, **not shared**: B.01–B.10, B.31, B.32 `IT & HR` (12);
    B.11–B.19 `COMM & HR` (9); B.20–B.28 `FLER & HR` (9); B.29, B.30 `HR` (2, two HR members). Mix: 21 experienced
    with new, 8 both experienced, **3 both new** (B.10, B.11, B.18).
  - **B.03 still has the typo email** `mohamed_louai.bahlouli@g.enp.enp.edu.dz` (`enp` twice), in Binomes and Team.
    B.08 has the guessed `rami.ahmane@g.enp.edu.dz`. Fix before launch (Change members › Replace).
  - Registration Responses and Interviewees still hold the 273 applications of 2025 fed in on 2026-10-04. The Reset
    put them back to waiting and the Lock **assigned all 273 to the production binomes** (Assigned At 15/10 13:07), so
    the new binome sheets hold test candidates and the test timing limits will raise NOT_CONTACTED alerts to the
    admins. Clean up before launch as in step 6 below. They are also the screening calibration set.
  - Setup's v2 changes are in place (every Settings row, the Member Changes tab, Team column E "Exclude", column G
    "Experienced").
  - Timing limits are still the test values 32 / 40 / 5 (24 / 48 / 12 before launch).
- Phases A–D, the timing and interview-form cases and the Reset were all tested live on 2026-10-03:
  [docs/history.md](docs/history.md#live-test-2026-10-03).

Alert quick actions ([#17](https://github.com/puIad/vic-recruitment-2026/pull/17), merged 2026-10-04, `QuickFix.gs`) are
live; how they work: [architecture.md](docs/architecture.md#quick-actions-alerts-page). Nothing is in review.

## Next: members on the dashboard (plan of 2026-10-05)

The load test (100 people at once, model + a live run on production) says the dashboard isn't ready for the binomes
yet: every refresh takes 8–11 s, a refused action shows as a green toast, the owner's trigger time is 89 % used
(`syncAll` 13.4 s on average) and Google limits requests per account per minute. Nothing is lost silently in the sheet
and form paths. The fix is planned as **10 tasks, one per session**, in [docs/load-test.md](docs/load-test.md):
members read and edit their own binome from the dashboard (written into their binome sheet, never the Master),
cached snapshots rebuilt only where something changed, the sync writes only what changed, one poll call per tick,
refused = error, triggers on `vic.rh`. Open the dashboard to the binomes only after task 10 signs it off.
Progress: task 1 (sync timing lines) is deployed; its reading of the first `cycle` lines is open. Task 2 (refused = error) is deployed
([#19](https://github.com/puIad/vic-recruitment-2026/pull/19)). Task 3 (one poll call per tick, 20 s timeout, rate-limit pause) is live ([#23](https://github.com/puIad/vic-recruitment-2026/pull/23), UI only, Vercel production from `963144d`). Task 9: code deployed ([#20](https://github.com/puIad/vic-recruitment-2026/pull/20)); the owner moved the triggers to `vic.rh` (2026-10-06). Follow-ups [#21](https://github.com/puIad/vic-recruitment-2026/pull/21) and [#22](https://github.com/puIad/vic-recruitment-2026/pull/22) are live: Check integrity flags binome sheets whose protection doesn't list `vic.rh`, the owner repairs them in bulk from Alerts or with the menu's Re-protect binome sheets. Task 4 (write only what changed) is deployed ([#24](https://github.com/puIad/vic-recruitment-2026/pull/24), @61/@62); its ~20 `cycle` lines are open. Task 5 (cached admin snapshot) is deployed ([#26](https://github.com/puIad/vic-recruitment-2026/pull/26), @63/@64); its live `webState` times are open. Task 6 (member role, read side) is deployed ([#27](https://github.com/puIad/vic-recruitment-2026/pull/27), @65/@66). Task 7 (My binome page, 15 s member polling) is live ([#28](https://github.com/puIad/vic-recruitment-2026/pull/28), UI only, Vercel production from `b9f84c0`); a real member sign-in on the live site is still to check (with TEST_MODE on, nothing is shared, so expect "Your binome sheet isn't shared with you yet"). Task 8 (members edit their binome) is deployed ([#29](https://github.com/puIad/vic-recruitment-2026/pull/29), @67/@68), and after the owner's live check members get the dashboard only once an admin opens their binome ([#30](https://github.com/puIad/vic-recruitment-2026/pull/30), @69/@70, Vercel production from `6b690e5`); #30's live check is open. Next: 10 (load test again, then sign off), once task 9's owner steps are confirmed.

## Next: pairing, screening, department change (requested 2026-10-15)

Planned in [docs/launch-features.md](docs/launch-features.md). Pairing with experience (random or by hand) is live
(@73/@74 and Vercel from `87a7871`) and the owner used it for the production binomes on 2026-10-15 (above). Screening
(hold low-effort applications for review, decline VIC members silently, the rejection email, plus the name swap) is
merged and deployed ([#33](https://github.com/puIad/vic-recruitment-2026/pull/33), @75/@76 and Vercel from `9aaad16`, 2026-10-17),
calibrated with the owner on the 273 applications of 2025 (11 held at 50). Still to do (owner): Setup once, then link the
members sheet in Settings › Screening and turn it on. Not built yet: changing a binome's department from the dashboard.

## Brief for 2026-10-04 (settled with the owner)

In order. Each step says where to do it.

1. ~~**Fix the two IT members without an email.**~~ Done 2026-10-04: emails added, paired with Pair two… (#15) as
   B.32. **One of the two emails has a typo:** `mohamed_louai.bahlouli@g.enp.enp.edu.dz` (`enp` twice), now in B.03
   of the production binomes. Fix it before launch (Change members › Replace with the right address, or edit the Binomes cell and Apply).
2. ~~**Settle the leftovers of the draft.**~~ Settled: B.29 / B.30 (HR + HR) and B.31 (alone) stay as they are for
   now. The Team tab is the live OT list; the owner adjusts them with Change members as it settles
   ([decisions.md](docs/decisions.md#open-questions), question 2).
3. ~~**Check the new sheets once.**~~ Done by the owner 2026-10-04: Check integrity found nothing.
4. **Other-account checks on the new UI** (owner, later on 2026-10-04; [vercel.md](docs/vercel.md#still-open)): an
   editor, a removed ENP account ("No access", no flash of the dashboard), a viewer ("View only"), a multi-account
   browser, sign-out then sign-in within 48 h. Then share the URL with the editors.
5. **Before launch, by about 2026-10-20:** reword the 2026 forms (they still say 2025 in places); verify the guessed
   email `rami.ahmane@g.enp.edu.dz` (now in B.08); fix the B.03 email (step 1); answer the
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
- Retired the Apps Script web app's old dashboard (2026-10-17): `Index.html` and `NoAccess.html` are deleted, and its
  URL (`doGet`) now shows a link to the Vercel dashboard.
