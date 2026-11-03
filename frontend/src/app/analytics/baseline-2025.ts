/** Registrations per day in 2025, from the day of the opening (index 0 = day 1). Counts only, derived once from the local
 *  2025 registration file: no personal data. null = not derived yet, and the page draws 2026 alone.
 *  Source: "VIC Registrations Form 2025 (Responses)", RAW tab, Timestamp column in Africa/Algiers: 273 registrations,
 *  no duplicate account email, 20 Oct 2025 (first at 23:33) to 30 Oct 2025. */
export const REG_2025_DAILY: number[] | null = [5, 53, 24, 15, 14, 16, 23, 27, 35, 51, 10]

/** n of total as a whole %, for setting a 2025 share beside this year's */
export const share = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0)
/** n of total in %, unrounded: chart bars, where a whole % would flatten small buckets (vsTip rounds for display) */
export const pctOf = (n: number, total: number) => (total ? (n * 100) / total : 0)

/** 2025's side of the other cards, from the same file and counted with the model's own rules (overall year, the heard
 *  options, words per answer). Counts only. null = the cards show 2026 alone. */
export interface Baseline2025 {
  total: number
  /** registrations per hour of the day, Algiers time, index = hour */
  byHour: number[]
  /** overall year 1…5 */
  byOverall: number[]
  prepa: number
  special: number
  byField: Record<string, number>
  /** dept → [1st choice, 2nd choice] */
  demand: Record<string, [number, number]>
  sameChoice: number
  noSecond: number
  heard: Record<string, number>
  heardOther: number
  heardAnswered: number
  whys: number
  medianWords: number
  /** answers per length band, the model's LEN order */
  byLength: number[]
}

export const BASE_2025: Baseline2025 | null = {
  total: 273,
  byHour: [10, 2, 0, 0, 0, 1, 0, 7, 11, 7, 13, 9, 10, 6, 10, 13, 18, 13, 22, 20, 16, 34, 25, 26],
  byOverall: [137, 23, 98, 12, 3],
  prepa: 160,
  special: 113,
  byField: { PREPA: 160, AUTO: 16, DATA: 13, "GM-AUTO": 12, ELT: 12, "GP-ENV": 9, QHSE: 8, MTRX: 7, "ELT-HV": 7, ELN: 6, HYDRAU: 5, INDUS: 5, GCHIM: 4, GC: 4, MINIER: 3, MECA: 2 },
  demand: { IT: [153, 68], HR: [45, 59], COMM: [25, 42], FLER: [50, 104] },
  sameChoice: 13,
  noSecond: 0,
  heard: { Friends: 170, "Social Media": 148, Stand: 36, "Open Day": 80 },
  heardOther: 20,
  heardAnswered: 273,
  whys: 273,
  medianWords: 19,
  byLength: [75, 105, 57, 27, 9],
}
