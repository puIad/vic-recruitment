# STATUS — VIC Recruitment 2026

Updated 2026-10-01. Full history, decisions and Drive IDs: [HANDOFF.md](HANDOFF.md) (Cowork session, 2026-09-30 → 10-01).

## What this is
Apps Script (`Code.gs`, v2) for the VIC 2026 recruitment master sheet: binome pairing, registration routing,
per-binome sheets, interview-form validation/autocorrect, alerts + daily digest.
Master sheet: `19A46cGCoqNDL7Dat2i2CyHdT108k_dxl84g-N1C6Ghc` (Drive folder `1sXD83B1_-X9D-vXfNEJBYcmu5P6MKQAT`).

## Where it stands
- v1 installed in the Master, `setup` run OK. **v2 (this `Code.gs`) + web dashboard not installed yet.**
- Web dashboard (2026-10-01): `WebApp.gs` + `Index.html` run every menu action from a browser page
  (launch steps, sync, alerts triage, move interviewee, digest, re-share, setup). Admin-only.
- Tests pass locally: `node test/unit.test.js` (24), `node test/e2e.test.js`, `node test/web.test.js`.
  `test/realdata.js` needs `test/data/` 2025 exports (personal data, git-ignored, not on disk).
- Preview the dashboard on mock data: `node test/devserver.js` → http://localhost:8787 (`--empty` = before team import).

## Install / deploy (in the Master's Apps Script editor)
1. `Code.gs`: replace all with this repo's `Code.gs`.
2. `+` → Script → name it `WebApp` → paste `WebApp.gs`.
3. `+` → HTML → name it exactly `Index` → paste `Index.html`.
4. Save → select `setup` → ▶ Run → accept permissions.
5. Deploy → New deployment → ⚙ Web app · Execute as **Me** · Who has access **Only myself** → Deploy → bookmark the `/exec` URL.
   Code updates later: Deploy → Manage deployments → ✏ → Version: New version (keeps the same URL).

## Next
1. Install v2 + dashboard (above).
2. Fix OT Database: Rami Ahmane has Sara Zerrouak's email; Meriem Hayet Belkacem has no email.
3. Import team → set Exclude / Pair As → Draft binomes → review.
4. Optional dry run with notify/share flags off (HANDOFF §8.6).
5. Lock binomes → share registration form → watch Alerts.
6. Reword 2026 forms (still say 2025 in places).

## Open questions
See HANDOFF §7 (board interviewing, leftover non-HR members, ALL weight, confirmation email, 1st-choice check).
