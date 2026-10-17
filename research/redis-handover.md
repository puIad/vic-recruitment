# Research: handing the Marketplace Redis store over to vic.rh

Ticket [#60](https://github.com/puIad/vic-recruitment-2026/issues/60), map [#46](https://github.com/puIad/vic-recruitment-2026/issues/46).
Every source was read on **2026-10-17**; bracketed codes like [V1] point to the source list at the end, which also
gives each page's own "last updated" date where it shows one. Nothing was changed on Vercel, Upstash or Google: the
only account reads were three read-only Vercel API calls [R1].

**Question.** After recruitment, how does the Upstash Redis store from [ADR 0002](../docs/adr/0002-pending-and-dropped-changes-in-redis.md)
(added through the Vercel Marketplace, next to Vercel Queues from [ADR 0001](../docs/adr/0001-pending-changes-on-vercel-queues.md))
reach the club account `vic.rh@g.enp.edu.dz` with the rest of the Vercel side? What is lost, does it need downtime,
and does the Hobby plan allow it?

## Answer in short

- **Recreate the store; don't move it.** Upstash is not on Vercel's list of providers whose resources move between
  teams or with a claimed project (Neon, Supabase, Prisma) [V4][V5], and moving the whole integration needs the person
  doing it to be a member of vic.rh's team, which Hobby doesn't allow [V2][V8][V9]. Nothing is lost by recreating,
  because Redis only holds changes that are not in the sheet yet [R3], and Upstash archives a free database after at
  least 30 idle days anyway [U6], so the store has to be recreated before each season regardless of the handover.
- **Move the project with a claim link (or a Pro trial).** Two Hobby accounts can't share a team, so the dashboard's
  Transfer button only works if vic.rh first opens its one free Pro trial team and invites the owner [V1][V11].
  The other documented path between different owners is Claim Deployments: the owner creates a transfer request and
  vic.rh opens the claim URL within 24 hours [V5][V7]. Vercel says a project transfer has zero downtime [V1].
- **Drain the queue first.** Vercel's transfer docs say nothing about Vercel Queues either way (not found) [V1].
  Messages stay with the deployment that published them until acknowledged or expired [V16], so the safe order is:
  pending changes off, wait out the message retention, then transfer.
- **Before launch:** the app must run with pending changes off and no Redis env vars at all, and read the store
  with `Redis.fromEnv()` so a new store needs a reconnect and a redeploy, not a code change. Install the store as
  Upstash's Vercel-managed Free plan, for this project only.

## Facts about today's setup

- The Vercel account is on **Hobby** (`billing.plan: "hobby"`), has one team (`puiad's projects`, the free team every
  personal account became in 2024 [V10]) and that team holds **9 projects**, of which only `vic-recruitment` is
  this app. No integration is installed yet, so Upstash has not been added [R1].
- So "hand the whole Vercel account to vic.rh" (adding vic.rh's email to the account) would hand over eight
  unrelated projects. It is left out below.
- `web/vercel.json` defines no `env` or `build.env`, so every env var lives in Project Settings, which a project
  transfer copies [V1][R4].
- The production URL `https://vic-recruitment.vercel.app` is a registered OAuth redirect URI [R4]. A transfer keeps
  the project name unless the target team already has a project with that name [V1], and domains and aliases are
  transferred [V1]. Keep the name.

## Option (a): add vic.rh as a member of the current team

| | |
|---|---|
| Hobby allows it? | **No.** Hobby has no team collaboration features [V8]; "Upgrade from the Hobby plan to Pro to add team members" [V9]. When a Pro trial falls back to Hobby, "All team members will be removed" [V11], so a Hobby team is one person. |
| On Pro | Developer seats cost $20 per user per month; Viewer seats are free [V8]. Owners can be promoted, then the old owner removed or demoted [V12]. During a Pro trial the team is capped at one Owner and owners can't change [V11][V12]. |
| Redis data, env vars | Nothing moves, so nothing is lost. But an integration's access token belongs to the person who installed it; if that person loses access to the team the integration is disabled, and if nobody re-enables it within 30 days it is removed along with its env vars [V13]. |
| Downtime | None (nothing moves). |
| Verdict | Breaks the free-tiers-only rule, and the owner's team also holds 8 unrelated projects [R1]. Not viable. |

## Option (b): transfer the project to a team vic.rh owns

**Who can do it.** The dashboard flow needs the person transferring to be an owner of the source team and a member of
the target team [V1]. Between two Hobby accounts that is impossible (see (a)). Two documented ways around it:

1. **Claim Deployments.** The owner calls `POST /projects/{idOrName}/transfer-request`, which returns a code valid
   for 24 hours [V7]; vic.rh opens `https://vercel.com/claim-deployment?code=…` and picks a team in its own account [V5].
   Vercel describes it as a way to transfer "projects between different accounts with different owners", including
   moving personal projects to an organisation's account [V5]. The page does not say whether the target may be a
   Hobby team (not found); it puts no plan limit on it.
2. **Pro trial.** vic.rh creates a team with its one Pro trial (one per user account, 14 days, up to 10 members, no
   payment method needed) [V11], invites the owner as a Member, and the owner uses Settings › General › Transfer [V1].
   With no payment method the team reverts to Hobby when the trial ends, members are removed, and nothing is charged
   [V11]. The transfer page also says a target team without "a valid payment method" must add one first "to avoid any
   interruption in service" [V1]; it doesn't say whether that applies to a trial or Hobby target (not found).

**What moves** [V1]: deployments, environment variables (except `vercel.json` `env`/`build.env`), configuration,
domains and aliases, project name, builds, Git repository link, security settings, cron jobs, function region.
**What doesn't**: integrations ("must be added again after the transfer is complete"), usage (reset), log data,
monitoring data, Blob and Global Config (separate mechanisms) [V1].

| | |
|---|---|
| Hobby allows it? | Yes through Claim Deployments as documented; through the dashboard only with vic.rh's Pro trial. |
| Redis data | Not moved. Through a claim, only Neon, Supabase and Prisma resources go with the project [V5]. The store stays in the owner's team. |
| Integration env vars | The transfer page lists env vars as copied and integrations as not transferred, and doesn't say which applies to an integration's own env vars (not found). Disconnecting the store first removes them [V2], so nothing pointing at the owner's store travels. |
| Downtime | "Zero downtime"; the original project is hidden; the transfer takes 10 s to 10 min, during which no new deployments or settings edits are possible [V1]. |
| Verdict | **Use this for the project.** |

## Option (c): transfer the Upstash integration or the store

Two Vercel mechanisms exist:

- **Transfer the whole integration installation** (installation, its resources, prepayment balances) [V2]. Checks
  that block it: the person transferring must be an Owner or Member of the target team; the integration must support
  transfer ("Some integrations do not support transfer"); it must be a native integration, not a connectable account;
  the target must not already have it installed; **no active project on the source team may be connected to its
  resources** [V2]. Disconnecting removes the integration's env vars from each project; existing production
  deployments keep running with the env vars they were built with, "but new deployments fail until you reconnect"
  [V2]. The target ends with a single owner on the integration [V2]. If the button works but says "Feature not
  enabled for your team", support has to turn it on [V2]. Whether Upstash supports this transfer: not found.
- **Transfer one resource** (one database) without deleting and recreating it: Owner or Member on both teams, the
  target already has the integration, all projects disconnected; the destination takes over billing; not reversible
  [V3]. Supported providers at launch were Prisma, Neon and Supabase, "with additional providers and product support
  coming soon" [V4]; the Claim Deployments page (updated 2026-08-21) still lists only Neon, Supabase and Prisma [V5].
  **Upstash is not listed.**
- **Upstash's own team move** (`POST /redis/move-to-team`) [U3] works on Upstash-owned accounts and teams: a team
  owner role can't be reassigned, only the creator can delete the team, and a user can own up to 5 teams [U2]. With
  the Vercel-managed setup the database is handled from the Vercel dashboard [U1]; whether such an account can use
  Upstash teams is not stated, though Upstash says linking an existing Upstash account is what gives "features on
  Upstash Console such as teams" [U1].

| | |
|---|---|
| Hobby allows it? | Integration transfer: only if the owner is a member of vic.rh's team, so only during vic.rh's Pro trial [V2][V11]. Resource transfer: not for Upstash [V4][V5]. |
| Redis data | Kept, if a transfer works. |
| Env vars | Removed on disconnect, restored on reconnect in the target team [V2]. Whether the URL and token keep the same values after the move: not found. |
| Billing plan | Free or unbilled integrations skip the payment-method step; paid ones need a payment method on the target [V2]. Nothing says a free Upstash plan stays free after the move (not found). |
| Downtime | The project must be disconnected first, so the app runs without Redis until reconnected [V2]. |
| Verdict | Not available for Upstash as documented, and it would keep data that has no value after the season. |

## Option (d): recreate the store

Steps: vic.rh's team installs Upstash for Redis from the Marketplace, picks the plan and region, creates the
database and connects the project; Vercel injects the credentials as env vars [V3][V15]. The owner then uninstalls the
integration in the old team, which "automatically removes all associated products and their data" [V3].

| | |
|---|---|
| Hobby allows it? | Yes. Native integrations and Marketplace storage are on all plans [V3][V15]. Every Upstash account starts with one free database, no card needed [U4]. |
| Redis data | Lost, by design. ADR 0002 keeps only changes that are not in the sheet [R3]; with every pending change applied or dropped and every dropped change answered, there is nothing to keep. Upstash can also back up and restore or import an RDB file [U8][U9] if a season ever ends with records worth keeping. |
| Env vars | Same names from the same integration (unless a custom prefix is set at connect time [V3]); new values. Existing deployments don't get new variables: redeploy after connecting [V3]. Upstash's guide names `KV_REST_API_URL` and `KV_REST_API_TOKEN` for the Vercel integration [U10]; `Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` or falls back to `KV_REST_API_URL`, and the same for the token [U11]. The full list the integration injects: not found in either vendor's docs. |
| Billing plan | A new Free database: $0, 250 MB, 500K commands a month [U4][U5]. |
| Downtime | None for users if pending changes are off (direct writes) while the store is swapped. |
| Verdict | **Use this for the store.** |

**Idle free databases are archived.** "Free tier databases are archived after a minimum of 30 days of inactivity",
with several warning emails first; archival backs up the data and removes the database instance, and the data can
be restored into a new database from the Upstash Console [U6]. The docs don't say whether this differs for
Vercel-managed accounts (not found). Recruitment runs about five weeks a year, so a free store will be archived
between seasons and the env vars will point at a removed instance. Recreating before each season is the normal
procedure, and the handover is the same procedure run once in vic.rh's team.

## Vercel Queues and a project transfer

- Queues is a public beta available on all plans [V17]. Topics are project-scoped [V16].
- Topics are "partitioned by deployment ID by default"; in push mode Vercel delivers messages back to the deployment
  that published them, and keeps invoking and retrying that deployment's consumers until every message it published
  is acknowledged or expires [V16]; ADR 0001 already plans deploys around this [R2]. Retention is per message, 60 s
  to 7 days, default 24 h [V16][V18].
- The transfer page lists deployments as transferred and doesn't mention Queues in either list [V1]. **Whether topics
  and in-flight messages move with a project transfer: not found.**
- So drain before transferring: turn pending changes off, let every message be acknowledged or expire (the longest
  retention the app sets, 24 h if it uses the default), then transfer. The trigger config (`experimentalTriggers` in
  `vercel.json` [V17]) is in the repo and needs no move.

## Upstash billing after a transfer, and who gets the emails

- **Free stays free?** For the integration transfer, "Free or unbilled integrations skip" the payment-method step
  [V2]. In the claim flow the provider checks whether the transfer "will result in new billing plan for target team"
  [V6]. No page states that a free Upstash plan stays free after a transfer (not found). With option (d) the
  question goes away: vic.rh's store is a new Free database [U4].
- **Invoices.** For native integrations Vercel issues the invoices [V14], and only users with the Owner or Billing role
  can see them [V13][V14]; on Hobby that is the account holder. A Free plan has no invoice.
- **Upstash's own emails** (archival warnings [U6], payment failures [U7]): for an Upstash-owned account the billing
  email is set under Account › Billing [U7]. Who receives them for a Vercel-managed Upstash account: not found.

## Recommended handover sequence (after recruitment)

1. **Owner:** turn pending changes off (direct writes). Wait until no pending change is left, every dropped change is
   answered, and the queue's retention has passed.
2. **Owner:** in the old team, disconnect the Redis store from `vic-recruitment` (Integrations › Upstash › the
   database › Projects). Vercel removes its env vars; the running deployment keeps its own [V2][V3].
3. **vic.rh:** sign up to Vercel (Hobby) with `vic.rh@g.enp.edu.dz`.
4. **Transfer `vic-recruitment`, keeping its name.** Either the owner creates a transfer request and vic.rh opens the
   claim URL within 24 hours [V5][V7], or vic.rh starts its Pro trial team, invites the owner, and the owner transfers
   from Settings › General [V1][V11]. Expect 10 s to 10 min, no deployments meanwhile [V1].
5. **vic.rh:** install Upstash for Redis from the Marketplace (let Vercel create the Upstash account), Free plan,
   region `us-east-1` next to `iad1` [R5], connect it to `vic-recruitment` with no custom prefix, redeploy.
6. Turn pending changes on, make one save, check it lands in the sheet; turn it off again until next season if
   wanted.
7. **Owner:** uninstall Upstash in the old team (deletes the old database) [V3]. If the Pro-trial route was used,
   let the trial lapse with no payment method so the team returns to Hobby [V11].
8. Before each later season: if Upstash archived the store [U6], delete it, create a new Free database, reconnect,
   redeploy (steps 5 and 6).

## Do before launch to keep the handover cheap

1. **Make Redis disposable in code.** With pending changes off, the app must not touch Redis at all (no reads of
   pending or dropped records either), so it runs with the store disconnected or gone. Read the store through
   `Redis.fromEnv()` [U11] (or exactly the names the integration injects, no custom prefix), so a recreated store
   needs only a reconnect and a redeploy.
2. **Install it the cheap-to-remove way.** Use the Marketplace's "Create New Upstash Account" option on the Free
   plan, with no payment method, used by `vic-recruitment` only; don't link an existing Upstash account (connectable
   accounts can't use Vercel's integration transfer [V2], and it adds an account to hand over, which ADR 0002 avoided
   [R3]). Write the env var names the install created into `docs/reference.md`.

## Open points (not found or not checked)

- Whether Vercel Queues topics and in-flight messages move with a project transfer [V1][V16].
- Whether Upstash supports Vercel's integration transfer, and when Upstash joins resource transfer [V2][V4].
- Whether a Claim Deployments transfer accepts a Hobby target team [V5].
- Which env vars the Upstash integration injects beyond `KV_REST_API_URL` / `KV_REST_API_TOKEN` [U10].
- Who receives Upstash's archival warnings for a Vercel-managed account [U6].
- Not checked: whether vic.rh's Vercel account needs its own GitHub access to `puIad/vic-recruitment-2026` for
  push-to-deploy after the transfer (the Git link itself is transferred [V1]).

## Sources

All read 2026-10-17. "Updated" is the page's own last-updated or publish date.

| Code | Source | Updated |
|---|---|---|
| V1 | https://vercel.com/docs/projects/transferring-projects | 2026-09-08 |
| V2 | https://vercel.com/docs/integrations/install-an-integration/transferring-an-integration | 2026-05-05 |
| V3 | https://vercel.com/docs/integrations/install-an-integration/product-integration | 2026-09-17 |
| V4 | https://vercel.com/changelog/transfer-marketplace-resources-between-teams | 2026-03-31 |
| V5 | https://vercel.com/docs/deployments/claim-deployments | 2026-08-21 |
| V6 | https://vercel.com/docs/integrations/create-integration/marketplace-flows (Resources with Claim Deployments) | 2026-09-17 |
| V7 | https://vercel.com/docs/rest-api/projects/create-project-transfer-request | not shown |
| V8 | https://vercel.com/docs/plans/hobby | 2026-09-14 |
| V9 | https://vercel.com/docs/accounts | 2026-09-21 |
| V10 | https://vercel.com/changelog/2024-01-account-changes | 2024-01-11 |
| V11 | https://vercel.com/docs/plans/pro-plan/trials | 2026-09-14 |
| V12 | https://vercel.com/kb/guide/how-do-i-transfer-ownership-of-a-vercel-team | 2026-10-02 |
| V13 | https://vercel.com/docs/integrations/install-an-integration/manage-integrations-reference | 2026-09-17 |
| V14 | https://vercel.com/docs/integrations/create-integration/billing | 2026-08-28 |
| V15 | https://vercel.com/docs/marketplace-storage | 2026-09-17 |
| V16 | https://vercel.com/docs/queues/concepts | 2026-09-10 |
| V17 | https://vercel.com/docs/queues | 2026-09-03 |
| V18 | https://vercel.com/docs/queues/pricing | 2026-08-12 |
| U1 | https://upstash.com/docs/redis/howto/vercelintegration | not shown |
| U2 | https://upstash.com/docs/common/account/teams | not shown |
| U3 | https://upstash.com/docs/devops/developer-api/redis/moveto_team | not shown |
| U4 | https://upstash.com/docs/redis/overall/billing | not shown |
| U5 | https://upstash.com/pricing/redis (FAQ) | not shown |
| U6 | https://upstash.com/docs/redis/help/faq ("What happens if my database is not used?") | not shown |
| U7 | https://upstash.com/docs/common/account/faq | not shown |
| U8 | https://upstash.com/docs/redis/features/backup | not shown |
| U9 | https://upstash.com/docs/redis/howto/importexport | not shown |
| U10 | https://upstash.com/docs/redis/tutorials/nextjs_with_redis | not shown |
| U11 | https://github.com/upstash/redis-js/blob/main/packages/redis/platforms/nodejs.ts (`fromEnv`, lines 193 to 221) | main |
| R1 | Vercel API, read-only: `GET /v2/user` (plan `hobby`), `GET /v2/teams` (one team), `GET /v9/projects` (9 projects), `GET /v1/integrations/configurations` (none) | 2026-10-17 |
| R2 | [ADR 0001](../docs/adr/0001-pending-changes-on-vercel-queues.md) | 2026-10-17 |
| R3 | [ADR 0002](../docs/adr/0002-pending-and-dropped-changes-in-redis.md) | 2026-10-17 |
| R4 | [docs/vercel.md](../docs/vercel.md), `web/vercel.json` | main |
| R5 | `research/pending-change-store.md` on branch `research/pending-change-store` (region `iad1` = AWS `us-east-1`) | 2026-10-17 |
