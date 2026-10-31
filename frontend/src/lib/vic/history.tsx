import { ArrowRightLeft, Building2, MoveRight, PauseCircle, PenLine, Repeat, Trash2, UserMinus, UserRoundPlus, UsersRound, type LucideIcon } from "lucide-react"

import { MemberName } from "@/components/member-name"
import type { HistoryRow, IvHistoryRow } from "./types"

/* How a Member Changes or Interviewee Changes row reads: the Change history page and one binome's Changes card share it. */

export type Kind = "replace" | "swap" | "cover" | "tag" | "status" | "moved" | "deleted" | "edit"

export const KINDS: Record<Kind, { label: string }> = {
  replace: { label: "Replaced" },
  swap: { label: "Swapped" },
  cover: { label: "Cover" },
  status: { label: "Pause / resume" },
  tag: { label: "Department" },
  moved: { label: "Moved" },
  deleted: { label: "Deleted" },
  edit: { label: "Edit accepted" },
}

/** An Interviewee Changes row in Member Changes' shape: MOVED (out → inn = the binomes), DELETED (out = the binome it left) or
 *  EDIT (out → inn = "Field: value"). They file under the binome they end in (an edit: the one it names, if any; a deletion:
 *  the one it left); the binome filter also finds the one they left. */
export function fromIv(r: IvHistoryRow): HistoryRow {
  if (r.what === "Deleted") return { at: r.at, by: r.by, type: "DELETED", binome: r.from, out: r.from, inn: "", codes: [r.code], reason: "", status: "" }
  const moved = r.what === "Moved"
  const named = (s: string) => (/\bB\.\d+/.exec(s) ?? [])[0]
  const binome = moved ? r.to : /^B\.\d+$/.test(r.code) ? r.code : named(r.to) ?? named(r.from) ?? ""
  // the binome's columns (Admin set / Form filled / Form kept): the row says which column, so the history line does too
  const column = /^(Admin set|Form filled|Form kept) /.test(r.what)
  return { at: r.at, by: r.by, type: moved ? "MOVED" : "EDIT", binome, out: column ? `${r.what}: ${r.from || "empty"}` : r.from, inn: r.to, codes: [r.code], reason: "", status: "" }
}

/** dd/MM/yyyy HH:mm → a key that sorts by time */
export const timeKey = (at: string) => at.replace(/^(\d\d)\/(\d\d)\/(\d{4}) (\d\d:\d\d)$/, "$3$2$1$4")

/** What a Member Changes row means: a swap is two PERMANENT rows whose reason the script writes as "swap B.01 ↔ B.02". */
export function describe(h: HistoryRow): { kind: Kind; title: string; icon: LucideIcon; what: React.ReactNode; text: string } {
  const out = h.out && <MemberName name={h.out} />
  const inn = h.inn && <MemberName name={h.inn} />
  if (h.type === "TEMPORARY") {
    const codes = h.codes.join(", ") || "some interviews"
    return {
      kind: "cover",
      title: "Cover",
      icon: UsersRound,
      what: <>{inn} covers {codes}{out && <> instead of {out}</>}</>,
      text: `${h.inn} covers ${codes}${h.out ? ` instead of ${h.out}` : ""}`,
    }
  }
  if (h.type === "MOVED") {
    const code = h.codes[0]
    return { kind: "moved", title: "Moved", icon: MoveRight, what: <>{code}: {h.out || "nobody"} → <b>{h.inn}</b></>, text: `${code} ${h.out} → ${h.inn}` }
  }
  if (h.type === "DELETED") {
    const code = h.codes[0]
    return { kind: "deleted", title: "Deleted", icon: Trash2, what: <>{code}{h.out && <span className="text-muted-foreground"> · was in {h.out}</span>}</>, text: `${code} deleted ${h.out}` }
  }
  if (h.type === "EDIT") {
    const code = h.codes[0]
    return {
      kind: "edit",
      title: "Edit accepted",
      icon: PenLine,
      what: <>{code}: <span className="text-muted-foreground">{h.out}</span> → {h.inn}</>,
      text: `${code} ${h.out} → ${h.inn}`,
    }
  }
  if (h.type === "TAG") {
    const kept = h.codes.length ? ` · kept ${h.codes.join(", ")}` : ""
    return {
      kind: "tag",
      title: "Department",
      icon: Building2,
      what: <>{h.out || "no tag"} → <b>{h.inn}</b>{kept && <span className="text-muted-foreground">{kept}</span>}</>,
      text: `${h.out} → ${h.inn}${kept}`,
    }
  }
  if (h.type === "STATUS") return { kind: "status", title: "Pause / resume", icon: PauseCircle, what: <>{h.out} → <b>{h.inn}</b></>, text: `${h.out} → ${h.inn}` }
  const arrow = { what: <>{out} → {inn}</>, text: `${h.out} → ${h.inn}` }
  if (/^swap /i.test(h.reason)) return { kind: "swap", title: "Swapped", icon: ArrowRightLeft, ...arrow }
  if (h.out && h.inn) return { kind: "replace", title: "Replaced", icon: Repeat, ...arrow }
  if (h.inn) return { kind: "replace", title: "Seat filled", icon: UserRoundPlus, what: <>{inn} joins</>, text: `${h.inn} joins` }
  return { kind: "replace", title: "Member left", icon: UserMinus, what: <>{out} leaves</>, text: `${h.out} leaves` }
}

/** The tab keeps the outcome as free text: DONE, FILE NOT UPDATED: …, ACTIVE, ENDED …, ENDING …. */
export function outcome(h: HistoryRow): { label: string; variant: "success" | "warning" | "outline"; detail?: string } {
  const s = h.status
  if (/^FILE NOT UPDATED/i.test(s)) return { label: "Sheet not updated", variant: "warning", detail: s.replace(/^FILE NOT UPDATED:\s*/i, "") }
  if (/^ENDING/i.test(s)) return { label: "Ending", variant: "warning", detail: s.replace(/^ENDING\s*·?\s*/i, "") }
  if (/^ENDED/i.test(s)) return { label: "Ended", variant: "outline", detail: s.replace(/^ENDED\s*/i, "") }
  if (/^ACTIVE/i.test(s)) return { label: "Active", variant: "success" }
  return s === "DONE" || !s ? { label: "Done", variant: "success" } : { label: s, variant: "outline" }
}
