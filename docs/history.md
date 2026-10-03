# History

Background and past events. Not needed day to day; useful when asking "why is it like this" or "when did that change".

## Goal (2026-09-30)

Automate the VIC (Vision & Innovation Club, ENP) 2026 recruitment so it is tracked live and anomalies are caught when
they happen, not weeks later: pair binomes (1 HR + 1 other department, as in 2025), give each registrant a code and a
binome, one sheet per binome for contact/date/time, a tracker, an interview-form check with autocorrect, and alerts
when someone isn't contacted, has no date, or has no interview form after the interview.

## How 2025 worked

- 50 binomes B.01–B.50, tags `IT & HR` / `FLER & HR` / `COMM & HR` / `ALL` (board-led). Each binome got candidates of
  its department + HR candidates; ALL binomes took anyone. Committee Board led the ALL binomes, Council Board sat on the HR side.
- 273 registrations, 267 interview forms; binome and interviewee codes typed as free text.
- A real anomaly already visible: a B.44 member submitted an interview form under B.47.

## Simulation of the 2026 script on 2025 data (2026-09-30, sheet "TEST RUN")

- **Pairing** (99 OT members): 49 binomes — 8 ALL, 20 IT & HR, 12 FLER & HR, 8 COMM & HR, 1 FLER & COMM (8 more non-HR than HR-side members).
- **Routing** (273 registrations): every binome got 5–6, none mis-routed.
- **Registration flags**: 33 — 13 same 1st/2nd choice, 13 invalid/mismatched emails, 4 impossible birth dates, 2 bad phones, 1 junk test registration.
- **Interview forms** (267): 129 clean, 97 trivial format fixes, 14 substantive autocorrections (incl. B.44/B.47), 27
  flagged (5 unknown codes, 2 duplicates, 6 binome mismatches, 14 backup interviewers — 7 by the HR head).
- OT database problems found: one member's row had another member's email; one member had no email. Both were fixed on
  2026-10-01 with addresses guessed from the ENP pattern (Rami Ahmane, Meriem Hayet Belkacem) — **verify before launch**.

## Timeline

