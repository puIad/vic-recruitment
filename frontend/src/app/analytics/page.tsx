import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { BaseLayout } from "@/components/layouts/base-layout"
import { PlaceholderBanner } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

// Sample data: the shape of the questions, not real numbers.
const perDay = [
  { day: "20 Sep", IT: 2, COMM: 1, FLER: 0, HR: 1 },
  { day: "21 Sep", IT: 5, COMM: 2, FLER: 1, HR: 2 },
  { day: "22 Sep", IT: 9, COMM: 4, FLER: 3, HR: 4 },
  { day: "23 Sep", IT: 7, COMM: 5, FLER: 2, HR: 5 },
  { day: "24 Sep", IT: 4, COMM: 2, FLER: 2, HR: 3 },
  { day: "25 Sep", IT: 3, COMM: 1, FLER: 1, HR: 2 },
  { day: "26 Sep", IT: 2, COMM: 1, FLER: 1, HR: 1 },
]
const toContact = [
  { bucket: "< 2 h", count: 11 },
  { bucket: "2 to 6 h", count: 17 },
  { bucket: "6 to 12 h", count: 9 },
  { bucket: "12 to 24 h", count: 6 },
  { bucket: "24 to 48 h", count: 3 },
  { bucket: "> 48 h", count: 1 },
]
const capacity = [
  { day: "Mon", booked: 12, capacity: 20 },
  { day: "Tue", booked: 18, capacity: 20 },
  { day: "Wed", booked: 21, capacity: 20 },
  { day: "Thu", booked: 15, capacity: 20 },
  { day: "Fri", booked: 6, capacity: 12 },
  { day: "Sat", booked: 14, capacity: 16 },
  { day: "Sun", booked: 9, capacity: 16 },
]

const perDayCfg = {
  IT: { label: "IT", color: "var(--chart-1)" },
  COMM: { label: "COMM", color: "var(--chart-5)" },
  FLER: { label: "FLER", color: "var(--chart-3)" },
  HR: { label: "HR", color: "var(--chart-2)" },
} satisfies ChartConfig
const toContactCfg = { count: { label: "Candidates", color: "var(--chart-1)" } } satisfies ChartConfig
const capacityCfg = { booked: { label: "Booked", color: "var(--chart-1)" }, capacity: { label: "Capacity", color: "var(--chart-3)" } } satisfies ChartConfig

function Sample() {
  return (
    <Badge variant="outline" className="border-dashed">
      sample data
    </Badge>
  )
}

/** Placeholder: the template's second dashboard, asking the questions the team cannot answer from today's numbers. */
export default function AnalyticsPage() {
  return (
    <BaseLayout title="Analytics" description="How the recruitment is going over time, not just right now." watermark="Analytics">
      <PlaceholderBanner
        idea="Three questions the Overview cannot answer: how many people register per day and where they come from, how long a candidate waits for a first message, and whether the interview calendar has room for everyone. They tell the team where to add binomes or push reminders."
        needs="webState today only holds counts. Add timestamps per registration (Registered At exists), per assignment (Assigned At exists) and the contacted and interview dates from the binome sheets, then compute these three series in the script."
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">Registrations per day <Sample /></CardTitle>
          <CardDescription>By first-choice department. A spike after a poster or a post shows what worked.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={perDayCfg} className="aspect-auto h-64 w-full">
            <AreaChart data={perDay} margin={{ left: -16, right: 8, top: 8 }} accessibilityLayer>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
              {(["IT", "COMM", "FLER", "HR"] as const).map((k) => (
                <Area key={k} dataKey={k} type="monotone" stackId="a" stroke={`var(--color-${k})`} fill={`var(--color-${k})`} fillOpacity={0.55} />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">Time to first contact <Sample /></CardTitle>
            <CardDescription>Hours between assignment and the first message. The 24 h limit sits between the last two bars.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={toContactCfg} className="aspect-auto h-60 w-full">
              <BarChart data={toContact} margin={{ left: -16, right: 8, top: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={[999, 999, 4, 4]} maxBarSize={40} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">Interview capacity <Sample /></CardTitle>
            <CardDescription>Slots booked against what the binomes said they can take, by weekday.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={capacityCfg} className="aspect-auto h-60 w-full">
              <LineChart data={capacity} margin={{ left: -16, right: 8, top: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line dataKey="capacity" type="monotone" stroke="var(--color-capacity)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line dataKey="booked" type="monotone" stroke="var(--color-booked)" strokeWidth={3} dot={{ r: 3 }} />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
