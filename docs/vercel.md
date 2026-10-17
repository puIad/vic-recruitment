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
  api/run.js        the proxy: allowlist {webAccess, webState, webPulse, webRun}, Origin + X-VIC check, 48h check,
                    token refresh, scripts.run, maps script errors to JSON, logs email/action/ms/ok
  api/logout.js     marks the session signed out (the grant is kept until 48h so signing back in skips consent)
  lib/session.js    AES-256-GCM seal/open (node:crypto), cookie helpers
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

## Rules worth knowing

- **Access is re-checked by the script on every call** (`access_()` in WebApp.gs): ENP account + editor/owner of the
  Master. An account removed from the Master gets "No access" (Drive is asked, since the bound script would still open it).
- **Versions:** `API_VERSION` in WebApp.gs and `frontend/src/lib/vic/types.ts` must match (`test/vercel.test.js`
  checks); bump both when `webAccess` / `webState` / `webRun` change shape. Adding a field or an action doesn't need a bump.
- **Long actions** pass a budget so they end before the 300 s limit: Lock 200 s, Sync now 150 s, Check integrity 200 s
  (counted from the call, lock wait included). Each resumes on the next press.
- **Session:** cookie `vic_s` HttpOnly/Secure/SameSite=Lax; `now - iat > 48h` = expired. A different account signing in
  revokes the stored grant. Rotating `SESSION_KEY` signs everyone out (kill switch).
- **Settings pages** write through `webRun('saveSettings')` into the Settings tab. `SETTING_UI` in
  `frontend/src/app/settings/components/settings-form.tsx` maps key → friendly name/icon: add a row there when adding a
  setting to `SETTINGS_DEFAULTS`.
- Tokens never reach browser JS and are never logged.

## Still open

- Manual checks with other accounts, on the new UI: an editor, a removed/non-editor ENP account ("No access", no
  dashboard flash), a viewer ("View only"), a multi-account browser, sign-out → sign back in within 48h (no consent
  screen), Lock near the time limit. The gate states were only exercised on the mock. Owner sign-in, the dashboard and
  Sync are verified in production (2026-10-01, old UI); the new UI with the owner account on 2026-10-03, Reset all
  binomes included (it exists only in the dashboard).
- ~~Share the URL with the editors; once proven, point the old web app's `doGet` at Vercel and delete `Index.html` /
  `NoAccess.html`.~~ Done 2026-10-17: `doGet` returns a link to the Vercel dashboard.
- Optional: rotate the OAuth client secret (it was pasted in the build chat) → Cloud Console › Credentials, then update
  `GOOGLE_CLIENT_SECRET` in Vercel and redeploy.
- After recruitment (handover): add `vic.rh@g.enp.edu.dz` as Cloud project owner, Vercel team member, consider
  transferring the Master. The load-test plan's task 9 ([load-test.md](load-test.md#task-9--triggers-on-the-club-account)) moves the triggers
  to `vic.rh` once the owner has done its steps (pending); the same steps hand them to any later account.

## Rebuilding the Google Cloud side (if ever needed)

1. Cloud project in the ENP org; enable **Apps Script API** and **Google Drive API**. A script on a standard Cloud
   project gets no auto-enabled APIs: without the Drive API every `DriveApp` call fails with "Permission denied while
   enabling APIs: drive" (sharing, Re-share, Lock's move into the Binome Sheets folder, the sync's change check).
2. OAuth consent screen **Internal**; scopes = `oauthScopes` in appsscript.json + `openid email`.
3. OAuth client (Web): redirect URIs `https://vic-recruitment.vercel.app/api/callback` and `http://localhost:3000/api/callback`.
4. Apps Script › Project Settings › Change GCP project → this project's number. Then check the triggers still fire
   (Apps Script › Executions) and each user re-authorizes once.
5. appsscript.json keeps `"executionApi": {"access": "DOMAIN"}`; the API deployment ID goes to `SCRIPT_API_DEPLOYMENT_ID`.
