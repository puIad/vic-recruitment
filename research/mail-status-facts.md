# What the script can know about the mail it sends

Research for [#174](https://github.com/puIad/vic-recruitment/issues/174), a child of the map
[#166](https://github.com/puIad/vic-recruitment/issues/166) (dashboard features that replace opening the sheets).
Read on 2026-10-29. Code: this repo at `main` 937459b; the landing site `puIad/vic-enp` at `origin/main` 1512d04,
read only. Google pages are cited with their "Last updated" date. Every claim below carries its source; where a
Google page is silent, this says so instead of guessing.

## The answer in short

1. **A send returns nothing usable.** `MailApp.sendEmail` returns `void`. The script learns only that the call
   returned or threw. There is no message id, no thread id and no delivery result. [S1]
2. **Google never tells the script about delivery.** A bounce arrives later as an ordinary mail from
   `mailer-daemon@googlemail.com` in the sender's Inbox or Spam. [S9] MailApp "cannot access a user's Gmail inbox". [S1]
3. **Reading Sent or bounces needs a restricted Gmail scope** (`https://mail.google.com/` for GmailApp,
   `gmail.readonly` or `gmail.metadata` for the Gmail API). [S2][S6] The Cloud project's consent screen is Internal,
   so Google's verification is not needed [S10], but every signed-in admin would have to grant the new scope, and
   each bounce sits in the mailbox of the account that sent that mail.
4. **The sender is whoever the script runs as.** Timed triggers and the mailer send as `vic.rh`. Every dashboard
   action, including the dashboard's Sync now, Check integrity and digest buttons, sends as the signed-in admin.
   [S11][S12][S13]
5. **Quota: 1,500 recipients a day per user** on a Google Workspace account (100 on a consumer account), reset 24 h
   after the first request. The page does not split Workspace by edition. `vic.rh` read 1,500 on 22 Oct. [S7]
6. **So the script must record every outcome itself:** what it tried, to whom, as which account, when, and whether
   the call returned, threw or was held by TEST_MODE. Google keeps no per-mail record the script can read without a
   new restricted scope.

## What Google gives the script

### What a send returns

| Call | Returns | Scope | Scope class |
|---|---|---|---|
| `MailApp.sendEmail(...)` (all four forms; the one used here) | `void` [S1] | `script.send_mail` [S1] | not a Gmail API scope |
| `GmailApp.sendEmail(...)` | `GmailApp`, "the Gmail service, useful for chaining" [S2] | `https://mail.google.com/` [S2] | Restricted [S6] |
| `GmailApp.createDraft(...)` then `GmailDraft.send()` | `GmailMessage` (so `getId()`, `getThread()`) [S2][S3] | `https://mail.google.com/` [S3] | Restricted [S6] |
| Advanced Gmail service, `Gmail.Users.Messages.send` | a `Message` resource: `id` ("the immutable ID of the message"), `threadId`, `labelIds` [S4][S5] | `gmail.send` is enough [S4] | Sensitive, not Restricted [S6] |

- `MailApp.getRemainingDailyQuota()` returns an `Integer`, "the number of recipients you can send emails to for the
  rest of the day". It "is valid for the current execution and might vary between executions". Scope:
  `script.send_mail`, which the script already has. [S1]
- `GmailApp` has no quota method; it is on `MailApp` only. [S1][S2]
- The advanced Gmail service "uses the same objects, methods, and parameters as the public API" and must be enabled
  before use. [S8] It is the only route to a message id without a restricted scope.
- A message id alone proves acceptance, not delivery. Delivery failure still comes back only as a bounce mail. [S9]

### Reading the Sent folder and bounces

- MailApp's "sole purpose is sending email" and it "cannot access a user's Gmail inbox". [S1]
- `GmailApp.search(query)` returns `GmailThread[]` and needs `https://mail.google.com/`. On a large result it "will
  fail when the size of all threads is too large"; the paged form `search(query, start, max)` is the answer. [S2]
- Gmail API read scopes: `gmail.readonly` ("View your email messages and settings") and `gmail.metadata` (labels
  and headers, not the body) are both Restricted. [S6]
- A bounce: "you get an automated bounceback email with an error message", from "Mail Delivery Subsystem
  (mailer-daemon@googlemail.com)", often titled "Delivery Status Notification (Failure)"; look in Inbox and Spam. [S9]
- Restricted scopes normally need OAuth verification and, for data stored on servers, a security assessment. [S6]
  An Internal app ("only used by people in your Google Workspace or Cloud Identity" organization, project owned by
  it) does not need verification, though an organization admin may still have to approve it. [S10] This project's
  consent screen is Internal (`docs/reference.md:38`, `docs/vercel.md:187`).
- Cost of adding one here: the dashboard's sign-in asks for every script scope, and `scripts.run` refuses a token
  that lacks one (`web/lib/session.js:10-22`; [S12]). A new Gmail scope means every admin signs in again, as the
  `script.external_request` change did on 2026-10-18 (`STATUS.md:68`).
- Whose mailbox: a script can only read the mailbox of the account it runs as. Bounces of mail sent by the timed
  sync land in `vic.rh`'s mailbox; bounces of mail an admin sent from the dashboard land in that admin's own mailbox,
  readable only while that admin runs the script.
- **Not settled:** none of the Google pages read says whether mail sent through MailApp is filed in the sender's
  Sent folder. Check `vic.rh`'s Sent folder by hand before designing on it.
- No page read offers a read or open receipt for either service.

### Which account sends

- `Session.getEffectiveUser()`: "the user under whose authority the script is running". For a web app set to
  "execute as me" it is the developer; under an installable trigger it is "the account of the user who created the
  trigger"; otherwise the same as `getActiveUser()`. Scope `userinfo.email`, which the script already has. [S11]
- Installable triggers "always run under the account of the person who created them", and "the email is always
  sent from your account". [S13]
- Web app "Execute as: Me" runs "as you, the owner of the script, no matter who accesses the web app"; "User
  accessing" runs "under the identity of the active user". [S14]
- `scripts.run`: the OAuth token is one "the script requires when executing" and "must cover all the scopes used by
  the script". [S12] Google does not say "runs as the caller" in those words; this repo confirmed it live: the
  production log shows each caller's email (`docs/load-test.md:680`).
- MailApp's `name` option only sets the display name; `replyTo` defaults to "the user's email address". [S1] So a
  candidate who replies to a quick-fix mail reaches the admin who sent it.

How that maps here:

| Run | Runs as | Source |
|---|---|---|
| `syncAll` (timed), `sendDailyDigest` (daily), `onFormSubmitHandler` (form submit) | the trigger creator, `vic.rh` (`TRIGGER_OWNER`) | `Setup.gs:176-181`, `docs/reference.md:50`, `STATUS.md:368` |
| Every dashboard button (`webRun`), Vercel front through `scripts.run` or the old HtmlService page | the signed-in admin (members for their three member actions) | `WebApp.gs:794`, `web/api/run.js:79-81`, `appsscript.json:24-30` |
| Master menu items (Sync now, Lock, Send me the digest now, Email binome members…) | whoever clicks | `Setup.gs:5-20` |
| The registration mailer (`mailer/`) | `vic.rh` (web app, `USER_DEPLOYING`) | `mailer/appsscript.json:9-12`, `mailer/Code.gs:2` |

The run, not the mail, picks the sender. The sync cycle (`runCycle_`) sends confirmations, new-interviewee mails,
alert mails and drop mails. When the timed trigger runs it they go out as `vic.rh`; when an admin presses Sync now
or Check integrity on the dashboard (`WebApp.gs:816`, `:820`), or the digest button (`:839`), the same mails go out as
that admin.

### Daily quotas

From the Apps Script quotas page [S7], "per user and reset 24 hours after the first request":

| Quota | Consumer accounts (gmail.com) | Google Workspace accounts |
|---|---|---|
| Email recipients per day (for example, with MailApp) | 100 / day | 1,500 / day |
| Email recipients per day within domain | 100 / day | 2,000 / day |
| Email recipients per message | 50 / msg | 50 / msg |
| Email body size | 200 KB / msg | 400 KB / msg |
| Triggers total runtime | 90 min / day | 6 hr / day |

- Edition: the page has two columns only, consumer and Google Workspace. Its one qualifier is the footnote on the
  recipients rows: "Additional limits apply for trial accounts", raised once the domain has paid USD 100 and 60 days
  have passed. [S7] Nothing on the page sets a different figure for Workspace for Education. ENP's edition is
  not recorded anywhere in this repo.
- What the account actually gets: `getRemainingDailyQuota()` for `vic.rh` returned 1,500 on 22 Oct
  (`docs/registration-form.md:181`), the Workspace figure, so `vic.rh` is not on a trial or consumer limit. The
  mailer's ping reports the live figure on the site's `/api/health` as `mailQuota` (`mailer/Code.gs:52-55`).
- Most recipients are in `@g.enp.edu.dz`: the mailer refuses any other domain (`mailer/Code.gs:40`) and the site's
  form proves an ENP address, but the bound script never checks the domain. The page does not say how its 1,500 row
  and its 2,000 within-domain row combine; plan on 1,500, the number the account reports.
- Admin accounts are ordinary users in the same domain, so each has its own 1,500, separate from `vic.rh`'s.
- Gmail's own limit for a Workspace user is 2,000 messages a day (500 on a trial); going over blocks sending "for up
  to 24 hours". That page adds: "Quotas might be different if you're using Google Apps Script." [S15]
- Every call here sends to one address, so one call uses one recipient of the quota. The ticket mails, the sync's
  mails and the timed digest all draw on `vic.rh`'s single 1,500.
- An exhausted quota shows up as an exception from the send. The quotas page gives example texts ("Service invoked
  too many times for one day…") but not the exact email one. [S7]

## What the script must record itself

Google provides only "the call returned" or "the call threw" at send time, plus the running account's remaining
quota. Everything a status view needs beyond that, the script writes down when it sends:

- **The attempt:** which mail (`CONFIRM`, `NEW_IV`, `ALERT`, the ticket, …), the recipient, the time, and the
  record it concerns (interviewee code, binome, alert id).
- **The sender:** `Session.getEffectiveUser().getEmail()` at send time. Nothing else says which mailbox a bounce will
  land in.
- **The outcome as the script sees it:** sent (the call returned), held (TEST_MODE, a decision Google never sees),
  or failed (the exception text).
- **The quota after the send**, if the view should warn before it runs out: `MailApp.getRemainingDailyQuota()`, per
  sending account.
- **Delivery (bounced or not) cannot be recorded by MailApp at all.** It needs a Gmail read scope and a later pass
  over each sending account's inbox, matched to the attempt by recipient and time, since MailApp gives no id.

## What the code records today

`mail_()` is the one send for the bound script (`Sheets.gs:322-332`). It returns `true` when `MailApp.sendEmail`
returned, `false` when TEST_MODE held a non-admin recipient (`:324-327`) or the call threw (`:331`). A failure is
logged with `console.error('Mail to ' + to + ' failed: ' + e)`, so the address lands in the execution log and nowhere
else. `_mailsSent` (`:320`, `:323`) counts calls, including held and failed ones, and is logged in the `cycle` and
`digest` lines (`Sync.gs:317`, `Actions.gs:231`). The paths differ in what they keep:

| Mail | What is kept | Written | Source |
|---|---|---|---|
| Alert mails | Alerts tab, `Emailed To`: the intended recipients | before the send, whatever the outcome | `Sheets.gs:289-299` |
| Quick-fix mails | `Emailed To` of each alert, extended | after the call, ignoring its result | `QuickFix.gs:602-606` |
| Confirmation | `CONFIRMED <date>` in Flags | before the send, so a failed send is never retried | `Registrations.gs:265` |
| Rejection | `Rejection sent dd/MM` in Screening | only when the send returned `true` | `Screening.gs:240-241` |
| PAIRED, JOINED | `code\|email` in the `PAIRED_SENT` script property | only on `true` | `Team.gs:336-363`, `Members.gs:163-167`, `:267-270` |
| Drop mail | `DROPS_MAILED` script property, reported to `api/drops` on the next cycle | only on `true` | `Pending.gs:244-250` |
| Ticket (mailer) | per-hour outcome counts `code.sent` / `code.not_sent` in Redis, no address | after the mailer answers | VIC-ENP `api/_lib/ticket.ts:94-104`, `api/_lib/tally.ts` |
| New interviewees, LEFT, COVER, COVERED, digest, test mail | nothing beyond the log line | | see the table below |

## Every mail path

All bound-script mails go through `mail_()` (`Sheets.gs:329`), most through `mailSend_()` (`Mail.gs:150`), so
TEST_MODE holds every non-admin recipient. The mailer and the site sit outside it: TEST_MODE does not reach them
(`mailer/Code.gs:13`).

| # | Mail | When it goes | Sends as | To | Send call |
|---|---|---|---|---|---|
| 1 | Registration ticket (`CODE`) | a candidate asks for a code on the site's `/apply`: `POST /api/code` → `sendTicket` → the mailer's `doPost` | `vic.rh` (mailer web app) | the candidate's ENP address | VIC-ENP `api/code.ts:5`, `api/_lib/ticket.ts:94`, `api/_lib/mailer.ts:15-16`; here `mailer/Code.gs:44` |
| 2 | Registrant confirmation (`CONFIRM`) | every sync cycle, for registrations read that run (`CONFIRM_REGISTRANTS`) | the cycle's runner: `vic.rh` on the timed sync, digest or form trigger; the admin on dashboard Sync now / Check integrity / digest / Lock | the registrant | `Registrations.gs:271`, called at `Sync.gs:310` |
| 3 | New interviewees (`NEW_IV`) | every sync cycle that assigned someone (`NOTIFY_BINOME_ON_NEW_INTERVIEWEE`) | the cycle's runner | each member of the binome | `Sync.gs:276` (`sendNewIntervieweeMails_`, `:264`) |
| 4a | Alert mail to admins | any `alerts.flush()` with new alerts at or above `INSTANT_EMAIL_MIN_SEVERITY`, not AUTO-FIXED | the runner of that flush | each address in `ADMIN_EMAIL` | `Sheets.gs:313` |
| 4b | Alert mail to a binome (`ALERT`) | the same flush, when the alert concerns a binome and `NOTIFY_BINOME_ON_ALERT` is on | the runner of that flush | the binome's members and whoever covers that interviewee | `Sheets.gs:309` |
| 5 | Drop mail ("your change was not applied") | timed cycles (`opts.timing`): sync, digest, dashboard Sync now / Check integrity; `api/drops` names the authors | the cycle's runner | the dashboard user whose change was dropped | `Pending.gs:247` (called at `Sync.gs:308`) |
| 6 | Binome assignment (`PAIRED`) | Lock (dashboard `WebApp.gs:832`, menu `Setup.gs:9`); the menu catch-up; dashboard New binome | the admin or menu user | each member of the binome | `Team.gs:350`, from `Team.gs:359` (Lock `:399`, menu `:372`) and `Members.gs:267` |
| 7 | Joined a binome (`JOINED`) | dashboard Change member / Swap members (`WebApp.gs:841-842`) | the admin | the incoming member | `Members.gs:163` |
| 8 | Left a binome (`LEFT`) | the same actions | the admin | the outgoing member | `Members.gs:168` |
| 9 | Cover assigned (`COVER`) | dashboard Add cover (`WebApp.gs:845`) | the admin | the cover | `Members.gs:460` |
| 10 | Binome told of a cover (`COVERED`) | the same action | the admin | each member of the binome | `Members.gs:467` |
| 11 | Rejection (`REJECT`) | dashboard Rejections, Send (`WebApp.gs:852`); never automatic | the admin | each applicant declined at screening (not VIC members), not sent yet | `Screening.gs:240`; TEST_MODE copy to the admin `:232` |
| 12 | Quick-fix mails | dashboard quick action `send` on alerts (`WebApp.gs:847`, `QuickFix.gs:154`) | the admin | binome members, the candidate, or the interview form's submitter | `QuickFix.gs:602` |
| 13 | Daily digest | daily trigger at `DIGEST_HOUR` (`Setup.gs:181`); menu "Send me the digest now" (`Setup.gs:18`); dashboard digest (`WebApp.gs:839`) | `vic.rh` on the trigger; the clicker otherwise | each address in `ADMIN_EMAIL` | `Actions.gs:230` (after its own cycle, `:209`) |
| 14 | Test mail of an editable text | dashboard Settings › Emails, send a test (`WebApp.gs:853`) | the admin | the admin pressing it | `WebApp.gs:758` |

Where `alerts.flush()` runs, so where rows 4a and 4b can go out: the sync cycle (`Sync.gs:309`) and these dashboard
actions: reassign and delete application (`Actions.gs:22`, `:27`, `:96`), applying an edit fix (`Integrity.gs:257`),
member changes, new binome, tag, add and end cover (`Members.gs:171`, `:276`, `:343`, `:474`, `:534`), quick actions
(`QuickFix.gs:171`), restore (`Screening.gs:175`) and draft edits (`Team.gs:200`).

## Not settled

- Whether MailApp mail is filed in the sending account's Sent folder: no Google page read says. Check by hand.
- ENP's Workspace edition: not in the repo, and the quotas page does not distinguish editions. The 1,500 read on
  22 Oct is the working figure; `/api/health`'s `mailQuota` gives the live one for `vic.rh`.
- How the general 1,500 and the within-domain 2,000 rows combine: the page does not say.
- The exact exception text when the email quota runs out: not documented.

## Sources

- [S1] MailApp reference. https://developers.google.com/apps-script/reference/mail/mail-app (updated 2026-04-13)
- [S2] GmailApp reference. https://developers.google.com/apps-script/reference/gmail/gmail-app (updated 2026-04-13)
- [S3] GmailDraft reference. https://developers.google.com/apps-script/reference/gmail/gmail-draft (updated 2026-04-13)
- [S4] Gmail API, `users.messages.send`. https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send (updated 2026-04-15)
- [S5] Gmail API, `Message` resource. https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages (updated 2026-05-06)
- [S6] Gmail API scopes. https://developers.google.com/workspace/gmail/api/auth/scopes (updated 2026-09-10)
- [S7] Apps Script quotas. https://developers.google.com/apps-script/guides/services/quotas (updated 2026-09-03)
- [S8] Advanced Gmail service. https://developers.google.com/apps-script/advanced/gmail (updated 2026-09-03)
- [S9] Gmail Help, Fix bounced or rejected emails. https://support.google.com/mail/answer/6596
- [S10] Google Cloud Help, When is verification not needed. https://support.google.com/cloud/answer/13464323
- [S11] Session reference. https://developers.google.com/apps-script/reference/base/session
- [S12] Execute functions with the Apps Script API. https://developers.google.com/apps-script/api/how-tos/execute (updated 2026-09-03)
- [S13] Installable triggers. https://developers.google.com/apps-script/guides/triggers/installable (updated 2026-09-03)
- [S14] Web apps, permissions. https://developers.google.com/apps-script/guides/web (updated 2026-09-03)
- [S15] Gmail sending limits in Google Workspace. https://support.google.com/a/answer/166852
