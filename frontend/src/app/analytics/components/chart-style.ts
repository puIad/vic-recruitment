/** Shared recharts dress: hairline solid grid, quiet ticks. */
export const axis = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 12 } as const

/** Cells of a count matrix: a single-hue ramp (primary), ink switching to white past the middle. */
export function heat(value: number, max: number) {
  const t = max ? value / max : 0
  return {
    background: value ? `color-mix(in oklch, var(--primary) ${Math.round(8 + t * 80)}%, transparent)` : undefined,
    color: t > 0.5 ? "var(--primary-foreground)" : undefined,
  }
}
