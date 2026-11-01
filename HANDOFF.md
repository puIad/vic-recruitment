# HANDOFF — working on VIC Recruitment 2026

For whoever picks this up next (person or agent). Current state and next steps: [STATUS.md](STATUS.md). Background,
IDs and design: [docs/](docs/README.md). Open only what the task needs.

## Owner

Mourad Fernane — `mourad_islam.fernane@g.enp.edu.dz` (owns the Master, the triggers, the Cloud project and Vercel).
Repo: https://github.com/puIad/vic-recruitment-2026 (its own repo, not the AI-OS one).

## Layout

| Path | What | Ships with |
|---|---|---|
| `*.gs`, `appsscript.json` | the Apps Script bound to the Master | `npm run deploy` |
| `frontend/` | the dashboard UI (Vite + React + shadcn) | Vercel, on push to `main` |
| `web/` | Vercel project root: `api/` functions, `lib/session.js`, `vercel.json` (builds `frontend/` into `web/dist`) | Vercel, on push to `main` |
| `test/` | mock Apps Script + mock Google, the suites, the local mock backend (`webdev.js`) | — |
| `PRODUCT.md`, `DESIGN.md` | product record and visual system of the UI | — |

## How changes ship

1. A branch per change, `npm test`, a PR into `main`. The claude GitHub Action reviews; fix its findings on the branch. Doc-only
   edits go straight to `main`.
2. Script changes, after merge: `npm run deploy` from `main` = tests → `clasp push` → update **both** deployments
   (web app + API) in place. Never `clasp create-deployment` (new URL). Check the "Pushed N files" list:
   `.claspignore` allows `*.gs`, `*.html` and `appsscript.json` at the root, nothing else. The push replaces the whole live project
   with git (`--force` lets it overwrite the manifest too): any edit made in the Apps Script editor, `.gs`, `.html` or
   `appsscript.json`, is lost unless it is in git first. (Without `--force`, a live manifest that differs, even by line endings, made clasp print
   "Skipping push." and the deploy re-cut the old code: 2026-10-07.)
   A bad script deploy: `npm run rollback -- <version>` puts both deployments back on that version (`npx clasp versions`
   lists them); it refuses a version from before the pending-changes apply entry (named "apply entry" by the deploy).
3. Dashboard changes: Vercel builds and deploys `main` by itself. A green Vercel check is not proof; open the build log
   and look for the `npm --prefix ../frontend ci` and Vite lines (tens of seconds, not under a second). Before pushing
   a change to what Vercel builds, build it from a clean clone: `.gitignore` once hid files the local build used.
   Undo a bad deploy with Vercel › Deployments › Instant Rollback.
4. A UI change that needs a new script field: deploy the script first (it only ever adds), then push the UI.
5. Bump `API_VERSION` in `WebApp.gs` **and** `frontend/src/lib/vic/types.ts` together, only when `webAccess` /
   `webState` / `webRun` change shape. `test/vercel.test.js` fails if they differ.
6. Update STATUS.md (live versions, next steps); put lasting facts in the right `docs/` file, not in STATUS.

## Running the dashboard locally

```bash
cd frontend
npm install
npm run mock    # terminal 1: mock Google + the real web/api functions on :3000, seeded (40 registrations, 2 hand edits)
npm run dev     # terminal 2: http://localhost:5173/dev-login?as=admin@g.enp.edu.dz
```

`npm run typecheck` (`tsc -b`) is the check that works; `npm run lint` is broken (ESLint flat config). Restarting the
mock reseeds it and signs everyone out: open `/dev-login?as=…` again. More: [docs/frontend.md](docs/frontend.md).

## Rules of the code (details in [docs/architecture.md](docs/architecture.md))

- Every write to the Master happens inside `withLock_`. A run that writes Binomes or Interviewees calls
  `detectEdits_(ctx)` after `loadCtx_()` and `commitBase_(ctx)` after writing, or its own writes get flagged as manual edits.
- Mail goes through `mail_()` and sharing checks TEST_MODE: never call `MailApp` / `addEditor` directly. `mail_()` posts to
  the mailer so every mail leaves from `vic.rh`; `MailApp` here would send from whoever runs the code. Build the HTML
  with `mailHtml_()` (Mail.gs); the tests fail on any mail that skips it.
- Pure logic lives in Matching.gs / Rules.gs (unit-tested); everything touching Google services is tested on the mock
  (`test/mockgas.js`); extend the mock when you use a new Apps Script API.
- Dashboard actions go through `webRun(action, args)`; long ones take a time budget so they end before Vercel's 300 s.
  In the UI they live in `frontend/src/lib/vic/actions.tsx` (`useActions()`): anything that writes, shares or mails
  previews and confirms first.
- New setting: add it to `SETTINGS_DEFAULTS` (Config.gs), give it a label, plain help line and control in `SETTING_UI`
  (`frontend/src/lib/vic/settings-ui.ts`; dropdown choices in `CHOICES`), and put its key in a section of `GROUPS`
  (`frontend/src/app/settings/components/settings-form.tsx`). Unlisted, it still shows under General › Advanced.

## Gotchas

- The mock can't catch Apps Script quirks (protections, validations, locale parsing, trigger auth): verify on the live
  Master in TEST_MODE.
- A member's call that reads the Master fails as it ends, even when the script caught the refusal, and the log line has no
  stack (2026-11-01: 20 hours of "You do not have permission to access the requested document." on My binome). The rule is
  in [CLAUDE.md](CLAUDE.md); the mock enforces it in `m.call`. Removing someone's admin rights makes them an ordinary member at
  their next call, which is the quickest way to see a member's view.
- Failed dashboard calls raise a HIGH `CALLS_FAILING` alert: reads that throw anything but "Not allowed" or "isn't shared", and any
  call refused with a permission, authorization, protected-cell or unknown-action error, at 3 failures or 2 accounts in a sync cycle.
  To test the whole path, signed in as an admin, run this 3 times in the browser console, then wait for the next sync:
  `fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fn: 'webRun', args: ['alertTest', {}] }) })`.
  It fails harmlessly with "Unknown action" and mails `ADMIN_EMAIL`. Resolve the alert afterwards.
- Admins can only change members / cover / apply fixes if they can edit the Binome Sheets folder.
- The script runs on the `vic-recruitment` Cloud project, so Google APIs are not auto-enabled: "Permission denied while
  enabling APIs: X" = enable API X in that project (Drive is needed; see [docs/vercel.md](docs/vercel.md#rebuilding-the-google-cloud-side-if-ever-needed)).
- `clasp logs` needs a Cloud project ID, which the committed `.clasp.json` doesn't have: copy `.clasp.json` to a scratch
  folder, add `"projectId": "444885197277"` (the project number; the name `vic-recruitment` is refused) and `"rootDir": "."`,
  and run `clasp logs` there. It prints the recent `cycle` / `action` lines and stack traces (times in Algiers time).
  Otherwise Apps Script › Executions.
- Vercel project settings that must stay as they are (Root Directory `web`, files outside the root included):
  [docs/vercel.md](docs/vercel.md#vercel-project-settings).
- Screenshots of the UI: the default browser (Obscura) doesn't draw Tailwind's `rounded-full`; use Chrome
  (`playwright-chrome`).
- Personal data: `test/data/` (2025 exports) is git-ignored; never commit candidate data.
