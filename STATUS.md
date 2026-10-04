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
    emails on 2026-10-04 and were paired into a new binome with **Pair two…**.
  - 31 binomes locked, sheets created, **not shared**: B.01–B.28 pair HR with IT / FLER / COMM; B.29 and B.30 are two
    HR members (tag `HR`, so they only get HR candidates); **B.31 is one HR member alone**.
  - No registrations, interviewees, forms or member changes. The ~185 alerts raised by the re-import and reset are all
    closed. The 49 old binome sheets are in the owner's Drive trash (Drive deletes them after 30 days).
  - Setup's v2 changes are in place (every Settings row, the Member Changes tab, Team column E "Exclude").
  - Timing limits are still the test values 32 / 40 / 5 (24 / 48 / 12 before launch).
- Phases A–D, the timing and interview-form cases and the Reset were all tested live on 2026-10-03:
  [docs/history.md](docs/history.md#live-test-2026-10-03).

## Brief for 2026-10-04

In order. Each step says where to do it.

1. ~~**Fix the two IT members without an email.**~~ Done 2026-10-04: emails added, paired with Pair two… (#15).
2. **Settle the leftovers of the draft** at the same time: B.29 / B.30 (HR + HR) and B.31 (alone). Accept them, or
   move people with Change members. Open question 2 in [decisions.md](docs/decisions.md#open-questions).
3. **Check the new sheets once:** Maintenance › Check integrity (expect every binome sheet checked, nothing
   found). Apps Script › Executions should show the 1-minute sync running, and how long today's Lock took (Vercel
   stops a call at 300 s).
4. **Other-account checks on the new UI** ([vercel.md](docs/vercel.md#still-open)): an editor, a removed ENP account
   ("No access", no flash of the dashboard), a viewer ("View only"), a multi-account browser, sign-out then sign-in
   within 48 h. Then share the URL with the editors.
5. **Before launch:** reword the 2026 forms (they still say 2025 in places); verify the guessed email
   `rami.ahmane@g.enp.edu.dz` (now in B.19); answer the [open questions](docs/decisions.md#open-questions); give
   admins edit access to the Binome Sheets folder (Change members / Cover / Apply need it); timing limits back to
   24 / 48 / 12 in Settings › Alerts and timing.
6. **Launch:** TEST_MODE off (Settings › Sharing and email) → Maintenance › Re-share binome sheets → share the
   registration form → watch Alerts.
7. **After recruitment:** hand over the Cloud project, Vercel and the trigger owner
   ([vercel.md](docs/vercel.md#still-open)).

## Later (not needed for launch)

- The three placeholder pages (Schedule, Binome desk, Analytics) and a read-only "my binome" view for binome members:
  [docs/frontend.md](docs/frontend.md#still-open).
- Retire the Apps Script web app too (`Index.html`, `NoAccess.html`, `doGet`): once the other-account checks pass,
  make `doGet` send people to Vercel. It is the last copy of the old dashboard, kept as a read-only fallback.
