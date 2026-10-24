# Members on the dashboard: implementation plan (from the load test of 2026-10-05)

Goal: before the binomes get access, the dashboard takes ~100 people at once with every request going through, no
change ever lost or overwritten without the person knowing, and screens that answer in about a second. The load test
that led here, its numbers and the live run are in the [appendix](#appendix-the-evidence); tasks quote what they need.

**One task per session.** Take the first task below that is not ticked and whose "Depends on" are all ticked. Each
task is written to be done alone, by someone who has read only this file's [working rules](#working-rules-every-task),
the task itself and the files it lists.

| # | Task | Size | Depends on | Done |
|---|---|---|---|---|
| 1 | [Time each step of the sync](#task-1--time-each-step-of-the-sync) | S | — | ☑ [#18](https://github.com/puIad/vic-recruitment-2026/pull/18), code and deploy; the reading in Notes is still open |
| 2 | [A refused action is an error, not a green toast](#task-2--a-refused-action-is-an-error-not-a-green-toast) | S | — | ☑ [#19](https://github.com/puIad/vic-recruitment-2026/pull/19), code and deploy; the live check in Notes is still open |
| 3 | [Polling: one call per tick, a timeout, rate-limit backoff](#task-3--polling-one-call-per-tick-a-timeout-rate-limit-backoff) | S–M | 2 | ☑ [#23](https://github.com/puIad/vic-recruitment-2026/pull/23), UI only, live on Vercel from `963144d` |
| 4 | [Write only what changed](#task-4--write-only-what-changed) | M | 1 | ☑ [#24](https://github.com/puIad/vic-recruitment-2026/pull/24), code and deploy (@61/@62); the `cycle` reading in Notes is still open |
| 5 | [Admin dashboard served from a cached snapshot](#task-5--admin-dashboard-served-from-a-cached-snapshot) | M–L | 4 | ☑ [#26](https://github.com/puIad/vic-recruitment-2026/pull/26), code and deploy; the live `webState` times in Notes are still open |
| 6 | [Member role in the script (read side, security)](#task-6--member-role-in-the-script-read-side-security) | L | 5 | ☑ [#27](https://github.com/puIad/vic-recruitment-2026/pull/27), code and deploy (@65/@66); a real member sign-in is checked with task 7 |
| 7 | [My binome page (read-only) and member polling](#task-7--my-binome-page-read-only-and-member-polling) | M | 3, 6 | ☑ [#28](https://github.com/puIad/vic-recruitment-2026/pull/28), UI only, live on Vercel from `b9f84c0`; a real member sign-in is still open |
| 8 | [Members edit their binome from the dashboard](#task-8--members-edit-their-binome-from-the-dashboard) | L | 7 | ☑ [#29](https://github.com/puIad/vic-recruitment-2026/pull/29) (@67/@68) and the access follow-up [#30](https://github.com/puIad/vic-recruitment-2026/pull/30) (@69/@70); the live check of #30 in Notes is still open |
| 9 | [Triggers on the club account](#task-9--triggers-on-the-club-account) | S | 1 | ◐ code check merged and deployed ([#20](https://github.com/puIad/vic-recruitment-2026/pull/20)); the owner's steps are still to do |
| 10 | [Load test again, then sign off](#task-10--load-test-again-then-sign-off) | M | 3, 5, 8, 9, pending-changes slices 2–5 | ✓ signed off by the owner on 2026-10-24 without a fourth run (run 3 did not sign off; Notes) |

Tasks 1, 2 and 9 can go in any order; 9 is mostly steps for the owner.

## Decisions (owner, 2026-10-05)

- Members read **and edit** their own binome from the dashboard, nothing else. Edits are written into **their binome
  sheet** (the same gold columns they can type in today), never into the Master; the sync carries them over as now.
- Only what was edited is redone: the script keeps its own log of edits (Google has no API for a cell's edit
  history), and every unedited part stays cached.
- The sync writes only what changed, and must never take a changed value for an unchanged one.
- A revoked person loses the dashboard at the next poll, as with the fix of `69024a1`, but with one call per tick.
- A refused action shows as an error.
- Vercel stays on Hobby (a 300-person event with registrations and payments fit it). Members poll every 15 s, admins
  every 2 s. (Since [#102](https://github.com/puIad/vic-recruitment-2026/pull/102), 2026-10-19: 30 s and 5 s, to fit a
  recruitment day in the free tiers; [vercel.md](vercel.md#free-limits-and-what-spends-them).)
- The triggers move off the owner's personal account to `vic.rh@g.enp.edu.dz`.

**Defaults the tasks assume** (the owner may still change them before task 6):
- **Sign-in permissions.** Members sign in through the same app, so Google shows them the same consent screen as
  admins (Sheets, Drive, Forms, send mail, triggers): `scripts.run` needs a token with every scope the script uses.
  The alternative, a second small Apps Script project for members with only Sheets + Drive, means a second
  deployment and a second Vercel route; not planned.
- **Covers** (temporary stand-ins) see only the candidates they cover, **read-only**, as their view-only sheet access.

## Working rules (every task)

1. Read [HANDOFF.md](../HANDOFF.md) first: how changes ship, the rules of the code, the gotchas. Then the task and the
   files under "Read first". Don't read the whole vault or the appendix unless the task sends you there.
2. One branch per task off `main` (`p1-<n>-<short-name>`), `npm test` green, one PR, CodeRabbit's findings fixed on
   the branch, merge. Script changes: `npm run deploy` from `main` after merge (check the "Pushed N files" list). UI
   changes: Vercel builds `main`; build from a clean clone first (HANDOFF › How changes ship, step 3).
3. The code's rules still hold: every Master write inside `withLock_`; a run that writes Binomes or Interviewees calls
   `detectEdits_(ctx)` after `loadCtx_()` and `commitBase_(ctx)` after writing; mail only through `mail_()`; sharing
   only through the TEST_MODE gate. A new Apps Script API (CacheService, a new Lock) → extend `test/mockgas.js` first.
4. `API_VERSION` goes up in `WebApp.gs` **and** `frontend/src/lib/vic/types.ts` together when `webAccess`,
   `webState` or `webRun` change shape (task 6 does); `test/vercel.test.js` fails if they differ.
5. Never weaken an access check, the TEST_MODE gate, or the loss-safety of `saveTable_` (cells typed meanwhile kept,
   rows deleted meanwhile stay deleted). When in doubt, write.
6. Verify on the live Master in TEST_MODE what the mock can't show (protections, validations, locale, locks under
   `scripts.run`); each task says what.
7. At the end: tick the task in the table above with the PR link, write anything the next task needs under the
   task's **Notes**, and update STATUS.md (live versions). If the task turns out wrong or much bigger than written,
   stop, write what you found under Notes, and ask the owner before going on.

---

## Task 1 — Time each step of the sync

**Why.** `syncAll` measured 21, 9, 17, 12, 9, 13, 26, 9, 9, 9 s (average 13.4 s = 5.4 of the 6 h of daily trigger
time). The owner's theory: a clean run takes 9 s and something holds the others back. We need to see which step, not
guess. ([Appendix › The real sync](#the-real-sync))

**Read first.** `Sync.gs` (`runCycle_`, `pullBinomeFiles_`, `buildTracker_`, `sendNewIntervieweeMails_`),
`Sheets.gs` (`withLock_`, `loadCtx_`, `alertBuffer_`, `mail_`).

**Do.**
- In `runCycle_`, time each phase and log **one line per run** at the end: `console.log(JSON.stringify({at: 'cycle',
  kind, total, lockWait, load, edits, regs, forms, pull, statuses, timing, integrity, save, base, alerts, mails,
  tracker, opened, mailsSent}))`. `kind` = which entry point (trigger sync, form trigger, Sync now, integrity,
  dashboard). `lockWait` = from the call to the lock being held (the time `withLock_` waited).
- `opened`: the binome codes whose sheet `pullBinomeFiles_` opened, each with why: `changed` (Drive's "last
  updated" moved), `reread` (the 15-min safety re-read), `upgrade` (layout rebuild), `forced` (Sync now).
- `mailsSent`: count calls of `mail_()` during the run (a counter reset at the start of the run).
- When `withLock_` gives up, keep the existing warning and add the wait time to it.

**Tests.** A test (in `test/e2e.test.js` or `test/web.test.js`) captures `console.log` during one sync and checks one
`cycle` line with these keys and numbers ≥ 0, and that `opened` lists the sheet a test edited.

**Ship.** `npm run deploy`. Then the owner opens Apps Script › Executions, clicks ~20 `syncAll` runs and copies their
`cycle` lines into the Notes below. Read them: which phase grows on the slow runs?

**Done when.** The slow runs are explained by named phases, written in Notes, and tasks 4–5 know which steps to cut.

**Notes.**

- **Shipped 2026-10-05:** [#18](https://github.com/puIad/vic-recruitment-2026/pull/18), deployed from `7fd7ca5` (web app @49, API @50).
  The lines appear in Apps Script › Executions › a run › Cloud logs, from the first `syncAll` after the deploy.
- **What a line holds.** One per attempted run, all times in ms: `kind` (`trigger`, `form`, `sync-now`, `integrity`,
  `dashboard`, `digest`, `setup`, `post-lock`), `outcome` (`ok`, `busy` when the lock was refused, `error` when a phase
  threw: then the phases after it stay 0), `total` (includes `lockWait`), the phases, `opened` (binome code → `changed` /
  `reread` / `upgrade` / `forced`) and `mailsSent` (calls of `mail_()`, TEST_MODE skips included). `total` is `lockWait` plus
  the phases (give or take a few ms); the Drive folder listing is inside `pull`.
  The daily digest logs a second line, `{"at":"digest","mailsSent":n}`, for its own mails.
- **Phases:** `load` = the four tabs, alerts, covers; `regs` = registrations + assigning; `pull` = Drive listing + opening
  the sheets; `statuses` = status loop + ending covers; `timing` = timing alerts + odd values; `integrity` = only when asked;
  `save` = Interviewees write; `base` = baseline; `alerts` = Alerts write + their mails; `mails` = new-interviewee mails;
  `tracker` = the full Tracker rebuild.
- **To read (owner, ~20 `syncAll` runs):** copy the `cycle` lines here. Questions for tasks 4–5: do the 21–26 s runs have a
  big `lockWait` (something held the lock), a long `pull` with several `opened` entries (sheets edited or `upgrade`),
  many `mailsSent`, or a long `tracker` / `save`? And what is the floor of a clean run, phase by phase? If `save` +
  `tracker` + `load` are most of the 9 s, task 4 is the fix; if `pull` dominates, the 15-min re-read and the folder listing
  are what to look at.
- **Local runs** (the mock, so not representative of Google's speed) log `kind`, `outcome` and `opened` correctly; the
  numbers there are only a format check.

---

## Task 2 — A refused action is an error, not a green toast

**Why.** When the script lock is busy, actions return the message "Another update is already running…" with no
result, and the page shows every message as `toast.success`. Under load people would believe a change was saved
when nothing was. ([Appendix › Findings](#findings), 4)

**Read first.** `Sheets.gs` (`withLock_`, `say_`, `_webOut`), `WebApp.gs` (`webRun`), every place that says "Another
update is already running" or "Busy" (`grep -n "Another update\|Busy, try" *.gs`: Members.gs, QuickFix.gs,
Team.gs, Integrity.gs, Sync.gs, WebApp.gs), `web/api/run.js`, `frontend/src/lib/vic/api.ts`, `store.ts` (`run`),
`quick.tsx` (`q`), `actions.tsx`.

**Do.**
- One helper in `Sheets.gs`, e.g. `busy_()`: in a dashboard call (`_webOut` set) it throws
  `new Error('BUSY: Another update is running. Nothing was changed: try again in a minute.')`; from the menu it keeps
  today's `say_`. Use it at every one of those places, and in `webRun`'s `sync` / `integrity` / `resetBinomes`
  branches when the cycle returns null.
- `web/api/run.js`: a script error whose message starts with `BUSY:` → `{error: <message without the prefix>, code:
  'BUSY'}` (keep status 200 like other script errors).
- Page: `store.run` shows `code === 'BUSY'` as `toast.error` with a "Try again" action that repeats the same call.
  Quick actions (`quick.tsx`) retry once on their own after ~3 s before showing the error: safe, because a refused
  action changed nothing (the lock is taken before any change).

**Tests.** Make `LockService` in `test/mockgas.js` able to refuse (`__lockBusy = true` → `tryLock` returns false).
`test/web.test.js`: with the lock busy, each `webRun` write action throws `BUSY:` and the Master is unchanged (compare
the tabs before/after). `test/vercel.test.js`: the proxy maps it to `code: 'BUSY'`. `npm run typecheck` in `frontend/`.

**Ship.** `npm run deploy` first (script), then push the UI (it only reads a new code).

**Done when.** No path can show a refused action as a success.

**Notes.**

- **Shipped 2026-10-05:** [#19](https://github.com/puIad/vic-recruitment-2026/pull/19), deployed from `07e8b35` (web app @51, API @52; 18 files pushed); Vercel built the page from the same merge. `busy_()` is in Sheets.gs; the menu's `syncAllForce` and
  `integrityCheck` (Sync.gs) keep their own "Busy" text since they never run from the dashboard.
- **Also fixed:** `lockBinomesCore_` ignored a refused lock and answered "Locked 0 binomes"; it now stops with `busy_()`.
- **Not covered, by design:** actions that never take the script lock (`resolve`, `saveSettings`, `digest`, `reshare`,
  `setup`, `importTeam`) cannot be refused. Task 8's `memberSet` has to use `BUSY` the same way if it falls back to the script lock.
- **Quick retry** lives in `store.run` (action `quick`), not in `quick.tsx`: one place, same effect.
- **Live check after deploy (TEST_MODE):** hold the lock (run Sync now from the menu in the sheet) and press a quick action
  in the dashboard: after ~3 s it shows "not done" with Try again, never a green toast.

---

## Task 3 — Polling: one call per tick, a timeout, rate-limit backoff

**Why.** Each tick calls `webAccess` then `webPulse`, but `webPulse` already re-checks access (`access_()`) and throws
"Not allowed": half the calls are duplicates. The live run also showed poll calls that took 44–50 s (p99 3–4 s), and
Google answering `RESOURCE_EXHAUSTED` ("Execution requests per minute per user") when one account polled too much.
([Appendix › Live run](#live-run-on-production))

**Read first.** `frontend/src/lib/vic/store.ts` (`boot`, `refresh`, `checkPulse`), `api.ts`,
`frontend/src/components/layouts/app-shell.tsx` (`PULSE_MS`), `web/api/run.js`, `WebApp.gs` (`webPulse`,
`webAccess`), `test/googlemock.js`, the commit `69024a1` (why access is checked every tick).

**Do.**
- `checkPulse`: call only `webPulse`. If it fails with "Not allowed", call `webAccess` once (it never throws) to get
  the email and reason, then go to the no-access gate and wipe the state exactly as today. Same guarantee as
  `69024a1`, half the calls.
- Timeout: `call()` takes an optional timeout; `webPulse` and `webAccess` use ~20 s (`AbortSignal.timeout`), so a
  stuck call ends, the `polling` guard is released and the next tick runs. `webState` and `webRun` keep no timeout
  (they can be long; the proxy has its own).
- Rate limit: in `web/api/run.js`, Google's 429 / `RESOURCE_EXHAUSTED` → status 429 with
  `{error: 'Google is limiting requests from this account for a minute. Nothing was changed.', code: 'RATE_LIMIT'}`.
  The page skips polling for 30 s on `RATE_LIMIT` (quietly), and an action shows it as an error.
- Keep `PULSE_MS` at 2000 for admins (task 7 sets 15 s for members).

**Tests.** `test/googlemock.js` able to answer 429 `RESOURCE_EXHAUSTED`; `test/vercel.test.js` checks the mapping.
`npm run typecheck`. On the local mock (`npm run mock` + `npm run dev`): the dashboard still goes live on changes,
and an account that loses access lands on the no-access screen within a tick (sign in as admin, then make that
account lose access in the mock).

**Ship.** UI only (and `web/`): push after review; check the Vercel build log.

**Done when.** One Apps Script call per idle tick; a hung call never freezes the live refresh; a rate limit is a
quiet pause, not an error storm.

**Notes.**

- **Shipped 2026-10-06:** [#23](https://github.com/puIad/vic-recruitment-2026/pull/23), UI and `web/` only (no script deploy, no `API_VERSION` bump).
  Vercel production built from the merge `963144d` (real `npm ci` + `tsc -b && vite build` in the log).
- **How it works:** `call(fn, args = [], timeoutMs?)`. The array signature replaces the old rest args; only `store.ts` calls it.
  `POLL_TIMEOUT_MS = 20000` (store.ts) is used for `webPulse` and `webAccess`, `boot` included. A timeout is
  `ApiError` code `TIMEOUT`. `api.ts` sets the 30 s pause whenever any reply has `RATE_LIMIT`, and `rateLimited()`
  reads it. So an action that hits the limit also pauses polling.
- **On "Not allowed"** the page wipes the state even if `webAccess` then fails. The gate shows without the email in that
  case: the script's refusal decides, not the follow-up call. If `webAccess` says ok again, nothing changes.
- **Task 7:** member polling at 15 s goes through the same `checkPulse`, so it gets the timeout and the pause for free.
  The only change it needs is `PULSE_MS` (app-shell.tsx).
- **Checked on the local mock** (switches for grant/revoke, touch, 429, hang): 1 `webPulse` per idle tick and 0 `webAccess`.
  An edit triggers 1 `webState`. On 429: 1 refused call, nothing for 30 s, no toast. A hung poll is dropped at 20 s.
  On revoke: 1 `webPulse` + 1 `webAccess`, then the no-access screen.
- **Live check (owner's tab, 2026-10-06 14:19–14:25 UTC, production `a6e11b8`):** ~75 calls, all ok. Idle ticks are
  `webPulse` only, about 2 s apart. `webAccess` appears only at load (2 page loads), each followed by `webPulse` + `webState`.
  One `webPulse` hung 100 s at Google (14:21:12). The old page called `webPulse` again at 14:21:38, before reloading, so
  the 20 s timeout had released the guard. Without the timeout the tab would have waited until 14:22:53.

---

## Task 4 — Write only what changed

**Why.** Every sync rewrites Interviewees and the Tracker in full, even when nothing changed. That costs time on every
run (trigger quota), and it moves the Master's "last edited" every minute, so every open dashboard reloads
everything every minute. ([Appendix › Findings](#findings), 1)

**Read first.** `Sheets.gs` (`saveTable_`, `sameVal_`, `txt_`, `alertBuffer_` and its `flush`), `Sync.gs`
(`buildTracker_`), `Integrity.gs` (`detectEdits_`, `commitBase_`: the baseline must keep comparing against the
sheet), task 1's Notes (which steps cost most).

**Do.**
- `saveTable_`: it already reads the tab as it is *now*, inside the lock, right before writing (`now`). Compare each
  row it is about to write with that row of `now`; write only the rows that differ, in contiguous blocks; new rows at
  the end always. Nothing differs → no write at all.
- The comparison decides "equal" only when it is sure: same value; both dates with the same time; a value written as
  forced text (`txt_` adds a leading `'`) against the same text read back without it. Anything else, including a
  number against the same number as text, counts as **different and is written**. A mistake may cost a useless
  write; it can never leave a changed value unwritten.
- `buildTracker_`: build the values as today, read the current range, and skip the write (and the formatting calls)
  when everything is equal; when the size changed, rewrite as today.
- Alerts: check that `flush` only appends new rows and updates changed ones; apply the same rule if not.

**Tests.** Count `setValues` / `setValue` per sheet in `test/mockgas.js`, and make every write bump the file's
`lastUpdated` (`__touch`) if it doesn't already.
- A second sync with nothing new writes nothing to Interviewees, Tracker or Alerts, and the Master's
  `lastUpdated` doesn't move.
- Each kind of change is written and visible after the sync: new registration, binome-sheet edit (Contacted, date,
  time, Interview Done, Rating, Final Affectation, Notes), status change, alert raised and resolved, interview form.
- A cell typed by hand during the run is kept (the existing test stays green); phones stored with `txt_` don't
  cause a write every run.

**Ship.** `npm run deploy`. Then read ~20 `cycle` lines (task 1) and write the new average under Notes. The current
pulse (the Master's "last edited") should now move only when something really changed: the every-minute reload of
every screen stops even before task 5.

**Done when.** A sync with nothing new writes nothing, every change is written, and the average sync is below ~10 s.

**Notes.**

- **Code (2026-10-06, branch `p1-4-write-only-changed`):** `sameCell_` (Sheets.gs) is the one comparison: `sameVal_`, or
  `"'x"` against `"x"`; nothing else is equal. `saveTable_` writes only the rows that differ from the tab read inside the
  lock, in contiguous blocks; added rows always. `buildTracker_` compares the whole grid it would write (summary, blank
  row, head, rows) with the tab and returns before `clear()` when it matches and the size is the same; the clock cell C1 is
  left out of the comparison and now reads **"Last change: …"** (it moves only when something else does). Alerts: `flush`
  already appended only new rows and saved the rest through `saveTable_`, so it follows the same rule with no change.
- **`txt_` has no caller** (phones are kept as text by the Phone column's `@` format, Setup.gs); the forced-text rule
  is there for whoever uses it again.
- **Mock:** `__writes[tab]` counts `setValues`/`setValue`/`clear`/`clearContent`; all of them bump the file's
  `lastUpdated`. The e2e test checks: a quiet `syncAll` writes nothing to the Master and doesn't move its `lastUpdated`
  (fails on the old code: Interviewees 1 write, Tracker 4); a binome-sheet edit (all 7 fields), a status change, an
  alert raised (registration) and one resolved (NOT_CONTACTED), an interview form and a new registration are each
  written; one edited row = one row written.
- **What the mock can't show (check live):** Sheets turns some written strings into numbers or dates (a free-text
  Notes "12", a Tag "1"). Those cells then compare different every run and their row is written each time: safe, but it
  would keep the pulse moving. If the Master's "last edited" still moves every minute after the deploy, find the column
  by comparing `saveTable_`'s rows with `now` on that run (or set that column to `@` like Interview Date / Time).
- **Shipped 2026-10-07:** [#24](https://github.com/puIad/vic-recruitment-2026/pull/24), deployed from `a2e09db` (web app
  @61, API @62; 18 files pushed, the live files checked equal to `main` after). Only Setup.gs, Sheets.gs and Sync.gs
  differed from what was live: #21 and #22 were already on Apps Script. @59/@60 are the same old code re-cut by a
  `npm run deploy` whose push was skipped (HANDOFF › How changes ship, 2).
- **Still to do (live):** ~20 `cycle` lines and the new average here; check the Master's "last edited" stops moving
  every minute when nothing happens (if it doesn't, see "What the mock can't show" above).

---

## Task 5 — Admin dashboard served from a cached snapshot

**Why.** `webState` rebuilds the whole dashboard from the Master for each person, each time: 6.4–10 s in production,
and 8.3 s p50 / 10.8 s p95 with 25 people at once in the live run. The sync already has everything loaded once a
minute. ([Appendix › Results](#results-model))

**Read first.** `WebApp.gs` (`webState`, `webPulse`, `webRun`), `Sync.gs` (`runCycle_`), `Sheets.gs` (`loadCtx_`),
`QuickFix.gs` (`quickInfo_`, `heldAlerts_`), `frontend/src/lib/vic/store.ts` (how the pulse is compared).

**Do.**
- Split `webState` into `buildState_(ctx)` (everything that is the same for every admin) and the per-request fields
  (`user`, `owner`, `switchUrl`).
- Form URLs never change: keep them in a script property after the first lookup instead of two `FormApp.openById`
  per call.
- `publishState_(ctx)`: build the state, hash its JSON (a small string hash in `Sheets.gs` is enough, e.g. FNV-1a;
  no `Utilities.computeDigest` needed), and if the hash differs from script property `SNAP_HASH`: write it to
  `CacheService.getScriptCache()` in chunks under ~90 KB (`snap:admin:0..n`, plus a count key, 6 h expiry), then set
  `SNAP_HASH` and add 1 to `SNAP_VER` (script properties, which persist). Call it at the end of `runCycle_` and at
  the end of every `webRun` action that wrote the Master, inside its lock, with the context it already has.
- `webState` (admins): read the chunks; if all are there and their hash matches `SNAP_HASH`, return them plus the
  per-request fields. Otherwise build live as today and publish. The cache may lose entries at any time (Google
  says so): the live build is the normal fallback, not an error.
- `webPulse`: `access_()` as today, then return `Number(SNAP_VER)`. Still a number, so the page needs no change.
- A hand edit in the Master shows after the next sync (≤ 1 min), which is when the sync sees it today anyway.

**Tests.** Add `CacheService` to `test/mockgas.js` (script cache: `get`, `put`, `getAll`, `putAll`, `remove`, and a
test helper that empties it).
- `webState` from the cache deep-equals a live build (minus per-request fields).
- Cache emptied → still correct, rebuilt.
- `SNAP_VER` unchanged after a sync with nothing new, +1 after a change and after an action.
- A state over 100 KB (seed a few hundred interviewees) round-trips through the chunks.
- `webState` still refuses a non-admin.

**Ship.** `npm run deploy`. Then read `webState` times in the Vercel runtime logs (`"action":"webState","ms":…`)
and write them under Notes. Target: p50 under 1.5 s, including the ~1 s that `scripts.run` itself costs.

**Done when.** Refreshes take about a second, and a screen reloads only when the data really changed.

**Notes.**

- **Code (2026-10-07, branch `p1-5-cached-snapshot`):** `buildState_(ctx)` is the shared part (no `user` / `owner` /
  `switchUrl`, and no clock, so its hash moves only with the data). `publishState_(ctx)` caches it in 25,000-char values
  `snap:admin:<i>` (6 h) and keeps `SNAP_HASH` = `{h, n, at}` in script properties, `at` being when it last changed (the
  page's "Master read"); `SNAP_VER` +1 only when `h` changed. A cache that lost values is refilled without a new
  version. `readSnap_()` trusts the cache only if every value is there, the joined JSON hashes to `h`, and `v` is this
  `API_VERSION` (a deploy that bumps it never serves an old shape). `hash_` (Sheets.gs) is FNV-1a + the length.
- **Where it is published (one deviation from the plan).** `runCycle_` publishes its own context at the end, inside its
  lock (new `snap` phase in the `cycle` line). Dashboard actions do **not** reuse their context: after their writes it
  is not re-indexed (`ctx.binomes`, covers, history), so a snapshot built from it could show the action as not done.
  Instead `webRun` calls `publishFresh_()` once, after any action that may have written (everything except `sync`,
  `integrity`, `digest` (they publish in their cycle), `lockCheck`, quick `locate` / `draft`, dry runs, and a `BUSY`
  refusal): a fresh `loadCtx_()` + build under the lock. It **waits** for the lock (30 s), because `resolve`,
  `saveSettings`, `importTeam`, `reshare` and `setup` write without it: a sync that loaded before such a write publishes
  its older view, and only a publish after that sync can replace it (CodeRabbit on #26). Still taken after 30 s → it
  drops the snapshot (`SNAP_HASH` deleted, `SNAP_VER` +1): the next `webState` builds live and republishes. A drop is
  final for runs already in flight: `loadCtx_` notes `SNAP_VER` (`ctx.snapVer`) and `publishState_` refuses to publish when
  it moved since (only a drop moves it outside the lock), so a long sync that loaded before the write can't bring back
  its older view. Not atomic (check, then set): a drop in the few ms between them waits for the next published change. So an action
  costs one extra load + build in its own call (plus the rest of a running sync), and every screen then refreshes from
  the cache.
- **`webState` on a miss** builds live, and publishes only if it gets the lock at once (`tryLock(1)`); otherwise it
  returns the live build without publishing (whoever holds the lock publishes). Every publisher holds the lock, so an
  older build can never overwrite a newer one.
- **`webPulse`** returns `SNAP_VER`, still a number, so the page is unchanged (only a comment in `store.ts`). Not moved:
  a hand edit in the Master, and menu actions (Change members etc. from the sheet's menu): both show after the next sync.
- **Form URLs** are kept in script property `FORM_URLS` by form ID after the first lookup.
- **Mock:** `CacheService.getScriptCache()` (`get`, `getAll`, `put`, `putAll`, `remove`, `removeAll`, 100 KB per value
  enforced), `__cacheClear()` empties it. `web.test.js` › "cached snapshot": cache = live build; a quiet sync keeps the
  version; a new registration shows only after the sync, +1; a dry run publishes nothing; `saveSettings` publishes in its
  call; cache emptied → live and republished with no new version; cache emptied + lock taken → live, not published;
  `publishFresh_` with the lock taken drops it; 900 registrations (> 100 KB, several values) round-trip. The refusal of a
  non-admin is the existing access test.
- **To watch live:** the sync now builds the snapshot every run; its cost is the `snap` phase of the `cycle` lines.
  `buildState_` re-reads Member Changes and looks for the team source tab (`findTeamSource_` reads row 1 of every extra
  tab): if `snap` is more than ~1 s, those two are the first to cache.
- **Shipped 2026-10-07:** [#26](https://github.com/puIad/vic-recruitment-2026/pull/26) (with two CodeRabbit fixes: an
  action's publish waits for the lock; a run that loaded before a drop never publishes), deployed from `47aee3f` (web app
  @63, API @64; 18 files pushed, and the live project pulled back afterwards: all 18 equal to `main`). No UI change, so
  nothing new for Vercel to serve.
- **Checked after the deploy (local mock, real `web/api` proxy, merged code):** `webAccess` → `webPulse` (a version
  number) → `webState` (complete, the same twice in a row); `resolve` bumps the version by 1 and the alert is gone from the
  cached state at once; three Sync nows in a row after that keep the version (the first one after a resolve may move it:
  the sync raises the alert again when its problem is still there, a real change).
- **Still to do (live):** no dashboard traffic since the deploy, and Vercel Hobby keeps runtime logs for 1 h only, so no
  production numbers yet. The owner's `cookies.txt` session has expired (`--check`); with a fresh one:
  `node test/load.js --live https://vic-recruitment.vercel.app --cookies cookies.txt --users 5 --minutes 3` gives
  `webState` p50 / p95 (target p50 < 1.5 s). Or open the dashboard, click around for a few minutes, and read
  `"action":"webState","ms":…` in Vercel › Logs within the hour. Also read the `snap` phase in a few `cycle` lines
  (Apps Script › Executions), and check that a screen no longer reloads every minute while nothing changes.

---

## Task 6 — Member role in the script (read side, security)

**Why.** Members get the dashboard for their own binome without being editors of the Master (100 people must not be
able to edit the Master by hand). Access is today "can edit the Master" everywhere: `access_().ok` means admin.

**Read first.** `WebApp.gs` (all of it), `Sheets.gs` (`indexCtx_`: `ctx.binomes`), `Members.gs` (covers:
`loadCovers_`, `coverLive_`, and every run that changes membership), `Team.gs` (`lockBinomesCore_`,
`resetBinomesCore_`), `BinomeFiles.gs` (`bfLastRow_`, `findFileRow_`, `BF_H`), the access-control tests in
`test/web.test.js`.

**Do.**
- `MEMBER_MAP` (script property, JSON): email → `{b: binome code, f: sheet id}` for every member of a locked binome
  (ACTIVE or PAUSED), plus live covers as `{b, f, cover: true, codes: [...]}`. `memberMap_(ctx)` builds it; write
  it only when it differs. Properties allow 9 KB per value: split into `MEMBER_MAP_0..n` if needed. Rewrite it at
  the end of `runCycle_` and in every run that changes membership, in the same run: Lock, change / swap members,
  pair two (new binome), add / end cover, Reset all binomes (clears it).
- `access_()`: admins exactly as today, now with `role: 'admin'`; otherwise an email in `MEMBER_MAP` →
  `{ok: true, role: 'member', binome, cover}`; else as today. Someone who is both is an admin.
- **Every admin entry point checks the role explicitly**, not `ok`: `webState` (admin part), every `webRun` action,
  `doGet` (old dashboard: admins only), `isAdmin_`. `grep -n "access_()\|isAdmin_()" *.gs` and go through each one.
- Per-binome snapshot: `publishState_` (task 5) also writes one slice per binome, `snap:bin:<code>` (its candidates
  with the binome-sheet fields of `BF_H` and their status, its open alerts, its members' names), each with its own
  hash and version in a script property (`SNAP_BIN`: code → `{hash, ver}`). Only binomes whose slice changed are
  rewritten.
- `webState` for a member: their slice from the cache (a cover: only their codes). Not cached → read their binome
  sheet directly (`SpreadsheetApp.openById`): their own sharing allows it. That fails too (TEST_MODE: nothing is
  shared) → a clear error, "Your binome sheet isn't shared with you yet."
- `webPulse` for a member: the `MEMBER_MAP` check (gone → "Not allowed"), then their binome's version.
- `webAccess` returns `role`, `binome`, `cover`: shape change → `API_VERSION` 3 in both files.

**Tests.** The security matrix is the heart of this task (in `test/web.test.js`; switch the active user as the
existing access tests do):
- A member gets their binome only: not another binome's candidates or alerts, no settings, no team, no admin alerts.
- A member calling each admin `webRun` action gets "Not allowed", and the Master is unchanged.
- An ENP account in no binome: "Not allowed". An admin who is also a member: admin.
- A member removed with Change members: the next `webPulse` says "Not allowed".
- A cover sees only the codes they cover.
- Cache empty: the member's view is rebuilt from their sheet.

**Ship.** `npm run deploy` (no UI yet, nothing changes for admins except the version). Push the `types.ts` bump in
the same PR so the page and the script agree.

**Done when.** The matrix passes and no admin data can reach a member.

**Notes.**

- **Code (2026-10-07, branch `p1-6-member-role`).** `access_()` returns `role`: `'admin'` (an editor of the Master, as
  before), else `'member'` when the email is in `MEMBER_MAP` (`{binome, cover, m}`), else the old refusals with `role: ''`.
  Every admin entry point checks `role === 'admin'`: `webRun`, the admin part of `webState`, `webPulse`, `doGet`,
  `isAdmin_` (no caller left; kept for the menu). `webAccess` adds `role`, `binome`, `cover`; `API_VERSION` 3.
- **`MEMBER_MAP`** is kept with the baseline's chunking, now shared: `savePropChunks_` / `loadPropChunks_` (Sheets.gs),
  4,000 characters per property (`MEMBER_MAP_N` + `MEMBER_MAP_0..n`). `memberMap_(ctx)`: members of ACTIVE / PAUSED
  binomes `{b, f}`, live covers `{b, f, cover: true, codes}` (only the codes `coverLive_` still counts); a member's own
  binome wins over a cover; someone covering in two binomes sees the first one until it ends (`ponytail:` note).
  `saveMemberMap_(ctx)` writes only when it differs, called inside the lock by: `runCycle_` (after the tracker),
  `lockBinomesCore_`, `applyMemberPlans_` (change and swap, also from the menu), `newBinomeCore_`, `addCoverCore_`,
  `endCoverCore_`, `resetBinomesCore_` (empty). A hand edit of the Binomes tab reaches the map at the next sync.
- **Slices.** `publishState_` also calls `publishBins_(ctx)`: one `snap:bin:<code>` per locked binome (`v`, `binome`,
  `tag`, `status`, `fileUrl`, `members` (names), `candidates`, `alerts`, `fromSheet: false`). A candidate is an object of
  the `BF_H` keys + `Status`, built from the Master row with `ivToFileRow_` (Dates as `dd/MM/yyyy`, `HH:mm` for
  Interview Time, `dd/MM/yyyy HH:mm` for Registered). Alerts: OPEN ones of that binome whose type is in `MEMBER_ALERTS`
  (`NOT_CONTACTED`, `NO_DATE`, `OVERDUE`, `BAD_DATE`, `ODD_VALUE`: the ones the script mails binomes); the rest
  (manual edits, file errors, registration checks, interview-form mismatches that name other binomes) stay the admins'.
  `SNAP_BIN` = code → `{h, v}`, saved with `SNAP_HASH` / `SNAP_VER` (same drop guard); `v` +1 only when that slice's
  hash moves; a slice is re-put only when the cached value differs. `dropSnap_` blanks every `h` and bumps every `v`.
  A slice over 100 KB is not cached: that member reads their sheet.
- **Member `webState`**: the cached slice when its hash matches `SNAP_BIN`, else read from their binome sheet with their
  own access (`fromSheet: true`; no statuses, alerts or names, those live in the Master), else "Your binome sheet isn't
  shared with you yet.". A cover gets only their codes (candidates and alerts). Per-request: `role`, `cover`, `user`,
  `switchUrl`. Member `webPulse`: their binome's `v` (gone from the map → "Not allowed").
- **UI:** only `types.ts` (version 3, `Access.role` / `binome` / `cover`) and the gate in `store.ts`: a member gets the
  no-access screen until task 7. The gate tests `role === "member"`, not `!== "admin"`, so the page Vercel serves right
  after the merge still lets admins in while the script is on the old version.
- **Tests** (`web.test.js` › "members: their binome only", own seeded project): the slice's exact keys and only its
  candidates / member alerts, no other binome's codes anywhere; all 22 `webRun` actions "Not allowed" with the tabs and
  the script properties unchanged; `isAdmin_` false and `doGet` NoAccess; an ENP account in no binome refused; an admin
  who is also a member is an admin; a sheet edit in one binome moves only that binome's `v`, a quiet sync rewrites no
  `MEMBER_MAP`; cache emptied → from the sheet, sheet not shared → the clear error; a cover sees one code (cache and
  sheet); Change members → the old member's next `webPulse` is "Not allowed", the newcomer gets in; Reset → map `{}`.
  Checked that the matrix fails when `webRun` goes back to `ok`.
- **Live, not checkable on the mock:** a non-editor running the script through `scripts.run` (that `ss_()` / the editor
  list fail quietly for them and script properties and cache are readable), and the sheet fallback under real sharing.
  Needs a member account signing in, so it lands with task 7's page.
- **CodeRabbit on #27:** `refresh` in `store.ts` also sends a member slice to the gate (an admin in a binome who loses
  edit access mid-session would otherwise get admin pages fed a member slice). Task 7 replaces both gates with the member mode.
- **Shipped 2026-10-07:** merged as `6f3cbc3`, `npm run deploy` (all suites green; web app @65, API @66; 18 files pushed,
  and the live project pulled back afterwards: all 18 equal to `main`). Vercel production built from `6f3cbc3` (the real
  build: frontend `npm ci`, `tsc -b && vite build`, 37 s).
- **For task 7:** the member state is `{v, binome, tag, status, fileUrl, members[], candidates[], alerts[], fromSheet, role,
  cover, user, switchUrl}`; a candidate is the `BF_H` keys + `Status` (all `''` when `fromSheet`); an alert is
  `{id, created, severity, type, code, msg}`. `webPulse` for a member is their binome's version (a number). Remove the two
  member gates in `store.ts` when the member mode lands.

---

## Task 7 — My binome page (read-only) and member polling

**Read first.** `PRODUCT.md`, `DESIGN.md`, [docs/frontend.md](frontend.md), `frontend/src/config/routes.tsx`,
`frontend/src/lib/vic/store.ts` and `types.ts`, the Interviewees page (`frontend/src/app/interviewees/`) for table
patterns, `app-shell.tsx`, `test/webdev.js` (to add a member login to the mock).

**Do.**
- `types.ts`: `Access.role`, `binome`, `cover`; a `MemberState` type for the member's slice.
- The store: a `member` gate mode; members load their slice and poll every **15 s** (admins keep 2 s).
- A member sees one page, **My binome**: their candidates with the sheet's columns, each one's status, their binome's
  open alerts, a link to their binome sheet. No admin navigation; Account and Appearance settings stay.
- Read-only in this task (task 8 adds editing). Charter look, light and dark (DESIGN.md).
- Mock: seed a member login (`/dev-login?as=<a member email>`).

**Tests.** `npm run typecheck`; `test/vercel.test.js` (API version). On the mock: a member sees only My binome;
after being removed, they land on the no-access screen within 15 s. Screenshots with `playwright-chrome`
(HANDOFF › Gotchas).

**Ship.** Push after task 6 is deployed; check the Vercel build log.

**Done when.** A member signs in and sees their binome, quickly, and nothing else.

**Notes.**

- **Code (2026-10-07, branch `p1-7-my-binome`), UI and `test/webdev.js` only.** No script change, no `API_VERSION` bump
  (task 6 already shipped the shape). `types.ts`: `MemberState`, `MemberAlert`, `Candidate` (the `BF_H` keys as `SHEET_KEYS`
  + `Status`); `format.ts`: `SHEET_LABEL` (the sheet's own headers, mirror of `BF_LABEL`), `cellText`, `sheetTime`.
- **Store:** gate mode `"member"`, `member` (the slice) and `memberError`. The two task-6 gates are gone: `refresh` lets the
  **shape** of `webState` pick the mode (`role === "member"` → member, else admin) and re-reads `webAccess` when the mode
  flips, so an admin who loses edit access but sits in a binome lands on My binome, and a member made an editor gets the
  admin pages. `checkPulse` is shared; a member whose sheet couldn't load (`memberError`) keeps polling, so the page fills
  itself after the sync publishes their slice.
- **Shell:** same `AppShell`; members get `memberRoutes` (`/`, Account, Appearance, anything else → `/`), `memberNavGroups`, a
  "My binome sheet" link instead of Google files, a header with live status, palette and theme only (no search, bell or
  Sync), and `MEMBER_PULSE_MS` 15000 (admins stay at 2000). Account and the sidebar's account row say Member / Cover of B.xx.
- **My binome** (`app/my-binome/`): binome code, members, "Open my binome sheet"; notes for Paused, `fromSheet` and covers;
  Your candidates (count, status bar from Assigned on, Coming up: the next 4 interviews by day and time); Needs you (alerts
  grouped by candidate, worst first, click opens the candidate); Candidates table (Code, Name, Status, Contacted?, Interview,
  Done, Rating, Final affectation; the rest under View) and a details sheet with every column of the sheet, grouped.
  `fromSheet` drops the Status column and says statuses and alerts come after the next sync.
- **Mock:** `/dev-login?as=member` signs in a member of the busiest binome (the start-up line names them; B.03, yasmine).
- **Checked on the mock (playwright-chrome, 1440 and 390 wide, light and dark):** a member sees only My binome, Account and
  Appearance; one `webPulse` per 15 s tick (calls at 7.3 s and 22.3 s); after an admin's Change members removed them, the
  next tick gave `webPulse` "Not allowed" + one `webAccess` and the no-access screen, 6.9 s after the removal. Admins
  unchanged (Overview, full nav, Sync now). `npm run typecheck`, `npm test` green.
- **CodeRabbit on #28:** the details sheet kept a closing candidate in state after they left the slice (moved, cover
  ended); it now keeps them only while their code is still in the member's candidates.
- **Shipped 2026-10-07:** merged as `b9f84c0`, UI only (no `.gs` changed, no `npm run deploy`, no `API_VERSION` bump).
  Vercel production built from `b9f84c0` (the real build: frontend `npm ci`, `tsc -b && vite build`, 31 s; "Deployment completed").
- **Live test script:** [member-access-tests.md](member-access-tests.md) (sign-in, admin pages, every `webRun` action from the console, losing access, covers).
- **Not checkable on the mock, for the live check:** a real member signing in through `scripts.run` (task 6's open item),
  the cold-cache read from their sheet, and the "isn't shared with you yet" screen (TEST_MODE shares nothing, so on the live
  Master today every member should see that screen).

---

## Task 8 — Members edit their binome from the dashboard

**Why.** The owner's intention: members fill their binome from the dashboard while their access stays limited to
their own sheet. Writing into the sheet (not the Master) needs no script lock, so 100 members never queue behind each
other or behind the sync; Google's protection on the sheet still applies.

**Read first.** `BinomeFiles.gs` (`formatBinomeSheet_`: the validations; `findFileRow_`, `bfCol_`, `BF_EDITABLE`,
`CONTACT_OPTIONS`, `AFFECTATION_OPTIONS` in Config.gs), `Sync.gs` (`pullBinomeFiles_`: how the sheet is read,
display values for date and time), task 6's code and Notes, the My binome page (task 7).

**Do.**
- `webRun('memberSet', {code, field, value, seen})`, members only (not covers): `field` in `BF_EDITABLE`; `value`
  checked like the sheet's own validations, because a script write skips them: Contacted in `CONTACT_OPTIONS`,
  Final Affectation in `AFFECTATION_OPTIONS` or empty, Rating 0–10 or empty, Interview Done true/false, Interview
  Day a valid date `dd/MM/yyyy`, Time `HH:mm`, Notes ≤ 2,000 characters.
- Inside a **short lock that is not the script lock**: `LockService.getDocumentLock()` (the sync holds the script
  lock for seconds). First check on the live script that it isn't null when called through `scripts.run`; if it
  is, use the script lock with `tryLock(10000)` and the `BUSY` error of task 2.
  - Open the member's sheet (`f` from `MEMBER_MAP`), `findFileRow_(sh, code)`: not there → "This candidate is no
    longer in your binome."
  - Read the cell as displayed. If it isn't `seen`, the partner changed it meanwhile: throw
    `CONFLICT: <current value>` and write nothing (`run.js` maps the prefix to `code: 'CONFLICT'` like `BUSY`).
  - Otherwise write it the way a person typing would (date and time must land as real date / time in the fr_FR
    sheet, not text: check on the live sheet), and release the lock.
- After the write: script cache key `dirty:<binome>` = now (one key per binome, so two writers never race on a
  shared list), and patch that binome's cached slice + version so the partner's screen updates at their next poll.
- `pullBinomeFiles_`: read every `dirty:<binome>` key; those sheets are read this run whatever Drive's "last
  updated" says (it can lag minutes); after reading, remove a key only if its time is not after the read started, so
  a write during the read stays dirty for the next run.
- UI (My binome): the gold columns become editable (selects for Contacted and Final Affectation, date and time
  inputs, a checkbox, a 0–10 number, a notes box), saved per field. Never optimistic: a value shows as saved only
  when the script says so. On `CONFLICT`: "Your partner changed this to X" with **Keep theirs** / **Use mine** (Use
  mine resends with `seen` = X).

**Tests.**
- Writes the cell; refused for: a field not in `BF_EDITABLE`, a code of another binome, a cover, each invalid
  value, a removed member.
- `CONFLICT` when `seen` differs, and nothing written.
- A dirty binome is read by the next sync even when the mock's `lastUpdated` didn't move; Interviewees gets the
  value; the slice version goes up; a write during the read stays dirty.
- `npm run typecheck`.

**Live check** (TEST_MODE on, nothing shared): the owner puts a second ENP account into a test binome (Change
members), shares that binome's sheet with it by hand, signs in with it on the dashboard, edits each kind of field,
then checks the sheet, the Master after the next sync, and a conflict (edit the same cell in the sheet first). Put
everything back after.

**Ship.** `npm run deploy`, then the UI.

**Done when.** Every member edit lands in their sheet and then the Master, and an edit that would overwrite their
partner's is stopped and shown.

**Notes.**

- **Code (2026-10-07, branch `p1-8-member-edit`).** `webRun('memberSet', {code, field, value, seen})` is handled before the
  admin check and never publishes (no script lock). `memberSet_` (WebApp.gs): members only (a cover, an admin, a removed member:
  "Not allowed"), `field` in `BF_EDITABLE`, `memberValue_` checks the value like the sheet's validations (Rating also takes
  `7,5`; an Interview Day that rolls over, like 31/02, is refused; Time is strict `HH:mm`). Opens `MEMBER_MAP`'s `f` with the
  member's own access ("isn't shared with you yet" otherwise), refuses a sheet whose header isn't the current layout.
- **Lock:** `memberLock_()` = `LockService.getDocumentLock()`, or the script lock when that is null; `tryLock(10000)`, refused
  → `BUSY:` (the page shows it as not saved, Try again). **Checked live 2026-10-17 ([#59](https://github.com/puIad/vic-recruitment-2026/issues/59)):** under
  `scripts.run` the document lock is never null, for admins and for members, so members never fall back to the script lock
  (see the last note).
- **Write:** Interview Day as a `Date` (midnight in `TIMEZONE`: a real date whatever the sheet's locale), Time as the
  string `HH:mm` (Sheets parses it as a time in every locale), Rating a number, Done a boolean, Notes with a leading `'` (stay
  text: no formula, no date). **Live check:** the date and time land as real date / time in the fr_FR sheet.
- **Conflict:** the cell is compared with `seen` as text (`goldText_`: Done `true`/`false`, Rating as a number, date and time
  as displayed); differs → `CONFLICT: <value now>`, nothing written. `run.js` maps the prefix to `{error: <value>, code: 'CONFLICT'}`.
- **After the write:** `dirty:<binome>` = now in the script cache (6 h); `patchSlice_` puts the value into the cached slice and
  bumps that binome's `v` in `SNAP_BIN` (slice not cached as published → `v` +1 and no hash: the next `webState` reads the
  sheet). `pullBinomeFiles_` reads every dirty sheet (`opened` reason `edited`) and removes the key only if its time is not
  after that sheet's read started. `publishBins_` keeps the old `SNAP_BIN` entry and cached slice of a binome whose dirty time
  is after `ctx.now` (a sync that loaded before the write must not republish the old value). `ponytail:` the patch's
  `SNAP_BIN` write is not under the script lock; a publish in the same ms can overwrite that one entry, then the page shows the
  sheet or the older slice until the next sync, which reads the dirty sheet.
- **UI:** the details sheet's "Your interview" block is the editor for members (covers stay read-only): selects for Contacted
  and Final Affectation and the Done checkbox save on change; date, time, rating (0–10 checked as you type) and notes (counter,
  2,000) save with Save / Enter (Ctrl+Enter in notes), Escape cancels. Never optimistic: the slice changes only with the value
  the script returns (`store.memberSet` / `patchMember`). A poll doesn't overwrite a field mid-edit; the save sends the value the
  edit started from as `seen`. On `CONFLICT`: "Your partner changed this to X" with Keep theirs / Use mine (resends with `seen` = X).
- **Tests** (`web.test.js` › members, `vercel.test.js`): each field written (a real Date for the day, notes kept as text), the
  partner's next `webPulse` +1 and the patched slice; refused for every invalid value, a field outside `BF_EDITABLE`, another
  binome's code, a cover, an admin, a stranger, a removed member, a busy lock, an unshared sheet, all with the sheet unchanged;
  `CONFLICT` with the current value for text, number and boolean; no document lock → script lock; a dirty binome is read by a
  sync while Drive's time lags (control: without the mark it isn't), the Master gets every value and the status, the mark goes,
  `v` goes up; a write after the read started stays dirty and its slice is kept. Mutation-checked: the dirty read, the publish
  guard and the conflict check each fail the suite when removed.
- **Checked on the mock (playwright-chrome, 1440 and 390 wide, light and dark):** select, notes, checkbox and rating saved;
  rating 12 refused inline; a write behind the page's back gave the conflict box, Use mine saved 7.5; `webState` afterwards
  returned the saved values from the cached slice.
- **CodeRabbit on #29:** its walkthrough ran but the review never posted ("GitHub unavailable during review post"), so no
  findings were addressed; merged on the owner's word. Re-run it (`@coderabbitai review` on #29) if a review is wanted.
- **Shipped 2026-10-07:** merged as `9f20f26`, `npm run deploy` (all suites green; web app @67, API @68; 18 files pushed, and
  the live project pulled back afterwards: all 18 equal to `main`). Vercel production built from `9f20f26` (the real build:
  `npm install` 316 packages, `tsc -b && vite build`, 47 s; "Deployment completed").
- **Follow-up (owner, after the live check, 2026-10-07, [#30](https://github.com/puIad/vic-recruitment-2026/pull/30), merged):** a hand-shared sheet let the
  member in without the owner meaning to open the dashboard yet (task 6's access rule was only "in `MEMBER_MAP`"). Now the
  dashboard follows the sheet: `access_()` makes someone in `MEMBER_MAP` a member only while Drive lets them open their binome
  sheet (`sheetAccess_`: `Drive.Files.get` with `capabilities(canEdit)` as the member, one call per request), else reason
  `NOT_SHARED` (gate: "Binome B.xx isn't open yet"). A Drive error other than "no access" is thrown, so a hiccup never reads
  as a revoke. `edit` (= `canEdit`) rides on the member state: a view-only member gets My binome read-only, and `memberSet`
  refuses ("You can view your binome sheet but not edit it"); the sheet's own permission would refuse the write anyway.
  - **`webRun('binomeAccess', {binome, level?})`** (admins): without `level`, each member's access read live from Drive; with
    `none` / `view` / `edit`, both members get exactly that, through the Drive advanced service with
    `sendNotificationEmail: false` (`setSheetAccess_`), **also in TEST_MODE** (owner's choice: a deliberate click per binome).
    The owner of the sheet is never touched; covers keep the view access their cover gave them. The level is recorded in
    `BIN_ACCESS` (code -> `{level, at, by}`, shown as a badge in Binomes, cleared by Reset), and the binome's `SNAP_BIN` `v` is
    bumped so its members' pages reload with the new edit flag.
  - **Change members / swap with sharing off:** a binome opened from here keeps its level: the newcomer gets it and the member
    who leaves loses it, silently. With sharing on (after launch) nothing changed: `addEditor` / `removeEditor` with Drive's
    email, as before. The bulk Re-share and every other automatic share keep their email and their TEST_MODE gate (owner's choice).
  - **Manifest:** `enabledAdvancedServices` Drive v3 (same `drive` scope: no new consent). The Drive API is already on in the
    Cloud project (HANDOFF › Gotchas).
  - **UI:** Binomes › ⋯ › Sheet & dashboard access… (dialog: each member's access now, No access / View / Edit for both, Apply);
    "Open · view" / "Open · edit" badge in the Status column; the gate's NOT_SHARED copy; My binome read-only with a note when
    view-only. Mock: `/dev-login?as=member` is in an opened binome (edit), `/dev-login?as=closed` in one not opened yet.
  - **Tests:** the mock gained the Drive advanced service and per-user access (`__acl`, off unless a test turns it on: Drive
    `Files.get`, `openById` of a binome sheet and writes check the active user). In the members block: not shared →
    NOT_SHARED, no state, no pulse; a read changes nothing; Edit for both, no Drive email (`__notified` empty), no mail; a
    member's state has `edit`; View → read-only and `memberSet` refused; None → the next pulse is Not allowed; reopened → a new
    version; a cover needs view access too; Change members carries the level (leaver loses it, newcomer gets edit); Reset clears
    `BIN_ACCESS`; members can't call `binomeAccess`. Mutation-checked: the Drive check in `access_`, the silent flag, the edit guard.
  - **CodeRabbit on #30:** a Drive rate-limit / quota 403 is rethrown (`DRIVE_BUSY_RE`), not read as no access;
    `sheetRoles_` reads every permissions page; the level is recorded only when every member got it; with sharing off a
    leaver loses their sheet access however they got it (also a hand share in a binome never opened from here); the
    details sheet's link is always "Open my binome sheet"; the live test script lists `edit` and `binomeAccess`. Each has a
    test, mutation-checked. Second round: a removal Drive refuses when a member leaves is reported (`fileIssues`: FILE_ERROR
    alert, "FILE NOT UPDATED" history row), not swallowed; the member header and Account say "read-only" or "you can edit"
    by access (they still said read-only from task 7), a cover's Account says read-only; A2 of the live test script checks View
    and Edit.
  - **Shipped 2026-10-07:** merged as `6b690e5`, `npm run deploy` (all suites green; web app @69, API @70; 18 files pushed, the
    live project pulled back afterwards: all 18 equal to `main`, the manifest with the Drive advanced service included).
    Vercel production built from `6b690e5` (the real build: `npm install` 316 packages, `tsc -b && vite build`; "Deployment
    completed"). **The member the owner shared B.__'s sheet with by hand still opens their sheet, so still gets the dashboard:**
    set that binome to No access (Binomes › ⋯ › Sheet & dashboard access…) or remove the share in Drive.
  - **Live check still to do:** open one binome with View, then Edit, then No access, from the dashboard; check the sheet's
    sharing in Drive, that no email arrived, and the member's page at each step ([member-access-tests.md](member-access-tests.md),
    Before you start).
- **Still open, the live check** (above, TEST_MODE on): a second ENP account in a test binome with its sheet shared by hand
  edits each kind of field; check the date and time land as real date / time in the fr_FR sheet, the Master after the next
  sync, a conflict, and in Apps Script › Executions whether `memberSet` ran under the document lock (no `BUSY` while a sync
  runs). Put everything back after. Same session as task 7's real member sign-in ([member-access-tests.md](member-access-tests.md)).
- **Document lock under `scripts.run` (2026-10-17, [#59](https://github.com/puIad/vic-recruitment-2026/issues/59)):** not null, and
  `tryLock(1000)` succeeds, for the Master's owner (vic.rh), an editor (admin), and a binome member who is not an editor.
  It is one lock for everyone: while the member held it, three admin calls each waited 1 s and were refused, and so was a
  second member call. Method: a throwaway read-only `lockProbe` pushed with origin/main to a temporary API deployment (@87),
  called through `scripts.run` with each person's token from a local copy of the sign-in (localhost:3000); then origin/main
  pushed back, the deployment deleted, and a `clasp pull` confirmed the live files equal main.

---

## Task 9 — Triggers on the club account

**Why.** The sync, form and digest triggers run on the owner's personal account: its 6 h/day of trigger time and
1,500 mails/day. Dashboard calls already run as each person (the production log shows each caller's email), so they
need nothing. The handover needs this move anyway ([vercel.md](vercel.md#still-open)).

**Read first.** `Setup.gs` (`installTriggers_`, `setup`), [reference.md](reference.md) (`TRIGGER_OWNER`).

**Steps (owner).**
1. Give `vic.rh@g.enp.edu.dz` edit access to the Master and the Binome Sheets folder.
2. As the owner: Apps Script › Triggers, delete your `onFormSubmitHandler`, `syncAll` and `sendDailyDigest`; then
   Project Settings › Script properties, delete `TRIGGER_OWNER`. (Apps Script only lists the caller's own triggers,
   so skipping this would leave two syncs running.)
3. As `vic.rh`: open the Master, run Setup from the menu (the dashboard's Setup is for the Master's owner), and
   accept the permissions.
4. Check Apps Script › Triggers lists the three under `vic.rh`, and Executions shows `syncAll` running every minute.
   Mails from triggers now come from `vic.rh`: tell the team.

**Code check (agent).** Setup's other steps as a non-owner editor: `protectBinomeSheet_` adds the running account as
editor of the protections; make sure the Master's owner stays able to edit the protected ranges. Update
`reference.md` (`TRIGGER_OWNER`) and the handover list in `vercel.md`.

**Done when.** The triggers run as `vic.rh`, and the docs say so.

**Notes.**

- **Shipped 2026-10-06:** [#20](https://github.com/puIad/vic-recruitment-2026/pull/20), deployed from `2264a74` (web app @53, API @54). The owner's steps 1–4 above are still to do.
- **Code check, two bugs found (2026-10-05).** Both would have broken the move:
  1. `installTriggers_` fell back to the **Master's owner** when `TRIGGER_OWNER` was unset, so after step 2 `vic.rh`
     (an editor, not the owner) was refused with "The triggers belong to <owner>". Now an unset property means the
     account running Setup takes it (`triggerOwner_()` in Setup.gs). `setup()` also checks this first, so a Setup from
     the wrong account stops before changing anything instead of half-building the Master.
  2. `protectBinomeSheet_` removed every protection editor except the account running it. The 32 existing sheets are
     owned by the owner's personal account, so the first protection rewrite by anyone else (Change members, Apply,
     a quick fix) would have locked `vic.rh` out of the cells the sync writes. It now always keeps the running
     account, `TRIGGER_OWNER` and the Master's owner.
- **Side effect to know:** once the triggers belong to `vic.rh`, the owner's Setup button on the dashboard is refused
  (clear message). Re-run Setup from the Master's menu as `vic.rh`.
- Tests: `web.test.js` covers the handover (property deleted, `vic.rh` runs Setup and takes it; another account is
  stopped before anything is touched). `reference.md` and `vercel.md` updated. The protection editors are not
  observable in the mock: the real check is the next point.
- **Found live, 2026-10-06:** after the owner's steps the 32 existing binome sheets still listed only the owner as protection editor
  (a protection is only rewritten by a rebuild or a repair), so `vic.rh`'s sync could not write the columns it fills. Fix: Check integrity
  now flags a protection that does not list `TRIGGER_OWNER` (an INTEGRITY alert with the `protect` repair). **The owner** then opens
  Alerts, selects those alerts and presses Repair (signed in as the owner: only a protection's owner can rewrite it).
  Then re-run Check integrity: no alert left.
- **Live check after step 3** (owner): in a binome sheet, Share › the protected-range editors should list `vic.rh` and
  the owner's account; type in a gold column, wait for the next `syncAll`, and check the value reaches the Master and Executions shows
  no permission errors.

---

## Task 10 — Load test again, then sign off

**Signed off by the owner, 2026-10-24, without run 4:** "sign it off, trust the process, if anything bad happens we fix
on the spot". What run 4 would have checked is first seen live on opening night (26 Oct, 18:00): #104's member sheet
read, the 5-minute sync and its publish phase under real load, and the read times.

**Why.** The first load test (2026-10-05, [appendix](#appendix-the-evidence)) measured a dashboard that no longer exists:
every refresh rebuilt the Master, members had no page, and every save went through the script lock. Rewritten on
2026-10-19 for the dashboard as it is at launch, so the sign-off covers what people will really do. Members get the
dashboard only after it.

**Read first.** `test/load.js` (its header lists every option), this task, [vercel.md](vercel.md) › Pending changes, and
the [pending-changes build plan](plans.md#pending-changes-the-build-plan).

### Who, at launch

32 binomes, 64 members (the Team's 65 rows minus one excluded), about 4 admins, each person on their own Google
account. TEST_MODE stays on until launch. **Pending changes are on at launch** (owner, 2026-10-19): the switch-on rows
below are the launch path, the switch-off rows the fallback.

| Who | When | Calls (`/api/run`) |
|---|---|---|
| Everyone | opens the page | `webAccess` → `webPulse([true], rec 1)` → `webState` |
| Admin | every 5 s, tab visible, no action or dialog open | `webPulse([true])`; the author's pending record rides on every 2nd poll while they have changes pending |
| Member | every 30 s | `webPulse([true])`, with the record on every poll while changes are pending |
| Anyone | a tab nobody touched for 3 min polls 4× slower; after 15 min it stops until the next mouse, key or scroll ([#102](https://github.com/puIad/vic-recruitment-2026/pull/102)) | `webAccess` / `webPulse` end at Google after 25 s (the page drops them at 20 s) |
| Anyone | the pulse moved (admins: `SNAP_VER` or their binome's `bv`; members: their binome's version) | `webPulse` + `webState` |
| Admin | Alerts: Snooze, Mute, Unmute, Resolve | switch on: `accept` (Redis + queue, no Google call), then the consumer's `webApply` as them (document lock). Switch off: `webRun quick` / `resolve` (script lock, then `publishFresh_`), then a refresh |
| Admin | Settings: Save | switch on: `accept` → `webApply`; off: `webRun saveSettings` (+ publish) |
| Member, or admin in a binome ([#85](https://github.com/puIad/vic-recruitment-2026/pull/85)) | My binome: Save (1–7 fields of one candidate) | switch on: `accept` → `webApply`; off: `webRun memberSet {code, fields}` (document lock, 10 s) |
| Member, or admin in a binome | the interview form ([#87](https://github.com/puIad/vic-recruitment-2026/pull/87)) | `webRun interviewGet` on open, `interviewSave` on save: always direct, document lock |
| Anyone with a drop on screen | | `pendingMark` (shown, then seen once a minute, Keep the sheet's value) |
| The sync (vic.rh) | every minute | script lock (30 s), then `api/drops` (Redis: one SMEMBERS of `pcx`, one HGETALL per author in it) |

Two locks are shared by everyone, and they are what can queue people behind each other:
- **the script lock**: the sync, every direct admin action and its publish;
- **the document lock**: every `memberSet`, `interviewSave` and `webApply`, for every binome at once ([#59](https://github.com/puIad/vic-recruitment-2026/issues/59)).

`webApply` never publishes: with the switch on, other admins see an alert or setting change at the next sync's publish
(about a minute later). A partner sees a My binome field at their next poll on either path (`patchSlice_`).

### The run

**1. Model** (`node test/load.js`, ~2 min): the people above for 10 simulated minutes, opening at random moments in the
first 2, pending changes on for the first 8 and off for the last 2, through the real `web/api/run.js`, `web/api/apply.js` and `web/lib/pending.js` (Redis and
Queues faked in memory, `test/fakes.js`). The Apps Script stand-in has both locks and the 1-minute sync. Busy-hour rates,
per person: a My binome Save every ~4 min, an interview form every ~20 min, an alert action every ~2 min (admins), a
setting every ~30 min. `npm test` runs a 2-minute version of it (`npm run load:check`) that fails unless every call
answered and every accepted change ended.

**2. Live, on production in TEST_MODE**, with the owner:
1. The owner signs in on the dashboard with each account to use and puts one `vic_s` cookie per line in `cookies.txt` at
   the repo root (git-ignored; DevTools › Application › Cookies): their own account, `vic.rh` (the owner: the script can
   flip the switch with it), and a member account if one can sign in (members' polls run only on member cookies; an
   admin in a binome still saves through My binome). `node test/load.js --live https://vic-recruitment.vercel.app
   --cookies cookies.txt --check` prints each one's email, role and whether it has ended.
2. The plan, no write: the same with `--dry-run --writes --pending on --pending-off-at 8 --pending-end on|off|found`
   (the switch's state after the run is the owner's; plus `--codes`, `--interview`, `--setting` if wanted). It reads each
   account once and prints who runs where, the calls a minute per account (Google allows about 600), whether each
   account's pending record still holds anything from before, TEST_MODE, the switch, the slice drop, and exactly what it
   would write. The owner says go on that plan.
3. The run: the same without `--dry-run`, 10 minutes, 4 admins and 64 members spread over the cookies of their role,
   each opening at a random moment in the first 2 minutes (`--stagger 2`): runs 1 and 2 opened all 68 in the same second,
   so their polls ticked together for the whole run, which real pages never do. Pending changes on from the start to
   minute 8, then off: the last 2 minutes are the direct fallback, and each writer saves once as soon as its page sees
   the switch off. It stops before writing anything unless TEST_MODE is on. At minute 3 the owner's cookie drops the
   cached slice of each binome a cookie sits in (`webRun dropSlice`, owner and TEST_MODE only, a script property, no
   sheet), so those members read their binome sheet until the next sync republishes it: the read
   [#101](https://github.com/puIad/vic-recruitment-2026/pull/101) fixed. It writes only:
   - Notes of the chosen test candidates (two per binome a cookie sits in, or `--codes`), toggled with " [load test]";
   - Snooze 4 h / Mute / Unmute on up to `--alerts 4` open alerts about a candidate;
   - with `--interview CODE`: that candidate's dashboard interview form, re-saved with its own answers, only if this account
     saved it (its Edited at / by move; nothing else changes);
   - with `--setting ALL_BINOME_WEIGHT`: 1 ↔ 1.5 (no binome is ALL this season, so it changes nothing).
   None of these sends mail. A conflict on a Notes cell (someone typed there) is counted and left alone, never "Use mine".
   At the end it waits for the sync, then puts back only what is still as the run left it: a Note still ending in the
   mark, an alert still held the way the run held it, the setting, the switch. Anything someone else changed meanwhile is
   left as they left it, and the run prints which. Ctrl-C stops the people and still puts things back.
4. During the run: the owner keeps Apps Script › Executions open (the sync still runs every minute; `cycle` lines with
   `busy`?), and reads Vercel › Usage and Upstash › Usage before and after. Within the hour, the Vercel runtime logs give
   the server side: the `{"email","action","ms","ok"}` lines, `{"at":"apply","ended":[...]}`, and one
   `{"at":"drops"}` line per timed sync (mark 11 without Executions).

Before the run: the script with `dropSlice` is deployed (it ships with the PR that added it).

### Pass marks

The owner decided on 2026-10-19 to launch with pending changes on, so the sign-off judges the **pending path**. The
direct path is the fallback (the switch off): its marks are measured and reported, and do not gate.

**Gating** (every one of them):

| # | What | Mark | Measured |
|---|---|---|---|
| 1 | Calls answered: ok, or an error the page shows as one (BUSY, CONFLICT, DIRECT) | ≥ 99.9 %; no RATE_LIMIT and no "too many scripts" with one person per account; no My binome read refused while its slice is dropped (#101) | live and model |
| 2 | Opening the dashboard | p95 ≤ 5 s, admins and members | live |
| 3 | Refresh (`webState`) / poll (`webPulse`) | p95 ≤ 2 s / ≤ 3 s | live |
| 6 | Pending path: from the click to the partner's screen / to the other admins' | p95 ≤ 90 s / ≤ 4 min (owner, 2026-10-19; 20 s / 3 min before, see below) | model; the partner live only with two cookies in one binome |
| 7 | A save shows as Pending (the accept step answered) | p95 ≤ 1 s on a page that is polling | live |
| 8 | In the sheet (applied or already met) | p95 ≤ 2 min from the click | live and model |
| 9 | Every accepted change ends applied, met, dropped, or merged into the author's next change on that cell | none lost, none applied twice; drops only where someone else changed the cell first | live and model |
| 10 | Fallback: the switch turned off mid-run (minute 8) | the queued changes still end (9); no poll sent after it says on; every save after it is a direct write that answers | live and model |
| 11 | The 1-minute sync | keeps running through the run, never skipped twice in a row | Vercel's `drops` lines, Executions, model |
| 12 | Free tiers, with everyone on the page 1 h a day | Vercel ≤ 1M invocations a month, Redis ≤ 500K commands, Queues ≤ 1M operations: each "hours a day before a limit" ≥ 1 h | model, checked against the live Usage pages |

**Informational** (the direct path, live in the last 2 minutes only):

| # | What | Reference | Measured |
|---|---|---|---|
| 4 | A direct My binome Save answered / refused BUSY | p95 ≤ 5 s / ≤ 1 % of saves (each one shown with Try again) | live and model |
| 5 | A direct alert action answered | p95 ≤ 10 s | live and model |
| 6 | Direct path: from the click to the partner's screen / to the other admins' | p95 ≤ 20 s / ≤ 20 s (the partner's is out of reach with 30 s member polls: model 38 s) | model; live only with two cookies in one binome |

Why mark 6 changed on the pending path (owner, 2026-10-19):
- **Other admins** see an alert or setting change at the first sync that reads the Master after `webApply` wrote it
  (`webApply` never publishes). The worst case adds up to about 3.5 min: up to 60 s waiting for the author's one
  `webApply` a minute, a write that lands just after a sync's read (up to 60 s to the next one), that sync's ~20 s to its
  publish, a 5 s poll and the refresh. Run 2's 219 s was that case; the 3 min counted only the sync.
- **The partner** sees a My binome field at their next poll after `webApply` (`patchSlice_`). Since #102 members poll
  every 30 s, so the poll alone is about 28 s at p95; with a second save inside the minute waiting for the next
  `webApply`, about 90 s. The model gives 79 s.

Then the owner decides to open the dashboard to the binomes (STATUS.md, launch steps).

### Sign-ins per browser

The OAuth client secret is rotated and [slice 1](plans.md#slice-1-sign-ins-per-browser) is live (2026-10-17, #72).
Check live, with real ENP accounts, on the day of the run:
- Signing back in on a browser whose sign-in is past its 48 h: one account picker, no consent screen, and the same
  person's other browser keeps working throughout. To have such a browser on the day, sign in on a spare browser profile
  at least 48 h before and leave it closed.
- A switch onto a cookie past its 48 h: a second account signs in on that browser. The first person's other browser
  keeps working, and nothing of theirs is revoked.
- A reused token Google refuses goes to the consent screen: person X is signed in on browsers A and B, removes the
  dashboard's access in their Google account (Security › third-party connections), signs in on B (consent, a new
  grant), then signs in on A: one consent screen, then in, and B keeps working.

### Pending changes, beyond the run

With the switch on, live, after the run (each one a few clicks):
- **Account switch with changes pending** ([slice 5](plans.md#slice-5-token-edges)): person X saves on browser A, and
  before it applies a second account signs in on A. X is not revoked until their last change ends, then is
  (`{"at":"apply","revoked":true}` in the logs); X's other browser keeps working until then.
- **A redeploy with changes pending**: save, then Vercel › Deployments › Redeploy the production deployment at once. The
  change still ends applied: messages stay with the deployment that published them, and its consumer applies them.
- **A forced drop**, to see the drop on the page: hand-edit an alert's Status to SNOOZED in the Master **before** clicking
  Mute on it (an edit after the click lands too late). The page shows the amber row; Keep the sheet's value clears it.

Covered by tests, not run live: an old tab after a change-format bump (`FORMAT`, `test/vercel.test.js`), a change past
its apply-by swept as "retries ran out" (a deleted deployment's change ends that way), "revoke when done" and its expiry,
the 300-cell cap, a non-scope 403 retried.

**Notes.**

- **Rewritten 2026-10-19** (this task and `test/load.js`). The old task's live part (four admins × 25 editors, read-only)
  and its model (100 editors acting through the Master lock) no longer match: members have their own page and poll every
  15 s, admins read a cached snapshot, members' saves take the document lock, and pending changes run on Vercel.
- **The owner's `cookies.txt` had ended on 2026-10-19** (`--check`: SIGNED_OUT, probably the `script.external_request`
  scope of slice 4). Sign in again before the live run.
- **Checked against the local mock** (`npm run mock`, cookies from `/dev-login`): `--check`, the dry-run plan, and a
  1.5-minute live-mode run with writes and the switch on then off. Every accepted change ended, and the Notes, alerts,
  setting and switch were put back. The interview form re-save was not exercised (the mock has no dashboard form row).
- **Model, 2026-10-19** (`node test/load.js`: 64 members, 4 admins, 10 min, switch on for 5 then off). The stand-in's lock
  hold times are estimates, so these marks are a warning, not a verdict. The live run decides.

  | # | Mark | Model |
  |---|---|---|
  | 1 | calls answered | 4,655 / 4,655 |
  | 2 | opening p95 | admins 5.5 s, members 6.3 s (the stand-in's `webAccess` is 2 s here; live it was 1.2 s) |
  | 3 | `webState` / `webPulse` p95 | 2.5 s / 2.2 s |
  | 4 | direct Save p95 / BUSY | **8.9 s / 3 of 69 (4 %)**: the document lock (wait p95 5.6 s, 9 refusals counting `webApply` retries) |
  | 5 | direct alert action p95 | **25.9 s**: the script lock behind the sync (wait p95 16 s) and `publishFresh_` |
  | 6 | partner / other admins, direct | **22.9 s / 34.3 s**; pending: 57 s / 127 s |
  | 7 | accept p95 | 0.1 s (no Redis latency in the model: live only) |
  | 8 | in the sheet p95 | 48.9 s (one `webApply` per author per minute) |
  | 9 | ended | 172 accepted: 171 applied, 1 dropped, 0 lost, 0 applied twice |
  | 11 | sync | 11 runs, 0 skipped, 14.9 s with its lock wait |
  | 12 | hours a day before a limit | Vercel 1.1 h (478 invocations a minute), Redis 1.4 h (HGETALL 1,196 of 1,875: the polls that carry the record and the sync's sweep), Queues 27.6 h |

  What to watch live: the document lock under many My binome saves (marks 4, 6) and the script lock for direct admin
  actions while the sync runs (mark 5). Vercel and Redis fit only if everyone together is on the page about an hour a day
  or less.
- **Live run 1, 2026-10-19 16:37:22 UTC (stopped after 4 min, no sign-off).** Cookies: vic.rh (owner), the owner's
  account (admin in B.26), maroua_tassanime.amiar@ (member, B.29); 4 virtual admins, 64 virtual members; switch on at
  16:37:37. At 16:41:14 the load script crashed on its own bug (the admins of an account that don't write had no
  `lastSet`; fixed in [#100](https://github.com/puIad/vic-recruitment-2026/pull/100), which also makes any crash put things
  back), so the switch-off half, the direct path and the script's own report never ran. Put back by hand right after
  (16:44–16:48): switch off, A-1964 / A-1445 / A-1446 back to Open, `ALL_BINOME_WEIGHT` 1, FLER.07 and HR.01 Notes back
  to their originals; FLER.07's dashboard interview form was re-saved once at 16:40:23 (its Edited at moved, as agreed).
  From the Vercel runtime logs of those 4 minutes:
  - **Accept step (mark 7):** 14 calls, 10–543 ms (the first one 543 ms, the rest ≤ 217 ms). Every accepted change
    ended in the authors' records (applied or met); the consumer's `apply` lines show `applied`. Pass on this sample.
  - **`webState` (mark 3):** about 100 sampled, mostly 1.0–2.5 s, admins about 2.4 s typical, max 6.8 s; roughly 1 in 10
    over 2.5 s, so p95 is about 3.5 s against ≤ 2 s. **Miss.**
  - **`webPulse` (mark 3):** 100 sampled at 16:39, mostly 1.0–2.0 s, 1 in 10 over 3 s (3.1–9.2 s, one 20 s), so p95 is
    about 4 s against ≤ 3 s. Two member polls hung at Google for 120 s and 285 s (the page drops a poll at 20 s, but the
    function ran on until Vercel's limit). **Miss.**
  - No warning or error lines, no RATE_LIMIT, no BUSY. The 64 virtual members all sat in one binome (B.29), so each
    save there made all 64 refresh at once (16:40:49): a burst real members, spread over 32 binomes, would not make.
  - Seen in the owner's own browser after the run: two member `webState` calls refused with "You do not have permission
    to access the requested document" (16:42:11, 16:45:35) while `webAccess` for the same member said ok: the read
    from the binome sheet when the cached slice is missing. To look at before members get the dashboard.
- **Verdict so far: not signed off.** Run 1 covered 4 of 10 minutes and only the pending path; marks 3 look missed; marks
  4, 5, 6, 10 were not reached. A second run with #100 decides.
- **Live run 2, 2026-10-19 17:06–17:21 UTC: the baseline, not the sign-off.** Same cookies, plan and targets as run 1,
  with #100; switch on 17:06:17, off 17:11:19, back off at the end. The owner holds the sign-off run until the member
  `webState` fix ([#101](https://github.com/puIad/vic-recruitment-2026/pull/101)) and the polling-budget fix are live.
  Everything was put back: the run's own put-back did the Notes, three alerts and the setting; A-1964's unmute was
  refused BUSY (the sync held the script lock) and was redone by hand at 17:22. Checked after: switch off, the four alerts
  Open, `ALL_BINOME_WEIGHT` 1, FLER.07 "hakak", FLER.16 and HR.01 empty.

  | # | Mark | Run 2 | |
  |---|---|---|---|
  | 1 | calls answered ≥ 99.9 % | 3,616 / 3,640 (99.3 %): 22 polls dropped at the page's 20 s, 1 Google `UNAVAILABLE`, 1 alert gone meanwhile | miss |
  | 2 | opening p95 ≤ 5 s | admins 14.6 s, members 10.1 s (all 68 opened in the same second on 3 accounts) | miss |
  | 3 | `webState` / `webPulse` p95 | 4.8 s / 3.5 s (p99 26.5 s / 9.2 s) | miss |
  | 4 | direct Save p95 / BUSY | 5.5 s / 0 (only 2 saves: too few to judge) | open |
  | 5 | direct alert action p95 ≤ 10 s | 33.3 s p50, 108 s max (5 done, 1 BUSY): behind the sync on the script lock | miss |
  | 6 | other admins' screens, direct / pending | 43.5 s / 219 s p95 (marks 20 s / 3 min) | miss |
  | 7 | accept p95 ≤ 1 s | 0.5 s (8 calls) | pass |
  | 8 | in the sheet p95 ≤ 2 min | 65.6 s | pass |
  | 9 | every accepted change ended | 8 / 8 applied, 0 lost | pass |
  | 10 | switch off mid-run | nothing left pending, saves after it were direct | pass |
  | 11 | the sync | not read this run (Executions) | open |
  | 12 | free tiers | model only | see model |

  Busiest account: 369 calls in a minute (the member account carrying 64 virtual members), under Google's ~600.
  **Verdict: not signed off.** The pending path holds (7–10). The reads (2, 3) and anything behind the script lock (5, 6)
  miss; those are what the polling-budget fix and #101 target. The sign-off run repeats this plan once both are live and
  the owner says go.
- **Before the sign-off run (2026-10-19, after run 2).** Owner: launch with pending changes on, so the sign-off judges the
  pending path (pass marks above: 4, 5 and 6 direct are informational now). Live since run 2:
  [#101](https://github.com/puIad/vic-recruitment-2026/pull/101) (@110 / @111: a member's sheet read retried once; not
  yet hit live, hence the slice drop at minute 3) and [#102](https://github.com/puIad/vic-recruitment-2026/pull/102)
  (Vercel from `f41499a`: polls every 5 s / 30 s, the idle backoff, a 25 s Google limit on polls, the sync's sweep over `pcx`).
  What #102 changes for run 2's gating misses:
  - Marks 2 and 3: half the member polls and 60 % fewer admin polls on each account, and no poll runs past 25 s (run 1
    had one at 285 s). The rest of run 2's opening (all 68 in the same second on 3 accounts, and their polls ticking
    together after it) was the test's own burst; the run now staggers the openings over 2 minutes (owner). The 64 virtual
    members stay in B.29: one member cookie can't put them in other binomes, and their refreshes (about 16 a minute, all
    64 on each B.29 save) are already half of what 32 real binomes would make.
  - Mark 6 pending: nothing (admins poll every 5 s instead of 2 s: up to 3 s more). The owner moved the marks to the
    design's worst case instead (above).
  - `pcx`: nothing was left outside it. The old full sweep answered `open: 0` every minute from 17:15 to 17:43 UTC, after
    runs 1 and 2; run 1's changes were past their apply-by by 17:42, so a stuck one would have shown as a drop, and run 2's
    ended 8 / 8 applied. The dry-run now prints each cookie's record too.

  Model with the sign-off plan (`node test/load.js`: 64 members, 4 admins, 10 min, openings over 2 min, switch off at 8):

  | # | Mark | Model |
  |---|---|---|
  | 1 | calls answered | 2,656 / 2,657 (one poll in the model's rare 10× tail) |
  | 2 | opening p95 | admins 5.2 s, members 6.2 s (the stand-in's `webAccess` is 2 s; live it was 1.2 s) |
  | 3 | `webState` / `webPulse` p95 | 2.4 s / 2.2 s |
  | 6 | pending: partner / other admins p95 | 79.2 s / 101 s |
  | 7 | accept p95 | 0.1 s (no Redis latency in the model) |
  | 8 | in the sheet p95 | 60.1 s |
  | 9 | ended | 263 accepted: 261 applied, 2 dropped, 0 lost, 0 applied twice |
  | 10 | switch off at minute 8 | no poll said on after it; 5 saves accepted by pages that had not polled yet, all ended; 34 direct writes, 34 answered |
  | 11 | sync | 10 runs, 0 skipped, 17.9 s with its lock wait |
  | 12 | hours a day before a limit | Vercel 1.9 h (287 invocations a minute), Redis 1.1 h, Queues 16.1 h |
  | 4, 5, 6 direct | informational | Save p95 9.2 s, 0 BUSY of 30; alert action p95 21.4 s (4); partner / admins 37.8 s / 27.9 s |
- **Live run 3, the sign-off run, 2026-10-19 18:25–18:42 UTC: not signed off.** Script @112 / @113 (`6c1dc5f`, with
  `dropSlice`, [#103](https://github.com/puIad/vic-recruitment-2026/pull/103)), Vercel `f41499a`. Same cookies as runs 1
  and 2 (vic.rh, owner; the owner's account, admin in B.26; maroua_tassanime.amiar@, member in B.29), 4 virtual admins and
  64 virtual members opening over 2 minutes, `--writes --pending on --pending-off-at 8 --pending-end on --interview FLER.07
  --setting ALL_BINOME_WEIGHT`. Switch on 18:25:54, off 18:33:56, on again at 18:41:38 (the owner chose to leave it on).
  The minute-3 drop was refused BUSY for both binomes (the sync held the script lock); B.29's was redone by hand and landed
  at about 18:32:25, B.26 was not dropped. Put back: the run did FLER.07's Notes and `ALL_BINOME_WEIGHT`; A-1962 and
  A-1445 were refused BUSY, and A-1964 was left as "held by someone else" (its last change had been dropped, so the run
  misread its own hold); all three were put back to Open by hand at 18:43. Checked after: the four alerts Open,
  `ALL_BINOME_WEIGHT` 1, FLER.07 "hakak", FLER.16 and HR.01 empty, every cookie's pending record clear, the switch on,
  TEST_MODE on.

  | # | Mark | Run 3 | |
  |---|---|---|---|
  | 1 | calls answered ≥ 99.9 % | 2,007 / 2,059 (97.5 %): 45 member reads refused (below), 6 polls or openings past the page's 20 s, 1 test mistake (the B.29 account asked for FLER.07's form, a B.26 candidate). Without the 46: 99.7 %. No RATE_LIMIT, no "too many scripts" | miss |
  | 2 | opening p95 ≤ 5 s | admins 5.8 s (4), members 11.0 s (62 of 64 opened); p50 5.6 s / 5.2 s | miss |
  | 3 | `webState` / `webPulse` p95 ≤ 2 s / ≤ 3 s | 3.8 s / 2.8 s (p50 1.7 s / 1.5 s) | miss (`webState`) |
  | 6 | pending: partner / other admins ≤ 90 s / ≤ 4 min | partner not measurable (one member cookie; model 79 s) / 239 s (9) | pass, at the edge |
  | 7 | accept p95 ≤ 1 s | 0.96 s (6) | pass |
  | 8 | in the sheet p95 ≤ 2 min | 17.3 s | pass |
  | 9 | every accepted change ended | 6: 5 applied, 1 dropped (the owner's account on an alert vic.rh had changed seconds before; shown, then kept), 0 lost | pass |
  | 10 | switch off mid-run | no poll said on after it, no save accepted after it; 6 direct writes after it: 4 done, 2 refused BUSY (shown with Try again) | pass |
  | 11 | the sync, never skipped twice in a row | skipped 3 times in a row (18:34:25, 18:35:25, 18:36:26 UTC) behind one sync that held the script lock 3 min 48 s, and again at 18:40:25 | miss |
  | 12 | free tiers | model only (1.9 h / 1.1 h / 16.1 h); the Usage pages were not read | open |

  Informational (direct path, after minute 8): My binome Save 4.6 s, 0 BUSY (2 written, 1 conflict); alert actions 1 done
  at 52.5 s, 6 of 8 calls BUSY; Save settings 33.5 s; the other screens not measured. Busiest account: 305 calls in a minute.

  What the script's own log says (`clasp logs`, see HANDOFF › Gotchas):
  - **A member's sheet read always fails; #101 did not fix it.** Stack: `S_` (Sheets:20) ← `fmt_` ← `cell_` ←
    `candidate_` ← `sliceFromSheet_` (WebApp:230). The binome sheet opens (`memberBook_` passes); formatting its first date
    (Registered) reads the Master's TIMEZONE through `S_()`, which opens the Master, and members can't open the Master:
    Google's "You do not have permission to access the requested document." Every member whose slice is not cached gets it
    until the next sync republishes: after a failed publish (`dropSnap_`: every binome at once), a patch that missed the cache
    (maroua's own `webApply` at 18:27:22, then her refused read at 18:27:23), an evicted slice. Run 1's two refusals were the
    same. The mock lets members open the Master, so the tests pass. Fix: format the sheet's dates in the sheet's own timezone
    (`book.getSpreadsheetTimeZone()`, as `answersView_` already does), and make the mock refuse the Master to members.
  - **The sync's publish stalls under load.** Its `cycle` lines show `snap` (`publishState_`) at 161 s, 202 s and 97 s in
    three cycles (totals 205 s, 228 s, 143 s), 2–17 s in the others and 2–3 s once the run ended. Those cycles hold the script
    lock for minutes: the skipped syncs, every BUSY (the drop, the direct alert actions, the put-back) and the other admins'
    239 s come from them. Cause not found: `buildState_` makes no slow call on its own, so `publishState_` needs a time per
    step (the build, the cache reads and writes, the properties) under the same load.
  - **The publish stall, investigated (2026-10-19, script @114–@121, read-only live runs of 4, 4 and 6 min, 4 admins + 64
    members, no writes).** The cycle and action lines now carry `snapT` (ms per step of `publishState_`: `build`, `hash`,
    `meta`, `readSnap`, `bins` with `binSlices` / `binGet` / `binLoop`, `putAll`, `setProps`; inside the build `bTeamSrc`,
    `bHistory`; later runs also `ssN`/`ssMs` and `fmtN`/`fmtMs`). Read-only polling alone reproduces it: a first 4-min run had
    a cycle of 376 s with `snap` 286 s (old code, no breakdown), the 6-min run two of 12 cycles with `snap` 48 s and 64 s.
    Normal cycles: `snap` 2.5–6 s (`build` 1.7–5 s, `binSlices` 0.5–1.9 s, `readSnap` 0.03–0.2 s). In the stalled ones the
    time is in **`build` (36 s and 40 s) and `binSlices` (12 s and 23 s)**, while the steps that touch the cache and the
    properties stay small: `readSnap` 0.2 s, `binGet` 0.05–0.14 s, `binLoop` under 15 ms, `setProps` and `putAll` never above
    a second. So CacheService contention is unlikely (the reads and writes are small; `binGet`, `putAll`) and so are the two named sheet reads in
    the build (`findTeamSource_` about 1 s, `historyRows_` about 0.8 s even in the stalled cycles). `binSlices` also holds one Properties read (`binMeta_`, now timed as `binMeta`) and
    `Utilities.formatDate`; the rest of the build is `ss_()` (un-memoised: `getActive` + Properties
    read + `openById` on every call, about 20 per publish) and more `formatDate`. The stalled cycles' other phases were also
    slow in run 3 (`load` 35 s, `pull` 16 s against 4 s and 5 s), so the whole execution slows for a stretch while the page
    polls (about 3 calls a second): a Google-side slowdown of every service call in that stretch, not one slow call.
    **Not proven which call** (`ssMs` / `fmtMs` were added after the last run; the owner stopped the live runs).
  - **Fix shipped (reasoned, not measured):** `ss_()` finds the Master once per execution (`_ssOpened`), so a publish makes
    one `getActive` / Properties read / `openById` instead of about 20, which shortens the time the lock is held when every call is slow. The sync still
    holds the lock for the whole publish. Next: one more read-only run with the counters, and if `fmtMs` dominates, format
    dates in plain JS (a fixed offset per day) instead of `Utilities.formatDate`.
  - Marks 2 and 3 sit near what `scripts.run` gives: one call is about 1.5–1.7 s at the median, so an opening (three calls in
    a row) is about 5 s at the median, and a `webState` p95 under 2 s leaves 0.3 s above it. Run 2's opening burst is gone
    (admins 14.6 s → 5.8 s). Whether 5 s and 2 s fit is the owner's question.
  - The test itself: the minute-3 drop should retry until it lands, and `--interview` should go only to the account whose
    binome holds that candidate.

  **Verdict: not signed off.** The pending path holds (6–10 pass). Blocking: mark 1 (the member read and the polls past
  20 s), mark 11 (the publish stall), marks 2 and 3 (the reads). Next: fix the member read, find the publish stall, settle
  marks 2 and 3 with the owner, then a fourth run.


---

## Appendix: the evidence

From the first load test (2026-10-05), which led to tasks 1–9. Task 10 has its own numbers in its Notes.

### Verdict before the plan

| Area | Result at 100 people | Rating |
|---|---|---|
| Requests going through, each on their own account | 22,641 of 22,641 succeeded (model, realistic mix F) | **Pass** (model only; not yet measured live with separate accounts) |
| Requests going through, 25 people on one account (live) | 1,818 of 1,878 succeeded; 59 refused by Google's per-account rate limit, 1 network error | **Fails** for shared accounts (task 3 backs off; not a problem with one account each) |
| Waiting | opening 13 s p50 / 15 s p95; every refresh 9–11 s (live: 8.3 / 10.8 s) | **Not suitable** |
| Binome-sheet results on the dashboard | p50 54 s / p95 81 s | **OK** |
| Everyone acting through the Master lock (1 action / 2 min each) | 274–289 of ~375 refused | **Not suitable** (hence task 8 writes the sheets, not the Master) |
| How a refused action looks | a green success toast | **Not suitable** (task 2) |
| 100 people on one account | 70 of 100 never got a dashboard | **Never** |
| Owner's trigger time | sync 13.4 s average = 5.4 of 6 h/day | **At risk** (tasks 1, 4, 9) |
| Vercel Hobby | 2 s polls: ~270k calls/day for 100 people × 2 h (model F: 37.7 calls/s × 7,200 s; a poll takes ~1.3 s, so a person makes ~0.4 calls/s, not 1) | **Not as is**; fits at 15 s member polls |

### Live run on production

The owner, 2026-10-05 ~20:46–20:49 UTC: `node test/load.js --live https://vic-recruitment.vercel.app --cookies
cookies.txt --users 25 --minutes 3` (one account, read-only).

```
25 editors on 1 account(s), 3 min, poll 2000 ms (+webAccess each tick)
  1878 calls (10.4/s), 60 failed. First dashboard: p50 11.6s, p95 13.5s, max 16.7s (24/25 loaded)
  call              calls    ok  failed      p50     p95     p99     max
  webAccess           925   892      33    1.2s    2.1s    4.0s   44.1s
  webPulse            907   880      27    1.3s    2.1s    3.3s   49.9s
  webState             46    46       0    8.3s   10.8s   11.9s   11.9s
  errors seen: network: fetch failed | Google Apps Script refused the call (RESOURCE_EXHAUSTED).
```

- **59 of the 60 failures are a Google quota the model didn't have.** The Vercel log has the message: "Quota exceeded
  for quota metric 'Execution requests' and limit 'Execution requests per minute per user' of service
  'script.googleapis.com'". One account was making ~625 calls a minute and ~3 % were refused, so the limit is
  probably around 600 a minute per account (the exact value is in Cloud Console › APIs & Services › Apps Script API ›
  Quotas). It is per account: a member polling every 15 s makes ~4 a minute and an admin tab at 2 s ~30, far below.
  It matters only when people share an account, and for live tests (≤ 25 editors per account, as the tool says).
  The 60th failure was one network error on the tester's side.
- **25 people reading the Master at once didn't slow it down:** `webState` 8.3 s p50 / 10.8 s p95, the same as one
  person. The cost is the rebuild itself (task 5), not contention.
- **A few poll calls took 44–50 s** while p99 was 3–4 s: a real tail at Google. The page waits for them before the
  next tick, so a screen can freeze for that long (task 3's timeout).

### The real sync

Ten `syncAll` runs from Apps Script › Executions (owner, 2026-10-05): 21, 9, 17, 12, 9, 13, 26, 9, 9, 9 s. Average
13.4 s, median 10.5 s, half exactly 9 s. At one run a minute: 5.4 h of the 6 h daily trigger time.

What the code says (task 1 will show it run by run):
- **Every run (the 9 s floor):** load Interviewees, Interview Log, Binomes, Team, alerts, covers; list the Binome
  Sheets folder (32 "last updated"); open ~2–3 sheets anyway (the 15-min re-read: 32 sheets / 15 min ≈ 2 a minute,
  `REREAD_MAX` 3); write Interviewees back in full; rebuild the Tracker in full.
- **Varies:** each binome sheet edited since the last run (~1–2 s each; the sheets were being filled during these
  runs), each mail sent, new registrations or forms, and the wait for the lock behind Sync now, Check integrity or a
  dashboard action (it counts as trigger time).

### How the model works

The 2026-10-05 model, replaced by task 10's (`test/load.js` since 2026-10-19; the old one is `git show e0c375d:test/load.js`).

`test/load.js` runs N virtual editors through the real Vercel proxy (`web/api/run.js`) over HTTP, each repeating the
page's own loop (`store.ts`): open = `webAccess` → `webPulse` → `webState`; every 2 s `webAccess` + `webPulse`, and
`webState` when the Master changed; an action (`webRun quick`) now and then. Apps Script behind the proxy is a
stand-in:
- service times resampled from production (`webAccess` 0.8–1.9 s, `webPulse` 0.9–2.6 s, `webState` 6.4–10.0 s);
- [Google's limits](https://developers.google.com/apps-script/guides/services/quotas): 30 simultaneous executions per
  account, 1,000 per script, 6 h/day of trigger time; **not yet** the per-minute request limit (task 10);
- the script lock with `tryLock(30 s)` on every write and on the 1-minute sync;
- assumed: a write holds the lock 6 s, the sync 10–20 s;
- binome members edit their own sheets, one edit per member per minute on average.

### Results (model)

100 editors, 10 simulated minutes, 5× real time. My runs; the owner's reruns of A, B, F and H gave the same within
noise (A: 95 of 369 actions applied; F: opening 12.5 / 14.1 s; H: refresh 0.8 / 1.0 s).

| | A. Everyone acts every 2 min | B. A, one account | C. Everyone acts every 10 min | D. C, sync 10 s | **F. Members read, ~4 admins act** | G. F + snapshot, poll 5 s | **H. F + snapshot, poll 15 s** |
|---|---|---|---|---|---|---|---|
| Calls succeeded | 14,349 / 14,349 | 4,606 / 4,860 | 17,518 / 17,518 | 16,800 / 16,800 | 22,641 / 22,641 | 17,519 / 17,519 | 8,940 / 8,940 |
| Dashboards opened | 100 / 100 | **30 / 100** | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 |
| Opening (p50 / p95) | 12.4 / 14.9 s | 12.5 / 15.2 s | 12.3 / 14.4 s | 12.9 / 14.8 s | 13.0 / 14.8 s | 4.5 / 5.8 s | 4.6 / 5.6 s |
| Refresh `webState` (p50 / p95) | 9.2 / 10.6 s | 9.3 / 10.7 s | 9.2 / 10.6 s | 9.2 / 10.6 s | 9.2 / 10.6 s | 0.8 / 1.0 s | 0.8 / 1.0 s |
| Poll `webPulse` (p50 / p95) | 1.4 / 2.6 s | 1.4 / 2.6 s | 1.3 / 2.6 s | 1.3 / 2.6 s | 1.3 / 2.6 s | 1.4 / 2.6 s | 1.4 / 2.6 s |
| Actions applied / sent | **94 / 383** | 67 / 114 | 67 / 92 | 79 / 86 | 14 / 14 | 20 / 20 | 28 / 28 |
| Action wait (p50 / p95) | 31.6 / 37.1 s | 31.3 / 36.7 s | 30.9 / 35.4 s | 26.4 / 34.1 s | 8.3 / 14.0 s | 8.2 / 13.8 s | 8.0 / 17.9 s |
| Action → everyone's screen (p50 / p95) | 17.4 / 40.8 s | 16.9 / 39.2 s | 15.7 / 24.0 s | 15.9 / 24.0 s | 13.8 / 21.6 s | 4.8 / 7.6 s | 8.0 / 16.5 s |
| Sheet edit → screens (p50 / p95) | 102 / 173 s | 74 / 125 s | 66 / 101 s | 55 / 92 s | 54 / 81 s | 44 / 70 s | 48 / 80 s |
| Syncs run / skipped (lock busy) | **3 / 7** | 9 / 1 | 10 / 0 | 10 / 0 | 10 / 0 | 10 / 0 | 10 / 0 |
| Owner trigger time, min/day (quota 360) | **800** | **840** | **794** | **482** | 262 | 219 | 210 |
| Calls per second (= Vercel invocations) | 23.9 | 8.1 | 29.2 | 28.0 | **37.7** | 29.2 | 14.9 |

A, C, D: sync 20 s unless noted; F: 10 s; G, H: 8 s, `webState` 0.8 s, no `webAccess` per tick.

### Findings

1. **Every refresh rebuilds the whole dashboard (6–10 s)**: every tab, both forms, the change history, per person,
   each time. And the sync rewrites the Master every minute even when nothing changed, so every screen reloads every
   minute. (Tasks 4, 5.)
2. **Two calls per tick**, `webAccess` then `webPulse`, although `webPulse` already checks access. (Task 3.)
3. **One script lock serialises every Master write and the sync**: about 6–8 actions a minute for everyone together;
   past that, actions are refused and syncs skipped. (Task 8 keeps member edits off it.)
4. **A refused action looks like a success** (`store.run` shows every message as `toast.success`). (Task 2.)
5. **Requests already run as each person**; what runs on the owner's account is the triggers and their mail. (Task 9.)
6. **Vercel Hobby can't carry 2 s polls for 100 people**; 15 s member polls fit ~100 members × 1.5 h a day. (Task 7.)

**Can data be lost?** Binome sheets → Master: no (the sheet stays the source, re-read on change and every 15 min,
`saveTable_` merges by key). Forms: no (picked up by the next run). Dashboard actions: refused but shown as success
(task 2). Quota exhaustion: delay, not loss.

### How to run it

The commands of the 2026-10-05 model (`git show e0c375d:test/load.js`); today's are in [task 10](#task-10--load-test-again-then-sign-off) and the script's header.

```bash
node test/load.js --scale 5                                   # A
node test/load.js --scale 5 --accounts 1                      # B
node test/load.js --scale 5 --write-every 3000 --sync-hold 10 # F
node test/load.js --scale 5 --write-every 3000 --sync-hold 8 --pulse-ms 15000 --no-access-tick --state-ms 800  # H
```

Options: `--check` (live only), `--users`, `--accounts`, `--minutes`, `--pulse-ms`, `--write-every` (s per editor), `--write-hold`,
`--sync-hold`, `--sync-every`, `--state-ms`, `--no-access-tick`, `--out file.json`. A run that says "this machine
stalled" (sleep, power saving) inflated the calls in flight: run it again.

**Live, read-only:** copy your `vic_s` cookie (DevTools › Application › Cookies on the dashboard) into `cookies.txt`
at the repo root (git-ignored; delete it after), then
`node test/load.js --live https://vic-recruitment.vercel.app --cookies cookies.txt --users 25 --minutes 3`.
At most ~25 editors per account (Google's per-account request limit); for more, several people run it at once with
their own cookie.
`--check` makes one read-only call per cookie and prints whose session it is and when it ends (sessions last 48 h
from sign-in and are never extended); it never prints the cookie. A live run checks the same first and stops on an
ended session.
