import { Link } from "react-router-dom"
import { ArrowUpRight, ClipboardPen, Eye, PencilLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cellText } from "@/lib/vic/format"
import { interviewPath, useBinomeBase } from "@/lib/vic/interview"
import type { Candidate, MemberState } from "@/lib/vic/types"
import { cn } from "@/lib/utils"

/** Who may fill the form here: a member with edit access, not a cover. */
const canFillInterview = (m: Pick<MemberState, "edit" | "cover">) => m.edit && !m.cover

/**
 * One candidate's interview form from My binome: Fill interview form (none yet), Edit answers (filled here), View answers (sent
 * with the Google Form, or read-only for this person), with the date once submitted. View-only members and covers get the
 * Google Form, prefilled with both codes, instead of the form. Nothing on a script without the dashboard form.
 */
export function InterviewAction({ c, m, wide }: { c: Candidate; m: MemberState; wide?: boolean }) {
  const base = useBinomeBase()
  if (m.interviewForm === undefined) return null
  const code = cellText(c.Code), iv = c.interview, fill = canFillInterview(m)
  const size = wide ? "default" : "sm"
  if (iv) {
    const edits = iv.source === "Dashboard" && fill
    return (
      <div className={cn("flex gap-x-3 gap-y-1", wide ? "flex-wrap items-center" : "flex-col items-start")}>
        <Button asChild size={size} variant={edits ? "soft" : "outline"}>
          <Link to={interviewPath(base, code)}>
            {edits ? <PencilLine /> : <Eye />} {edits ? "Edit answers" : "View answers"}
          </Link>
        </Button>
        <span className="num whitespace-nowrap text-xs text-muted-foreground">
          Submitted{iv.at ? " " + iv.at : ""}
          {iv.source === "Google Form" && " · Google Form"}
        </span>
      </div>
    )
  }
  if (fill) {
    return (
      <Button asChild size={size}>
        <Link to={interviewPath(base, code)}>
          <ClipboardPen />
          {wide ? "Fill interview form" : <><span className="sm:hidden">Fill in</span><span className="hidden sm:inline">Fill interview form</span></>}
        </Link>
      </Button>
    )
  }
  if (!m.interviewForm) return <span className="text-sm text-muted-foreground">Not submitted</span>
  return (
    <Button asChild size={size} variant="outline">
      <a href={m.interviewForm + encodeURIComponent(code)} target="_blank" rel="noopener noreferrer" title="The Google Form, with your binome and this candidate filled in">
        Google Form <ArrowUpRight />
      </a>
    </Button>
  )
}
