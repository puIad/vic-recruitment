import { Badge } from "@/components/ui/badge"
import { useVic } from "@/lib/vic/store"

/** Open alerts of one binome. Danger red is kept for a binome that holds a High alert, so a row of reds never becomes wallpaper. */
export function OpenChip({ code, open }: { code: string; open: number }) {
  const high = useVic((s) => !!s.state?.alerts.some((a) => a.binome === code && a.severity === "HIGH"))
  if (!open) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant={high ? "danger" : "secondary"} className="num" title={high ? "Includes a high-severity alert" : undefined}>
      {open} open
      {high && <span className="sr-only"> including a high alert</span>}
    </Badge>
  )
}
