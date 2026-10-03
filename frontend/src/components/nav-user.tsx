"use client"

import { EllipsisVertical, LogOut, Repeat, UserCircle } from "lucide-react"
import { Link } from "react-router-dom"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { signInUrl, signOut } from "@/lib/vic/api"
import { displayName, initials } from "@/lib/vic/format"
import { useVic } from "@/lib/vic/store"

function Avatar({ email }: { email: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-vic-aqua text-xs font-bold text-vic-ink" aria-hidden="true">
      {initials(email)}
    </span>
  )
}

export function NavUser() {
  const { isMobile } = useSidebar()
  const access = useVic((s) => s.access)
  const email = useVic((s) => s.state?.user) || access?.email || ""
  const role = access?.owner ? "Owner" : "Editor"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar email={email} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold">{displayName(email)}</span>
                <span className="truncate text-xs font-normal text-sidebar-foreground/70">{role} · {email || "…"}</span>
              </div>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-xl" side={isMobile ? "bottom" : "right"} align="end" sideOffset={6}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar email={email} />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-bold">{displayName(email)}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to="/settings/account">
                  <UserCircle />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onSelect={() => signOut(signInUrl)}>
                <Repeat />
                Switch account
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={() => signOut("/")}>
              <LogOut className="text-destructive" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
