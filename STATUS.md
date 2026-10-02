# STATUS — VIC Recruitment 2026

Updated 2026-10-02. Where things stand and what's next. How to work on it: [HANDOFF.md](HANDOFF.md). Everything else:
[docs/](docs/README.md).

Apps Script + Google Sheets automation of the VIC 2026 recruitment (binomes, registration routing, one sheet per
binome, interview-form check, alerts), with a dashboard at **https://vic-recruitment.vercel.app**.

## Live now

- Script: web app **@25**, API **@26** (2026-10-02), `main` at `96313cc`. Vercel serves `main`.
- Built and deployed: v2 core, Vercel dashboard, settings editing, and the after-lock phases **A** (no pairing after
  lock), **B** (change/swap members), **C** (temporary covers), **D** (manual-edit detection, odd values, full sheet
  check). What each does: [docs/architecture.md](docs/architecture.md#after-lock-phases-ad).
- **TEST_MODE is on**: mail goes to admins only, nothing is shared. Keep it until launch.
- Master: 49 binomes locked (under v1), sheets created, **not shared**. Test data (`TEST-xx`, `sim.*`) still in it
  ([docs/testing.md](docs/testing.md#test-data-currently-in-the-live-master-from-2026-10-01)). Timing limits were raised
  to 1000h during the live test.
- Phase D took its baseline after the test rows existed: deleting them will raise manual-edit alerts → select them, **Accept edits**.

## Next

1. **Test A–D on the live Master** ([docs/testing.md](docs/testing.md#manual-test-on-the-live-master-test_mode--true)),
   starting with Maintenance › Check integrity. Check in Apps Script › Executions that the 1-minute sync runs.
2. Finish the live test's timing and interview-form cases (same file), then delete all test data and Accept the edits.
3. Run **Setup** once from the dashboard (owner) if it hasn't been run since v2: adds missing Settings rows and the
   Member Changes tab, renames Team column E to "Exclude" — then untick E and tick only people who really won't interview.
4. Vercel checks with other accounts (editor, removed account, viewer, multi-account, sign-out/in, Lock near the limit),
   then share the URL with the editors ([docs/vercel.md](docs/vercel.md#still-open)).
5. Before launch: reword the 2026 forms (still say 2025 in places); verify the two guessed OT emails (Rami Ahmane,
   Meriem Hayet Belkacem); answer the [open questions](docs/decisions.md#open-questions); give admins edit access to
   the Binome Sheets folder (Change members / Cover / Apply need it); timing limits back to 24 / 48 / 12.
6. Launch: TEST_MODE = FALSE → Re-share binome sheets → share the registration form → watch Alerts.
7. After recruitment: hand over the Cloud project, Vercel and the trigger owner ([docs/vercel.md](docs/vercel.md#still-open)).
