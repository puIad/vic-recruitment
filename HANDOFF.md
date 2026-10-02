# HANDOFF — VIC Recruitment 2026 automation (Google Sheets + Apps Script)

> **HISTORICAL — superseded by [STATUS.md](STATUS.md) for current state, deploy and next steps.** Still valid: the
> goal, 2025 analysis, decisions (§3), Drive IDs (§4a) and open questions (§7). Out of date: §4b/§4c (single `Code.gs`
> in `_inbox`; the source is now this repo, split into feature files), §6 and §8 (paste-into-editor install; the
> script now ships with `npm run deploy`, which runs the tests, pushes with clasp and updates both deployments).

Session date: 2026-09-30 → 2026-10-01 (Cowork, cloud session)
Owner: Mourad (Pulad) — mourad_islam.fernane@g.enp.edu.dz

---

## 1. Goal

Automate the VIC (Vision & Innovation Club, ENP) 2026 recruitment drive so it can be tracked live and
anomalies are caught **when they happen**, not weeks later when the member has forgotten the form.

Concretely, a Google Sheet acting as a live database, with Apps Script that:

1. Takes the organizing team (OT) and pairs **binomes** with the 2025 rule: 1 HR + 1 member of another department.
2. When someone fills the **registration form**, gives them a code (e.g. `IT.07`) and assigns them automatically to a binome based on their 1st department choice.
3. Gives each binome its own sheet listing its interviewees, where the interviewers write *contacted or not* and *interview date/time*.
4. Reads all those sheets and tracks the binomes' work on a tracker sheet.
5. When the **interview form** is filled, checks the binome code + interviewee code are coherent, auto-corrects small mistakes, and alerts Mourad for real ones.
6. Alerts when an interviewee has no interview date after a set time, and when an interview's time passed without an interview form.

---

## 2. How 2025 worked (source material found in Drive)

Drive folder `VIC › Recruitment` (id `10MNZ2hiM4BR3k2Nj-B8Qzjt15nSZYmns`):

| File | ID | What it is |
|---|---|---|
| RECRUITMENT 2025 DATABASE | `10FILUcr8WXOWvHnZQdTJemcejO7ppdMyWX1pm1eiaF0` | OT list: col A = section (Committee Board, Council Board, FLER, COMM, HR, IT), then First, Last, Email, Phone, FB, Field, Year |
| Recruitment \| Binome Sheet | `1MnCZDf7ehdJ8Bxph4E1-nH3oYvmZ15yH9BWH8zpRRYY` | 50 binomes B.01–B.50, HR member + other member, tag `IT & HR` / `FLER & HR` / `COMM & HR` / `ALL` (board-led) |
| VIC Registrations Form 2025 | form `1ycx0CeHs4VfOsJhQdRirPUBhzCZ6lgWScSL6i62Lbic` | Registration form |
| VIC Registrations Form 2025 (Responses) | `1WN6Zckm0p7IlnNu6NRfpmSfaeqKJS9ndYKVFn0ppvfQ` | RAW tab = 273 responses; IT/HR/FLER/COMM tabs with codes like `IT.103` |
| Interview Form 2025 | form `11e1jA_VExju6zVnzcNGnuDeBoRLoueTesimwSgY9kgA` | Interview form (owned by Ikram Mahi) |
| Interview Form 2025 (Responses) | `1ijcbTV0AK0UgBViOJ2U15F6nJpyqCe5aYvZ_653QU70` | 267 responses; binome + interviewee codes typed as free text |
| Reparition klch | `13v3XP507bJhOyVkkKSheqR0CNzNFBZpuq7ZFYCJkg-Y` | Which interviewee went to which binome (folder `Sheet t3 les binomes › 50 binom`) |
| [B.xx] name & name | e.g. `1G3bi7gCwbnUCEHaRBmPoflU1Gx9aMk2neWJ63XCfvno` | Per-binome files with `Contacted` + `Interview Day` columns |

Observed rules from 2025:
- Each binome received candidates of **its department + HR candidates** (e.g. B.03 COMM & HR had COMM.10, COMM.04, HR.45, HR.06). `ALL` binomes took anyone.
- Committee Board members led the `ALL` binomes; Council Board members sat on the HR side.
- Real 2025 anomaly already visible: a B.44 member submitted an interview form under B.47.

---

## 3. Decisions made (and why)

