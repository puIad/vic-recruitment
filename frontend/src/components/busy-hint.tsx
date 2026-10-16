import * as React from "react"
import { createPortal } from "react-dom"
import { useVic } from "@/lib/vic/store"

const HALF = 128 // half the hint's max width (w-64)
const GAP = 16

/**
 * While an action runs every other action is grayed out. A grayed-out control gets no clicks, so a press on one is
 * caught here (pointerdown on the page, matched against the disabled controls' boxes) and answered with a short note above it.
 */
export function BusyHint() {
  const label = useVic((s) => (s.busy ? s.busyLabel : null))
  const [hint, setHint] = React.useState<{ x: number; y: number; below: boolean; key: number } | null>(null)

  React.useEffect(() => {
    if (!label) return
    const onDown = (e: PointerEvent) => {
      const under = document.elementFromPoint(e.clientX, e.clientY)
      if (!under) return
      for (const el of document.querySelectorAll<HTMLElement>("button:disabled, [role^=menuitem][data-disabled]")) {
        const r = el.getBoundingClientRect()
        if (!r.width || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue
        // under is the control or the box holding it; anything else (a dialog, its overlay) covers it
        if (!under.contains(el) && !el.contains(under)) continue
        const below = r.top < 56
        setHint({ x: r.left + r.width / 2, y: below ? r.bottom : r.top, below, key: e.timeStamp })
        return
      }
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [label])

  React.useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2800)
    return () => clearTimeout(t)
  }, [hint])

  if (!hint || !label) return null
  const vw = window.innerWidth
  const left = vw > 2 * (HALF + GAP) ? Math.min(Math.max(hint.x, HALF + GAP), vw - HALF - GAP) : vw / 2
  return createPortal(
    <div
      key={hint.key}
      role="status"
      style={{ left, top: hint.y }}
      className={
        "pointer-events-none fixed z-[200] flex w-64 justify-center " +
        (hint.below ? "translate-y-2 -translate-x-1/2" : "-translate-x-1/2 -translate-y-[calc(100%+0.5rem)]")
      }
    >
      <div
        className={
          "relative w-fit rounded-md bg-primary px-3 py-1.5 text-center text-xs text-balance text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95 " +
          (hint.below ? "slide-in-from-top-1" : "slide-in-from-bottom-1")
        }
      >
        <b className="font-semibold">“{label}”</b> is still running. Try again when it finishes.
        <span
          aria-hidden
          style={{ left: `calc(50% + ${hint.x - left}px)` }}
          className={"absolute size-2 -translate-x-1/2 rotate-45 bg-primary " + (hint.below ? "-top-1" : "-bottom-1")}
        />
      </div>
    </div>,
    document.body
  )
}
