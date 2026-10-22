# Registration form comp (throwaway)

Prototype for wayfinder ticket #122, "The registration form's themed comp". Never merged. Synthetic answers only, nothing is sent.

Run: `python -m http.server 8123` from the repo root, then open `/prototype/registration-form/index.html` on a phone-sized window. Or open `registration-form.html` (single file, `python build.py` rebuilds it).

Three structures, switch with the bar at the bottom or `?v=A|B|C`. `?beat=sorting&house=HR` deep-links; the bar's Jump menu fills synthetic answers up to a beat and has the states (ticket expired, resend wait, house override).

| | Structure | Question it answers |
|---|---|---|
| A | One scrolling letter, a road down the left edge, sections unfold after the ticket | One page or steps |
| B | 8 grouped steps, one screen each, a rail of stops | Step order and grouping |
| C | One question per screen (22 for IT), auto-advance on single choice | Phone effort per question |

Beats (all three): letter, Platform 9¾ (the email code), questions, the choosing (1st and 2nd choice), the department block, interview details, almost done, owl post, received.

Things in the comp that are proposals, not decisions (react to them):
- Soft checks the Google Form lacks: phone length, Facebook link shape, birth year range, 2nd choice different from the 1st.
- Duplicate email caught at the ticket, not at submit.
- Draft saved on every change; a reload inside the hour goes straight back in; after 60 minutes only the code is asked again and the answers are still there.
- Confirmation says "received", never "accepted" (the Google Form's own intro promises "acceptance").

Fonts: Gilroy from the charter. The serif accent is the owner's own Magic School download (FontMesa, all rights reserved, no licence file), kept out of git and shown only in `registration-form.local.html` and on a local run; the committed build falls back to Cormorant Garamond (OFL). Magic School's letterforms imitate the film's title lettering, which ticket #119 kept out.

Contrast (WCAG ratios, wash = `--bg`, glow = `--bg2`):

| House | white on wash | white on glow | accent on wash | accent on glow | dark ink on accent |
|---|---|---|---|---|---|
| plain night | 16.9 | 14.3 | 8.1 | 6.9 | 8.5 |
| IT Gryffindor | 17.8 | 14.5 | 6.4 | 5.2 | 6.5 |
| COMM Ravenclaw | 17.2 | 12.6 | 7.8 | 5.7 | 8.3 |
| FLER Hufflepuff | 16.8 | 10.9 | 9.6 | 6.3 | 9.8 |
| HR Slytherin | 16.7 | 11.2 | 8.8 | 5.9 | 8.5 |

Reduced motion: every animation (wash fade, owl, rail fill) switches off and the same form shows.
