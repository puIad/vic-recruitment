# Testing

## Automated (`npm test`, also run by `npm run deploy`)

Everything runs on an in-memory mock of the Apps Script services (`test/mockgas.js`), no Google account needed.

| File | Covers |
|---|---|
| `test/unit.test.js` | pure logic: code parsing, autocorrect, pairing, routing, registration and timing checks |
| `test/e2e.test.js` | the whole flow through the menu: setup → import → draft → lock → registrations → sheet edits → sync → interview forms (Google Form and dashboard: log, Rating and Final Affectation fill, edits) → move → digest; asserts no false manual-edit/integrity alert |
| `test/web.test.js` | every dashboard action through `webState` / `webRun` under web-app conditions: TEST_MODE, change/swap, covers, every manual-edit fix path, odd values, the full sheet check, access control (admins in a binome included), `interviewGet` / `interviewSave` |
| `test/vercel.test.js` | the Vercel functions against a mocked Google (`test/googlemock.js`): session, proxy, refusals; the UI calls only `/api/run` and its `API_VERSION` matches the script |
| `test/reset.test.js` | Reset all binomes: the typed phrase, what is wiped and what stays, then a new team drafted and locked |
| `test/quick.test.js` | the Alerts page's quick actions: fixes in Master + binome sheet with no manual edit flagged, duplicates, snooze / expiry / mute / unmute, odd values, exclude, interview forms, links, every sheet repair (dry run first), sharing, the email preview and send |
| `test/tour.test.js` | the onboarding tour's steps per role (admin, member, admin in a binome) and when it starts by itself: per role and email, versioned, blocked storage counts as seen ([onboarding-tour.md](onboarding-tour.md)) |
| `test/overview.test.js` | the Overview's to-do rows (grouping, worst first, the six-kind fold, held and unpaired standing in for their alerts, launch blockers, each row's link) and Binomes behind |
| `test/load.js` | not in `npm test`: 100 editors at once through the real proxy, against a calibrated Apps Script stand-in or (read-only) production: [load-test.md](load-test.md) |
| `test/ui.smoke.js` | not in `npm test` (needs a browser): `npm run test:ui` starts the mock and Vite on ports 3311 / 5311, opens every dashboard page in headless Chrome for Testing (the build `playwright-core` pins) as an admin, an admin in a binome and a member, and fails on a console error, an uncaught exception or an error screen. Browser: `npx playwright-core install chromium-headless-shell` once (again after a `playwright-core` bump) |
| `test/realdata.js` | not in `npm test`: replays the 2025 data; needs `test/data/` exports (personal data, git-ignored, not on disk) |

The mock can't catch Apps Script quirks (protections, validations, locale parsing, trigger auth): live checks below.

## Local previews

- Dashboard on mock Google: `npm run mock` and `npm run dev` in `frontend/` (or the `vic-mock` and `vic-frontend`
  entries of `.claude/launch.json`) → http://localhost:5173/dev-login?as=admin@g.enp.edu.dz. `?as=stranger@g.enp.edu.dz`
  = no-access view, `?as=` = signed out, `npm run mock -- --empty` = before team import. The mock seeds 40
  registrations, two hand edits, an unpaired member, a replacement and a swap. Restarting it signs everyone out.
- Screenshots: Obscura doesn't draw Tailwind v4's `rounded-full` (pills come out square), so use Chrome
  (`playwright-chrome`). Wait until the loading skeleton is gone: the dev server serves ~140 unbundled modules.

## Manual test on the live Master (TEST_MODE = TRUE)

