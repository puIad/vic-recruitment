import type { SettingsGroup } from "./settings-form"

export const GROUPS: Record<"general" | "timing" | "sharing" | "emails" | "screening", SettingsGroup> = {
  general: {
    title: "General",
    description: "Who the admins are, how candidates are shared out, and when the script runs.",
    sections: [
      { title: "Admins and email", description: "Who hears about alerts.", keys: ["ADMIN_EMAIL", "TRUSTED_BACKUPS"] },
      { title: "Assigning candidates", description: "Which binome each new registrant goes to.", keys: ["ASSIGNMENTS_OPEN", "BALANCE_BY", "HR_ONLY_WEIGHT", "ALL_BINOME_WEIGHT"] },
      { title: "Schedule", description: "When the script reads the binome sheets and sends the digest.", keys: ["SYNC_EVERY_MINUTES", "DIGEST_HOUR"] },
      { title: "Advanced", description: "Rarely changed. Fixed values are changed in the Settings tab of the Master.", keys: ["TIMEZONE", "EMAIL_DOMAIN"], folded: true, rest: true },
    ],
  },
  timing: {
    title: "Alerts and timing",
    description: "How long a candidate may wait before the script raises an alert, and how loudly.",
    sections: [{ keys: ["HOURS_NOT_CONTACTED", "HOURS_NO_INTERVIEW_DATE", "HOURS_AFTER_INTERVIEW_NO_FORM", "INSTANT_EMAIL_MIN_SEVERITY"] }],
  },
  sharing: {
    title: "Sharing and email",
    description: "Test mode, whether binome sheets are shared, and who hears about what. The emails and their texts are under Emails.",
    sections: [{ keys: ["SHARE_FILES_WITH_BINOME"] }],
    own: ["TEST_MODE"],
  },
  emails: {
    title: "Emails",
    description: "The mails the script sends to candidates and binome members. You change the words; the layout, who gets each mail and test mode stay the same.",
    sections: [
      {
        title: "Result mails: next steps and group links",
        description: "Each department's next step and Messenger group. Send results is refused for a department with accepted candidates and no next step or no https link. The mail button goes through the site, which records the first click and sends them to the group.",
        keys: ["RESULT_NEXT_IT", "RESULT_NEXT_COMM", "RESULT_NEXT_FLER", "RESULT_NEXT_HR", "RESULT_GROUP_IT", "RESULT_GROUP_COMM", "RESULT_GROUP_FLER", "RESULT_GROUP_HR", "RESULT_REPLACES"],
      },
    ],
    own: ["CONFIRM_REGISTRANTS", "NOTIFY_BINOME_ON_NEW_INTERVIEWEE", "NOTIFY_BINOME_ON_ALERT"],
    mail: true,
  },
  screening: {
    title: "Screening",
    description: "Hold low-effort applications for a person to read before any binome sees them, and decline VIC members without telling them.",
    sections: [{ keys: ["SCREENING", "SCREEN_HOLD_AT"] }],
    own: ["VIC_MEMBERS_SHEET"],
  },
}
