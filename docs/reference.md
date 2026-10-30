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
| Web app deployment (`doGet`: a page linking to the Vercel dashboard; the old dashboard is retired) | `AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT` → https://script.google.com/macros/s/AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT/exec |
| API executable deployment (used by Vercel) | `AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU` |
| Google Cloud project | `vic-recruitment` (ENP org, number `444885197277`, consent screen Internal, Apps Script API + Google Drive API on (Drive enabled 2026-10-02)) |

`npm run deploy` updates **both** deployments in place (same URLs, new version). Never `clasp create-deployment`.

### Script properties (set by the code; delete only if you know why)

| Key | Meaning |
|---|---|
| `MASTER_ID` | The Master's ID, so web/API runs (no active sheet) can open it |
| `REG_SHEET_ID`, `INT_SHEET_ID` | Sheet IDs of the two form-response tabs |
| `FILE_SEEN` | Per binome file, last change already read (the sync skips unchanged files) |
| `FILE_READ` | Per binome file, when it was last read (a sheet not read for 15 min is re-read even if Drive says unchanged) |
| `TRIGGER_OWNER` | Account whose triggers run the sync/digest; only it may re-run Setup (from the Master's menu, or the dashboard's Setup: the dashboard calls this account "Owner" and shows it the button; while the property is unset, the Master's owner). Unset, the account running Setup takes it, whether or not it owns the Master. Handover: the old account deletes its three triggers and this property, then Setup from the new account. Binome sheet protections always keep this account and the Master's owner as editors. Today: `vic.rh@g.enp.edu.dz` once task 9's owner steps are done |
| `BASELINE_N`, `BASELINE_0…` | What the script last wrote in Binomes/Interviewees, JSON split in 4000-char chunks (manual-edit detection). Deleting them = next run re-takes it silently |
| `INTEG_NEXT` | Binome code where the next full sheet check resumes |
| `SNAP_HASH` | The admin dashboard's cached snapshot: `{h, n, at}` = hash of its JSON, number of `snap:admin:<i>` values in the script cache, when it last changed (shown as "Master read"). Deleting it = the next `webState` builds live and publishes again |
| `SNAP_VER` | Version of that snapshot, +1 whenever it changes: what `webPulse` returns, so screens reload only on a real change |
| `FORM_URLS` | Published URLs of the two forms, by form ID (looked up once instead of two `FormApp.openById` per `webState`) |
| `DROPS_SECRET` | Set by hand (owner): the same value as Vercel's `DROPS_SECRET`. Each timed sync calls `api/drops` with it (pending changes, slice 4); unset = no call |
| `MAILER_URL` | Set by hand (owner): the mailer's web app URL, the same as the site's `MAILER_URL`. `mail_()` posts every mail to it, so all of them leave from `vic.rh`. Unset = no mail leaves |
| `MAIL_SEND_SECRET` | Set by hand (owner): the same value as the mailer's script property `MAIL_SEND_SECRET`. Not the site's `MAILER_SECRET` |
| `DROPS_MAILED` | Which drops the last sync emailed (`[{email, cells, at}]`), reported to `api/drops` by the next call, then replaced |

## Vercel

| What | Value |
|---|---|
| Production URL | https://vic-recruitment.vercel.app (team `puiads-projects`, project `vic-recruitment`) |
| Source | Git, Root Directory `web` (its build compiles `../frontend` into `web/dist`), branch `main` = production; previews protected. Settings that must stay: [vercel.md](vercel.md#vercel-project-settings) |

Environment (Production, never in git): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY` (32 random bytes,
base64 — rotating it signs everyone out), `SCRIPT_API_DEPLOYMENT_ID` (the API deployment above),
`APP_ORIGIN=https://vic-recruitment.vercel.app`, `DROPS_SECRET` (the sync's call to `api/drops`, same value as the script
property), and the Upstash `KV_REST_API_*` the Marketplace set.

## Settings tab

Every setting, its default and its help text is `SETTINGS_DEFAULTS` in Config.gs (the Settings tab and the dashboard's
Settings card show the same text). Ones that matter at launch:

- `TEST_MODE` (default TRUE) — mail to anyone but `ADMIN_EMAIL` is dropped and logged, sheets are not shared. FALSE only for the real launch.
- `ADMIN_EMAIL` — who gets alerts and the digest (comma-separated).
- `HOURS_NOT_CONTACTED` 24 / `HOURS_NO_INTERVIEW_DATE` 48 / `HOURS_AFTER_INTERVIEW_NO_FORM` 12 — timing alerts
  (the live Master has the test values 32 / 40 / 5 until launch).
- `SYNC_EVERY_MINUTES`, `DIGEST_HOUR` — need Setup (owner) to reschedule the triggers after a change.
- `TRUSTED_BACKUPS` — people who often stand in (e.g. the HR head): their backup interviews are INFO only.
