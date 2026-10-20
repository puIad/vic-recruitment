import { lazy } from "react"
import { Navigate } from "react-router-dom"

// Pages inside the app shell (sidebar + header). Lazy-loaded so the first paint stays small.
const Overview = lazy(() => import("@/app/overview/page"))
const MyBinome = lazy(() => import("@/app/my-binome/page"))
const Interview = lazy(() => import("@/app/my-binome/interview/page"))
const Alerts = lazy(() => import("@/app/alerts/page"))
const Binomes = lazy(() => import("@/app/binomes/page"))
const Interviewees = lazy(() => import("@/app/interviewees/page"))
const Team = lazy(() => import("@/app/team/page"))
const Schedule = lazy(() => import("@/app/calendar/page"))
const Analytics = lazy(() => import("@/app/analytics/page"))
const MaintenancePage = lazy(() => import("@/app/maintenance/page"))
const Help = lazy(() => import("@/app/faqs/page"))
const SettingsGeneral = lazy(() => import("@/app/settings/general/page"))
const SettingsTiming = lazy(() => import("@/app/settings/timing/page"))
const SettingsSharing = lazy(() => import("@/app/settings/sharing/page"))
const SettingsEmails = lazy(() => import("@/app/settings/emails/page"))
const SettingsScreening = lazy(() => import("@/app/settings/screening/page"))
const SettingsConnections = lazy(() => import("@/app/settings/connections/page"))
const SettingsAccount = lazy(() => import("@/app/settings/account/page"))
const SettingsAppearance = lazy(() => import("@/app/settings/appearance/page"))
const SettingsHistory = lazy(() => import("@/app/settings/history/page"))
const Forbidden = lazy(() => import("@/app/errors/forbidden/page"))
const Unauthorized = lazy(() => import("@/app/errors/unauthorized/page"))
const ServerError = lazy(() => import("@/app/errors/internal-server-error/page"))
const Maintenance = lazy(() => import("@/app/errors/under-maintenance/page"))
const NotFound = lazy(() => import("@/app/errors/not-found/page"))

export interface RouteConfig {
  path: string
  element: React.ReactNode
}

export const shellRoutes: RouteConfig[] = [
  { path: "/", element: <Overview /> },
  { path: "/alerts", element: <Alerts /> },
  { path: "/binomes", element: <Binomes /> },
  { path: "/interviewees", element: <Interviewees /> },
  { path: "/team", element: <Team /> },
  /** an admin in a binome (nav shows it only then); the page reads the store's member */
  { path: "/my-binome", element: <MyBinome /> },
  /** the interview form of one of their candidates, on its own page (docs/interview-form.md part 2) */
  { path: "/my-binome/interview/:code", element: <Interview /> },
  { path: "/schedule", element: <Schedule /> },
  { path: "/analytics", element: <Analytics /> },
  { path: "/maintenance", element: <MaintenancePage /> },
  { path: "/help", element: <Help /> },
  { path: "/settings/general", element: <SettingsGeneral /> },
  { path: "/settings/timing", element: <SettingsTiming /> },
  { path: "/settings/sharing", element: <SettingsSharing /> },
  { path: "/settings/emails", element: <SettingsEmails /> },
  { path: "/settings/screening", element: <SettingsScreening /> },
  { path: "/settings/connections", element: <SettingsConnections /> },
  { path: "/settings/account", element: <SettingsAccount /> },
  { path: "/settings/appearance", element: <SettingsAppearance /> },
  { path: "/settings/history", element: <SettingsHistory /> },
  { path: "/errors/forbidden", element: <Forbidden /> },
  { path: "/errors/unauthorized", element: <Unauthorized /> },
  { path: "/errors/internal-server-error", element: <ServerError /> },
  { path: "/errors/under-maintenance", element: <Maintenance /> },
  { path: "*", element: <NotFound /> },
]

/** A binome member's whole dashboard: their binome (editable with edit access to its sheet), their own account and appearance, and Help. */
export const memberRoutes: RouteConfig[] = [
  { path: "/", element: <MyBinome /> },
  { path: "/interview/:code", element: <Interview /> },
  { path: "/settings/account", element: <SettingsAccount /> },
  { path: "/settings/appearance", element: <SettingsAppearance /> },
  { path: "/help", element: <Help /> },
  { path: "*", element: <Navigate to="/" replace /> },
]
