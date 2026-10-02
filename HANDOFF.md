# HANDOFF — working on VIC Recruitment 2026

For whoever picks this up next (person or agent). Current state and next steps: [STATUS.md](STATUS.md). Background,
IDs and design: [docs/](docs/README.md) — open only what the task needs.

## Owner

Mourad Fernane — `mourad_islam.fernane@g.enp.edu.dz` (owns the Master, the triggers, the Cloud project and Vercel).
Repo: https://github.com/puIad/vic-recruitment-2026 (its own repo, not the AI-OS one).

## How changes ship

1. A branch per change, `npm test`, a PR into `main`. CodeRabbit reviews; fix its findings on the branch.
2. After merge: `npm run deploy` from `main` = tests → `clasp push` → update **both** deployments (web app + API) in
   place. Never `clasp create-deployment` (new URL). Vercel deploys `web/` from `main` by itself.
3. Check the "Pushed N files" list: `.claspignore` allows `*.gs`, `*.html` and `appsscript.json` at the root, nothing else.
4. Bump `API_VERSION` in WebApp.gs **and** web/index.html together only when `webAccess` / `webState` / `webRun` change shape.
5. Update STATUS.md (live versions, next steps); put lasting facts in the right `docs/` file, not in STATUS.

## Rules of the code (details in [docs/architecture.md](docs/architecture.md))

- Every write to the Master happens inside `withLock_`. A run that writes Binomes or Interviewees calls
  `detectEdits_(ctx)` after `loadCtx_()` and `commitBase_(ctx)` after writing, or its own writes get flagged as manual edits.
- Mail goes through `mail_()` and sharing checks TEST_MODE: never call `MailApp` / `addEditor` directly.
- Pure logic lives in Matching.gs / Rules.gs (unit-tested); everything touching Google services is tested on the mock
  (`test/mockgas.js`) — extend the mock when you use a new Apps Script API.
- Dashboard actions go through `webRun(action, args)`; long ones take a time budget so they end before Vercel's 300s.
- New setting: add it to `SETTINGS_DEFAULTS` and to `SETTING_UI` in web/index.html.

## Gotchas

- The mock can't catch Apps Script quirks (protections, validations, locale parsing, trigger auth): verify on the live
  Master in TEST_MODE.
- Admins can only change members / cover / apply fixes if they can edit the Binome Sheets folder.
- The script runs on the `vic-recruitment` Cloud project, so Google APIs are not auto-enabled: "Permission denied while
  enabling APIs: X" = enable API X in that project (Drive is needed; see [docs/vercel.md](docs/vercel.md#rebuilding-the-google-cloud-side-if-ever-needed)).
- `clasp logs` doesn't work here (no GCP project ID set for clasp); use Apps Script › Executions.
- Obscura (default browser) doesn't support `<form method="dialog">`: see [docs/testing.md](docs/testing.md#local-previews).
- Personal data: `test/data/` (2025 exports) is git-ignored; never commit candidate data.
