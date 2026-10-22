// The interview form in the dashboard (docs/interview-form.md part 2): where its page lives, the browser draft, the branching.
import { useVic } from "./store"
import type { InterviewAnswer, InterviewQuestion, InterviewSection } from "./types"

/** My binome is "/" for a member and "/my-binome" for an admin in a binome; the form page sits under it. */
export function useBinomeBase() {
  return useVic((s) => (s.gate.mode === "member" ? "" : "/my-binome"))
}
export const interviewPath = (base: string, code: string) => `${base}/interview/${encodeURIComponent(code)}`

/** The Recruitment Process Guideline (a PDF in Drive), linked from My binome and the top of every interview form. */
export const GUIDELINE_URL = "https://drive.google.com/file/d/1kRqXbClYuvvRlqihR6rx56-ukFlQCg_7/view?usp=drivesdk"

export type Answers = Record<string, string>

/** What the page holds for one question: text, scores as "1".."10" (the script reads them back as numbers). */
export const asText = (v: InterviewAnswer | null | undefined) => (v === null || v === undefined ? "" : String(v))

/** The sections in play: the first one, the department the 1st choice picks (none until it is picked), then the final one. */
export function sectionsInPlay(sections: InterviewSection[], dept: string) {
  return sections.filter((s) => s.id === "first" || s.id === "final" || s.id === dept)
}

/** Required questions of the sections in play still unanswered, in form order. */
export function missingOf(questions: InterviewQuestion[], sections: InterviewSection[], answers: Answers) {
  const live = new Set(sectionsInPlay(sections, branchOf(questions, answers)).map((s) => s.id))
  return questions.filter((q) => live.has(q.section) && q.required && !(answers[q.id] ?? "").trim())
}

export const branchOf = (questions: InterviewQuestion[], answers: Answers) => answers[questions.find((q) => q.branch)?.id ?? ""] ?? ""

/** Only the answers of the sections in play are sent: a section left behind is not saved. */
export function toSend(questions: InterviewQuestion[], sections: InterviewSection[], answers: Answers) {
  const live = new Set(sectionsInPlay(sections, branchOf(questions, answers)).map((s) => s.id))
  return Object.fromEntries(questions.filter((q) => live.has(q.section)).map((q) => [q.id, (answers[q.id] ?? "").trim()]))
}

/* ---------- the draft: in this browser only, saved on every change, gone after a save ---------- */

const draftKey = (binome: string, code: string) => `vic:interview:${binome}:${code}`

export function readDraft(binome: string, code: string): { answers: Answers; at: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(binome, code))
    const d = raw ? (JSON.parse(raw) as { answers?: Answers; at?: number }) : null
    return d && d.answers && typeof d.answers === "object" ? { answers: d.answers, at: Number(d.at) || 0 } : null
  } catch {
    return null
  }
}
export function writeDraft(binome: string, code: string, answers: Answers) {
  try {
    localStorage.setItem(draftKey(binome, code), JSON.stringify({ answers, at: Date.now() }))
  } catch {
    /* private window or storage full: the form still works, without a draft */
  }
}
export function clearDraft(binome: string, code: string) {
  try {
    localStorage.removeItem(draftKey(binome, code))
  } catch {
    /* nothing to clear */
  }
}

/** Two answer sets say the same thing (a draft equal to what was loaded is no draft). */
export function sameAnswers(a: Answers, b: Answers) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((k) => (a[k] ?? "").trim() === (b[k] ?? "").trim())
}
