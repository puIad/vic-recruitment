import { CircleAlert, CircleCheck } from "lucide-react"
import type { ActivityItem } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

/** What this session has run so far, newest first, errors in red: the top bar's Activity popover. */
export function ActivityList({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) return <p className="text-sm text-muted-foreground">Nothing run yet. Sync, lock and the other actions leave a line here.</p>
  return (
    <ul className="max-h-64 space-y-2.5 overflow-auto pr-1">
      {activity.map((a) => (
        <li key={a.id} className="flex items-start gap-2.5 text-sm">
          {a.error ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
          <span className="num shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">{a.time}</span>
          <span className={cn("min-w-0 break-words", a.error && "text-danger")}>{a.text}</span>
        </li>
      ))}
    </ul>
  )
}
