import * as React from "react"

export interface SidebarConfig {
  variant: "sidebar" | "floating" | "inset"
  collapsible: "offcanvas" | "icon" | "none"
  side: "left" | "right"
}

/** On a desktop with the sidebar on the left, the sidebar toggle is pinned to the window's top-left corner (app-sidebar, site-header). */
export const togglePinned = (c: Pick<SidebarConfig, "side" | "collapsible">) => c.side === "left" && c.collapsible !== "none"

export interface SidebarContextValue {
  config: SidebarConfig
  updateConfig: (config: Partial<SidebarConfig>) => void
}

export const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebarConfig(): SidebarContextValue {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebarConfig must be used within a SidebarConfigProvider")
  }
  return context
}
