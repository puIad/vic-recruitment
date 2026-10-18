# Decisions and open questions

Why the system is built the way it is. Read before changing behaviour; add a row when a new decision is made.

## Recruitment rules (2026-09-30, from the 2025 process)

| # | Decision | Why |
|---|---|---|
| 1 | One Google Sheet **file per binome**, not tabs in one file | Privacy: each binome sees only its interviewees. Cost: the Master syncs on a timer. |
| 2 | Routing as in 2025: IT/COMM/FLER → binomes of that department; HR → any binome; ALL binomes take anyone | Every binome has an HR member. |
| 3 | Pairing = random draft, admin edits, then **Lock** creates the files | Editable before anything is shared. |
| 4 | Alerts on four channels: Alerts tab, instant email to admins, email to the binome concerned, daily digest | |
| 5 | 2025 forms copied into the 2026 folder and linked to the Master | |
| 6 | Codes are **typed** in the interview form and autocorrected, not dropdowns | Forms dropdowns aren't searchable. Typos, names for codes, wrong binome code (when the submitter belongs to the right one) are fixed and marked AUTOCORRECTED. |
| 7 | Backup interviewers / name mismatches → admins only; big mistakes (unknown code) → admins + binome | Binomes change when a member is unavailable. |
| 8 | Interview slot = date + time in the binome sheet | Enables exact "overdue" checks. |
| 9 | Limits 24h not contacted / 48h no date / 12h after interview with no form, counted from **assignment** | Registrations that waited for binomes aren't instantly late. Editable in Settings. |
| 12 | Team "Available" checkbox replaced by **"Exclude"** | Empty checkboxes are FALSE: everyone would have been unavailable. |
| 13 | Personal Gmail recognised when its local part holds ≥2 name tokens | 2025 members submitted from personal Gmail. |
| 14 | `TRUSTED_BACKUPS` setting | The 2025 HR head covered ~7 binomes: would be many MEDIUM alerts. |
| 15 | Format-only autocorrections (`B48` → `B.48`) stay in the Interview Log; only substantive ones make alerts | 97 of 108 autocorrections in 2025 were trivial. |
| 16 | Board interviews as in 2025 (Committee → ALL binomes, Council → HR side); a leftover no-HR binome is fine | Decided 2026-10-01. |
| 17 | **TEST_MODE** (default TRUE): mail only to admins, no sharing, Re-share refuses | The live Master can be tested without emailing ~100 members. |

## Binome changes after lock (2026-10-02, phases A–D)

| Decision | Why |
|---|---|
| No automatic pairing once binomes are locked; free members are flagged (`UNPAIRED_MEMBER`) | A redraw after lock would reshuffle live binomes. |
| The Binomes row stays the single source of truth; the tools also fix what a hand edit leaves behind (title, sharing, history, mails) | |
| Permanent change: the leaver **loses edit access**; anyone freed shows up as unpaired until placed | |
| Swap = both seats in one lock, rolled back if a write fails | No half-done swaps. |
| Cover is linked to **interviewee codes**, gets **view-only** access, the binome stays responsible for its sheet | The binome keeps ownership; the stand-in only needs to see the candidates. |
| A cover stops applying the moment it ends, even if removing access fails (retried every sync, `ENDING`) | An ended cover must never count as a member. |
| Covers take back only the access they gave | Don't remove access someone already had (e.g. an admin). |
| Manual edits: baseline in script properties, compared by every writing run; admins choose Apply / Revert / Accept | Hand edits of the tabs silently break files, sharing and history. |
| Typed Status and cleared Binome are put back automatically; deleted Interviewees rows are kept aside, not re-imported | Status is computed (an edit would be lost or stick); a cleared binome or deleted row would otherwise get a new binome/code. |
| ACTIVE ↔ PAUSED by hand is intended (INFO only) | That is how a binome is paused. |
| Full sheet check never runs on the frequent trigger; it is time-boxed and resumable | It opens ~50 files (1–2 min); Vercel's limit is 300s. |
| Manual-edit / integrity alerts go to admins only | They're about the Master, not the binome's work. |
| **Reset all binomes** (2026-10-03): typed phrase, checked by the script too; binome sheets trashed, not deleted; registrations deleted on purpose stay remembered | Starting over with a new team must be possible before launch, and impossible by a misclick; trash keeps 30 days to undo. |

## Dashboard on Vercel (2026-10-01) — details in [vercel.md](vercel.md); UI decisions in [frontend.md](frontend.md#decisions)

| Decision | Why |
|---|---|
| Static single-page app + plain Node functions on Vercel; the script runs **as the visitor** through `scripts.run` | Fixes multi-account breakage of `google.script.run`; Drive keeps deciding access. |
| Access = `@g.enp.edu.dz` **and** editor/owner of the Master; Setup is owner-only | Sharing the Master is the only access switch. |
| OAuth client in an ENP Cloud project, consent screen Internal | Only ENP accounts can sign in. |
| 48h session fixed from sign-in; refresh token sealed in an HttpOnly cookie | No token reaches browser JS. |
| Long actions synchronous with `maxDuration: 300`; Lock/Sync/check get ~150–200s budgets and resume | Vercel Hobby limit. |
| Logs: email · action · duration · ok/error, never arguments or results | Candidate data. |
| Script ships first and only ever adds; front and script versions checked by `API_VERSION` | Old front + new script must keep working during a deploy. |

## Open questions

All answered by the owner on 2026-10-17 (question 2 on 2026-10-04). None is open.

1. Should the president and other board members interview? **Yes, as ordinary team members** paired by their own
   department, never as `ALL` (board-led) binomes. So no ALL binomes are drafted.
2. ~~Leftovers of the draft~~ **Settled 2026-10-04: kept as they are for now.** B.29 and B.30 are HR + HR (tag
   `HR`, so they only get HR candidates) and B.31 is one member alone. The Team tab is the live OT list. The owner
   will adjust these binomes with Change members as the list settles. (The production binomes of 2026-10-15 replaced
   these; B.29 and B.30 are again HR + HR.)
3. Should ALL (board) binomes receive fewer candidates? **No.** There are no ALL binomes (question 1), so
   `ALL_BINOME_WEIGHT` changes nothing; leave it as it is.
4. Confirmation email to registrants with their code? **Yes.** It is an HTML + CSS email in the VIC design language,
   and the same template carries every email the script sends: binome mails, admin alerts and the daily digest.
   Planned in [launch-features.md](launch-features.md#4-emails-one-template-and-a-confirmation-to-registrants).
5. What do the department choices mean? The 1st choice is the department the candidate wants most. The 2nd is the one
   the binome looks at if the candidate doesn't fit the 1st after the interview. A candidate who picks the same
   department twice really wants it, and it's just a club, so it must never count against them. **Keep both alerts,
   for information only:** `SAME_CHOICES` drops from MEDIUM to INFO (no instant email, not a routing fix to make) and
   `CHOICE_MISMATCH` stays INFO. Done in PR #82.
6. Should new-interviewee emails be turned down? **No.** `NOTIFY_BINOME_ON_NEW_INTERVIEWEE` stays on: binomes should
   get the mail as soon as the candidate is assigned (the next 1-minute sync), so they can contact the candidate while
   the candidate is still on their phone or PC.
