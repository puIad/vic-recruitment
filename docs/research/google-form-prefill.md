# Handing a candidate's answers to the Google Form

Research for issue #114, feeding #121. Written 2026-10-22. Docs only: VIC's real Google Form was not opened or submitted.

Short answer: Google documents that prefilled links exist and how an owner makes one, but the public pages read do not document the link format, which question types prefill, section behaviour, or a URL length limit. Those are marked unconfirmed below and need a test on a throwaway copy of the form before anyone relies on them. Sign-in is the bigger risk: a prefilled link does not remove it, and Google sign-in is blocked in embedded in-app browsers.

## 1. Prefilled links

| Fact | Status | Source (read 2026-10-22) |
|---|---|---|
| The owner makes a prefilled link in the form editor: More (three dots), "Pre-fill form", fill answers, "Get link". | Confirmed | [Publish & share your form with responders](https://support.google.com/docs/answer/2839588?hl=en) |
| The link shape `viewform?usp=pp_url&entry.N=value` and how entry ids map to questions. | Unconfirmed. No Google help or API page read states it. It is known only from the editor's generated link. | none |
| The Forms API `Item.itemId` and `Question.questionId` are not documented as the same thing as `entry.N` ids. The reference never mentions prefill or entry ids. | Confirmed absence; treat the API ids as unrelated until tested | [Forms API REST reference](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms) |
| Apps Script can generate a prefilled URL: `FormResponse.toPrefilledUrl()` "Generates a URL for the form in which the answers are pre-filled based on the answers in this form response." Needs the `forms.currentonly` or `forms` scope. | Confirmed | [Apps Script FormResponse](https://developers.google.com/apps-script/reference/forms/form-response) |
| Whether `toPrefilledUrl()` works on an unsubmitted response built with `form.createResponse()` and `item.createResponse()`. | Unconfirmed. The page says responses "can be created or accessed from a Form" and gives no item type list. | same |
| Question types that prefill (short and long text, multiple choice, dropdown, date). | Unconfirmed. The Forms API lists text, choice (radio, checkbox, dropdown), scale, date, time, rating and file upload question kinds, but says nothing about which accept prefill. | [Forms API reference](https://developers.google.com/workspace/forms/api/reference/rest/v1/forms) |
| Questions behind section branching. The API has `pageBreakItem` for sections, but no page says how prefilled values behave for sections the respondent never reaches. | Unconfirmed | same |
| A choice answer must match an option's text exactly. | Unconfirmed in docs; assume so and test. | none |

## 2. URL length on phones

No Google page gives a limit for Forms prefilled links. Browser limits from first-party sources:

- Chromium (Chrome, Android WebView, most Android in-app browsers): `kMaxURLChars = 2 * 1024 * 1024` (2,097,152 characters), the maximum URL passed between processes. Source: [chromium/src url/url_constants.h](https://chromium.googlesource.com/chromium/src/+/main/url/url_constants.h), read 2026-10-22.
- Safari and iOS WebKit (Instagram's iOS browser): no vendor document found. Blogs say about 80,000 characters. Unconfirmed.
- Server side: no Google Forms limit documented. Unconfirmed. A 34-question answer set with long free text could still run to several thousand characters, so the practical ceiling is Google's front end, which is untested.

Consequence: browsers are not the constraint at VIC's sizes. The unknown is Google's own server limit, so test a worst-case link (all 34 answers, long text) on a copy of the form.

## 3. Email collection and sign-in settings

- "Collect email addresses" has two modes. Verified: the respondent must be signed in to a Google account, and the account email is recorded with the response. Responder input: the respondent types an email, no Google account needed, and the address is not verified. Source: [View & manage form responses](https://support.google.com/docs/answer/139706?hl=en), read 2026-10-22.
- Google's help says respondents must sign in to a Google Account to fill a form that requires it, and that usernames are only recorded when the email collection setting is on. Source: [Publish & share your form](https://support.google.com/docs/answer/2839588?hl=en).
- A Google community guide says a form with "Responder input" can still be opened without sign-in when it has no file upload question and is not a quiz. Its body could not be retrieved in full, so this is secondhand and unconfirmed: [community guide](https://support.google.com/docs/community-guide/395355672/google-forms-why-your-respondents-are-being-forced-to-login?hl=en-GB).
- Whether a prefilled link keeps or skips the email field: unconfirmed in docs. With Verified mode the email comes from the account, so the site cannot supply it. With Responder input the email is a normal question that a link could in principle prefill (test it).
- Limit to 1 response is set under Settings, Responses, and implies sign-in. Source: [Publish & share your form](https://support.google.com/docs/answer/2839588?hl=en).

## 4. Requiring an ENP Google account on the fallback

- Google lets an owner restrict who can respond (a domain, trusted audience or group) under General access before publishing. Source: [Publish & share your form](https://support.google.com/docs/answer/2839588?hl=en). Restricting to an organization means every respondent must sign in with an account in it.
- Instagram's browser: Google's OAuth policy forbids sending Google sign-in to an embedded user-agent, and Google blocks it with `403 disallowed_useragent`; Google tells users to open the site in a normal browser. Sources: [OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies), [Understand & fix error codes](https://support.google.com/accounts/answer/16668185?hl=en), read 2026-10-22. Those pages cover OAuth for apps. Google's docs do not say that opening a Google Form in Instagram triggers the same block, and no Meta document was found. Unconfirmed, but it is the likely failure.
- Net effect: a Google Form that demands any Google sign-in (Verified email, limit to 1 response, or org restriction) is the setting most likely to strand phone candidates in Instagram, and a prefilled link does not help with that.

## 5. To verify before #121 is decided

1. On a throwaway copy of the form (never the live one), generate a prefilled link from the editor and confirm the `entry.N` format and each question type, including a question inside a branch.
2. Open the copy in Instagram's browser on iOS and Android, with and without sign-in required.
3. Test a worst-case long prefilled link.
4. Check whether `toPrefilledUrl()` works for a built, unsubmitted response. That would let a script map site fields to links without hand-copying ids.
