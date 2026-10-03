"use client"

import * as React from "react"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"

interface BaseLayoutProps {
  children: React.ReactNode
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** hairline-outlined word behind the page header (charter Content-page motif) */
  watermark?: string
  /** drop the page padding: for split layouts (alerts inbox) that manage their own edges */
  fullBleed?: boolean
}

/** Page body inside the persistent AppShell: header block plus spacing. */
export function BaseLayout({ children, title, description, actions, watermark, fullBleed }: BaseLayoutProps) {
  return (
    <div className={cn("flex flex-1 flex-col", !fullBleed && "gap-6 px-4 py-5 md:py-7 lg:px-6")}>
      {title && (
        <PageHeader
          title={title}
          description={description}
          actions={actions}
          watermark={watermark}
          className={fullBleed ? "px-4 pt-5 lg:px-6" : undefined}
        />
      )}
      {children}
    </div>
  )
}
