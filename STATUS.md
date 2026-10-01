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
- Setup is owner-only from the web; the trigger owner is recorded in script property `TRIGGER_OWNER` (handover: delete it).
- Local preview of the Vercel app on mock Google: `node test/webdev.js` → http://localhost:3000/dev-login?as=admin@g.enp.edu.dz
  (`?as=stranger@g.enp.edu.dz` = no-access view). Tests: `test/vercel.test.js` (in `npm test`).

## Next
1. Open the web app (or Master → VIC Recruitment menu) → authorize → run **Setup** (adds TEST_MODE + TRUSTED_BACKUPS
   rows, renames Team col E to "Exclude").
2. Import team (link empty → OT Database tab) → Draft binomes → review.
3. Test run in TEST_MODE: lock, submit test registrations + interview forms, check Tracker/Alerts, then delete the
   test rows/files (HANDOFF §8.6).
4. Reword 2026 forms (still say 2025 in places).
5. Launch only when proven: TEST_MODE = FALSE → Lock for real → share the registration form → watch Alerts.

## Open questions
See HANDOFF §7 (board interviewing, leftover non-HR members, ALL weight, confirmation email, 1st-choice check).
