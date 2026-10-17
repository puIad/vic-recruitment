# Member access: live tests (sign-in, and trying to break into the admin side)

Manual checks on the live dashboard (https://vic-recruitment.vercel.app) for the member role (load-test plan, tasks 6
and 7). The mock can't check these because they depend on Google: a non-editor running the script through `scripts.run`, real sharing and the real cache.
Tick each box and write what you saw next to anything that fails.

**Expected everywhere:** a member sees their own binome and nothing else (read-only, unless the binome is opened with Edit: then only its own columns, written into its sheet). Every admin entry point answers
`Not allowed` and the Master stays unchanged.

## Before you start

- [ ] **A member account:** an `@g.enp.edu.dz` account that is in a locked binome (ACTIVE or PAUSED) and is **not** an
      editor or owner of the Master. Write down its binome code: `B.__`.
- [ ] **An admin account** (yours) in a second browser or a private window, to watch the Master and to remove the member at
      the end.
- [ ] As admin, press **Sync now** once. The sync publishes each binome's slice to the cache (`MEMBER_MAP` and `SNAP_BIN`).
      Without it a member reads their sheet directly, and with Test mode on nothing is shared, so they'd only see
      "Your binome sheet isn't shared with you yet". That's correct, but it tests less.
- [ ] **Open the binome to them** (since the follow-up to task 8): a member gets the dashboard only while they can open
      their binome sheet. Before this step, signing in as the member shows "Binome B.__ isn't open yet". As admin: Binomes ›
      the binome's ⋯ menu › **Sheet & dashboard access…** › View (read-only page) or Edit (fills in from My binome). No email
      is sent, even in Test mode. Check in Drive that the sheet's sharing lists both members, and that no email arrived.
      Close it again at the end (No access): the member drops to the gate at their next poll (~15 s).
- [ ] Note the Master's state so you can compare it at the end: the Interviewees count, the open alerts count, the Settings
      values, the Binomes tab (or keep the Master open in the admin window).

## A. Signing in

| # | Do | Expect | ✓ |
|---|---|---|---|
| A1 | Sign in with the member account | Google's consent screen lists the same permissions as for admins (Sheets, Drive, Forms, mail, triggers). That's expected, because `scripts.run` needs every scope the script uses | ☐ |
| A2 | After sign-in | The **Binome B.__** page. The sidebar shows only My binome, Account, Appearance and My binome sheet. The header shows Live status, palette and theme, but **no** search, alerts bell or Sync now. Opened with **View**: the header says "Binome B.__ · read-only", a blue note says you can view for now, and a candidate's panel has no fields to fill. Opened with **Edit**: the header says "· you can edit" and the panel's "Your interview" block has fields that save to the sheet. Check both: start with View, switch the binome to Edit, and the page follows at the next poll (~15 s) | ☐ |
| A3 | Look at the page | Only your binome's candidates, members and open alerts (only these types: Not contacted in time, No interview date, Interview overdue, Date looks wrong, Odd value in a sheet). The counts match the binome's sheet | ☐ |
| A4 | Click a candidate's code | The details panel shows every column of the binome sheet. "Open my binome sheet" opens **your** sheet | ☐ |
| A5 | Sidebar account row, then Settings › Account | "Member of B.__". The Account card says Member, not Editor or Owner | ☐ |
| A6 | DevTools › Network, filter `api/run`, wait 1 minute without touching anything | One `webPulse` call every ~15 s and nothing else (no `webAccess`, no `webState`, unless the binome changed) | ☐ |
| A7 | As admin, edit something for this binome (e.g. type in its sheet), then Sync now | Within ~15 s of the sync finishing, the member page updates by itself (the header's ring turns once) | ☐ |
| A8 | Light/dark toggle, palette, phone width | The page stays readable. The table scrolls sideways on a phone and the page itself doesn't | ☐ |
| A9 | *(optional, cold cache)* Wait until the cache expires (6 h), or test right after a script deploy, then reload | Either the page with the blue "Read straight from your binome sheet" note (only if the sheet is shared with them), or the "Your binome sheet isn't shared with you yet" screen with Try again. No admin data either way | ☐ |

## B. Trying to reach admin pages in the UI

While signed in as the member, type each address into the address bar:

| # | URL | Expect | ✓ |
|---|---|---|---|
| B1 | `/alerts`, `/binomes`, `/interviewees`, `/team` | Sent back to My binome (`/`) | ☐ |
| B2 | `/maintenance`, `/schedule`, `/analytics`, `/desk`, `/help` | Sent back to `/` | ☐ |
| B3 | `/settings/general`, `/settings/timing`, `/settings/sharing`, `/settings/connections`, `/settings/history` | Sent back to `/` | ☐ |
| B4 | `/settings/account`, `/settings/appearance` | Open (they're the member's own) | ☐ |
| B5 | Press Ctrl K | Nothing opens (no command palette for members) | ☐ |
| B6 | The old Apps Script dashboard: https://script.google.com/macros/s/AKfycbzxnJu_H6deI9m77t-VjiyLNgmwY4gyzmWoNr-a62PCGB69o301SePMxUGMIlVgMjgT/exec | A one-line page linking to the Vercel dashboard, never a dashboard | ☐ |
| B7 | The Master's URL (from an admin's Google files) | Google refuses it or shows it read-only. If the member can **edit** the Master, they're an admin by definition: stop, the account is wrong for this test | ☐ |
| B8 | Another binome's sheet URL | Google refuses it (with Test mode on, nothing is shared at all) | ☐ |

