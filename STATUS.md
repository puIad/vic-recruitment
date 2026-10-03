# STATUS — VIC Recruitment 2026

Updated 2026-10-03 (evening). Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything else:
[docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

## Live now

- Script: web app **@29**, API **@30** (2026-10-03), `main` at `1a8acd8`. Vercel serves `main`.
- Built and deployed: v2 core, Vercel dashboard, settings editing, and the after-lock phases **A** (no pairing after
  lock), **B** (change/swap members), **C** (temporary covers), **D** (manual-edit detection, odd values, full sheet
  check). What each does: [docs/architecture.md](docs/architecture.md#after-lock-phases-ad).
- **New dashboard UI built, not deployed** (`frontend/`): Vite + React + shadcn in the VIC charter look, same `/api/run` contract, every old action ported. Settings > **Change history** is real (reads the Member Changes tab, needs the script redeployed). Three labelled placeholders left: Schedule, Binome desk, Analytics. The Vercel cut-over is wired on branch `frontend-cutover` (**not merged**; merging is the cut-over). `web/` still serves production. Plan and order: [docs/frontend.md](docs/frontend.md#cut-over-to-vercel-plan).
- **TEST_MODE is on**: mail goes to admins only, nothing is shared. Keep it until launch.
- Master: 49 binomes locked (under v1), sheets created, **not shared**. All test data deleted on 2026-10-03
  ([docs/testing.md](docs/testing.md#test-data-deleted-2026-10-03)): no registrations, interviewees, forms or alerts yet.
  Timing limits are still 32 / 40 / 5 (24 / 48 / 12 before launch).

## Next

0. **Cut over to the new dashboard** ([plan](docs/frontend.md#cut-over-to-vercel-plan)): `npm run deploy` the script (adds `webState.history`) → check the Vercel project settings (outside-root files on, no dashboard build override) → PR `frontend-cutover`, green preview build → merge → owner check on the live URL → the other-account checks (item 4) → delete `web/index.html` and port the tests. Instant Rollback in Vercel undoes it.
1. **A–D passed on the live Master on 2026-10-03** ([results and findings](docs/testing.md#live-test-results-2026-10-03)).
   Accept edits on several alerts at once worked (15 deletions, 2026-10-03).
   Findings 1–4 are fixed and deployed (@27 / @28): [#8](https://github.com/puIad/vic-recruitment-2026/pull/8) hand edit lost during a sync (**before
   launch**), [#9](https://github.com/puIad/vic-recruitment-2026/pull/9) Revert keeps Assigned At, [#10](https://github.com/puIad/vic-recruitment-2026/pull/10) re-read sheets Drive calls unchanged, [#11](https://github.com/puIad/vic-recruitment-2026/pull/11) one alert
   for a name edit. Finding 8 (a row deleted during a sync came back) fixed in [#12](https://github.com/puIad/vic-recruitment-2026/pull/12), deployed @29 / @30. Findings 5–7 need no code.
2. Timing and interview-form cases passed live on 2026-10-03 (same file); test data deleted and accepted the same day.
3. Run **Setup** once from the dashboard (owner) if it hasn't been run since v2: adds missing Settings rows and the
   Member Changes tab, renames Team column E to "Exclude" — then untick E and tick only people who really won't interview.
4. Vercel checks with other accounts (they now run against the new UI, after item 0) (editor, removed account, viewer, multi-account, sign-out/in, Lock near the limit),
   then share the URL with the editors ([docs/vercel.md](docs/vercel.md#still-open)).
5. Before launch: reword the 2026 forms (still say 2025 in places); verify the two guessed OT emails (Rami Ahmane,
   Meriem Hayet Belkacem); answer the [open questions](docs/decisions.md#open-questions); give admins edit access to
   the Binome Sheets folder (Change members / Cover / Apply need it); timing limits back to 24 / 48 / 12.
6. Launch: TEST_MODE = FALSE → Re-share binome sheets → share the registration form → watch Alerts.
7. After recruitment: hand over the Cloud project, Vercel and the trigger owner ([docs/vercel.md](docs/vercel.md#still-open)).
