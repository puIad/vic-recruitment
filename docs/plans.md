# Plans: Schedule, Analytics, pending changes, settings cleanup, email texts

The owner's decisions of 2026-10-04 on the "Coming up" pages. Schedule and Analytics are the only pages still to
build, next after the 2026-10-19 audit fixes; none of it is needed for launch, and both are placeholders today
([frontend.md](frontend.md#placeholders-sample-data-each-labelled-and-what-makes-them-real)). Two later plans are
done and kept here as a record: pending changes ([build plan](#pending-changes-the-build-plan): slices 1 to 5 live
2026-10-18 with the owner's switch off, audit fixes live 2026-10-19) and the [settings
cleanup](#settings-cleanup-the-build-plan) (both PRs live 2026-10-19). The [email texts](#email-texts-the-build-plan)
plan (2026-10-19, not built) puts the confirmation's settled wording in the code before launch, and after launch a
Settings › Emails page where admins edit the mails to candidates and binome members.

| Page | Decision |
|---|---|
| Schedule | Keep: a calendar of the interviews binomes have set, plus admin events saved in the Master. Plan below. |
| Analytics | Keep: a profile for each applicant and stats over all of them. Plan below. |
| Binome desk | **Dropped**, removed 2026-10-18: `frontend/src/app/chat/`, the `/desk` route and its nav entry are gone. |
| Binome view | **Built** as **My binome** (load-test tasks 6 to 8, [#27](https://github.com/puIad/vic-recruitment-2026/pull/27)–[#30](https://github.com/puIad/vic-recruitment-2026/pull/30); admins in a binome [#85](https://github.com/puIad/vic-recruitment-2026/pull/85); interview form [#87](https://github.com/puIad/vic-recruitment-2026/pull/87)): members in `MEMBER_MAP` see their binome only, fill in the gold columns (written into their binome sheet) and the interview form. Members get it once load-test task 10 signs it off. |

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

Only admins (Master editors) see this. It shows more per person than the dashboard does now (birth dates, free-text
answers), so it stays off My binome: members never get `webAnalytics` or the profile, and `webAnalytics` checks the
admin role like the other admin entry points.

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
| [Slice 3: Save settings and My binome fields](#slice-3-save-settings-and-my-binome-fields) | live 2026-10-18, switch off ([#75](https://github.com/puIad/vic-recruitment-2026/pull/75) @90/@91, [#76](https://github.com/puIad/vic-recruitment-2026/pull/76)); live check passed | [#68](https://github.com/puIad/vic-recruitment-2026/issues/68) | script deploy, 1 PR | 2 |
| [Slice 4: dropped changes away from the page](#slice-4-dropped-changes-away-from-the-page) | live 2026-10-18, switch off ([#78](https://github.com/puIad/vic-recruitment-2026/pull/78), [#79](https://github.com/puIad/vic-recruitment-2026/pull/79) @94/@95); sync calling `api/drops` since 18:29 UTC; live check skipped (owner), email, dialog and alert not seen live | [#69](https://github.com/puIad/vic-recruitment-2026/issues/69) | 1 PR, then script deploy | 2 |
| [Slice 5: token edges](#slice-5-token-edges) | live 2026-10-18 ([#81](https://github.com/puIad/vic-recruitment-2026/pull/81)); live check is task 10's | [#70](https://github.com/puIad/vic-recruitment-2026/issues/70) | 1 PR, Vercel | 1, 2 |

Slices 3, 4 and 5 each need only slice 2, but all three touch the page's store and 3 and 4 the apply entry, so build
them one at a time unless a session keeps to its own files. Releases follow [HANDOFF](../HANDOFF.md#how-changes-ship)
and [Deploying pending changes safely](https://github.com/puIad/vic-recruitment-2026/issues/58#issuecomment-6241420046):
script first (it only adds), then Vercel. Slice 4 is the exception: its script deploy comes after its PR, because the
sync calls an endpoint the PR adds (no secret set, no call).

After slice 5 the owner turns pending changes on, runs each slice's live check, then load-test task 10 with its
pending-changes block ([load-test.md](load-test.md#task-10--load-test-again-then-sign-off)).

Branches kept during the build, deleted 2026-10-18 once slice 5 was live: `prototype/pending-changes` (the prototype the
owner chose from, and the dropped-change email draft; tip `3eb7a95`), `pulad/spike-queues-accept-46bc93` (the accept timing
script; `fcd7f2a`), `research/pending-change-store` (`8a34e94`) and `research/google-apply-limits` (`bebff0d`). Restore one
with `git push origin <sha>:refs/heads/<name>` while GitHub still has the commit.

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

### Audit fixes (2026-10-19)

The 2026-10-19 audit of the pending-changes path (Vercel only, no script change): an `acc` flag sealed in the session
cookie when `webAccess` answers ok gates `accept` and `pendingMark`; the record is capped at 300 live cells; a typed-back
change keeps a put-back entry and `end()` re-bases a newer pending entry after a write (undo during `webApply`); a non-scope 403
is retried; a busy lock retries in 5 to 30 s and frees `pcl:`; backoff has jitter; `forSync` deletes expired cells;
`revoked` is logged from Google's answer. Detail: [vercel.md](vercel.md).

### After the season

Hand the store over as [Research: handing the Marketplace Redis store over to vic.rh](https://github.com/puIad/vic-recruitment-2026/issues/60)
says: switch pending changes off and let the queue drain, disconnect the store, transfer the project, and the new owner
installs their own free Upstash and redeploys. Redis data is lost by design, and a free store idle for 30 days is
archived, so each season recreates it.

## Settings cleanup: the build plan

Grilled with the owner on 2026-10-19. Goal: the Settings pages read in plain words, with dropdowns and pickers instead
of empty boxes to type in, and no code names on screen. UI only: the script, `SETTINGS_DEFAULTS` and the Settings tab
of the Master stay as they are, and the script keeps accepting any value typed in the sheet. A value the dashboard
has no choice for shows as "Custom" and is kept until someone picks another. Two PRs, no script deploy.

### Decisions (owner, 2026-10-19)

1. Scope: all eight Settings pages.
2. Help text lives in the dashboard (`frontend/src/lib/vic/settings-ui.ts`, a plain help line per setting). The
   sheet's help column keeps the script's technical notes.
3. Dropdown options show words; the stored value stays the code (`ACTIVE`, `HIGH`, `15`).
4. General is one page in titled sections: Admins and email, Assigning candidates, Schedule, and Advanced (folded shut).
5. Alert delays (`HOURS_NOT_CONTACTED`, `HOURS_NO_INTERVIEW_DATE`, `HOURS_AFTER_INTERVIEW_NO_FORM`): a dropdown of
   6 h, 12 h, 1 day, 36 h, 2 days, 3 days and Custom… (a number box). Today's test values 32 / 40 / 5 show as Custom.
6. Digest hour: a dropdown of 00:00 to 23:00.
7. Timezone: read-only text in Advanced ("Algeria (Africa/Algiers)"); changed in the sheet only.
8. Board (ALL) weight: shown only while a locked binome is tagged ALL, then as a dropdown (1×, 1.5×, 2×, 3×).
9. Admin emails and Trusted backups: chips with ×, and an Add box that suggests people from the Team tab
   (`teamList`) and still takes any email. A chip shows the person's name.
10. Registrant email domain: read-only text in Advanced ("@g.enp.edu.dz").
11. Screening threshold (`SCREEN_HOLD_AT`): a strictness dropdown, from the scores in `Rules.gs` `screenApplication`
    (empty 60, one word or non-answer 50, +10 under 10 words in all): **Standard (50, today)** any one weak answer
    holds it; **Lenient (60)** an empty answer, or one weak answer in a very short application; **Only clear junk
    (100)** both answers weak. Other values show as "Custom: N". The rules and the default stay the owner's
    ([launch-features.md](launch-features.md) Decisions 7–13).
12. VIC members sheet: one card. Once linked it shows the sheet with Open and Change link…, merged with the VIC members
    list card (emails read, last read, Refresh now). Before a link, a paste box.
13. Menu: recruitment settings (General, Alerts and timing, Sharing and email, Screening), then Connections and Change
    history, then Account and Appearance, with a divider between the three.
14. Connections: plain wording, "Not found" becomes "Not linked"; the Services card shows to the owner only, reworded.
15. Appearance: palette and sidebar choices inline on the page; the header's customizer drawer stays.
16. The sheet key on hover (`title={s.key}`) goes.
17. Account: the Editor badge reads Admin (Owner / Admin / Member / Cover).
18. Change history: a Binome dropdown next to the type buttons; the search box stays.
19. Pending changes switch: inside General's Advanced section, owner only as today.
20. Test mode: a status card at the top of Sharing and email ("Test mode is on: mail goes to admins only, nothing is
    shared") with Go live…, which keeps today's confirmation. The switch row goes.
21. Auto-sync and digest time: after a save the row says "Takes effect after Setup"; the owner gets Run Setup on the
    row (the Maintenance page's `setup` action), other admins "Ask the owner to run Setup". Replaces the toast.
22. Delivery: PR 1 the four settings-row pages (General, Alerts and timing, Sharing and email, Screening); PR 2 the
    menu, Connections, Account, Appearance and Change history.

### PR 1: the four settings pages

- `settings-ui.ts`: per key a label, a help line, an icon, and a control (switch, choices with labels, hour presets,
  time of day, email chips, read-only, strictness, members sheet). Falls back to the script's help and kind for a key
  it doesn't know, so a new setting is never hidden.
- `settings-form.tsx`: sections per group; Custom keeps an unknown value; the pending-changes path, the drop answers
  and `settingOk` stay as they are.
- Tests: the existing `npm test`, plus a check that every choice list holds the script's enum values
  (`SETTING_ENUMS` in WebApp.gs) so a dropdown never writes a value the script refuses.

Built 2026-10-19 on `claude/settings-cleanup`. Not available on the page: the members sheet's own name (the snapshot
has no title for it, so the card says "Linked" with Open); showing it needs a script change.

### PR 2: the other pages

Menu order and dividers (`config/nav.ts`), Connections, Account, Appearance inline (reusing the customizer's
`theme-tab` and `layout-tab`), the Change history Binome filter.

Built 2026-10-19 on `claude/settings-cleanup-2`. The palette and corner radius moved into the `useUi` store so the
page and the header drawer show the same choice. The sidebar's user card also said Editor; it now says Admin too. The
layout choices use plain names (Standard / Floating / Inset, Hide / Icons only / Always open). Merged as
[#92](https://github.com/puIad/vic-recruitment-2026/pull/92) (`73652b5`) and live on Vercel on 2026-10-19. Both PRs of
the settings cleanup are done; no script deploy was needed.

## Email texts: the build plan

Grilled with the owner on 2026-10-19, when they asked for a Settings section where admins edit the emails the script
sends to candidates and binome members, instead of hard-coding the registrant confirmation's wording. Only the
confirmation's new wording ships before launch, in the code; the editor ships after launch. Admins edit words only:
every mail still goes through `mailHtml_()` and `mail_()`, so the template, the TEST_MODE gate and who gets each mail
stay the script's.

### The mails today

Every `mail_()` call in the `.gs` files on 2026-10-19:

| # | Mail | Code | To | How often | Fills in | Editable |
|---|---|---|---|---|---|---|
| 1 | Registrant confirmation | `sendConfirmations_` (Registrations.gs), text `CONFIRM_MAIL` (Mail.gs) | the registrant | one per person, by the sync that reads the registration; `CONFIRM_REGISTRANTS` | first name, the code (in a box) | yes |
| 2 | Rejection | `rejectionsCore_` (Screening.gs), text `REJECT_SUBJECT` / `REJECT_BODY` | declined applicants, not VIC members | bulk: Maintenance › Send rejections…, whose dialog edits subject and text per send; TEST_MODE: one copy to the admin pressing it | first name | yes: the dialog's starting text |
| 3 | New interviewees | `sendNewIntervieweeMails_` (Sync.gs) | both members of the binome | one per binome per sync; `NOTIFY_BINOME_ON_NEW_INTERVIEWEE` | the members' first names, binome, count, a list (code, name, phone, availability), `HOURS_NOT_CONTACTED` | yes |
| 4 | Alert mail to a binome | the alerts' `flush` (Sheets.gs) | the binome's members and whoever covers the interviewee | one per recipient per flush; `NOTIFY_BINOME_ON_ALERT`, `INSTANT_EMAIL_MIN_SEVERITY` | count, the alert table, "(HIGH)" in the subject | yes |
| 5 | Joined a binome | Change members (`applyMemberPlans_`, Members.gs) | the newcomer | one per person | first name, binome, members, interviewees in progress | yes |
| 6 | Left a binome | Change members (`applyMemberPlans_`, Members.gs) | the leaver | one per person | first name, binome, the replacement | yes |
| 7 | New binome | Pair two… after Lock (`newBinomeCore_`, Members.gs) | both members | one per person | first name, binome, members | yes |
| 8 | You cover | Cover (`addCoverCore_`, Members.gs) | the cover | one per cover | first name, codes, binome, members, who they replace, a list (code, name, phone, availability, interview) | yes |
| 9 | Someone covers for you | Cover (`addCoverCore_`, Members.gs) | the binome's members | one per person | first name, the cover's name and email, codes, who they replace, the reason | yes |
| 10 | Quick action: check your registration | `mailText_` / `sendMails_` (QuickFix.gs) | candidates | per candidate, from Alerts; edited before each send | first name, the problems | no |
| 11 | Quick action: candidates need attention | same | binome members | per binome; edited before each send | names, the alert lines, sheet link | no |
| 12 | Quick action: send the interview form again | same | the interviewer who sent the form | per form; edited before each send | first name, date, typed name, form link | no |
| 13 | Dropped changes | `dropsSync_` / `dropsMail_` (Pending.gs) | the author (admin or member) | one per author per sync | count, each drop | no |
| 14 | Instant alerts to admins | the alerts' `flush` (Sheets.gs) | `ADMIN_EMAIL` | per flush | the alert table | no |
| 15 | Daily digest | `sendDailyDigest` (Actions.gs) | `ADMIN_EMAIL` | daily at `DIGEST_HOUR` | stats, open alerts | no |

### Decisions (owner, 2026-10-19)

1. Timing: only the confirmation's wording ships before launch, written into the code (`CONFIRM_MAIL`, which stays
   the fallback text). The editor ships after launch with no deadline, so no new code touches the registration path
   during launch week.
2. The confirmation's wording. It no longer says a binome will contact them: a held or declined applicant never gets
   one, and "binome" is the club's word, not theirs.
   ```
   Subject:   VIC Recruitment 2026: registration received
   Heading:   Thanks for registering, {first}!
   Above:     We received your registration for the Vision & Innovation Club's 2026 recruitment.
   Code box:  Your code
   Below:     Keep this code. It identifies your registration until the end of the recruitment, and we will ask
              for it when we contact you.

              We will get back to you by phone or email about the next steps.

              See you soon,
              The VIC team
   ```
3. Sender name: candidate mails (the confirmation, rejections, quick-action mails to candidates) come from "VIC
   Recruitment"; team mails keep "VIC Recruitment Bot".
4. Scope: the candidate mails (1, 2) and the binome member mails (3 to 9). The admin mails, the digest, the
   dropped-changes mail and the quick-action mails (already edited before each send) stay as code.
5. Storage: one row per field in the Settings tab, `MAIL_<ID>_<FIELD>`. A blank value = the code's text. Still
   editable in the Master.
6. Page: a new Settings page **Emails**, after Sharing and email. One card per mail in two sections, Candidates and
   Binome members. Each card carries its switch: `CONFIRM_REGISTRANTS`, `NOTIFY_BINOME_ON_NEW_INTERVIEWEE` and
   `NOTIFY_BINOME_ON_ALERT` move there from Sharing and email.
7. Fixed layout: subject, heading, text above, the generated part (code box, list or alert table: code, never edited),
   text below. The confirmation also has its code box's label. Button labels and footers stay code.
8. Format: plain text as in the rejection dialog: a blank line starts a paragraph, `**x**` is bold, everything is
   escaped and wrapped by `mailHtml_()`.
9. Save check: a placeholder the mail doesn't know (`{frist}`) refuses the save, on the page and in the script
   (`settingValue_`), so a pending change carrying one drops with the reason. "interview" or "entretien" in the
   confirmation only warns.
10. Preview and Send me a test: the script draws the mail with sample data through its own `mailHtml_()` (one
    renderer, no copy in the dashboard). The test goes to the admin pressing it, subject starting `[TEST]`, saved or
    not. It works with TEST_MODE on, since admins get mail then.
11. Editors: all admins, like every other setting.
12. History: Reset to default on each card (it blanks the card's fields); who changed what is in the Master's version
    history. No log tab.
13. Language: the defaults stay English (the 2025 registration form asked its questions in English). An admin can type
    any language; there is no per-person language.
14. Saves: like any setting, through Save settings: a direct write, or a pending change when the switch is on.

### Found while planning

- The pending path refuses a text over 2,100 characters (`scalar` in `web/lib/pending.js`), so each field is capped
  at 2,000 characters on the page and in `settingValue_`. Today's longest text (the rejection's) is about 330. A mail
  is 2 to 5 cells, far under the 300-cell cap per author.
- Config.gs loads first (`filePushOrder`; `test/gs.js` loads the same way), so `SETTINGS_DEFAULTS` can only be built
  from a table defined above it in Config.gs, not from texts in Mail.gs.
- In TEST_MODE `mail_()` lets only `ADMIN_EMAIL` through, so a Master editor missing from that list gets no test
  copy; the action says so. The rejection's test copy behaves the same today.
- A field saved with exactly the code's text is saved blank, so a later change to the default still reaches it.
- A dropped mail edit would put the whole text in the drop row and the drops email: both show the first 200
  characters instead.
- `mailText_` is taken (QuickFix.gs): the new helpers get other names.

### Fields and placeholders

| ID | Fields | Placeholders |
|---|---|---|
| `CONFIRM` | subject, heading, above, code label, below | `{first}` `{code}` |
| `REJECT` | subject, text (the heading is the subject, as today) | `{first}` |
| `NEW_IV` | subject, heading, above, below | `{names}` (both first names) `{binome}` `{n}` `{s}` (an s when n is not 1) `{hours}` |
| `ALERT` | subject, heading, above | `{n}` `{s}`; the code still adds " (HIGH)" to the subject |
| `JOINED` | subject, heading, above, below | `{first}` `{binome}` `{members}` |
| `LEFT` | subject, heading, text | `{first}` `{binome}` `{replaced}` |
| `PAIRED` | subject, heading, text | `{first}` `{binome}` `{members}` |
| `COVER` | subject, heading, above, below | `{first}` `{codes}` `{binome}` `{members}` `{instead}` |
| `COVERED` | subject, heading, text | `{first}` `{cover}` `{coverEmail}` `{codes}` `{binome}` `{instead}` `{reason}` |

31 rows. `{replaced}`, `{instead}` and `{reason}` fill a piece of sentence or nothing (" (replaced by Sara B.)",
" instead of Yanis K.", " (exam)"), as the code's text does today. The defaults are today's texts; where today's
text switches words on a count (was / were), the default is reworded so `{s}` is enough. A missing first name
fills "there", as the rejection does now.

### PR 1, before launch: the confirmation's wording (script)

- Mail.gs `CONFIRM_MAIL`: decision 2's text; the comment above it says the wording is settled (owner, 2026-10-19).
- Sheets.gs `mail_(to, subject, html, from)`: `from` defaults to "VIC Recruitment Bot". Registrations.gs (the
  confirmation), Screening.gs (rejections and their test copy) and QuickFix.gs `sendMails_` for `to === 'candidate'`
  pass "VIC Recruitment".
- Tests: the confirmation's new text, still without the word "interview"; the mock outbox's `name` on a
  confirmation, a rejection, a candidate quick-action mail and a binome mail.
- Ships: one PR, then `npm run deploy`. No UI, no `API_VERSION` change. Check: in TEST_MODE, a test registration's
  confirmation reaches an admin from "VIC Recruitment" with the new text.

### PR 2, after launch: the texts as settings (script)

| Where | What |
|---|---|
| Config.gs | `MAILS` above `SETTINGS_DEFAULTS`: per ID a name, `to` (candidate or binome), the placeholders and each field's default text. `CONFIRM_MAIL` (Mail.gs) and `REJECT_SUBJECT` / `REJECT_BODY` (Screening.gs) move in. `SETTINGS_DEFAULTS` spreads one row per field, for example `['MAIL_CONFIRM_ABOVE', '', 'Email text (Settings › Emails): Registrant confirmation, text above. Blank = the script's text. Placeholders: {first}, {code}']`. |
| Mail.gs | `mailField_(id, field)`: the saved text, else the default. `mailCheck_(key, text)`: throws on an unknown placeholder or over 2,000 characters. `mailFrom_(id, vars, {block, cta, footer, texts})` → `{subject, html, from}`, built by `mailHtml_()` in the fixed layout, `from` by `to`. `MAIL_SAMPLE`: per ID sample values and a sample block, for the preview. |
| Registrations.gs, Screening.gs, Sync.gs, Sheets.gs, Members.gs | The nine senders call `mailFrom_()`. Recipients, conditions, generated parts and the TEST_MODE gate are unchanged. In Sheets.gs only the binome and cover recipients' mail: the admins' alert mail stays as it is. `rejectionsCore_`'s preview returns the saved subject and text, so the dialog starts from them. |
| WebApp.gs | `settingValue_` runs `mailCheck_` on `MAIL_` keys, so `saveSettings_` and the pending entry (`applySetting_`) refuse the same values. `webState.mails`: `[{id, to, vars, fields: [{key, field, def}]}]` (the values stay in `settingsAll`). `webRun('mailPreview', {id, texts, send})`: checks the texts and returns `{subject, html}` with the sample data; with `send` it mails that to the caller as `[TEST] …` and answers sent, or why not. It joins `webRun`'s no-publish list. |
| Pending.gs | `dropsMail_` shows the first 200 characters of a long value. |
| Setup.gs | Nothing: Setup adds the blank rows and refreshes their help column the next time it runs. Until then a missing row is the default, and the first save appends it. |
| Tests | Every `MAILS` field has its row, keys unique and within the pending key pattern (41 characters). With blank rows each mail renders today's text. An edited field reaches the sent mail, escaped (`<b>` shows as text), `**bold**` works, placeholders filled. `{frist}` and 2,001 characters are refused by `saveSettings_` and dropped by the pending entry with the reason. `mailPreview` is built by `mailHtml_()` (the mock's check) and writes nothing; `send` reaches only the caller, and nobody in TEST_MODE when the caller isn't in `ADMIN_EMAIL`. The rejection dialog's preview carries the saved text. |

Ships: one PR, then `npm run deploy`. It only adds: `webState` gains a field and `webRun` an action, so no
`API_VERSION` bump.

### PR 3, after PR 2's deploy: the Emails page (Vercel)

| Where | What |
|---|---|
| `frontend/src/lib/vic/types.ts` | `mails?`, optional: on an older script the page says the script needs an update. |
| `frontend/src/lib/vic/settings-ui.ts` | `MAIL_UI`: per ID a label, a help line (who gets it, when) and an icon; the field labels (Subject, Heading, Text above the list, Text below…); a plain line per placeholder for its chip; `mailProblem(text, vars)`, the same check as `mailCheck_`. `SETTING_UI` keeps the three switches' entries; `CHOICES` unchanged. |
| `frontend/src/app/settings/components/settings-groups.ts` | `GROUPS.emails` (title, description, `own`: the three switches; the page draws its two sections itself). Sharing and email keeps `SHARE_FILES_WITH_BINOME`, the test mode card and the who-hears table, plus a link to Emails. |
| `frontend/src/app/settings/components/settings-form.tsx` | General › Advanced's rest skips `MAIL_` keys. `SettingDrop` clips a long value to 200 characters. Save, the pending path, the drop answers and `settingOk` are unchanged. |
| `frontend/src/app/settings/emails/page.tsx` (new) | One card per mail from `st.mails`: its switch, the fields (starting from the saved text or the default), placeholder chips that insert at the cursor, the inline error (`mailProblem`) and on the confirmation the interview warning, a "Changed" mark, Reset to default. Preview opens a dialog with the mail in a sandboxed `iframe` (`srcDoc`) and Send me a test inside it, so the test send is previewed first. A text equal to the default is saved blank. |
| `frontend/src/lib/vic/actions.tsx` | The preview and the test send through `webRun('mailPreview')`. |
| `config/routes.tsx`, `config/nav.ts` | `/settings/emails`, "Emails" after Sharing and email, its icon in the command palette. |
| Tests | The page's placeholder lists equal `MAILS` (like the `SETTING_ENUMS` check). e2e on the mock: nine cards, an edit saved into its Settings row, Reset blanks it, `{frist}` blocks Save, Advanced lists no `MAIL_` key. |

Ships: one PR, Vercel only.

### Ship order

PR 1 before launch. After launch: PR 2, merge, `npm run deploy`, then PR 3. Live check after PR 3, TEST_MODE on:
edit the confirmation's text above with `**bold**` and `{first}`, Preview, Send me a test, Save, register a test
candidate and read the confirmation in an admin inbox; Reset to default; `{frist}` refused; with the pending switch
on, one mail edit saved as pending and applied.

### The registration app

The registration form ([registration-form.md](registration-form.md), specified on 2026-10-22) writes rows into
Registration Responses, so the sync sends the confirmation exactly as for a form row, with the saved text after PR 2.
Two rules keep it that way: the confirmation stays the script's only copy of its wording (the app never keeps its
own), and it stays the only mail carrying the code, which the sync gives out. The form's ticket mail (the email check
before the form) is sent by a separate mailer script owned by `vic.rh` (`mailer/Code.gs`), not Mail.gs, but its wording
is editable: it is the **Registration ticket** card on the Emails page (`CODE` in `MAILS`, no On/Off switch), and the
mailer reads those rows from the Master's Settings tab ([#123](https://github.com/puIad/vic-recruitment-2026/issues/123),
built in [#128](https://github.com/puIad/vic-recruitment-2026/issues/128)). The ticket and the confirmation wear the
form's themed look, the confirmation's stripe in its 1st choice's house; the other mails keep the charter layout.
