# The registration form: spec

Written 2026-10-22 on wayfinder map [#110](https://github.com/puIad/vic-recruitment-2026/issues/110), ticket
[#124](https://github.com/puIad/vic-recruitment-2026/issues/124). It replaces the 19 Oct plan (`registration-app.md`,
now a pointer). Every decision below is a resolved ticket on that map; the ticket is named where the detail lives.
Vocabulary is [GLOSSARY.md](../GLOSSARY.md): **registration form** (the new one), **Google Form** (the fallback),
**email code** (called the **ticket** to candidates), **house**.

**Built and live.** The spec was signed and built on 22 Oct, ahead of the 23 and 24 Oct plan below, as tickets
[#126](https://github.com/puIad/vic-recruitment-2026/issues/126) to [#134](https://github.com/puIad/vic-recruitment-2026/issues/134), all closed with the map on 22 Oct. The live check
passed the same evening ([#134](https://github.com/puIad/vic-recruitment-2026/issues/134)): production's `VITE_APPLY_URL`
is `/apply` since 20:43 UTC, `/api/health` answers all `ok`, and the freeze is on. The Master and Redis cleanup after
it were done by the owner and not re-checked. The Google Form stays the fallback: setting `VITE_APPLY_URL` back to its
responder link is the one switch. The sections below are the plan as written; the dates in them are the planned ones.

## What it is

`/apply` on the vic-enp landing site (`puIad/vic-enp`, `vic-enp.vercel.app` until VIC settles a domain). A long
letter in a Harry Potter theme inside VIC's IT Charter 2026 look. A candidate proves their ENP address with a 6-digit
email code, fills 31 questions, and the site appends one row to the Master's **Registration Responses** tab through the
Sheets API as a service account. Everything after the row lands (checks, screening, code, binome, confirmation mail)
stays the Master script's job, unchanged. The Google Form stays linked to the same tab as the fallback.

```
landing Apply button ── VITE_APPLY_URL (Google Form URL or /apply)

/apply                                               vic-enp Vercel project (api/ beside the static site)
  1 ticket: local part + @g.enp.edu.dz ── POST /api/code ───► mailer (Apps Script as vic.rh) ──► code mail
  2 6 digits ─────────────────────────── POST /api/verify ──► sealed HttpOnly cookie {email, exp 60 min}
  3 the letter: 31 questions, soft checks, draft in localStorage
  4 send ─────────────────────────────── POST /api/submit ──► lock in Redis ─► Sheets API append (service account)
  5 "Received"                                                      └► Registration Responses: one new row
Master (bound script, vic.rh): the timed sync (5 min) ─► checks, screening, code, binome ─► confirmation mail
```

## Decisions this spec carries (where each was settled)

| Topic | Decision | Ticket |
|---|---|---|
| Place | `/apply` and `api/` in the vic-enp Vercel project, its own Upstash Redis; the landing's "no cookies, no forms" rule now holds for the landing page itself; `/apply` and `/api` may set one HttpOnly cookie, only after the code is verified | [Where the registration form lives](https://github.com/puIad/vic-recruitment-2026/issues/117) |
| Email proof | 6-digit code on screen 1, `@g.enp.edu.dz` only, mailer owned by `vic.rh`, 3/email/h, 60/IP/h (10 until 22 Oct: a lecture hall on the ENP Wi-Fi or one carrier's NAT shares an IP), 30 s resend, 10 min, 5 tries, honeypot, localStorage draft only, **no** link to the Google Form anywhere | [How candidates prove their email](https://github.com/puIad/vic-recruitment-2026/issues/118) (amended by [When candidates reach the Google Form](https://github.com/puIad/vic-recruitment-2026/issues/121); the IP limit by the owner on [puIad/vic-enp#70](https://github.com/puIad/vic-enp/pull/70)) |
| Theme | Full Harry Potter theme with house names and series words, chosen knowingly with no Warner permission, no disclaimer, no plain switch. IT Gryffindor, COMM Ravenclaw, FLER Hufflepuff, HR Slytherin. The Master and binome sheets keep their own colours | [The wizarding theme inside VIC's charter](https://github.com/puIad/vic-recruitment-2026/issues/119) |
| Write path | Service-account key, `INSERT_ROWS`, `RAW`, columns by header, Timestamp as a serial in the Master's time zone, Redis lock first, appends one at a time behind `lock:append` with row 1 kept 60 s (the load test, [#133](https://github.com/puIad/vic-recruitment-2026/issues/133)), timed sync at 5 min | [How a registration reaches the Master](https://github.com/puIad/vic-recruitment-2026/issues/120), [Can the Cloud project create a service account key?](https://github.com/puIad/vic-recruitment-2026/issues/116) |
| Fallback | The one switch is `VITE_APPLY_URL`; no hand-over of answers; both forms' questions freeze after the live check | [When candidates reach the Google Form](https://github.com/puIad/vic-recruitment-2026/issues/121) |
| Comp | Direction A, the long letter; the comp is `prototype/registration-form` (never merged), its README lists everything accepted | [The registration form's themed comp](https://github.com/puIad/vic-recruitment-2026/issues/122) |
| Mails | Themed layout for two mails only (code mail, confirmation); code mail is a new editable mail on Settings > Emails | [The code mail and the confirmation in the theme](https://github.com/puIad/vic-recruitment-2026/issues/123) |

## The screen

Source of truth: the comp's direction A on `origin/prototype/registration-form` (`index.html`, `?v=A`) and its README.
Read it with `git show origin/prototype/registration-form:prototype/registration-form/index.html`; never check it out in
the main folder. The comp is a throwaway: port its markup, copy and behaviour, not its single-file structure.

- **One page.** A letter at the top (Bright Gray paper on night, seal, "Registrations 2026"), then the **ticket**
  (Platform 9¾, the email code) with the road down the left edge. The 8 stops unfold once the code is checked:
  1. Who you are: First Name, Family Name, Birth Date, Phone Number.
  2. Where we can reach you: Facebook Link, Discord Username.
  3. Your studies: Field of Study, Year of Study.
  4. Your story: How did you discover VIC?, Why do you want to be part…, previous clubs (optional).
  5. The choosing: 1st and 2nd department choice, as four tiles with house names. The 1st choice washes the room
     (accent replaces aquamarine, the night tints toward the house); changing it retints at once. The 2nd choice gets a
     small badge only.
  6. The 1st choice's department block (3 to 5 questions). A placeholder shows until the 1st choice is picked.
  7. Interview details (two optional questions).
  8. Almost done: Anything to add? (optional), a short review, send. Owl post on send, then **Received**.
- **31 questions, not 32.** The Google Form's 32 include `E-mail Address`; the registration form asks the email once, on
  the ticket, and writes the verified address into both email columns (see "The row").
- **Questions, wording, choices and required flags** are exactly [registration-questions.md](registration-questions.md),
  titles character for character (odd spaces included). The department descriptions are the Google Form's own four.
  Question labels and help stay plain VIC English; the wizarding wording is only on the letter, the choosing and the
  done screen. Never "accepted": **Received** promises an email may follow, no time, no place, no interview.
- **The email field** shows `@g.enp.edu.dz` already filled in; the candidate types only the local part. The field
  locks after the code is verified.
- **Soft checks** (warn with an inline chip, never block; the Master's `checkRegistration` still decides): phone shape
  (`0[5-7]` + 8 digits, or `0[2-4]` + 7), Facebook link shape, birth year range (age 15 to 35), 2nd choice different
  from the 1st. Required fields do block, with a summary of how many answers need a look and a jump to the first.
- **A duplicate address is told at the ticket**, not at submit: `/api/code` answers "already registered" for an
  address with a `reg:` mark. The comp's owner reaction accepted this. It does mean anyone can learn that an ENP address
  registered; the domain is closed to ENP and the code limits apply, so this stands.
- **Draft:** saved to localStorage on every change (answers, 1st-choice house, step). A reload inside the hour goes
  straight back in; after 60 minutes only the ticket is asked again and the answers stay. Cleared on a successful send.
- **Type and look:** the landing's production body font for everything (Outfit while no Gilroy web licence is
  assumed, VIC-ENP open question 11; it follows the landing if that changes; owner, 22 Oct), plus Cormorant Garamond
  (OFL, self-hosted) on step titles and the letter only. Not the Magic School download (no licence, imitates the film's lettering). Colours from the comp's `HOUSES`
  table; the contrast table in the comp's README holds (white text at least 4.5:1 on every wash).
- **Never:** crests, film stills, book quotes, title lettering, the logo on parchment art, hidden or delayed required
  questions, or anything that slows or breaks the form inside Instagram's browser. Tier 0 and `prefers-reduced-motion`
  show the same form with no animation or heavy art (every comp animation switches off).
- **No** link to the Google Form on any screen, failure states included. A failed send says "could not save, try
  again" and keeps the draft.

## API contract

All routes live in `api/` in the vic-enp project, same origin as `/apply`: no CORS. JSON in, JSON out. Vercel logs
carry route, outcome and milliseconds only, never the email, the code or the body (the dashboard's `api/run.js` rule).
Request bodies are capped (50 KB) and every field is validated server side.

| Route | In | Out |
|---|---|---|
| `POST /api/code` | `{ local, website }` (`website` is the honeypot, must be empty) | `200 {status:"sent", resendIn:30}`; `200 {status:"registered"}` when `reg:<sha256(email)>` exists; `429 {retryIn}` over a limit or inside the 30 s gap; `400` bad shape. A filled honeypot answers `200 {status:"sent"}` and sends nothing |
| `POST /api/verify` | `{ local, code }` | `200 {expiresAt}` and `Set-Cookie vic_apply` (HttpOnly, Secure, SameSite=Lax, `Path=/`, 60 min); `400 {triesLeft}` wrong code; `410` expired or none; `429` after 5 tries |
| `POST /api/submit` | `{ answers }` (cookie required) | `200 {status:"received"}`; `401` no or stale cookie (the form returns to the ticket, answers kept); `409 {status:"registered"}`; `422 {fields:[…]}` structure invalid; `503 {status:"not_saved"}` append failed after retries, or no turn at the append within 30 s (lock released) |
| `GET /api/health` | none | `200 {redis, mailer, sheets, headers}`, each `"ok"` or `"fail"`, nothing else. Rate limited. The owner opens it in a browser |

- **Email** is always `lowercase(local) + "@" + EMAIL_DOMAIN`; a `local` containing `@` or whitespace is a 400. The
  site never takes a full address from the client.
- **Cookie** value is `{email, exp}` sealed with AES-GCM under `SESSION_KEY`, built like `web/lib/session.js` in the
  dashboard (a copy, not an import: separate project). `/api/submit` trusts only the cookie's email.
- **Redis keys** (prefix `KEY_PREFIX`, empty in production, `prev:` in previews so a preview never touches production's
  keys): `otp:<sha256(email)>` holds `sha256(code)` for 10 min with a tries counter; `rl:e:<h>` and `rl:ip:<h>` count
  codes per hour (IP hashed too); `gap:<h>` is the 30 s resend gap; `reg:<sha256(email)>` is the registration mark and
  the submit lock; `lock:append` (2 s) lets one append through at a time; `headers` keeps row 1 of the tab for 60 s.
  No plain email, code or IP is ever stored.
- **Submit order:** validate, `SET reg:<h> NX` (the lock; failure means `409`), wait for a turn at `lock:append`, append,
  done. The Sheets token is fetched before the wait. A send waits for its turn until 30 s into the submit (polling every
  150 to 300 ms); with no turn by then it answers `503`. The turn holds the send's own token and is freed only while
  still held, so an append that outlives the 2 s never frees the next send's turn. A Redis error at the turn counts as
  the turn: the send appends without it rather than fail. If the append fails after its retries, or no turn comes,
  `DEL reg:<h>` and answer `503`. An ambiguous timeout may leave a second row; the script marks it DUPLICATE (HIGH
  alert, no second mail). The mark has no expiry before the final reset.
- **Health** checks: Redis `PING`; the mailer with `{secret, ping:true}` (sends nothing); the Sheets API by reading
  row 1 of the Registration Responses tab and confirming **every header the site writes is present** (a header drift
  between the form and the site is caught here, before a candidate hits it).
- **Server-side validation** is structural: required answers present, choices in each question's list, only the
  1st choice's department block accepted, lengths capped (long text 5,000 characters), no control characters. Semantic
  rules (duplicates, bad phone, same choices) stay with `checkRegistration`.

## The row

`api/submit` writes each answer under the header it belongs to, from row 1 of the tab; a column added to the form never
shifts the site's answers. Row 1 is read inside the turn and kept 60 s in Redis (`headers`), so a burst reads it once:
30 sends reading it at once timed out in the load test. A column change therefore reaches the site within a minute;
`/api/health` still reads row 1 live. The site's question list holds the form's titles exactly.

- The tab has **34 columns** (header row read on 2026-10-19): Timestamp, Email address (collected by the form), then the
  32 questions of [registration-questions.md](registration-questions.md) in order.
- `valueInputOption=RAW`, `insertDataOption=INSERT_ROWS`, range the tab name. The token, the row 1 read and the append
  each get 3 tries with exponential backoff and jitter on 429, 5xx and timeouts (the quota is 60 writes a minute for the
  service account; 273 registrations came in all of 2025). An append Google accepted is never retried, even when its
  answer can't be read.
- `Timestamp`: the submit time as a sheet serial in the Master's time zone (`Africa/Algiers`, from
  `appsscript.json`), integer part days since 1899-12-30. **Birth Date** is written the same way (a date serial).
  The live check and the load test confirm both read back as Dates like a form row.
- `Email address` (the form's collected one) and `E-mail Address` (typed) both get the verified address, so
  `EMAIL_MISMATCH` and `BAD_EMAIL` cannot come from the registration form.
- Checkbox answers join with `, ` like the form's; a choice's "Other" free text is the typed text. Ratings are numbers.
  Phone and anything starting with `=`, `+`, `-` stays text (`RAW`).
- Only the 1st choice's department block is filled; the others stay blank like the form's skipped sections.
- The service account is an editor of the Master. It cannot sign in; nothing in the dashboard treats it as a person.

### What the Master does with it (unchanged, for orientation)

`regHeaders_` finds columns by header text; `responseKey_` keys a row as `timestamp ms | email`; `processRegistrations_`
runs `checkRegistration`, screening (`SCREENING`), `nextCode` and `pickBinome` on each new row once. API rows do not
fire the form-submit trigger, so the **timed sync** picks them up; the owner sets `SYNC_EVERY_MINUTES` to **5** and
re-runs Setup before opening (1 minute is not workable: a cycle holds the lock about 50 s on average and would eat the
trigger-runtime quota). An admin presses **Sync now** every few minutes in the first hour. A slow sync delays the
confirmation, the binome's first mail and the dashboard; it never delays the ticket mail. A very large burst could near
Google's 6-minute limit (`processRegistrations_` has no row cap); the load test covers it and the script is not changed.
Some registrants are never mailed (VIC members declined silently, duplicates, rows with no usable name or email); a held
registration is mailed (`HELD` is in `CONFIRM_STATUSES`).

## The mails

### Mailer (new, owned by `vic.rh`)

A standalone Apps Script, one web app (execute as me, access anyone), source in this repo at `mailer/Code.gs`. Not the
Master's bound script: that one's web app runs as the visitor. `doPost` takes JSON:

- `{secret, to, code}`: compares `secret` to the `MAILER_SECRET` script property in constant time; `to` must end in the
  `EMAIL_DOMAIN` script property (`@g.enp.edu.dz`) and `code` must be six digits; sends one mail as "VIC Recruitment"
  from `vic.rh` (replies land in its mailbox); answers `{ok:true}` or `{ok:false, reason}`.
- `{secret, ping:true}`: answers `{ok:true}` and sends nothing (the health check).
- It reads `MAIL_CODE_SUBJECT`, `MAIL_CODE_HEADING`, `MAIL_CODE_ABOVE` and `MAIL_CODE_CODELABEL` from the Master's
  Settings tab at send time (the script property `MASTER_ID`; `vic.rh` must be able to read the Master), blank means the
  default, cached 60 s. It holds its own copy of the themed layout. The site still sends only `{secret, to, code}`.
- A web app answers a POST with a redirect; the site's `fetch` follows it. Updating the mailer later is Deploy >
  Manage deployments > edit > new version, which keeps the URL.
- **TEST_MODE does not reach the mailer.** Until launch, test with admins' own ENP addresses only.
- Quota: 1,500 recipients a day as checked on 22 Oct (`getRemainingDailyQuota()` returned 1,500; plan type unknown).
  Every resend uses one, so about 750 candidates at two codes each; the quota is shared with confirmations, alerts and
  the digest.

### Themed layout (Mail.gs, Config.gs: this touches the bound script)

- `mailHtml_` gets a **themed** option, used by two mails only: the code mail and the confirmation. The rejection and
  every team mail keep today's charter layout unchanged.
- Look: night header with the white logo, a 4 px stripe under it, heading in a Georgia-fallback serif (mail clients
  ignore web fonts), white light-only body as today, no crests, emblems or images beyond the logo.
- **Code mail:** aquamarine stripe (no house yet). New `MAILS` entry `CODE` ("Registration ticket", to candidate, var
  `{code}` only) with fields `subject`, `heading`, `above`, `codeLabel`. Defaults: subject "Your ticket for Platform 9¾:
  {code}", heading "Your ticket is ready", above "Type this ticket on the registration form to prove this ENP address is
  yours. It works for 10 minutes. If you did not ask for it, ignore this mail.", code label "Your ticket". Preview and
  "Send me a test" work like the other mails; **no On/Off switch** (off would break the form's first screen).
- **Confirmation:** wording unchanged ("Thanks for registering, {first}!", "Your code", "received"), no `{house}`
  placeholder; saved edits on Settings > Emails keep winning. The stripe takes the 1st choice's house colour from a new
  **form-house table** in Config.gs beside `HOUSE` (which keeps IT Ravenclaw and COMM Gryffindor for the sheets):
  IT `#FF6A5E`, COMM `#7FB0FF`, FLER `#F4BB35`, HR `#46D392` (the comp's accents). An unknown department falls back to
  aquamarine. A Google Form registrant gets the same mail; no source column.
- **Drift test:** one sample rendered through `Mail.gs` and through `mailer/Code.gs` must be byte-equal, in
  `test/mail.test.js`.

## Security and privacy

- The site's CSP stays strict (`default-src 'self'`; `script-src 'self'`; `style-src 'self'`; `connect-src 'self'`) with
  `form-action` moving from `'none'` to `'self'`. No inline scripts or inline styles: the comp's inline styles become
  classes. Fonts are self-hosted. `/apply` loads its own bundle, never the 3D one.
- One HttpOnly cookie, set only after the code is verified, scoped to the site. Nothing else is stored client-side
  except the localStorage draft.
- The form collects exactly the Google Form's 32 questions minus the typed email, nothing more.
- No candidate data in either repo, the comps, the tests or the tickets: synthetic rows only, never `test/data/`.
- Secrets live only in the site's Vercel env vars and the mailer's script properties; the service account key file never
  leaves the owner's machine except into Vercel.
- `/api/health` returns booleans only.

## Known risks

- **Warner:** no permission exists; the owner chose the full theme knowingly. If Warner, Instagram or another platform
  objects, the form comes down by hand (`VITE_APPLY_URL` back to the Google Form) and opening continues there.
- **Instagram's browser:** the Gmail round trip is moot because the ticket is asked before any answer, but a reload can
  still lose the typed code; localStorage keeps the answers. The low-end phone tier is untested (the landing's
  `docs/quality.md` tiers are the yardstick); the owner tries `/apply` on a phone inside Instagram on 24 Oct
  ([#125](https://github.com/puIad/vic-recruitment-2026/issues/125) check 2).
- **Code mail quota:** about 750 candidates at two codes each; a failing mailbox or an exhausted quota leaves a candidate
  with only the resend, since no link to the Google Form is shown. The landing's Apply target is the way out.
- **An early real candidate:** `/apply` is public once deployed, though nothing links to it before the owner flips
  `VITE_APPLY_URL`. A real registration during TEST_MODE is processed but its confirmation is dropped. At the final
  reset the owner reviews Registration Responses for rows not from admin addresses.
- **The Google Form's IT section has no jump after it** (an IT candidate on the fallback may continue into the
  Communication questions) and its intro still says "29 October 23:59". Both left as they are, by the owner's call.
- **Owner's call on cuts:** asked what drops first if the build is late, the owner declined to set an order ("we will
  make it"). The only fallback is therefore the whole one: not passed by the morning of 25 Oct, opening goes on the
  Google Form.

## Build plan: slices for 23 and 24 Oct

Each slice is one session and one PR in its own worktree. Sessions run on Sonnet at medium effort; the screen slice uses
impeccable. The vic-enp main folder is shared by parallel sessions: never switch its branch, one worktree per slice.
The three slices of 23 Oct run **in parallel**: the screen builds against this contract with a mock, so none waits on
another. Every slice stays free of candidate data.

| | Slice | Repo | Done when |
|---|---|---|---|
| S1 | **API** (23 Oct) | vic-enp | `api/code|verify|submit|health`, Redis keys and limits, sealed cookie, Sheets append by header with retry and lock, the question list as data, `vercel.json` (`form-action 'self'`, the `/apply` rewrite), tests on fakes: limits, expiry, 5 tries, wrong domain, honeypot, a code never logged, lock released on failure, `=1+1` stays text, a Timestamp serial in `Africa/Algiers`, only the 1st choice's block written, a test that the question list equals the copy of `registration-questions.md` |
| S2 | **Mailer and themed mails** (23 Oct) | this repo | `mailer/Code.gs`; `mailHtml_` themed option; `CODE` in `MAILS`; the form-house table; drift test; docs; the script deploy through the usual procedure and Setup re-run as `vic.rh` |
| S3 | **The screen** (23 Oct to the morning of 24 Oct) | vic-enp | `/apply` as its own entry (the 3D bundle never loads there), direction A ported, the 31 questions, soft checks, house wash, draft, tier 0 and reduced motion, CSP-clean (no inline styles), talks to the API contract through a mock, then the real S1 |
| S4 | **Integration and load test** (24 Oct, morning to afternoon) | both | S3 on S1 on a preview with the copy of the Master; the copy-of-Master test (below); mailer round trip with an admin address; the landing smoke check (`/apply` returns 200, `/api/health` all `ok`); the owner's phone checks (Instagram, iPhone and Android; burst of 30 to 50 mails, #125 checks 2 and 3) |
| S5 | **Live check and the switch** (24 Oct, evening) | owner and a session | the script below passes; `VITE_APPLY_URL` flipped; cleanup; freeze |

### The copy-of-Master test (S4)

On a copy of the Master (never the live one): about 30 simultaneous appends of synthetic rows (emails
`loadtest-NN@g.enp.edu.dz`, name "Test"), then read back only those rows. Passes if there are 30 distinct rows, none lost
or overwritten, and the Timestamp and Birth Date cells carry a date number format (`effectiveFormat.numberFormat` of
the appended cells), so Apps Script `getValues` would return a Date. If an append is lost or overwritten, put appends
behind a short Redis lock (`SET lock:append NX`, 2 s) and rerun; a clean run means no lock. If the cells do not
inherit the date format, apply it to the written range in the same append flow and rerun. The test script lives in
vic-enp `scripts/` and reads nothing but the synthetic rows.

**Done on 22 Oct** ([#133](https://github.com/puIad/vic-recruitment-2026/issues/133),
[vic-enp#73](https://github.com/puIad/vic-enp/pull/73)): `npm run loadtest` in vic-enp. Without the lock, 13 of 30
were saved: appends timed out and ran into 429s. The lock went in, and the row 1 cache and the token retry came out of
later failing runs. The last three runs passed 30 of 30 in 13 to 15 s, with the slowest append at 1.2 s. The dates
needed no change: the inserted rows inherit `DATE_TIME` and `DATE`. A turn takes about 0.45 s, so the 30 s wait covers
roughly 60 sends at once. The copy holds the synthetic rows 277 to 478 from these runs.

### Doc edits that ride with the build

- This repo: `registration-app.md` becomes a pointer (done with this spec); `plans.md` and `STATUS.md` link here;
  `docs/testing.md` "Clean up at the end" gains the live-check rows and the Redis flush (below).
- vic-enp (through its own worktree, never a branch switch in the shared folder): `docs/architecture.md` "Hosting"
  and "Privacy" (the amended rule, `/api`, Redis, secrets, the `/apply` smoke check, the freeze after 24 Oct),
  `docs/build-plan.md` (the registration form as slice 5's last item; "After launch" no longer says "switch
  `VITE_APPLY_URL` once signed off"), `docs/open-questions.md` (29 answered, 24 closed).

## The owner's setup checklist

Order matters: the service account and the Master copy come first (the load test needs them), the rest follow. Keys and
secrets are never pasted into chat, a ticket or the repo.

**By midday on 23 Oct**

1. Google Sheets API enabled on the service account's Cloud project (done 22 Oct in `vic-26-registrations`, not the
   dashboard's `vic-recruitment` project, number 444885197277).
2. Create a service account `vic-registration` with **no roles**. Copy its email address.
3. Create a **JSON key** for it (the policy allows it, checked 22 Oct). Keep the file on your machine. For Vercel, encode
   it on one line: `base64 -w0 key.json` in Git Bash, or in PowerShell
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("key.json"))`. That string is `SA_KEY_B64`.
4. In Drive, **make a copy of the Master** named "Master TEST COPY". Do not open its script or run Setup in it (the copy
   has no triggers, so nothing runs). Share the copy with the service account email as **Editor**. Note its id (the long
   string in its URL).

**By the evening of 23 Oct**

5. **Redis:** a new Upstash Redis for the vic-enp project (Vercel > Storage, connected to `vic-enp` only), in the same
   region as the functions (iad1, Washington: neither project sets a region; the dashboard's Redis is us-east-1). It
   adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
6. **Vercel env vars** on the `vic-enp` project. Production and Preview are set separately; **Preview points at the
   copy**, never the real Master:

   | Name | Production | Preview |
   |---|---|---|
   | `SA_KEY_B64` | the key from step 3 | same |
   | `MASTER_ID` | the real Master's id | the copy's id |
   | `REG_TAB` | `Registration Responses` | same |
   | `MASTER_TZ` | `Africa/Algiers` | same |
   | `EMAIL_DOMAIN` | `g.enp.edu.dz` | same |
   | `MAILER_URL` | the mailer web app URL (step 7) | same |
   | `MAILER_SECRET` | a long random string, same as the script property | same |
   | `SESSION_KEY` | 32 random bytes in base64, a different one per environment | |
   | `KEY_PREFIX` | empty | `prev:` |
   | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | from step 5 | same |

   Random strings: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. `VITE_APPLY_URL` stays
   the Google Form's responder link until the live check passes.
7. **The mailer** (deployed 22 Oct as `vic.rh` with clasp: project "VIC Mailer", deployment `@2`, the ids in
   `mailer/.clasp.json`). Open the project at script.google.com as `vic.rh`: run any function once and approve the
   mail and read-only spreadsheet scopes; Project Settings > Script properties: `MAILER_SECRET` (same string as in
   Vercel), `EMAIL_DOMAIN` = `g.enp.edu.dz`, `MASTER_ID` = the real Master's id. Deploy > Manage deployments: check
   "Who has access" reads **Anyone** (if only "Anyone within g.enp.edu.dz" is offered, the domain blocks anonymous web
   apps and the site cannot reach the mailer: stop and say so). The web app URL
   `https://script.google.com/macros/s/AKfycbxYwtgUziRMwwL9zqOHLNTThs2zsTxcu_zkrsz3h-TyibiKWfwPolgtwUW12DUZ3vBL/exec`
   goes into `MAILER_URL`. `vic.rh` must be able to open the Master. A later change to `mailer/Code.gs`:
   `cd mailer`, `npx clasp --user vicrh push --force`, then
   `npx clasp --user vicrh update-deployment AKfycbxYwtgUziRMwwL9zqOHLNTThs2zsTxcu_zkrsz3h-TyibiKWfwPolgtwUW12DUZ3vBL`
   (same URL).

**By the morning of 24 Oct**

8. **Share the real Master** with the service account email as **Editor**, from the account that can share it (check
   in Drive whether `vic.rh` or you owns it; the script lives under `vic.rh`).
9. In the Master's Settings: `SYNC_EVERY_MINUTES` = **5**, after S2's script deploy re-run **Setup as `vic.rh`**
   (re-authorizes the triggers; see [vercel.md](vercel.md)). Leave `TEST_MODE` TRUE and screening ON for the live check.
10. Optional: Admin console > Billing > Subscriptions, to learn vic.rh's Workspace plan
    ([#125](https://github.com/puIad/vic-recruitment-2026/issues/125)).

The domain stays `vic-enp.vercel.app`. Launch items that already belong to the owner (folder access, timing limits,
test cleanup, `TEST_MODE` off) are unchanged and live in [testing.md](testing.md).

## The live check: evening of 24 Oct

Done on the real Master in TEST_MODE, on production `/apply`, with three admins' own ENP addresses (A, B, C; mailer
mails reach real mailboxes, so no candidate address is used). Owner holds the phone, a session watches the logs.

**Before**
- Production is deployed from `main`; `VITE_APPLY_URL` still points at the Google Form.
- Master: `TEST_MODE` TRUE, `SCREENING` ON, `SYNC_EVERY_MINUTES` 5, Setup re-run, the `CODE` mail's Settings row present.
- Open `https://vic-enp.vercel.app/api/health`: all four `"ok"`.

**Check 1: three registrations behave**
1. **Good** (address A): full path on the owner's phone from an Instagram link. Code mail arrives in the theme
   (aquamarine stripe, "Your ticket for Platform 9¾"), code accepted, answers kept across a reload, send once with a
   **double tap**. Expect one **Received** screen.
2. **Junk** (address B): throw-away answers that screening holds (the screening rules are not shown on the page).
3. **Duplicate** (address C): register with A's name and phone through `/apply`, and register A's address again through
   the **Google Form**. Expect both rows DUPLICATE.
4. Sync now. Expect: A has a code and a binome; B is HELD; the later rows are DUPLICATE with a HIGH alert for admins.

**Check 2: the row reads like a form row**
- Header, Timestamp and Birth Date read as Dates (Apps Script `getValues` returns a Date), the Interviewees row for A has
  the same shape as one from a Google Form registration with the same answers (identity, code and binome aside), no
  `EMAIL_MISMATCH` or `BAD_EMAIL`, and exactly one row for A despite the double tap.

**Check 3: mails reach admins only, once each**
- The themed confirmation for A and for B (held), with the stripe in the 1st choice's house colour; none for the
  duplicates; the Google Form registrant's confirmation has the same themed look; the code mails once per request.

**Check 4: failure cases**
- A preview deployment with a deliberately wrong `MASTER_ID` (prepared in S4): submitting shows "could not save, try
  again" and keeps the draft; fixing the id, redeploying and sending again from the same browser saves, which also proves
  the lock was released. A resend inside 30 s is refused; a fourth code in an hour is refused.
- `/api/health` all green again at the end.

**Pass:** all four. **Fail:** any lost or wrong row, a mail to a non-admin, a stuck lock, a red health line. A fail is
fixed and the failing check redone; not passed by the morning of 25 Oct means opening on the Google Form.

**After a pass, the same evening**
1. Owner sets `VITE_APPLY_URL` to `/apply` in the vic-enp project and Redeploys; open the landing, press Apply, check
   it lands on `/apply` and `/api/health` is green. (One to two minutes; reverting is the same env change.)
2. **Freeze:** production changes only for a rollback or the `VITE_APPLY_URL` switch; both forms' questions freeze with
   [registration-questions.md](registration-questions.md) as the single list (a change means the doc, both forms and the
   Master header together).
3. **Clean up** ([testing.md](testing.md), "Clean up at the end"): delete the live-check rows (Registration Responses,
   Interviewees, Alerts, the binome sheet rows), Sync now, Accept edits; **flush the site's Redis** (every `reg:`, `otp:`
   and `rl:` key, or the admins' addresses stay "already registered"); review Registration Responses for rows that are not
   from admin addresses; delete the Master TEST COPY.
4. Opening morning: `TEST_MODE` off is the owner's launch step, as before. The owner opens `/api/health`, runs one more
   test registration just before opening, and watches the first hour with Sync now every few minutes.

## Not yet specified

- The address the form sits at, if VIC settles a domain (`vic-enp.vercel.app` until then).
- Whether admins see on the dashboard which form a registration came through: not built for opening (the
  confirmation mail does not differ either).
- How the theme holds up on low-end phones inside Instagram's browser: tried on the owner's phones on 24 Oct; the
  landing's tiers (`vic-enp/docs/quality.md`) are the yardstick.

## After the season

Hand over, with the dashboard ([vercel.md](vercel.md)): the vic-enp Vercel project, its Redis, the service account and
key (rotate or delete it), and the mailer script. Next season's questions change the Master's headers: update the site's
question list and its copy of `registration-questions.md` in the same change, or the health check goes red.
