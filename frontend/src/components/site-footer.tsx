import { PageRule } from "@/components/brand/motifs"
import { useVic } from "@/lib/vic/store"

/** The charter's page footer: gradient hairline, document label on the left, page note on the right. */
export function SiteFooter() {
  const updated = useVic((s) => s.state?.updated)
  const member = useVic((s) => s.gate.mode === "member")
  const loadedAt = useVic((s) => s.loadedAt)
  const read = member && loadedAt ? new Date(loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
  return (
    <footer className="px-4 pb-4 pt-2 lg:px-6">
      {member ? (
        <PageRule left="VIC Recruitment 2026 · My binome" right={read ? `Read ${read}` : undefined} />
      ) : (
        <PageRule left="VIC Recruitment 2026 · Control room" right={updated ? `Master read ${updated}` : undefined} />
      )}
    </footer>
  )
}
