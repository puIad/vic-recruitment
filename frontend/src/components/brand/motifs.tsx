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

/**
 * The charter's own divider vector (IT Charter 2026, page 4), copied, not redrawn. The path is the charter's cover
 * shape: everything around the disc, the iris and the slot, plus the little bite on the right edge. It is used as a
 * mask over a gradient, so what is left is the disc. Coordinates are the PDF's, in its y-down page space.
 */
const DISC_PATH =
  "M0 0C-115.192-115.179-268.346-178.611-431.253-178.611-594.157-178.611-747.311-115.179-862.503 0-975.136 112.622-1038.252 261.542-1041.001 420.376-1041.061 420.442-1041.119 420.508-1041.216 420.559V432.228 453.817C-1041.016 453.791-1040.815 453.765-1040.615 453.74-1040.561 463.169-1039.754 472.554-1039.01 481.945-1036.615 512.2-1031.802 542.073-1024.844 571.605-1012.559 623.745-993.701 673.403-968.23 720.518-938.818 774.922-902.04 823.795-857.758 867.015-830.299 893.817-800.671 917.919-768.73 939.181-738.258 959.483-706.178 976.807-672.563 991.328-641.299 1004.834-609.12 1015.578-576.045 1023.637-556.044 1028.51-535.832 1032.283-515.438 1035.16-502.417 1036.996-489.356 1038.404-476.27 1039.529-469.633 1040.1-462.941 1040.649-456.293 1040.675-443.197 1040.725-430.082 1041.719-416.995 1040.282-406.486 1039.13-396.508 1036.112-386.979 1031.654-373.458 1025.329-361.849 1016.497-352.124 1005.094-345.34 997.14-339.885 988.412-335.898 978.821-330.335 965.442-327.906 951.418-327.912 936.916-327.955 826.208-327.966 715.501-327.983 604.794-268.226 569.543-228.111 504.548-228.111 430.152-228.111 318.219-318.859 227.48-430.804 227.48-542.749 227.48-633.498 318.219-633.498 430.152-633.498 504.109-593.863 568.79-534.689 604.182-534.7 675.131-534.71 746.08-534.72 817.029-534.72 817.612-534.755 818.198-534.714 818.778-534.612 820.237-534.862 820.896-536.647 820.362-541.752 818.837-546.972 817.688-552.05 816.087-570.873 810.152-589.098 802.734-606.829 794.044-642.501 776.562-675.036 754.529-704.271 727.62-705.352 726.625-706.156 725.053-707.966 725.027-711.561 720.97-715.443 717.173-719.223 713.304-750.598 681.198-775.95 644.913-795.297 604.433-811.418 570.703-822.44 535.348-828.779 498.513-832.586 476.388-833.795 454.069-834.447 431.684-834.446 431.523-834.435 431.365-834.435 431.204-834.435 208.912-653.568 28.064-431.253 28.064-208.937 28.064-28.069 208.912-28.069 431.204-28.069 488.275 18.202 534.542 75.279 534.542 132.356 534.542 178.628 488.275 178.628 431.204 178.628 268.317 115.189 115.179 0 0"

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
    <svg viewBox="18 -105 806 806" className={cn("pointer-events-none select-none", className)} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1="18" y1="0" x2="824" y2="0">
          <stop offset="0" style={{ stopColor: "var(--deco-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--deco-to)" }} />
        </linearGradient>
        <linearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="18" y1="0" x2="824" y2="0">
          <stop offset="0" style={{ stopColor: "var(--deco-from)", stopOpacity: 0.34 }} />
          <stop offset="1" style={{ stopColor: "var(--deco-to)", stopOpacity: 0.42 }} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="18" y="-105" width="806" height="806">
          <rect x="18" y="-105" width="806" height="806" fill="#fff" />
          <path transform="matrix(1,0,0,-1,852.2386,728.8607)" d={DISC_PATH} fill="#000" />
        </mask>
      </defs>
      <rect x="18" y="-105" width="806" height="806" fill={fill} mask={`url(#${id}m)`} />
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
