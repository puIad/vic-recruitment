# Admin features that replace opening the sheets

The spec built ticket by ticket on the map [#166](https://github.com/puIad/vic-recruitment/issues/166): dashboard
features that let admins do what they still open the Master or a binome sheet for. The sheets stay the store; nobody
should need to open them. One section per decided feature, newest last. Vocabulary: [GLOSSARY.md](../GLOSSARY.md).

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

**After the interview phase.** Binomes edit their columns until the interview phase closes; after that, only admins
change interviews already done. How the phase closes is
[#183](https://github.com/puIad/vic-recruitment/issues/183).

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
