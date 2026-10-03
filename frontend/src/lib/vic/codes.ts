// Interviewee codes typed into the cover form: same rule as splitCodes_ in Members.gs, so the preview matches what the script reads.
const DEP: Record<string, string> = { it: "IT", info: "IT", comm: "COMM", com: "COMM", hr: "HR", rh: "HR", fler: "FLER", flr: "FLER" }

export function typedCodes(text: string): string[] {
  return (text.match(/\b[A-Za-z]{2,13}[\s.\-_#:°]*\d{1,4}[A-Za-z0-9]*/g) || []).map((t) => {
    const m = t.match(/^([A-Za-z]+)[\s.\-_#:°]*0*(\d+)$/)
    const d = m && DEP[m[1].toLowerCase()]
    return d && m ? d + "." + (m[2].length < 2 ? "0" + m[2] : m[2]) : t
  })
}