The UI only hides things. The real lock is the script, which section C tests.

## C. Calling the API directly (DevTools console)

Signed in as the member, on https://vic-recruitment.vercel.app, open DevTools › Console and paste the snippets.
The proxy requires the `X-Vic: 1` header, which the page sends too.

> **Safety.** The first snippet stops if the account isn't a member. Run nothing in C from an admin account: C2 calls
> every action, including Reset all binomes. Even as a member, C2 sends only harmless arguments (dry runs, a wrong
> reset phrase) in case a check is ever missing.

**C1. Who am I, and what does `webState` give me?**

```js
const rpc = async (fn, args = []) => {
  const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json", "X-Vic": "1" }, body: JSON.stringify({ fn, args }) })
  return r.json()
}
const who = (await rpc("webAccess")).value
console.log("webAccess", who)
if (who?.role !== "member") throw new Error("STOP: this account is not a member (" + who?.role + "). Don't run C2 from it.")
const st = await rpc("webState")
const s = st.value
console.log("webState keys", Object.keys(s || {}).sort().join(", "), st.error || "")
const allowed = ["alerts", "binome", "candidates", "cover", "edit", "fileUrl", "fromSheet", "members", "role", "status", "tag", "user", "v"]
const extra = Object.keys(s || {}).filter((k) => !allowed.includes(k))
const codes = new Set((s?.candidates || []).map((c) => String(c.Code)))
const strayAlerts = (s?.alerts || []).filter((a) => a.code && !codes.has(a.code))
console.table({ role: s?.role, binome: s?.binome, candidates: codes.size, alerts: s?.alerts?.length, extraKeys: extra.join(", ") || "none", alertsForOtherCodes: strayAlerts.length })
```

| Expect | ✓ |
|---|---|
| `webAccess`: `ok: true`, `role: "member"`, `binome: "B.__"`, `owner: false` | ☐ |
| `webState` keys are exactly the `allowed` list: `extraKeys: none`, so no `settings`, `team`, `teamList`, `binomes`, `interviewees`, `history`, `links`, `counts` | ☐ |
| `binome` is the member's own, `alertsForOtherCodes: 0` | ☐ |
| `webPulse` (run `await rpc("webPulse")`) returns a number, no error | ☐ |

**C2. Every admin action must be refused** (paste after C1, in the same console):

