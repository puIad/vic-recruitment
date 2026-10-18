import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  History,
  LayoutDashboard,
  ListChecks,
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
  items?: { title: string; url: string; soon?: boolean }[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: "Control room",
    items: [
      { title: "Overview", url: "/", icon: LayoutDashboard },
      { title: "Alerts", url: "/alerts", icon: Bell, badge: "alerts" },
      { title: "Binomes", url: "/binomes", icon: Users },
      { title: "Interviewees", url: "/interviewees", icon: ListChecks },
    ],
  },
  {
    label: "People",
    items: [{ title: "Team", url: "/team", icon: UsersRound }],
  },
  {
    label: "Coming up",
    items: [
      { title: "Schedule", url: "/schedule", icon: CalendarDays, soon: true },
      { title: "Analytics", url: "/analytics", icon: ChartNoAxesCombined, soon: true },
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
        items: [
          { title: "General", url: "/settings/general" },
          { title: "Alerts and timing", url: "/settings/timing" },
          { title: "Sharing and email", url: "/settings/sharing" },
          { title: "Screening", url: "/settings/screening" },
          { title: "Connections", url: "/settings/connections" },
          { title: "Account", url: "/settings/account" },
          { title: "Appearance", url: "/settings/appearance" },
          { title: "Change history", url: "/settings/history" },
        ],
      },
      { title: "Help", url: "/help", icon: CircleHelp },
    ],
  },
]

/** A binome member's sidebar: their binome, then their own settings. */
export const memberNavGroups: NavGroup[] = [
  { label: "Your binome", items: [{ title: "My binome", url: "/", icon: UserRoundCheck }] },
  {
    label: "You",
    items: [
      { title: "Account", url: "/settings/account", icon: UserCircle },
      { title: "Appearance", url: "/settings/appearance", icon: Palette },
    ],
  },
]

/** Everything the command palette can jump to (flat), with the icon the sidebar uses. */
export const pageIndex: { title: string; url: string; group: string; icon: LucideIcon }[] = [
  ...navGroups.flatMap((g) =>
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
  if (url.endsWith("connections")) return Network
  if (url.endsWith("account")) return UserCircle
  if (url.endsWith("appearance")) return Palette
  if (url.endsWith("history")) return History
  return SlidersHorizontal
}
