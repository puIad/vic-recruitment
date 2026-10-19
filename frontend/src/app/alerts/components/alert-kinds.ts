import type { Alert } from "@/lib/vic/types"

export const TIMING = ["NOT_CONTACTED", "NO_DATE", "OVERDUE", "BAD_DATE"]
/** Screening: an application on hold, or a VIC member who already has a binome. */
export const REVIEW = ["NEEDS_REVIEW", "VIC_MEMBER"]

/** A binome can be emailed about it: a timing alert, or an odd value in its sheet. */
export const nudgeable = (a: Alert) => !!a.binome && (TIMING.includes(a.type) || (a.type === "ODD_VALUE" && a.q?.kind === "iv"))
