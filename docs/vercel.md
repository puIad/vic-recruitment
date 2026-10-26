# Vercel — sign-in, the API proxy, the project

Live since 2026-10-01 at https://vic-recruitment.vercel.app; serves the `frontend/` UI since 2026-10-03
([frontend.md](frontend.md)). IDs and env vars: [reference.md](reference.md); why: [decisions.md](decisions.md).

## Request flow

```
Browser ── GET /api/login ──► Google (hd=g.enp.edu.dz, select_account, PKCE, state)
        ◄── /api/callback: exchange code → check id_token (hd, email_verified) → set cookie `vic_s`
                              (AES-GCM{ email, refresh_token, access_token, at_exp, iat })
Browser ── POST /api/run {fn, args} (same-origin, cookie, X-VIC header) ──► Vercel function
        Vercel: decrypt cookie → 48h check → refresh access token if < 5 min left
             → POST script.googleapis.com/v1/scripts/{SCRIPT_API_DEPLOYMENT_ID}:run  (Bearer = visitor's token)
        Apps Script (as the visitor): webAccess / webState / webPulse / webRun → access_() → work
        ◄── result | {error} ; Vercel re-sets the cookie if the token was refreshed
```

## Files

```
web/                the Vercel project root
  api/login.js      Google auth URL: PKCE + state in a 10-min HttpOnly cookie, hd, prompt=select_account, offline access
  api/callback.js   verifies state, exchanges the code, checks id_token hd/email_verified, writes the session cookie
                    (reuses this browser's stored refresh token for the same account, after one test refresh)
  api/run.js        the proxy: allowlist {webAccess, webState, webPulse, webRun}, Origin + X-VIC check, 48h check,
                    token refresh, scripts.run, maps script errors to JSON, logs email/action/ms/ok; a connection to
                    Google lost mid-run answers 502 code LOST ("it may have finished anyway: refresh before
                    trying again") and logs its cause (#88); also the
                    pending-changes accept step (fn accept), drop answers (pendingMark) and the pulse flag (rec)
  api/apply.js      the queue consumer (topic vic-apply): applies an author's pending changes through webApply, as them
  api/drops.js      the sync's call each cycle (slice 4), guarded by DROPS_SECRET: sweeps entries past their apply-by into
                    drops, takes back what the last sync mailed, returns the drops due an email and the authors due a
                    DROPPED|<email> admin alert
  lib/pending.js    the author's record in Upstash Redis (REST pipeline), the accept step, the queue publish, the sync's sweep
  api/logout.js     marks this browser signed out; never revokes, so signing back in skips consent
  lib/session.js    AES-256-GCM seal/open (node:crypto), cookie helpers
  package.json      one dependency, @vercel/queue (Vercel installs it in web/)
  vercel.json       buildCommand (npm --prefix ../frontend ci && … run build), outputDirectory dist, a rewrite of every
                    non-/api/ path to /index.html (deep links and reloads), maxDuration 300 for api/run.js, security
                    headers (CSP with font-src 'self' for the self-hosted Gilroy, frame-ancestors none, no-referrer)
  dist/             the built UI (git-ignored; Vite writes it from frontend/)
```

## Vercel project settings

Set in the Vercel dashboard (Settings › General), not visible from the API; keep them as they are:

- **Root Directory `web`.** Clearing it makes Vercel build the repo root, which has no `api/`: the whole site 404s
  (happened on 2026-10-03).
- **Include source files outside of the Root Directory: on.** The build reads `../frontend`.
- Node 24.x, Framework Preset *Other*, no Build Command / Output Directory override (it would win over `vercel.json`).

Production deploys `main` on every push; previews are SSO-protected and sign-in only works on production, so a preview
proves the build, not the sign-in. **Rollback:** Vercel › Deployments › a previous production deployment › Instant
Rollback (seconds, no git).

