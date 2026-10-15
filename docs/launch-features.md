# Plans: pairing, screening, department change

The owner's requests of 2026-10-15. Nothing here is built yet. Unlike [plans.md](plans.md), the first two are needed
before launch.

| # | Feature | Needed by | Size |
|---|---|---|---|
| 1 | [Pairing](#1-pairing-random-with-experience-or-by-hand): random with experience, or by hand | the production Lock, before the form opens | script + UI, one PR |
| 2 | [Screening](#2-screening-hold-low-effort-applications-decline-vic-members): hold low-effort applications, decline VIC members silently | the registration form going live | a calibration run, then script + UI, one PR |
| 3 | [Department change](#3-change-a-binomes-department) from the dashboard | any time (a hand edit of the Tag works until then) | small, one PR |

Each ships the usual way ([HANDOFF](../HANDOFF.md#how-changes-ship)): branch, `npm test`, PR, merge, `npm run deploy`,
then Vercel. The script only adds fields and actions, so no `API_VERSION` bump, and the UI treats a missing field as
empty. Every new `webRun` action is admin-only. The owner's answers to the open questions are in
[Decisions](#decisions-owner-2026-10-15) at the end and are built into the sections below.

## 1. Pairing: random with experience, or by hand

### Goal

Every binome has at least one member who has interviewed before, wherever the numbers allow. The owner chooses how
each pair is made: by the draw, or by picking the two people. Both can be mixed before Lock.

### Today

- Overview › Launch sequence: Import team, Draft, Lock. Draft runs `draftBinomes()` (Team.gs), which calls
  `draftPairs()` (Rules.gs): shuffle, pair each HR member with someone from the biggest remaining other-department
  pool, then HR + HR or a member alone for the leftovers. Drafting again clears every DRAFT row and redraws.
- "By hand" today means editing DRAFT rows in the Master's Binomes tab. The Team tab has no notion of experience.
- After Lock, drafting is closed (`activeOrPaused_` refuses). Pair two… (`newBinomeCore_`) and Change members handle
  changes from then on.
- The 32 binomes live now were drawn for testing. Pairing for production means Maintenance › Reset all binomes (it
  also clears the Team tab and the simulation's assignments), Import team, pair, Lock: the sequence of 2026-10-03.

### Experience

- New Team column **Experienced** (checkbox), appended after Notes so the existing columns keep their places. Setup
  adds the header and the checkbox.
- Import team pre-ticks it for anyone whose email is in the 2025 database (`CONFIG.TEAM_DB_DEFAULT_ID`, the 2025
  organizing team). The owner then ticks anyone else who has interviewed before and unticks mistakes, in the Team tab
  or on the pairing panel. A re-import starts again from the 2025 list, as it already does for Exclude.
- `teamMembers_` returns `experienced`; the snapshot's team rows and `unpaired` entries carry it.

### The random draw, with experience

`draftPairs(members, rnd)` keeps every current rule (HR + another department, the tags, board leads, leftovers) and
adds one preference: when it picks a partner, it looks first in the class the other person needs. It stays a
preference: everyone is paired, and when there aren't enough experienced members some binomes are two new members,
with a note.

- New HR members are paired first, each with an experienced member from the biggest other-department pool. Then the
  experienced HR members, each with a new member. A class that runs out falls back to the other one.
- Board leads (Pair As ALL) take a new member when there is one.
- HR + HR leftovers: a new one with an experienced one when possible.
- A pair where both are new gets the row note "Both members are new" (the draft already writes warnings as a note on
  the code cell).
- The result gives the mix: "28 binomes, 26 with an experienced member, 2 both new (12 experienced for 30 new)".

Pure logic, unit-tested in Rules.gs with a fixed `rnd`.

### By hand, one pair at a time

A **Pairing** panel on the Binomes page, shown while nothing is locked. Once binomes are locked the page is as today.

- Left: the members still free (not excluded, not SKIP, not in a draft), grouped by side (HR, IT, COMM, FLER, ALL),
  each with an Experienced badge the owner can toggle. A search box.
- Pick two and press **Pair**: a DRAFT row is written straight away, its tag from `pairTag()` (the one Pair two…
  uses). The pair shows on the right with its tag and mix: experienced + new, both experienced, or both new.
- Each draft pair has a remove button: the row goes and both people return to the left.
- **Draw the rest**: the random draw above, on the free members only. Hand-made pairs stay.
- **Redraw all**: today's Draft, which clears every draft. It asks first when hand-made pairs would be lost.
- Counts across the top: free members, pairs, pairs without an experienced member.
- Draft codes are renumbered after each change (from the last locked code upwards) so there are no gaps. Nothing
  points at a DRAFT code until Lock.
- Pair and remove don't ask for confirmation: drafts are scratch, nothing is shared or mailed before Lock, and Lock
  already previews.
- The Launch card's Draft step points to the panel.

### Changes

| Where | What |
|---|---|
| Config.gs | `TEAM_H` gains `Experienced` |
| Setup.gs | header and checkbox for the new column |
| Team.gs | `teamRowsFrom_` pre-ticks from the 2025 database; `teamMembers_` returns `experienced`; `draftBinomes({keep})` draws only the free members when `keep` is set; `draftPair_`, `draftUnpair_`, draft renumbering; `teamSet_` (the Experienced toggle) |
| Rules.gs | the experience preference in `draftPairs`, and its counts |
| WebApp.gs | `webRun('draft', {keep})`, `draftPair`, `draftUnpair`, `teamSet`; `experienced` on team and unpaired rows. All but `teamSet` refuse once anything is locked. |
| frontend | `app/binomes/components/pairing-panel.tsx`, the `actions.tsx` entries, the Launch card text, the badge on the Team page |
| tests | Rules: each new member gets an experienced partner when there are enough; nobody twice; tags as before; both-new only when forced; leftovers. web.test: pair, unpair, draw the rest, redraw; refused when locked, for an excluded or already drafted member, for a member's account; renumbering; no manual-edit alert afterwards. e2e: Reset, Import (pre-ticked), three pairs by hand, draw the rest, Lock creates the sheets. |

### Rollout

1. Ship it (script, then Vercel) and try it on the mock.
2. Production, TEST_MODE still on so nothing is shared: Reset all binomes, Import team, check the Experienced ticks,
   pair, Lock. This replaces the 32 test binomes and clears the simulation.

## 2. Screening: hold low-effort applications, decline VIC members

### Goal

Binomes only receive candidates worth an interview. Applications that look unserious wait for an admin to decide.
Applications from current VIC members are declined and nobody is told. Other declined applicants get one polite email
once recruitment closes.

### Today

- The script never emails a candidate. A confirmation mail is open question 4 in
  [decisions.md](decisions.md#open-questions) and was never built.
- When a registration arrives (form trigger, or the next sync), `processRegistrations_` (Registrations.gs) checks it
  with `checkRegistration` (duplicates, names, phone, emails), then `assignRow_` gives it a code and a binome. The
  binome is emailed and the NOT_CONTACTED clock starts. The binome's call is what the candidate experiences as being
  accepted.
- So the gate goes between the check and `assignRow_`.

### Two new statuses

Next to `UNASSIGNED` and `DUPLICATE`:

- **HELD**: not assigned, waiting for an admin. It has a code, so alerts and quick actions can point at it.
  `assignUnassigned_` skips it (it only takes UNASSIGNED).
- **DECLINED**: out, unless an admin restores it. Treated like DUPLICATE everywhere: not counted, not in the loads,
  not matched by the interview form.

`statusOf_` (Sync.gs) recomputes statuses on every sync: it keeps DECLINED as it keeps DUPLICATE, and HELD while the
row has no binome. A helper `isOut_(status)` (DUPLICATE or DECLINED) replaces the `!== ST.DUPLICATE` checks:
Registrations `loads_`, Interviews.gs, Integrity.gs (two places), QuickFix.gs (two), WebApp.gs, the Sync.gs counts,
the digest line in Actions.gs, and Reset in Team.gs. Reset also has to leave HELD rows held: today it would turn any
row with a code back into UNASSIGNED, and the next Lock would assign it.

Two new Interviewees columns, appended: **Risk** (0–100) and **Screening** (the reasons, then the decision: "Held:
motivation 2 words; Why VIC only dots", later "Approved by x, 16/10 14:02"). Admins only: never in the binome
sheets or the members' slices.

### What happens to a new registration

1. Its email is on the VIC members list: DECLINED, Screening "VIC member". No alert mail and no binome mail; one INFO
   line in the history (an AUTO-FIXED alert) so admins can audit it.
2. It duplicates an earlier one: DUPLICATE, as today. The member check runs first, so a member who submits twice is
   still declined silently.
3. Risk at or above `SCREEN_HOLD_AT`: HELD, with a NEEDS_REVIEW alert.
4. Anything else is assigned as today.

With `SCREENING` off, steps 1 and 3 are skipped and everything behaves exactly as today.

### The risk score

A pure function `screenApplication(answers)` in Rules.gs returns `{score, reasons[]}`. It reads the free-text
answers: why this department (Motivation), Why VIC, each department question on its own (not the joined text
`regExtras_` builds for the sheet), and Anything to add. Each signal adds points, capped at 100. Starting weights,
which the calibration replaces:

| Signal | Points |
|---|---|
| All the free text together under 10 words / under 25 words | 50 / 25 |
| Motivation under 4 words | 20 |
| Why VIC under 4 words | 15 |
| A department question answered with 0 or 1 word | 5 each, up to 20 |
| An answer that is only punctuation or one repeated character (`.....`, `aaaa`, `-`) | 25 each, up to 50 |
| Keyboard mash (5+ Latin letters, no vowel) or a filler answer (`test`, `idk`, `nothing`, `rien`, `lol`, `/`) | 20 each, up to 40 |
| The same answer pasted into two or more questions | 15 |
| A junk name (the existing MISSING_NAME check) | 20 |

Words are counted on whitespace, so Arabic and French answers count the same way. Every reason is a sentence an
admin can read ("Why VIC: only dots").

### Calibration, before it is wired in

Run the scorer over the 273 applications of 2025 (Drive: VIC Recruitment 2026 › "Last Year Registration
Applications", tab RAW) through the Sheets connector. Nothing from it is saved in the repo. The owner sees the spread
of scores and every application above 30 with its reasons. If the 2025 results are at hand, compare with who was
accepted. The owner then sets `SCREEN_HOLD_AT` and adjusts the weights. The tests use made-up answers only.

### The VIC members list

- Read from a Google Sheet the club already keeps, linked in the setting `VIC_MEMBERS_SHEET`. The script finds the
  email column by its header (any header containing "mail", the way `findTeamSource_` finds the team's) on the first
  tab that has one, or on the tab named in the link. The Team tab's emails count as members too. Nothing is copied
  into the repo.
- The sheet is not opened on every sync, which would slow the sync the load test just tuned. The emails are kept in
  the script cache and the sheet is read again when the cached copy is more than 30 minutes old, or at once with
  **Refresh now** on Settings › Screening (which shows the count and the time of the last read). The cache holds
  100 KB per value: room for about 3,000 emails.
- Both the trigger account (`vic.rh`) and the admins need view access to that sheet: the sync reads it as `vic.rh`,
  Refresh now as the admin pressing it.
- If the sheet can't be read (no access, a bad link), a HIGH alert says so and registrations carry on without the
  member check. Nobody is declined on a guess. The next good read catches up as below.
- Matched on the submitting email and the typed email, lowercased and trimmed. No name matching: a namesake would be
  declined without anyone noticing.
- When the list changes, the next sync re-checks waiting and held rows and declines the members among them. A member
  who already has a binome is not pulled out: an alert says "IT.04 is on the VIC members list but is with B.07", with
  a Decline quick action (`removeFromBinomeFile_` plus DECLINED), because the binome may already have called them.

### Reviewing

- NEEDS_REVIEW (MEDIUM) is raised on every sync for each HELD row, like NO_BINOME, and closes by itself once the row
  leaves HELD (added to `AUTO_RESOLVING`). It shows in the Alerts inbox, the digest and the batched alert mail.
- Its reading pane shows the whole application, the score and the reasons, with **Approve** (to UNASSIGNED, assigned
  straight away; the NOT_CONTACTED clock counts from Assigned At, so the binome gets its full time) and **Decline**.
  Both also work on a selection of alerts.
- Interviewees: "On hold" and "Declined" join the status filter. Declined is hidden by default, like Duplicate. A
  declined row has **Restore**: back to UNASSIGNED, marked approved so screening won't hold it again.
- Overview's pipeline card: "N waiting for review".
- Decisions are dashboard actions under the lock with `commitBase_`, so they never show as hand edits. A status typed
  into the sheet is put back, as it is today.
- Nothing is ever declined automatically on the score, however high: every risky application waits for a person.

### Rejection email at the end

- Maintenance › **Send rejections…**, pressed by an admin once recruitment closes. Never automatic.
- Goes to every DECLINED applicant except those declined as VIC members, who hear nothing.
- Uses the quick actions' email preview (editable subject and text, the recipients worked out again on send), then
  `mail_()`, so TEST_MODE keeps it to the admins while it is on.
- Each one sent is stamped in the Screening column ("Rejection sent 30/10"), so pressing it again only reaches those
  not yet sent. Long lists run with a time budget and resume, like Lock.
- Mail is sent from the admin's account (dashboard actions run as the visitor), well under the ~1,500 a day limit.
- Only applicants declined at screening. Candidates who were interviewed and not accepted are not part of this.

### Settings

`SCREENING` (TRUE/FALSE, FALSE until calibrated), `SCREEN_HOLD_AT` (a number) and `VIC_MEMBERS_SHEET` (a link), in
`SETTINGS_DEFAULTS` and `SETTING_UI`, on a new Settings › Screening page with the members list's count, last read and
Refresh now.

### Changes

| Where | What |
|---|---|
| Config.gs | `ST.HELD`, `ST.DECLINED`, `isOut_`; `IV_H` gains `Risk` and `Screening`; the three settings; NEEDS_REVIEW in `AUTO_RESOLVING` |
| Rules.gs | `screenApplication`, with unit tests |
| Registrations.gs | the order above in `processRegistrations_`; the restore path keeps HELD and DECLINED; `regHeaders_` hands the scorer each answer separately |
| Sync.gs | `statusOf_`; the members-list re-check and NEEDS_REVIEW on each sync; the counts |
| Screening code (Registrations.gs or a new Screening.gs) | `vicMembers_()`: the linked sheet's emails through the script cache, the 30-minute refresh, the unreadable-sheet alert |
| the `!== ST.DUPLICATE` sites | `isOut_` (list above) |
| Setup.gs | the new columns, the status colours |
| QuickFix.gs, WebApp.gs | `webRun('review', {codes, decision})`, `webRun('membersRefresh')`, `webRun('rejections', {draft or send, budgetMs})`; the two new alerts in the quick-action table |
| frontend | review in the Alerts reading pane; Interviewees stages and Restore; Settings › Screening; Maintenance › Send rejections…; the pipeline card; labels in `format.ts` |
| `test/mockgas.js` | `CacheService` if the mock lacks it, and a second spreadsheet to stand for the members sheet |
| tests | Rules: each signal, the caps, Arabic and French word counts, a short but sincere answer stays under the threshold. web.test and e2e: a member (from the linked sheet or the Team tab) is declined and no mail of any kind goes out; the sheet is read once per 30 minutes, not per sync; an unreadable sheet raises the alert and declines nobody; a risky one is held, in no binome sheet, with an alert; approve assigns and mails the binome; decline; restore; a later sync never re-holds an approved row or un-declines one; Reset keeps HELD and DECLINED; with SCREENING off everything is as today; a member added to the list after assignment raises the alert and stays put; rejections reach declined non-members only, once each, admins only in TEST_MODE. |

### Rollout

1. Calibrate (above) and agree the threshold.
2. Ship it (script, run Setup once for the columns, then Vercel). `SCREENING` stays FALSE.
3. The owner links the members sheet, shares it (view) with `vic.rh` and the admins, checks the count on Settings ›
   Screening, then turns Screening on.
4. Test on the live Master in TEST_MODE: one member's email, one junk application, one decent one. Then Send
   rejections… once to see the email reach the admins only.
5. During the form rewording before launch, check that the form's confirmation message doesn't promise an interview.

## 3. Change a binome's department

### Goal

Change which departments a binome receives from the dashboard, with its sheet and the history kept right, instead of
editing the Tag cell in the Master.

### Today

The Tag (`IT & HR`, `HR`, `ALL`...) decides routing: `pickBinome` gives a new candidate to the least-loaded binome
whose tag covers their first choice (`tagDepts`). It is set at draft time, or by Pair two…, from the members' Pair
As. Changing it means editing the Binomes cell, which raises a MEDIUM manual-edit alert (Accept keeps it), and the
binome sheet keeps the old house and tag in its banner and header colours. `tagWarnings_` already tells admins to
change the Tag when the members no longer fit it.

### The action

Binomes › ⋯ › **Change department…**, a dialog like Sheet & dashboard access:

- "Receives candidates for": IT, COMM, FLER and HR checkboxes, or **Any department (ALL)**. The script builds the
  tag the usual way: other departments in order, then HR (`IT & HR`, `COMM & HR`, `HR`, `IT & COMM`). ALL stays a
  separate choice because `ALL_BINOME_WEIGHT` applies to it.
- Preview (dry run): old and new tag; a warning when it doesn't fit the members' Pair As (`tagWarnings_`); the
  candidates it already has that the new tag no longer covers. They stay with the binome, and the dialog links each
  one to Move.
- Apply, under the lock: `editCheck_` first (the admin must be able to edit the sheet), write the Tag, repaint the
  sheet's house (banner, header row, gold header cells, code column), a Member Changes row of type TAG, an INFO
  history line, the Tracker, `commitBase_` so no manual-edit alert follows, and the snapshot republished.
- The colour lines of `formatBinomeSheet_` move into a shared `paintHouse_(sh, b)` used by both.
- Works on DRAFT binomes (the cell only, no sheet yet), ACTIVE and PAUSED ones. Not open to members.
- No mail to the binome: their sheet shows the new house.

### Changes

| Where | What |
|---|---|
| Rules.gs | `tagFor(depts)`, the tag from a set of departments, with a unit test |
| Members.gs | `binomeTagCore_(args)` with a dry run; `tagWarnings_` points to the dashboard instead of the Binomes tab |
| BinomeFiles.gs | `paintHouse_(sh, b)`, shared by `formatBinomeSheet_` and the action |
| WebApp.gs | `webRun('binomeTag', {binome, depts, dryRun})` |
| frontend | `app/binomes/components/tag-dialog.tsx`, the menu item, `actions.tsx` (preview, then confirm); the history page shows TAG rows |
| tests | the tag written, the sheet repainted (mock), the history row, no manual-edit alert on the next sync, the next registration for the new department routed there; refused for an unknown binome, an empty choice, a member's account, a sheet the admin can't edit, a busy lock; the dry run writes nothing |

## Decisions (owner, 2026-10-15)

| # | Question | Answer |
|---|---|---|
| 1 | Who counts as experienced? | Pre-ticked from the 2025 database; the owner ticks others and unticks mistakes by hand |
| 2 | One experienced member per binome: rule or preference? | A preference: everyone is paired, both-new binomes get a note |
| 3 | A high risk score? | Always held for review, never declined automatically |
| 4 | Do declined applicants hear back? | Yes: one polite email after recruitment closes, sent by an admin. VIC members get nothing. |
| 5 | Where does the VIC members list come from? | A linked Google Sheet, read every 30 minutes |
| 6 | Email the binome when its department changes? | No: the sheet shows it |

Still to get from the owner before screening ships: the members sheet's link, and the 2025 results if they exist (for
the calibration).
