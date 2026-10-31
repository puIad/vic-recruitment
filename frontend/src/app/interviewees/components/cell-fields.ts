import type { AnalyticsRow } from "@/lib/vic/types"

/** One editable column of the Interviewees table: its Master fields, how the registration row reads them, how the cell edits them. */
export interface CellField {
  id: string
  title: string
  keys: string[]
  read: (r: AnalyticsRow) => string[]
  /** which of the server's lists the cell picks from (candidateGet): the Edit form reads the same ones */
  options?: "depts" | "fields" | "years"
}
export const CELL_FIELDS: CellField[] = [
  { id: "name", title: "Name", keys: ["First Name", "Family Name"], read: (r) => [r.first, r.family] },
  { id: "email", title: "Email", keys: ["Email"], read: (r) => [r.email] },
  { id: "c1", title: "1st choice", keys: ["1st Choice"], read: (r) => [r.c1], options: "depts" },
  { id: "c2", title: "2nd choice", keys: ["2nd Choice"], read: (r) => [r.c2], options: "depts" },
  { id: "field", title: "Field", keys: ["Field"], read: (r) => [r.field], options: "fields" },
  { id: "year", title: "Year", keys: ["Year"], read: (r) => [r.year], options: "years" },
  { id: "avail", title: "Availability", keys: ["Availability"], read: (r) => [r.avail] },
]
