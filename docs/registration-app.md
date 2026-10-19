# Registration app and VIC landing page: exploration and plan

Explored with the owner on 2026-10-19. Goal: candidates register on VIC's own site (a landing page plus a
registration flow) instead of the Google registration form. The Master stays the source of truth, and everything
after the submission (routing, screening, duplicate check, confirmation mail) stays the script's job. Nothing here is
built yet. Decisions are in [Owner's decisions](#owners-decisions-2026-10-19); the build is in
[Build plan](#build-plan-vertical-slices).

## Today's flow (checked in the code, 2026-10-19)

1. The candidate fills **VIC Registrations Form 2026** (`CONFIG.REGISTRATION_FORM_ID`). Its responses land in the
   Master's **Registration Responses** tab, linked by Setup (`linkForms_`, script property `REG_SHEET_ID`).
2. The tab has **34 columns** (header row read on 2026-10-19): Timestamp, Email address (collected by the form),
   First Name, Family Name, E-mail Address (typed), Birth Date, Phone Number, Facebook Link, Discord Username, Field
   of Study, Year of Study, How did you discover VIC?, Why do you want to be part of the VIC family?, other clubs,
   first and 2nd department choice, then one block per department (its "Why did you choose the X Department…"
   question followed by that department's own questions: IT 4, COMM 3, HR 2, FLER 2), availability, "Will you be able
   to attend your interview on time…", Anything to add?.
3. `regHeaders_` (Registrations.gs) finds every column **by header text**, not position. A department's own
   questions are the columns between its "why" column and the next stop column, so column order matters for them.
4. `responseKey_(ts, email, row)` keys a row as `timestamp ms | email`. A key already in Interviewees is skipped,
   so a row is processed once and **never re-read** afterwards (only blank extras are filled in).
5. Two triggers process new rows: `onFormSubmitHandler` (spreadsheet form-submit trigger) and the timed `syncAll`.
   Rows written through the Sheets API don't fire the form trigger; the timed sync picks them up the same way (proven
   on 2026-10-04 with the 273 rows of 2025).
6. Per new row (`processRegistrations_`): the name swap (`namesSwapped`), `checkRegistration` (Rules.gs: duplicate by
   email or name + phone, missing name, invalid choice, bad / mismatched email, non-`EMAIL_DOMAIN` email, same
   choices, Algerian phone, birth date), screening when `SCREENING` is on (`screenNew_` → `screenApplication`, VIC
   members declined silently, risky ones HELD), then a code (`nextCode`) and a binome (`assignRow_` → `pickBinome`).
7. `stampConfirmations_` / `sendConfirmations_` mail the registrant a confirmation with their code
   (`CONFIRM_MAIL`, `confirmHtml_` in Mail.gs) after the save, when `CONFIRM_REGISTRANTS` is on. TEST_MODE keeps it
   to the admins.
8. `EMAIL_DOMAIN` (setting, `g.enp.edu.dz`) only raises `EXTERNAL_EMAIL` (INFO); it rejects nobody.

Why the app can't just call the dashboard's API: `scripts.run` runs **as the visitor**, and `access_()` lets in only
editors of the Master and binome members. A candidate's own account can't open the Master, so a submission has to be
written by a club account.

## Options and what each costs

### Timing

| Option | Cost | Risk |
|---|---|---|
| Next season | Nothing on the critical path; built and tested after recruitment | Candidates use the Google Form one more year |
| **This launch, Google Form as fallback (chosen)** | About 4 to 5 build sessions plus the owner's setup steps; the launch waits for its sign-off | A bug on day one means switching the landing page's button to the form |
| This launch, form retired | Same build, no safety net | Any bug blocks registrations |

### Where it lives

| Option | Cost |
|---|---|
| Route in the dashboard's project | Shares build, brand and sign-in code; the dashboard's CSP, cookies and `ignoreCommand` apply to a public page |
| **Separate Vercel project (chosen)** | Its own project, env vars, Redis, `ignoreCommand` and handover; public and admin can't break each other |

### How a submission reaches the Master

| Option | Cost |
|---|---|
| **Sheets API row as a service account (chosen)** | No script change and no script deploy. The app appends one row to Registration Responses; the next timed sync does the rest. The page can't show the candidate's code: it arrives by mail after the sync |
| Script web app call (`doPost` as `vic.rh`) | Instant code and duplicate answer on the page, but new script code, a change to how the bound script's web app runs, and a secret to rotate |

### Identity and abuse

| Option | Cost |
|---|---|
| ENP Google sign-in | Verified email in one click, no mail to send; a second OAuth flow with only `openid email` |
| **Email code (chosen)** | Candidate types their email, presses Send code, types the 6-digit code to continue. One mail per attempt (quota), rate limits needed |
| Open form + captcha | No verification: fake emails and duplicates come back |

## Owner's decisions (2026-10-19)

1. **Timing:** this launch, with the Google Form kept as the fallback. The launch waits for the app's sign-off.
2. **Hosting:** a separate Vercel project, on the owner's Vercel account, handed over with the rest after
   recruitment ([vercel.md](vercel.md#still-open)).
3. **Address:** a domain VIC owns (which one, and who holds its DNS, is open).
4. **Identity:** an email code. A "Send code" button next to the typed email mails a code; the candidate types it
   under the email to continue.
5. **Write path:** a Sheets API row into Registration Responses as a service account.
6. **Code mail sender:** the script, as `vic.rh` (same sender and quota as the confirmation).
7. **Language:** English only.
8. **Extras:** checks at entry. Not wanted now: status lookup by code, editing an application.
9. **Landing page content:** the owner puts it in later. The build ships placeholders.
10. **Prototype:** none; plan only.

## Recommendation

Build it in the order of the slices below, with the landing page first: on its own it is useful for this launch,
because its button can point at the Google Form until the app passes its live check. That keeps the fallback a
one-line switch instead of a plan B.

Two notes on the decisions:

- **Timing is the expensive one.** Everything else on the launch list (load-test task 10, cleaning the 273 test
  candidates, TEST_MODE off) is still open, and this adds 4 to 5 sessions plus owner steps (service account, mailer
  script, domain). If the date matters more than the app, launch on the form with the landing page in front of it
  and switch the button to the app mid-recruitment once it passes; nothing in the design blocks that.
- **The code mail "from the script as `vic.rh`"** is best done with a small standalone Apps Script owned by `vic.rh`
  (the "mailer"), not the Master's bound script: the bound script's web app runs as the visitor (`USER_ACCESSING`,
  `DOMAIN`) and a deploy from the owner's clasp login would make mail come from the wrong account. The mailer has one
  `doPost` that checks a shared secret and sends one mail. Same sender and quota as the confirmation, and the bound
  script and its deploys stay untouched.

## Design

```
landing page ──► /apply
                 1. email + [Send code] ── POST /api/code ──► mailer (Apps Script as vic.rh, secret) ──► code mail
                 2. 6-digit code        ── POST /api/verify ─► signed cookie {email, exp 60 min}
                 3. the form (checks at entry)
                 4. [Submit]            ── POST /api/submit ─► Sheets API append (service account)
                                                               └► Registration Responses (new row)
                 5. "Received: your code arrives by email in a few minutes"
Master: the next timed sync → checks, screening, code, binome → confirmation mail (unchanged)
```

### What the app writes

- One row per submission, appended with `valueInputOption=RAW` (text starting with `=` `+` `-` stays text, phones keep
  their leading 0), `insertDataOption=INSERT_ROWS`.
- Columns are found **by header**: the app reads row 1 once per submit and writes each answer under the header it
  belongs to, so a column added to the form never shifts the app's answers. The app's question texts are the form's
  headers, character for character (odd spaces included), held in one list in the site's code.
- `Timestamp`: the submit time as a sheet serial number (the column is date-formatted, so `getValues` returns a
  Date and `responseKey_` and Registered At behave like a form row). Verify on the live Master in TEST_MODE.
- `Email address` (the form's collected one) and `E-mail Address` (typed) both get the **verified** email, so no
  `EMAIL_MISMATCH`.
- Only the 1st choice's department block is shown and filled, like the form's sections. The other blocks stay blank.
- The service account is an editor of the Master. Nothing in the dashboard treats it as a person (it can't sign in);
  Integrity.gs only adds Master editors to the list of accounts allowed on binome sheets.

### Email code

- `POST /api/code {email}`: lowercase, must end in `@g.enp.edu.dz` (site env var, same value as `EMAIL_DOMAIN`).
  Limits in the site's own Upstash Redis: 3 codes per email per hour, 10 per IP per hour, 30 s between resends. A
  random 6-digit code; Redis keeps only `sha256(code)` under `otp:<sha256(email)>` for 10 minutes, at most 5 tries.
- `POST /api/verify {email, code}`: right code = an HttpOnly, Secure, SameSite=Lax cookie sealed like the dashboard's
  (`web/lib/session.js`, AES-GCM, its own key) holding `{email, exp}` for 60 minutes. The email field is then locked.
- The mailer gets `{secret, to, code}` and sends the code mail in the VIC look (a copy of `mailHtml_` /
  `mailCode_`, since a standalone script can't call Mail.gs). TEST_MODE does not reach it: while the Master is in
  TEST_MODE, test with admins' own addresses.
- Quota: `vic.rh` sends the code mails and, through the triggers, the confirmations, alerts and digest. A Workspace
  account has about 1,500 recipients a day (check `MailApp.getRemainingDailyQuota()` as `vic.rh`). 2025 had 273
  registrations in all, so a launch day is far below it.

### Duplicates, bots, fallback

- After a successful append, Redis marks `reg:<sha256(email)>`; a second submit from that email gets "You already
  registered. Write to us if something changed." The script's own `DUPLICATE_REGISTRATION` check still catches
  everything else (a form submission plus an app one, a mark that expired), and admins keep `dupNew` / `dupSeparate`.
- Bots need a real ENP mailbox to get past the code; the rate limits and a hidden honeypot field cover the rest.
- **Fallback:** the Google Form stays linked to Registration Responses. The landing page's button target is one site
  env var (`APPLY_URL`: `/apply` or the form's URL), switched with a Redeploy. Both paths land in the same tab and go
  through the same checks.

### Checks at entry (the extra the owner chose)

The same rules as `checkRegistration`, shown while typing so fewer alerts reach admins: first and family name hold a
letter; 1st choice is one of IT / COMM / FLER / HR; phone matches `0[5-7]` + 8 digits or `0[2-4]` + 7 (after
`normPhone`'s clean-up); birth date readable and an age between 15 and 35; a hint when 1st and 2nd choice are the
same (allowed, it is INFO). A check in the site's code, plus a test that runs the same cases through `Rules.gs`
(loaded the way `test/gs.js` does) so the two never drift. The script's checks stay: the app only warns earlier.
The screening rules (`screenApplication`) are **not** shown on the page: telling candidates what gets held defeats
it.

### Privacy

- The app collects exactly what the form collects today (the 34 columns), nothing more.
- No candidate data in the repo: tests use synthetic rows, never `test/data/`.
- Vercel logs: route, outcome and ms only, never the email, the code or the body (the same rule as `api/run.js`).
- Redis holds only hashes of emails and codes, and expires them (10 min, 1 h, or the season for `reg:`).
- The service account key (or its federation config) lives only in the site's Vercel env vars.
- An unsent draft may stay in the candidate's own browser (localStorage), cleared on submit.

### Landing page

- Sections: the club (what VIC is), the four departments (IT, COMM, FLER, HR), the recruitment dates and steps
  (register, a binome contacts you, interview), FAQ, and the Apply button. Content: placeholders until the owner
  sends it. Never promise an interview (screening can decline).
- Look: the VIC charter, as in [DESIGN.md](../DESIGN.md) and [PRODUCT.md](../PRODUCT.md): Gilroy (self-hosted),
  the charter palette, the logo from `frontend/public/brand/`, the decorative pieces in
  `frontend/src/components/brand` (`RingStage`, `ArchStack`, `OutlineWord`, `VicLogo`). The charter's rules on the
  logo and type apply. English only.

### Code layout

A new folder `site/` in this repo, the new Vercel project's Root Directory (with "include files outside the root" on,
so it can import the brand components and Gilroy from `frontend/`). Vite + React like `frontend/`, `site/api/` for the
three functions, its own `vercel.json` with an `ignoreCommand` that watches `site/` and the brand paths it imports,
and its own CSP. The dashboard's project doesn't watch `site/`, so site pushes don't rebuild the dashboard.

## Overlap with the email templates plan

The email templates plan (another session, [plans.md](plans.md)) works on the script's mails. The registration app
needs two things from it:

- **The confirmation keeps working unchanged.** The app writes rows the sync already handles, so `stampConfirmations_`
  and `sendConfirmations_` send it exactly as for a form row. The confirmation stays the only mail that carries the
  candidate's code, since the page can't show it.
- **The code mail is a new mail** in the mailer, not in Mail.gs. It should follow the same template look and,
  if the templates plan makes mail wording editable, take its wording from the same place. Until then it is a copy
  of `mailHtml_`'s layout with one line of text and the code.

## Build plan (vertical slices)

Each slice is one session and one PR, testable on its own, the site behind its own Vercel project. No slice changes
the bound script.

### Slice 0: owner setup (owner, about 1 to 2 hours)

1. A service account in the `vic-recruitment` Cloud project with no roles, the Sheets API enabled; share the Master
   with it as editor. If the ENP org blocks key creation (`iam.disableServiceAccountKeyCreation`), use Vercel's OIDC
   with Workload Identity Federation instead.
2. The mailer: a standalone Apps Script created as `vic.rh`, deployed as a web app (execute as me, anyone), with a
   `MAILER_SECRET` script property. The code is in the repo (`site/mailer/`), pushed by clasp from `vic.rh`'s login.
3. The new Vercel project on the owner's account (Root Directory `site`, files outside the root included), its own
   Upstash Redis, env vars: `SA_*`, `MASTER_ID`, `MAILER_URL`, `MAILER_SECRET`, `SESSION_KEY`, `EMAIL_DOMAIN`,
   `APPLY_URL`.
4. The domain: point it at the project (open: which domain, who holds the DNS).

### Slice 1: the landing page

The static landing page in the charter look with placeholder content, the Apply button reading `APPLY_URL` (the
Google Form's URL at first). Done = live on the domain, phone and desktop, light and dark, the button opens the form.
Useful for launch on its own.

### Slice 2: the email code

`/apply` step 1 and 2: email, Send code, the code box; `api/code`, `api/verify`, the Redis limits, the sealed cookie;
the mailer and its code mail. Tests: limits, expiry, 5 tries, wrong domain, a code never logged. Done = a code
arrives at an admin's address within a minute and opens step 3.

### Slice 3: the form and the submit

The form's other 31 questions (the app fills Timestamp and both email columns), the department block for the 1st choice,
the checks at entry, `api/submit` appending by header, the duplicate mark, the "Received" screen. Tests: a submitted
row read back through `regHeaders_` and `processRegistrations_` on the mock gives the same Interviewees row as a form
row with the same answers; the entry checks agree with `checkRegistration` on a shared case list; `=1+1` stays text.

### Slice 4: live check and the switch (owner and a session)

In TEST_MODE: three registrations through the app (a decent one, a junk one with screening on, a duplicate of a form
row), then Sync now: codes, binomes, HELD / DUPLICATE as expected, confirmations to the admins. Then switch
`APPLY_URL` to `/apply`, Redeploy, and add the test rows to the launch cleanup ("Clean up before launch",
[testing.md](testing.md)). Done = signed off by the owner; the launch goes on with the form linked as the fallback.

### After the season

Hand the site's Vercel project, its Redis, the domain and the mailer script over with the dashboard
([vercel.md](vercel.md#still-open)). Next season's questions change the form's headers: update the site's question
list in the same change, or the answers land under missing headers (`regHeaders_` finds nothing and the fields stay
empty).

## Open questions

- Which domain VIC owns for the site, and who holds its DNS.
- The landing page's content (dates, department blurbs, FAQ): the owner sends it.
- Whether the Google Form should be restricted to ENP sign-in while it is the fallback.
- The code mail's wording (settle it with the confirmation's wording, STATUS "Left, owner" step 3).
