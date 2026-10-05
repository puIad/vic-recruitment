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
| Owner's trigger time (6 h/day) | 1-min sync of 20 s → 800–840 min/day; of 10 s → 262–482 min/day depending on lock waits | **At risk**: measure the real sync length |
| Vercel Hobby (1,000,000 invocations / month) | 100 open dashboards = 38 calls/s = ~270k calls for 2 h of use by everyone | **Not suitable**: one allowance lasts ~4 days |

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
   triggers for the rest of the day. The 1-minute sync stopping at 20:10 during the 273-row feed on 2026-10-04
   ([STATUS](../STATUS.md)) is worth checking against this in Apps Script › Executions.
6. **Vercel Hobby can't carry it.** Every poll is a function invocation. Hobby includes 1,000,000 a month
   ([Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)); 100 people using the dashboard 2 h a day
   spend ~270k a day today (~110k with the plan's polling). [decisions.md](decisions.md) says the project is on Hobby;
   check Vercel › Usage.

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

**Phase 1: before giving members access**

1. **Members read, they don't edit the Master.** Add a `member` role to `access_()`: an email in a locked binome may
   read, and `webState` returns only that binome. Members keep writing in their binome sheet: Google Sheets'
   own multi-user editing is the most reliable write path available (no script lock, no quota of ours), and it is
   the path that came out loss-free. Do not make 100 people editors of the Master.
2. **Serve reads from a snapshot.** The sync, which already holds the whole context once a minute, saves the dashboard
   state to `CacheService.getScriptCache()` (shared by all users; split into 100 KB chunks) with a version number.
   `webState` returns the snapshot (target < 1 s, scenarios G/H) and filters it for a member; `webPulse` returns the
   version. If the cache is empty, build it live as today.
3. **Stop moving the Master when nothing changed.** `saveTable_` and `buildTracker_` write only when a value differs.
   This ends the every-minute reload of all 100 screens and shortens each sync (trigger time).
4. **Poll less.** Drop the per-tick `webAccess` (handle `webPulse`'s "Not allowed" as revoked: same guarantee, half
   the calls); 15 s for members, whose data changes at most once a minute; keep 2–5 s for admins if wanted.
5. **Busy is an error.** When the lock isn't free, `webRun` throws a `BUSY` error; the page shows a red toast with
   "Try again", and quick actions retry once on their own (safe: a refused action did nothing, the lock is taken before any change).
6. **Vercel Pro for the recruitment weeks** (October–November) or confirm the usage fits Hobby after item 4.

**Phase 2: spread what runs on one account (your suggestion)**

7. **Triggers on a club account, not the personal one.** Install the sync, form and digest triggers from
   `vic.rh@g.enp.edu.dz` (`TRIGGER_OWNER`): its own 6 h/day of trigger time and 1,500 mails/day, and the handover
   needs it anyway ([vercel.md](vercel.md#still-open)). If the sync is still long, a second club account can own the
   digest and mail trigger. Dashboard calls need no change: they already run as each person.
8. **Measure the real sync now.** Apps Script › Executions, `syncAll`, with 273 interviewees and 32 sheets. Over 15 s
   on average → trim it, or sync every 5 min (`SYNC_EVERY_MINUTES` allows 1 / 5 / 10 / 15 / 30), at the cost of
   slower results on screen.

**Phase 3: only if members must write through the dashboard**

9. **An action queue.** The page writes the action with an id into a queue (a short lock, no full Master load); one
   worker applies the queue in order; the page shows pending → done. No action is ever refused. Not needed while
   members write in their sheets.

**Later (next year):** keep the records in a real database (e.g. Postgres) with Sheets as an export, if the club
wants the dashboard to be the only place people work.

### Done when (re-run both modes after Phase 1)

- 100 % of calls answered; no refused action shown as a success.
- Open the dashboard p95 ≤ 5 s; refresh p95 ≤ 2 s (live, not just the model).
- Binome-sheet edit → dashboards p95 ≤ 2 min.
- `syncAll` ≤ 4 h/day of trigger time in Executions (headroom under 6 h).
- Vercel invocations for 100 people × 2 h/day within the plan.

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