**Doc-only pushes don't build.** `ignoreCommand` in `web/vercel.json` runs in `web/` and skips the build (exit 0, the
deployment shows CANCELED, production stays put) when nothing under `web/` or `frontend/` changed since
`$VERCEL_GIT_PREVIOUS_SHA`, the last successful deployment of the branch. An empty or unknown SHA (a branch's first
deployment, a shallow clone) builds. So on Hobby an Instant Rollback after a doc push still lands on the last real
release. A Redeploy of the commit that is already live also builds: HEAD equals `$VERCEL_GIT_PREVIOUS_SHA` (Vercel
sets no variable that marks a redeploy), so a new env var such as `DROPS_SECRET` takes effect without a code change.
Redeploy the current production deployment, not a canceled doc push. Any other path a build reads must be added to
the `git diff` paths.

**`pr-screenshots/*` branches.** PR screenshots live on never-merged orphan branches that hold only images (PR bodies
link them by sha, so never delete them). Each push starts a preview that fails with *Root Directory "web" does not
exist*: harmless, it never touches production. Vercel reads `vercel.json` from the pushed commit, so a rule on `main`
can't reach them. To skip the preview, put a `web/vercel.json` holding `{ "git": { "deploymentEnabled": false } }` in
the screenshot commit's tree next to the images.

**`DROPS_SECRET`** (env var, Production): a long random string, the same value as the script property `DROPS_SECRET`.
Unset on Vercel, `api/drops.js` answers 503; unset in the script, the sync never calls it. Rotate both together.

