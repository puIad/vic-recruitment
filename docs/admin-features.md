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
