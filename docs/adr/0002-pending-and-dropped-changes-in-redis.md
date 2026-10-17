---
status: accepted (while ADR 0001 stands; see the fallback below)
---

# Pending and dropped changes are kept in Upstash Redis next to the queue

Vercel Queues can't list one person's messages, so the author's pending changes after a reload or on another device,
their dropped changes, and the record the sync reads for the email and the 24 h admin alert need a second store. They
go in **Upstash Redis, added through the Vercel Marketplace**: one record per author, written by the accept step
(before the queue publish) and by the applier, read by the author's pages and, through a secret-guarded Vercel
endpoint, by the sync. The Master stays the source of truth; Redis holds only changes that are not in the sheet.

## Considered options

- **Vercel Blob or Edge Config**: Hobby includes 2,000 Blob uploads and 100 Edge Config writes a month, under one busy
  day.
- **Apps Script (a Master tab or script properties)**: a drop for lost access or an expired token happens when the
  author's token no longer works, and Vercel holds no club-account token, so some drops could never be written.
- **Browser storage only**: covers a reload, not another device, and can't drive the email or the admin alert.
- **Upstash on its own account**: same store, one more account to hand over.

## Consequences

- Two writes per accept (Redis, then the queue); either failing sends that save down the direct-write path.
- Marketplace integrations don't move with a project transfer, so the handover to vic.rh has to move or recreate the
  store.
- If the accept-step spike sends the path to Cloudflare Durable Objects, each author's object holds these records and
  Redis is not added.

Decided on [Where pending and dropped changes are kept, since a queue can't be listed](https://github.com/puIad/vic-recruitment-2026/issues/54),
2026-10-17.
