# Load test — 100 editors at once (2026-10-05)

Question: before every binome gets the dashboard, can it take ~100 people using it at the same time, with every
request going through, no data lost, and no long waits? Tool: `test/load.js` (how to run it: [below](#how-to-run-it)).

## Verdict

**Not suitable for 100 people yet. Fine for today's handful of admins.** Nothing is lost silently in the data paths,
but people wait 10–15 s for every screen, a dashboard action can be refused while showing a green toast, and two
quotas (the owner's trigger time and Vercel Hobby) run out at this load. The fixes in [the plan](#plan) are small
and should land before the binomes get access.

| Area | What happened at 100 editors | Rating |
|---|---|---|
| Requests going through (each person on their own account) | 22,641 of 22,641 calls succeeded (realistic mix, scenario F) | **Pass** in the model; to confirm live (Sheets contention isn't modelled) |
| Wait per request | first dashboard p50 13 s / p95 15 s; every refresh 9–11 s; poll calls 1.3–2.6 s | **Not suitable** (target: refresh ≤ 2 s) |
| Results reaching the dashboard | a binome-sheet edit shows on screens after p50 54 s / p95 81 s; a dashboard action after p50 14 s / p95 22 s | **OK** when dashboard writes stay rare |
| Dashboard actions when everyone acts | 1 action / 2 min / person: **289 of 383 refused** ("Another update is already running") | **Not suitable** for members writing through the dashboard |
| How a refused action looks | a **green success toast** with the refusal text; nothing is applied | **Not suitable** (reads as saved) |
| 100 people on one Google account | 70 of 100 never got a dashboard; 254 calls refused by Google's 30-runs-per-account limit | **Not suitable**, never do this |
| Owner's trigger time (6 h/day) | measured sync: 13.4 s on average → **5.4 h/day, 89 % of the quota**; lock waits come on top | **At risk** |
| Vercel Hobby (1,000,000 invocations / month) | today's 2 s polling: 100 people × 2 h = ~270k calls a day | **Not suitable as is**; fits with 15 s member polls (plan item 6) |

## How it was tested

The real code path, end to end: 100 virtual editors run the page's own loop (`frontend/src/lib/vic/store.ts`):
open = `webAccess` → `webPulse` → `webState`; every 2 s `webAccess` + `webPulse`, and `webState` again when the Master
changed; an action (`webRun quick`) now and then, followed by a refresh. Every call goes through the real Vercel proxy
(`web/api/run.js`, sessions, cookie sealing) over HTTP. All 100 start at the same second.

Behind the proxy, Apps Script is a stand-in, because Google can't be load-tested from here without signing in as 100
people:

- **Measured:** service times are resampled from production — the proxy's own log lines (Vercel runtime logs,
  2026-10-05 19:06–19:10 UTC, owner account, 273 interviewees in the Master): `webAccess` 0.8–1.9 s, `webPulse`
  0.9–2.6 s, **`webState` 6.4–10.0 s**.
- **Google's documented limits** ([Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)):
  30 simultaneous executions per account, 1,000 per script, trigger runtime 6 h/day (Workspace), mail 1,500
  recipients/day.
- **The code's own rules:** every write and the 1-minute sync take the script lock with `tryLock(30 s)`
  (`withLock_`, Sheets.gs); a write that can't get it returns "Another update is already running".
- **Assumed (unknown, so varied):** how long a write holds the lock (6 s: it loads the whole Master like `webState`) and
  how long the 1-minute sync takes (10 s and 20 s).
- **Not modelled:** Sheets/Drive slowing down when ~100 executions read the same spreadsheet at once (peak here: 108
  at the same time). The model is therefore a *best case* for wait times; the live run measures the real one.

Each scenario: 100 editors, 10 simulated minutes, 5× faster than real time. Binome members also edit their own
sheets (one edit per member per minute on average), which the sync carries into the Master.

## Results

All times are what the person waits. "Refused" = the action was not applied.

| | A. Everyone acts every 2 min | B. A, all on one account | C. Everyone acts every 10 min | D. C, sync 10 s | **F. Realistic: members read, ~4 admins act** | G. F + proposed read path, poll 5 s | **H. F + proposed read path, poll 15 s** |
|---|---|---|---|---|---|---|---|
| Calls succeeded | 14,349 / 14,349 | 4,606 / 4,860 | 17,518 / 17,518 | 16,800 / 16,800 | 22,641 / 22,641 | 17,519 / 17,519 | 8,940 / 8,940 |
| Dashboards opened | 100 / 100 | **30 / 100** | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 |
| Open the dashboard (p50 / p95) | 12.4 / 14.9 s | 12.5 / 15.2 s | 12.3 / 14.4 s | 12.9 / 14.8 s | 13.0 / 14.8 s | 4.5 / 5.8 s | 4.6 / 5.6 s |
| Refresh `webState` (p50 / p95) | 9.2 / 10.6 s | 9.3 / 10.7 s | 9.2 / 10.6 s | 9.2 / 10.6 s | 9.2 / 10.6 s | 0.8 / 1.0 s | 0.8 / 1.0 s |
| Poll `webPulse` (p50 / p95) | 1.4 / 2.6 s | 1.4 / 2.6 s | 1.3 / 2.6 s | 1.3 / 2.6 s | 1.3 / 2.6 s | 1.4 / 2.6 s | 1.4 / 2.6 s |
| Actions applied / sent | **94 / 383** | 67 / 114 (15 quota errors) | 67 / 92 | 79 / 86 | 14 / 14 | 20 / 20 | 28 / 28 |
| Action wait (p50 / p95) | 31.6 / 37.1 s | 31.3 / 36.7 s | 30.9 / 35.4 s | 26.4 / 34.1 s | 8.3 / 14.0 s | 8.2 / 13.8 s | 8.0 / 17.9 s |
| Action → on everyone's screen (p50 / p95) | 17.4 / 40.8 s | 16.9 / 39.2 s | 15.7 / 24.0 s | 15.9 / 24.0 s | 13.8 / 21.6 s | 4.8 / 7.6 s | 8.0 / 16.5 s |
| Binome sheet edit → screens (p50 / p95) | 102 / 173 s | 74 / 125 s | 66 / 101 s | 55 / 92 s | 54 / 81 s | 44 / 70 s | 48 / 80 s |
| Syncs run / skipped (lock busy) | **3 / 7** | 9 / 1 | 10 / 0 | 10 / 0 | 10 / 0 | 10 / 0 | 10 / 0 |
| Owner trigger time, min/day (quota 360) | **800** | **840** | **794** | **482** | 262 | 219 | 210 |
| Calls per second (= Vercel invocations) | 23.9 | 8.1 | 29.2 | 28.0 | **37.7** | 29.2 | 14.9 |

A, C, D: sync 20 s unless noted; F: sync 10 s; G, H: sync 8 s, `webState` from a snapshot (0.8 s), no `webAccess` per
tick. Raw output: rerun the commands [below](#how-to-run-it).

## Findings

1. **Every refresh rebuilds the whole dashboard from the Master (6–10 s).** `webState` opens every tab, both forms
   (`FormApp.openById` ×2) and the change history (plus the baseline when a manual edit is open), for each person, every time. And because the 1-minute
   sync rewrites Interviewees and the Tracker even when nothing changed, the Master's "last edited" moves every
   minute, so all 100 dashboards reload at once, every minute: ~100 full reads of one spreadsheet in parallel. This is
   the part of the load Google is most likely to throttle, and the one the model can't price.
2. **The page polls twice every 2 s per person.** `webAccess` then `webPulse`, although `webPulse` already re-checks
   access (`access_()` in WebApp.gs) and throws "Not allowed". 100 people → ~38 calls/s → 3.3 M Apps Script executions
   and Vercel invocations per day if left open.
3. **One script lock serialises every write and the sync.** Each write holds it for the length of a full Master load.
   Capacity is about (60 − sync time) / 6 s ≈ 6–8 actions per minute *for everyone together*. Past that, writes wait
   up to 30 s and are refused, and the sync itself is skipped (A: 7 of 10), so binome-sheet results reach the
   dashboard late (A: p95 ~3 min, and some still waiting at the end).
4. **A refused action looks like a success.** On a busy lock `webRun` returns the message "Another update is already
   running…" with no result (QuickFix.gs, Members.gs, Team.gs, Integrity.gs); `store.run` shows every message as
   `toast.success`. Under load people will believe a change was saved when it wasn't.
5. **Requests already run as each visitor, not as the owner.** The production log shows one email per call, and
   `scripts.run` uses the visitor's own token, so the 30-per-account limit is per person. Scenario B shows what
   happens if they shared one account: 70 % of people never get a dashboard. What *does* run on the owner's account:
   the triggers (1-minute sync, form submit, daily digest), so the **6 h/day trigger time** and the **1,500 mails/day**
   that the triggers send. A sync averaging over 15 s (lock waits included) exhausts the 6 h and Google stops the
   triggers for the rest of the day. Measured on 2026-10-05: **13.4 s on average** ([the real sync](#the-real-sync-2026-10-05)),
   so 89 % of it is already spent. The 1-minute sync stopping at 20:10 during the 273-row feed on 2026-10-04
   ([STATUS](../STATUS.md)) may be this; Executions would show "too much computer time" if so.
6. **Vercel Hobby can't carry today's polling.** Every poll is a function invocation. Hobby includes 1,000,000 a
   month ([Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)); 100 people using the dashboard 2 h a
   day spend ~270k a day with 2 s polls. With 15 s member polls it fits for ~1.5 h a day each (plan item 6).

### Can data be lost?

Reviewed in the code, separately from the load numbers:

- **Binome sheets → Master: no loss found.** The sheet stays the source; the sync re-reads a sheet whenever Drive says
  it changed, and re-reads unchanged ones every 15 min anyway (Drive's "last updated" lags); `FILE_SEEN` is taken
  from the listing made *before* the read, so an edit during the read is picked up next time; `saveTable_` merges by
  key and keeps cells typed meanwhile. Under load it is late, never lost.
- **Forms: no loss.** Responses are stored by Google Forms; any row a run missed is picked up by the next one.
- **Dashboard actions: refused, not lost, but shown as success** (finding 4). This is the real data-loss risk.
- **Quota exhaustion: delay, not loss.** If the triggers stop for the day, nothing is routed or pulled until they
  resume; the data waits in the forms and sheets.

## Plan

In order. Phase 1 is what the binomes need before they get access; it keeps the stack (Apps Script + Sheets +
Vercel) and is a few small PRs.

**Phase 1: before giving members access** (settled with the owner on 2026-10-05)

0. **Time each step of the sync.** `runCycle_` logs one line per run: lock wait, load, sheets opened (and which),
   save, mails sent, tracker. Apps Script › Executions then shows what turns a 9 s run into a 26 s one
   ([measured runs](#the-real-sync-2026-10-05)), so it gets fixed rather than guessed.
1. **Members work from the dashboard, on their own binome only.** A `member` role: an email that is a member (or a
   live cover) of a locked binome. It never needs the Master:
   - *Who is in which binome* lives in a script property (`MEMBER_MAP`: email → binome code + sheet id), shared by
     every user of the script, persistent, rewritten only by runs that change membership (Lock, Change / Swap /
     New binome, covers, Reset) and checked by the sync.
   - *Reading*: the member's slice of the snapshot (item 2); if the cache is empty, the script reads the member's own
     binome sheet directly, which their Drive access already allows.
   - *Writing*: `webRun('memberSet', {code, field, value, seen})` runs as the member and writes the one cell in
     **their binome sheet**, the same gold columns they can type in today (Contacted, Interview Day, Time, Interview
     Done, Rating, Final Affectation, Notes). Google's own sheet protection still applies, so the dashboard can't do
     more than the member could by hand. No Master, no script lock, so 100 members never queue behind each other.
   - *No lost or silently overwritten edit*: the page sends the value it showed (`seen`); if the cell changed
     meanwhile (the partner typed in the sheet), the write is refused with "changed by someone else: here is the new
     value" instead of overwriting it. Every write answers applied or refused, never a green toast for nothing.
   - The sync carries the sheet into the Master exactly as today (that path came out loss-free), so the Master,
     alerts and timing checks stay right whichever way the member typed.
2. **Only redo what was edited; keep the rest cached.** Google has no API for a cell's edit history ("Show edit
   history" is UI-only), and edit triggers are capped at 20 per script per account (we have 32 sheets). So the
   script keeps its own edit log instead:
   - every dashboard write adds its binome to a *dirty* set (script cache); the next sync re-reads exactly those
     sheets at once, without waiting for Drive's "last updated" (which can lag minutes);
   - edits typed straight in a sheet are found as today: Drive's "last updated", plus the 15-min re-read as a safety net;
   - after each run the sync builds the dashboard state once, per binome and for the admins, hashes each part and
     rewrites only the parts whose hash changed (`CacheService.getScriptCache()`, shared by all users, 100 KB per
     key, chunked). Unedited binomes stay cached as they are. Each part's hash is its version: the page reloads only
     when its own part changed. If the cache was evicted (Google allows it), the part is rebuilt live.
3. **Write only what changed, and be sure of it.** Inside the lock, right before writing, the script reads the tab as
   it is *now* and compares each cell to what it is about to write (`saveTable_` already does this read). A cell is
   skipped only when the sheet already holds exactly that value; any doubt (types, formats, dates) counts as
   changed and is written, so an error can cost a useless write but can never leave a changed value unwritten. The
   Tracker is compared the same way. Tests: a sync with nothing new writes nothing; each kind of change (new
   registration, sheet edit, status, alert, a value typed by hand meanwhile) is written; and the existing baseline
   check (`detectEdits_`) still compares against the sheet, not against the cache.
4. **One call per tick, revocation still immediate.** Per-tick `webAccess` goes; `webPulse` does the same check
   and returns the version: for an admin the live `access_()` (Master editors, as today), for a member the
   `MEMBER_MAP` lookup. Any change of membership rewrites `MEMBER_MAP` in the same run, so a removed member gets
   "Not allowed" on the next tick (within one poll) and the page wipes what it had on screen (the existing no-access
   path). Same guarantee as the fix of 69024a1, half the calls. Poll 15 s for members (their data changes at most
   once a minute), keep 2 s for admins.
5. **Busy is an error.** When the lock isn't free, `webRun` throws a `BUSY` error; the page shows a red toast with
   "Try again", and quick actions retry once on their own (safe: a refused action did nothing, the lock is taken
   before any change).
6. **Vercel stays on Hobby** (the owner's call: a 300-person event with registrations and payments fit it). For
   scale: at 15 s polls a member costs ~4 invocations a minute, so 1,000,000 a month is ~100 members × 1.5 h a day.
   Check Vercel › Usage after the first week of interviews; if it runs high, members poll every 30 s.

**Phase 2: spread what runs on one account (your suggestion)**

7. **Triggers on a club account, not the personal one.** Install the sync, form and digest triggers from
   `vic.rh@g.enp.edu.dz` (`TRIGGER_OWNER`): its own 6 h/day of trigger time and 1,500 mails/day, and the handover
   needs it anyway ([vercel.md](vercel.md#still-open)). If the sync is still long, a second club account can own the
   digest and mail trigger. Dashboard calls need no change: they already run as each person.
8. **Keep the sync under ~10 s on average** (items 0, 2, 3). Measured: 13.4 s, i.e. 89 % of the 6 h
   ([below](#the-real-sync-2026-10-05)). If it can't get there, sync every 5 min (`SYNC_EVERY_MINUTES` allows
   1 / 5 / 10 / 15 / 30): dashboard writes don't wait for it (item 2's dirty set is read at the next run).

**Phase 3: only if admin actions pile up**

9. **An action queue for admin actions.** Only if admins ever act often enough to queue on the lock (scenario A):
   the page writes the action with an id into a queue, one worker applies it in order, the page shows pending →
   done. Members don't need it: item 1 writes their binome sheet without the lock.

**Later (next year):** keep the records in a real database (e.g. Postgres) with Sheets as an export, if the club
wants the dashboard to be the only place people work.

### Done when (re-run both modes after Phase 1)

- 100 % of calls answered; no refused action shown as a success.
- Open the dashboard p95 ≤ 5 s; refresh p95 ≤ 2 s (live, not just the model).
- Binome-sheet edit → dashboards p95 ≤ 2 min.
- `syncAll` ≤ 4 h/day of trigger time in Executions (headroom under 6 h).
- Vercel invocations for 100 people × 2 h/day within the plan.

## The real sync (2026-10-05)

Ten `syncAll` runs read from Apps Script › Executions by the owner: 21, 9, 17, 12, 9, 13, 26, 9, 9, 9 s. Half are
exactly 9 s; average 13.4 s, median 10.5 s. At one run a minute that is **5.4 h of the 6 h daily trigger time**: one
busy afternoon, or dashboard actions holding the lock, and Google stops the triggers until the next day.

The owner's theory: a clean run takes 9 s, and something holds the others back. The code agrees on the floor and
points at what varies, so the extra is probably work rather than a fault; plan item 0's timing line will tell:

- **Fixed, every run (the 9 s):** load Interviewees / Log / Binomes / Team / alerts / covers; list the Binome Sheets
  folder (32 "last updated"); open ~2–3 sheets anyway (the 15-min re-read: 32 sheets / 15 min ≈ 2 a minute,
  `REREAD_MAX` 3); write Interviewees back in full; rebuild the Tracker in full.
- **Varies:** each binome sheet edited since the last run is opened and read (~1–2 s each; the sheets were being
  filled during these runs); mails (each alert or new-interviewee mail is one `MailApp` call); new registrations or
  interview forms; and **waiting for the lock** behind a Sync now, Check integrity or dashboard action, which counts
  as trigger time too.
- Items 2 and 3 shrink both: no full rewrite of Interviewees and the Tracker when nothing changed, and edited sheets
  are known instead of found.

## How to run it

Model (no Google needed, ~2 min per run):

```bash
node test/load.js --scale 5                                   # A
node test/load.js --scale 5 --accounts 1                      # B
node test/load.js --scale 5 --write-every 3000 --sync-hold 10 # F (realistic)
node test/load.js --scale 5 --write-every 3000 --sync-hold 8 --pulse-ms 15000 --no-access-tick --state-ms 800  # H
```

Options: `--users`, `--accounts`, `--minutes`, `--pulse-ms`, `--write-every` (s per editor), `--write-hold`,
`--sync-hold`, `--sync-every`, `--state-ms`, `--no-access-tick`, `--out file.json`. A run that says "this machine
stalled" (laptop sleep, power saving) inflated the calls in flight: run it again.

**Live, on production (read-only: it never writes).** It measures what the model can't: Google slowing down under
concurrent reads.

1. Sign in on https://vic-recruitment.vercel.app, open DevTools › Application › Cookies, copy the value of `vic_s`
   into `cookies.txt` at the repo root (git-ignored). It is your session: don't share it, delete the file after.
2. Stay under Google's 30 runs per account: `node test/load.js --live https://vic-recruitment.vercel.app --cookies cookies.txt --users 25 --minutes 3`
3. For 100: four admins run step 2 at the same time, each with their own cookie (25 each).
4. It costs ~2,000 Vercel invocations per person-run and runs as you (no trigger time).
