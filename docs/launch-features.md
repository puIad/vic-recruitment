# Plans: pairing, screening, department change, emails

The owner's requests of 2026-10-15. Pairing (section 1) is live since 2026-10-15 (its Notes); screening (section 2)
is live since 2026-10-17 (#33, @75/@76) but stays off until the owner links the members sheet (its Rollout); the
emails (section 4, asked 2026-10-17) are live since 2026-10-17 (#45); the department change (section 3) is live
since 2026-10-18 (#84; its script went out with #85's deploy, @96 / @97). Unlike [plans.md](plans.md), 1, 2 and 4 are needed
before launch.

| # | Feature | Needed by | Size |
|---|---|---|---|
| 1 | [Pairing](#1-pairing-random-with-experience-or-by-hand): random with experience, or by hand | the production Lock, before the form opens | script + UI, one PR |
| 2 | [Screening](#2-screening-hold-low-effort-applications-decline-vic-members): hold low-effort applications, decline VIC members silently | the registration form going live | a calibration run, then script + UI, one PR |
| 3 | [Department change](#3-change-a-binomes-department) from the dashboard | any time (a hand edit of the Tag works until then) | small, one PR |
| 4 | [Emails](#4-emails-one-template-and-a-confirmation-to-registrants): one HTML template for every mail, and a confirmation to registrants (asked 2026-10-17) | the registration form going live | script + a logo PNG, one PR |
| 5 | [HR-only binomes](#5-hr-only-binomes-take-a-bigger-share-of-hr-candidates) take a bigger share of HR candidates (`HR_ONLY_WEIGHT`) | the registration form going live | small, script + UI, one PR |

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

### Notes

- 2026-10-15: built in [#32](https://github.com/puIad/vic-recruitment-2026/pull/32), in review, not deployed. All suites pass (34 unit tests), typecheck
  clean, panel checked on the mock at desktop and 390 px, light and dark.
  - Team column G **Experienced**. The script adds its header when it loads the tab; Setup adds a checkbox rule
    (`requireCheckbox`, not `insertCheckboxes`, which would untick everyone each time Setup runs) and a header note.
    Import reads the 2025 database (`pastTeam_`) and ticks the members it finds there. If that sheet can't be read,
    nobody is ticked and the import message says so. If G1 already holds another header (the script never writes over
    one), nobody counts as experienced, and teamSet and Import refuse with "Run Setup first" until Setup puts the header
    there (owner's review of #32).
  - `draftPairs`: with nobody experienced it draws exactly as before (same order, same random calls). A board lead takes
    the class it lacks, so an experienced lead gets a new member and a new lead an experienced one. The leftovers
    without an HR member mix new with experienced too. Every draft's code-cell note is rewritten on each change (the
    shape warning, then "Both members are new"), and ticking someone re-notes the draft that holds them.
  - The draft actions (`draft`, `draftPair`, `draftUnpair`) share `draftEdit_`: script lock, refused once anything is
    locked, `detectEdits_` first and `commitBase_` after. `teamSet` stays open after Lock. A plain `draft` refused when
    locked is still a message (the menu shows it as a dialog); pair and remove throw.
  - Pairs made by hand are remembered as their members' emails in the script property `DRAFT_HAND`, so Redraw all asks
    only when it would lose one and the panel marks them "by hand". Draw the rest keeps the list; Redraw all and Reset
    clear it. The snapshot carries `byHand` on draft binomes and `experienced` on `teamList` and `unpaired`.
  - The panel previews the tag and the mix of the two picked members and marks good partners (the side the draw would
    give, the other experience class). The Launch card's step 2 is now "Pair the binomes" with a link to the panel;
    the Team page has an Experience column and filter.
  - Local check: `npm run mock -- --pairing` seeds an unlocked Master (23 members, 9 of them from the 2025 team, one
    ticked by hand, 3 pairs made by hand).
  - Deploy: merge, `npm run deploy`, then run Setup once for the checkbox rule, then Vercel. Run Setup before the
    rollout's Reset and Import: Setup re-inserts the Exclude checkboxes, which unticks that column (it has always done
    this; the Import that follows rewrites the column anyway).
- **Shipped 2026-10-15:** merged as `87a7871`, `npm run deploy` (all suites green; web app @73, API @74; 18 files pushed,
  the live project pulled back afterwards: all 18 equal to `main`). Vercel production built from `87a7871` (the real
  build: `npm install` 316 packages, `tsc -b && vite build`; "Deployment completed"). Still to do (owner): Setup as
  `vic.rh` from the Master's menu, then the rollout above.

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
which the calibration replaced (the rules as built are in Notes below and Decisions 7 to 10):

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

### Notes

- 2026-10-15: built in [#33](https://github.com/puIad/vic-recruitment-2026/pull/33), in review, not deployed. Calibrated with the owner on the 273 applications of 2025 (the Master's Registration Responses, read
  through the Sheets connector; nothing saved). What turned up: 4 answered a why-question with only dots or a slash, 3
  typed a name where the answer goes, 4 a yes/no or "I don't know", 17 wrote under 10 words in all (most of them short
  but sincere), about 29 read like ChatGPT, no keyboard mash, one answer pasted twice. The department questions in the
  real form are yes/no, so one-word answers there are normal and are not scored.
- The rules as built (`screenApplication`, Rules.gs): each why-answer (Why VIC, Why <first choice>) that is only
  punctuation or emoji adds 60, one word 50, a fixed non-answer 50 (`NON_ANSWERS` in Config.gs: "I don't know", "idk",
  "no idea", "nothing", "rien", "je sais pas", "test", "n/a"…); under 10 words in all (with Anything to add) adds 10.
  `SCREEN_HOLD_AT` 50, so one strong sign holds by itself and length alone never does. On 2025: 252 at 0, 10 at 10,
  3 at 50, 4 at 60, 4 at 100, so 11 held (4 %).
- Built as planned, with these differences: the alerts are `NEEDS_REVIEW`, `VIC_MEMBER` (a member who already has a
  binome; Decline, or mute it to keep them) and `MEMBERS_SHEET`; the silent decline leaves a `VIC_MEMBER_DECLINED`
  line (INFO, AUTO-FIXED). A declined VIC member gets a code too, so Interviewees › Declined › Restore works for every
  declined row. Approve and Decline are quick ops on those alerts (`webRun('quick', {op: 'approve' | 'decline'})`,
  several at once from the list); Restore is `webRun('restore', {codes})`. The members re-check runs on every sync
  (cheap: the list is cached), not only when the list changes. Send rejections with TEST_MODE on sends one copy to the
  admin pressing it and marks nothing, so the real send still reaches everyone later.
- Also asked by the owner: names typed the wrong way round (the first-name field holds the family part of their
  `first.family@` ENP email and the other way round) are swapped in Interviewees and the binome sheet, the form
  response stays as typed, and Flags says `NAMES_SWAPPED`, whether screening is on or not. 14 of the 273 in 2025.
- UI: the review pane on Alerts (risk meter, the reasons, every free-text answer with the flagged ones marked,
  Approve / Decline), Approve / Decline on a selection, Interviewees (Risk column, On hold in the status filter,
  Review link, a Declined toggle with Restore), the Overview pipeline's "waiting for review" line, Settings ›
  Screening (the three settings, the members list's count, last read and Refresh now, the rules), Maintenance › Send
  rejections…. Local check: `npm run mock -- --screening`.
- Limits: Revert of an Interviewees row deleted by hand brings its status back but not its Risk / Screening text (they
  are not in the baseline); the score is recomputed, the decisions written there are lost. A rejection whose mail fails
  is still marked sent (`mail_` logs the failure in Executions).
- Deploy: merge, `npm run deploy` (no `API_VERSION` bump: fields only added), then Vercel. Setup once for the status
  colours (the Risk and Screening columns add themselves). Then rollout steps 3 and 4.

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

Built 2026-10-18 (script and UI in one PR, [#84](https://github.com/puIad/vic-recruitment-2026/pull/84)); live since
2026-10-18 (script @96 / @97 from `845bdba`, Vercel from the same commit). No live check recorded yet.

Binomes › ⋯ › **Change department…**, a dialog like Sheet & dashboard access:

- "Receives candidates for": IT, COMM, FLER and HR checkboxes. The script builds the tag the usual way: other
  departments in order, then HR (`IT & HR`, `COMM & HR`, `HR`, `IT & COMM`). No ALL choice (owner, 2026-10-18: there
  are no ALL binomes this year); an ALL tag is still possible by a hand edit of the Tag cell.
- Preview (dry run): old and new tag; a warning when it doesn't fit the members' Pair As (`tagWarnings_`); the
  candidates it already has that the new tag no longer covers. They stay with the binome, and the dialog links each
  one to Move.
- Apply, under the lock: `editCheck_` first (the admin must be able to edit the sheet), write the Tag, repaint the
  sheet's house (banner, header row, gold header cells, code column), a Member Changes row of type TAG, an INFO
  history line, the Tracker, `commitBase_` so no manual-edit alert follows, and the snapshot republished.
- The colour lines of `formatBinomeSheet_` move into a shared `paintHouse_(sh, b)` used by both.
- Works on DRAFT binomes (the cell only: no sheet yet, no history row), ACTIVE and PAUSED ones. Not open to members.
- No mail to the binome: their sheet shows the new house.
- A Tag still typed by hand in the Binomes tab: its MEDIUM alert now has **Apply** next to Revert and Accept (owner,
  2026-10-18). Apply keeps the typed tag as it is (an `ALL` stays `ALL`) and does the rest as the dialog would:
  repaint, TAG history row (reason `manual edit applied`), INFO line.
- The TAG row in Member Changes: Out Name = the old tag, In Name = the new one, Interviewees = the ones in progress
  it kept that the new tag doesn't cover. The INFO alert is `TAG_CHANGED`.

### Changes

| Where | What |
|---|---|
| Rules.gs | `tagFor(depts)`, the tag from a set of departments, with a unit test |
| Members.gs | `binomeTagCore_(args)` with a dry run (`tagPlan_`, `applyTag_`); `tagWarnings_` points to the dashboard instead of the Binomes tab |
| BinomeFiles.gs | `paintHouse_(sh, b, members)`, shared by `formatBinomeSheet_` and the action |
| Integrity.gs | Apply on a hand-edited Tag (`applyEdit_` → `tagPlan_` / `applyTag_`) |
| WebApp.gs | `webRun('binomeTag', {binome, depts, dryRun})` |
| frontend | `app/binomes/components/tag-dialog.tsx` (ticks, a live dry run, Move… on each interviewee kept, Apply) and the menu item; the history page shows TAG rows under a Department filter; `TAG_CHANGED` labelled |
| tests | the tag written, the sheet repainted (mock), the history row, no manual-edit alert on the next sync, the next registration for the new department routed there; refused for an unknown binome, an empty choice, a member's account, a sheet the admin can't edit, a busy lock; the dry run writes nothing |

## 4. Emails: one template, and a confirmation to registrants

Asked by the owner on 2026-10-17 ([decisions.md](decisions.md#open-questions), question 4). Needed before the form
opens (the confirmation), in one PR with the template. Built in [#45](https://github.com/puIad/vic-recruitment-2026/pull/45), live 2026-10-17 (@85/@86).

### Goal

Every email the script sends looks like VIC: the charter colours and logo, a clear title, one call to action. A new
registrant gets a confirmation with their code as soon as the sync has read their registration.

### Today

`mail_(to, subject, html)` (Sheets.gs) sends whatever HTML it is given, from "VIC Recruitment Bot". Each caller builds
its own inline Arial HTML:

| Email | Where | To |
|---|---|---|
| New interviewee(s) | `sendNewIntervieweeMails_` (Sync.gs) | both binome members |
| Instant alerts | the alerts table's `flush` (Sheets.gs) | admins; the binome and covers for alerts that concern them |
| Daily digest | Actions.gs | admins |
| Joined / left a binome, you are in binome B.xx, covers | Members.gs (4 places) | members |
| Quick-action mails (please check your registration, send the interview form again) | `sendMails_` (QuickFix.gs) | candidates, interviewers; text edited in the dashboard's preview |
| Rejections | Screening.gs | declined applicants, after recruitment |

### The template

- `mailHtml_({title, intro, blocks, cta, footer})` in a new `Mail.gs`, returning a full HTML document. Every caller
  above passes its content to it instead of building HTML; `mail_` is unchanged (TEST_MODE gate, logging).
- Built for email clients, not browsers: a 600 px table layout, inline styles only (Gmail drops most of `<style>`),
  hex colours from DESIGN.md's charter palette (`charter-blue` #127dbb header band, `charter-aqua` #69c4af accent,
  `charter-ink` #141e27 text, `charter-gray` #efefef page), system fonts with Gilroy first (most clients won't load
  it), a bulletproof button (a table cell with a link) for the call to action.
- Logo: a PNG of `vic-logo-white.svg` added to `frontend/public/brand/` and loaded from
  `https://vic-recruitment.vercel.app/brand/…` (Gmail blocks SVG and `data:` images). Alt text "VIC" so it reads
  with images off.
- Blocks the callers need: a paragraph, a key/value list (code, phone, availability), an alert table with severity
  chips (HIGH / MEDIUM / INFO in the danger / warning / info colours), a stat line (the digest's counts).
- Candidate-facing mails (confirmation, quick-action mails, rejections) and team-facing mails share the template; only
  the footer differs (team mails link the dashboard and the binome sheet, candidate mails don't).
- Quick-action mails stay plain text in the dashboard's editor; the script wraps the edited text in the template.
- Light only, with colours that survive Gmail's dark-mode inversion (no white text on a transparent background).

### The confirmation

- Sent in the cycle that reads the registration, after Interviewees is saved (like the new-interviewee mail), to the
  submitting email.
- Who gets it: every registration that got a code and is waiting, assigned or held for review. Not a duplicate, not a
  silently declined VIC member, not a registration without a usable email or name.
- What it says: thanks, their code, that a binome will contact them, the dates if set. It must not promise an
  interview (screening can still decline them), the same rule as the form's own confirmation message.
- Setting `CONFIRM_REGISTRANTS` (Settings › Sharing and email), on by default. In TEST_MODE it goes to admins only,
  through `mail_` as today.
- A Flags or Interviewees note `CONFIRMED <date>` so a re-run never sends twice.

### Changes

| Where | What |
|---|---|
| Mail.gs (new) | `mailHtml_` and the block helpers, `esc_` on every value |
| Sync.gs, Sheets.gs, Actions.gs, Members.gs, QuickFix.gs, Screening.gs | build their mails through `mailHtml_` |
| Registrations.gs / Sync.gs | the confirmation, `CONFIRM_REGISTRANTS`, the sent mark |
| Config.gs | the setting row |
| frontend | the PNG logo; Settings › Sharing and email shows the new setting |
| tests | each mail renders (snapshot of the HTML in the mock), every value escaped, the confirmation sent once, skipped for duplicates / declined VIC members / held-off setting, TEST_MODE |

### Open, to settle with the owner before building

- The confirmation's language (English, French or both) and its exact wording.
- A preview of the template (one confirmation, one alert mail, one digest) sent to the owner's inbox before it
  replaces the live mails.

### Notes

- 2026-10-17: built in [#45](https://github.com/puIad/vic-recruitment-2026/pull/45), merged and deployed the same day (@85/@86, `0ea1fa1`). All suites pass, typecheck clean. Mails checked as rendered
  HTML at 680 px and 375 px (logo loaded, and with images off: the alt text "VIC" shows in the blue band), and the new
  setting on the mock's Settings › Sharing and email.
  - `Mail.gs`: `mailHtml_({title, intro, blocks, cta, footer})` and the blocks `mailP_` (escaped text; a blank line is a
    new paragraph, `**x**` is bold), `mailList_` (key/value), `mailAlerts_` (severity chip, then the details on a small
    line above the message, so a phone never scrolls sideways), `mailStats_`, plus two the callers needed: `mailH_` (a
    small heading, for the digest) and `mailCode_` (the registrant's code, large). `mailButton_` is the table-cell
    button, `mailTeamFooter_(sheetUrl)` the team footer (dashboard, and the binome sheet when there is one). No footer
    argument means the candidate footer, with no link.
  - Colours: the four charter hexes from the plan; the button is `primary` (#0075b2, the text-safe blue, since
    DESIGN.md keeps #127dbb off button fills); chips are DESIGN.md's danger / warning / info and their soft fills as hex.
  - `esc_` (Sheets.gs) now also escapes `"`, so a value is safe inside an attribute too (links).
  - Logo: `frontend/public/brand/vic-logo-white.png` (480 × 193, transparent), shown at 120 × 48. It only loads once
    Vercel has deployed it: merge before `npm run deploy`, or the first mails show the alt text.
  - Senders moved, content and recipients kept: the new-interviewee mail, the alert mails (admins get "Open the master
    sheet", a binome "Open your binome sheet"), the digest, the five member mails (joined, left, new binome, you cover,
    someone covers for you: the plan said four), the quick-action mails (the edited text wrapped, candidate footer for
    all of them, since some go to candidates) and the rejections (the TEST_MODE note is now a first paragraph). `mail_`
    is unchanged.
  - Confirmation: `CONFIRM_MAIL` at the top of Mail.gs holds the subject and text in one place, English for now; the
    wording waits for the owner. It says thanks, shows the code, says a binome will contact them, and never mentions an
    interview (a test checks the word is absent). `processRegistrations_` queues each new row; `stampConfirmations_`
    runs before the save and keeps the ones with a code, status waiting / assigned / held, a first name and an address
    of the form `x@y.z`, stamping `CONFIRMED dd/MM/yyyy` in Flags; `sendConfirmations_` mails them after the save,
    next to the new-interviewee mail.
  - Difference: the stamp is written before the send, so a send that fails (quota) is not retried, the same as the
    new-interviewee mail; `mail_` logs it. In TEST_MODE the rows are stamped too, so registrations made while testing
    never get a confirmation later.
  - Difference: "the dates if set" is left out: there is no setting with the recruitment dates yet.
  - Held registrations get the same text, which says a binome will contact them; if screening then declines them, that
    line is wrong for them. To settle with the wording.
  - `CONFIRM_REGISTRANTS` (on by default) is in Config.gs and in Settings › Sharing and email. The "Who hears about
    what" table on that page doesn't list the confirmation (its columns are admins / binome / digest).
  - Owner's preview, 2026-10-17, live in TEST_MODE: confirmation, alert mail and digest all arrived and looked right.
    The digest took over 3 minutes from the dashboard (its full cycle, not the template).
  - Tests: `test/mail.test.js` (template, escaping, chips, footers, which registrations get one, sent once, the skips,
    setting off, TEST_MODE, member and digest mails). The mock's `MailApp` also records any mail not built by
    `mailHtml_`, and `test/gs.js` fails a suite on exit if there was one, so every suite checks every sender it reaches.

## 5. HR-only binomes take a bigger share of HR candidates

Planned 2026-10-15, grilled with the owner 2026-10-18 (Decisions 16–23). Not built yet.

### Goal

B.29 and B.30 are HR-only binomes: they only ever receive HR candidates, while the 30 mixed binomes also take IT, COMM
or FLER ones. The owner wants the HR-only binomes to take more of the HR candidates than they do today.

### Today

`pickBinome` gives a candidate to the binome with the lowest load among those whose tag covers their first choice,
ties to the lowest code. Load is counted over every department (`BALANCE_BY`: ACTIVE = pending interviewees, the
default; TOTAL = every one not out). So a mixed binome's other-department candidates already count against its HR
share, and in the 2025 simulation the HR-only binomes ended with 5 each, the FLER/COMM & HR binomes with 5–6: about
equal work. B.29 and B.30 lose every tie, their codes being the highest.

### The rule

- A new setting `HR_ONLY_WEIGHT` = K, "HR-only binome weight", a dropdown of 1 / 1.5 / 2 / 2.5 / 3 / 4, default 2.5.
- For an HR candidate, an HR-only binome's load is divided by K before the comparison. Load stays whatever
  `BALANCE_BY` counts, all departments included. An HR-only binome then takes about K times the load of the lightest
  mixed binome, and a mixed binome already busy with its other department still gets fewer HR candidates.
- Ties: the HR-only binome first, then the lowest code. At launch every load is 0, so the first HR candidates go to
  B.29 and B.30.
- K = 1 shares as today, apart from the tie order.
- Only binomes tagged exactly `HR`, only for HR candidates. A one-department binome of another department (made with
  Change department) gets no weight.
- New picks only: changing K never moves an interviewee already assigned (Move does that by hand).
- `ALL_BINOME_WEIGHT` stays as it is.
- Rejected: counting HR candidates only, (hrCount + 1) / K against (hrCount + 1), the 2026-10-15 draft. It gave a fixed
  share per 100 HR registrants (K / (2K + 30) to each HR-only binome) but ignored a mixed binome's other-department work.

### Settings › General

Under the settings, a card **How HR candidates are shared**: each HR-only binome's current load next to the mixed
binomes' average and lightest load, and a line saying that with this weight an HR-only binome takes about K times the
lightest mixed binome's load. It follows the weight being edited before Save. With no HR-only binome it says so. The
share per 100 HR registrants can't be a fixed number under this rule (it depends on how many candidates the other
departments bring), so the card shows the live loads instead.

### Changes

| Where | What |
|---|---|
| Config.gs | `['HR_ONLY_WEIGHT', 2.5, …]` in `SETTINGS_DEFAULTS` (no Setup needed: a missing row reads the default, Save appends it) |
| WebApp.gs | `HR_ONLY_WEIGHT` in `SETTING_ENUMS`; each binome in the snapshot carries `load` (from `loads_`) |
| Rules.gs | `pickBinome(dep, binomes, allWeight, hrOnlyWeight)`: the HR-only division and the tie order |
| Registrations.gs | `assignRow_` passes `num_(s.HR_ONLY_WEIGHT, 1)` |
| frontend | `settings-ui.ts` label and icon; `HR_ONLY_WEIGHT` in the General group; `SettingsPage`'s `extra` may be a function of the draft values; the card on the General page; `load?` on `Binome` |
| tests | `test/unit.test.js`: the 32 production tags (no candidate data): K = 1 shares like today, K = 2.5 gives B.29 / B.30 about 2.5 × the lightest mixed load, the tie order, a non-HR candidate unchanged |

## Decisions (owner, 2026-10-15)

| # | Question | Answer |
|---|---|---|
| 1 | Who counts as experienced? | Pre-ticked from the 2025 database; the owner ticks others and unticks mistakes by hand |
| 2 | One experienced member per binome: rule or preference? | A preference: everyone is paired, both-new binomes get a note |
| 3 | A high risk score? | Always held for review, never declined automatically |
| 4 | Do declined applicants hear back? | Yes: one polite email after recruitment closes, sent by an admin. VIC members get nothing. |
| 5 | Where does the VIC members list come from? | A linked Google Sheet, read every 30 minutes |
| 6 | Email the binome when its department changes? | No: the sheet shows it |
| 7 | What makes an application weak? | A why-answer that is only dots or a slash, under 2 words, or a non-answer ("I don't know", "idk", "rien", "test"…). ChatGPT-sounding answers don't count |
| 8 | Is one strong sign enough to hold? | Yes, the rest can be fine; a person approves it in one click |
| 9 | A short answer that seems sincere? | Never held for length alone (under 10 words adds 10 points) |
| 10 | `SCREEN_HOLD_AT` | 50: 11 of the 273 applications of 2025 held |
| 11 | Names typed the wrong way round? | Swap them automatically, note `NAMES_SWAPPED` in Flags |
| 12 | The members sheet's link | Set later in Settings › Screening; Screening stays off until then |
| 13 | 2025 results for the calibration | Not kept: calibrated on the applications alone |
| 14 | Change department: offer ALL? (2026-10-18) | No: IT, COMM, FLER, HR only. ALL by a hand edit if ever needed |
| 15 | A Tag edited by hand: Apply too? (2026-10-18) | Yes: Apply keeps the typed tag, repaints the sheet and logs it, like the dialog |
| 16 | HR-only binomes: which rule? (2026-10-18) | Today's load over every department, an HR-only binome's divided by K. Not the HR-count-only draft |
| 17 | Which binomes get the weight? | Tag exactly `HR`, for HR candidates only |
| 18 | Ties | HR-only binome first, then the lowest code |
| 19 | Values | Dropdown 1 / 1.5 / 2 / 2.5 / 3 / 4, default 2.5 |
| 20 | Already assigned interviewees | Never moved by a change of K |
| 21 | `ALL_BINOME_WEIGHT` | Left as it is |
| 22 | Settings › General | A live card with the HR-only and mixed loads, following the draft K |
| 23 | When | Build now, its own PR |

Still to get from the owner: the members sheet's link, after the deploy.
