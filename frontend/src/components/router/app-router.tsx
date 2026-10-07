"use client"

import { Suspense } from "react"
import { Routes, Route } from "react-router-dom"
import { memberRoutes, shellRoutes } from "@/config/routes"
import { AppShell } from "@/components/layouts/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
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

export function AppRouter() {
  const member = useVic((s) => s.gate.mode === "member")
  return (
    <Routes>
      <Route element={<AppShell />}>
        {(member ? memberRoutes : shellRoutes).map((r) => (
          <Route key={r.path} path={r.path} element={<Suspense fallback={<PageFallback />}>{r.element}</Suspense>} />
        ))}
      </Route>
    </Routes>
  )
}