| # | Decision | Why |
|---|---|---|
| 1 | **Separate Google Sheet file per binome** (not tabs in one file) | Mourad's choice — privacy: each binome sees only its own interviewees. Cost: master syncs from them on a timer (every 15 min) instead of instantly. |
| 2 | **Routing same as 2025**: IT/COMM/FLER candidates → binomes of that dept; HR candidates → any binome (every binome has an HR member); `ALL` binomes take anyone | Mourad's choice. |
| 3 | **Binome pairing = auto-draft, then Mourad approves**, then "Lock" creates the files | Mourad's choice (recommended option). Random draft, editable before locking. |
| 4 | **Alerts: all four channels** — Alerts tab, instant email to Mourad, email the binome concerned, daily digest | Mourad's choice. |
| 5 | **Copy the 2025 forms** into a 2026 folder and link them to the master | Mourad's choice (recommended). |
| 6 | **Keep typed text for codes in the interview form + auto-correct**, not dropdowns | Google Forms dropdowns are **not searchable** (Mourad's condition for dropdowns was "if searchable"). Script autocorrects typos, names typed instead of codes, wrong binome code when the submitter belongs to the right binome; marks them AUTOCORRECTED. |
| 7 | **Backup interviewers / name mismatch → flag to Mourad only** (not the binome); big mistakes (unknown interviewee code) → Mourad + binome | Mourad's explicit instruction ("binomes change when a member is unavailable; if names don't match only flag to me"). |
| 8 | **Interview slot = date + time** in binome sheets | Mourad's choice — enables exact "overdue" checks. |
| 9 | **Thresholds: 24h not contacted / 48h no interview date / 12h after interview with no form** | Mourad picked the "tighter" option. Editable in the Settings tab or from the Settings card on the dashboard. Clock starts at **assignment** time, not registration (so registrations that waited for binomes aren't instantly late). |
| 10 | Mourad installs the script himself (paste into Extensions → Apps Script, run `setup`) | The Google connectors available to Claude can edit Sheets/Drive but **cannot install Apps Script**. |
| 11 | Testing done in a **local mock of Apps Script** (Node + vm), not live | Can't run Apps Script on his account from the session; a live test would share 50 files and email ~100 real members. |
| 12 | Team "Available" checkbox replaced by **"Exclude"** checkbox (v2) | v1 bug: empty checkboxes are FALSE → everyone would have been "not available". |
| 13 | Personal Gmail of a member is recognised if its local part contains ≥2 name tokens (e.g. `sabrinaaknine89@gmail.com`) | 2025 data showed members submitting from personal Gmail. |
| 14 | `TRUSTED_BACKUPS` setting (v2) | 2025 data: Ikram Mahi (HR head) covered for ~7 binomes → would otherwise generate many MEDIUM alerts. |
| 15 | Format-only autocorrections (`B48` → `B.48`) stay in Interview Log only; only substantive corrections create Alerts rows | 2025 data produced 108 autocorrections, 97 of them trivial — too noisy for the Alerts tab. |

---

## 4. Everything created or changed

### 4a. Google Drive (created this session)

Folder **`VIC › Recruitment › VIC Recruitment 2026`** — id `1sXD83B1_-X9D-vXfNEJBYcmu5P6MKQAT`

| File | ID | Notes |
|---|---|---|
| VIC Recruitment 2026 \| Master | `19A46cGCoqNDL7Dat2i2CyHdT108k_dxl84g-N1C6Ghc` | The live database. Mourad pasted **v1** script and ran `setup` successfully: tabs Tracker, Alerts, Interviewees, Binomes, Team, Interview Log, Settings, Registration Responses, Interview Responses exist; both forms linked. Mourad also added an **"OT Database"** tab (copy of the 2025 OT list). Team tab still empty. |
| VIC Registrations Form 2026 | `11dfunyOymN1vsoIlcDuw-kENHYLI2qMWaSLbzQpHHy4` | Copy of the 2025 form; linked to Master → tab "Registration Responses". Title auto-changed 2025→2026 by setup; **question text still says 2025 in places — review**. |
| Interview Form 2026 | `1fhesZ_Xa4eUhrtlDsm4-tnt2MI7iZWy_QIiKzjmM8NM` | Copy of the 2025 interview form; linked → tab "Interview Responses". Setup added help text to the binome-code and interviewee-code questions. |
| Binome Sheets (folder) | `18xTMFZLrRhBrbKbABD-eY0kaP4diYWzb` | Empty. "Lock binomes" creates one sheet per binome here. |
| TEST RUN \| 2026 script on 2025 data | `1_6bKiQQAEtjF1nr4rRidAwImDuajJTKDGBwm89n7Luo` | Simulation results, 3 tabs: `1 · Binome pairing`, `2 · Registration flags`, `3 · Interview form check`. Safe to delete once reviewed. |

No 2025 file was modified.

### 4b. Files saved to this computer

| Path | What |
|---|---|
| `C:\Users\pulad\Desktop\AI-OS\_inbox\HANDOFF.md` | This file |
| `C:\Users\pulad\Desktop\AI-OS\_inbox\vic-recruitment-2026\Code.gs` | **The current script (v2, 1573 lines).** This is the only on-disk copy of the source. It is what must be pasted into the Master's Apps Script editor. |
| `C:\Users\pulad\Desktop\AI-OS\_inbox\vic-recruitment-2026\test\mockgas.js` | In-memory mock of SpreadsheetApp, DriveApp, FormApp, MailApp, etc. used by the tests |
| `C:\Users\pulad\Desktop\AI-OS\_inbox\vic-recruitment-2026\test\unit.test.js` | 24 unit tests of the pure logic (code parsing, autocorrect, pairing, routing, registration checks, timing) — `node test/unit.test.js` |
| `C:\Users\pulad\Desktop\AI-OS\_inbox\vic-recruitment-2026\test\e2e.test.js` | End-to-end simulation (setup → import → draft → lock → registrations → binome edits → sync → interview forms → reassign → digest) — `node test/e2e.test.js` |
| `C:\Users\pulad\Desktop\AI-OS\_inbox\vic-recruitment-2026\test\realdata.js` | Real-data simulation. Needs `data/ranges.json` + `data/reg_AK.json` (2025 sheet exports) which were **not** saved (they contain registrants' personal data); re-export from the 2025 sheets if you want to rerun it. |

The script was also sent in chat as `VIC_Recruitment_2026_Code.gs` (twice: v1 then v2).

### 4c. Script architecture (Code.gs)

Single file, three sections:
1. **Config + pure logic** (unit-tested): `CONFIG` (form/folder IDs), `SETTINGS_DEFAULTS`, tab/column headers, `parseBinomeCode`, `parseIntervieweeCode`, `levenshtein`, `bestNameMatch`, `emailNameHits`, `resolveInterview` (the validator/autocorrector), `draftPairs`, `pickBinome`, `nextCode`, `checkRegistration`, `buildInterviewAt`, `timingIssues`.
2. **Sheets plumbing**: context loader, alert buffer (dedup by key, auto-resolve, grouped emails), binome-file create/append/remove/mark, `processRegistrations_`, `assignUnassigned_`, `processInterviews_`, `pullBinomeFiles_` (only re-reads files whose Drive `lastUpdated` changed), `timingAlerts_`, `buildTracker_`, `runCycle_`.
3. **Setup + menu**: `setup`, `onOpen` menu, `importTeam`, `draftBinomes`, `lockBinomes`, `reshareBinomeFiles`, `reassignSelected`, `resolveSelectedAlerts`, `sendDailyDigest`.

Triggers installed by `setup`: spreadsheet `onFormSubmit` → `onFormSubmitHandler`; time-based `syncAll` every 15 min; daily `sendDailyDigest` at 08:00 Africa/Algiers.
Robustness: every run also catches up on any unprocessed form rows (keyed by timestamp+email), so a missed trigger self-heals.

Master tabs: **Settings** (key/value), **Team** (Full Name, Email, Department, Pair As, Exclude, Notes), **Binomes** (Binome, Member 1/2, Email 1/2, Tag, Status DRAFT/ACTIVE/PAUSED, File, File ID, Created), **Interviewees** (script-managed, warning-protected), **Interview Log**, **Alerts** (ID, Severity, Type, Status OPEN/RESOLVED/AUTO-RESOLVED/AUTO-FIXED, Key…), **Tracker**.
Binome files: protected except green columns `Contacted` (Not yet / Yes / No answer / Withdrew), `Interview Date` (date picker), `Interview Time` (HH:mm), `Notes`. Locale fr_FR, tz Africa/Algiers.

### 4d. v1 → v2 changes (v2 not yet installed by Mourad, as far as this session knows)

- `importTeam` reads the master's **OT Database** tab when the link prompt is left empty; flags rows whose email doesn't match the name or is missing.
- Team `Available` → **`Exclude`** checkbox (fixes the FALSE-by-default bug).
- Personal-Gmail recognition for interviewers; `TRUSTED_BACKUPS` setting.
- Junk names (". .") flagged as MISSING_NAME.
- Only substantive autocorrections create Alerts rows.
- **Bug fix:** Tracker "Open alerts" always showed 0 (new alerts weren't added to the in-memory table).

---

## 5. Test results (simulation on real data)

**Pairing (OT Database, 99 members imported):** 49 binomes — 8 ALL, 20 IT & HR, 12 FLER & HR, 8 COMM & HR, 1 FLER & COMM (B.49, no HR left: 8 more non-HR than HR-side members).
**Routing (273 registrations from 2025):** every binome got 5–6, zero mis-routed. ALL binomes received only IT (IT is the biggest pool).
**Registration flags:** 33 — 13 same 1st/2nd choice, 13 invalid/mismatched typed emails, 4 impossible birth dates, 2 bad phones, 1 junk test registration (". ." from meriem.mechouek's account).
**Interview forms (267 from 2025, against the real 2025 binomes/assignments):** 129 clean, 97 trivial format fixes, 14 substantive autocorrections (incl. the B.44/B.47 case, "Amira w meriem", "h", personal Gmails), **27 flagged**: 5 unknown codes (HOD.hr, HR.999, HR.9999, HR.9998, "B.44"), 2 duplicates, 6 binome mismatches, 14 backup interviewers (7 = Ikram Mahi).

Data problems found in the OT Database:
- **Rami Ahmane's row has `sara.zerrouak@g.enp.edu.dz`** (Sara Zerrouak's email).
- **Meriem Hayet Belkacem has no email** → excluded from pairing.

---

## 6. Status

**Done**
- 2025 process analysed; all decisions agreed.
- 2026 Drive folder, forms, master, binome folder created.
- Script written, unit + e2e + real-data tested (24 unit tests pass, e2e passes).
- v1 installed and `setup` run successfully by Mourad (verified via Sheets API).
- v2 written and delivered; TEST RUN sheet published.

**Left**
- Install **v2** (replace code, save, run `setup` again — safe; it adds the TRUSTED_BACKUPS setting and renames Team col E header to "Exclude").
- Fix Rami Ahmane's email in the OT Database tab; add Meriem Hayet Belkacem's email or exclude her.
- Import team → review Pair As / Exclude (e.g. Aymen Saidani) → Draft → adjust → **Lock** (only when ready: shares files + starts emails).
- Review the 2026 forms' wording (still mention 2025 in questions/description).
- Fill `TRUSTED_BACKUPS` (e.g. Ikram Mahi's email) if wanted.
- First live run will be the real verification; expect possibly a small fix (Apps Script quirks the mock can't catch: protections, validations, locale parsing, trigger auth).

---

## 7. Open questions

1. Should Aymen Saidani (president) and other board members interview at all? (Tick Exclude if not.)
2. Leftover non-HR members (8 in the test) — accept a no-HR binome like B.49, make 3-person binomes, or move someone to the HR side?
3. Should ALL (board) binomes receive fewer candidates? → `ALL_BINOME_WEIGHT` (e.g. 1.5).
4. Should registrants get a confirmation email with their code? (Not built.)
5. Is "Their 1st Department Choice" in the interview form meant to equal the registration choice? 28 INFO mismatches in 2025 data suggest interviewers use it for something else — maybe drop that check.
6. Delete the TEST RUN sheet after review?
7. Daily email quota is fine on the ENP Workspace account (~1500/day), but if NOTIFY_BINOME_ON_NEW_INTERVIEWEE is too chatty, turn it off.

---

## 8. Next steps (in order)

1. Open Master → Extensions → Apps Script → replace all code with `_inbox\vic-recruitment-2026\Code.gs` → Save → run `setup` → reload the sheet.
2. Fix the two OT Database rows (section 5).
3. `VIC Recruitment › 1 · Import organizing team` (leave link empty → uses OT Database tab).
4. Tick Exclude where needed; adjust Pair As.
5. `2 · Draft binomes` → edit Binomes tab freely (re-run for a new draw).
6. Optional dry run before launch: set `SHARE_FILES_WITH_BINOME`, `NOTIFY_BINOME_ON_ALERT`, `NOTIFY_BINOME_ON_NEW_INTERVIEWEE` = FALSE, lock 1–2 test binomes with your own emails, submit a test registration + interview form, check Tracker/Alerts, then delete the test rows/files and set the flags back to TRUE.
7. `3 · Lock binomes` for real, then share the registration form.
8. Watch the Alerts tab / emails during the first days; report any script error message for a fix.
