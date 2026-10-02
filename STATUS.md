# STATUS — VIC Recruitment 2026

Updated 2026-10-01. Full history, decisions and Drive IDs: [HANDOFF.md](HANDOFF.md) (Cowork session, 2026-09-30 → 10-01).

## What this is
Apps Script (v2, split into `Config.gs` + feature files, see the header of `Config.gs`) for the VIC 2026 recruitment master sheet: binome pairing, registration routing,
per-binome sheets, interview-form validation/autocorrect, alerts + daily digest.
Master sheet: `19A46cGCoqNDL7Dat2i2CyHdT108k_dxl84g-N1C6Ghc` (Drive folder `1sXD83B1_-X9D-vXfNEJBYcmu5P6MKQAT`).

## Where it stands
- **v2 + web dashboard pushed to the Master with clasp (2026-10-01)**, web app deployed. `setup` has **not** been re-run
  under v2 yet (needs your OAuth consent once).
- **TEST_MODE** (Settings, default TRUE): emails to anyone but ADMIN_EMAIL are dropped (logged), binome files are not
  shared, Re-share refuses. Set it to FALSE only for the real launch, once the system is proven.
- OT Database fixed: Rami Ahmane → `rami.ahmane@g.enp.edu.dz`, Meriem Hayet Belkacem → `meriem_hayet.belkacem@g.enp.edu.dz`
  (both guessed from the ENP pattern; verify before launch).
- Decided: board interviews as in 2025 (Committee → ALL binomes, Council → HR side); a leftover no-HR binome is fine.
- Tests: `npm test` (unit, e2e, web; web asserts TEST_MODE blocks member mail and sharing).
  `test/realdata.js` needs `test/data/` 2025 exports (personal data, git-ignored, not on disk).
- Preview the dashboard on mock data: `node test/devserver.js` → http://localhost:8787 (`--empty` = before team import).

## Deploy (clasp, linked via `.clasp.json`)
- Web app: https://script.google.com/macros/s/AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT/exec
  (set in `appsscript.json`: runs as the visitor, open to g.enp.edu.dz accounts). Google asks each visitor for
  permission once; anyone who can **edit the Master** gets the dashboard, other accounts get `NoAccess.html` with a
  switch-account button. Add an admin = share the Master with them as editor (same URL, no extra deployment).
- Code change: `npm run deploy` (updates this web app **and** the API deployment below; same URLs, new version).

## Vercel front (PLAN-VERCEL.md) — built 2026-10-01
- `web/` = static `index.html` (port of Index.html) + Node functions `api/{login,callback,run,logout}.js`, deployed by Vercel
  from Git (root `web/`, `main` = production) at https://vic-recruitment.vercel.app. Visitors sign in with Google; `/api/run`
  calls the script through the Apps Script API **as the visitor** (`scripts.run`), so Drive still decides access.
- API executable deployment: `AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU` (Vercel env
  `SCRIPT_API_DEPLOYMENT_ID`). A script change now updates **both** deployments:
  `npm run deploy` (tests → clasp push → update-deployment on both IDs; never `clasp create-deployment`, it makes a new URL).
  Bump `API_VERSION` in WebApp.gs **and** web/index.html together when webAccess/webState/webRun change shape.
- Vercel env (Production): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY` (32 random bytes, base64; rotating it
  signs everyone out), `SCRIPT_API_DEPLOYMENT_ID`, `APP_ORIGIN=https://vic-recruitment.vercel.app`.
- **Verified in production 2026-10-01**: owner sign-in → webAccess/webState/Sync through scripts.run as the visitor
  (Cloud project switch + scopes OK). Still to check with other people: an editor, a non-editor ENP account (no-access
  view), a multi-account browser, sign-out, Lock near the time limit; and that the time triggers still fire after the
  GCP switch (Log tab). Then share the URL with the editors; once proven, `doGet` → link to Vercel (plan §5).
- **Fixes after the production check (2026-10-01), all live** (script then: web app @7, API @8; front: Vercel from `main`):
  - `1c6224d` An account removed from the Master got "View only" instead of "No access": the bound script still hands
    back its Master, so `access_()` now asks Drive (`DriveApp.getFileById`) before calling it READ_ONLY → else NO_PROJECT.
  - `1c6224d` Signing out no longer burns the Google grant: the refresh token stays sealed (marked out) until the 48h end,
    so signing back in with the same account skips the consent screen. The stored grant is revoked only when a
    different account signs in.
  - `a977d7a` A no-access visitor briefly saw the dashboard layout while the access check ran. The page now boots gated,
    on the gate card in a "Checking your access…" state, and shows the dashboard only once `webAccess` says ok.
- **Settings are editable on the Vercel dashboard** (2026-10-01, script web app @9 / API @10, front `165f022` + friendly names/icons):
  the Settings card is a form (friendly names + icons, switches/dropdowns/fields), saved through `webRun('saveSettings')` into the
  Settings tab, which stays the source of truth (`SETTING_UI` in web/index.html maps key → name/icon; add a row there when adding a
  setting to `SETTINGS_DEFAULTS`). Changing SYNC_EVERY_MINUTES / DIGEST_HOUR still needs Setup (owner) to reschedule the triggers.
  The old Apps Script dashboard (`Index.html`) stays read-only.
- Setup is owner-only from the web; the trigger owner is recorded in script property `TRIGGER_OWNER` (handover: delete it).
- Local preview of the Vercel app on mock Google: `node test/webdev.js` → http://localhost:3000/dev-login?as=admin@g.enp.edu.dz
  (`?as=stranger@g.enp.edu.dz` = no-access view). Tests: `test/vercel.test.js` (in `npm test`).

