# Sheets API appends on opening day

Research for issue #112 (map #110), feeding decision #120 "How a registration reaches the Master". Researched 2026-10-22 from Google and Vercel documentation only. Nothing was run against the live Master or any Google account.

Question: can a service account append a row to the Master's Registration Responses tab safely on opening day?

## Short answer

- Quotas are not a problem at VIC's volume. The limit is 60 write requests per user per minute and 300 per project per minute. 2025 had 273 registrations over the whole season.
- The docs do not say whether simultaneous appends can overwrite or interleave. This is unconfirmed. `INSERT_ROWS` is the documented way to avoid overwriting existing data, so use it, and add a retry plus a post-write check.
- A numeric serial written to the Timestamp cell is stored as a number. Whether the Registration Responses column then displays and reads back as a Date depends on that column's number format, which the docs do not cover. Unconfirmed, needs a test on a copy.
- A row written through the API does not fire the form-submit trigger. Confirmed in the Apps Script docs.
- Whether a key is allowed depends on the Google Cloud organization. The policy that blocks keys is on by default only for organizations created on or after 3 May 2024. Workload Identity Federation with Vercel OIDC avoids keys entirely. The docs give the steps but no time estimate.

## 1. Write quotas and what hitting one looks like

Source: Google Sheets API usage limits, https://developers.google.com/workspace/sheets/api/limits (page updated 2026-09-03).

| Request type | Per project per minute | Per user per project per minute |
|---|---|---|
| Read | 300 | 60 |
| Write | 300 | 60 |

- Exceeding a limit returns HTTP `429: Too many requests`. Quotas refill every minute.
- Google recommends exponential backoff with random jitter, capped at a maximum backoff (typically 32 or 64 seconds), with a limit on total attempts.
- A service account is one user for the per-user limit. All registrations from the site share 60 writes per minute, one append per second on average. Each registration is one append call. A burst above 60 in one minute gets 429s, and the function must retry or the registration is lost.
- Not confirmed from the docs: whether the limit is a sliding or fixed window. Retries are requests too, so assume they count against the same bucket.

## 2. Concurrent appends with INSERT_ROWS

Sources: Sheets API "Read & write cell values", https://developers.google.com/workspace/sheets/api/guides/values (2026-09-03); `spreadsheets.values.append` reference, https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append (fetched 2026-10-22).

- Append finds a "table" inside the given range and writes to "the next row of the table, starting with the first column of the table".
- By default "the input overwrites data after the table". With `insertDataOption=INSERT_ROWS`, "rows are inserted for the new data". The reference says the same: `OVERWRITE` overwrites existing data in the area it writes, `INSERT_ROWS` inserts rows.
- Neither page says anything about simultaneous appends, atomicity or ordering. Whether two calls landing at the same instant can overwrite each other or interleave is **unconfirmed**. The docs make no promise either way.
- Practical reading: use `INSERT_ROWS`, pass a range that is the tab name so table detection starts from the header, and read `updates.updatedRange` from the response to learn which row each call wrote. A mismatch can be logged. A load test on a copy of the Master (not the live one) is the only way to settle the doubt.
- The Apps Script side keys rows by `timestamp ms | email` (see `docs/registration-app.md`), so a duplicate row is detected there, but an overwritten row would be lost silently. That is the case to test.

## 3. Writing the Timestamp (RAW vs USER_ENTERED)

Sources: Values guide (above), ValueInputOption reference https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption (fetched 2026-10-22), DateTimeRenderOption reference https://developers.google.com/workspace/sheets/api/reference/rest/v4/DateTimeRenderOption (fetched 2026-10-22).

- `RAW`: "the values the user has entered will not be parsed and will be stored as-is." The guide adds that strings are inserted as strings, and that non-string values such as numbers and booleans are always handled as RAW. A number sent with `RAW` stays a number.
- `USER_ENTERED`: parsed "as if the user typed them into the UI". "Numbers will stay as numbers, but strings may be converted to numbers, dates, etc." Example from the guide: "Mar 1 2016" becomes a date.
- Serial number definition: the integer part counts days since 30 December 1899, the fraction is the time of day.
- So a serial sent as a JSON number is stored as a number with either option. A string like `2026-10-25 09:00:00` sent with `RAW` is stored as text, which Apps Script would read as a String, not a Date. With `USER_ENTERED` the string is parsed using the spreadsheet's locale, which risks day/month mix-ups.
- The docs do not say whether appended rows pick up the column's date number format. A Form row shows as a Date because its column is formatted as a date. **Unconfirmed from the docs**: check on a copy that an appended serial in the Timestamp column displays as a date and `getValues()` returns a Date.
- A serial has no time zone, so the function must compute it in the spreadsheet's time zone. That setting was not covered by the pages read, so treat the details as unconfirmed.

