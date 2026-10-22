# Registration app: superseded

The 19 Oct plan was replaced on 22 Oct by [registration-form.md](registration-form.md), written on wayfinder map
[#110](https://github.com/puIad/vic-recruitment-2026/issues/110). The form now lives at `/apply` on the vic-enp site
(not a separate project), proves the email with an email code sent by a standalone mailer, wears a Harry Potter theme
inside the IT Charter 2026 look, and keeps the Google Form as the fallback behind `VITE_APPLY_URL`.

What carried over unchanged: the Sheets API row as a service account, columns found by header, the timed sync doing the
rest, English only, no status lookup or editing. The landing page is built in `puIad/vic-enp`, not in a `site/` folder
here.
