import { CircleAlert, CircleCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useVic } from "@/lib/vic/store"
import { cn } from "@/lib/utils"

/** What this session has run so far: the old dashboard's Activity list. */
export function ActivityCard() {
  const activity = useVic((s) => s.activity)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">Activity</CardTitle>
        <CardDescription>What you ran in this session</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing run yet. Sync, lock and the other actions leave a line here.</p>
        ) : (
          <ul className="max-h-64 space-y-2.5 overflow-auto pr-1">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-sm">
                {a.error ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
                <span className="num shrink-0 text-xs font-medium text-muted-foreground pt-0.5">{a.time}</span>
                <span className={cn("min-w-0 break-words", a.error && "text-danger")}>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
