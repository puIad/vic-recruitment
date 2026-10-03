import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * Decorative language of the VIC IT Charter 2026, rebuilt as code.
 *  - RingSlot   : the section-divider disc (pages 4, 8, 23, 33): a gradient disc, an iris cut out of it and the
 *                 slot that leads out to the top, the logo's bulb-and-stem drawn at poster scale.
 *  - ArchStack  : the cover and Content-page arches (pages 2, 3): rounded-top shapes layered on a gradient field.
 *  - OutlineWord: the giant hairline-outlined title that runs down the Content page.
 *  - DotGrid    : the blue/aquamarine sticker dots (page 29).
 * All are decorative (aria-hidden) and take their colours from the charter swatches.
 */

/** Gradient disc with an iris and a slot to the top. The iris and the slot are transparent: content can sit in them. */
export function RingSlot({
  className,
  tone = "color",
}: {
  className?: string
  /** color: teal-to-blue charter gradient. white: one-colour, for use on the cover gradient or dark frames. */
  tone?: "color" | "white" | "soft"
}) {
  const id = useId().replace(/:/g, "")
  const fill = tone === "white" ? "#fff" : tone === "soft" ? `url(#${id}s)` : `url(#${id}g)`
  return (
    <svg viewBox="0 0 100 100" className={cn("pointer-events-none select-none", className)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--deco-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--deco-to)" }} />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "var(--deco-from)", stopOpacity: 0.34 }} />
          <stop offset="1" style={{ stopColor: "var(--deco-to)", stopOpacity: 0.42 }} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="-2" y="-2" width="104" height="104">
          <rect x="-2" y="-2" width="104" height="104" fill="#fff" />
          <circle cx="50" cy="50" r="25" fill="#000" />
          <rect x="37.25" y="-4" width="25.5" height="32" fill="#000" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r="50" fill={fill} mask={`url(#${id}m)`} />
    </svg>
  )
}

/** Rounded-top arches stacked on the charter's vertical gradient field (blue at the top, aquamarine below). */
export function ArchStack({ className, field = true }: { className?: string; field?: boolean }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg
      viewBox="0 0 160 520"
      preserveAspectRatio="xMidYMax slice"
      className={cn("pointer-events-none select-none", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--deco-to)" }} />
          <stop offset="1" style={{ stopColor: "var(--deco-from)" }} />
        </linearGradient>
      </defs>
      {field && <rect width="160" height="520" fill={`url(#${id}f)`} />}
      {/* two arches, each a half-disc on top of a column, the second lower and narrower */}
      <path d="M-120 520V176a128 128 0 0 1 256 0V520Z" style={{ fill: "var(--deco-to)" }} fillOpacity=".38" />
      <path d="M-98 520V330a110 110 0 0 1 220 0V520Z" style={{ fill: "var(--deco-to)" }} fillOpacity=".3" />
    </svg>
  )
}

/** Hairline-outlined display word (Gilroy Light), as on the Content page. Pass vertical to run it down an edge. */
export function OutlineWord({
  children,
  className,
  vertical,
}: {
  children: string
  className?: string
  vertical?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none select-none font-light leading-[0.85] whitespace-nowrap text-transparent [-webkit-text-stroke:1px_var(--deco-to)]",
        vertical && "[writing-mode:vertical-rl]",
        className
      )}
    >
      {children}
    </span>
  )
}

/** Blue and aquamarine dots on a staggered grid; fades out toward the edges. */
export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "vic-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_20%,transparent_75%)]",
        className
      )}
    />
  )
}

/** The charter's page footer: a gradient hairline, a label on the left and a page note on the right. */
export function PageRule({ left, right, className }: { left: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <div className="vic-rule" />
      <div className="flex items-center justify-between gap-4 pt-2 text-xs font-normal text-primary">
        <span className="truncate">{left}</span>
        {right && <span className="shrink-0">{right}</span>}
      </div>
    </div>
  )
}
