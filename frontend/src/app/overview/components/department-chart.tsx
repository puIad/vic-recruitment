import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { useVic } from "@/lib/vic/store"

const config = { count: { label: "Registrants" } } satisfies ChartConfig
// blue, cobalt, aquamarine and ink: orange stays reserved for things that need a person
const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-2)", "var(--muted-foreground)"]

/** Registrants by first-choice department (IT, COMM, FLER, HR). Real counts from the Master. */
export function DepartmentChart() {
  const s = useVic((x) => x.state)
  if (!s) return <Skeleton className="h-72 rounded-xl" />
  const data = Object.entries(s.counts.byDep).map(([dept, count]) => ({ dept, count }))
  const total = data.reduce((t, d) => t + d.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-bold">By first choice</CardTitle>
        <CardDescription>{total ? "Registrants per department they picked first" : "Fills in as registrations arrive"}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-52 w-full">
          <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="dept" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" radius={[999, 999, 4, 4]} maxBarSize={44}>
              {data.map((d, i) => (
                <Cell key={d.dept} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
