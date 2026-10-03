import { BaseLayout } from "@/components/layouts/base-layout"
import { PlaceholderBanner } from "@/components/page-header"
import { Calendar } from "./components/calendar"
import { events, eventDates } from "./data"

/** Placeholder: the template's Calendar app, filled with sample interview slots. */
export default function SchedulePage() {
  return (
    <BaseLayout title="Schedule" description="Every interview slot, by day." watermark="Schedule">
      <PlaceholderBanner
        idea="One calendar of every interview the binomes have booked, coloured by department. It shows clashes (a binome double-booked, a candidate with two slots), free days, and what is overdue, without opening 49 sheets."
        needs="Each binome sheet already holds a date and time per candidate (the overdue check reads it). Add them to webState (code, binome, start), then replace the sample events. Adding or moving a slot stays in the binome's own sheet."
      />
      <Calendar events={events} eventDates={eventDates} />
    </BaseLayout>
  )
}
