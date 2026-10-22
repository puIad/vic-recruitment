import { BaseLayout } from "@/components/layouts/base-layout"
import { registrants } from "@/lib/vic/overview"
import { useVic } from "@/lib/vic/store"
import { TodoCard } from "./components/todo-card"
import { LaunchCard } from "./components/launch-card"
import { PipelineStrip } from "./components/pipeline-strip"
import { BinomesBehind } from "./components/binomes-behind"

/** The admin's to-do (issue 144): what needs a person today, the launch until lock, the pipeline in a row, the binomes behind. Nothing here writes. */
export default function OverviewPage() {
  const s = useVic((x) => x.state)
  const registered = s ? registrants(s.counts.byStatus) : 0
  const description = s
    ? `${registered} registrants across ${s.binomes.filter((b) => b.status !== "DRAFT").length} locked binomes.`
    : "Loading the Master…"
  const launching = !!s && !s.locked

  return (
    <BaseLayout title="Overview" description={description} watermark="Overview">
      {launching ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 [&>*]:h-full">
            <TodoCard />
          </div>
          <div className="lg:col-span-2 [&>*]:h-full">
            <LaunchCard />
          </div>
        </div>
      ) : (
        <TodoCard wide />
      )}
      <PipelineStrip />
      <BinomesBehind />
    </BaseLayout>
  )
}
