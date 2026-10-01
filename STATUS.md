# STATUS — VIC Recruitment 2026

Updated 2026-10-01. Full history, decisions and Drive IDs: [HANDOFF.md](HANDOFF.md) (Cowork session, 2026-09-30 → 10-01).

## What this is
Apps Script (`Code.gs`, v2) for the VIC 2026 recruitment master sheet: binome pairing, registration routing,
per-binome sheets, interview-form validation/autocorrect, alerts + daily digest.
Master sheet: `19A46cGCoqNDL7Dat2i2CyHdT108k_dxl84g-N1C6Ghc` (Drive folder `1sXD83B1_-X9D-vXfNEJBYcmu5P6MKQAT`).

## Where it stands
- v1 installed in the Master, `setup` run OK. **v2 (this `Code.gs`) not installed yet.**
- Tests pass locally: `node test/unit.test.js` (24) and `node test/e2e.test.js`.
  `test/realdata.js` needs `test/data/` 2025 exports (personal data, git-ignored, not on disk).

## Next
1. Paste `Code.gs` into Master → Apps Script → Save → run `setup` → reload.
2. Fix OT Database: Rami Ahmane has Sara Zerrouak's email; Meriem Hayet Belkacem has no email.
3. Import team → set Exclude / Pair As → Draft binomes → review.
4. Optional dry run with notify/share flags off (HANDOFF §8.6).
5. Lock binomes → share registration form → watch Alerts.
6. Reword 2026 forms (still say 2025 in places).

## Open questions
See HANDOFF §7 (board interviewing, leftover non-HR members, ALL weight, confirmation email, 1st-choice check).