**The scope `script.external_request`** (the sync's `UrlFetchApp` call) is in the sign-in's `SCOPES` before it is in
`appsscript.json`: `scripts.run` refuses a token missing any scope the script declares. Once the script has it, a
token from before (the cookie's access token, a stored refresh token) is answered `SIGNED_OUT` ("one more Google
permission"), and the next sign-in shows Google's screen once. The consumer drops such a change as "sign-in ended",
with Apply mine anyway. `vic.rh` re-authorizes the triggers by running Setup after the script deploy.

## Free limits and what spends them

Checked 2026-10-19. **Vercel Hobby**: 1,000,000 function invocations, 4 CPU-hours active and 360 GB-hours memory a month; past a
limit the feature waits until 30 days have passed. **Upstash Free**: 500,000 commands a month, 10,000 a second.
The invocations are the number to watch (Vercel › Usage); CPU and memory grow with them.

- Every poll is one invocation (`api/run.js` → Google), a refresh is two (`webPulse` + `webState`), the sync's `api/drops` one a minute (~43k a month idle).
- Polls: admins every 5 s, members every 30 s (`PULSE_MS`, `MEMBER_PULSE_MS` in `store.ts`; `test/load.js` mirrors them). A hidden
  tab does not poll and refreshes once on return. An open tab nobody touches polls 4× slower after 3 min and stops after 15 min
  until the next mouse, key or scroll (then one poll and the record are read at once).
- `webAccess` / `webPulse` end at Google after 25 s (the page drops them at 20 s); before, a hung one ran to 285 s.
- Redis: the record rides on a poll only while the author has changes pending (admins every 2nd poll, members every poll), and
  on a refresh only at the start of a visit or a tab return. The sync's sweep reads the set `pcx` (authors with a pending or
  unaddressed dropped entry, added by `save`, removed by the sweep) instead of every `pc:*` key, which kept ~65 authors for
  30 days and cost ~65 commands a minute. Records written before 2026-10-19 that were still pending or unanswered when this shipped are not in `pcx`.
- Day estimate (owner, 2026-10-19: 65 members × 45 min, 4 admins × 3 h): about 37k invocations before, about 18k after (idle backoff not counted).

## Rules worth knowing

- **Access is re-checked by the script on every call** (`access_()` in WebApp.gs): ENP account + editor/owner of the
  Master. An account removed from the Master gets "No access" (Drive is asked, since the bound script would still open it).
- **Versions:** `API_VERSION` in WebApp.gs and `frontend/src/lib/vic/types.ts` must match (`test/vercel.test.js`
  checks); bump both when `webAccess` / `webState` / `webRun` change shape. Adding a field or an action doesn't need a bump.
- **Long actions** pass a budget so they end before the 300 s limit: Lock 200 s, Check integrity 200 s
  (counted from the call, lock wait included). Each resumes on the next press.
- **Sign-in, per browser:** cookie `vic_s` (30 days) HttpOnly/Secure/SameSite=Lax; `iat` = the latest Google sign-in on
  that browser, `now - iat > 48h` = ended there. Ending (48 h or sign-out) never revokes: the cookie keeps
  `{email, rt, iat}` and the person's other browsers keep running. The next sign-in on that browser reuses the stored
  refresh token when Google sends none (same verified email, one test refresh first; refused = the consent screen) and
  restarts the 48 h. A different account signing in revokes the outgoing grant only inside its 48 h (signed out or not),
  which ends that person's sign-ins everywhere; past it, the cookie is overwritten with no revoke.
  With that person's changes still pending (from any device), the revoke waits ([slice 5](plans.md#slice-5-token-edges)):
  the callback sets `pcr:<email>` ("revoke when done", 2 h) and the consumer revokes with the last change's access token
  once none is left pending. Nothing pending, or Redis unreadable, revokes at once. Every sign-in deletes the incoming
  person's `pcr:` key, so an old revoke never cuts a fresh sign-in. Sign out and Switch account wait for a save still
  being accepted; with changes still pending both land on the sign-in screen, which says how many keep saving.
- **Kill switch:** refresh tokens stay live at Google until 6 months unused, so it takes both: rotate `SESSION_KEY`
  (every cookie unreadable) **and** the OAuth client secret (every refresh token useless).
- **Settings pages** write through `webRun('saveSettings')` into the Settings tab. `SETTING_UI` in
  `frontend/src/lib/vic/settings-ui.ts` maps key → label, help line, icon and control (dropdown choices in `CHOICES`, which
  `test/vercel.test.js` checks against the script's `SETTING_ENUMS`): add a row there when adding a setting to
  `SETTINGS_DEFAULTS`.
- Tokens never reach browser JS and are never logged.
- **Pending changes** ([plans.md](plans.md#slice-2-alert-actions-end-to-end), slice 2: the four alert actions; [slice 3](plans.md#slice-3-save-settings-and-my-binome-fields):
  Save settings for admins and My binome fields for members; since 2026-10-26 also an admin's Experienced tick on the
  Pairing panel and the alerts' Fix of Contacted or the interview date and time). Off until
  the owner turns them on in Settings › General (script property `PENDING_CHANGES`); off = no Redis call and no message (a sign-in still deletes its `pcr:` key).
  - The accept step in `api/run.js` refreshes the token when under 30 min is left, writes the author's Redis record first
    (hash `pc:<email>`, one field per cell: `alert:<id>`, `setting:<key>`, `field:<code>:<column>`, `team:<email>`,
    `bfield:<code>:<column>`), then publishes one message to Vercel Queues (topic `vic-apply`, 2 h retention)
    carrying `seal({email, at, ate})` and the change ids. The token is never in Redis or the logs. Either write failing =
    that save is a direct write (code `DIRECT`); another change format = code `FORMAT` (the page asks for a reload).
  - The consumer `api/apply.js` (`experimentalTriggers` queue/v2beta in `vercel.json`, no max concurrency: it would count
    each delivery twice) reads the changes from the record, never from the message, makes at most one `webApply` call per
    author per minute (Redis key `pcl:<email>`) carrying all their pending changes, and marks each applied or met for
    10 min, or dropped. Retries back off from 60 s; none starts with under 6 min of token life (then: dropped, "retries
    ran out"). 401 = dropped "sign-in ended before it was saved"; lost access drops every pending change of that author.
  - Audit fixes, 2026-10-19 (the 2026-10-19 audit of this path):
    - `accept` and `pendingMark` need a session that `webAccess` let in: `run.js` re-seals the cookie with `acc` when
      `webAccess` answers ok (and drops it when it stops), and any other verified ENP account gets `DIRECT`. A record holds
      at most 300 live cells (`MAX_CELLS` in `pending.js`); more is `DIRECT`.
    - A change typed back on a pending cell keeps a put-back entry (value = the original seen) instead of deleting the cell.
      When the consumer ends an entry that applied or was met and the cell now holds a newer pending entry, `end()` saves
      that entry with `seen` = what was written, so an undo or a second edit made during `webApply` is judged against it.
    - The consumer retries a 403 that is not a scope error (API disabled, broken deployment) with backoff instead of
      dropping everything as "lost access". A busy document lock (`retry`) deletes the `pcl:` gap key and comes back in
      5 to 30 s; backoff has ±25% jitter.
    - The sync's call (`forSync`) also deletes expired cells, so its Redis commands stop growing with everyone who ever
      saved. `revoke` now returns whether Google accepted it, and the consumer logs that as `revoked`.
  - Store: Upstash Redis Free from the Vercel Marketplace, us-east-1 next to iad1 (recreated there on 2026-10-18 after a
    first install in Frankfurt), connected to this project only. Env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the
    code also takes `UPSTASH_REDIS_REST_*`). The record only ever adds fields: every deployment shares it.
  - A bad script deploy: `npm run rollback -- <version>` (only versions named "apply entry").
  - Added 2026-10-26: `team` (the Team tab's Experienced cell, then the draft notes, as `teamSet_`) and `bfield` (Contacted,
    Interview Date or Interview Time in any binome sheet, the cells `setCell_` writes; the Master takes them at the next sync,
    which reads that sheet). A Fix sends its cells and the alert's Resolve in one accept step. Their drops have no row of
    their own, so the drops dialog asks about them. The other newer actions (screening approve / decline / restore, delete,
    department change, pairing, the interview form) stay direct writes: they place candidates, send emails or move rows.
- **One write at a time, in the tab** (`run` in `frontend/src/lib/vic/store.ts`): a direct write no longer grays out the page.
  Each click waits its turn in `jobs` and goes to the script after the one before it (the script would take them in turn
  anyway); read-only calls (previews, links, Lock check) run beside the line, and the same click again while it waits is
  the same run. Only Import team, Lock, Draw / Redraw, Reset and Setup still gray out everything while they run. The
  "leave site?" warning holds while a click still waits.

## Still open

- ~~Manual checks with other accounts, on the new UI~~ (done by the owner, 2026-10-19): an editor, a removed/non-editor ENP account ("No access", no
  dashboard flash), a viewer ("View only"), a multi-account browser, sign-out → sign back in, within and after the 48 h (no
  consent screen either way), Lock near the time limit. The gate states were only exercised on the mock. Owner sign-in, the dashboard and
  Sync are verified in production (2026-10-01, old UI); the new UI with the owner account on 2026-10-03, Reset all
  binomes included (it exists only in the dashboard).
- ~~Share the URL with the editors; once proven, point the old web app's `doGet` at Vercel and delete `Index.html` /
  `NoAccess.html`.~~ Done 2026-10-17: `doGet` returns a link to the Vercel dashboard.
- ~~Rotate the OAuth client secret (it was pasted in the build chat).~~ Done before sign-ins per browser went live
  ([#65](https://github.com/puIad/vic-recruitment-2026/issues/65)): Cloud Console › Credentials, new secret in
  `GOOGLE_CLIENT_SECRET`, redeploy, old one disabled.
- After recruitment (handover): add `vic.rh@g.enp.edu.dz` as Cloud project owner, Vercel team member, consider
  transferring the Master. The load-test plan's task 9 ([load-test.md](load-test.md#task-9--triggers-on-the-club-account)) moved the triggers
  to `vic.rh` (owner's steps done 2026-10-06, Setup re-run as `vic.rh` 2026-10-17); the same steps hand them to any later account.

## Rebuilding the Google Cloud side (if ever needed)

1. Cloud project in the ENP org; enable **Apps Script API** and **Google Drive API**. A script on a standard Cloud
   project gets no auto-enabled APIs: without the Drive API every `DriveApp` call fails with "Permission denied while
   enabling APIs: drive" (sharing, Re-share, Lock's move into the Binome Sheets folder, the sync's change check).
2. OAuth consent screen **Internal**; scopes = `oauthScopes` in appsscript.json + `openid email`.
3. OAuth client (Web): redirect URIs `https://vic-recruitment.vercel.app/api/callback` and `http://localhost:3000/api/callback`.
4. Apps Script › Project Settings › Change GCP project → this project's number. Then check the triggers still fire
   (Apps Script › Executions) and each user re-authorizes once.
5. appsscript.json keeps `"executionApi": {"access": "DOMAIN"}`; the API deployment ID goes to `SCRIPT_API_DEPLOYMENT_ID`.
