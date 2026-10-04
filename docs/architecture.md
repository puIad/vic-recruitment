# Architecture

A Google Sheet (the **Master**) is the database; an Apps Script bound to it does the work; a single-page dashboard on
Vercel (`frontend/`) calls that script **as the visitor**, so Drive sharing decides who may do what.

```
Registration form ─┐                         ┌─► one Google Sheet per binome (Binome Sheets folder)
Interview form ────┼─► Master + Apps Script ─┤      binomes fill Contacted / Date / Time / Notes
Team (OT list) ────┘    (sync every N min)   └─► Alerts tab + emails + daily digest
                              ▲
        Vercel dashboard ─────┘ scripts.run as the visitor (see vercel.md)
```

## Source files

All `.gs` files share one global scope; `Config.gs` loads first (constants), the others only declare functions.

| File | Role |
|---|---|
| `Config.gs` | IDs, `SETTINGS_DEFAULTS`, tab names and column headers, statuses, alert types |
| `Matching.gs` | pure: code parsing, name matching, the interview-form check/autocorrect (`resolveInterview`) |
| `Rules.gs` | pure: pairing (`draftPairs`), routing (`pickBinome`), codes, registration and timing checks |
| `Sheets.gs` | plumbing: settings, tables, lock, run context (`loadCtx_`), alert buffer, mail (TEST_MODE gate) |
| `BinomeFiles.gs` | create / append / remove / mark rows in the binome sheets |
| `Registrations.gs` | registration form → Interviewees (code + binome) |
| `Interviews.gs` | interview form → Interview Log (validated, autocorrected) |
| `Sync.gs` | pull binome sheets, timing alerts, Tracker, the main cycle `runCycle_`, triggers |
| `Setup.gs` | menu, `setup`, tabs, form links, trigger install (owner only) |
| `Team.gs` | team import, Draft / Lock / Re-share, Reset all binomes (`resetBinomesCore_`) |
| `Members.gs` | after lock: change / swap members, temporary covers (Member Changes tab) |
| `Actions.gs` | Move interviewee, resolve alerts, daily digest |
| `Integrity.gs` | manual-edit detection (baseline), odd values, full binome-sheet check |
| `WebApp.gs` | `webAccess` / `webState` / `webPulse` / `webRun`, the API the dashboard calls; `API_VERSION`; `doGet` |
| `Index.html`, `NoAccess.html` | the Apps Script web app's old dashboard (`doGet`), kept as a read-only fallback |
| `frontend/` | the dashboard UI: [frontend.md](frontend.md) |
| `web/` | the Vercel project: `api/{login,callback,run,logout}.js`, `lib/session.js`, `vercel.json`: [vercel.md](vercel.md) |

## Master tabs

| Tab | Who writes | Content |
|---|---|---|
| Tracker | script | per-binome progress, rebuilt each sync |
| Alerts | script (+ admins resolve) | ID, severity, type, status OPEN / RESOLVED / AUTO-RESOLVED / AUTO-FIXED, key (dedup) |
| Interviewees | script (warning-protected) | one row per registration: code, binome, status, contact data, what the binome wrote |
| Binomes | admins before Lock, then the tools | code, 2 members, tag, status DRAFT / ACTIVE / PAUSED, sheet link |
| Member Changes | script | PERMANENT (change/swap) and TEMPORARY (cover) rows |
| Team | import + admins | name, email, department, Pair As, Exclude |
| Interview Log | script | every interview form, result OK / AUTOCORRECTED / FLAGGED |
| Settings | admins / dashboard | key → value (source of truth) |
| Registration / Interview Responses | the forms | raw answers |

Binome sheets (layout of 2026-10-04, modelled on the 2025 sheets): column A is a banner (members, binome code, house),
the table starts at column B (`BF_COL`) with the friendly headers of `BF_HEAD`. Protected except the gold columns
Contacted, Interview Day, Time, Interview Done (checkbox), Rating /10, Final Affectation (IT / COMM / FLER / HR / Not
accepted) and Your Notes; the sync copies all of them to Interviewees. The sheet also shows birth date, how they found
VIC, why VIC, other clubs and the department's own questions (kept in Interviewees since 2026-10-04). Montserrat, one
Hogwarts house per department (`HOUSE` in Config.gs: IT Ravenclaw, COMM Gryffindor, FLER Hufflepuff, HR Slytherin);
the sheet wears the house of its non-HR side. A sheet still in the first layout (`BF_H_V1`, table from column A) is
rebuilt the first time the script opens it (`upgradeBinomeSheet_`: keeps what the binome typed, at most
`UPGRADE_PER_RUN` per sync). Locale fr_FR, time zone Africa/Algiers. The Master gets the same look from Setup
(`styleMaster_`).

