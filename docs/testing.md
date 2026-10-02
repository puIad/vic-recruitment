# Testing

## Automated (`npm test`, also run by `npm run deploy`)

Everything runs on an in-memory mock of the Apps Script services (`test/mockgas.js`), no Google account needed.

| File | Covers |
|---|---|
| `test/unit.test.js` | pure logic: code parsing, autocorrect, pairing, routing, registration and timing checks |
| `test/e2e.test.js` | the whole flow through the menu: setup → import → draft → lock → registrations → sheet edits → sync → interview forms → move → digest; asserts no false manual-edit/integrity alert |
| `test/web.test.js` | every dashboard action through `webState` / `webRun` under web-app conditions: TEST_MODE, change/swap, covers, every manual-edit fix path, odd values, the full sheet check, access control |
| `test/vercel.test.js` | the Vercel functions against a mocked Google (`test/googlemock.js`): session, proxy, refusals |
| `test/realdata.js` | not in `npm test`: replays the 2025 data; needs `test/data/` exports (personal data, git-ignored, not on disk) |

The mock can't catch Apps Script quirks (protections, validations, locale parsing, trigger auth): live checks below.

## Local previews

- Vercel dashboard on mock Google: `node test/webdev.js` → http://localhost:3000/dev-login?as=admin@g.enp.edu.dz
  (`?as=stranger@g.enp.edu.dz` = no-access view, `--empty` = before team import). It seeds 40 registrations and two
  hand edits, so the Manual edits filter has something to show. Also in `.claude/launch.json` as `vercel-preview`.
- Old Apps Script dashboard: `node test/devserver.js` → http://localhost:8787.
- Browser automation note: Obscura doesn't implement `<form method="dialog">`, so confirming the dashboard's dialogs
  navigates away there; set `dialog.returnValue = 'ok'` and call `close()` instead, or use Chrome.

## Manual test on the live Master (TEST_MODE = TRUE)

Use https://vic-recruitment.vercel.app with the owner account. Nobody but the admins gets mail; nothing is shared.

**0. Once, after a deploy that touches the checks:** Maintenance › **Check integrity** ("N of 49 binome sheets checked";
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
| Binomes: change a member's email/name | MEDIUM | **Apply** = a proper Change members |
| Binomes: change a Tag, or a code (B.05 → B.99) | MEDIUM / HIGH | **Revert** |
| Binomes: delete a row | HIGH | **Revert** rebuilds it (Created date kept) |
| Binomes: ACTIVE → PAUSED | INFO only | — |
| Team: duplicate an email | MEDIUM; closes once the copy is deleted | — |

Also: undoing an edit by hand closes its alert by itself; ticking several manual edits enables **Accept edits**.

**Odd values** — in a test binome sheet, then Sync now: Interview Date `15/10/2025` → MEDIUM year typo; time `03:00` →
INFO; a date while Contacted = "Not yet" → INFO. Correct each → closed at the next sync.

**Full sheet check** — in one test binome sheet, then Check integrity, undo, check again (alert closes):
delete a row → HIGH "missing from its sheet" (Move interviewee to that same binome puts it back); add a tab in front →
HIGH "put in front of"; remove the sheet protection → MEDIUM.

**Timing and interview-form cases** (left from the 2026-10-01 live test)
1. Lower `HOURS_NOT_CONTACTED` / `HOURS_NO_INTERVIEW_DATE` / `HOURS_AFTER_INTERVIEW_NO_FORM` to 0.1 / 0.15 / 0.05 →
   NOT_CONTACTED / NO_DATE / OVERDUE appear.
2. In B.02: Yes, 01/10/2026, 21:00; in B.09: time `14h3` → BAD_DATE.
3. Interview forms: a clean one, `b3` / `comm 1`, a name instead of a code, a backup interviewer, a wrong binome,
   an unknown `IT.99`, a duplicate.
4. Put the limits back to 1000 while testing goes on (they were raised so the test rows stay quiet); 24 / 48 / 12 before launch.

**Clean up at the end:** delete every TEST row (Registration Responses, Interviewees, Alerts) and the test rows in the
binome sheets, Sync now, then **Accept edits** on the resulting manual edits. Also delete the Team row added in A (or,
if A reused an existing member, put back their Team row and Exclude as they were), undo the B member changes with
Change members, and end any active cover. Other admins using Change members / Cover / Apply need edit access to the
Binome Sheets folder.

### Test data currently in the live Master (from 2026-10-01)

All `TEST-xx` / `sim.*@g.enp.edu.dz`: Registration Responses rows 3–14; Interviewees rows 3–14 (IT.01–04, COMM.01–02,
HR.01–03, FLER.02–03 + 1 duplicate); Alerts A-0003 onwards; row 2 of the sheets of B.03 B.04 B.05 B.06 B.07 B.10 B.17
B.25 (Contacted/Date/Time).
