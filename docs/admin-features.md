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