## The cycle (`runCycle_`, under the script lock)

Triggers: every `SYNC_EVERY_MINUTES` (`syncAll`), on form submit, and the daily digest. Each run:

1. **Detect hand edits** against the baseline (Integrity.gs) — before anything else writes.
2. Registrations → code + binome (balanced by load; IT/COMM/FLER go to binomes of that department, HR anywhere, ALL takes anyone).
3. Interview forms → checked and autocorrected; real mistakes alerted.
4. Pull the binome sheets that changed since last read (`FILE_SEEN`); recompute statuses.
5. End finished covers; timing alerts; odd values; on demand the **full sheet check**.
6. Save Interviewees, save the new baseline, flush alerts (grouped emails), mail new interviewees, rebuild Tracker.

Any missed trigger self-heals: unprocessed form rows are picked up by the next run (keyed by timestamp + email).

## After lock (phases A–D)

- **A — no automatic pairing after lock.** Draft refuses once a binome is ACTIVE/PAUSED. Team members in no locked
  binome raise `UNPAIRED_MEMBER` (auto-resolving) and show in the "Unpaired members" card.
- **B — change members** (dashboard card): replace / remove / fill a seat, swap two members in one go, or pair two unpaired members into a new binome (next code, own sheet, tag by the draft rules). Dry-run check
  first; then fixes the sheet title + A1 note, sharing (not in TEST_MODE), logs a PERMANENT row, emails both people.
  A former member's interview form is INFO, not MEDIUM. Needs edit access to the Binome Sheets folder.
- **C — temporary cover**: someone stands in for given interviewee codes. One TEMPORARY row per binome; view-only
  access to the sheet; counts as a member for those codes in the interview check; copied on their timing alerts. Ends
  when those interviews are done or moved, or by hand. Access it gave is retried until removed (`ENDING` status).
- **D — manual edits** (`Integrity.gs`):
  - **Baseline**: what the script last wrote in Binomes (locked rows) and Interviewees, in script properties. Every
    writing run compares first; a difference is a `MANUAL_EDIT` alert (admins only) with Apply properly / Revert /
    Accept as is (`webRun('editApply' | 'editRevert' | 'editAccept')`). A flagged value keeps its old baseline until acted on.
  - Put back automatically (INFO note): a typed Status, a cleared Binome. An Interviewees row deleted by hand is kept
    aside instead of re-imported under a new code. ACTIVE ↔ PAUSED is taken as intended.
  - Team tab: duplicate emails, locked members missing from it.
  - `ODD_VALUE`: year typo / date before registration (binome emailed), >30 days ahead, time outside 07–23h, a date
    while "Not yet"/"Withdrew", a form for someone who withdrew, an unknown Final Dep.
  - `INTEGRITY`: opens every binome sheet (codes missing / extra / twice, protected columns differing, protection
    removed, header changed or a tab in front, title code, editors vs members + covers when sharing is on). Runs on
    Sync now, the digest and Maintenance › Check integrity; time-boxed and resumes at `INTEG_NEXT`. Move interviewee to
    its own binome puts a missing row back.

## Alert types

| Type | Raised by | Closes itself |
|---|---|---|
| `NOT_CONTACTED`, `NO_DATE`, `OVERDUE`, `BAD_DATE` | timing check | yes |
| `NO_BINOME`, `UNPAIRED_MEMBER` | registration / team check | yes |
| `SAME_CHOICES`, `INVALID_CHOICE`, `BAD_EMAIL`, `EMAIL_MISMATCH`, `EXTERNAL_EMAIL`, `BAD_PHONE`, `BAD_BIRTHDATE`, `MISSING_NAME`, `DUPLICATE_REGISTRATION` | registration check | no |
| `UNKNOWN_INTERVIEWEE`, `BINOME_MISMATCH`, `BACKUP_INTERVIEWER`, `DUPLICATE_INTERVIEW`, `NOT_ASSIGNED`, `CHOICE_MISMATCH`, `AUTOCORRECTED` | interview check | no |
| `FILE_ERROR` | any file write/share that failed | no (REVOKE one: yes) |
| `MEMBER_CHANGED`, `COVER_ADDED`, `REASSIGNED` | the tools (INFO, AUTO-FIXED) | — |
| `MANUAL_EDIT` | baseline compare, Team check | yes, once undone; or via the fix buttons |
| `ODD_VALUE` | odd-value check | yes (form ones: no) |
| `INTEGRITY` | full sheet check | yes, at the next clean check of that binome |

Severity routing: HIGH/MEDIUM are emailed instantly (threshold `INSTANT_EMAIL_MIN_SEVERITY`); `notifyBinome` alerts also
go to the binome and whoever covers the interviewee; everything appears in the daily digest.
