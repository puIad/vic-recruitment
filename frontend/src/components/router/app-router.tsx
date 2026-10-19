"use client"

import { Component, Suspense, type ReactNode } from "react"
import { Routes, Route } from "react-router-dom"
import { memberRoutes, shellRoutes } from "@/config/routes"
import { AppShell } from "@/components/layouts/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ErrorScreen } from "@/components/error-screen"
import { useVic } from "@/lib/vic/store"

function PageFallback() {
  return (
    <div className="space-y-6 px-4 py-7 lg:px-6" aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}

/** A route that fails to load or render (a chunk gone after a deploy) shows this instead of a white page. */
class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <ErrorScreen code="!" title="This page didn't load" actions={<Button onClick={() => window.location.reload()}>Reload the page</Button>}>
        The dashboard may have been updated while it was open. Reloading brings the new version.
      </ErrorScreen>
    )
  }
}

export function AppRouter() {
  const member = useVic((s) => s.gate.mode === "member")
  return (
    <Routes>
      <Route element={<AppShell />}>
        {(member ? memberRoutes : shellRoutes).map((r) => (
          <Route key={r.path} path={r.path} element={<RouteBoundary><Suspense fallback={<PageFallback />}>{r.element}</Suspense></RouteBoundary>} />
        ))}
      </Route>
    </Routes>
  )
}
