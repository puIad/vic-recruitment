## Agent skills

### Issue tracker

GitHub Issues on puIad/vic-recruitment-2026, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when first needed. See `docs/agents/domain.md`.

## Members can't open the Master

The web app runs as the signed-in user. `webAccess`, `webPulse`, `webState`, `memberSet`, `interviewGet`, `interviewSave` and `webApply` run as a member for members, and a member has no access to the Master.

- Nothing on a member's path may read through `ss_()`, `S_()`, `loadTable_` or `fmt_` without its `tz`, even inside a `try`. Google fails the whole call as it ends, with no stack, whatever the script caught.
- New Master data for members goes through `binSlices_` or a script property. They can also read their own binome sheet.
- `m.call` in the tests fails on such a read, so test a new member field through `m.call` as a member. A test that signs in as an admin proves nothing here.
- After a deploy that touches a member's path, find a non-admin's `webState` with `ok:true` in the Vercel logs before calling it live. Check the email against the Master's sharing list.
