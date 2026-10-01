# PLAN — Vercel front, Apps Script back

Status: **built and live** (2026-10-01): https://vic-recruitment.vercel.app, owner sign-in + Sync verified in production. Live state and IDs: STATUS.md.
Deviations: web tests live in `test/vercel.test.js` (not `web/test/`, which would be deployed); CSRF = required `X-VIC`
header + foreign-Origin refusal (some clients omit Origin on same-origin POST); local mock = in-process fetch mock
(`test/googlemock.js`) instead of `SCRIPT_RUN_URL`; trigger guard = recorded `TRIGGER_OWNER` (Apps Script can't list
other users' triggers).

## Progress (2026-10-01)

| Step | State |
|---|---|
| §1 Google Cloud: project, Apps Script API, Internal consent, OAuth client, script switched to the project | ✅ done by Mourad; confirmed by a working `scripts.run` call |
| §2 Script: scopes + `executionApi`, `webAccess`, DOMAIN/owner checks, Setup owner-only, lock budget, `API_VERSION`, trigger-owner guard, tests | ✅ pushed; web app redeployed @5 (same URL) |
| §2.4 API executable deployment | ✅ `AKfycbxiWVKDnvlHrug29Sj76apXUdAdxSf2adzc-9A0_t560ojXMBreEferXkZR0TIT-DZU` (@6) |
| §3 `web/` app (index, login, callback, run, logout, session, vercel.json) | ✅ commits `3d26dcd`, `61542b8` |
| §3 Vercel project `vic-recruitment` from Git, root `web/`, previews protected, 5 env vars (secret + key Sensitive) | ✅ `maxDuration: 300` accepted on Hobby |
| §4 Automated tests (`npm test`: unit, e2e, web, vercel) | ✅ all green |
| §4 Manual: owner sign-in, dashboard, Sync | ✅ verified in production logs (Sync 57 s, ran as the visitor) |
| §4 Manual: editor, non-editor ENP (no-access view), multi-account browser, sign-out, Lock near the limit | ⏳ needs other accounts |
| Risk: time triggers still fire after the GCP switch | ⏳ check the Log tab for automatic syncs/digest |
| §5.4 Share the Vercel URL with the 10 editors | ⏳ |
| §5.5 Once proven: `doGet` → link to Vercel, update STATUS/HANDOFF | ⏳ |
| §5.6 After recruitment: `vic.rh@g.enp.edu.dz` → Cloud owner (+ Vercel/Master handover, delete `TRIGGER_OWNER`) | ⏳ |

Note: the OAuth client secret was pasted in the build chat; rotate it in Cloud Console → Credentials if that matters,
then update `GOOGLE_CLIENT_SECRET` in Vercel and redeploy.

## Decisions (from the grilling session)

| # | Decision |
|---|---|
| Why | Fix the multi-account `google.script.run` breakage + a clean URL. |
| Identity | Script **runs as the visitor** via the Apps Script API (`scripts.run`) with the visitor's own OAuth token. Same semantics as today: Drive enforces access. |
| Who gets in | `@g.enp.edu.dz` **and** editor/owner of the Master. Sharing the Master = access; unsharing revokes on the next click. Today: 11 accounts, all ENP. |
| Enforcement | 4 layers: Internal consent screen · API executable access = domain · `access_()` editor check · explicit `@g.enp.edu.dz` + `hd` check. |
| OAuth client | Cloud project created with Mourad's ENP account, inside the ENP org, consent screen **Internal**. |
| Session | 48h **fixed from sign-in**. Refresh token AES-GCM-encrypted in an HttpOnly cookie, key only in Vercel env. Sign-out and expiry revoke it at Google. |
| Roles | Every Master editor can use every button **except Setup (owner only)**. |
| Front | Port `Index.html` as-is (static page + plain Node functions, no framework, no npm deps). Refactor later. |
| URL | `vic-recruitment.vercel.app` (team `puiads-projects`). Sign-in works on production only, not on previews. |
| Long actions | Synchronous, `maxDuration: 300`. Lock gets a ~200s budget via the API (already resumable). On timeout: "may still be running, refresh in a minute". |
| Old dashboard | Kept as a fallback until Vercel is proven, then `doGet` → link to Vercel. |
| Deploys | Vercel from Git (`web/` root, `main` = production). Apps Script stays on clasp. **Script ships first, only ever adds.** |
| Logging | email · action · duration · ok/error. Never arguments or results (candidate data). No Analytics/Speed Insights. |
| Handover | After recruitment: add `vic.rh@g.enp.edu.dz` as Cloud project owner (+ Vercel team, + Master owner transfer to consider). |

## Request flow

```
Browser ── GET /api/login ──► Google (hd=g.enp.edu.dz, select_account, PKCE, state)
        ◄── /api/callback: exchange code → check id_token (hd, email_verified) → set cookie `vic_s`
                              (AES-GCM{ email, refresh_token, access_token, at_exp, iat })
Browser ── POST /api/run {fn, args, v} (same-origin, cookie) ──► Vercel function
        Vercel: decrypt cookie → 48h check → refresh access token if < 5 min left
             → POST script.googleapis.com/v1/scripts/{API_DEPLOYMENT_ID}:run  (Bearer = visitor's token)
        Apps Script (as the visitor): webAccess / webState / webRun → access_() → work
        ◄── result | {error} ; Vercel re-sets cookie if token was refreshed
```

## 1. Google Cloud (Mourad does this by hand, ~15 min, checklist in the PR)

1. console.cloud.google.com as `mourad_islam.fernane@g.enp.edu.dz` → new project `vic-recruitment` in the ENP org.
2. Enable **Apps Script API**.
3. OAuth consent screen: **Internal**, app name "VIC Recruitment", scopes = the script's scopes (§2.1) + `openid email`.
4. OAuth client → Web application. Authorized redirect URIs: `https://vic-recruitment.vercel.app/api/callback` and
   `http://localhost:3000/api/callback`. Client ID + secret go to Vercel env (never git).
5. Apps Script editor → Project Settings → **Change GCP project** → this project's number.
   ⚠ Verify after: the time triggers still fire, and the menu + old web app still work (each user re-authorizes once).

## 2. Apps Script changes

1. `appsscript.json`: add `"executionApi": {"access": "DOMAIN"}` and **explicit `oauthScopes`**, so the OAuth client
   requests exactly what `scripts.run` needs: `spreadsheets`, `drive`, `forms`, `script.send_mail`,
   `script.scriptapp`, `script.container.ui`, `userinfo.email` (confirm against the project's Overview page).
2. `WebApp.gs`:
   - new `webAccess()` → `{ok, email, reason, owner, v}` (no throw), so the front can render the no-access view.
   - `access_()`: refuse non-`@g.enp.edu.dz` emails (`reason: 'DOMAIN'`), expose `owner` (email === Master owner).
   - `webRun('setup')`: refuse unless owner.
   - Lock via API: pass a ~200s budget into `lockBinomesCore_` (default stays 270s for the menu).
   - `API_VERSION` constant returned by `webAccess`/`webState`, checked by the front.
3. `Setup.gs:141` (`installTriggers_`): before installing, refuse if any trigger in the project belongs to someone else
   (closes the duplicate-trigger hole for the menu path too).
4. Create the **API executable** deployment (`clasp deploy`), note its ID in STATUS. A code change now updates both:
   `npx clasp update-deployment <WEBAPP_ID>` and `npx clasp update-deployment <API_ID>`.
5. Tests (`test/web.test.js`): domain refusal, setup owner-only, `webAccess` reasons, trigger-owner guard.

## 3. Vercel app (`web/`)

```
web/
  index.html          ported Index.html; the one google.script.run wrapper (Index.html:465) → fetch('/api/run')
                      + no-access view (ported NoAccess.html) + sign-out button + "session renews" pre-check
  api/login.js        builds Google auth URL: PKCE + state in a 10-min HttpOnly cookie, hd, prompt=select_account,
                      access_type=offline (prompt=consent only if Google didn't return a refresh token)
  api/callback.js     verifies state, exchanges code, checks id_token hd/email_verified, writes session cookie
  api/run.js          the proxy: allowlist {webAccess, webState, webRun}, Origin check, 48h check, token refresh,
                      scripts.run, maps script errors → JSON, logs email/action/ms/ok
  api/logout.js       revokes the refresh token at Google, clears cookie
  lib/session.js      AES-256-GCM seal/open (node:crypto), cookie helpers
  vercel.json         maxDuration 300 for api/run.js, security headers (CSP, frame-ancestors none, no-referrer)
```

Env (Vercel, Production only): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY` (32 random bytes),
`SCRIPT_API_DEPLOYMENT_ID`, `APP_ORIGIN`. Local: `.env.local` (git-ignored); `SCRIPT_RUN_URL` override → mock.

**Session rules**
- Cookie `vic_s`: `HttpOnly; Secure; SameSite=Lax; Path=/`, Max-Age 30d (so an expired session can still be revoked),
  payload `iat`. Server treats `now - iat > 48h` as expired → revoke refresh token → 401 → front sends to login.
- Orphaned refresh token (cookie lost) → Google returns none on next login → callback retries once with `prompt=consent`.
- Rotating `SESSION_KEY` signs everyone out (the emergency kill switch).

**Hardening checklist**
- POST-only `/api/run` + `Origin` must equal `APP_ORIGIN` (CSRF); state + PKCE on login.
- Function allowlist in the proxy; the script re-checks access on **every** call (never trust Vercel's view).
- Tokens never reach browser JS; never logged; error messages from Google are summarized, not echoed.
- Vercel Deployment Protection stays on for previews; production public (Google sign-in is the gate).

## 4. Testing

- `npm test` (existing) + new script tests above.
- `web/test/session.test.js`: seal/open round-trip, tamper → reject, 48h boundary, missing refresh token path.
- `web/test/run.test.js`: proxy against a local mock `scripts.run` (reuses `test/mockgas.js` via `test/devserver.js`):
  allowlist, Origin refusal, refresh-before-call, timeout message, version mismatch.
- Manual on production with TEST_MODE = TRUE: owner sign-in, editor sign-in, non-editor ENP account (no-access view),
  multi-account browser, sign-out, Lock timeout behaviour.

## 5. Rollout

1. Script changes → `npm test` → clasp push → update web app deployment → create API deployment.
2. Cloud project + GCP switch (§1) → verify triggers and old dashboard still work.
3. Vercel project from Git, env vars, deploy → manual test list (§4).
4. Share the Vercel URL with the 10 editors; old URL stays as a fallback.
5. Once proven: `doGet` → link to Vercel; update STATUS/HANDOFF.
6. After recruitment: `vic.rh@g.enp.edu.dz` → Cloud owner (and Vercel/Master handover).

## Risks to verify during the build

- Exact Vercel Hobby `maxDuration` ceiling with Fluid compute (assumed 300s).
- Switching the script's GCP project: whether existing installable triggers keep running without re-running Setup.
- Exact scope list `scripts.run` demands (a missing scope = "insufficient permissions" on every call).
- ENP Workspace admin settings could block third-party app access to Drive scopes even for Internal apps (if so: admin
  must trust the client ID).
