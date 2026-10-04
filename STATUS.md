# STATUS — VIC Recruitment 2026

Updated 2026-10-04. Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything
else: [docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

## Live now

- **Dashboard:** the new UI (`frontend/`, Vite + React + shadcn in the VIC charter look) has served production since
  [#14](https://github.com/puIad/vic-recruitment-2026/pull/14) (2026-10-03). The old hand-written `web/index.html` was
  deleted the same night. Map of the UI: [docs/frontend.md](docs/frontend.md).
- **Script:** web app **@39**, API **@40**, deployed from `fef4bc6` (adds Change members › New binome,
  [#15](https://github.com/puIad/vic-recruitment-2026/pull/15)). Dashboard: Vercel production at the same commit.
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
   binomes. Then the owner plays each binome and fills its sheet. Not started yet.
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
