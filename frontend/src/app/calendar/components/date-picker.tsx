"use client"

import { Calendar } from "@/components/ui/calendar"

interface DatePickerProps {
  selectedDate: Date
  onDateSelect: (date: Date) => void
  /** days that have an interview (a dot under the number) */
  busy: Set<string>
}

/** The template's mini month, kept: picks the day the main view shows. */
export function DatePicker({ selectedDate, onDateSelect, busy }: DatePickerProps) {
  return (
    <div className="flex justify-center">
      <Calendar
        mode="single"
        weekStartsOn={0}
        selected={selectedDate}
        month={selectedDate}
        onMonthChange={(m) => onDateSelect(new Date(m.getFullYear(), m.getMonth(), Math.min(selectedDate.getDate(), 28)))}
        onSelect={(d) => d && onDateSelect(d)}
        required
        className="w-full [&_[role=gridcell]_button]:cursor-pointer [&_button]:cursor-pointer"
        modifiers={{ busy: (d) => busy.has(d.toDateString()) }}
        modifiersClassNames={{
          busy: "relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-vic-aqua",
        }}
      />
    </div>
  )
}