| Date | What | Deployments |
|---|---|---|
| 09-30 | Cowork session: analysis, decisions, Drive folder/forms/Master; v1 pasted into the Master, Setup run, 49 binomes locked (not shared) | — |
| 10-01 | v2 in git: split into feature files, TEST_MODE, clasp link, web dashboard (`WebApp.gs` + `Index.html`) | web app up to @5 |
| 10-01 | Vercel front + API executable deployment; owner sign-in and Sync verified in production | API @6 |
| 10-01 | Access fixes (removed accounts → No access; grant kept 48h across sign-out; no dashboard flash) | @7 / @8 |
| 10-01 | Settings editable from the dashboard | @9 / @10 |
| 10-01 | Live test started in TEST_MODE (TEST rows), paused at 22:30 | |
| 10-02 | `npm run deploy` updates both deployments ([#1](https://github.com/puIad/vic-recruitment-2026/pull/1)) | |
| 10-02 | **A** no pairing after lock, unpaired members ([#2](https://github.com/puIad/vic-recruitment-2026/pull/2)) | @15 / @16 |
| 10-02 | **B** change / swap members ([#3](https://github.com/puIad/vic-recruitment-2026/pull/3)) — *Members.gs not uploaded, see below* | @17 / @18 |
| 10-02 | **C** temporary covers ([#4](https://github.com/puIad/vic-recruitment-2026/pull/4)) | @19 / @20 |
| 10-02 | Hotfix: Members.gs uploaded | @21 / @22 |
| 10-02 | **D** manual edits, odd values, full sheet check ([#5](https://github.com/puIad/vic-recruitment-2026/pull/5)) | @23 / @24 |
| 10-02 | Drive API enabled in the Cloud project; Re-share skips Drive when nothing is shared ([#7](https://github.com/puIad/vic-recruitment-2026/pull/7)) | @25 / @26 |
| 10-03 | Live test of A–D passed; 6 findings, one to fix before launch ([below](#live-test-2026-10-03)) | |
| 10-03 | Fixes for findings 1–4: [#8](https://github.com/puIad/vic-recruitment-2026/pull/8) [#9](https://github.com/puIad/vic-recruitment-2026/pull/9) [#10](https://github.com/puIad/vic-recruitment-2026/pull/10) [#11](https://github.com/puIad/vic-recruitment-2026/pull/11) | @27 / @28 |
| 10-03 | Timing and interview-form cases passed live; finding 8 (row deleted during a sync came back) fixed ([#12](https://github.com/puIad/vic-recruitment-2026/pull/12)); all test data deleted | @29 / @30 |
| 10-03 | Live refresh (polls the Master's last edit) and instant alert removal ([#13](https://github.com/puIad/vic-recruitment-2026/pull/13)) | |
| 10-03 | **New dashboard UI live** at the same URL, with Change history ([#14](https://github.com/puIad/vic-recruitment-2026/pull/14)); Vercel root briefly cleared by mistake, site 404 until restored to `web` | |
| 10-03 | Charter brand fixes; **Reset all binomes** in Maintenance › Danger zone | @37 / @38 |
| 10-03 | Reset used live: Team re-imported (63), 31 binomes locked; old `web/index.html` deleted (`c64f118`) | |

(web app @N / API @N.)

## Live test (2026-10-03)

The manual plan in [testing.md](testing.md#manual-test-on-the-live-master-test_mode--true), run on the live Master in TEST_MODE.

A–D on @25 / @26, run from the dashboard's own calls (`webRun` / `webState` through `/api/run`, signed in as the owner) with the hand edits
made through the Sheets API, which the sync sees the same way as typing in the sheet.

| Part | Result |
|---|---|
| A | Pass: Draft refused ("already locked"); a new Team row → `UNPAIRED_MEMBER` + card within a minute; Exclude closes both |
| B | Pass: in another binome → refused with the Swap hint; outside Team → warning; Replace and Swap change title, A1 note, Member Changes and INFO alerts; Place… fills the form. All undone with Change members |
| C | Pass: `IT.01 it 2` → Amine TEST-01 · B.02 and Nassim TEST-05 · B.06, `HR-03x` → unknown; a form from the stand-in is logged AUTOCORRECTED (only for `B2`), not FLAGGED; a cover ends by hand and by itself once the interview is in |
| D | Pass: every row of the manual-edit table in testing.md, Apply / Revert / Accept each tried; odd values raised and closed; full sheet check raised all three (tab in front first, then protection and missing row) |
| Timing | Pass on @27 / @28, limits 0.1 / 0.15 / 0.05 with three new registrations (IT.05 B.08, IT.06 B.09, IT.07 B.11, assigned 17:12): `NOT_CONTACTED` IT.05 at 17:18, `NO_DATE` IT.05 at 17:21, `OVERDUE` IT.06 at 17:20 (interview 17:17), `BAD_DATE` IT.07 (`14h3`) at the first sync. Limits put back to 32 / 40 / 5 |
| Interview forms | Pass: clean B.04 / HR.01 → OK; `b3` / `comm 1` → AUTOCORRECTED (normalized); `Sara TEST-04` → FLER.02 AUTOCORRECTED + INFO; B.08 member under B.07 → `BACKUP_INTERVIEWER` MEDIUM, FLAGGED; B.10 member typing B.11 → corrected to B.10, AUTOCORRECTED + INFO; `IT.99` → `UNKNOWN_INTERVIEWEE` HIGH; second form for IT.01 → `DUPLICATE_INTERVIEW` MEDIUM. Interviewees went INTERVIEWED, their OVERDUE alerts closed, the binome sheets got ✅ |
| Accept edits | Pass on @29 / @30: the 15 Interviewees deletions of the cleanup, ticked together and accepted at once from the dashboard; each row also left its binome sheet |

### Findings

1. **A hand edit made while a sync runs is lost, with no alert.** Every cycle loads Interviewees, then writes the whole
   range back (`saveTable_`, Sheets.gs); a cell typed in between is overwritten with the old value. Seen live: IT.04's
   Binome changed during a Sync now came back as B.09 with no alert; the same edit a minute later was caught. The window
   is the cycle's length (seconds for the trigger, up to ~2.5 min for Sync now / Check integrity). **Fix: [#8](https://github.com/puIad/vic-recruitment-2026/pull/8)**, deployed @27 / @28.
2. **Revert of a deleted Interviewees row leaves Assigned At empty** (it rebuilds the row from the registration). Contacted /
   Date / Time come back from the binome sheet at the next sync. Minor: timing checks then count from the registration time. **Fix: [#9](https://github.com/puIad/vic-recruitment-2026/pull/9)**, deployed @27 / @28.
3. **The 1-minute trigger can take several minutes to see an edit in a binome sheet:** it skips sheets whose Drive "last
   updated" time hasn't moved, and Drive was slow to bump it (3 cycles, still not read). Sync now forces it. Matters for
   alerts that wait on a binome's correction. **Fix: [#10](https://github.com/puIad/vic-recruitment-2026/pull/10)** (a sheet not read for 15 min is re-read), deployed @27 / @28.
4. **A name edit in Interviewees raises two alerts:** INFO `MANUAL_EDIT` and a MEDIUM `INTEGRITY` "First Name in its
   sheet differ from the Master" that is emailed. Apply closes the first; the second closes at the next integrity check. **Fix: [#11](https://github.com/puIad/vic-recruitment-2026/pull/11)** (no INTEGRITY alert while the MANUAL_EDIT is open), deployed @27 / @28.
5. **A member name change in Binomes is INFO**, not MEDIUM as testing.md said (an email change is MEDIUM). Table fixed there.
6. **A tab in front hides the other problems of that sheet** until it is removed (by design, documented in testing.md).
7. **With a limit under 1h the timing messages say "0h after being assigned"** (`Math.floor`). Cosmetic, only seen with test limits.
8. **A row deleted by hand while a sync runs came back**, with no alert: `saveTable_` wrote back every row it had loaded.
   Seen twice in a row while deleting the test rows (syncs now run almost back to back). **Fix: [#12](https://github.com/puIad/vic-recruitment-2026/pull/12)**
   (rows matched by Response Key; a row gone from the tab stays gone and is flagged at the next sync), deployed @29 / @30.

### Test data (deleted 2026-10-03)

All test data was deleted on 2026-10-03, after the timing / form test: the rows of Registration Responses, Interview
Responses, Interview Log, Member Changes, Interviewees (accepted as deletions, which also emptied the binome sheets) and
Alerts, and Team row `TEST-UNPAIRED`. The Master then had the binomes and the Team tab only (plus Team row
`oulad moulad`, kept on purpose; gone since the re-import below).

### Reset and new binomes (evening)

On the evening of 2026-10-03 the v1 binomes were thrown away with **Reset all binomes** (the 49 sheets went to the
owner's Drive trash), the Team was re-imported (63 rows) and 31 binomes were drafted and locked. Current state: [STATUS.md](../STATUS.md).

## Incidents

- **2026-10-02, Members.gs missing in production.** `.claspignore` was an allow-list naming each file and didn't
  include Members.gs. Phase B's Change members failed in production from 15:36; after Phase C put `loadCovers_` into
  every run, every sync failed from 18:09 to 18:17. Fixed by uploading it (@21/@22) and allowing `*.gs` / `*.html`.
  Lesson: after a deploy, check the "Pushed N files" list includes every new file.

## Before git

Until 2026-10-01 the script was a single `Code.gs` pasted into the Apps Script editor from a Cowork session (`_inbox`
copy). The old handoff's install steps (paste code, run setup from the editor) no longer apply: the source is this repo
and it ships with `npm run deploy`.
