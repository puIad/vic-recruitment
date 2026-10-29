# Trigger re-authorization without opening the Master

Research for [#179](https://github.com/puIad/vic-recruitment/issues/179) (map [#166](https://github.com/puIad/vic-recruitment/issues/166)), 2026-10-29.
Sources are Google's own Apps Script and Google Identity pages, read on this date; each fact links its page. Repo facts
name the file. Nothing was run against the live script or the Master.

## The question

When a deploy adds a scope, `syncAll` stops with "Authorization is required" until `vic.rh` runs Setup from the
Master's menu. What grant does the trigger need, and can `vic.rh` give it some other way: the Apps Script editor, the
web app URL (`doGet`), the Vercel sign-in, or an Apps Script method that prompts for missing scopes? Can the script
notice the broken trigger and tell someone?

## Short answer

- The trigger runs on **`vic.rh`'s own authorization of the script**, which must cover every scope the script asks
  for (the 8 in `appsscript.json` `oauthScopes`).
- **The Apps Script editor works** and is Google's documented fix. `vic.rh` opens the project from script.google.com,
  runs a function, and ticks every box. The Master is never opened.
- **The web app URL should work** by the same model, and it is the easiest link to send. Nobody has tried it here.
- **The Vercel sign-in is unproven.** Google treats OAuth grants as per Cloud project, which suggests it could count.
  No Apps Script page says it does.
- **Apps Script prompt methods** (`requireScopes`, `requireAllScopes`, the authorization URL) only help inside an
  execution run by `vic.rh` on an interactive surface. A trigger can't prompt.
- **The dead trigger can't report itself**: in a regular project, its code never runs. An admin-side heartbeat can.
- **Lead on the stops with no scope change** (not settled): when the dashboard revokes `vic.rh`'s token, it probably
  also revokes the trigger's authorization.

## What the trigger needs

- Installable triggers run as the account that created them, on that account's authorization:
  ["Installable trigger: User who created the trigger"](https://developers.google.com/apps-script/guides/services/authorization#permissions-and-types-of-scripts),
  and the installable version
  ["runs with the authorization of the user who created the trigger"](https://developers.google.com/apps-script/guides/triggers/installable).
  Here that account is `vic.rh` (`TRIGGER_OWNER`, `triggerOwner_()` in Setup.gs).
- At each run, Apps Script checks whether that user has already authorized the scopes it needs
  ([authorization guide, "How authorization for Google Services works"](https://developers.google.com/apps-script/guides/services/authorization#how_authorization_for_google_services_works)).
  A code change that adds services asks for more authorization (same page, "Grant access rights").
  This project sets explicit `oauthScopes`, so the scope list is that array
  ([set explicit scopes](https://developers.google.com/apps-script/concepts/scopes#set-explicit)).
- Google's troubleshooting entry for this exact error: "Triggers must be authorized by the user who created them. If
  you add code that requires new permissions, you must manually run a function in the script editor once to trigger
  the authorization dialog."
  ([authorization guide, Troubleshooting](https://developers.google.com/apps-script/guides/services/authorization#troubleshooting)).
  The fix is to re-authorize. Reinstalling the triggers isn't needed, so Setup does more than the fix requires.
- **Granular consent applies to triggers too.** The consent screen lets the user untick individual scopes, on every
  surface: editor, macros, triggers, web apps
  ([scopes, "Handle granular OAuth permissions"](https://developers.google.com/apps-script/concepts/scopes#handle-granular)).
  Say a scope was left unticked, or revoked later. A trigger run that needs it "fails immediately with an
  'Authorization is required to perform that action.' error". Google recommends calling `ScriptApp.requireScopes`
  when the trigger is installed
  ([scopes, "Ensure that trigger executions have permissions"](https://developers.google.com/apps-script/concepts/scopes#trigger-permissions)).
  `setup()` doesn't do that today, so a Setup run with one box unticked finishes, and the trigger fails afterwards.
- Workspace session-length (re-authentication) policies are not a cause: "Apps Script does not enforce the
  re-authentication frequency that is configured in Google Cloud service settings" because triggers run unattended
  ([authorization guide, "Re-authentication behavior"](https://developers.google.com/apps-script/guides/services/authorization#re-authentication)).

## The routes

### Master menu (today's fix)

Known to work: the 26 and 27 Oct stops were both fixed this way. It's one way of running a function as `vic.rh` on an
interactive surface, which shows the consent screen. Any other such surface should do the same job.

### Apps Script editor: works, documented

- Google names this route directly (the troubleshooting entry quoted above).
- `vic.rh` can open the bound project without opening the sheet: "To reopen the script in the future, do the same
  thing or open the script from the Apps Script dashboard". Anyone with edit access to the container can run its
  bound script ([bound scripts](https://developers.google.com/apps-script/guides/bound)). `vic.rh` is an editor of
  the Master (docs/load-test.md, task 9).
- In the IDE, "If a script needs authorization, an authorization dialog appears when it is run"
  ([authorization guide](https://developers.google.com/apps-script/guides/services/authorization#grant_access_rights)).
  The function still runs after the dialog, so it has to be harmless. The repo has no function meant only for this.
  A two-line `authorize()` that calls `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` would be the clean
  target: that method "ends the current execution and renders an authorization prompt to request the missing
  consents" in the IDE
  ([ScriptApp.requireAllScopes](https://developers.google.com/apps-script/reference/script/script-app#requireallscopesauthmode)).

### Web app URL (`doGet`): should work, untested

- The web app executes as the user accessing it (`appsscript.json` `webapp.executeAs: USER_ACCESSING`, access
  `DOMAIN`). For that mode, "that user is presented with the granular OAuth consent screen"
  ([web apps, Permissions](https://developers.google.com/apps-script/guides/web#permissions)).
- The trigger and the web app both rely on the same thing: one user's authorization of one script, checked against
  the script's scopes at each run
  ([authorization guide](https://developers.google.com/apps-script/guides/services/authorization)). So a visit by
  `vic.rh`, with every box ticked, should restore the trigger. No Google page states this for triggers in so many
  words, and it hasn't been tried here.
- Repo facts: `doGet` (WebApp.gs) only shows a link to the Vercel dashboard. Its URL is in docs/reference.md
  (web app deployment). `npm run deploy` updates that deployment along with the API one, so the web app's version
  carries the same manifest as the HEAD code the trigger runs.
- Weak spot: `doGet` uses no service. Under granular consent, `vic.rh` can untick boxes and the page still loads. A
  `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` at the top of `doGet` (or behind a `?authorize=1` parameter)
  would hold the page until every scope is granted. The Vercel sign-in already demands every scope from everyone,
  so this asks nothing new.

### Vercel sign-in: unproven

- `scripts.run` needs the caller's OAuth client and the script in the same standard Cloud project, and a token that
  covers "all the scopes used by the script"
  ([executing functions with the Apps Script API, Requirements](https://developers.google.com/apps-script/api/how-tos/execute#requirements)).
  The dashboard's token therefore holds every scope the trigger needs.
- Google Identity treats a grant as belonging to the project, not to one client: "when a user has granted access to
  a particular scope to any client ID in a project, the grant indicates the user's trust in the whole application for
  that scope" ([cross-client identity](https://developers.google.com/identity/protocols/oauth2/cross-client-identity)).
  "The combined authorization includes all scopes that the user granted to the API project even if the grants were
  requested from different clients"
  ([web server OAuth, incremental authorization](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth)).
  The sign-in asks with `include_granted_scopes: 'true'` (web/api/login.js).
- Apps Script on a standard project uses that project for authorization. "The Cloud project name is used to identify
  the script" on the consent screen, and after a switch to a new project, "all users who have previously authorized
  apps associated with the new project must also re-authorize"
  ([Cloud projects](https://developers.google.com/apps-script/guides/cloud-platform-projects)). This points to the
  script's authorization being part of the project-wide grant, but Google never says that a grant made to another
  client counts for a trigger.
- So it might work, and nothing proves it. Cheap test at the next stop: before anything else, `vic.rh` signs in to
  the dashboard through `/api/login?consent=1` and ticks every box (an unticked box makes the dashboard revoke the
  grant; see the lead below). Then watch `clasp logs` for the next trigger cycle. If it resumes, this is a route; if not, fall back to the editor or the web app.
- The dashboard's **Setup button** isn't a route either. `webRun('setup')` calls `setup()` through `scripts.run`
  (WebApp.gs), and Google's limits say "No triggers. The API cannot create Apps Script triggers"
  ([Apps Script API, Limitations](https://developers.google.com/apps-script/api/how-tos/execute#limitations)).
  The owner already avoids that button because it can pin the triggers to a fixed version.

### Apps Script methods that prompt

- `requireScopes` / `requireAllScopes` "validate permissions and render the authorization prompt"
  ([scopes, "Automatically require permission"](https://developers.google.com/apps-script/concepts/scopes#require-permission)).
  They only work "from a surface that supports granular consent, for example, from within the Apps Script IDE"
  ([ScriptApp](https://developers.google.com/apps-script/reference/script/script-app#requirescopesauthmode,-oauthscopes)).
  Triggers "cannot prompt the user for missing permissions mid-execution"
  ([scopes](https://developers.google.com/apps-script/concepts/scopes#trigger-permissions)). They are useful in
  `setup()`, an `authorize()` function, or `doGet`, never in `syncAll`.
- `ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL)` returns the status (`REQUIRED` / `NOT_REQUIRED`), the
  scopes granted, and "the authorization URL that can be used to grant access to the script"
  ([AuthorizationInfo](https://developers.google.com/apps-script/reference/script/authorization-info)). The object
  describes the user running the code, so the URL has to come from an execution run by `vic.rh`. Whether a URL
  obtained by one user works for another is not documented.

## Can the script detect the broken trigger?

- **Not from the trigger.** "Unlike triggers in regular Apps Script projects, triggers in add-ons continue to fire
  even if they need re-authorization"
  ([editor add-on triggers](https://developers.google.com/workspace/add-ons/concepts/editor-triggers#authorize_installable_triggers)).
  Google's sample that emails the authorization URL from inside the trigger is for add-ons only. This is a regular
  project, so `syncAll` never runs and a try/catch never sees the error. That matches the clasp logs from 27 Oct,
  which showed `NOTICE syncAll Authorization is required to perform that action.` every 5 minutes.
- **Google's built-in signal**: the trigger owner gets "Summary of failures for Apps Script" from
  noreply-apps-scripts-notifications@google.com, with links to the script and the bound file. Only the frequency can
  be changed while the trigger is active
  ([installable triggers, "Errors in triggers"](https://developers.google.com/apps-script/guides/triggers/installable#errors_in_triggers)).
  It reaches `vic.rh`'s inbox only.
- **Other accounts can't see the trigger**: "A given account can't see triggers installed from a second account"
  ([installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)), and
  `getProjectTriggers()` returns "the current user's triggers"
  ([ScriptApp](https://developers.google.com/apps-script/reference/script/script-app#getprojecttriggers)). An admin's
  execution can't check the trigger itself.
- **What works is a heartbeat** read by someone else's execution. A trigger cycle that finishes records its time; the
  admins' `webPulse` (it runs as each admin) compares that time with the sync interval. The dashboard then shows
  "timed sync stopped at HH:MM, `vic.rh` must re-authorize" with the web app link, and can email once a day from the
  admin's account. The Vercel side already has a second signal: every timed sync calls `api/drops`
  (docs/vercel.md), so a gap in those calls is a dead trigger.
- The Apps Script API can list a script's executions, filtered by type and status (`TIME_DRIVEN`, `FAILED`)
  ([processes.listScriptProcesses](https://developers.google.com/apps-script/api/reference/rest/v1/processes/listScriptProcesses),
  [Process](https://developers.google.com/apps-script/api/reference/rest/v1/processes)). It needs the
  `script.processes` scope, which means one more consent round for every user. The page doesn't say whether an admin
  sees `vic.rh`'s trigger runs. The heartbeat needs no new scope.

## Lead: why it stopped with no scope change (not settled)

The trigger stopped on 26 Oct and again on 27 Oct, both evenings with a script deploy (#159, #165). `appsscript.json`
hasn't changed since 18 Oct (git log). Google's documented ways a grant ends: the user revokes it, six months unused,
a password change with Gmail scopes, more than 100 refresh tokens per account per client, or an admin restricting a
service ([OAuth 2.0, refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)).
One of those touches this repo directly:

- "Revocation removes all OAuth 2.0 scopes previously granted to a project, invalidating any issued access or refresh
  tokens for all clients registered under that project"
  ([web server OAuth, token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)).
- The dashboard calls the revoke endpoint (`revoke()` in web/lib/session.js) when:
  1. a sign-in comes back with a box unticked (web/api/callback.js);
  2. another account signs in on a browser where the previous account's sign-in is less than 48 h old (callback.js
     → `revokeWhenDone`, web/lib/pending.js, or later in web/api/apply.js).
- Suppose the script's authorization belongs to the project grant, as the routes section suggests. Then either case
  for `vic.rh` cuts the trigger's authorization, and the next run fails with "Authorization is required", the error
  Google gives for a revoked scope ([scopes](https://developers.google.com/apps-script/concepts/scopes#trigger-permissions)).
  Case 2 is likely with a shared club account: someone signs in as `vic.rh`, then as themselves, on the same browser.
- Unproven. Only the apply.js path logs (`"at":"apply"` with `revoked`). The callback path and the direct
  `revokeWhenDone` path log nothing, so logs can't confirm it after the fact. Worth logging every revoke with the
  email before the next stop.

## Verdict

`vic.rh` doesn't need to open the Master. Google's documented route is the **Apps Script editor**: open the project
from script.google.com, run a harmless function, and tick every box. The **web app URL** should work by the same
model and is the easiest link to send, but nobody has tried it yet. The **Vercel sign-in** is unproven, and so is the
**dashboard Setup button**, which Google's API limits say can't create triggers. The trigger can't raise the alarm
itself; an admin-side heartbeat can. Until the web app URL or the Vercel sign-in has worked once, the Master menu and
the editor are the visits known to work.
