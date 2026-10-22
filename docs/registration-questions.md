# VIC Registrations Form 2026: the questions, as candidates see them

Copied on 2026-10-22 from the public responder page of the Google Form (`CONFIG.REGISTRATION_FORM_ID` is its edit id), the same
way the Interview Form was copied on 2026-10-18 (`INTERVIEW_QUESTIONS` in Config.gs). Questions only: no response was opened,
submitted or copied. The registration form on the site and the Google Form fallback both have to ask these questions, so both
paths land in the same Registration Responses tab under the same headers (`regHeaders_` finds columns by header text).

- Responder link: `https://docs.google.com/forms/d/e/1FAIpQLSeDevpaBLIDzi62CNtqq92FM_GY_rZLnzZJ-fsCWcgtYPaiDg/viewform`
  (the edit id plus `/viewform` redirects to it). Page title: "Vision & Innovation Club | Registrations".
- Titles are exact, odd spaces included; a trailing space is shown as `␣`.
- `entry.N` is the field id a prefilled link uses (`?usp=pp_url&entry.N=...`). Sections and text blocks have no entry.
- Types: short = short answer, long = paragraph, one = multiple choice (one answer), many = checkboxes.
  No question has a validation rule (no length, number, regex or email check). Birth Date is a date picker.
- Whether the form collects the respondent's email itself (the "Email address" column) is a form setting the public page does
  not show; the Master tab has that column, so it does.

## Intro (above section 1)

> Welcome, Future VICers!
> We’re thrilled that you’re taking the first step toward joining the VIC family!
> Please take a moment to fill out the registration form by selecting your preferred department and carefully reviewing each description before making your choice.
> 📅Deadline to submit the form: October 29th at 23:59.
> COMM Department (Communication)
> The voice of VIC! Responsible for sharing our events and activities across social media platforms and creating engaging, creative content.
> FLER Department (Finance, Logistics & External Relations)
> Represents VIC to the outside world  finding sponsors, building partnerships, and maintaining strong external relations.
> IT Department (Information & Technology)
> Brings ideas to life through design, the creative force behind VIC’s visuals, designs, reels, videos, goodies, and everything that shapes our visual identity.
> HR Department (Human Resources)
> The heart of the club, The people behind the harmony. HR manages internal organization, motivates members, and ensures a strong and positive club atmosphere.
> Keep an eye on your inbox! After registering, you’ll receive an email soon regarding your acceptance and all the details about your first-phase interview.
> If you need any help or have questions, reach out anytime at vic.rh@g.enp.edu.dz.

## Flow

```
Section 1  Tell Us About Yourself     14 questions, ends on the 1st department choice
   |  the 1st choice picks the next section:  IT -> 2, COMM -> 3, HR -> 4, FLER -> 5
   +- 2  Information & Technology        no jump set (see Branching)
   +- 3  Communication                   -> 6
   +- 4  Human Resources                 -> 6
   +- 5  Finance, Logistics & External Relations -> 6
Section 6  Interview Details           2 optional questions
Section 7  Almost Done!                image, 1 optional question, closing text block
```

The 2nd department choice does not branch. The department sections sit in the form in the order IT, COMM, HR, FLER; the choice
list reads COMM, FLER, HR, IT.

## Section 1: Tell Us About Yourself

| # | Title (exact) | Type | Req | Choices | Help text | Entry |
|---|---|---|---|---|---|---|
| 1 | `First Name` | short | yes | | | entry.1017297775 |
| 2 | `Family Name` | short | yes | | | entry.7537483 |
| 3 | `E-mail Address` | short | yes | | Use your ENP Mail (@g.enp.edu.dz) | entry.1847206913 |
| 4 | `Birth Date` | date (day, month, year) | yes | | | entry.1708886426 |
| 5 | `Phone Number` | short | yes | | | entry.1509945668 |
| 6 | `Facebook Link` | short | yes | | You must have a facebook account as it is our main platform of communication. | entry.1331543563 |
| 7 | `Discord Username␣␣` | short | yes | | You must have a discord account as it is our secondary platform of communication. | entry.1185277967 |
| 8 | `Field of Study␣` | one | yes | PREPA, DATA, INDUS, AUTO, ELN, ELT, ELT-HV, GCHIM, GP-ENV, HYDRAU, GC, MTRX, MECA, GM-AUTO, MINIER, QHSE | | entry.1601620170 |
| 9 | `Year of Study` | one | yes | 1ST, 2ND, 3RD | Note: 3RD is for 5th Year students. | entry.1477491215 |
| 10 | `How did you discover VIC?` | many | yes | Friends, Social Media, Stand, Open Day, Other (free text) | | entry.1272959489 |
| 11 | `Why do you want to be part of the Vision & Innovation Club family?` | long | yes | | | entry.1828792115 |
| 12 | `Have you had previous experience in other clubs? If yes, please mention them.␣␣` | long | **no** | | | entry.637103184 |
| 13 | `What's your first department choice?` | one | yes | COMM, FLER, HR, IT (each jumps to its section) | (You can find a brief description for each department up in the description) | entry.1795765931 |
| 14 | `What's your 2nd department choice?` | one | yes | COMM, FLER, HR, IT | | entry.496540556 |