## 4. Organization policy blocking keys, and the Workload Identity Federation route

Sources: Restricting service account usage, https://docs.cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts (updated 2026-10-13); Workload Identity Federation overview, https://docs.cloud.google.com/iam/docs/workload-identity-federation (updated 2026-10-13); Vercel, Connect to Google Cloud Platform, https://vercel.com/docs/oidc/gcp (updated 2026-09-01).

The policy:
- `iam.disableServiceAccountKeyCreation` is "enforced by default" for organizations created on or after 3 May 2024.
- Changing it needs permission to set organization policies, for example the `orgpolicy.policyAdmin` role.
- Related constraints: `iam.managed.disableServiceAccountKeyCreation`, `iam.managed.disableServiceAccountKeyUpload`, and `iam.serviceAccountKeyExpiryHours` (expiry on newly created keys).
- The page covers organizations, folders and projects inside an organization. What applies to a project with no organization is not stated. Unconfirmed. Whether VIC's Google Cloud project sits in an organization is something the owner has to check in the console.

The Vercel OIDC route (no key). Vercel says OIDC federation is available on all plans. Steps from Vercel's page:
1. In Google Cloud, IAM & Admin, Workload Identity Federation: create a pool.
2. Add an OIDC provider with issuer `https://oidc.vercel.com/[TEAM_SLUG]` (team mode) or `https://oidc.vercel.com` (global). Audience: the default audience (Google's recommendation) or `https://vercel.com/[TEAM_SLUG]`. Map `google.subject` to `assertion.sub`.
3. Create a service account. Grant the pool principal `principal://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/<pool>/subject/owner:<team>:project:<project>:environment:<env>` access to it, one principal per project and environment. Vercel's page has this under the service account users role. Google's overview says impersonation needs the Workload Identity User role on the service account, so confirm which one the console applies.
4. Set five environment variables in the Vercel project: project ID, project number, service account email, pool ID, provider ID.
5. In the function, use `@vercel/oidc` `getVercelOidcToken` as the subject token supplier for `google-auth-library`'s `ExternalAccountClient`, with `service_account_impersonation_url` pointing at the service account's `generateAccessToken`. The result is an auth client that can call a Google API. Vercel's example calls Vertex AI, not Sheets, so a Sheets call is not shown on that page.

Time to set up: neither Google nor Vercel gives a figure. **Unconfirmed.** The steps above are a pool, a provider, a service account, one IAM binding, five env vars and two libraries. The roles needed to create a pool and provider are not listed on the pages read, so who at VIC can do it depends on their Google Cloud access (unconfirmed).

Also needed on either route, not covered by the pages above: the Master must be shared with the service account's email as an editor, and the Sheets API enabled in the Cloud project.

## 5. Does an API-written row fire the form-submit trigger?

Source: Apps Script, Installable triggers, https://developers.google.com/apps-script/guides/triggers/installable (updated 2026-09-03).

- "Script executions and API requests don't cause triggers to run." The page's own example is a form response submitted by script, which does not fire the form's submit trigger.
- The page does not discuss spreadsheet `onChange` or `onEdit` for API writes specifically. Only the general rule applies. Unconfirmed for `onChange` specifically.
- This matches the 19 Oct plan and the 2026-10-04 test in `docs/registration-app.md`: rows written through the Sheets API are picked up by the timed `syncAll`, not the form trigger. The delay is the timed trigger interval.
- Apps Script quotas (https://developers.google.com/apps-script/guides/services/quotas, 2026-09-03): triggers per user per script 20, one execution 6 minutes, trigger runtime per day 90 minutes on a consumer account or 6 hours on Workspace, email recipients per day 100 (consumer) or 1,500 (Workspace). The confirmation mails from `sendConfirmations_` share the email quota, which matters if the club account is a consumer account.

## Open items for the decision

1. Is the Cloud project inside an organization, and is key creation blocked? (owner, in the console)
2. Does an appended serial in the Timestamp column read back as a Date? (test on a copy)
3. Do simultaneous appends ever overwrite? (load test on a copy, under 60 writes per minute)
4. Time to set up Workload Identity Federation: no published figure.
