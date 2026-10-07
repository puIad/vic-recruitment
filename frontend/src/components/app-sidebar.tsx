"use client"

import * as React from "react"
import { Link } from "react-router-dom"
import { ChevronRight, ExternalLink, FileSpreadsheet, FolderOpen, ClipboardList, FormInput } from "lucide-react"

import { VicLogo } from "@/components/brand/vic-logo"
import { RingSlot } from "@/components/brand/motifs"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TestModeNotice } from "@/components/sidebar-notification"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { memberNavGroups, navGroups } from "@/config/nav"
import { useVic } from "@/lib/vic/store"

/** The Google files the old sidebar linked to (Master, both forms, the binome folder): one collapsed row, four links inside. */
function GoogleFiles() {
  const links = useVic((s) => s.state?.links)
  const files = [
    { key: "master", label: "Master sheet", icon: FileSpreadsheet },
    { key: "registrationForm", label: "Registration form", icon: ClipboardList },
    { key: "interviewForm", label: "Interview form", icon: FormInput },
    { key: "binomeFolder", label: "Binome sheets", icon: FolderOpen },
  ] as const
  return (
    <SidebarGroup>
      <SidebarMenu>
        <Collapsible asChild className="group/files">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton tooltip="Google files" className="cursor-pointer">
                <ExternalLink />
                <span>Google files</span>
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/files:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {files.map((f) => {
                  const href = links?.[f.key]
                  return (
                    <SidebarMenuSubItem key={f.key}>
                      <SidebarMenuSubButton asChild aria-disabled={!href} className={href ? "cursor-pointer" : "pointer-events-none opacity-50"}>
                        <a href={href || undefined} target="_blank" rel="noopener noreferrer">
                          <f.icon />
                          <span>{f.label}</span>
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )
                })}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  )
}

/** A member's one Google file: their binome sheet (the same cells My binome edits, when they have edit access). */
function BinomeSheetLink() {
  const url = useVic((s) => s.member?.fileUrl)
  if (!url) return null
  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="My binome sheet">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <FileSpreadsheet />
              <span>My binome sheet</span>
              <ExternalLink className="ml-auto size-3.5 opacity-70" />
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const member = useVic((s) => s.gate.mode === "member")
  return (
    <Sidebar {...props}>
      <SidebarHeader className="px-4 pt-5 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link to="/" aria-label={member ? "VIC Recruitment 2026: My binome" : "VIC Recruitment 2026: Overview"} className="block rounded-lg outline-offset-4">
              <VicLogo tone="ondark" className="h-12 w-auto group-data-[collapsible=icon]:hidden" />
              <VicLogo variant="icon" className="mx-auto hidden h-8 w-auto group-data-[collapsible=icon]:block" />
            </Link>
            <p className="mt-3 text-xs font-normal text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">Recruitment 2026 · {member ? "My binome" : "Control room"}</p>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {(member ? memberNavGroups : navGroups).map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
        {member ? <BinomeSheetLink /> : <GoogleFiles />}
      </SidebarContent>
      <SidebarFooter className="relative overflow-hidden">
        {/* the charter's ring-and-iris, bleeding off the corner behind the account area */}
        <RingSlot tone="soft" className="absolute -bottom-28 -left-24 w-72 [mask-image:linear-gradient(to_top,#000_45%,transparent_92%)] group-data-[collapsible=icon]:hidden" />
        <div className="relative flex flex-col gap-2">
          <TestModeNotice />
          <NavUser />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
