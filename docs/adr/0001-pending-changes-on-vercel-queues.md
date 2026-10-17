---
status: accepted (the accept-step spike held with the accept step inside api/run.js; built next season, docs/plans.md)
---

# Dashboard saves become pending changes on Vercel Queues

Saves on the dashboard (Save settings, Resolve, Snooze, Mute, Unmute, My binome edits) took 23 to 30 s at the median,
mostly lock waits and the snapshot republish, and the owner fixed four rules: the screen changes in under 200 ms, the
change is safe within about 1 s, it keeps applying after the page closes, and it applies as the person with their own
short-lived token. So a save becomes a pending change: a Vercel function seals the token and publishes the change to
Vercel Queues, and a push consumer in the same project applies it through a new lean Apps Script entry that compares
each cell and writes it, without republishing the snapshot or reading the whole Master.

## Considered options

- **Fixing today's stack** (return right after the write, no republish): every `scripts.run` call costs 1.4 s p50 /
  2.1 s p95 before the script runs, so no change is safe within 1 s, and nothing retries once the page closes.
- **`waitUntil` with no store**: the work dies with the function (300 s on Hobby), so nothing is durable and retries
  can't last the token's hour.
- **Cloudflare Durable Objects**: can list one person's pending changes, which Queues can't, but needs a new account
  and a second codebase. It is the fallback if the accept step into Queues measures over 1 s at p95.
- **Supabase, Upstash QStash, Google Cloud Tasks**: Supabase pauses after 7 quiet days, QStash Free allows 1,000
  messages a day (under a busy day), Cloud Tasks needs billing.

## Consequences

- Vercel Queues is a public beta. If it breaks mid-season, the switch goes back to direct writes.
- A queue can't be listed, so the author's view after a reload and the record of dropped changes live somewhere else.
- Messages stay with the deployment that published them, which shapes how deploys and rollbacks are done (rules on
  [Deploying pending changes safely](https://github.com/puIad/vic-recruitment-2026/issues/58)).

Decided on [Pick the path: cheap fix or pending changes](https://github.com/puIad/vic-recruitment-2026/issues/52),
2026-10-17.
