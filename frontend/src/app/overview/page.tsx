import { BaseLayout } from "@/components/layouts/base-layout"
import { useVic } from "@/lib/vic/store"
import { PipelineCard } from "./components/pipeline-card"
import { AttentionCard } from "./components/attention-card"
import { LaunchCard } from "./components/launch-card"
import { DepartmentChart } from "./components/department-chart"
import { BinomeLoad } from "./components/binome-load"
import { ActivityCard } from "./components/activity-card"

export default function OverviewPage() {
  const s = useVic((x) => x.state)
  const registered = s ? Object.keys(s.counts.byStatus).reduce((t, k) => t + (k === "DUPLICATE" ? 0 : s.counts.byStatus[k]), 0) : 0
  const description = s
    ? `${registered} registrants across ${s.binomes.filter((b) => b.status !== "DRAFT").length} locked binomes.`
    : "Loading the Master…"

  return (
    <BaseLayout title="Overview" description={description} watermark="Overview">
      <PipelineCard />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 [&>*]:h-full">
          <AttentionCard />
        </div>
        <div className="lg:col-span-2 [&>*]:h-full">
          <LaunchCard />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 [&>*]:h-full">
          <DepartmentChart />
        </div>
        <div className="lg:col-span-2 [&>*]:h-full">
          <BinomeLoad />
        </div>
        <div className="lg:col-span-1 [&>*]:h-full">
          <ActivityCard />
        </div>
      </div>
    </BaseLayout>
  )
}