```js
const actions = {
  sync: { budgetMs: 1000 }, integrity: { budgetMs: 1000 }, digest: {}, lockCheck: {}, reshare: { dryRun: true },
  editApply: { ids: [] }, editRevert: { ids: [] }, editAccept: { ids: [] }, resolve: { ids: [] },
  importTeam: { link: "", dryRun: true }, draft: { dryRun: true }, lock: { dryRun: true },
  resetBinomes: { phrase: "this is not the phrase" }, setup: {}, saveSettings: { values: {} },
  reassign: { dryRun: true }, changeMember: { dryRun: true }, swapMembers: { dryRun: true },
  newBinome: { dryRun: true }, addCover: { dryRun: true }, endCover: { dryRun: true }, quick: { op: "locate" },
  binomeAccess: { binome: "B.00" },
}
const out = []
for (const [a, args] of Object.entries(actions)) {
  const r = await rpc("webRun", [a, args])
  out.push({ action: a, refused: /Not allowed/.test(r.error || ""), answer: r.error || JSON.stringify(r.value).slice(0, 80) })
}
console.table(out)
console.log(out.every((x) => x.refused) ? "PASS: all 23 refused" : "FAIL: see the rows with refused=false")
```

| Expect | ✓ |
|---|---|
| All 23 rows `refused: true` with `Not allowed`, and the log says **PASS** | ☐ |

**C3. Functions the proxy doesn't expose:**

```js
for (const fn of ["runCycle_", "resetBinomesCore_", "access_", "doGet", "publishState_"]) console.log(fn, await rpc(fn))
```

| Expect | ✓ |
|---|---|
| Each answers `Not exposed: …` (HTTP 400, refused by Vercel before it reaches Google) | ☐ |

**C4. Without the header or from another site:**

```js
console.log(await (await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fn: "webState", args: [] }) })).json())
```

| Expect | ✓ |
|---|---|
| `Bad origin` (403). A page on another site can't call the API with the member's cookie | ☐ |

## D. After the attacks: nothing changed

As admin:

| # | Check | Expect | ✓ |
|---|---|---|---|
| D1 | Interviewees, Binomes, Team tabs and Settings | Same as noted under "Before you start" | ☐ |
| D2 | Alerts | No new alert, nothing resolved or accepted by the member's calls | ☐ |
| D3 | Settings › Change history, Member Changes tab | No new row | ☐ |
| D4 | Apps Script › Executions | The member's runs are `webAccess` / `webState` / `webPulse` / `webRun` that failed fast with "Not allowed". None ran for long | ☐ |
| D5 | No mail sent (Test mode: check the admins' inboxes for a digest or "you joined…") | None from the member's calls | ☐ |

## E. Losing access

| # | Do | Expect | ✓ |
|---|---|---|---|
| E1 | Keep the member's tab open. As admin, **Change members** to take them out of B.__ (put in someone else, or swap) | Within ~15 s the member's tab shows the no-access screen ("This account can only view the project" or "doesn't have access"), and the page's data is gone | ☐ |
| E2 | In the member's console, run C1 again | `webAccess` `ok: false`. `webState` and `webPulse` answer `Not allowed` | ☐ |
| E3 | Put them back (Change members again), then reload their tab | My binome again | ☐ |

## F. Other roles (if you have the accounts)

| # | Account | Expect | ✓ |
|---|---|---|---|
| F1 | A **cover** (Add cover on some codes of a binome) | Their page says "You're a cover". They see only the covered codes and those codes' alerts, read-only. C2 still all refused | ☐ |
| F2 | A cover whose cover is ended (End cover) | No-access screen within ~15 s, unless they're also in a binome of their own (then their own binome) | ☐ |
| F3 | An **admin who is also in a binome** | The full admin dashboard, never My binome | ☐ |
| F4 | An admin removed from the Master's editors who is still in a binome | Moves to My binome at the next change, with no admin page left on screen | ☐ |
| F5 | An `@g.enp.edu.dz` account in no binome and not an editor | The no-access screen. C1 stops at "not a member" | ☐ |
| F6 | A non-ENP Google account | "Use your ENP account" | ☐ |

## If something fails

Write the row number, the account (not the password), the time, and what you saw (a screenshot or the console output)
under task 7's Notes in [load-test.md](load-test.md#task-7--my-binome-page-read-only-and-member-polling). Any admin data
reaching a member, or any C2 row with `refused: false`, is a security bug. To shut members out at once, delete the
script property `MEMBER_MAP_N` (Apps Script › Project settings › Script properties); members drop to no access at their
next poll. That only lasts until the next sync, which rewrites the map, so keep doing it, or pause the sync trigger, until
a fix is deployed.
