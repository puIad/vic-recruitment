# VIC Recruitment 2026

The club's recruitment: candidates register, binomes interview them, admins watch it all from the dashboard. The
Google Sheets hold the data; the dashboard is how people act on it.

## Registering

**Registration form**:
The form on VIC's own site where a candidate registers, opened by the landing page's Apply button.
_Avoid_: apply form, registration app, application form

**Google Form**:
VIC's Google registration form, kept always available so candidates can still register when the registration form
can't take them.
_Avoid_: registration form (for the Google one), old form, legacy form

**Email code**:
The 6-digit code mailed to a candidate's ENP address on the registration form's first screen. Typing it proves the
address and unlocks the rest of the form. The form and its mail call it the **ticket**, so it is never confused with a
candidate's code (like `IT.42`) in the confirmation.
_Avoid_: OTP, verification link, magic link

**House**:
The wizarding name and colours a department wears on the registration form and its mails: IT is Gryffindor (red),
COMM is Ravenclaw (blue), FLER is Hufflepuff (golden), HR is Slytherin (green). A candidate's house is the one of their
1st-choice department. The Master and binome sheets keep their own colours, with IT and COMM the other way round.
_Avoid_: team colour, department theme

## Binomes

**Binome**:
Two VIC members who interview, together, the candidates routed to them.
_Avoid_: pair, team, duo

**Tag**:
The departments a binome receives candidates for, for instance `IT & HR` or `HR`.
_Avoid_: department, type, label

**Mixed binome**:
A binome whose tag names two departments, one of them HR.
_Avoid_: double binome

**HR-only binome**:
A binome whose tag is `HR` alone, so it receives only HR candidates.
_Avoid_: pure HR binome, HR + HR binome

**Load**:
How many interviewees a binome is counted as having when the next candidate is routed: the lightest binome whose tag
fits the candidate's department gets them.
_Avoid_: workload, capacity, quota

## Sheets

**Master**:
The one Google Sheet that holds the recruitment's data and settings, and the source of truth for all of it.
_Avoid_: database, main sheet

**Binome sheet**:
The Google Sheet of one binome, holding its interviewees and the columns its members fill in.
_Avoid_: binome file, binome tab

**Sync**:
The timed cycle that reads the forms and the binome sheets into the Master and raises alerts.
_Avoid_: refresh, flush

**Snapshot**:
The copy of the Master that every dashboard screen shows, published again when the data changed (mostly by the sync).
A change in the sheet reaches other people's screens only when a snapshot that includes it is published; until then its
author's screen keeps showing their value.
_Avoid_: cache, live data, state

## Changes made on the dashboard

**Pending change**:
A change someone made on the dashboard to one value (one alert's status, one setting, or one field of one candidate)
that has been accepted but is not yet in the Master or the binome sheet. Only its author sees it before it is applied.
_Avoid_: queued write, cached write, draft

**Direct write**:
A change made on the dashboard that is written into the Master or the binome sheet while its author waits, without
becoming a pending change. Every change is a direct write while the owner has pending changes switched off.
_Avoid_: slow path, legacy write, sync write

**Applying**:
Writing a pending change into the Master or the binome sheet as the person who made it.
_Avoid_: flushing, syncing, saving

**Already met**:
A pending change that was not applied because the sheet already does what its author wanted, for instance the alert
they resolved had already closed. Its author is not told.
_Avoid_: superseded, skipped, no-op

**Dropped change**:
A pending change that was never applied, because the sheet changed in a way that does not do what its author wanted, or
because it could not be applied in time: its author lost access or their sign-in ended first, applying kept failing,
or it never got to run.
_Avoid_: rejected change, lost change, conflict

**Addressed**:
A dropped change whose author has chosen between keeping the sheet's value and applying theirs anyway.
_Avoid_: dismissed, acknowledged

## Signing in

**Sign-in**:
The 48 hours, counted from a person's latest sign-in with their ENP Google account on one browser, during which the
dashboard acts as them on that browser. Each browser has its own sign-in, and one ending leaves their sign-ins on other
browsers running. Signing out ends it on that browser only. Another account signing in on that browser during the 48
hours ends all of that person's sign-ins. Pending changes saved during a sign-in can finish applying after it ends.
_Avoid_: session, login
