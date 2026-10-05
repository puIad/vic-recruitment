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
| 3 | [Polling: one call per tick, a timeout, rate-limit backoff](#task-3--polling-one-call-per-tick-a-timeout-rate-limit-backoff) | S–M | 2 | ☐ |
| 4 | [Write only what changed](#task-4--write-only-what-changed) | M | 1 | ☐ |
| 5 | [Admin dashboard served from a cached snapshot](#task-5--admin-dashboard-served-from-a-cached-snapshot) | M–L | 4 | ☐ |
| 6 | [Member role in the script (read side, security)](#task-6--member-role-in-the-script-read-side-security) | L | 5 | ☐ |
| 7 | [My binome page (read-only) and member polling](#task-7--my-binome-page-read-only-and-member-polling) | M | 3, 6 | ☐ |
| 8 | [Members edit their binome from the dashboard](#task-8--members-edit-their-binome-from-the-dashboard) | L | 7 | ☐ |
| 9 | [Triggers on the club account](#task-9--triggers-on-the-club-account) | S | 1 | ☐ |
| 10 | [Load test again, then sign off](#task-10--load-test-again-then-sign-off) | M | 3, 5, 8, 9 | ☐ |

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
  every 2 s.
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

---

## Task 10 — Load test again, then sign off

**Read first.** `test/load.js`, this file's [appendix](#appendix-the-evidence), tasks 1–9's Notes.

**Do.**
- Update the model in `test/load.js` to the new behaviour: Google's per-account limit on execution requests
  (`RESOURCE_EXHAUSTED`; about 600 a minute inferred from the live run, or the real value from Cloud Console › APIs &
  Services › Apps Script API › Quotas); one call per tick; members polling 15 s and editing through `memberSet`
  (document lock, no script lock); admins polling 2 s; `webState` and sync times from the live logs of tasks 4–5.
- Run the model (100 people: ~95 members, ~5 admins), and live: four admins at once, each with their own cookie and
  25 editors (`--users 25`), read-only, 5 minutes.
- Write the results in the appendix and compare with the targets below.

**Done when** (all of them):
- 100 % of calls answered; no refused action shown as a success.
- Opening the dashboard p95 ≤ 5 s; a refresh p95 ≤ 2 s, measured live.
- A member's edit on the partner's screen p95 ≤ 20 s; a binome-sheet edit on screens p95 ≤ 2 min.
- `syncAll` ≤ 4 h/day of trigger time (≈ 10 s average), from task 1's lines.
- Vercel Usage on track for the month on Hobby.

Then the owner decides to open the dashboard to the binomes (STATUS.md, launch steps).

**Notes.**

---

## Appendix: the evidence

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
