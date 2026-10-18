# Plans: My binome for admins, interview form in the dashboard

The owner's requests of 2026-10-18, grilled the same day. The answers are in [Decisions](#decisions-owner-2026-10-18)
at the end and are built into the sections below. Part 1 is live (#85, script @96 / @97, 2026-10-18);
part 2 is live (#87, script @98 / @99, Vercel 29c165c, 2026-10-18); its live check is still to do (Rollout below). Part 1 ships first: part 2 needs its access change and touches the same page.

| # | Feature | Size |
|---|---|---|
| 1 | [My binome for admins](#1-my-binome-for-admins-in-a-binome) who are in a binome | script + UI, one PR. Live 2026-10-18 (#85) |
| 2 | [Interview form in the dashboard](#2-interview-form-in-the-dashboard), editable after submit | script + UI, one PR. Live 2026-10-18 (#87) |

Each ships the usual way ([HANDOFF](../HANDOFF.md#how-changes-ship)): branch, `npm test`, PR, merge, `npm run deploy`,
then Vercel. Both only add fields and actions, so no `API_VERSION` bump, and the UI treats a missing field as empty.

## 1. My binome for admins in a binome

### Goal

An admin (editor or owner of the Master) who is in a locked binome, or is a live cover, gets the same My binome page a
member gets, from the admin sidebar, with the same rules.

### Today

- `access_()` (WebApp.gs:35) returns role `admin` as soon as the account edits the Master (:48) and never reads
  MEMBER_MAP for it, so `binome`, `m`, `edit` and `cover` stay empty for every admin.
- Nothing keeps editors out of binomes: pairing (Team.gs:216, 249), `memberMap_` (WebApp.gs:120) and the sheet sharing
  treat them like anyone. Only the order of checks in `access_()` hides the membership.
- `webState` gives admins the snapshot only; `memberState_(a)` (WebApp.gs:178) needs `a.m`. The store keeps either
  `state` or `member`, never both (frontend/src/lib/vic/store.ts:163), and `AppRouter` picks `shellRoutes` or
  `memberRoutes` from `gate.mode`.
- `memberSet_` refuses anyone but role `member` (WebApp.gs:298). `webApply`'s member flag is role `member` only
  (Pending.gs:46), so an admin's field change is dropped (Pending.gs:76).
- My binome exists only in `memberRoutes`, at `/` (frontend/src/config/routes.tsx:60). Admins poll `webPulse` every
  2 s and get `SNAP_VER`; members every 15 s and get their binome's version (WebApp.gs:88).

### Changes

Script:

- `asMember_(a)`: the member view of an access answer. A member: `a` itself. An admin whose email is in MEMBER_MAP and
  who can open that binome sheet (`sheetAccess_`): `{binome, cover, m, edit}`. Anyone else: `null`. Role stays `admin`,
  so no admin check changes. Called only where it is needed (`webState`, `memberSet_`, `webApply`, the interview
  actions of part 2), never from `webPulse`, so the 2 s poll gets no Drive call.
- `webState` for an admin adds `member: memberState_(...)` when `asMember_` finds a binome.
- `memberSet_` and `webApply` check `asMember_(a)` (not a cover, with edit) instead of `role === 'member'`.
- `webPulse(true)` for an admin in a binome adds `bv`, their binome's version from `binMeta_()` (a MEMBER_MAP lookup in
  script properties, no Drive), so a partner's edit refreshes the admin's page.

UI:

- Store: an admin keeps `member` next to `state` (from `s.member`); `gate.mode` stays `"ok"`. A change of `bv` refreshes
  like a change of `v`.
- Route `/my-binome` in `shellRoutes`, to the same `MyBinomePage` (it already reads `useMemberView().member`). Check the
  page for links that assume it lives at `/`.
- Nav: a My binome item in the People group (frontend/src/config/nav.ts), shown only when `member` is set; the same
  filter for the command palette's `pageIndex`. The admin sidebar keeps its Google files row; the page has its own
  "Open my binome sheet" link.

### Tests

- `test/web.test.js`: an editor in a locked binome gets role `admin` plus `member` in `webState`; `memberSet_` and a
  `webApply` field change work for them with edit access and are refused without; an editor in no binome gets no
  `member`; an admin who is a live cover gets a read-only slice of the covered codes; `webPulse` gives `bv`.
- `tsc -b`; `test/webdev.js` gains a mock admin who is in a binome.

### Built (2026-10-18)

As planned, plus: `webState` catches a Drive error in `asMember_` or `memberState_`, so a hiccup costs the admin their
My binome for that load, never the dashboard. `webApply` makes the Drive call only when the call holds a field change.
A plain admin who opens `/my-binome` is sent to the Overview. Mock: `/dev-login?as=adminmember` (the busiest binome's
other member, made an editor).

### Rollout

Script deploy, then Vercel. Live check: an editor account in a locked binome sees My binome under People, saves a gold
field, and the partner sees it at their next poll.

## 2. Interview form in the dashboard

### Goal

Binome members fill the interview form from My binome, on its own page per candidate, and can edit it at any time
afterwards. The Google Form stays open. Both feed the same Interview Log, and every interview form fills Rating and
Final Affectation in the binome sheet.

### Today

- Interview Form 2026 (`CONFIG.INTERVIEW_FORM_ID`, [reference.md](reference.md)) is public. Responses land in the
  Master's Interview Responses tab and `onFormSubmitHandler` (Sync.gs:270) runs `processInterviews_` (Interviews.gs)
  at once: typed codes resolved and autocorrected (`resolveInterview`), a row in Interview Log, status INTERVIEWED, and
  `markInterviewInFile_` (BinomeFiles.gs:106) writes "✅ dd/MM HH:mm" in the Interview Form cell and ticks Interview
  Done. A second form raises DUPLICATE_INTERVIEW; a 1st choice that differs from the registration, CHOICE_MISMATCH; a
  final department outside IT, COMM, FLER and HR, ODD_VALUE (Interviews.gs:63).
- The form, read from its public page on 2026-10-18 (every question required unless marked optional):

  | Section | Questions |
  |---|---|
  | (top) | Your Binôme Code, Interviewee Code (short text) |
  | First Impressions | Introduce yourself, What you know about VIC, Motivation, English level (scores 1 to 10); Their 1st Department Choice (IT, HR, FLER, COMM), which picks the next section |
  | Information & Technology | 4 scores |
  | Communication | 4 scores; TikTok account (Yes, No, No but I would create one); English and French fluency (scores) |
  | Human Resources | 2 scores; Familiar with VIC Entertainment (Yes, No); 3 scores; leadership score (optional) |
  | Finance, Logistics & External Relations | 1 score; previous work experience (Yes, No; optional); sponsorship availability and training attendance (Yes, No, Maybe); 4 scores |
  | TA9RIR AL MASIR (all four sections end here) | Final Main Department Affectation (IT, HR, FLER, COMM, 7ECHOH); Activity Department Affectation (English Bubble, SPARK, Training, NON-Affiliated); Commentaire et Conclusion du TP (paragraph); Anything to add? (paragraph, optional) |

- The web app runs as the signed-in user (`executeAs: USER_ACCESSING`, appsscript.json). Members can't open the Master,
  and Vercel holds no owner credential: members write only their binome sheet (`memberSet_`), and the owner's sync
  carries it to the Master. Covers get view access only. Binome sheet code reads `getSheets()[0]` everywhere.
- Binome sheet: Rating takes a number from 0 to 10, format `0.#`; Final Affectation takes IT, COMM, FLER, HR or Not
  accepted (`AFFECTATION_OPTIONS`, Config.gs:104). The sync runs every `SYNC_EVERY_MINUTES` (15 by default).

### Where the answers live

| Place | Written by | What |
|---|---|---|
| Binome sheet, new tab **Interview Answers** (added after the main sheet, so `getSheets()[0]` is unchanged) | the member, from the dashboard, with their own access; the sync, for copies of Google Form responses | one row per interview of the binome's candidates: Interviewee Code, Source (Dashboard or Google Form), Submitted At, Submitted By, Edited At, Edited By, then one column per question |
| Master, new tab **Dashboard Interviews** | the sync | the lasting copy of every dashboard row (Reset all binomes trashes the binome sheets): the Interview Responses columns, so `intHeaders_` finds them, plus Binome, Submitter, Edited At, Edited By, and what the form last filled (Filled Rating, Filled Affectation) |
| Interview Log | the sync | as today. A dashboard row's key is its own (`DASH\|<binome>\|<code>`), so an edit redoes its log row instead of adding one |

### Changes: script

- Config: `INTERVIEW_QUESTIONS`, the one list of questions (id, title exactly as the Google Form, type, options,
  required, section, branch), the tab names and both headers.
- `webRun('interviewGet', {code})`: for a member, an admin in a binome (`asMember_`) or a cover (their codes only).
  Opens the binome sheet with the caller's access and returns the questions, the answers row for that code if any, its
  Source and its Edited At. No lock.
- `webRun('interviewSave', {code, answers, seen})`: for members and admins in a binome with edit access, not covers.
  The code must be in the caller's binome; the codes are never typed. Checks the answers against
  `INTERVIEW_QUESTIONS` (required ones per branch, scores 1 to 10, choices from their lists, paragraphs kept as text
  with the leading apostrophe), creates the tab if it is missing, and writes or updates the row under `memberLock_`.
  `seen` is the Edited At the page loaded: if the row changed meanwhile (the partner), it refuses with CONFLICT. Then the
  binome is marked dirty and its cached slice gets `interview: {at, by, source}` for that candidate, so the partner sees
  Submitted at their next poll. A Google Form row can't be saved over.
- `interviewSave` is a direct write even with pending changes on: an answer set is not a one-cell change.
- Sync, for dirty binomes and on the integrity pass: read the Interview Answers tab. A Dashboard row that is new, or
  differs from its Dashboard Interviews copy, is upserted there and processed like a form response: `resolveInterview`
  with the fixed codes and the submitter, a log row (new) or the same log row redone (edit), status INTERVIEWED, the
  sheet mark "✅ dd/MM HH:mm (dashboard)", and the checks raised again on an edit. The row is compared by content, not
  only by Edited At, so a hand edit of the tab counts as an edit (Edited By "by hand").
- Every interview form, from either source, fills two cells of the binome sheet when they are empty: Rating, the
  average of the scores answered, one decimal; Final Affectation, the final department, with 7ECHOH written as Not
  accepted. An edit refills a cell only if it still holds what the form wrote last time. These are script writes: the
  baseline takes them, so no manual-edit alert.
- Google Form responses: after processing, a Source = Google Form copy goes into the binome's Interview Answers tab,
  so the dashboard shows it read-only.
- 7ECHOH is a known final department: no more ODD_VALUE for it (Interviews.gs:63).
- Move interviewee (`moveInterviewee_`, Actions.gs:36) carries the answers row to the new binome's tab, as it carries
  the gold cells.
- Quick fixes that find an interview's response row (QuickFix.gs:605) also look in Dashboard Interviews. Integrity and
  Repair leave the second tab alone; Repair adds its header only if the tab is missing.

### Changes: UI

- My binome, per candidate row, with the date once submitted: **Fill interview form** (none yet), **Edit answers**
  (dashboard), **View answers** (Google Form, read-only). View-only members and covers get View answers and a prefilled
  Google Form link instead of the form (`entry.1757583213` = binome code, `entry.1249446617` = interviewee code).
- Route `/interview/:code` (member routes) and `/my-binome/interview/:code` (admin routes): a full page. Header with
  the candidate's name, both codes and their registration's 1st choice; one card per section; scores as a 1 to 10
  segmented control; radio groups; text areas; a sticky Submit / Save changes bar. Built for phones first. The page
  renders the questions `interviewGet` sends, so the list exists only in Config.gs.
- The 1st choice starts on the registration's value and can be changed. The department section follows it; answers of
  a section left behind are not saved.
- Drafts: localStorage key `vic:interview:<binome>:<code>`, saved on every change, cleared after a save, each read
  and write in try/catch; a "Draft restored" note when one is found.
- CONFLICT: "Your partner saved this form meanwhile", with a reload that keeps the draft.

### Tests

- `test/web.test.js`: `interviewGet` and `interviewSave` rules: member, admin in a binome, cover read-only, view-only
  refused, a code outside the binome refused, missing required answers refused, CONFLICT on `seen`, a Google Form row
  can't be saved over.
- `test/e2e.test.js`: a dashboard save, then a sync: Dashboard Interviews row, Interview Log OK, INTERVIEWED, the
  sheet mark, Rating (average) and Final Affectation filled. An edit: the same log row, cells refilled only while
  untouched, a hand-typed Rating kept. 7ECHOH gives Not accepted and no ODD_VALUE. A Google Form submission also fills
  both cells and appears in the binome's tab. Move carries the row; Reset keeps the Master copy.
- No manual-edit or integrity alert from the new tab or the fills (`test/quick.test.js`, the integrity suite).
- `tsc -b`; `test/webdev.js` serves both actions.

### Built (2026-10-18)

As planned, with these details settled while building:

- The questions were read again from the form's public page: 35 of them (5 first, 4 IT, 7 COMM, 7 HR, 8 FLER, 4 final),
  `INTERVIEW_QUESTIONS` in Config.gs with each title exactly as the form, odd spaces included. The two code questions are
  `INTERVIEW_CODE_TITLES` and the prefill entry ids `INTERVIEW_ENTRY`.
- Dashboard Interviews has no separate Binome and Submitter columns: its Email Address and Your Binôme Code columns (the
  form's own headers, so `intHeaders_` finds them) hold the submitter and the binome. Then Edited At, Edited By, Filled
  Rating, Filled Affectation, Response Key. A copy is found by interviewee code, so after a move its key (and log row) stay.
- `seen` is a token, the second of the last save plus who made it (`saveToken_`), so two partners saving within one second
  still conflict. The sync's hand-edit test compares the same token between the tab and the Master copy.
- A Google Form response is copied into the binome tab only when the candidate has no row there yet (their dashboard
  answers, or an earlier form, stay). Forms processed before this deploy have no copy: View answers says so.
- The quick-fix link "The form response" on interview-form alerts opens the Interview Responses row, or the Dashboard
  Interviews row for a dashboard form. Integrity and its Repair leave the tab alone (a tab put in front is put back by the
  existing reorder repair). Setup adds the Master tab with its header only when it is missing.
- The member state carries `interviewForm` (the prefilled Google Form link); the UI hides every interview button while it is
  absent, so the UI can reach Vercel before the script deploy without broken buttons.
- Mock: `npm run mock` seeds, in the `?as=member` binome, one form filled from the dashboard, one sent with the Google Form.

### Rollout

- Script first (`npm run deploy`), then Vercel. The tab is created by the first save, so the 32 live sheets need no
  migration.
- Live check with Test mode on: an editing member fills a form for a test candidate; the partner sees Submitted; after
  Sync now the Interview Log row, the status, Rating and Final Affectation are right. Edit it and sync again. A cover
  sees View answers and the Google Form link.

## Decisions (owner, 2026-10-18)

| # | Question | Answer |
|---|---|---|
| 1 | Where My binome shows for an admin | An item in the admin sidebar's People group, only for an admin in a locked binome or a live cover |
| 2 | What an admin can do there | The same as a member |
| 3 | How the form is fillable | A native dashboard form, its own page per candidate |
| 4 | Who fills it | The binome's members, admins in binomes included. Narrowed by 13: edit access to the binome sheet is needed |
| 5 | Where answers are stored | First answer: a new Master tab. Replaced by 13 |
| 6 | The Google Form | Stays open; its responses show read-only in the dashboard |
| 7 | Where the questions come from | Copied in the code, one list |
| 8 | Sheet fill | Rating and Final Affectation |
| 9 | Rating | The average of all the scores answered, one decimal |
| 10 | 7ECHOH | Not accepted, and no more ODD_VALUE alert for it |
| 11 | A value already typed | Only empty cells are filled; an edit refills only cells still holding the form's last value |
| 12 | Google Form submissions fill too | Yes |
| 13 | Members can't write to the Master (found while writing this plan) | An Interview Answers tab in each binome sheet, copied to the Master by the sync. Covers and view-only members get the prefilled Google Form |
| 14 | Their 1st Department Choice | Prefilled from the registration, editable |
| 15 | Branching | As the Google Form: every department section ends on the final section |
| 16 | Drafts | In the browser |
| 17 | After submit | Editable any time; an edit redoes the log, the checks and the sheet fill; Edited At and Edited By kept, last version only |
| 18 | Layout | Its own page |

## Not in this plan

- Admins reading interview answers outside their own binome (for example on Interviewees).
- Server-side drafts, a sheet column for Activity Department Affectation, editing Google Form responses from the
  dashboard.
