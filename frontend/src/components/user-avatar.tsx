import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/lib/vic/format"
import { cn } from "@/lib/utils"

/** The signed-in account's Google picture, or its initials while it loads, when it fails, or when there is none. */
export function UserAvatar({ email, photo, className }: { email: string; photo?: string; className?: string }) {
  return (
    <Avatar className={cn("size-8 text-xs font-bold", className)} aria-hidden="true">
      {photo && <AvatarImage src={photo} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-vic-aqua text-vic-ink">{initials(email)}</AvatarFallback>
    </Avatar>
  )
}
