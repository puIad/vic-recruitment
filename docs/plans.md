# Plans: Schedule and Analytics

The owner's decisions of 2026-10-04 on the three "Coming up" pages. None of this is needed for launch. The pages
are placeholders today ([frontend.md](frontend.md#placeholders-sample-data-each-labelled-and-what-makes-them-real)).

| Page | Decision |
|---|---|
| Schedule | Keep: a calendar of the interviews binomes have set, plus admin events saved in the Master. Plan below. |
| Analytics | Keep: a profile for each applicant and stats over all of them. Plan below. |
| Binome desk | **Dropped.** Remove it in the next UI PR: `frontend/src/app/chat/`, the `/desk` route in `config/routes.tsx`, its entry in `config/nav.ts`. |
| Binome view | Idea kept, **not planned yet**: binome members get their own view of the dashboard and could use it instead of their binome sheet (the script would fill the sheet for them). Needs an access rule in WebApp.gs first (today only Master editors get in). |

Both pages follow the usual order ([HANDOFF](../HANDOFF.md#how-changes-ship)): the script ships first and only
adds fields, so no `API_VERSION` bump. The UI treats a missing field as empty, so it still works on an older script.

## Schedule

**Goal:** one place to see every interview that has been set, and when. It shows the date and time the binomes typed
in their sheets. It never changes them.

### What it shows

- Month, week and day views, built from the template calendar already in `frontend/src/app/calendar/`. Every
  interviewee with an Interview Date is one event: `IT.04 · First Last`, its binome, the time. Blocks are 45 min.
  That is a display constant, not a setting.
- Colour by 1st-choice department (charter palette). A small mark shows the state, taken from Status and the alerts:
  booked, done (form in), late (time passed, no form; the OVERDUE alert), unreadable (BAD_DATE).
- Filters in the calendar sidebar: department, binome, state. The template's mini date picker stays.
- A side list **No date yet**: contacted, no Interview Date, oldest assignment first. It lists the same people the
  NO_DATE alert will catch, before it fires.
- **Clashes**, shown as a mark and not as an alert: two interviews of the same binome less than 45 min apart.
- Clicking an interview opens a read-only card: candidate, binome members, Contacted, the candidate's availability
  answer, and a link to the binome sheet. To change a date, edit the sheet. Editing it here would fight the sync,
  which treats the sheet as the source.

### Admin events (secondary)

- Trim the template's "Add event" form to: title, date, start and end time (or all day), category (Meeting, Deadline,
  Other), notes. The events show on the same calendar with their own colour, and can be hidden with a filter.
- Saved server-side in a new Master tab **Events**: `ID, Title, Start, End, All Day, Category, Notes, By, Created`.
  The first write creates the tab. Setup only ever adds tabs.
- `webRun('addEvent' | 'editEvent' | 'deleteEvent', args)`, inside `withLock_`, editors only. Delete removes the row
  (these rows hold no candidate data). Events are not mailed and not in the digest.

### Changes

| Where | What |
|---|---|
| WebApp.gs `webState` | Each `interviewees[]` entry also gets `dept`, `contacted`, `date` (`yyyy-MM-dd`), `time` (`HH:mm`), `assignedAt`. All of them are already in Interviewees (`1st Choice`, `Contacted`, `Interview At`, `Assigned At`). Add `events[]` from the Events tab. |
| WebApp.gs `webRun` | The three event actions. The write goes in Sheets.gs next to the other table helpers. |
| `frontend/src/lib/vic/types.ts` | The new fields as optional, plus `CalendarItem` (interview or event). |
| `frontend/src/app/calendar/` | Feed it from `webState` instead of `data/*.json`. Delete the sample JSON and the template's attendees, location and "personal / work" calendars. |
| `test/webdev.js` / `seed.js` | Interview dates on some seeded interviewees, two events. |
| Tests | e2e: add, edit and delete an event on the mock; `webState` carries dates. |

## Analytics

**Goal:** know who applied. Each applicant gets a profile; the whole set gets stats. The owner asked for year of
study, birthdays (with a fix for impossible years), general motivation, how they heard of VIC and field of study. The
rest of the list below is suggested.

### Where the data is

Interviewees keeps only part of the form (name, field, year, choices, department motivation, availability, the
timestamps). Birth date, "How did you discover VIC?", "Why do you want to be part of VIC?", previous clubs and the
per-department questions stay in **Registration Responses**. Analytics reads both and joins them on `Response Key`.
`responseKey_()` in Registrations.gs already computes the key from a response row.

- New script function **`webAnalytics()`** (WebApp.gs), read-only, no lock. It returns one row per registration
  (duplicates marked) with the fields below and no phone, Facebook or Discord. It also returns the birth-date
  fixes. Add it to `ALLOWED` in `web/api/run.js`. The proxy only logs the function name, never the result.
- The browser does the aggregation: about 300 rows is small, and charts can then be filtered without new calls.
- Loaded only when Analytics or a profile opens, not on every `webState` refresh.

### The applicant profile

Opens from the Analytics table, an Interviewees row and the command palette (Ctrl K):

- Code, binome, status, and a timeline: registered → assigned → contacted → date set → interviewed → form in, each
  with its time.
- Age and birthday. A guessed year shows as guessed (see below).
- Field and year of study, 1st and 2nd choice, how they heard of VIC.
- General motivation and department motivation, in full. Previous clubs. Their answers to the department's own
  questions.
- Availability, flags (duplicate, email, phone, birth date) and the binome's notes.

### Birth dates: guess and correct the year

The year of study counts again from 1 after prépa (2025 data: `PREPA` 1ST/2ND, then `DATA` 1ST is the 3rd year at
ENP). So:

- overall year = `n` for PREPA, `n + 2` for every other field (`n` from `1ST`, `2ND`, `3RD`);
- expected birth year = registration year − 17 − overall year. On the 2025 data this matches most rows: PREPA 1ST →
  2007, PREPA 2ND → 2006, DATA 1ST → 2005.

A date is suspect when the age falls outside the existing `BAD_BIRTHDATE` bounds (15–35). Typing the current year is
the usual cause: all 4 bad dates of 2025 were `…/2025`. For a suspect date, the profile and a "Birth dates to fix"
list show the guess: same day and month, expected year. The admin can **accept** it, **type** another year, or
**keep** the original. Answers go in a new Master tab **Analytics Fixes** (`Response Key, Field, Original, Fixed, By,
At`) through `webRun('fixRegistration', …)`. The form response itself is never edited. Ages and charts use the fixed
value and mark it.

`guessBirthYear(year, field, regDate)` goes in Rules.gs (pure, unit-tested next to `checkRegistration`).

### Stats

Asked by the owner:

| Stat | From | Notes |
|---|---|---|
| Year of study | Year + Field | PREPA 1st/2nd, specialty 1st–3rd; also as overall year 1–5 |
| Age and birthdays | Birth Date (+ fixes) | Age histogram; birthdays per month; "birthdays during recruitment" list |
| Field of study | Field | 2025 codes: PREPA, DATA, AUTO, GM-AUTO, MTRX, ELT, ELT-HV, ELN, MECA, MINIER, GP-ENV, GCHIM, HYDRAU, GC, QHSE, INDUS. A label map for display |
| How they heard of VIC | "How did you discover VIC?" | A checkbox list joined by commas: Friends, Social Media, Stand, Open Day, plus free "Other" text (YouTube, Messenger groups, CPSP, a member's name…). Counts per option; the Other answers listed. Answers naming a member count as referrals |
| General motivation | "Why do you want to be part of VIC?" | Searchable list of answers, length spread, most frequent words (EN/FR stop words removed). Themes by an AI model only if asked later |

Suggested:

| Stat | Why |
|---|---|
| Registrations per day and hour, cumulative curve next to 2025's | When to push the announcement; the 2025 file is the baseline |
| Department demand: 1st choice, 2nd choice, 1st → 2nd pairs, same-choice count | Which departments are oversubscribed |
| Demand per binome by department | Whether IT binomes are overloaded (in 2025 most candidates chose IT) |
| Field × department heatmap | Who applies where |
| Funnel and speed: median hours to contact, to a date, to the interview, overall and per binome | Which binomes are slow, before the alerts fire |
| Availability days | Best interview days; feeds Schedule |
| Department questions: IT skills (design, video, photo, web), COMM (trends, languages), HR (Google tools, teamwork), FLER (company visits, communication) | Profile of each department's pool |
| Previous club experience (yes/no, clubs named) | |
| Data quality: duplicates, bad emails, bad phones, bad birth dates, personal vs ENP email | How clean the form is; may justify form changes next year |
| After interviews: final department vs 1st choice (Interview Log) | How often candidates end up elsewhere |

### Changes

| Where | What |
|---|---|
| Registrations.gs `regHeaders_` | Find the extra columns (discover, why VIC, clubs, the department questions) by header, like the rest |
| Rules.gs | `guessBirthYear` + unit tests |
| WebApp.gs | `webAnalytics()`, `webRun('fixRegistration')` |
| `web/api/run.js` | `webAnalytics` in `ALLOWED` |
| `frontend/src/app/analytics/` | Replace the sample page: stats cards, applicant table (filter, sort), "Birth dates to fix" |
| `frontend/src/components/` | The profile sheet, shared with Interviewees and the command palette |
| `test/seed.js` | Synthetic registrations with these columns (never the 2025 file: `test/data/` is git-ignored candidate data) |

### Privacy

Only people who can open the dashboard (Master editors) see this, the same as today. It shows more per person than
the dashboard does now (birth dates, free-text answers), so it stays off the binome view if that is ever built.