## Binome changes after lock (plan: phases A–D, 2026-10-02)
- **A (live, web app @15 / API @16):** Draft refuses once binomes are locked; Team members in no locked binome raise
  auto-resolving `UNPAIRED_MEMBER` alerts and show in the dashboard's "Unpaired members" card.
- **B (live, web app @17 / API @18; Members.gs):** dashboard "Change members" card: replace / remove / fill a seat, or swap two members (dry-run check +
  confirm). Fixes file title + A1 note, gives the newcomer edit access (not in TEST_MODE), removes the leaver, logs to the
  `Member Changes` tab (created on first use or by Setup), emails both. Former members' interview forms are INFO, not MEDIUM.
  `API_VERSION` = 2.
  Admins using it need **edit access to the Binome Sheets folder** (the check refuses otherwise).
- **C (Members.gs, Cover mode of the same card):** someone stands in for given interviewee codes; one TEMPORARY row per
  binome in Member Changes (Binomes tab untouched). View-only access to the sheet (not in TEST_MODE), counts as a member
  for those codes in the interview check, copied on their timing alerts, emailed the candidates; the binome is told.
  Ends by itself once those interviews are done or moved (each sync), or by hand ("Active covers" card).
- **D (Integrity.gs):** script properties `BASELINE_*` hold what the script last wrote in the Binomes (locked rows) and
  Interviewees tabs. Every writing run (sync, Move, Change members, the fixes) compares the tabs with it first: a hand edit
  becomes a `MANUAL_EDIT` alert (admins only) with **Apply properly / Revert / Accept as is** on the dashboard ("Manual
  edits" filter, bulk Accept). Auto-fixed with an INFO note: a typed Status, a cleared Binome. An Interviewees row deleted
  by hand is no longer re-imported under a new code (Revert restores it, Accept drops it and its sheet row). ACTIVE ↔ PAUSED
  is taken as intended. Team tab: duplicate emails, members missing from it. `ODD_VALUE`: interview year typo / before
  registration (binome emailed), >30 days ahead, time outside 07–23h, date while "Not yet"/"Withdrew", a form for someone
  who withdrew, an unknown Final Dep. `INTEGRITY`: full check of every binome sheet (codes missing/extra/twice, protected
  columns differing, protection removed, header changed or a tab put in front, title code, editors vs members + covers
  when sharing is on) on Sync now, the digest and Maintenance › Check integrity; time-boxed, resumes where it stopped
  (`INTEG_NEXT`). Move interviewee to its own binome puts a missing sheet row back. First run after deploy takes the
  baseline silently: run **Check integrity** once right after deploying.
- Deploy note (2026-10-02): `.claspignore` listed files one by one and missed `Members.gs`, so B and C were live without it
  (Change members failed; after C every sync failed, 18:09–18:17). Hotfix pushed as web app @21 / API @22; the allow-list
  is now `*.gs` / `*.html`.

## Live test in progress (paused 2026-10-01 22:30)
- Master state: 49 binomes already **locked/ACTIVE** (under v1), files created, not shared. v2 Setup still not run
  (no TEST_MODE row → code default TRUE). The 1-min sync trigger **does fire** after the GCP switch (verified).
- Test data in the live Master (all `TEST-xx` / `sim.*@g.enp.edu.dz`): Registration Responses rows 3–14, Interviewees
  rows 3–14 (IT.01–04, COMM.01–02, HR.01–03, FLER.02–03 + 1 duplicate), Alerts A-0003+, row 2 of binome files
  B.03 B.04 B.05 B.06 B.07 B.10 B.17 B.25 (Contacted/Date/Time). Routing, flags, duplicate and sheet pull all verified.
- Still to run: lower the 3 HOURS_* limits (0.1 / 0.15 / 0.05) to see NOT_CONTACTED / NO_DATE / OVERDUE; fill B.02
  (Yes, 01/10/2026, 21:00) and B.09 (time `14h3` → BAD_DATE); interview-form cases (clean, `b3`/`comm 1`, name for
  code, backup interviewer, wrong binome, unknown `IT.99`, duplicate). Then clean up all test rows and set limits back to 1000.

## Next
1. Finish the Vercel manual checks with other accounts: an editor, a removed/non-editor ENP account (should see
   "No access", with no dashboard flash), a viewer ("View only"), a multi-account browser, sign-out → sign back in
   within 48h (no consent screen), Lock near the time limit. Check the Log tab that the time triggers still fire.
2. Run **Setup** from https://vic-recruitment.vercel.app (owner only): adds TEST_MODE + TRUSTED_BACKUPS rows, renames
   Team col E to "Exclude".
3. Import team (link empty → OT Database tab) → Draft binomes → review.
4. Test run in TEST_MODE: lock, submit test registrations + interview forms, check Tracker/Alerts, then delete the
   test rows/files (HANDOFF §8.6).
5. Reword 2026 forms (still say 2025 in places). Verify the two guessed OT emails (Rami, Meriem Hayet).
6. Share the Vercel URL with the editors; once proven, point `doGet` at Vercel (PLAN-VERCEL §5.5). Optional: rotate the
   OAuth client secret (it was pasted in the build chat).
7. Launch only when proven: TEST_MODE = FALSE → Lock for real → share the registration form → watch Alerts.

## Open questions
See HANDOFF §7 (board interviewing, leftover non-HR members, ALL weight, confirmation email, 1st-choice check).
