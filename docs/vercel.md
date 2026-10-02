# Vercel dashboard — how it works

Live since 2026-10-01 at https://vic-recruitment.vercel.app. IDs and env vars: [reference.md](reference.md); why:
[decisions.md](decisions.md).

## Request flow

```
Browser ── GET /api/login ──► Google (hd=g.enp.edu.dz, select_account, PKCE, state)
        ◄── /api/callback: exchange code → check id_token (hd, email_verified) → set cookie `vic_s`
                              (AES-GCM{ email, refresh_token, access_token, at_exp, iat })
Browser ── POST /api/run {fn, args, v} (same-origin, cookie, X-VIC header) ──► Vercel function
        Vercel: decrypt cookie → 48h check → refresh access token if < 5 min left
             → POST script.googleapis.com/v1/scripts/{SCRIPT_API_DEPLOYMENT_ID}:run  (Bearer = visitor's token)
        Apps Script (as the visitor): webAccess / webState / webRun → access_() → work
        ◄── result | {error} ; Vercel re-sets the cookie if the token was refreshed
```

## Files

```
web/
  index.html        the dashboard (port of Index.html): gate card until webAccess says ok, then the app
  api/login.js      Google auth URL: PKCE + state in a 10-min HttpOnly cookie, hd, prompt=select_account, offline access
  api/callback.js   verifies state, exchanges the code, checks id_token hd/email_verified, writes the session cookie
  api/run.js        the proxy: allowlist {webAccess, webState, webRun}, Origin + X-VIC check, 48h check, token refresh,
                    scripts.run, maps script errors to JSON, logs email/action/ms/ok
  api/logout.js     marks the session signed out (the grant is kept until 48h so signing back in skips consent)
  lib/session.js    AES-256-GCM seal/open (node:crypto), cookie helpers
  vercel.json       maxDuration 300 for api/run.js, security headers (CSP, frame-ancestors none, no-referrer)
```

## Rules worth knowing

- **Access is re-checked by the script on every call** (`access_()` in WebApp.gs): ENP account + editor/owner of the
  Master. An account removed from the Master gets "No access" (Drive is asked, since the bound script would still open it).
- **Versions:** `API_VERSION` in WebApp.gs and web/index.html must match; bump both when `webAccess` / `webState` /
  `webRun` change shape. Adding a field or an action doesn't need a bump.
- **Long actions** pass a budget so they end before the 300s limit: Lock 200s, Sync now 150s, Check integrity 200s
  (counted from the call, lock wait included). Each resumes on the next press.
- **Session:** cookie `vic_s` HttpOnly/Secure/SameSite=Lax; `now - iat > 48h` = expired. A different account signing in
  revokes the stored grant. Rotating `SESSION_KEY` signs everyone out (kill switch).
- **Settings card** writes through `webRun('saveSettings')` into the Settings tab. `SETTING_UI` in web/index.html maps
  key → friendly name/icon: add a row there when adding a setting to `SETTINGS_DEFAULTS`.
- Tokens never reach browser JS and are never logged. Previews are protected; sign-in only works on production.

## Still open

- Manual checks with other accounts: an editor, a removed/non-editor ENP account ("No access", no dashboard flash), a
  viewer ("View only"), a multi-account browser, sign-out → sign back in within 48h (no consent screen), Lock near the
  time limit. Owner sign-in, dashboard and Sync were verified in production on 2026-10-01.
- Share the URL with the editors; once proven, point the old web app's `doGet` at Vercel.
- Optional: rotate the OAuth client secret (it was pasted in the build chat) → Cloud Console › Credentials, then update
  `GOOGLE_CLIENT_SECRET` in Vercel and redeploy.
- After recruitment (handover): add `vic.rh@g.enp.edu.dz` as Cloud project owner, Vercel team member, consider
  transferring the Master; delete `TRIGGER_OWNER` and re-run Setup from the new owner.

## Rebuilding the Google Cloud side (if ever needed)

1. Cloud project in the ENP org; enable **Apps Script API** and **Google Drive API**. A script on a standard Cloud
   project gets no auto-enabled APIs: without the Drive API every `DriveApp` call fails with "Permission denied while
   enabling APIs: drive" (sharing, Re-share, Lock's move into the Binome Sheets folder, the sync's change check).
2. OAuth consent screen **Internal**; scopes = `oauthScopes` in appsscript.json + `openid email`.
3. OAuth client (Web): redirect URIs `https://vic-recruitment.vercel.app/api/callback` and `http://localhost:3000/api/callback`.
4. Apps Script › Project Settings › Change GCP project → this project's number. Then check the triggers still fire
   (Apps Script › Executions) and each user re-authorizes once.
5. appsscript.json keeps `"executionApi": {"access": "DOMAIN"}`; the API deployment ID goes to `SCRIPT_API_DEPLOYMENT_ID`.