## Section 2: Information & Technology (1st choice IT)

| # | Title (exact) | Type | Req | Choices | Entry |
|---|---|---|---|---|---|
| 15 | `Why did you choose the IT Department as your top preference?␣␣` | long | yes | | entry.1090978357 |
| 16 | `Do you have any experience with Graphic Design?` | one | yes | Yes, No, A Little | entry.233826173 |
| 17 | `Do you have any experience with Video Editing?` | one | yes | Yes, No, A Little | entry.1967637681 |
| 18 | `Do you have any experience with Photography and/or Videography?` | one | yes | Yes, No, A Little | entry.681291850 |
| 19 | `Do you have any experience with Web Development?` | one | yes | Yes, No, A little (lower-case "l") | entry.391031100 |

## Section 3: Communication (1st choice COMM)

| # | Title (exact) | Type | Req | Choices | Entry |
|---|---|---|---|---|---|
| 20 | `Why did you choose the COMM Department as your top preference?␣␣` | long | yes | | entry.961032301 |
| 21 | `Are you following the trends on social media?` | one | yes | Yes, No, Other (free text) | entry.1002976640 |
| 22 | `Which languages are you  the most familiar with?␣` (two spaces after "you") | many | yes | English, French, Arabic | entry.1989636011 |
| 23 | `How would you rate your language level across the languages you chose?` | rating 1 to 5 | yes | 1, 2, 3, 4, 5 | entry.2006024896 |

## Section 4: Human Resources (1st choice HR)

| # | Title (exact) | Type | Req | Choices | Entry |
|---|---|---|---|---|---|
| 24 | `Why did you choose the HR Department as your top preference?␣␣` | long | yes | | entry.1049844885 |
| 25 | `Are you comfortable using Google Tools (Sheets , Forms, Docs)` | one | yes | Yes, No, A Little | entry.126027182 |
| 26 | `Do you enjoy working in a team?␣␣` | one | yes | Yes, No, I'd like to work on it | entry.1120459983 |

## Section 5: Finance, Logistics & External Relations (1st choice FLER)

| # | Title (exact) | Type | Req | Choices | Entry |
|---|---|---|---|---|---|
| 27 | `Why did you choose the FLER Department as your top preference?␣␣` | long | yes | | entry.790099582 |
| 28 | `Would you have time to visit companies during the week if needed?` | one | yes | Yes, No, Other (free text) | entry.1975938642 |
| 29 | `How confident are you in your communication skills?` | rating 1 to 5 | yes | 1, 2, 3, 4, 5 | entry.143955449 |

## Section 6: Interview Details

Section help text: "The interview phase is the next step, If you’re selected, you’ll be invited to attend a presential interview where you’ll
have the chance to share more about yourself, your motivations, It’s also an opportunity for us to get to know you better and for you
to learn more about our club and its departments.␣␣" (bold in the form: "next step,", "presential interview", "share more about yourself, your motivations,").
The section title is `Interview Details␣`.

| # | Title (exact) | Type | Req | Choices | Help text | Entry |
|---|---|---|---|---|---|---|
| 30 | `Which days or times are you usually available for an interview?␣␣` | many | **no** | Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday | You can select more than one day. | entry.1399772703 |
| 31 | `Will you be able to attend your interview on time once the date is shared?␣␣` | one | **no** | Yes, No | | entry.1622089221 |

## Section 7: Almost Done!

An image titled "Ready to join the family?" (a picture block, no answer), then:

| # | Title (exact) | Type | Req | Entry |
|---|---|---|---|---|
| 32 | `Anything to add?` | long | **no** | entry.956397064 |

Closing text block, titled `Thank you!␣`: "Please double-check all your information before submitting the form.␣␣"

## Branching

- Only question 13 branches: COMM -> section 3, FLER -> section 5, HR -> section 4, IT -> section 2.
- Sections 3, 4 and 5 end with "go to Interview Details" (section 6). Section 2 (IT) has **no jump set** in the form's load
  data, yet it sits first in the order: unless Google ends it differently, an IT candidate would continue into the Communication
  questions. This was read from the page's own data. The paging was **not** walked live (the headless browser could not step the
  pages), so click through the live form once as IT before the fallback copies this.
- A skipped department leaves its sheet columns blank.

## Check against the Master's Registration Responses headers

The 19 Oct plan (read from the Master's header row on 2026-10-19) listed 34 columns: Timestamp, Email address (collected by the form), then
the 32 questions above (14 + IT 5 + COMM 4 + HR 3 + FLER 3 + interview 2 + Anything to add 1). The count matches and every
named column has its question. Department blocks match the doc's "IT 4, COMM 3, HR 2, FLER 2" own questions after each
"Why did you choose…" (questions 16 to 19, 21 to 23, 25 to 26, 28 to 29). The check was against that doc's wording, not the sheet's
header row itself. Two differences:

- That doc writes "Why do you want to be part of the VIC family?" for question 11; the form's title is "…the Vision & Innovation Club
  family?". `regHeaders_` matches by keyword, so either reads, but the new form should keep the form's title so both create the
  same column.
- That doc drops the trailing spaces; both forms should keep the titles as written above.
