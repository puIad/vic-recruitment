# Email proof inside Instagram's in-app browser

Research for issue #111, feeding the decision in #118. Researched 2026-10-22. Each source is dated with the "last updated" or publish date the page itself shows. Anything not confirmed from a primary source is marked **unconfirmed**.

## Short answer

| Option | Works from Instagram's browser? | Main risk |
|---|---|---|
| Google sign-in | No. Google says webviews are not supported for sign-in and blocks OAuth in embedded user-agents. | Candidate must leave the page for a real browser. |
| 6-digit code | Yes in principle. Needs no third-party sign-in. | Form state after switching to Gmail and back is unconfirmed (see section 2). Sending quota. |
| Magic link | Opens outside Instagram's browser, so the form and its state are not shared. | Candidate lands in a different browser with different storage. |

## 1. Google sign-in

- Google's policy forbids sending OAuth 2.0 authorization requests through "embedded user-agents under the developer's control", and requires that the user can verify the connection to Google's OAuth server. Source: Google OAuth 2.0 policies, "Use secure browsers", last modified 2026-08-05. https://developers.google.com/identity/protocols/oauth2/policies
- Google's enforcement post: all embedded webviews blocked from 2021-09-30, non-compliant requests show `disallowed_useragent`. It also warns that a site's Google sign-in "may be impacted due to another developer's decision to use an embedded webview", which is the Instagram case. Source: Google Developers Blog, 2021-06-29. https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- Sign in with Google (Google Identity Services) says "Android and iOS webviews are not supported for user sign-in" and recommends Chrome Custom Tabs on Android and SFSafariViewController on iOS. Source: GIS supported browsers, last updated 2026-09-01. https://developers.google.com/identity/gsi/web/guides/supported-browsers . The page does not name Instagram or Facebook.
- Field report (not primary): an Auth0 community thread reports 403 `disallowed_useragent` for Google login from Instagram and TikTok in-app browsers, and says it sometimes works. Treat "sometimes works" as unconfirmed and not something to build on. https://community.auth0.com/t/google-social-error-for-web-login-from-embedded-browsers/110494
- A way round without leaving the page: none found in Google's docs. The sanctioned routes are a system browser, Custom Tabs or SFSafariViewController, all of which Instagram controls, not the website.
- Whether Instagram's browser counts as an "embedded user-agent" under the policy wording (developer-controlled libraries that can inject scripts or read cookies) was not stated by Google for Instagram specifically. Reported script injection by Meta's apps on iOS (section 5) points to yes. **Unconfirmed by Google.**

## 2. 6-digit email code: page state across a trip to Gmail

What the primary sources say about the mechanics:

- Android WebView docs describe `saveState` / `restoreState` for "background process reclamation", so a host app restores a page only if it chooses to. Source: Android Developers, WebView guide, last updated 2026-10-16. https://developer.android.com/develop/ui/views/layout/webapps/webview
- WKWebView runs page content in a separate process that iOS can terminate, and the app has to reload it. Apple's page body did not load in my fetch, so this is general knowledge of the API: **unconfirmed against Apple's page**. https://developer.apple.com/documentation/webkit/wkwebview

What was not found:

- Whether Instagram on iPhone or Android keeps its in-app browser tab alive, reloads it, or keeps localStorage after the user switches to Gmail and returns. Meta publishes no documentation on this. **Unconfirmed.** It likely depends on device memory and OS process reclamation, so it can differ per phone.
- Instagram's Help Center page for the in-app browser did not load, so Meta's own wording is unconfirmed.

Design implication (inference, not a sourced fact): assume the page may reload. Save typed answers to localStorage and to a server-side draft, and make code entry resumable. A real test on one iPhone and one Android phone with Instagram is the only way to settle the behaviour. localStorage in a webview is per app, so it does not match the candidate's Safari or Chrome storage.

## 3. Magic link: which browser opens from Gmail

