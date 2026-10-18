"use client"

import { ChevronRight } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { NavItem } from "@/config/nav"
import { useAlertView } from "@/lib/vic/pending"
import { cn } from "@/lib/utils"

/** A dashed pill marks a page that is a placeholder for a feature idea (charter: dashed pill = space still to fill). */
function Soon() {
  return (
    <span className="ml-auto rounded-full border border-dashed border-sidebar-foreground/35 px-1.5 py-px text-[10px] font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
      idea
    </span>
  )
}

export function NavMain({ label, items }: { label: string; items: NavItem[] }) {
  const location = useLocation()
  const view = useAlertView() // with the author's pending changes over the snapshot
  const alerts = view.alerts.length
  const high = view.counts.HIGH

  const isActive = (url: string) => (url === "/" ? location.pathname === "/" : location.pathname === url || location.pathname.startsWith(url + "/"))

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const open = item.items?.some((s) => isActive(s.url)) || false
          return (
            <Collapsible key={item.title} asChild defaultOpen={open} className="group/collapsible">
              <SidebarMenuItem>
                {item.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title} className="cursor-pointer">
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((sub) => (
                          <SidebarMenuSubItem key={sub.title}>
                            <SidebarMenuSubButton asChild className="cursor-pointer" isActive={isActive(sub.url)}>
                              <Link to={sub.url}>
                                <span>{sub.title}</span>
                                {sub.soon && <Soon />}
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : (
                  <>
                    <SidebarMenuButton asChild tooltip={item.title} className="cursor-pointer" isActive={isActive(item.url)}>
                      <Link to={item.url}>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        {item.soon && <Soon />}
                      </Link>
                    </SidebarMenuButton>
                    {item.badge === "alerts" && alerts > 0 && (
                      <SidebarMenuBadge
                        className={cn(
                          "rounded-full px-1.5 font-bold",
                          high ? "bg-vic-tangelo text-vic-ink" : "bg-sidebar-primary text-sidebar-primary-foreground"
                        )}
                      >
                        {alerts}
                      </SidebarMenuBadge>
                    )}
                  </>
                )}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
