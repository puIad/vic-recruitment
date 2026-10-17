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

1. A branch per change, `npm test`, a PR into `main`. CodeRabbit reviews; fix its findings on the branch. Doc-only
   edits go straight to `main`.
2. Script changes, after merge: `npm run deploy` from `main` = tests → `clasp push` → update **both** deployments
   (web app + API) in place. Never `clasp create-deployment` (new URL). Check the "Pushed N files" list:
   `.claspignore` allows `*.gs`, `*.html` and `appsscript.json` at the root, nothing else. The push replaces the whole live project
   with git (`--force` lets it overwrite the manifest too): any edit made in the Apps Script editor, `.gs`, `.html` or
   `appsscript.json`, is lost unless it is in git first. (Without `--force`, a live manifest that differs, even by line endings, made clasp print
   "Skipping push." and the deploy re-cut the old code: 2026-10-07.)
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
- Mail goes through `mail_()` and sharing checks TEST_MODE: never call `MailApp` / `addEditor` directly. Build the HTML
  with `mailHtml_()` (Mail.gs); the tests fail on any mail that skips it.
- Pure logic lives in Matching.gs / Rules.gs (unit-tested); everything touching Google services is tested on the mock
  (`test/mockgas.js`); extend the mock when you use a new Apps Script API.
- Dashboard actions go through `webRun(action, args)`; long ones take a time budget so they end before Vercel's 300 s.
  In the UI they live in `frontend/src/lib/vic/actions.tsx` (`useActions()`): anything that writes, shares or mails
  previews and confirms first.
- New setting: add it to `SETTINGS_DEFAULTS` (Config.gs) and to `SETTING_UI` in
  `frontend/src/app/settings/components/settings-form.tsx`.

## Gotchas

- The mock can't catch Apps Script quirks (protections, validations, locale parsing, trigger auth): verify on the live
  Master in TEST_MODE.
- Admins can only change members / cover / apply fixes if they can edit the Binome Sheets folder.
- The script runs on the `vic-recruitment` Cloud project, so Google APIs are not auto-enabled: "Permission denied while
  enabling APIs: X" = enable API X in that project (Drive is needed; see [docs/vercel.md](docs/vercel.md#rebuilding-the-google-cloud-side-if-ever-needed)).
- `clasp logs` doesn't work here (no GCP project ID set for clasp); use Apps Script › Executions.
- Vercel project settings that must stay as they are (Root Directory `web`, files outside the root included):
  [docs/vercel.md](docs/vercel.md#vercel-project-settings).
- Screenshots of the UI: the default browser (Obscura) doesn't draw Tailwind's `rounded-full`; use Chrome
  (`playwright-chrome`).
- Personal data: `test/data/` (2025 exports) is git-ignored; never commit candidate data.
