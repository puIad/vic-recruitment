"use client"

import { FlaskConical } from "lucide-react"
import { Link } from "react-router-dom"
import { useVic } from "@/lib/vic/store"

/** Replaces the template's welcome card: Test mode changes what the buttons do (mail to admins only, nothing shared). */
export function TestModeNotice() {
  const testMode = useVic((s) => s.state?.settings.testMode)
  if (!testMode) return null
  return (
    <Link
      to="/settings/sharing"
      className="block rounded-xl border border-vic-orange/50 bg-vic-orange/10 p-3 text-sidebar-foreground transition-colors hover:bg-vic-orange/15 group-data-[collapsible=icon]:hidden"
    >
      <span className="flex items-center gap-2 text-sm font-bold">
        <FlaskConical className="size-4 text-vic-orange" />
        Test mode is on
      </span>
      <span className="mt-1 block text-xs font-normal leading-snug text-sidebar-foreground/75">
        Emails reach admins only and sheets are not shared. Turn it off at launch.
      </span>
    </Link>
  )
}
