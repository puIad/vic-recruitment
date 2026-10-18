# Plans: Schedule, Analytics, pending changes

The owner's decisions of 2026-10-04 on the three "Coming up" pages. None of this is needed for launch. The pages
are placeholders today ([frontend.md](frontend.md#placeholders-sample-data-each-labelled-and-what-makes-them-real)).
The build plan for pending changes (2026-10-17, pulled forward 2026-10-18) is [at the end](#pending-changes-the-build-plan);
it ships before load-test task 10 and the launch.

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

## Pending changes: the build plan

Decided with the owner on 2026-10-17 on [The build plan for pending changes](https://github.com/puIad/vic-recruitment-2026/issues/63),
the last ticket of the map [Near-instant dashboard saves, the Master stays the source of truth](https://github.com/puIad/vic-recruitment-2026/issues/46).
The design is in [ADR 0001](adr/0001-pending-changes-on-vercel-queues.md), [ADR 0002](adr/0002-pending-and-dropped-changes-in-redis.md)
and the map's Decisions so far; the terms (pending change, direct write, applying, already met, dropped change,
addressed, sign-in, snapshot) are in [GLOSSARY.md](../GLOSSARY.md).

**Timing.** On 2026-10-17 load-test task 10 was due by 2026-10-20, too soon for about 5 PRs and 3 script deploys plus
the owner's live checks, so pending changes were moved to next season. Two items that stand alone shipped that day:
skipping Vercel builds on doc-only pushes, and slice 1 (sign-ins per browser), after the owner rotated the OAuth client
secret. On 2026-10-18 the owner **pulled the build forward**: slice 0's re-check passed, slices 2 to 5 are built this
season, and task 10 waits until they are live, so its sign-off covers the new path (the map's timing rule). Members get
the dashboard, and the launch comes, after it.

**Slices.** Vertical: each slice ships with the switch off, so nothing changes for anyone until the owner turns
pending changes on. Slice 2 takes the four alert actions end to end, proving the Queues consumer, `scripts.run` as the
author, Redis and the Pending pill on actions the owner can try live; slices 3 to 5 widen it.

**Tracking.** One issue per item, `ready-for-agent` once its blockers are closed (GitHub's blocked-by edges).

| Item | Status | Issue | Ships as | Depends on |
|---|---|---|---|---|
| [Skip Vercel builds on doc-only pushes](#skip-vercel-builds-on-doc-only-pushes) | live 2026-10-17 ([#71](https://github.com/puIad/vic-recruitment-2026/pull/71)) | [#64](https://github.com/puIad/vic-recruitment-2026/issues/64) | 1 PR, Vercel | — |
| [Slice 1: sign-ins per browser](#slice-1-sign-ins-per-browser) | live 2026-10-17 ([#72](https://github.com/puIad/vic-recruitment-2026/pull/72)) | [#65](https://github.com/puIad/vic-recruitment-2026/issues/65) | 1 PR, Vercel | client secret rotated (owner) |
| [Slice 0: re-check before building](#slice-0-re-check-before-building) | passed 2026-10-18 | [#66](https://github.com/puIad/vic-recruitment-2026/issues/66) | no PR | — |
| [Slice 2: alert actions end to end](#slice-2-alert-actions-end-to-end) | live 2026-10-18, switch off, live check passed ([#73](https://github.com/puIad/vic-recruitment-2026/pull/73), [#74](https://github.com/puIad/vic-recruitment-2026/pull/74)) | [#67](https://github.com/puIad/vic-recruitment-2026/issues/67) | script deploy, Upstash install, 1 PR | 0 |
| [Slice 3: Save settings and My binome fields](#slice-3-save-settings-and-my-binome-fields) | after 2 | [#68](https://github.com/puIad/vic-recruitment-2026/issues/68) | script deploy, 1 PR | 2 |
| [Slice 4: dropped changes away from the page](#slice-4-dropped-changes-away-from-the-page) | after 2 | [#69](https://github.com/puIad/vic-recruitment-2026/issues/69) | 1 PR, then script deploy | 2 |
| [Slice 5: token edges](#slice-5-token-edges) | after 2 | [#70](https://github.com/puIad/vic-recruitment-2026/issues/70) | 1 PR, Vercel | 1, 2 |

Slices 3, 4 and 5 each need only slice 2, but all three touch the page's store and 3 and 4 the apply entry, so build
them one at a time unless a session keeps to its own files. Releases follow [HANDOFF](../HANDOFF.md#how-changes-ship)
and [Deploying pending changes safely](https://github.com/puIad/vic-recruitment-2026/issues/58#issuecomment-6241420046):
script first (it only adds), then Vercel. Slice 4 is the exception: its script deploy comes after its PR, because the
sync calls an endpoint the PR adds (no secret set, no call).

After slice 5 the owner turns pending changes on, runs each slice's live check, then load-test task 10 with its
pending-changes block ([load-test.md](load-test.md#task-10--load-test-again-then-sign-off)).

Keep until the build is done: branches `prototype/pending-changes` (the prototype the owner chose from, and the dropped-change
email draft `frontend/public/prototype/dropped-email.html`), `pulad/spike-queues-accept-46bc93` (the accept timing
script), `research/pending-change-store` and `research/google-apply-limits`.

### Shipped first (2026-10-17)

Side by side with the rest of the launch code (the confirmation's wording, `SAME_CHOICES`, the department change,
`HR_ONLY_WEIGHT`): separate sessions on separate files.

#### Skip Vercel builds on doc-only pushes

Doc edits go straight to `main` and each one builds a production deployment, so on Hobby an Instant Rollback after a
doc push lands on the same code instead of the last real release.

- `web/vercel.json`: an `ignoreCommand` that skips the build when nothing under `web/` or `frontend/` changed since
  the last successful deployment. It runs in the Root Directory (`web`); exit 0 skips (the deployment shows CANCELED),
  exit 1 builds. Compare against `$VERCEL_GIT_PREVIOUS_SHA` (only set when an ignore step exists, empty on a branch's
  first deployment), for example `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ../frontend`. An empty or
  unknown SHA (shallow clone) must build.
- `docs/vercel.md` gets the rule.
- Ships: one PR, Vercel only. Its own merge touches `web/`, so it builds.
- Check: a doc-only push to `main` is canceled by the Ignored Build Step and production stays put; the next
  `frontend/` push builds (`npm --prefix ../frontend ci` and the Vite lines in the log).

#### Slice 1: sign-ins per browser

From [Token handling for pending changes](https://github.com/puIad/vic-recruitment-2026/issues/56#issuecomment-6241993937)
(the 48 h end stops revoking) and [Sign-ins with no revoke at the 48 h end](https://github.com/puIad/vic-recruitment-2026/issues/62#issuecomment-6242149871).
No Redis, no queue. It makes the glossary's **Sign-in** true: per browser, 48 h from the latest Google sign-in on that
browser, and one ending leaves the person's other browsers running. Today the first call after one browser's 48 h
revokes the grant, which signs that person out everywhere, and their next sign-in shows the consent screen.

**Before it goes live**, the owner rotates the OAuth client secret: Cloud Console › Credentials, add a new secret, set
`GOOGLE_CLIENT_SECRET` in Vercel, redeploy, disable the old one. With no revoke at the 48 h end, a refresh token stays
live at Google until 6 months unused, so the kill switch becomes `SESSION_KEY` **and** the client secret, and the
current secret was pasted in a build chat.

- `web/api/callback.js`: when Google returns no refresh token, reuse the old cookie's for the same verified email,
  with no 48 h condition (the id_token checks are unchanged). Test the reused token with one refresh first; refused =
  `/api/login?consent=1`. `iat = now` on every Google sign-in, inside the 48 h too. When another account signs in,
  revoke the outgoing grant only if its cookie is inside its 48 h (signed out or not), and at once (slice 5 adds the
  wait for pending changes); past the 48 h, overwrite with no revoke.
- `web/api/logout.js`: always `{email, rt, iat, out: true}`, never revoke, inside or after the 48 h.
- `web/api/run.js`: past the 48 h, no revoke and no clear: rewrite the cookie to `{email, rt, iat}` (the access token
  dropped) and answer `EXPIRED` as today.
- `web/lib/session.js`: the 30-day cookie stays; its comment gets the new reason (a later sign-in on that browser
  reuses the token, so no consent screen).
- `docs/vercel.md`: sign-in per browser, the reuse, the two-part kill switch, the secret rotation moved from optional to
  done, and the manual check "sign out, sign back in" now covering after the 48 h too.
- Tests (`test/vercel.test.js`): reuse after the 48 h, a refused reused token sent to consent, `iat` reset, logout and
  `run.js` past the 48 h keeping the cookie and never revoking, a switch inside and past the 48 h.
- Ships: one PR, Vercel only; no script deploy, no `API_VERSION` change.
- Check: load-test task 10's sign-in block, live.

### The pending-changes slices (before task 10)

#### Slice 0: re-check before building

Planned for next season; run on 2026-10-18 when the owner pulled the build forward. Every check held
([#66](https://github.com/puIad/vic-recruitment-2026/issues/66)):

- Vercel Queues on Hobby: still a beta, still free (1M operations a month), same SDK (`@vercel/queue` 0.8.0, CommonJS),
  push consumers, retention 60 s to 7 days, messages partitioned per deployment, rollback and delete as #58 says.
- Upstash Redis Free through the Vercel Marketplace: 500K commands a month, 250 MB, 10 GB bandwidth; installs as a
  Free plan connected to chosen projects only; free databases archived after 30 idle days; not moved by a project
  transfer.
- The accept timing: not re-run. The 2026-10-17 spike stands (warm p95 303 ms), and slice 2 and task 10's pass mark
  measure it inside `api/run.js`.
- Code drift since `3f1a4d5`: only #71 and #72, both from this plan. The `.gs` files and `store.ts` are unchanged.
- The map's rules: the owner confirmed all of them stand, now for this season.

Details for slice 2 from the re-check: `handleNodeCallback` is a method of a `new QueueClient()`, not a top-level
export; the trigger is `functions.<file>.experimentalTriggers: [{ type: "queue/v2beta", topic, retryAfterSeconds,
maxDeliveries }]`; setting a max concurrency on push makes each delivery count twice, so leave it unset; the Redis
env var names the Marketplace sets aren't documented, so read them in Vercel after the install (`Redis.fromEnv()` takes
`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`).

#### Slice 2: alert actions end to end

Resolve, Snooze, Mute and Unmute become pending changes for admins.

Script, deployed first (only adds, no `API_VERSION` bump):
- The lean apply entry ([The lean apply entry](https://github.com/puIad/vic-recruitment-2026/issues/55#issuecomment-6240494285),
  [the document-lock spike](https://github.com/puIad/vic-recruitment-2026/issues/59)): one call per author carries their
  changes; `access_()` once; the document lock (about 5 s wait, refused = retry), never the script lock; reads only the
  Alerts tab's ID column, then that row's Status and Resolved At; compares by value per
  [Which mismatches drop a pending change?](https://github.com/puIad/vic-recruitment-2026/issues/50) (an expired
  snooze counts as OPEN, AUTO-RESOLVED is already met); writes only the cells that apply, Resolved At = the click time
  and Snooze's end fixed at the click; no `loadCtx_`, no `publishFresh_`. Answers per change `applied`, `met` or
  `dropped` (with the sheet's value or a reason) and the write time; per call, lost access or retry. Not in `/api/run`'s
  allowlist: only the consumer calls it.
- The switch ([The switch between pending changes and direct writes](https://github.com/puIad/vic-recruitment-2026/issues/57#issuecomment-6240873896)):
  a script property, off at first; an owner-only `webRun` action (the `TRIGGER_OWNER` check Setup uses) to flip it; its
  value in the admins' pulse and state (missing = off).
- The snapshot's precise build time (the ms of `ctx.now`) next to `updated`.
- A quick rollback command in `package.json`: both deployments back to a given version, only to versions that have the
  entry.
- Tests on the mock: each action against each sheet state, the lock refused, lost access.

Owner: install Upstash Redis Free from the Vercel Marketplace on this project only, as a Vercel-managed Free plan
([handing the store over](https://github.com/puIad/vic-recruitment-2026/issues/60)).

Vercel, one PR after the deploy:
- The accept step inside `web/api/run.js`, never a function of its own ([the accept-step spike](https://github.com/puIad/vic-recruitment-2026/issues/53#issuecomment-6242217500)):
  the change-format number (an unknown one gets its own error code); the access token refreshed when under 30 min is
  left and written back to the cookie (a failed refresh = direct write); `seal({email, at, ate})` under `SESSION_KEY`
  into the message only, never Redis or the logs; the Redis entry written first (seen value, apply-by = the token's end,
  the same-person merge from the record), then the publish with about 2 h retention; either failing = direct write and
  the entry removed. `Redis.fromEnv()`; no Redis call while the switch is off.
- The push consumer (a queue trigger in `web/vercel.json`, `handleNodeCallback`): unseal, call the entry through
  `scripts.run` as the author, at most one call per author per minute; mark the entry applied or met with its write time
  for 10 min, or turn it into a drop; retry with backoff while about 6 min of token life is left; lost access drops all
  that author's pending changes at once; a 401 or `invalid_grant` drops them as "sign-in ended before it was saved",
  with Apply mine anyway.
- The pulse flag ([how the author's screen merges](https://github.com/puIad/vic-recruitment-2026/issues/61#issuecomment-6241981197)):
  while the author's record holds a pending entry, the pulse call returns it next to the `scripts.run` result (admins
  every 5th poll), and the page reads it on load and on tab return.
- Drop answers: Keep the sheet's value marks the drop addressed (it expires 7 days later); Apply mine anyway goes back
  through the accept step as a fresh change. A page marks the drops it shows as shown.
- The page: the overlay is a view over `state` built from the author's entries, never written into it, and replaces
  `dropAlerts` on the pending path; rows and counts move with it. The Pending pill, the "In the sheet" flash, the drop
  on its row with the amber box and one toast per click ([the prototype](https://github.com/puIad/vic-recruitment-2026/issues/51),
  variant A). The close warning only until the change is safe. The owner's switch control on the Settings page. A
  refused format = direct write and a reload prompt. Switch off or a failed accept = today's direct write.
- Tests: fakes for Queues and Redis in `test/vercel.test.js` and in the local mock (`test/webdev.js`), so
  `npm run mock` shows the pending path.
- Live check (owner, switch on for the check, then off): the four actions on test alerts, the pill and its flash, and a
  drop forced by a hand edit of the Status cell before the change applies.

#### Slice 3: Save settings and My binome fields

Script, deployed first (only adds):
- The entry gains settings: Settings A:B, compared after `saveSettings_`'s parsing (a missing row or blank value = the
  default), appends a missing key's row.
- And binome fields: `findFileRow_`, then `memberSet_`'s row read and `goldText_` compare; the `dirty:<binome>` mark and
  `patchSlice_` kept, so the partner sees the value at their next poll; a candidate gone from the binome drops with the
  typed text.
- Values failing `memberValue_` or `saveSettings_`'s checks drop at once with their reason: no retry, no Apply mine
  anyway.
- Members get the switch in their slice or pulse.

Vercel, one PR:
- The Settings page and My binome go through the accept step. A pending setting shows only on its Settings row. The
  "run Setup" note for `SYNC_EVERY_MINUTES` and `DIGEST_HOUR` moves to the page, at the click. The candidate-left notice
  has only OK.
- Live check: a setting as an admin, a My binome field as a member, and the partner's screen at their next poll.

#### Slice 4: dropped changes away from the page

Vercel, one PR first ([where drops are kept](https://github.com/puIad/vic-recruitment-2026/issues/54#issuecomment-6241394373)):
- An endpoint for the sync, guarded by a shared secret: it returns the drops due an email (no page showed them within
  5 min) and the authors due an admin alert (a shown drop unseen for 5 min and unaddressed, or 24 h after the email with
  no answer), takes back what the sync sent, and first sweeps entries past their apply-by into drops ("retries ran
  out").
- While a drop is on screen the page refreshes its seen time once a minute, on the pulse. A visit that finds drops from
  while away opens the must-answer dialog (the prototype's variant C), with Keep the sheet's value for all and Apply all
  of mine.

Script, deployed after the PR:
- The sync calls the endpoint each cycle (the secret in a script property; unset = no call), sends one email per author
  per sync through `mail_()` and `mailHtml_()` (the draft on the prototype branch: "[VIC Recruitment] N of your changes
  were not applied"), raises `DROPPED|<email>` and resolves it once every drop of that author is addressed.
- Live check: a drop with the page closed: the email after about 5 min, the dialog on the next visit, the admin alert
  when it goes unanswered.

#### Slice 5: token edges

Vercel, one PR ([Token handling for pending changes](https://github.com/puIad/vic-recruitment-2026/issues/56#issuecomment-6241993937)):
- `callback.js`: another account signing in while the outgoing cookie is inside its 48 h reads the outgoing person's
  record. Changes pending = mark it "revoke when done" instead of revoking; nothing pending, or Redis unreadable =
  revoke at once. That person signing in again anywhere clears the mark.
- The consumer: after an author's last pending change ends, check the mark and revoke with that change's access token.
- Sign out and Switch account wait only for a save still being accepted; the screen they land on says N changes are
  still being saved and that one which can't be shows at the next sign-in and by email.
- Live check: load-test task 10's next-season block.

### After the season

Hand the store over as [Research: handing the Marketplace Redis store over to vic.rh](https://github.com/puIad/vic-recruitment-2026/issues/60)
says: switch pending changes off and let the queue drain, disconnect the store, transfer the project, and the new owner
installs their own free Upstash and redeploys. Redis data is lost by design, and a free store idle for 30 days is
archived, so each season recreates it.
