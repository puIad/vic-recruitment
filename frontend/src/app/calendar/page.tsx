import { BaseLayout } from "@/components/layouts/base-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { useVic } from "@/lib/vic/store"
import { Schedule } from "./components/schedule"

/** Every interview the binomes have set in their sheets, read-only: the sheets are the source (docs/plans.md › Schedule). */
export default function SchedulePage() {
  const state = useVic((s) => s.state)
  const loadedAt = useVic((s) => s.loadedAt)
  return (
    <BaseLayout
      title="Schedule"
      description="Every interview the binomes have set in their sheets, coloured by first choice. To move one, edit the binome sheet."
      watermark="Schedule"
    >
      {state ? (
        <Schedule state={state} loadedAt={loadedAt} />
      ) : (
        <div className="grid gap-6 min-[1800px]:grid-cols-[minmax(0,1fr)_21rem]" aria-busy="true">
          <Skeleton className="h-[42rem] rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      )}
    </BaseLayout>
  )
}