Use https://vic-recruitment.vercel.app with the owner account. Nobody but the admins gets mail; nothing is shared.
Results of the 2026-10-03 run and its findings: [history.md](history.md#live-test-2026-10-03).

**0. Once, after a deploy that touches the checks:** Maintenance › **Check integrity** ("N of 31 binome sheets checked";
anything found is drift that already existed). Apps Script › Executions should show the 1-minute sync running.

**A. No pairing after lock**
1. Draft → refused ("already locked").
2. Add someone to the Team tab who is in no binome → within a minute an `UNPAIRED_MEMBER` alert + the Unpaired members card.
3. Tick Exclude → both disappear.

**B. Change members** (Binomes › Change members)
1. Replace: binome, who leaves, who joins → Review…. Someone already in another binome is refused (hint: Swap); someone
   outside the Team tab gives a warning.
2. Apply → the sheet title and A1 note change, a Member Changes row, an INFO alert; mails only logged (TEST_MODE).
3. Swap one member of each of two binomes → both change together.
4. The person who left is unpaired; Place… fills the form.

**C. Cover** (same card, Cover tab)
1. Type `IT.01 it 2` → each code shows the interviewee; `HR-03x` → unknown.
2. Start → Active covers card.
3. Interview form from the stand-in for a covered code → Interview Log OK, not FLAGGED.
4. End (or the interview is done) → the cover ends at the next sync.

**D. Manual edits** — edit by hand in the Master, wait a minute (or Sync now), look at Alerts › **Manual edits**:

| Edit by hand | Expected | Then try |
|---|---|---|
| Interviewees: change a test row's Binome | MEDIUM "moved … by hand" | **Apply properly** → the row moves between the two binome sheets |
| Interviewees: type a Status | put back automatically, INFO note | — |
| Interviewees: clear a Binome | put back, not re-assigned | — |
| Interviewees: delete a TEST row | MEDIUM "deleted"; not re-imported with a new code | **Revert** restores it with the same code; delete again → **Accept** drops it for good |
| Interviewees: edit a name | INFO | **Apply** copies it to the binome sheet |
| Binomes: change a member's email | MEDIUM (+ INFO "no longer in the Team tab") | **Apply** = a proper Change members |
| Binomes: change only a member's name | INFO | **Apply** = a proper Change members (renames the sheet) |
| Binomes: change a Tag, or a code (B.05 → B.99) | MEDIUM / HIGH | **Revert** |
| Binomes: delete a row | HIGH | **Revert** rebuilds it (Created date kept) |
| Binomes: ACTIVE → PAUSED | INFO only | — |
| Team: duplicate an email | MEDIUM; closes once the copy is deleted | — |

Also: undoing an edit by hand closes its alert by itself; ticking several manual edits enables **Accept edits**.

**Odd values** — in a test binome sheet, then Sync now: Interview Date `15/10/2025` → MEDIUM year typo; time `03:00` →
INFO; a date while Contacted = "Not yet" → INFO. Correct each, then **Sync now** → closed. (The 1-minute trigger only
re-reads a binome sheet once Drive bumps its "last updated" time, which can take several minutes; Sync now forces it, except for a sheet it read in the last minute.)

**Full sheet check** — in one test binome sheet, then Check integrity, undo, check again (alert closes):
delete a row → HIGH "missing from its sheet" (Move interviewee to that same binome puts it back); add a tab in front →
HIGH "put in front of"; remove the sheet protection → MEDIUM. A tab in front stops the rest of that sheet's check (it
would read the wrong tab), so the other two only show once the tab is gone.

**Timing and interview-form cases** (passed live on 2026-10-03, [results](history.md#live-test-2026-10-03))
1. Lower `HOURS_NOT_CONTACTED` / `HOURS_NO_INTERVIEW_DATE` / `HOURS_AFTER_INTERVIEW_NO_FORM` to 0.1 / 0.15 / 0.05 →
   NOT_CONTACTED / NO_DATE / OVERDUE appear.
2. In B.02: Yes, 01/10/2026, 21:00; in B.09: time `14h3` → BAD_DATE.
3. Interview forms: a clean one, `b3` / `comm 1`, a name instead of a code, a backup interviewer, a wrong binome,
   an unknown `IT.99`, a duplicate.
4. Put the limits back afterwards. They are 32 / 40 / 5 on purpose since 2026-10-03 (the test rows raise
   NOT_CONTACTED / NO_DATE / OVERDUE mails to admins); 24 / 48 / 12 before launch.

**Clean up at the end:** delete every TEST row (Registration Responses, Interviewees, Alerts) and the test rows in the
binome sheets, Sync now, then **Accept edits** on the resulting manual edits. Also delete the Team row added in A (or,
if A reused an existing member, put back their Team row and Exclude as they were), undo the B member changes with
Change members, and end any active cover. Other admins using Change members / Cover / Apply need edit access to the
Binome Sheets folder.

**After the registration form's live check** ([registration-form.md](registration-form.md#the-live-check-evening-of-24-oct)), the same
evening, after `VITE_APPLY_URL` is switched:
1. Delete the live-check rows: A, B and C's `/apply` rows and the Google Form duplicate, in Registration Responses,
   Interviewees and Alerts, and A's rows in the binome sheets. Sync now, then **Accept edits**.
2. Flush the site's Redis, or the admins' addresses stay "already registered": Upstash console › the site's database ›
   CLI, `SCAN 0 COUNT 1000` to see that only the site's keys are there (`reg:`, `otp:`, `rl:`, `lock:`, and `prev:` from
   previews), then `FLUSHDB`, and `DBSIZE` reads 0.
3. Review Registration Responses for any row that is not from an admin address (a candidate who found `/apply` or the
   Google Form early).
4. Delete the Master TEST COPY.

**Reset all binomes** (Maintenance › Danger zone; only while nothing is shared and before registrations matter): a
wrong phrase is refused; "I confirm to reset the binomes" moves every binome sheet to the "Retired binomes" folder, empties Binomes, Team and Member
Changes, and closes the binome alerts. Then Import team → Draft → Lock. Passed live on 2026-10-03 (49 → 31 binomes).
