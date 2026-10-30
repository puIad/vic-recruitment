import {
  Award,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  History,
  LayoutDashboard,
  ListChecks,
  Mail,
  Network,
  Palette,
  Settings,
  SlidersHorizontal,
  Share2,
  Timer,
  UserCircle,
  UserRoundCheck,
  Users,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  /** live counter shown on the right: filled from the dashboard state */
  badge?: "alerts"
  /** a placeholder for a feature idea, not built yet */
  soon?: boolean
  /** divider: a line above this sub item, starting a new group in the submenu */
  items?: { title: string; url: string; soon?: boolean; divider?: boolean }[]
  /** shown only to an admin who is in a binome (the store's member is set) */
  inBinome?: boolean
  /** the onboarding tour's anchor (lib/vic/tour.ts) */
  tour?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
  /** the onboarding tour's anchor (lib/vic/tour.ts) */
  tour?: string
}

export const navGroups: NavGroup[] = [
  {
    label: "Control room",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      { title: "Alerts", url: "/alerts", icon: Bell, badge: "alerts" },
      { title: "Binomes", url: "/binomes", icon: Users },
      { title: "Interviewees", url: "/interviewees", icon: ListChecks },
      { title: "Results", url: "/results", icon: Award },
      { title: "Schedule", url: "/schedule", icon: CalendarDays },
      { title: "Analytics", url: "/analytics", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Team", url: "/team", icon: UsersRound },
      { title: "My binome", url: "/my-binome", icon: UserRoundCheck, inBinome: true },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Maintenance", url: "/maintenance", icon: Wrench },
      {
        title: "Settings",
        url: "#settings",
        icon: Settings,
        tour: "nav-settings",
        items: [
          { title: "General", url: "/settings/general" },
          { title: "Alerts and timing", url: "/settings/timing" },
          { title: "Sharing and email", url: "/settings/sharing" },
          { title: "Emails", url: "/settings/emails" },
          { title: "Screening", url: "/settings/screening" },
          { title: "Connections", url: "/settings/connections", divider: true },
          { title: "Change history", url: "/settings/history" },
          { title: "Account", url: "/settings/account", divider: true },
          { title: "Appearance", url: "/settings/appearance" },
        ],
      },
      { title: "Help", url: "/help", icon: CircleHelp },
    ],
  },
]

/** A binome member's sidebar: their binome, then their own settings and Help. */
export const memberNavGroups: NavGroup[] = [
  { label: "Your binome", items: [{ title: "My binome", url: "/", icon: UserRoundCheck }] },
  {
    label: "You",
    tour: "nav-you",
    items: [
      { title: "Account", url: "/settings/account", icon: UserCircle },
      { title: "Appearance", url: "/settings/appearance", icon: Palette },
      { title: "Help", url: "/help", icon: CircleHelp },
    ],
  },
]

/** The admin sidebar's groups, My binome only for an admin in a binome. */
export const adminNav = (inBinome: boolean): NavGroup[] =>
  inBinome ? navGroups : navGroups.map((g) => ({ ...g, items: g.items.filter((i) => !i.inBinome) }))

/** Everything the command palette can jump to (flat), with the icon the sidebar uses. */
export const pageIndex = (inBinome: boolean): { title: string; url: string; group: string; icon: LucideIcon }[] => [
  ...adminNav(inBinome).flatMap((g) =>
    g.items.flatMap((i) =>
      i.items
        ? i.items.map((s) => ({ title: `Settings · ${s.title}`, url: s.url, group: "Settings", icon: settingsIcon(s.url) }))
        : [{ title: i.title, url: i.url, group: g.label, icon: i.icon ?? LayoutDashboard }]
    )
  ),
]

function settingsIcon(url: string): LucideIcon {
  if (url.endsWith("timing")) return Timer
  if (url.endsWith("sharing")) return Share2
  if (url.endsWith("emails")) return Mail
  if (url.endsWith("connections")) return Network
  if (url.endsWith("account")) return UserCircle
  if (url.endsWith("appearance")) return Palette
  if (url.endsWith("history")) return History
  return SlidersHorizontal
}
