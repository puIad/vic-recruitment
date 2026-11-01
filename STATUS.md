# STATUS — VIC Recruitment 2026

Updated 2026-10-24. Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything
else: [docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

**Add, edit and remove Team members (#197, built 2026-11-01, not deployed).** Team page: Add member, a row menu (Correct name or email, Department and Pair As, Experienced, Not interviewing, Remove) and an Interviewing filter; the Binomes row menu has Correct for each member; Import after Lock merges. Code in `TeamEdit.gs`, tests in `test/team.test.js`. The pending change of kind `team` now takes a `field`. Deploy the script first: an older script's apply entry would write a `field` change into the Experienced column. The script part sits on main, after #195: ship it with #195 after the close (4 Nov 23:59, moved from 5 Nov 18:00 on 2026-11-01), not on `alert-live`.

**Maintenance rows (#196, [#215](https://github.com/puIad/vic-recruitment/pull/215), live 2026-11-01).** Email binome members their binome, and Re-protect binome sheets (owner only). Script @201 / @202 from `alert-live` `4d2b1c8`, so #195 stays off the script until the close (4 Nov 23:59); Vercel is on main. Re-protect has not been run on the real sheets yet. The project hit Apps Script's 200-version limit that day; the oldest 100 were deleted in Project History, and the limit took about a minute to clear.

**My binome outage, 2026-10-31 to 2026-11-01 (fixed live, @197 / @198).** From #191 on, every member's `webState` read the reminder date from the Master's Settings. `closeDate_` caught the refusal, but Google still failed the call, so members who aren't admins saw "You do not have permission to access the requested document." on My binome: 159 refusals from 15 accounts, 31 Oct 22:33 to 1 Nov 18:15 UTC. The date now reaches members with their slice, at the next sync. @197 / @198 hold this fix on top of `d30266b`, so #195 stays undeployed. `m.call` in the tests now fails on such a read. A repeat now raises a HIGH `CALLS_FAILING` alert within one sync, mailed to `ADMIN_EMAIL`: `web/api/run.js` notes failed calls in Redis and `api/drops.js` hands them to the sync. Google Cloud alerts can't do this job, because the Cloud project has no billing account. The script runs branch `alert-live` (@199 / @200) until #195 ships: base a script hotfix on that branch, not main.

**Pause and resume a binome (#186, built 2026-10-31, spec in [docs/admin-features.md](docs/admin-features.md#pause-and-resume-a-binome)).** Row menu on the Binomes page, code in `Pause.gs`. Deploy order: `clasp push` and both deployments, **vic.rh runs Setup** (Paused Until's date format and note; the first load adds its header if that column is empty, and a pause refuses while another header is there), then Vercel. A pending change of kind `binome`; moves that fail become `bmove` drops.

**Where it stands, 2026-10-24.** Applications open **Monday 26 Oct 2026 at 18:00** and close **Thursday 5 Nov at
18:00**, Algiers time (vic-enp decisions 130 and 147). Built and live: everything in the launch scope, the registration
form at `/apply` (section below) and the Overview as the admin's to-do. The owner's launch steps are done (section
below), and load-test task 10 is **signed off by the owner** without a fourth run. Left: the owner's live checks of
Schedule, Analytics, Change history and the Overview. The sections below keep their dates.

## Every mail leaves from vic.rh (2026-10-30)

Confirmations came from vic.rh, the owner or another admin, because `MailApp` sends from the account running the code.
`mail_()` now posts every mail to the mailer ([#184](https://github.com/puIad/vic-recruitment/pull/184)). Live: the
Master's script @173 and @174, the mailer @5, with `MAILER_URL` and `MAIL_SEND_SECRET` set in the script properties. The
owner confirmed a test mail from another admin's dashboard arrived from vic.rh. There is no fallback: if the mailer
fails, the mail is logged and not sent, and a failed confirmation is not retried. All mail shares vic.rh's 1,500
recipients a day (`mailQuota` on the site's `/api/health`). When both scripts change, deploy the mailer first.

## Launch steps done (owner, 2026-10-24)

- The 273 test candidates and every test registration are cleaned out; the final binome reset is done.
- Timing limits are set to the owner's values; screening is **on**.
- **TEST_MODE is off**, and the members have the dashboard.
- A real registration from an admin address went through end to end; screening declined it silently, as it does for a
  VIC member, which is the expected outcome.
- The Google Form fallback stays closed and its link isn't shared.
- **Load-test task 10: signed off by the owner** (2026-10-24: "trust the process, if anything bad happens we fix on the
  spot"). Run 4 was not done, so #104 (members' sheet read) and the 5-minute sync under load are first seen live on
  opening night.
- Pre-launch fixes on the site (vic-enp [#97](https://github.com/puIad/vic-enp/pull/97), decisions 145 to 149): every
  outcome of the registration API counted per hour in the site's Redis (`stats:<hour>`, 30 days) with the troubling
  ones and the mailer's remaining quota on `/api/health`, 300 tickets an hour per connection (was 60), the close on
  5 Nov, and `/apply` keeping a ticket on its way across a reload. The mailer's ping now reports
  `MailApp.getRemainingDailyQuota()` (this repo, `mailer/Code.gs`): it needs a mailer deploy (below).

**Left, owner: move the mailer to a new URL** (2026-10-24). The old web app URL was written in
`docs/registration-form.md` until today and stays in this public repo's history, so the mailer moves to a new
deployment, which also ships the quota in the ping. As `vic.rh`, before 26 Oct 18:00:

1. `cd mailer`, `npx clasp --user vicrh push --force`, then `npx clasp --user vicrh create-deployment -d "quota"`. The
   new web app URL is `https://script.google.com/macros/s/<the new deployment id>/exec`. Keep it out of the repo and
   any chat.
2. Vercel › vic-enp › Settings › Environment Variables: `MAILER_URL` = the new URL, Production and Preview.
3. Merge vic-enp [#97](https://github.com/puIad/vic-enp/pull/97), or Redeploy production, so the new value is live.
   `vic-enp.vercel.app/api/health` reads `mailer: ok` with a `mailQuota` number.
4. Apps Script › Deploy › Manage deployments: archive the old deployment (`@2`). From then the old URL answers nothing.

## Launch checklist (2026-10-17)

One list of what is done and what is left before the registration form opens. Details are in the sections below.
No PR is open. Since 2026-10-18 (@92 / @93 from `f9bdecb`, [#77](https://github.com/puIad/vic-recruitment-2026/pull/77)) every dashboard action logs an `action` line (lockWait, load, writes, tracker, publish) next to the sync's `cycle` line, after a reassign took 54 s; waiting for the next slow one to read it. Slice 3 ([#68](https://github.com/puIad/vic-recruitment-2026/issues/68)) is deployed with the switch off: script [#75](https://github.com/puIad/vic-recruitment-2026/pull/75) as web app **@90** / API **@91** from `9b9846f` (pulled back equal to `main`), Vercel [#76](https://github.com/puIad/vic-recruitment-2026/pull/76) live from `9825142` (real build: npm install + `tsc -b && vite build`, "Deployment completed", no runtime errors). Save settings and My binome fields now go through the accept step when the switch is on. The owner's live check passed on 2026-10-18 (a setting as an admin, a My binome field as a member, the partner's screen). Pending-changes slices 2–5 (#67–#70) are all built and live with the switch off; task 10 is next.

**Owner, 2026-10-19: launch with pending changes on.** Task 10's sign-off runs with the switch on and judges the pending
path; the direct path (switch off) is the fallback, so its marks are informational. Turning the switch on is a launch step
(below).

**Load-test task 10, sign-off run (run 3), 2026-10-19 18:25–18:42 UTC: not signed off**
([load-test.md](docs/load-test.md#task-10--load-test-again-then-sign-off), Notes). Prepared in
[#103](https://github.com/puIad/vic-recruitment-2026/pull/103) (pass marks for the pending path, mark 6 at 90 s / 4 min by
the owner, staggered openings, the owner-only TEST_MODE `webRun dropSlice`; script @112 / @113). The pending path holds
(marks 6–10 pass). Blocking: a member's sheet read always fails (`sliceFromSheet_` formats dates through `S_()`, which opens
the Master members can't open: #101 did not fix it; fixed by #104, not yet re-run), the sync's publish phase stalled 97–202 s under the load and three
timed syncs were skipped in a row (mark 11; reproduced with read-only polling alone, see load-test.md task 10 Notes; per-step
times now in the `cycle` line as `snapT`; `ss_()` now opens the Master once per execution, effect not yet measured), and the reads miss (opening p95 5.8 s admins / 11.0 s members, `webState` p95
3.8 s). Left after the run: everything put back (three alerts by hand), every pending record clear, TEST_MODE on, and
**pending changes on** (owner, 2026-10-19: on from now).

**Polling budget** ([#102](https://github.com/puIad/vic-recruitment-2026/pull/102), merged 2026-10-19 17:43 UTC as `f41499a`), Vercel only: admins poll every 5 s and members every 30 s (2 s / 15 s before), an open tab nobody touches polls 4× slower after 3 min and stops after 15 min, `webAccess` / `webPulse` end at Google after 25 s (a hung member poll ran to 285 s in load-test run 1), and the sync's sweep reads only the authors in the Redis set `pcx`. Live from `f41499a` at 17:44 UTC (real build: frontend `npm ci` 316 packages, `tsc -b && vite build`, 3,460 modules, "Deployment completed"), no runtime errors since, and the new sweep answers every minute (`open: 0`). Nothing was left outside `pcx`: the old full sweep answered `open: 0` every minute from 17:15 to 17:43, after runs 1 and 2. Why and the day estimate: [vercel.md](docs/vercel.md#free-limits-and-what-spends-them).

**Audit fixes, 2026-10-19** ([#96](https://github.com/puIad/vic-recruitment-2026/pull/96), merged 2026-10-19 00:40 UTC as `16a004d`): a binome's patched slice is now kept while its dirty mark exists (`publishBins_`), so no publish without a pull (an admin action, a form submission, a cache miss) flips a member's saved value back for the partner. The script part is live in @104 / @105 (from `e76ea6e`, which contains `16a004d`), the frontend part on Vercel from `16a004d`. Frontend: newest-refresh-wins in the store, stable table pages, My binome drafts in localStorage, preload-error reload plus an error boundary, alert messages visible on phones.

**Slice 4** ([#69](https://github.com/puIad/vic-recruitment-2026/issues/69)) is deployed with the switch off, 2026-10-18. Vercel [#78](https://github.com/puIad/vic-recruitment-2026/pull/78) went live from `98db5a6`: `api/drops`, the seen mark, the next-visit dialog, and the sign-in asking for `script.external_request`. `DROPS_SECRET` is set in Vercel and live from `1013333` (`api/drops` answers 403 without it). Script [#79](https://github.com/puIad/vic-recruitment-2026/pull/79) is web app **@94** / API **@95** from `1013333`, pulled back equal to `main`. Every timed sync calls `api/drops`, emails drops nobody saw and raises `DROPPED|<email>`. The new scope means every admin's next dashboard call answers "one more Google permission": sign in again once and allow it. Owner steps done 2026-10-18: Setup run as `vic.rh`, the `DROPS_SECRET` script property set. Since 18:29 UTC the timed sync calls `api/drops` about once a minute; it passes the secret check and answers mail 0 / alert 0 / open 0, and the cycle line shows `drops` around 300 ms. Live check skipped by the owner on 2026-10-18, issue #69 closed. Verified live: a drop shown and answered on the page (18:42 UTC), the sync's calls to `api/drops`. Never run live: the email, the next-visit dialog and the `DROPPED|<email>` alert; tests and the local mock (`npm run mock -- --away`) cover them. Load-test task 10's pending-changes block is the next chance to see them. An env-var-only Redeploy of the live commit used to be canceled by `ignoreCommand` (this one went out with #79's merge); [#80](https://github.com/puIad/vic-recruitment-2026/pull/80) makes it build.

**Slice 5's revoke is removed** (2026-10-29): the dashboard no longer revokes an ENP account's grant, since a revoke
also ends the script's grant and stopped `vic.rh`'s timed sync; see [docs/vercel.md](docs/vercel.md). History:

**Slice 5** ([#70](https://github.com/puIad/vic-recruitment-2026/issues/70), closed) is live from `f4288c4`, 2026-10-18,
Vercel only ([#81](https://github.com/puIad/vic-recruitment-2026/pull/81)). Another account signing in on a browser
inside the outgoing person's 48 h, with their changes still pending, sets `pcr:<email>` ("revoke when done") instead of
revoking; the consumer revokes with the last change's access token once none is left (a cancelled last change too).
Nothing pending or Redis unreadable revokes at once; every sign-in clears the incoming person's mark. Sign out and
Switch account wait for a save still being accepted; with changes pending both land on the sign-in screen, which says how
many are still saving. Owner, 2026-10-18: no refresh token on the server (#56), so a mark whose last change is swept by
`api/drops` (no token) just expires, an accepted cost; Switch account keeps Google's own account picker. Live check:
load-test task 10's pending-changes block (the account switch with changes pending).

**Pipeline audit fixes (2026-10-19)**, [#95](https://github.com/puIad/vic-recruitment-2026/pull/95), live 2026-10-19 as @104 / @105 from `e76ea6e` (Vercel production from `e76ea6e`, 00:44 UTC; the owner checked a protected binome sheet in TEST_MODE the same day). One binome sheet that refuses a write no longer stops the sync (placing and the interview mark are caught: candidate stays UNASSIGNED, sheet skipped for the run, HIGH FILE_ERROR); placing a code already in the sheet adds nothing; the pull reads the first row of a code that is on two rows; a code whose row was deleted by hand is never handed out again (the baseline's codes count); Revert keeps Interview Submitted At / Log Row / Screening; the HOUR check skips an interview day saved without a time. Also carries the department-change commit `9734397` that missed #84. Tests: `test/pipeline.test.js`, web.test.js revert case.

Launch features ([launch-features.md](docs/launch-features.md)):

- Done: **pairing with experience** (#32, live 2026-10-15; the 32 production binomes were made with it and locked).
- Done in code: **screening** (#33, live 2026-10-17). The owner ran Setup and linked and shared the members sheet
  (2026-10-17) and tested it on 2026-10-19: it flags the good applications from the bad correctly. Whether the switch
  is on is not recorded here.
- Done: **change a binome's department** from the dashboard
  ([#84](https://github.com/puIad/vic-recruitment-2026/pull/84), launch-features section 3): Binomes › ⋯ › Change
  department…, and Apply on a hand-edited Tag. Owner (2026-10-18): no ALL choice, Apply on the alert. Live 2026-10-18:
  the script went out with #85's deploy (@96 / @97 from `845bdba`). Checked by the owner on 2026-10-19.
- Done: **emails** ([#45](https://github.com/puIad/vic-recruitment-2026/pull/45), live 2026-10-17 as @85/@86 from `0ea1fa1`): one HTML template in the VIC look for
  every mail the script sends, and a confirmation with their code to every registrant. The owner's inbox preview
  passed (confirmation, alert mail, digest). The confirmation's wording (English placeholder in `CONFIRM_MAIL`,
  Mail.gs) moves into the planned email templates in Settings ([plans.md](docs/plans.md)). The preview registration goes
  with the other test candidates.
- Known, not a bug: **Send digest** from the dashboard takes 3+ minutes, because it runs the full 8 AM cycle (lock
  wait up to 2 min, every binome sheet pulled, full integrity check up to 200 s). Possible fix: skip the integrity
  check when it comes from the dashboard. Not planned yet.
- Done: `SAME_CHOICES` is INFO, and its quick-action hint no longer treats it as a mistake
  ([#82](https://github.com/puIad/vic-recruitment-2026/pull/82), [decisions.md](docs/decisions.md#open-questions),
  question 5). Live with @96 / @97.
- Done (requested 2026-10-18, [interview-form.md](docs/interview-form.md)): **My binome for admins** in a binome
  ([#85](https://github.com/puIad/vic-recruitment-2026/pull/85), @96 / @97) and the **interview form in the dashboard**
  ([#87](https://github.com/puIad/vic-recruitment-2026/pull/87), @98 / @99, Vercel `29c165c`). Live checks open
  (below).
- Done: **HR-only binome weight** (`HR_ONLY_WEIGHT`,
  [launch-features.md](docs/launch-features.md#5-hr-only-binomes-take-a-bigger-share-of-hr-candidates) section 5,
  grilled with the owner 2026-10-18), live 2026-10-18 ([#89](https://github.com/puIad/vic-recruitment-2026/pull/89),
  script @100 / @101, Vercel `de42102`). An HR-only binome's load counts ÷ K (default 2.5) for HR candidates and it wins
  ties, so at launch B.29 and B.30 get the first HR candidates. Settings › General shows the live loads. The HR share card was checked by the owner on 2026-10-19.
- Pulled forward (owner, 2026-10-18): **pending changes**, near-instant saves for Resolve, Snooze, Mute, Unmute, Save
  settings and My binome. Planned for next season on 2026-10-17; slice 0's re-check passed
  ([#66](https://github.com/puIad/vic-recruitment-2026/issues/66)), and slices 2–5 (#67–#70) are built now, one at a
  time. Task 10 waits for them so its sign-off covers the new path, so members get the dashboard, and the launch comes,
  later than 2026-10-20. Shipped first: skip Vercel builds on doc-only pushes
  ([#64](https://github.com/puIad/vic-recruitment-2026/issues/64), live 2026-10-17 from `e70bf5a`, [#71](https://github.com/puIad/vic-recruitment-2026/pull/71): `ignoreCommand` in `web/vercel.json`, see [vercel.md](docs/vercel.md); its own merge built with npm install + Vite) and sign-ins per browser
  ([#65](https://github.com/puIad/vic-recruitment-2026/issues/65), live 2026-10-17 from `f5ab1df`,
  [#72](https://github.com/puIad/vic-recruitment-2026/pull/72): no revoke at the 48 h end or at sign-out, the next
  sign-in on that browser reuses the token with no consent screen; see [vercel.md](docs/vercel.md); its live checks
  are task 10's sign-in block). Plan: [plans.md](docs/plans.md#pending-changes-the-build-plan).
- **Slice 2, alert actions** ([#67](https://github.com/puIad/vic-recruitment-2026/issues/67), closed), live 2026-10-18
  with the switch **off**:
  - Script: [#73](https://github.com/puIad/vic-recruitment-2026/pull/73), web app @88 and API @89, both named
    "apply entry". It adds `webApply`, the owner's switch, the snapshot's `built` time, `npm run rollback -- <version>`,
    and an Alerts save that keeps a Status changed since the sync loaded it.
  - Vercel: [#74](https://github.com/puIad/vic-recruitment-2026/pull/74), production from `f83f66c` (the real build:
    `web/` 30 packages, frontend `npm ci` 316, Vite 3,460 modules). It adds the accept step in `api/run.js`, the
    consumer `api/apply.js`, the pulse flag, drop answers, the overlay and the switch on Settings › General.
  - Store: Upstash Redis Free in us-east-1 (recreated there after a first install in Frankfurt), connected to this
    project only, as `KV_REST_API_*`.
  - Live check passed 2026-10-18 (owner, switch on for it, then off). Vercel's logs show `api/apply` ending 8 changes
    `applied` as vic.rh (one batch of 5) and one `dropped`. Forcing a drop live: hand-edit the Status cell to SNOOZED
    **before** clicking Mute or Resolve on the dashboard (it still shows OPEN until the sync). An edit made after the
    click usually lands too late (a lone change applies within seconds), and Snooze never drops (a snoozed sheet is
    already met).
- Audit fixes 2026-10-19 (Vercel only, see [vercel.md](docs/vercel.md)): the pending path now needs a `webAccess`-checked
  session and caps a record at 300 cells, keeps an undo made during `webApply`, retries a non-scope 403 and a busy lock
  with jitter, sweeps expired cells in the sync's call, and logs the real revoke result. Live: [#94](https://github.com/puIad/vic-recruitment-2026/pull/94),
  Vercel production from `84a0c89` (2026-10-19 00:38 UTC).

Done since 2026-10-15: the 2026-10-17 audit fixes (#37–#43, @81/@82), the Google profile picture (#36), the Owner
check on `TRIGGER_OWNER` (#34), the old Apps Script dashboard retired, and every open and muted alert loaded (#44).
Owner, 2026-10-17: the OAuth client secret rotated, Setup run as `vic.rh`, the members sheet linked and shared, the B.03 email typo fixed, and every
[open question](docs/decisions.md#open-questions) answered (board members are ordinary team members, no ALL
binomes; the confirmation email is planned; `SAME_CHOICES` becomes INFO; new-interviewee mails stay on).

Left, owner (in order), all done on 2026-10-24 (see "Launch steps done" at the top):

1. Clean the 273 test candidates out of the production binomes (brief step 6, "Clean up before launch"), and the
   preview registration with them.
2. Final binome reset just before launch; it also settles #30's member who was shared by hand.
3. Load-test task 10, signed off on the pending path
   ([load-test.md](docs/load-test.md#task-10--load-test-again-then-sign-off)). Still the gate before members get the
   dashboard. Run 3 (2026-10-19) did not sign it off; a fourth run follows the fixes listed above.
4. Launch, the last step: TEST_MODE off → Re-share binome sheets → pending changes on (Settings › General; on since
   2026-10-19, so check it is still on) → share the registration form (`vic-enp.vercel.app/apply`, live since
   2026-10-22; the Google Form is the fallback) → watch Alerts.

Owner answered on 2026-10-19 and done: screening tested (flags the good from the bad), B.08's
`rami.ahmane@g.enp.edu.dz` is correct, the 2026 forms reworded, admin edit access to the Binome Sheets folder and the
timing limits (the owner's), and every live check: #37 (no formula injection), the other-account checks, task 1 / task 4
`cycle` lines, the department change (#84), the HR share card (#89), the settings cleanup pages (#91, #92), both
interview-form parts (#85, #87) and #95's protected binome sheet in TEST_MODE.

A member's `webState` no longer shows Google's "You do not have permission to access the requested document"
([#101](https://github.com/puIad/vic-recruitment-2026/pull/101), web app @110 / API @111 from `3b039f0`, 2026-10-19; load-test
run 1 saw it twice). `memberBook_` read the sheet once behind `openById`, retries once, and a refusal that stays is
"Your binome sheet isn't shared with you yet." The real error goes to the log (`memberBook_` warn). Cause inferred, not
seen: Drive said yes, the first Spreadsheet read was refused. **Wrong cause** (load-test run 3, 2026-10-19, from the
script's stack): the sheet opens fine, and `sliceFromSheet_` then formats its dates through `S_()`, which opens the Master;
members can't open it. Fixed in [#104](https://github.com/puIad/vic-recruitment-2026/pull/104): the dates use the binome sheet's own timezone, and the member block of the web test refuses the Master. Not yet seen live: the next load-test run is the check.

The confirmation's settled wording and the "VIC Recruitment" sender on candidate mails are live
([#99](https://github.com/puIad/vic-recruitment-2026/pull/99), web app @108 / API @109 from `3a834de`, 2026-10-19).
Owner's live check open: a TEST registration from an ADMIN_EMAIL address that is not on the Team, Sync now, the
confirmation arrives from "VIC Recruitment" with the new text. The Settings › Emails editor is live
([#106](https://github.com/puIad/vic-recruitment-2026/pull/106), [#107](https://github.com/puIad/vic-recruitment-2026/pull/107); [plans.md](docs/plans.md), Email texts).
Pending-changes slices 2–5 (#67–#70, [plans.md](docs/plans.md#pending-changes-the-build-plan)) are done.

## Live now

- **Dashboard:** the new UI (`frontend/`, Vite + React + shadcn in the VIC charter look) has served production since
  [#14](https://github.com/puIad/vic-recruitment-2026/pull/14) (2026-10-03). The old hand-written `web/index.html` was
  deleted the same night. Map of the UI: [docs/frontend.md](docs/frontend.md).
  Latest Vercel: `a3712af` (2026-10-22 23:50 UTC, [#146](https://github.com/puIad/vic-recruitment-2026/pull/146)): the
  Overview as the admin's to-do (section below); real build (316 packages, `tsc -b && vite build`, 3,477 modules,
  "Deployment completed"), no runtime errors right after it. Between `f41499a` and it, production also took the PRs
  merged from #103 to #145 (among them the Emails page, the onboarding tour, the themed mails, Schedule, Analytics, the
  sidebar groups, paired mails): `git log --merges f41499a..a3712af`. Before them `f41499a`
  (2026-10-19 17:44 UTC, [#102](https://github.com/puIad/vic-recruitment-2026/pull/102)): polls
  every 5 s for admins and 30 s for members, the idle backoff, the 25 s Google limit on polls, the sync's sweep over `pcx`
  (Launch checklist above). Before it `e76ea6e` (2026-10-19 00:44 UTC, [#95](https://github.com/puIad/vic-recruitment-2026/pull/95)), the merge
  of the pipeline audit fixes and the department change. Since `de42102` (2026-10-18) production moved through
  [#90](https://github.com/puIad/vic-recruitment-2026/pull/90) `9aae012` (FAQs for the shipped features),
  [#91](https://github.com/puIad/vic-recruitment-2026/pull/91) `aa51e86` and [#92](https://github.com/puIad/vic-recruitment-2026/pull/92) `73652b5`
  (Settings cleanup: plain labels, dropdowns, pickers; menu, Connections, Account, Appearance, Change history),
  [#93](https://github.com/puIad/vic-recruitment-2026/pull/93) `999ef14` (lint to zero errors),
  [#94](https://github.com/puIad/vic-recruitment-2026/pull/94) `84a0c89` (pending-changes audit fixes) and
  [#96](https://github.com/puIad/vic-recruitment-2026/pull/96) `16a004d` (audit fixes). Before that `de42102` (2026-10-18, [#89](https://github.com/puIad/vic-recruitment-2026/pull/89)): the HR-only binome
  weight on Settings › General and its "How HR candidates are shared" card; real build checked in the Vercel log (316
  packages, `tsc -b && vite build`, 3,457 modules, "Deployment completed"), no runtime errors. Before that `2c4b45c` (2026-10-18, [#88](https://github.com/puIad/vic-recruitment-2026/pull/88)): `/api/run` answers a
  dropped connection to Google with code `LOST` ("may have finished anyway: refresh before trying again") and logs its cause,
  after a Sync now lost its connection at 41 s while the script finished; real build checked in the Vercel log.
  UI before it: `29c165c` (2026-10-18, [#87](https://github.com/puIad/vic-recruitment-2026/pull/87)): the interview form in
  the dashboard (My binome's Interview form column, the form page at `/interview/:code` and `/my-binome/interview/:code`);
  real build checked in the Vercel log (316 packages installed, `tsc -b && vite build`). Before that `845bdba` (2026-10-18,
  [#85](https://github.com/puIad/vic-recruitment-2026/pull/85)): an admin in a binome gets My binome under People
  (`/my-binome`). Before that `f4288c4` (2026-10-18, [#81](https://github.com/puIad/vic-recruitment-2026/pull/81), pending-changes
  slice 5); the pending-changes PRs #71–#81 are in the Launch checklist above. Before that `9aaad16` (2026-10-17, [#33](https://github.com/puIad/vic-recruitment-2026/pull/33)): **Settings › Screening**,
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
- **Script, latest:** web app **@116**, API **@117** from `e2c3b19` (2026-10-19,
  [#104](https://github.com/puIad/vic-recruitment-2026/pull/104): member sheet read in the sheet's own timezone; 19 files
  pushed, both at "apply entry"). Before it web app **@112**, API **@113** from `6c1dc5f` (2026-10-19,
  [#103](https://github.com/puIad/vic-recruitment-2026/pull/103): `webRun dropSlice`, owner and TEST_MODE only, for load-test
  task 10; 19 files pushed, all 19 equal to `main` when pulled back, both at "apply entry"). Before it @110 / @111 from
  `3b039f0` (#101), @108 / @109 from `3a834de` (#99). Before those web app **@104**, API **@105** from `e76ea6e` (2026-10-19,
  [#95](https://github.com/puIad/vic-recruitment-2026/pull/95), which contains #96's `publishBins_` fix; `clasp deployments`
  shows both at "apply entry"). @102 / @103 sit between `de42102` and `e76ea6e`; their source commits are unknown (clasp
  logs no dates or commits, only "apply entry"). Before that web app **@100**, API **@101** from `de42102` (2026-10-18,
  [#89](https://github.com/puIad/vic-recruitment-2026/pull/89), `HR_ONLY_WEIGHT` in `pickBinome` and each binome's `load`
  in the snapshot; deployed from PowerShell, 19 files pushed, all 19 equal to `main` when pulled back). Before that web
  app **@98**, API **@99** from `29c165c` (2026-10-18,
  [#87](https://github.com/puIad/vic-recruitment-2026/pull/87), the interview form in the dashboard: Interview Answers tab
  in each binome sheet, Dashboard Interviews in the Master, made by the first form; deployed from Git Bash, 19 files
  pushed). Before that web app **@96**, API **@97** from `845bdba` (2026-10-18,
  [#85](https://github.com/puIad/vic-recruitment-2026/pull/85), My binome for admins in a binome; deployed from Git Bash:
  under PowerShell `npm test` failed at `test/vercel.test.js` 514, no `sh` on PATH; fixed by
  [#86](https://github.com/puIad/vic-recruitment-2026/pull/86) the same day, so PowerShell works again). Before that web app **@94**, API **@95** from `1013333` (2026-10-18,
  [#79](https://github.com/puIad/vic-recruitment-2026/pull/79), pending-changes slice 4); @88–@93 (slices 2–3, the
  action timing line) are in the Launch checklist above.
- **Script, before the pending-changes build:** web app **@83**, API **@84**, most likely from `75f64c4` (2026-10-17,
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
  `main`. The owner ran Setup as `vic.rh` and linked and shared the members sheet (2026-10-17); turning screening on is left.
- **Script, before that:** web app **@73**, API **@74**, deployed from `87a7871` (2026-10-15,
  [#32](https://github.com/puIad/vic-recruitment-2026/pull/32)): pairing with experience. Team column G **Experienced**
  (Import ticks the 2025 team), the draw gives new members an experienced partner when there are enough, and the draft
  actions `draftPair` / `draftUnpair` / `draft {keep}` / `teamSet`. No `API_VERSION` bump. 18 files pushed; the live project
  pulled back afterwards: all 18 equal to `main`. Setup run and the production pairing done (2026-10-15 / 2026-10-17).
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
- **TEST_MODE is off** since 2026-10-24 (owner): mail and sharing are no longer held back to the admins.
- **Master: production binomes** (2026-10-15: Setup, Reset all binomes, Import team, pairs made on the Pairing
  panel, Lock; TEST_MODE on). This replaced the 32 test binomes of 2026-10-03.
  - Team: 65 rows (34 HR, 12 IT, 10 FLER, 9 COMM, no board / ALL rows), one FLER member excluded; 37 ticked
    Experienced.
  - 32 binomes locked, every one a pair, sheets created, **not shared**: B.01–B.10, B.31, B.32 `IT & HR` (12);
    B.11–B.19 `COMM & HR` (9); B.20–B.28 `FLER & HR` (9); B.29, B.30 `HR` (2, two HR members). Mix: 21 experienced
    with new, 8 both experienced, **3 both new** (B.10, B.11, B.18).
  - B.03's typo email (`enp` twice) was fixed by the owner on 2026-10-17. B.08 still has the guessed
    `rami.ahmane@g.enp.edu.dz`, which the owner confirmed correct on 2026-10-19.
  - Registration Responses and Interviewees still hold the 273 applications of 2025 fed in on 2026-10-04. The Reset
    put them back to waiting and the Lock **assigned all 273 to the production binomes** (Assigned At 15/10 13:07), so
    the new binome sheets hold test candidates and the test timing limits will raise NOT_CONTACTED alerts to the
    admins. Clean up before launch as in step 6 below. They are also the screening calibration set.
  - Setup's v2 changes are in place (every Settings row, the Member Changes tab, Team column E "Exclude", column G
    "Experienced").
  - Timing limits are still the test values 32 / 40 / 5 (24 / 48 / 12 before launch, the owner's to set).
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
Progress (task 10 is being rewritten for the current dashboard): task 1 (sync timing lines) is deployed; its reading of the first `cycle` lines is open. Task 2 (refused = error) is deployed
([#19](https://github.com/puIad/vic-recruitment-2026/pull/19)). Task 3 (one poll call per tick, 20 s timeout, rate-limit pause) is live ([#23](https://github.com/puIad/vic-recruitment-2026/pull/23), UI only, Vercel production from `963144d`). Task 9: code deployed ([#20](https://github.com/puIad/vic-recruitment-2026/pull/20)); the owner moved the triggers to `vic.rh` (2026-10-06). Follow-ups [#21](https://github.com/puIad/vic-recruitment-2026/pull/21) and [#22](https://github.com/puIad/vic-recruitment-2026/pull/22) are live: Check integrity flags binome sheets whose protection doesn't list `vic.rh`, the owner repairs them in bulk from Alerts or with the menu's Re-protect binome sheets. Task 4 (write only what changed) is deployed ([#24](https://github.com/puIad/vic-recruitment-2026/pull/24), @61/@62); its ~20 `cycle` lines are open. Task 5 (cached admin snapshot) is deployed ([#26](https://github.com/puIad/vic-recruitment-2026/pull/26), @63/@64); its live `webState` times are open. Task 6 (member role, read side) is deployed ([#27](https://github.com/puIad/vic-recruitment-2026/pull/27), @65/@66). Task 7 (My binome page, 15 s member polling) is live ([#28](https://github.com/puIad/vic-recruitment-2026/pull/28), UI only, Vercel production from `b9f84c0`); a real member sign-in on the live site is still to check (with TEST_MODE on, nothing is shared, so expect "Your binome sheet isn't shared with you yet"). Task 8 (members edit their binome) is deployed ([#29](https://github.com/puIad/vic-recruitment-2026/pull/29), @67/@68), and after the owner's live check members get the dashboard only once an admin opens their binome ([#30](https://github.com/puIad/vic-recruitment-2026/pull/30), @69/@70, Vercel production from `6b690e5`); #30's live check is open. Next: 10 (load test again, then sign off), once task 9's owner steps are confirmed.

## Next: pairing, screening, department change (requested 2026-10-15)

Planned in [docs/launch-features.md](docs/launch-features.md). Pairing with experience (random or by hand) is live
(@73/@74 and Vercel from `87a7871`) and the owner used it for the production binomes on 2026-10-15 (above). Screening
(hold low-effort applications for review, decline VIC members silently, the rejection email, plus the name swap) is
merged and deployed ([#33](https://github.com/puIad/vic-recruitment-2026/pull/33), @75/@76 and Vercel from `9aaad16`, 2026-10-17),
calibrated with the owner on the 273 applications of 2025 (11 held at 50). The owner ran Setup and linked the
members sheet (2026-10-17) and tested it on 2026-10-19: it flags the good from the bad. Changing a binome's department from the dashboard is live
([#84](https://github.com/puIad/vic-recruitment-2026/pull/84), 2026-10-18, script @96 / @97) and checked by the owner (2026-10-19).

## Next: My binome for admins, interview form in the dashboard (requested 2026-10-18)

Planned in [docs/interview-form.md](docs/interview-form.md), grilled with the owner on 2026-10-18. Both parts are live:

- Part 1, admins who are in a binome get My binome (People group, same rules as members): script @96 / @97 and Vercel
  from `845bdba` ([#85](https://github.com/puIad/vic-recruitment-2026/pull/85)).
- Part 2, a native interview form per candidate, saved to an Interview Answers tab in the binome sheet, copied to the
  Master's Dashboard Interviews by the sync, editable any time; every interview form fills Rating and Final Affectation:
  script @98 / @99 and Vercel from `29c165c` ([#87](https://github.com/puIad/vic-recruitment-2026/pull/87)).

Both parts' live checks (each part's Rollout) were done by the owner on 2026-10-19.

## Brief for 2026-10-04 (settled with the owner)

In order. Each step says where to do it.

1. ~~**Fix the two IT members without an email.**~~ Done 2026-10-04: emails added, paired with Pair two… (#15) as
   B.32. One of the two emails had a typo (`enp` twice), later in B.03 of the production binomes; the owner fixed it on
   2026-10-17.
2. ~~**Settle the leftovers of the draft.**~~ Settled: B.29 / B.30 (HR + HR) and B.31 (alone) stay as they are for
   now. The Team tab is the live OT list; the owner adjusts them with Change members as it settles
   ([decisions.md](docs/decisions.md#open-questions), question 2).
3. ~~**Check the new sheets once.**~~ Done by the owner 2026-10-04: Check integrity found nothing.
4. **Other-account checks on the new UI** (done by the owner, 2026-10-19; [vercel.md](docs/vercel.md#still-open)): an
   editor, a removed ENP account ("No access", no flash of the dashboard), a viewer ("View only"), a multi-account
   browser, sign-out then sign-in within 48 h. Then share the URL with the editors.
5. **Before launch:** ~~reword the 2026 forms~~ (done by 2026-10-19); ~~verify B.08's `rami.ahmane@g.enp.edu.dz`~~ (correct, 2026-10-19); ~~fix the B.03 email~~ (done 2026-10-17); ~~answer the
   [open questions](docs/decisions.md#open-questions)~~ (done 2026-10-17); admin edit access to the Binome Sheets folder (Change
   members / Cover / Apply need it) and timing limits back to 24 / 48 / 12 are the owner's.
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
7. **Launch:** TEST_MODE off (Settings › Sharing and email) → Maintenance › Re-share binome sheets → pending changes on
   (Settings › General; owner, 2026-10-19) → share the registration form → watch Alerts.
8. **After recruitment:** hand over the Cloud project, Vercel and the trigger owner
   ([vercel.md](docs/vercel.md#still-open)).

## Next: Schedule, Analytics, move history (owner, 2026-10-22)

Moved before launch with cuts: [plans.md › Launch scope](docs/plans.md#launch-scope-2026-10-22). The script part is
live: [#137](https://github.com/puIad/vic-recruitment-2026/pull/137) merged as `644ccd6`, web app **@128** / API
**@129**, Vercel production READY from `644ccd6` with no runtime errors. It adds the interview time and Schedule fields
on `webState`, `webAnalytics()` (admins only) and the Interviewee Changes tab (moves and accepted hand edits, emptied by
Reset all binomes), so load-test run 4 measures it. The pages are live on Vercel from `35f1874` (frontend only, no
script deploy): Schedule with This week on My binome ([#138](https://github.com/puIad/vic-recruitment-2026/pull/138))
and Analytics with the applicant profile ([#139](https://github.com/puIad/vic-recruitment-2026/pull/139); no 2025
curve, the 2025 file isn't on disk). Change history shows Interviewee Changes (Moved, Edit accepted filters), and
`npm run test:ui` (`test/ui.smoke.js`) opens every page as an admin, an admin in a binome and a member
([#140](https://github.com/puIad/vic-recruitment-2026/pull/140), live from `cdb8ab8`). The launch scope is built; none
of it has been checked live by the owner yet.

## Overview as the admin's to-do (#144, 2026-10-23)

Live on Vercel from `a3712af` ([#146](https://github.com/puIad/vic-recruitment-2026/pull/146), frontend only, no script
deploy). The Overview reads only and links out (`lib/vic/overview.ts`, tested by `test/overview.test.js`):

- **To do:** one row per kind, worst first. Assignments paused and sheet sharing off lead, then open alerts by type
  (with the author's pending changes), applications on hold and members without a binome after lock; test mode trails.
  Past six kinds of alert the rest fold into one row. Each row opens Alerts (`?type=A,B`), Binomes or Settings already
  filtered.
- **Launch sequence** beside it until binomes are locked, then gone.
- **Pipeline strip:** one row with registrants, first choices, the stage bar, the contacted / scheduled / interviewed
  shares and Full breakdown → Analytics. By first choice is gone.
- **Binomes behind:** locked binomes by open alerts, then the lowest share interviewed.
- **Activity** moved to the top bar: an admin's live status opens it (Refresh inside), with a red dot when the last
  action failed.

Not checked live by the owner yet. Not seen on screen at all: the layout before lock and the "All clear" state (the
mock is locked with open alerts).

## Registration form at `/apply` (live 2026-10-22)

The registration form on the vic-enp site, with the Google Form as fallback: [docs/registration-form.md](docs/registration-form.md)
(wayfinder map [#110](https://github.com/puIad/vic-recruitment-2026/issues/110), tickets #126 to #134, all closed on
22 Oct). Built on 22 Oct, ahead of the 23 and 24 Oct plan, and its live check passed that evening
([#134](https://github.com/puIad/vic-recruitment-2026/issues/134)): production's `VITE_APPLY_URL` is `/apply` since
20:43 UTC, `/api/health` answers all `ok` (redis, mailer, sheets, headers; checked again 2026-10-23), and the freeze is on.
Every CTA on `vic-enp.vercel.app` now opens it; setting `VITE_APPLY_URL` back to the Google Form's responder link is the
fallback switch.

- Mails (S2, [#128](https://github.com/puIad/vic-recruitment-2026/issues/128)): the themed ticket and confirmation, the
  Registration ticket card on Settings › Emails, and the mailer (`mailer/Code.gs`, deployed as `vic.rh`, @2). The bound
  script at @126 / @127, both themed test mails checked by the owner.
- Master: `SYNC_EVERY_MINUTES` is 5 since #129. No load-test run has measured the dashboard at that pace.
- Left: the Master and Redis cleanup after the live check were done by the owner and not re-checked; the owner's
  real-phone check of `/apply` inside Instagram on Android and iPhone is part of the landing's launch
  ([vic-enp#45](https://github.com/puIad/vic-enp/issues/45)).

## Later (not needed for launch)

- **Binome desk** dropped (2026-10-04) and removed from the UI (2026-10-18).
- **Binome view**, an idea kept but not planned: members use the dashboard instead of their binome sheet, and the
  script fills the sheet for them.
- Retired the Apps Script web app's old dashboard (2026-10-17): `Index.html` and `NoAccess.html` are deleted, and its
  URL (`doGet`) now shows a link to the Vercel dashboard.
