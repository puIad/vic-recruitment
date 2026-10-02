# Reference — IDs, URLs, settings, secrets

Look things up here; nothing in this file changes often.

## Google Drive (2026)

Folder **VIC › Recruitment › VIC Recruitment 2026** — `1sXD83B1_-X9D-vXfNEJBYcmu5P6MKQAT`

| What | ID |
|---|---|
| VIC Recruitment 2026 \| Master (the live database) | `19A46cGCoqNDL7Dat2i2CyHdT108k_dxl84g-N1C6Ghc` |
| VIC Registrations Form 2026 → tab "Registration Responses" | `11dfunyOymN1vsoIlcDuw-kENHYLI2qMWaSLbzQpHHy4` |
| Interview Form 2026 → tab "Interview Responses" | `1fhesZ_Xa4eUhrtlDsm4-tnt2MI7iZWy_QIiKzjmM8NM` |
| Binome Sheets folder (one sheet per binome, made by Lock) | `18xTMFZLrRhBrbKbABD-eY0kaP4diYWzb` |
| TEST RUN \| 2026 script on 2025 data (safe to delete) | `1_6bKiQQAEtjF1nr4rRidAwImDuajJTKDGBwm89n7Luo` |

The form and folder IDs are also in `CONFIG` (Config.gs).

## Google Drive (2025 sources, read-only)

Folder **VIC › Recruitment** — `10MNZ2hiM4BR3k2Nj-B8Qzjt15nSZYmns`

| What | ID |
|---|---|
| RECRUITMENT 2025 DATABASE (OT list, default team source) | `10FILUcr8WXOWvHnZQdTJemcejO7ppdMyWX1pm1eiaF0` |
| Recruitment \| Binome Sheet (50 binomes) | `1MnCZDf7ehdJ8Bxph4E1-nH3oYvmZ15yH9BWH8zpRRYY` |
| VIC Registrations Form 2025 / responses | form `1ycx0CeHs4VfOsJhQdRirPUBhzCZ6lgWScSL6i62Lbic` / `1WN6Zckm0p7IlnNu6NRfpmSfaeqKJS9ndYKVFn0ppvfQ` |
| Interview Form 2025 / responses | form `11e1jA_VExju6zVnzcNGnuDeBoRLoueTesimwSgY9kgA` / `1ijcbTV0AK0UgBViOJ2U15F6nJpyqCe5aYvZ_653QU70` |
| Reparition klch (who went to which binome) | `13v3XP507bJhOyVkkKSheqR0CNzNFBZpuq7ZFYCJkg-Y` |

## Apps Script

| What | Value |
|---|---|
| Script ID (`.clasp.json`) | `1S7GFkJplZLM9Nc9A4beZx3M5XGa0LniNiB3xeDJEr48piY6U7Aoq7Vv8` |
| Web app deployment (old dashboard) | `AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT` → https://script.google.com/macros/s/AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT/exec |
| API executable deployment (used by Vercel) | `AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU` |
| Google Cloud project | `vic-recruitment` (ENP org, consent screen Internal, Apps Script API on) |

`npm run deploy` updates **both** deployments in place (same URLs, new version). Never `clasp create-deployment`.

### Script properties (set by the code; delete only if you know why)

| Key | Meaning |
|---|---|
| `MASTER_ID` | The Master's ID, so web/API runs (no active sheet) can open it |
| `REG_SHEET_ID`, `INT_SHEET_ID` | Sheet IDs of the two form-response tabs |
| `FILE_SEEN` | Per binome file, last change already read (the sync skips unchanged files) |
| `TRIGGER_OWNER` | Account whose triggers run the sync/digest; only it may re-run Setup. Handover: delete it, then Setup from the new account |
| `BASELINE_N`, `BASELINE_0…` | What the script last wrote in Binomes/Interviewees, JSON split in 4000-char chunks (manual-edit detection). Deleting them = next run re-takes it silently |
| `INTEG_NEXT` | Binome code where the next full sheet check resumes |

## Vercel

| What | Value |
|---|---|
| Production URL | https://vic-recruitment.vercel.app (team `puiads-projects`, project `vic-recruitment`) |
| Source | Git, root `web/`, branch `main` = production; previews protected |

Environment (Production, never in git): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY` (32 random bytes,
base64 — rotating it signs everyone out), `SCRIPT_API_DEPLOYMENT_ID` (the API deployment above),
`APP_ORIGIN=https://vic-recruitment.vercel.app`.

## Settings tab

Every setting, its default and its help text is `SETTINGS_DEFAULTS` in Config.gs (the Settings tab and the dashboard's
Settings card show the same text). Ones that matter at launch:

- `TEST_MODE` (default TRUE) — mail to anyone but `ADMIN_EMAIL` is dropped and logged, sheets are not shared. FALSE only for the real launch.
- `ADMIN_EMAIL` — who gets alerts and the digest (comma-separated).
- `HOURS_NOT_CONTACTED` 24 / `HOURS_NO_INTERVIEW_DATE` 48 / `HOURS_AFTER_INTERVIEW_NO_FORM` 12 — timing alerts.
- `SYNC_EVERY_MINUTES`, `DIGEST_HOUR` — need Setup (owner) to reschedule the triggers after a change.
- `TRUSTED_BACKUPS` — people who often stand in (e.g. the HR head): their backup interviews are INFO only.
