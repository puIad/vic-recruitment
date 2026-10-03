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
| 10-03 | Live test of A–D passed; 6 findings, one to fix before launch ([testing.md](testing.md#live-test-results-2026-10-03)) | |
| 10-03 | Fixes for findings 1–4: [#8](https://github.com/puIad/vic-recruitment-2026/pull/8) [#9](https://github.com/puIad/vic-recruitment-2026/pull/9) [#10](https://github.com/puIad/vic-recruitment-2026/pull/10) [#11](https://github.com/puIad/vic-recruitment-2026/pull/11) | @27 / @28 |
| 10-03 | Timing and interview-form cases passed live; finding 8 (row deleted during a sync came back) fixed ([#12](https://github.com/puIad/vic-recruitment-2026/pull/12)); all test data deleted | @29 / @30 |

(web app @N / API @N.)

## Incidents

- **2026-10-02, Members.gs missing in production.** `.claspignore` was an allow-list naming each file and didn't
  include Members.gs. Phase B's Change members failed in production from 15:36; after Phase C put `loadCovers_` into
  every run, every sync failed from 18:09 to 18:17. Fixed by uploading it (@21/@22) and allowing `*.gs` / `*.html`.
  Lesson: after a deploy, check the "Pushed N files" list includes every new file.

## Before git

Until 2026-10-01 the script was a single `Code.gs` pasted into the Apps Script editor from a Cowork session (`_inbox`
copy). The old handoff's install steps (paste code, run setup from the editor) no longer apply: the source is this repo
and it ships with `npm run deploy`.
