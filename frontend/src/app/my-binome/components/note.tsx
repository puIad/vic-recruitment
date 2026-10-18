import * as React from "react"
import { cn } from "@/lib/utils"

/** A tinted info or warning box on the binome pages; action: buttons beside it (below it on a phone). */
export function Note({ icon: Icon, tone, children, action }: { icon: React.ElementType; tone: "info" | "warning"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="note" className={cn("flex flex-col gap-3 rounded-2xl border p-4 text-sm leading-relaxed sm:flex-row sm:items-start", tone === "info" ? "border-info/20 bg-info-soft" : "border-vic-orange/40 bg-warning-soft")}>
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "info" ? "text-info" : "text-warning")} />
        <div className="min-w-0 text-foreground/90">{children}</div>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2 pl-7 sm:pl-0">{action}</div>}
    </div>
  )
}