- Android: Chrome Custom Tabs are "powered directly by the user's preferred browser" and share its cookies and state. WebView does not share browser state ("the system's browser app doesn't share its application data with your app"). Sources: Chrome for Developers, Custom Tabs docs (undated page); Android WebView guide, 2026-10-16. https://developer.chrome.com/docs/android/custom-tabs
- Whether Gmail for Android opens a tapped link in a Custom Tab or the default browser app: **unconfirmed**. No primary source found.
- Gmail for iPhone: only old (2012) secondary sources were found, describing a Safari or Chrome choice in Gmail settings. Current behaviour is **unconfirmed**.
- Either way, a link tapped in Gmail opens in a browser context separate from Instagram's in-app browser. That context has its own cookies and localStorage, so an unfinished form in Instagram is not available there. A handoff needs the draft stored on the server and recovered through the link token. (Inference from the storage-isolation facts above.)

## 4. Sending codes from Apps Script as vic.rh

- Apps Script quotas: email recipients per day (MailApp) 1,500 for Google Workspace accounts and 100 for consumer accounts, 2,000 recipients per day within the domain, 6 minutes per execution, 30 simultaneous executions per user, 1,000 per script. Source: Apps Script quotas, last updated 2026-09-03. https://developers.google.com/apps-script/guides/services/quotas . The footnote on the MailApp row did not load. **Footnote unconfirmed.**
- MailApp counts recipients, not messages. `getRemainingDailyQuota()` returns the remaining recipients and "might vary between executions". Source: MailApp reference (undated). https://developers.google.com/apps-script/reference/mail/mail-app
- Gmail limits for a Workspace user: 2,000 messages per day, 10,000 total recipients, 3,000 external recipients, 2,000 unique external recipients (500 for trial accounts). Mail-merge style sending is 1,500 messages and 1,500 recipients. Limits apply over a rolling 24 hours, can change without notice, and exceeding them blocks sending for up to 24 hours while receiving still works. Source: Google Workspace knowledge base, Gmail sending limits, last updated 2026-10-20. https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- Burst behaviour: the Gmail page lists no per-minute or burst limit. The only concurrency figure is 30 simultaneous Apps Script executions per user, so a rush of candidates triggering the script at once can queue or fail past 30. **A per-minute sending cap is unconfirmed.**
- A trial account keeps trial limits until the domain has paid at least USD 100 cumulatively (up to 75 days). Whether vic.rh is on a trial, nonprofit or Education plan was not checked.
- Working number for the decision: the binding cap is 1,500 code mails per rolling 24 hours, and every resend counts as one. If 600 candidates each need two codes, that is 1,200, close to the cap. A block lasts up to 24 hours and would also stop vic.rh's other mail.

## 5. Meta's in-app browser

- No Meta developer documentation or Help Center text about the Instagram in-app browser could be read. Instagram's help page fetched without content. **Meta's own statement is unconfirmed.**
- Reported by researcher Felix Krause in August 2022 and covered by The Register: Instagram and Facebook on iOS open links in an in-app browser built on WKWebView and inject JavaScript into third-party pages. Meta replied that the code honours App Tracking Transparency choices. This is secondary reporting, four years old, and current behaviour is unconfirmed. https://www.theregister.com/2022/09/23/meta_app_tracking/
- A third-party blog dated October 2025 says Instagram has no setting to open links externally by default and that the per-link menu has "Open in Browser". Unconfirmed by Meta. https://linklyhq.com/blog/open-instragram-link-in-browser
- Apple's SFSafariViewController page did not load, so statements about it rely on Google's recommendation above rather than Apple's text. https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller

## What would settle the open items

1. Test on one iPhone and one Android phone: open the site from an Instagram link, type into the form, switch to Gmail, return after 1 minute and after 10 minutes. Record whether the page reloads and whether localStorage survives.
2. On the same phones, tap a link in Gmail and note which browser opens.
3. Check vic.rh's Workspace plan (paid or trial) and run `MailApp.getRemainingDailyQuota()` from the real script.
4. Optionally send 30 to 50 test mails in a burst from Apps Script to see whether throttling shows up.
