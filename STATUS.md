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
- Code change: `npm test && npx clasp push && npx clasp update-deployment AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT`
  (same URL, new version).

## Vercel front (PLAN-VERCEL.md) — built 2026-10-01
- `web/` = static `index.html` (port of Index.html) + Node functions `api/{login,callback,run,logout}.js`, deployed by Vercel
  from Git (root `web/`, `main` = production) at https://vic-recruitment.vercel.app. Visitors sign in with Google; `/api/run`
  calls the script through the Apps Script API **as the visitor** (`scripts.run`), so Drive still decides access.
- API executable deployment: `AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU` (Vercel env
  `SCRIPT_API_DEPLOYMENT_ID`). A script change now updates **both** deployments:
  `npx clasp push && npx clasp update-deployment <WEBAPP_ID> && npx clasp update-deployment <API_ID>`.
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
