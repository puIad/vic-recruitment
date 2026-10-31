import type { AnalyticsRow } from "@/lib/vic/types"

const DEPTS = ["IT", "COMM", "FLER", "HR"]
// the registration form's options, as the server checks them (FORM_FIELDS / FORM_YEARS in QuickFix.gs)
export const FORM_FIELDS = ["PREPA", "DATA", "INDUS", "AUTO", "ELN", "ELT", "ELT-HV", "GCHIM", "GP-ENV", "HYDRAU", "GC", "MTRX", "MECA", "GM-AUTO", "MINIER", "QHSE"]
export const FORM_YEARS = ["1ST", "2ND", "3RD"]

/** One editable column of the Interviewees table: its Master fields, how the registration row reads them, how the cell edits them. */
export interface CellField {
  id: string
  title: string
  keys: string[]
  read: (r: AnalyticsRow) => string[]
  options?: string[]
}
export const CELL_FIELDS: CellField[] = [
  { id: "name", title: "Name", keys: ["First Name", "Family Name"], read: (r) => [r.first, r.family] },
  { id: "email", title: "Email", keys: ["Email"], read: (r) => [r.email] },
  { id: "c1", title: "1st choice", keys: ["1st Choice"], read: (r) => [r.c1], options: DEPTS },
  { id: "c2", title: "2nd choice", keys: ["2nd Choice"], read: (r) => [r.c2], options: DEPTS },
  { id: "field", title: "Field", keys: ["Field"], read: (r) => [r.field], options: FORM_FIELDS },
  { id: "year", title: "Year", keys: ["Year"], read: (r) => [r.year], options: FORM_YEARS },
  { id: "avail", title: "Availability", keys: ["Availability"], read: (r) => [r.avail] },
]
