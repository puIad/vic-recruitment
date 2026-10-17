# VIC Recruitment 2026

The club's recruitment: candidates register, binomes interview them, admins watch it all from the dashboard. The
Google Sheets hold the data; the dashboard is how people act on it.

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

## Changes made on the dashboard

**Pending change**:
A change someone made on the dashboard that has been accepted but is not yet in the Master or the binome sheet. Only
its author sees it before it is applied.
_Avoid_: queued write, cached write, draft

**Applying**:
Writing a pending change into the Master or the binome sheet as the person who made it.
_Avoid_: flushing, syncing, saving

**Dropped change**:
A pending change that was never applied, because the sheet no longer held what its author saw, or because applying it
kept failing.
_Avoid_: rejected change, lost change, conflict

**Addressed**:
A dropped change whose author has chosen between keeping the sheet's value and applying theirs anyway.
_Avoid_: dismissed, acknowledged
