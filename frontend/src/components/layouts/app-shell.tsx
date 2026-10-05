"use client"

import * as React from "react"
import { Outlet, useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { ThemeCustomizer } from "@/components/theme-customizer"
import { ChangeMembersSheet } from "@/components/work-panels/change-members-sheet"
import { MoveDialog } from "@/components/work-panels/move-dialog"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useVic } from "@/lib/vic/store"
import { useUi } from "@/lib/vic/ui"

const PULSE_MS = 2000

/** Persistent frame: sidebar, header and footer stay mounted while pages change inside the Outlet. */
export function AppShell() {
  const customizerOpen = useUi((s) => s.customizerOpen)
  const setCustomizerOpen = useUi((s) => s.setCustomizerOpen)
  const { config } = useSidebarConfig()
  const { pathname } = useLocation()
  const checkPulse = useVic((s) => s.checkPulse)

  // Live refresh: poll the Master's last-edit time, reload the numbers only when it moved.
  React.useEffect(() => {
    const id = setInterval(checkPulse, PULSE_MS)
    document.addEventListener("visibilitychange", checkPulse)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", checkPulse)
    }
  }, [checkPulse])

  React.useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  const sidebar = <AppSidebar variant={config.variant} collapsible={config.collapsible} side={config.side} />
  const body = (
    <SidebarInset className="min-w-0">
      <SiteHeader />
      <div className="@container/main flex flex-1 flex-col">
        <Outlet />
      </div>
      <SiteFooter />
    </SidebarInset>
  )

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-icon": "3.25rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
    >
      {config.side === "left" ? (
        <>
          {sidebar}
          {body}
        </>
      ) : (
        <>
          {body}
          {sidebar}
        </>
      )}
      <ThemeCustomizer open={customizerOpen} onOpenChange={setCustomizerOpen} />
      <ChangeMembersSheet />
      <MoveDialog />
    </SidebarProvider>
  )
}
