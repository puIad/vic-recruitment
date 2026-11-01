# Admin features that replace opening the sheets

The spec built ticket by ticket on the map [#166](https://github.com/puIad/vic-recruitment/issues/166): dashboard
features that let admins do what they still open the Master or a binome sheet for. The sheets stay the store; nobody
should need to open them. The signed build order comes first, then one section per decided feature, newest last. Vocabulary:
[GLOSSARY.md](../GLOSSARY.md).

## Build order

Signed by the owner in [#180](https://github.com/puIad/vic-recruitment/issues/180), 2026-10-31. The deliberation is expected
around 12 Nov 2026; applications close on 5 Nov at 18:00 Algiers. Nothing here was built when it was signed. Sizes are estimates in
build sessions, each plus review, and every deploy is asked first.

| Rank | Build ticket | Feature | Size | Deploy | Before results |
|---|---|---|---|---|---|
| 1 | [#185](https://github.com/puIad/vic-recruitment/issues/185) | [When the timed sync stops](#when-the-timed-sync-stops) | M, 1 | clasp, Vercel, owner's watchdog trigger | Must |
| 2 | [#186](https://github.com/puIad/vic-recruitment/issues/186) | [Pause and resume a binome](#pause-and-resume-a-binome) | M to L, 1.5 | clasp with Setup, Vercel | Must, live by 5 Nov 18:00 |
| 3 | [#187](https://github.com/puIad/vic-recruitment/issues/187) | [Edit a candidate's data](#edit-a-candidates-data) | M, 1 | clasp, Vercel | Must |
| 4 | [#188](https://github.com/puIad/vic-recruitment/issues/188) | [Admins fill in a binome's columns](#admins-fill-in-a-binomes-columns) | M, 1 | clasp, Vercel | Must |
| 5 | [#189](https://github.com/puIad/vic-recruitment/issues/189) | [Raw responses, Interview Log and Tracker](#raw-responses-interview-log-and-tracker) | M, 1 | clasp, Vercel | Must |
| 6 | [#190](https://github.com/puIad/vic-recruitment/issues/190) | [One binome's panel and page](#one-binomes-panel-and-page) | L, 2 | clasp, Vercel | Must |
| 7 | [#191](https://github.com/puIad/vic-recruitment/issues/191) | [Closing the interview phase](#closing-the-interview-phase) | M, 1 | clasp, Vercel | Must |
| 8 | [#192](https://github.com/puIad/vic-recruitment/issues/192) | [Email and notification status](#email-and-notification-status) | M to L, 1.5 | clasp, Vercel | Must |
| 9 | [#193](https://github.com/puIad/vic-recruitment/issues/193) | [How a phase-1 result is decided](#how-a-phase-1-result-is-decided) | M to L, 1.5 | clasp, Vercel | Must |
| 10 | [#194](https://github.com/puIad/vic-recruitment/issues/194) | [The results view](#the-results-view) | M, 1 | clasp, Vercel | Must |
| 11 | [#195](https://github.com/puIad/vic-recruitment/issues/195) | [Telling candidates their result](#telling-candidates-their-result) | L, 2 | vic-enp after 5 Nov 18:00, clasp, Vercel | Must |
| | **Cut line: about 14.5 sessions above** | | | | |
| 12 | [#196](https://github.com/puIad/vic-recruitment/issues/196) | [Buttons for the menu-only actions](#buttons-for-the-menu-only-actions) | S, 0.5 | clasp, Vercel | No |
| 13 | [#197](https://github.com/puIad/vic-recruitment/issues/197) | [Add, edit and remove Team members](#add-edit-and-remove-team-members) | L, 2 | clasp, Vercel | No |
| 14 | [#198](https://github.com/puIad/vic-recruitment/issues/198) | Locate links | S, 0.5 | Vercel | No |

**Hard dependencies.** The binome page needs candidate edits, the binome's columns and the form read. Closing the phase needs the
binome's columns. Results need the close. The results view needs results and the form read. Result mails need mail status, results and the
results view. Locate links wait for the binome page and the form read. The build tickets carry these as blockers.

**vic.rh sign-in test.** Run live right after the sync watch is deployed, with vic.rh on hand to re-authorize. Going final and sending
results depend on that sign-in, so the answer arrives while the results build can still change.

**Mail status.** One build: the log, `MAIL_FAILED`, Resend and the views ship together.

**Owner's accepted risks.**
- **No deploy freeze** before applications close. Each deploy is judged when asked, and the pause build lands in the last days of
  applications.
- **No checkpoint.** If the build runs late, the deliberation moves; the order and scope stay.

**Locate links.** The alert panels' six "Go to" targets stay until each one's edits and reads have shipped, and #198 then removes the ones
no longer needed.

**After results.** What the next phase needs from phase-1 results goes to a phase-2 map, not this spec.

## Edit a candidate's data

Decided in [#167](https://github.com/puIad/vic-recruitment/issues/167) (owner, 2026-10-29). Builds on the alerts' quick
fix `edit` op (`quickEdit_` in `QuickFix.gs`), which already does this for the fields its alerts cover.

**Who.** Every Master editor, as for the other admin actions.

**Fields.** Twelve registration fields can be edited:

| Field | Check |
|---|---|
| First Name, Family Name | needs letters (as today) |
| Email | an email address, lowercased (as today) |
| Phone | an Algerian number, normalized (as today) |
| Birth Date | a date, dd/mm/yyyy (as today) |
| 1st Choice, 2nd Choice | IT, COMM, FLER or HR (as today) |
| Field, Year, Availability | one of the registration form's options (a dropdown) |
| Facebook, Discord | free text, trimmed, may be blank |

The free-text answers (Motivation, Discovered VIC, Why VIC, Other Clubs, Why this department, Department Questions,
Anything to add) stay read-only: they are the candidate's own words. The new checks are no stricter than registration,
so a value the form accepted is never refused.

**Where.**
- An **Edit** button in a candidate's details, opened from an Interviewees row, the command palette or an alert. The
  alert's quick fix opens the same form, prefilled with the field at fault.
- **Inline** in the Interviewees table: any visible column of an editable field, with the same checks (text cells for
  names, email and phone; dropdowns for the choices, field, year and availability). One cell per save.

**Refused.**
- A new email, or a new name + phone pair, that belongs to another live registration (the duplicate rule of
  `checkRegistration`): the message names that candidate and their code, and the duplicate tools take it from there.
- A declined candidate or a duplicate: read-only until restored, so a fix never lands on the row that gets dropped.
  A candidate on hold can be edited (fixing their data is often why they are held).
- A name or email change while that candidate has an open manual edit of their name / email (as today).

**A new 1st choice.** It is saved either way.
- No binome yet (Unassigned): the routing places them now, as the quick fix does today.
- A binome that does not take the new department: the reply says so and offers **Move interviewee** (which carries
  Contacted, the date and the notes). Nothing moves without that second click. An inline edit that needs the move opens
  the candidate's details with the warning.

**The write.** A direct write, never a pending change: the admin waits for the reply. The Master, the binome sheet row
(`refreshFileRow_`, keeping what the binome typed) and the baseline stay in step, so the edit never comes back as a
`MANUAL_EDIT`. A binome sheet that refuses the write raises a `FILE_ERROR` alert, as today.

**Alerts.** The registration check runs again on that row in the same call: alerts the edit fixed close, a new problem
opens (a blank Facebook or Discord is not one). The reply says both.

**Log.** One row per changed field in Interviewee Changes: `Edited <field>`, old value, new value (the tab's When, By, Code, What, From, To). It
shows in Change history. The alerts' quick fix edits are logged the same way.

**Mail.** None. The binome sees the new values in their sheet and on My binome; an admin who wants to tell the binome or
the candidate uses the existing draft-and-send.

## Admins fill in a binome's columns

Decided in [#168](https://github.com/puIad/vic-recruitment/issues/168) (owner, 2026-10-29). Builds on My binome's gold
fields (`memberSet_` in `WebApp.gs`), which only members use today.

**Who.** Every Master editor, writing with their own access to the binome sheet. An admin who can't open that sheet gets
an error naming it.

**Which candidates.** Every candidate in a binome, declined and duplicates included. Unassigned candidates have no binome
sheet row, so the section doesn't show.

**Fields.** The binome's seven columns (`BF_EDITABLE`): Contacted, Interview Day, Time, Interview Done, Rating, Final
Affectation, Notes, with the checks My binome uses (`memberValue_`).

**Where.** A **Binome's columns** section in a candidate's details (opened from Interviewees, the command palette or an
alert), the same form as My binome. The binome page reuses it when it is built.

**Overwriting.** An admin can replace anything the binome typed. Each field sends the value the admin's screen showed
(`seen`): if the binome changed the cell since, that field is refused and shows the new value; the others are written.

**The write.** A direct write, never a pending change: the admin waits for the reply, which answers each field as
written, conflict or error. Then the binome is marked dirty and its cached slice takes the values (`goldPatch_`), so My
binome shows them on its next poll and the next sync copies them to Interviewees.

**What the binome sees.** On My binome, a field an admin set shows "set by <admin>" under it until the binome edits that
field again. The marks are kept on the Master side, one per candidate and field (who, when), so the binome sheet layout is
unchanged; the slice carries them to My binome. They are keyed by candidate code: Move interviewee keeps the mark on
the columns it carries, and the others lose it.

**Rating and Final Affectation vs the interview form.** The form already fills those two cells only when they are empty
or still hold what the form wrote, so an admin's value stays when a form is saved later. The form's answers still land in
Interview Answers; the save's reply says Rating and Final Affectation were kept as the admin set them, and Interviewee
Changes logs the skip. **Let the form fill it**, next to each of the two fields in the details, writes the latest form's
values back right away (blank if there is no form yet), so later form saves update them again; it is logged and the mark
goes. A binome can still change the two by hand, which also clears the mark.

**After the interview phase.** Once the phase closes, only admins change Rating, Final Affectation and the form of an
interview already done; binomes keep the other columns. See [Closing the interview phase](#closing-the-interview-phase).

**Log.** One row per changed field in Interviewee Changes: `Admin set <field>`, old value, new value. It shows in Change
history.

**Mail.** None.

## Pause and resume a binome

Decided in [#169](https://github.com/puIad/vic-recruitment/issues/169) (owner, 2026-10-29). Replaces the hand edit of
Status in the Binomes tab. PAUSED keeps its meaning: the binome keeps its interviewees and gets no new ones
(`activeBinomes_` in `Sheets.gs` leaves it out; the interview check, the member map and the sync keep it).

**Who.** Every Master editor. Members never see the control.

**Where.** One toggle on the Binomes page, in each binome's row menu and in its details panel, next to Change members and
Change department. One binome at a time, no bulk. While paused, the control offers **Resume now** (optional note) and
**Change resume date** (set, move or clear it). The row shows "Paused until 3 Nov 08:00" or "Paused".

**Pause dialog.**
- **Reason**, required (optional for Resume).
- **Resume date**, optional: date and time, Algiers, defaulting to 08:00.
- **Last binome for a department.** If no ACTIVE binome would take one of its departments after the pause, the dialog
  says so ("No ACTIVE binome takes HR after this: new HR registrants will wait, NO_BINOME") and asks for a second click.
  The pause still goes through.
- **Move step**, optional: the binome's interviewees that are ASSIGNED and not contacted (Contacted empty or "Not yet"),
  all ticked, each one can be unticked. They go "to other HR binomes"; the target is picked at apply time. Hidden when no
  other ACTIVE binome takes that tag.

**Paused Until column.** A new last column in the Binomes tab, added by Setup in the same release that teaches the header
check to expect it. It is in the baseline. A hand-typed date on a PAUSED binome is INFO and the sync honours it; a date
on an ACTIVE binome is ignored and flagged INFO. Resume, by hand or from the date, clears it.

**Resume from the date.** The first sync run after the date resumes the binome, as vic.rh, doing what a manual Resume
does (log row, mail, INFO alert). So it can be up to one sync interval late.

**The write.** A pending change, a new kind for one Binomes row; with the owner's switch off it is a direct write.
- **One change.** The pause and its ticked codes are one pending change: one apply call writes the pause first, then
  each move, so the queue's order across messages doesn't matter.
- **The pause.** Applied only while Status still shows what the author saw (ACTIVE for Pause, PAUSED for Resume and
  Change resume date). Already in the wanted status = already met. Anything else = dropped, with all its moves.
- **The applier** writes the Status cell, Paused Until, the baseline and the log row, then mails the binome as the
  author. A dropped change sends no mail.
- **Each move** reuses Reassign (`moveInterviewee_` in `Actions.gs`): Contacted, the date and the notes go with it, the
  receiving binome is mailed, the candidate is not. A move is applied only if the code is still in the paused binome,
  still ASSIGNED and not contacted, and another ACTIVE binome takes its tag; the applier gives it to the least-loaded
  one, as assignment does. Otherwise that move alone is dropped ("already contacted", "no other HR binome") and the
  rest go on. The author sees the drops as usual.
- **No time limit.** A timeout is a retry like any failed apply. On a retry, a pause already applied is already met (no
  second mail), and a code already in another ACTIVE binome of the same tag is already met; the retry goes on with the
  codes still in the paused binome.
- **The gap.** A registrant assigned between the click and the apply stays with the binome. The row shows the usual
  pending mark until the change is applied.

**Alerts.** Timing alerts (not contacted, no date, overdue) keep running for a paused binome's interviewees. A live cover
is left alone and ends the usual way. Admins get an INFO alert for each pause and resume, in the daily digest, with no
instant mail.

**Log.** Each Pause, Resume and Change resume date writes a STATUS row in Member Changes: who, when, the binome, old and
new status, the resume date, the reason. It shows in Change history.

**Mail.** Pause and resume (manual or from the date) mail both members: paused, keep going with the ones you have;
resumed, new candidates will come. Change resume date mails nobody. My binome's Paused note shows the resume date when
there is one.

## Add, edit and remove Team members

Decided in [#170](https://github.com/puIad/vic-recruitment/issues/170) (owner, 2026-10-30). Builds on `teamSet_` in
`Team.gs` (Experienced only today), the quick fix `exclude` and Change members (`Members.gs`). The Binomes row stays the
source of truth for who is in a binome: only Correct name or email reaches past the Team tab, and no Team action touches
a binome's interviewees.

**Who.** Every Master editor. Members never see these controls.

**One job, one way.**

| Job | Use |
|---|---|
| Someone new, one person | Add member |
| Several new people after Lock | Import team (merge) |
| A typo in a name or address, same person | Correct name or email |
| Someone leaves or joins a binome | Change members |
| The binome should receive other departments | Change department |
| Someone stays in the team but doesn't interview | Not interviewing |
| The row shouldn't be in the Team tab at all | Remove |

**Add member.** A dialog on the Team page: name, email, department, Pair As (suggested from the department, as
`sectionToPair_` does), Experienced (ticked if the email is in the 2025 team). A valid address is required, an email
already in the Team tab is refused, and an address that doesn't look like the name gets the import's warning. It offers
Place… afterwards. Until they are placed, the usual `UNPAIRED_MEMBER` alert stands. No mail until they join a binome. A
direct write, logged in Member Changes.

**Correct name or email.** One action for the same person, on the Team page and in a binome's row menu, so it also works
for someone in a binome with no Team row (only the binome side is then updated).
- **Email** is always a direct write. It updates the Team row, the Binomes row, the sheet's sharing, the member map and
  any live cover. The old address loses the sheet and the new one gets it (or the level the binome was opened at, with
  sharing off). A new address already in the Team tab or in another binome is refused.
- **The old address** counts as a former member (a PERMANENT row in Member Changes), so a form sent from it is flagged.
- **Name**, for someone in a binome, is a direct write carried through to the Binomes row, the sheet's title and its
  banner, the path Change members already takes when the email stays the same. For someone in no binome it is a pending
  change to the Team row.
- **Mail.** An email fix sends one short notice to the new address only, not the LEFT and JOINED mails. A name fix sends
  nothing.
- **Alert.** A fix on someone in a binome raises the MEMBER_CHANGED info alert.

**Department and Pair As.** A pending change to the Team row only; a locked binome's tag never moves as a side effect,
since the tag decides routing. If the member's binome no longer fits, a warning at the click (from `tagWarnings_`'s rule,
worked out from what the page holds) links to Change department, and the binome keeps receiving its candidates until
then. Pair As offers HR, IT, COMM, FLER and ALL.

**Experienced.** Stays as it is: a pending change (`kind: 'team'`).

**Not interviewing.** One pending toggle that writes the Exclude column. Both columns stay in the sheet; a row with Pair As
SKIP shows as not interviewing, and turning the toggle off on such a row asks for a real Pair As.
- Allowed for someone in a locked binome. It changes nothing about the binome, and the page shows both states.
- Not-interviewing people stay on the Team page under a state filter, with an undo (`teamList` stops leaving them out).
  They stay out of the Place, Cover and Pair two pickers.
- The unpaired alert closes at the next sync. The alert's quick fix `exclude` stays a direct write, so it resolves at once.

**Remove.** Allowed for anyone, after a confirm. For someone in a locked binome, the confirm names the binome and says they
keep their access and candidates; the binome is not touched. The removal is logged in Member Changes, and that row keeps
the "no longer in the Team tab" alert quiet, as a Change members arrival does today (`teamEdits_`). They leave the pickers,
and `tagWarnings_` no longer judges their binome. A direct write.

**Import team.** Before Lock it stays as it is, with Replace. After Lock it becomes a merge: rows match by email, existing
rows never change, and a preview lists the new names, their Pair As and flags, and anyone coming back after a removal,
before anything is written. Rows with no valid email are skipped and listed. Nobody is mailed. Each new person raises the
usual unpaired alert. Replace is refused by the script after Lock; Reset opens it again.

**Notes.** The Team tab's Notes column (import warnings like "Invalid email") is read-only on the member's row. Correcting
an email rechecks it, so a fixed address clears its own warning.

**Drafts.** Only before Lock or after a Reset. Correct name or email updates the draft row too. Remove or Not interviewing
drops them from the draft with a warning and frees their partner; that case is a direct write, since a pending change
can't edit a draft row.

**Log.** Add, Remove and the direct corrections each write a row in Member Changes: who, when, the old and new values. The
pending cells (name with no binome, department, Pair As, Experienced, Not interviewing) are not logged, as Experienced
isn't today.

**Pending changes.** The new cells extend `kind: 'team'` from one column to several, each applied only while the cell still
shows what the author saw. A row gone or an email corrected meanwhile drops the change. With the owner's switch off they
are direct writes.

## One binome's panel and page

Decided in [#171](https://github.com/puIad/vic-recruitment/issues/171) (owner, 2026-10-30), on a prototype with mock
data: branch [`prototype/binome-page`](https://github.com/puIad/vic-recruitment/tree/prototype/binome-page), never merged.
What an admin sees and does on one binome instead of opening its sheet. It adds no write of its own: each action writes as
its own section says.

**Who.** Every Master editor. Members never see it; they have My binome.

**Two views.** A summary panel, with a **Full page** button, and a full page at `/binomes/:code`. This panel is the
"details panel" of [Pause and resume a binome](#pause-and-resume-a-binome).

**Reaching them.** A code in the Binomes table opens the panel, since there an admin is comparing binomes; the row menu
stays. Every other binome link opens the page: the command palette, an alert, a candidate's details, Binomes behind on the
Overview, the Team page and Settings. Today those links filter the table (`/binomes?q=`).

**The panel.** The header and its actions, members and covers, the progress numbers, and the open alerts with their quick
fixes. No candidates table and no changes, so it needs no read beyond what the dashboard already holds.

**The page.** One scrolling page in My binome's layout, top to bottom: the header; progress and coming-up interviews beside
the open alerts; members and covers; candidates; changes. On a phone the cards stack in that order, the table scrolls
sideways as on My binome, and the panel takes the full width.

**Actions.** Pause / Resume and **Open sheet** are buttons. A `...` menu holds Change department, Sheet & dashboard access,
Replace a member, Swap with another binome, Move an interviewee here and Add a cover, preset to this binome and using the
same dialogs as the row menu. Correct name or email sits beside each member and End beside each cover. Open sheet stays
because admins needn't open the sheet, not because they can't.

**Alerts.** The binome's open alerts, worst first, with the inbox's row button (`RowQuickButton`).
- One-click actions (Nudge, Repair, It's fine) run in the row.
- Fix, Compare and Review open the same quick-fix form: in a side panel on the page, and in place of the content on the
  panel, with a back button.
- Multi-select stays in the inbox, and the page links to it filtered by this binome. Snoozed and muted alerts stay in the
  inbox's Muted filter.

**Candidates.** My binome's table with the same default columns, and every other sheet column available from View.
- A click opens the candidate's details, where an admin edits: the
  [Binome's columns](#admins-fill-in-a-binomes-columns) and [the registration fields](#edit-a-candidates-data). The cells
  don't edit in the table.
- A candidate under a live cover shows a "covered by <name>" badge.
- The Interview form column shows whether a form is in, its date and its source. Opening it shows the answers:
  [Raw responses, Interview Log and Tracker](#raw-responses-interview-log-and-tracker).

**Freshness.** The candidates come from the binome's copy of the last sync plus dashboard edits, labelled "as of <time>",
and follow new snapshots as My binome does. Something typed directly in the binome sheet shows after the next sync.
**Read the sheet now** reads it live with the admin's own access; without access it says so and the last copy stays on
screen. Statuses and alerts still come from the Master.

**Changes.** Member Changes and Interviewee Changes merged for this binome, newest first, with a filter by kind and a link
to Change history: who joined or left, covers, department, pauses, moves in and out, and admin edits on its candidates.
What a binome types itself isn't logged, so it doesn't appear. The dashboard holds the last 300 rows of each log, so older
rows drop off here.

**A draft binome.** The members, the tag, a "Not locked yet" note and the actions that work on a draft. No candidates,
alerts or changes. Pairing stays in the Pairing panel on the Binomes page.

**An admin in this binome.** They get this admin page, with a small link to My binome for their member view.

**The read.** New: a `webRun` action that gives an admin any locked binome's slice, and with a flag reads the sheet live over
it, keeping the Master's statuses. The prototype's `protoBinomeView` in `WebApp.gs` shows the shape. It needs a clasp
deploy.

## Raw responses, Interview Log and Tracker

Decided in [#172](https://github.com/puIad/vic-recruitment/issues/172) (owner, 2026-10-30). Which of the Master's raw tabs
admins still need to read, and where each job goes. The tabs stay as storage.

| Tab | Its job today | Where the job goes |
|---|---|---|
| Registration Responses | The raw form row behind an alert | No view: the candidate's details, the quick-fix panels and Interviewee Changes do it |
| Interview Responses, Dashboard Interviews | The answers of an interview form | **Interview form** section of a candidate's details |
| Interview Log | Each form's result, what was typed, who sent it | No page: the same section lists the candidate's forms |
| Tracker | Progress per binome | Overview and the binome page, plus optional columns on the Binomes table |

**Who.** Every Master editor. It only reads, so it writes nothing and needs no pending change.

**Interview form section.** Read-only, in a candidate's details, so an admin outside the binome can read the answers, which
`interviewGet` doesn't allow today.
- It shows the scores, their average and the answers, with the form's source (Dashboard or Google Form) and, for an edited
  form, who edited it and when.
- Every form of the candidate is listed with its Interview Log result (OK, AUTOCORRECTED, FLAGGED, IGNORED), what was typed
  and who sent it. The form that counts is open and the others are folded.
- The binome page's Interview form column opens this section.
- An admin who reaches the "in the Master's Interview Responses tab" message on an older Google Form gets a link to this
  section instead. Members keep that text.

**Form alerts.** The panels of DUPLICATE_INTERVIEW, UNKNOWN_INTERVIEWEE and the alerts about who interviewed also show the
answers, from the same read, loaded when the alert opens. A duplicate shows its two forms side by side. A form matching no
candidate has no details to open, so its alert is the only way to reach it; there is no page of all forms.

**Tracker.** The Binomes table gains Contacted, Scheduled, Withdrew, Not contacted, No date and Overdue as sortable columns,
hidden by default and available from View. The sync keeps writing the Tracker tab unchanged: it is the fallback when the
dashboard is down.

**Deleting a candidate.** When a later answer has no email, the raw row stays in Registration Responses and can't be imported
again. The message stops telling the admin to delete it by hand, so nobody has to open the sheet. In that case the erased
candidate's raw answers stay in the Master.

**The read.** New: a `webRun` action, admins only, that reads one candidate's forms: their Interview Log rows, then each
form's answers from Dashboard Interviews (a `DASH|` key) or Interview Responses. It stays out of `webAnalytics` and loads
only when the section or an alert asks. The new read and the per-binome counts need a clasp deploy, and the UI a Vercel one.

**Not here.** The alerts' "Go to" links to a sheet row are the map's Locate links item.

## Buttons for the menu-only actions

Decided in [#173](https://github.com/puIad/vic-recruitment/issues/173) (owner, 2026-10-30). Two items of the Master's VIC
Recruitment menu had no dashboard button: the binome email catch-up and Re-protect. The other ten already have a dashboard
path, so nothing else is menu-only. The whole menu stays as the fallback when the dashboard or Vercel is down.

**Email binome members their binome.** A new Maintenance row, next to Re-share, running `mailPaired_`. Lock, Pair two and
Change member already send and record this mail, so the row is a repair for a failed send or a binome locked before Lock
sent it.
- **Who.** Every Master editor. The mail goes out as the admin who clicks, and the script lock stops two admins mailing the
  same members.
- **Preview.** A read of `pairedTodo_` lists the untold members by binome with their emails, beside the rendered New binome
  mail. It is all or nothing. With nobody untold it says so and sends nothing. In test mode it says non-admins are skipped
  and stay untold.
- **Result.** A failed send stays untold and is named in the result, so running it again retries only those.
- **Writes.** Only `PAIRED_SENT`, a script property. Nothing in the Master changes, so no pending change and no publish.
- **Lock.** The "Binome email not sent" message points to this row instead of the menu.

**Re-protect binome sheets.** A new Maintenance row, running `reprotectBinomeSheets`.
- **Who.** Hidden unless `access.owner`, like Run setup again. The script keeps its own Master-owner check, so if ownership
  ever moves it still refuses the wrong account. Today the Master and the sampled binome sheets are owned by vic.rh; the
  dashboard's `owner` flag means the trigger owner, expected to be the same account.
- **Before it runs.** A plain confirm saying it is for after adding an admin. No dry run: it would open every sheet first,
  and the action is safe to repeat.
- **Report.** How many sheets were rewritten, already fine or failed. A run that hits its 4-minute budget lists the remaining
  sheets as "out of time, run it again"; the budget stays under Vercel's 300 s limit.
- **Alerts.** It resolves the protection alerts of every sheet it rewrote or found fine, instead of leaving them until the
  next full check. A sheet it couldn't reach keeps its alert.

**Link with [Add, edit and remove Team members](#add-edit-and-remove-team-members).** The notice an email fix sends must also
record the new address in `PAIRED_SENT`, or this catch-up mails that person a second time.

**Deploy.** The new actions need a clasp deploy and the rows a Vercel deploy. Test the vic.rh sign-in when Re-protect ships:
[#179](https://github.com/puIad/vic-recruitment/issues/179) lists a Vercel sign-in as unproven for renewing its grant.

## Email and notification status

Decided in [#175](https://github.com/puIad/vic-recruitment/issues/175) (owner, 2026-10-30), on the facts of
[#174](https://github.com/puIad/vic-recruitment/issues/174). Since [#184](https://github.com/puIad/vic-recruitment/pull/184)
every mail leaves from vic.rh through the mailer, whoever triggers it, so a send has no "sent as" to record; this also
replaces "as the admin" and "as the author" in the sections above. Google reports nothing about delivery, so the script
records what it tried.

**What is recorded.** Every mail through `mail_()`: confirmation, new interviewee, alert mails, drop, paired, joined, left,
cover, covered, rejection, quick-fix, digest and test mails. Mails added later get it for free, such as the pause notices
and the results mails ([#178](https://github.com/puIad/vic-recruitment/issues/178)). Tickets are not recorded: they go out
before a candidate exists, and they stay as the site's hourly counts.

**The Mail Log.** A new Master tab. `mail_()` collects rows in memory and writes them once at the end of the run, as
`alerts.flush()` does, so a sync gains one write. A run that dies mid-way loses its unwritten rows; the execution log still
has its failures. Member actions send no mail, so every run that sends can write the tab.

| Column | Holds |
|---|---|
| When | the time of the send |
| Kind | the mail's id (`CONFIRM`, `NEW_IV`, `ALERT`, ...) |
| To | one address |
| Concerns | candidate codes, binome, alert IDs |
| Triggered by | the sync, the digest, or the admin's email |
| Outcome | Sent, Held (test mode) or Failed; Resent or Dismissed once a failed row is handled |
| Error | the failure's text |
| Subject | the mail's subject |
| Stored mail | the rendered body, on a Failed row only, cleared once it is resent or dismissed |

Rows stay all season, at most 1,500 a day, and Reset clears them with the other logs. Sent means Google accepted the mail.
Bounces are not read this season: candidate addresses are proven by the ticket and member addresses are checked. The UI
says delivery isn't confirmed, and a bounce can be checked by hand in vic.rh's inbox.

**Where admins see it.** Every Master editor, read when the page opens, not polled.
- **A candidate's details:** a Mails section with every mail to or about this candidate.
- **[One binome's page](#one-binomes-panel-and-page):** a Mails section for its members and covers, and Last mail in the
  summary panel.
- **An alert's reading pane:** who was mailed about it and each outcome. An alert older than the log falls back to Emailed
  To, labelled "intended", since that column is written before the send.
- **Digest, drop and test mails** have no dashboard view (owner's choice). They stay in the tab, and a failed one still
  raises the alert below. This is the one place the feature still sends an admin to the Master.

There is no log page.

**Mail from before the log.** The log starts at deploy, and no rows are made up. Candidate details and the binome page also
show the existing marks, labelled "older record": `CONFIRMED <date>` reads "queued", since it is stamped before the send;
Rejection sent reads "sent", with its date; `PAIRED_SENT` reads "told", with no date.

**A failed send.** Since #184 a failed mail has no fallback, and a failed confirmation is not retried, so this is how it gets
seen.
- **The alert.** One `MAIL_FAILED` per run that had failures, listing them, HIGH, in the dashboard and mailed to admins, never
  to binomes. It resolves itself once every listed mail is resent, dismissed or retried. Held mail is not a failure. If the
  alert's own mail fails, that is logged and raises nothing new, so an outage can't loop.
- **Resend.** A quick action for every Master editor. A preview lists the mails, and any gone stale can be dismissed, such as
  for a candidate deleted since. It sends the stored subject and body to the address on the row, since edited quick-fix mails
  and bundled alert mails can't be rebuilt. A wrong address is fixed first, then the mail is resent. A resend adds its own row,
  triggered by the admin, and marks the old row Resent.
- **No double sends.** Resend writes the mark the original would have (Rejection sent, `PAIRED_SENT`), and its preview hides a
  row whose mark is already set, so it never repeats Send rejections or the
  [binome email catch-up](#buttons-for-the-menu-only-actions), and they never repeat it. Drop mails stay out of Resend: the next
  cycle retries them, and the alert lists them as "retrying".

**Emailed To.** Still written, as today. Quick fix stops adding someone whose send failed; today it adds them whatever the
result.

**Writes.** Mail Log rows and marks are written by the script, not typed by an admin, so no pending change and no
`MANUAL_EDIT`. Resend is a direct write, as sending a quick-fix mail is today.

**Deploy.** A clasp deploy for the log, the alert, Resend and the new read, and a Vercel deploy for the views. The mailer does
not change.

## How a phase-1 result is decided

Decided in [#176](https://github.com/puIad/vic-recruitment/issues/176) (owner, 2026-10-31). The results view that shows
this is [#177](https://github.com/puIad/vic-recruitment/issues/177), and the mails that tell candidates are
[#178](https://github.com/puIad/vic-recruitment/issues/178).

**The rule.** A binome's Final Affectation is a proposal. It becomes the phase-1 result unless the deliberation overrides it,
so nobody has to confirm the uncontested ones one by one.

**Values.** IT, COMM, FLER, HR or Not accepted, as in `AFFECTATION_OPTIONS`. An accepted candidate goes on to the next phase in
that department. Activity Department Affectation is not part of the result: it stays read-only in the form answers.

**Departments.** Any of the four is allowed. The view warns when a result is neither the candidate's 1st nor 2nd choice, and
Not accepted never warns.

**No caps.** No cap, target or waiting list. The view shows live accepted counts per department, and admins judge from those.

**Who needs a result.** Every candidate except DUPLICATE, DECLINED and WITHDRAWN, who get no result and no results mail. A
candidate with no proposal and no override shows as Needs a decision, including those who are HELD, UNASSIGNED or never
interviewed. A bulk action, with a preview, sets never-interviewed candidates to Not accepted.

**Setting a result.** Every Master editor, as a pending change. An override can carry an optional note, and it is logged in
Interviewee Changes with the note. The note is for admins only. An override stays if the proposal changes later, and the view
shows that the proposal changed. Clearing an override goes back to following the proposal.

**Storage.** A new Master column, Phase 1 Result, never in the binome sheets. Before final it holds overrides only, and the
result shown is the override or else Final Affectation. Going final copies every candidate's result into it, so later edits to
Final Affectation change nothing.

**Going final.** Only the vic.rh sign-in, the same check as [Re-protect](#buttons-for-the-menu-only-actions), and a direct write
after a preview of the counts. It is refused while:
- the interview phase is still open ([#183](https://github.com/puIad/vic-recruitment/issues/183));
- any candidate Needs a decision;
- any result is a pending change or an unaddressed dropped change.

**Reopening.** vic.rh only, until the first result mail goes out. A row whose result equals its proposal goes back to following
the proposal, and a row that differs stays as an override. No extra state is kept.

**After the first result mail.** Reopening is gone. vic.rh changes one candidate at a time with a required reason, as a
correction logged in Interviewee Changes. No mail goes out by itself: the candidate is flagged for a new mail through #178. A
candidate who first needs a result after final, from a late interview or a restored application, shows as Needs a decision and
gets it through the same correction once mails have started; everyone else stays final. Before the first mail, they are decided
the same way, with no reopen needed.

**What binomes see.** The result of their own candidates in My binome, read-only, only once the first result mail has gone
([#178](#telling-candidates-their-result) moved this from final, so a binome can't tell a candidate before the club does). The
read must not expose overrides or results before that.

**Risk.** Final depends on vic.rh signing in to the dashboard. [#179](https://github.com/puIad/vic-recruitment/issues/179) left a
Vercel sign-in by vic.rh unproven, and the trigger stoppage behind
[#182](https://github.com/puIad/vic-recruitment/pull/182) was probably the dashboard revoking vic.rh's grant. Test this sign-in
live before results week, and check the sync trigger still runs after it.

**Writes.** Overrides go through pending changes and final through a direct write, as above. All of them touch the Master only, so
no binome sheet or baseline changes and no `MANUAL_EDIT`.

**Deploy.** A clasp deploy for the column, the writes and the read, and a Vercel deploy for the views.

## The results view

Decided in [#177](https://github.com/puIad/vic-recruitment/issues/177) (owner, 2026-10-31), from the
[prototype](https://github.com/puIad/vic-recruitment/tree/prototype/results-view): variant A with the keys from variant B. What
a result means is in [How a phase-1 result is decided](#how-a-phase-1-result-is-decided).

**Who and where.** Every Master editor, on a new Results page in Control room. In deliberation one admin drives it on a shared
screen while the room reads, so it has to stay legible from a distance and shows one open candidate at a time.

**The table.** One row for everyone who needs a result, so DUPLICATE, DECLINED and WITHDRAWN never appear. Best rating first, and
candidates with no rating last. Columns: rank, candidate and code, binome, 1st / 2nd choice, Rating, what the binome proposed, the
result, and the binome's notes cut to one line. A never-interviewed candidate shows their status where the rating goes.

**Tabs and filter.** Tabs for Everyone, IT, COMM, FLER, HR, Not accepted and Needs a decision, each with its live count, so the tabs
are also the live accepted counts. A toggle switches the department tabs from who a department gets (the result, the default) to
who chose it first; Not accepted has no tab while it is on. A search takes code, name or binome.

**Setting a result.** A chip on each row shows the result and opens a menu of the five values, marking the 1st and 2nd choice, with
Follow the binome on an override. Marks beside the chip: a warning when the result is off-choice, a mark when the proposal changed
after the override, a note icon, and Saving while the pending change is applied. An override's chip has a darker outline.

**Details.** A row opens a side panel: binome, choices, proposal and activity, the result buttons, the admin note on an override,
the binome's notes and form conclusion, the scores with their average, and the answers. The answers come from the read in
[Raw responses, Interview Log and Tracker](#raw-responses-interview-log-and-tracker). The note stays admin-only, and everyone in the
room is an admin.

**Keys.** Up and down move the highlighted row, and the panel follows when it is open. Enter opens the panel and 1 to 5 set IT, COMM,
FLER, HR or Not accepted on the highlighted row. Keys do nothing while typing in a field. When a result moves a row out of the
current tab, the highlight goes to the row that takes its place.

**Final bar.** A bar above the table says what still blocks final: the phase still open, how many need a decision, how many are
saving. It holds the bulk action for never-interviewed candidates, with its preview. The vic.rh sign-in also gets Make results final
(with the preview of counts) and Reopen; everyone else gets a line saying only vic.rh can. Once final, the chips and buttons are
read-only.

**The read.** Rating, Final Affectation, Binome Notes and both choices are Master columns the sync already keeps, so the table shows
them as of the last sync, and a new admin read serves them. It stays out of `webState`, as `webAnalytics` does, and loads when
the page opens. Form answers load when the panel opens.

**Not here.** The result mails are in [Telling candidates their result](#telling-candidates-their-result), which adds Send results
to the final bar and a Not opened filter to this page. The prototype's phone layout is not a design: on a phone the table scrolls
sideways.

**Deploy.** A clasp deploy for the read, with the ones in [How a phase-1 result is decided](#how-a-phase-1-result-is-decided), and a
Vercel deploy for the page.

## Telling candidates their result

Decided in [#178](https://github.com/puIad/vic-recruitment/issues/178) (owner, 2026-10-31). Builds on
[How a phase-1 result is decided](#how-a-phase-1-result-is-decided) and
[Email and notification status](#email-and-notification-status).

**The mails.** Two outcomes, three texts, all in Settings › Emails under To candidates.

| Mail | Who | Text |
|---|---|---|
| Accepted | result is a department | One shared text with `{first}`, `{code}` and `{department}`, a next-step paragraph per department through `{next}`, and a button to the department's group |
| Not accepted, interviewed | result is Not accepted, Status is `INTERVIEWED` | Thanks them for the interview |
| Not accepted, not interviewed | result is Not accepted, any other Status | Never mentions an interview, with the warning the confirmation mail has |

The accepted mail is also the invitation to the next phase, so there is no third mail. It has the department's house colour from
`FORM_HOUSE`, as the confirmation does. Not accepted stays neutral, like the rejection. The default texts are plain and kind, and
the only theme is the colour. They are drafted when this is built, for the owner to edit.

**Send rejections stays separate.** Declined applicants have no result, so they get no results mail. Maintenance's wording says the
action covers applicants declined at screening and not interviewed candidates, and the results preview shows how many declined
applicants have not had their rejection yet.

**Sending.** The vic.rh sign-in only, with the same check as Make results final, since the first mail ends Reopen and can't be
recalled. Send results sits in the Results page's final bar, disabled with a reason until results are final. Everyone goes in one
batch from one preview, never per department or automatically. A run that nears its time limit stops and says how many are left, and
Send again reaches only those not told. Once sending has started the bar shows told and left counts.

**The preview.** Counts per mail and department, and the six mails drawn with real candidates' data: four accepted and two not
accepted. It also lists:
- candidates skipped because they are now DUPLICATE, DECLINED or WITHDRAWN, or have a missing or invalid address;
- candidates who are not `INTERVIEWED` but have a binome proposal, who get the not-interviewed text unless their form is logged
  first, so they can be checked;
- the declined applicants still waiting for a rejection.

The texts are editable in the dialog, with Send me a test. Edits are written to Settings when Send is pressed, before the first mail,
as a logged direct write, so Send again and later corrections use the same words and a batch cut short can't go out in two versions.
Send is refused while:
- results are not final;
- a department with accepted candidates has no next step or group link;
- any of these texts has a pending or dropped change;
- the push to vic-enp below fails.

**Test mode.** One copy of each mail to the presser. Result Told stays empty, the group link records nothing, and these Held rows are
not the first result mail, so Reopen stays available.

**Result Told.** A new Master column holding what the candidate was told and when, such as `IT 12/11`, written only after Google
accepts the mail. Empty means not told. A value that differs from Phase 1 Result means a correction mail is owed. Reset clears it.
"The first result mail" in [How a phase-1 result is decided](#how-a-phase-1-result-is-decided) means the first Result Told written.

**Corrections.** A correction changes Phase 1 Result only, and the Results page marks the row Mail owed. The correction dialog ends with
a preview of that candidate's mail for the new result and a Send, and the row's menu offers the same later. A candidate already told
also gets an editable line from Settings saying this mail replaces the earlier one. Someone with no Result Told, such as a late first
result, gets the normal mail without it. Send results never picks up owed corrections. Anyone already in the wrong Messenger group is
removed by hand.

**Failures.** As in [Email and notification status](#email-and-notification-status): a failed mail gets a Failed row, no Result Told and
the HIGH `MAIL_FAILED` alert. Send again and Resend both reach it, and Resend writes the Result Told the original would have, so nothing
goes twice. A stored mail whose result has changed since can only be dismissed. The 1,500-a-day quota on vic.rh shows up as failures to
retry the next day.

**Group links.** Each department has a Messenger group, with its link in a box in Settings › Emails, set as a pending change and checked
as an https link. Each accepted mail's button carries that candidate's own signed link, `/join/<token>` on the vic-enp site. The token
identifies the candidate and holds no department.
- **On a click** vic-enp records the time of the candidate's first click and redirects straight to the group of their current department.
  There is no page in between. A candidate now Not accepted, or a token it doesn't know, gets a short "this link is no longer active"
  page. A test-mode token records nothing.
- **What vic-enp holds.** The four links and each told candidate's code and current department, pushed by the script at send and at each
  correction. A changed link goes with the next sync, and it also fixes mails already sent. A failed push at send sends nothing. A
  candidate who withdraws after being told keeps a working link.
- **What a click stores.** The code and the time, with no IP address or device. It stays in vic-enp's Redis with no expiry, and Reset
  clears it. Nothing is written to the Master.

A click is not a join: only Messenger knows who joined. With no page in between, a mail scanner that opens links can also mark someone
as opened, so Opened can be wrong in that direction and the Not opened list can miss someone.

**Where admins see clicks.** Every Master editor. The dashboard's server reads clicks from vic-enp with a shared secret when the page
opens, and if vic-enp is down the page says clicks are unavailable. A candidate's details show Opened group link with its date. The
Results page shows counts per department and, once mails have gone, a Not opened filter with phone and email for following up by hand.
There is no reminder mail and no tracked reply. Replies land in vic.rh's inbox. Since clicks stay out of the Master, a next-phase list
made from it won't include them.

**Binomes.** No mail. They see their own candidates' results once the first result mail has gone.

**Writes.** Result Told is written by the script, so no pending change and no `MANUAL_EDIT`. Dialog edits to the texts are a direct
write to Settings. All of this touches the Master only.

**Deploy.** After applications close on 5 Nov 18:00, since vic-enp takes live registrations until then, asked before each one: vic-enp
first (the route, the push, the read and the secret), then clasp (the mails, the send, the column), then Vercel (the bar, the filter,
Settings). The mailer does not change. Before results week, run one test-mode send, one live send to a test address, and a click.

**Built (#195).** Where the build settled what the spec left open:
- **Setup.** vic-enp gets `JOIN_SECRET` (Vercel env var) and the script gets `JOIN_URL` (vic-enp's origin, no trailing slash) and the
  same `JOIN_SECRET` as script properties. The token is `<code>~<first 22 characters of base64url(HMAC-SHA256("join:" + code))>`.
  Without them the preview says so and Send results is refused.
- **Clicks.** The script reads them (`webRun resultClicks`, which calls vic-enp's `/api/join-clicks` with the secret), so the secret
  lives in one place besides vic-enp. Down or unset: the page says clicks are unavailable and the Not opened filter is hidden.
- **Pending texts.** The Vercel proxy refuses Send while a result text, next step or group link is a pending change or an
  unaddressed dropped change, as it does for going final (`web/api/run.js`, `resultTextsOpen`).
- **Corrections.** A final result is corrected from the row's panel by vic.rh (a reason is required); the dialog continues into that
  candidate's mail. A row is Mail owed when it was told something else, or when it got its result by a correction after mails started.
- **Test.** Send me a test (and Send in test mode) mails one copy of each of the six samples to the presser as `[TEST]`, kind TEST.
- **Resend.** A failed result mail carries `<code>, <result>` as its concerns; Resend writes the Result Told the original would have,
  and a row whose result changed since can only be dismissed.
- **Timed sync.** Once mails have gone it pushes the links and results to vic-enp whenever they differ from the last push.
- **Left for the first live run.** None of this has run against the real vic-enp or Google yet; the order and tests in the spec's
  Deploy paragraph still apply.

## When the timed sync stops

Decided in [#181](https://github.com/puIad/vic-recruitment/issues/181). A timed sync that loses its authorization stops silently:
Google's failure mail reaches only vic.rh, and one stop ran 16 h overnight unnoticed. The form trigger and the daily digest run on the
same grant and stop with it. Sync now keeps working, because it runs as the signed-in admin. A dead trigger can't report itself
([#179](https://github.com/puIad/vic-recruitment/issues/179)), so the dashboard and a second trigger watch it from outside.

**The stamp.** `syncAll` writes a new script property when it ends ok or busy. Sync now and form cycles never move it, so pressing Sync
now can't hide a dead trigger, and a sync that starts but keeps failing or timing out counts as stopped too. The snapshot's `built`
can't do this job: it moves only when the content changed, and Sync now moves it too. The stamp stays out of the snapshot, so it never
bumps `SNAP_VER`.

**The threshold.** Stopped means no stamp for 3 × `SYNC_EVERY_MINUTES`, with a 15 min floor: 15 min at a 5-minute sync. `webPulse`
returns the time since the stamp, computed on the server so a wrong laptop clock can't fake a stop. There is no banner until the first
stamp exists after the deploy. A `SYNC_EVERY_MINUTES` change saved without rerunning Setup uses the new value at once, so going from 30
to 5 min can show a false banner until Setup runs; Settings already says to run it.

**On the dashboard.** Every Master editor sees a red banner on top of every admin page, and the header's Live pill turns red with the
last cycle's time. The banner can't be dismissed and clears by itself at the next finished cycle. Members see nothing. It is not an
Alerts row, since the stopped trigger can't write one. Everyone reads:

> The timed sync has not finished a cycle since <time>. New registrations and binome edits wait until someone presses Sync now, and the
> digest won't go out. Tell vic.rh.

**What vic.rh does.** The vic.rh sign-in also gets a link to the project on script.google.com and the steps: pick `reauthorize` in the
function list, press Run, tick every box. `reauthorize()` is a new function that only logs a line, so nobody runs Setup or a sync by
mistake from that list. Re-authorizing is the whole fix; the triggers don't need reinstalling. If the banner is still red after the next
interval, a second line says to run Setup from the Master's menu.

**The watchdog.** A small trigger owned by the owner's ENP account, the one that owns the Master, with its own grant, so a lost vic.rh
grant doesn't stop it. Every 15 min it reads the stamp against the same threshold. It mails the owner and vic.rh once per stop and once
on recovery, through the normal mail template, with a tab-only Mail Log row like the digest
([#175](https://github.com/puIad/vic-recruitment/issues/175)). This is what catches a stop overnight with no admin on the dashboard. A
scope added by a deploy stops both triggers until both accounts re-authorize; the banner still shows then.

**If the watchdog stops.** It stamps its own runs. When `syncAll` finds no watchdog stamp for 3 h, it raises a MEDIUM alert telling the
owner to re-authorize, and resolves it when the stamp returns.

**No off switch this season.** Nothing stops the sync on purpose before phase-1 results. Deleting the watchdog trigger stops the mail,
and a code change removes the banner after the season.

**Writes.** Script properties only, plus the one alert above and the Mail Log row. No pending change and no `MANUAL_EDIT`.

**Deploy.** Asked before each one: clasp first (the stamp, `webPulse`, the watchdog, `reauthorize`), since older pages ignore the new
field, then Vercel (the banner and the pill). The owner installs the watchdog trigger from their own account, and vic.rh tries the steps
once.

## Closing the interview phase

Decided in [#183](https://github.com/puIad/vic-recruitment/issues/183) (owner, 2026-10-31). Binomes stop changing the results of
interviews already done, late interviews stay possible, and admins keep every edit. [Make results final](#how-a-phase-1-result-is-decided)
is refused until the phase is closed.

**Who.** Every Master editor sets the date, closes and reopens. Members never see these controls.

**Where.** A Maintenance row with the date, Close and Reopen, so this doesn't wait for the Results page. The banner below and the
Results page's final bar link to it.

**The date.** Optional, in Algiers time, and only a reminder: nothing locks by itself, and an admin can close with no date or before it.
It is a setting, so changing it is a pending change. My binome shows it from the next sync, because members can't read Settings.

**When the date passes.** One HIGH `CLOSE_DUE` alert, mailed to admins and never to binomes, and a banner on every admin page. The alert
comes from the sync, and the banner from the date itself, so it still shows if the sync has stopped. Both clear when someone closes or
moves the date, and a new date can raise them again.

**Closing.** A preview of counts first: forms that will lock, Interview Done ticked with no form (named, so admins can chase them), and
candidates not interviewed yet. Nothing blocks the close. It is a direct write, kept in a script property with who and when, and a row
in Member Changes logs it.

**What locks.** A candidate with a form on file, a saved dashboard form or a logged Google Form, while the phase is closed. Interview Done
without a form locks nothing, so the binome can still file it. On such a row three things lock:
- the interview form;
- Rating;
- Final Affectation.

Contacted, Interview Day, Time, Interview Done and Notes stay open. They can't change who gets a result: a candidate with a form stays
`INTERVIEWED` whatever Contacted says.

**Late interviews.** A candidate with no form is untouched: the binome fills everything in and saves the form, which locks those three at
once. The first sync that logs a late form copies what it finds, as it does today, and guards the row from then on.

**On the dashboard.** My binome shows the two fields and the form read-only on a locked row, with a line saying the interview phase is closed
and to ask an admin. The script refuses too, so an old page can't get through: `memberSet_` answers that field with an error,
`interviewSave_` throws, and a queued edit of Rating or Final Affectation is dropped with that reason. An unsynced form has no mark in the
sheet yet, so the check reads the Interview Answers tab as well, only while closed. An admin in a binome is locked on My binome too and
uses the candidate's details.

**In the sheet: no range protection.** This replaces the range protection in the owner's first answer. The binome columns are holes in a
sheet-wide protection, so locking one row means rewriting that sheet's holes. Only the sheet's owner can rewrite a protection, so an admin's
click can't do it and the lock would wait on vic.rh's trigger. Re-protect and Repair would reopen every row. The Interview Answers tab has
no protection at all, and a hand edit there refills Rating, so a check was needed either way. The sync does the job instead:
- **Restoring.** Each sync that reads a sheet compares the locked rows' Rating and Final Affectation with the Master's copy. A difference is
  written back, with a cell note saying to ask an admin. A hand edit in the Interview Answers tab is restored from Dashboard Interviews.
- **The alert.** One MEDIUM `LOCKED_EDIT` naming the candidate, the field and what was typed, in the dashboard and the digest, with no mail
  to the binome. An admin who types in the sheet is restored too, and the alert says to use the dashboard.
- **Google Forms.** A second form raises `DUPLICATE_INTERVIEW` as today and the first still counts. An edited response changes neither field.
- **The gap.** A hand edit shows until the next sync reads the sheet: at most one interval, since the edit moves Drive's last-updated.
- **Edits typed before the close.** The sync after a close, or after a form is logged, copies as usual and the guard starts with the next
  one. So an edit from before the close is kept, and one made in that interval is too.

**Admins.** They change everything as before. Rating and Final Affectation use the [Binome's columns](#admins-fill-in-a-binomes-columns),
and while closed that write also updates the Master's row in the same call, so the guard doesn't undo it. The interview form becomes
editable from a candidate's details, reusing My binome's form with the admin's own access to the sheet. It is stamped as edited by them, with
the usual `seen` check, and refills the two fields only where they still hold what the form wrote. A Google Form's answers stay read-only;
the two fields are how an admin changes that outcome. This form edit works whether the phase is open or closed.

**Reopening.** Every Master editor, with a required reason, logged like the close. Refused once results are final: Reopen results comes first.
It clears the passed date and offers a new one, so `CLOSE_DUE` doesn't fire again at once. Rows unlock at once, and closing again later
locks by the same rule. One wrong row doesn't need a reopen, since an admin can edit it directly.

**Mail.** Closing and reopening each mail every member of an active or paused binome once, through `mail_()`, so they land in the
[Mail Log](#email-and-notification-status). The close mail says what locks, that candidates not yet interviewed can still be interviewed, and
to ask an admin for a correction.

**Timing alerts.** `NOT_CONTACTED`, `NO_DATE` and `OVERDUE` stop being raised while the phase is closed. Open ones close at the next sync,
through the usual auto-resolve, and they come back on a reopen. The candidates left show as Needs a decision in the Results view, and the
close preview names how many.

**Writes.** The date goes through pending changes and everything else is a direct write. The close state is in a script property, out of the
Master, so no `MANUAL_EDIT`. Restores write only the binome sheet, back to the value the Master already holds. Reset clears the close state.

**Size.** Medium: about 150 to 200 lines of script (state, alert, three refusals, guard, admin form save, two mails, silenced alerts), about 150
of UI (Maintenance row, preview, banner, My binome's locked state, form in the details), and tests for the guard's timing. One build session
plus review. It needs [Admins fill in a binome's columns](#admins-fill-in-a-binomes-columns) first, or admins couldn't fix Rating and Final
Affectation on a locked row. If the Mail Log isn't in yet, the mails start logging when it lands.

**Deploy.** Asked before each one: clasp first (the refusals don't depend on the page), then Vercel. No new scope, so vic.rh has nothing to
re-approve, and the mailer does not change. Try a close and a reopen on the mock data of `test/webdev.js` before the live close. It must be
live before the deliberation around 12 Nov.
