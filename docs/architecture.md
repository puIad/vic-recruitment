# Architecture

A Google Sheet (the **Master**) is the database; an Apps Script bound to it does the work; a static dashboard on Vercel
calls that script **as the visitor**, so Drive sharing decides who may do what.

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
| `Team.gs` | team import, Draft / Lock / Re-share |
| `Members.gs` | after lock: change / swap members, temporary covers (Member Changes tab) |
| `Actions.gs` | Move interviewee, resolve alerts, daily digest |
| `Integrity.gs` | manual-edit detection (baseline), odd values, full binome-sheet check |
| `WebApp.gs` | `webAccess` / `webState` / `webRun` — the API both dashboards call; `API_VERSION` |
| `Index.html`, `NoAccess.html` | old Apps Script dashboard (read-only fallback) |
| `web/` | the Vercel dashboard (`index.html`) + `api/{login,callback,run,logout}.js` |

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

Binome sheets: protected except the green columns Contacted, Interview Date, Interview Time, Notes; locale fr_FR,
time zone Africa/Algiers.

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
- **B — change members** (dashboard card): replace / remove / fill a seat, or swap two members in one go. Dry-run check
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
