import * as React from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { RingSlot } from "@/components/brand/motifs"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useSidebar } from "@/components/ui/sidebar"
import { useVic } from "@/lib/vic/store"
import { buildTour, markSeen, tourDue, type TourRole, type TourStep } from "@/lib/vic/tour"
import { cn } from "@/lib/utils"
import { TourCtx } from "./use-tour"

/**
 * The onboarding tour (docs/onboarding-tour.md): a spotlight on one real element at a time, walking across pages. It
 * starts by itself once per role, email and tour version on `/`, and Help replays it. Look only: the app is inert under
 * the overlay, so a click during the tour never reaches a live control.
 */

/** localStorage, or one that refuses everything (private mode, blocked site data): tourDue reads that as seen */
function storage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    return window.localStorage
  } catch {
    return { getItem: () => { throw new Error("no storage") }, setItem: () => {} }
  }
}

/** the first match that is actually on screen: some anchors render twice (the Alerts list, desktop and phone) */
function findTarget(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el
  }
  return null
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const PAD = 8
/** how long a step waits for its element (lazy pages, the first snapshot) before it shows centered */
const WAIT_MS = 2000

interface Box { x: number; y: number; w: number; h: number }

const sameBox = (a: Box | null, b: Box | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const role: TourRole = useVic((s) => (s.gate.mode === "member" ? "member" : "admin"))
  const email = useVic((s) => s.access?.email ?? "")
  const inBinome = useVic((s) => !!s.member)
  // signed in and the first snapshot is in: the pages have something to point at
  const ready = useVic((s) => (s.gate.mode === "member" ? !!s.member : s.gate.mode === "ok" && !!s.state))

  const [steps, setSteps] = React.useState<TourStep[] | null>(null)
  const [index, setIndex] = React.useState(0)
  /** what the current step found: its element's box, or null once it gave up (a centered card). Keyed by step, so a
   *  new step starts unsettled without a reset */
  const [hit, setHit] = React.useState<{ key: string; box: Box | null } | null>(null)

  const start = React.useCallback(() => {
    setSteps(buildTour(role, inBinome))
    setIndex(0)
  }, [role, inBinome])

  // First visit: once per signed-in email, on the home page, when no dialog is open.
  const tried = React.useRef("")
  React.useEffect(() => {
    if (!ready || !email || pathname !== "/" || steps || tried.current === email) return
    const id = setTimeout(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      tried.current = email
      if (tourDue(storage(), role, email)) start()
    }, 800)
    return () => clearTimeout(id)
  }, [ready, email, pathname, steps, role, start])

  const step = steps?.[index]
  const key = step ? `${index}:${step.id}` : ""
  const settled = !!step && hit?.key === key
  const box = settled ? hit!.box : null
  const navigatedFor = React.useRef("")

  // Each step: go to its page, open the phone drawer for a sidebar target, find the element, scroll to it, follow it.
  React.useEffect(() => {
    if (!step) return
    if (step.path && pathname !== step.path && navigatedFor.current !== step.id) {
      navigatedFor.current = step.id // once: a page that redirects (an admin no longer in a binome) must not loop
      navigate(step.path)
      return
    }
    if (isMobile) setOpenMobile(!!step.sidebar)
    let el: HTMLElement | null = null
    let timer = 0, raf = 0
    const t0 = performance.now()
    const follow = () => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const next = { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD }
      setHit((cur) => (cur?.key === key && sameBox(cur.box, next) ? cur : { key, box: next }))
      raf = requestAnimationFrame(follow)
    }
    const look = () => {
      if (!step.target) return setHit({ key, box: null })
      el = findTarget(step.target)
      if (!el && performance.now() - t0 < WAIT_MS) {
        timer = window.setTimeout(look, 100)
        return
      }
      if (el) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: reducedMotion() ? "auto" : "smooth" })
        follow()
      } else setHit({ key, box: null })
    }
    // after the shell's own scroll-to-top on a page change
    timer = window.setTimeout(look, 60)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [step, key, pathname, isMobile, setOpenMobile, navigate])

  const end = React.useCallback(
    (how: "finish" | "skip") => {
      markSeen(storage(), role, email)
      setSteps(null)
      setHit(null)
      navigatedFor.current = ""
      if (isMobile) setOpenMobile(false)
      if (how === "skip") toast("Tour skipped", { description: "Replay it any time from Help." })
    },
    [role, email, isMobile, setOpenMobile]
  )
  const total = steps?.length ?? 0
  const next = React.useCallback(() => (index + 1 >= total ? end("finish") : setIndex(index + 1)), [index, total, end])
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // While it runs: the app is inert (no click or focus reaches a live control) and focus comes back after.
  const running = !!steps
  React.useEffect(() => {
    if (!running) return
    const root = document.getElementById("root")
    const before = document.activeElement as HTMLElement | null
    root?.setAttribute("inert", "")
    return () => {
      root?.removeAttribute("inert")
      before?.focus?.()
    }
  }, [running])

  const cardRef = React.useRef<HTMLDivElement | null>(null)
  // the card remounts when it moves between docked and anchored (the target scrolling into view): it takes focus again
  const setCard = React.useCallback((el: HTMLDivElement | null) => {
    cardRef.current = el
    el?.focus({ preventScroll: true })
  }, [])
  // Keys: Right and Enter next, Left back, Esc skip; every other key stays out of the page's shortcuts (Ctrl K).
  React.useEffect(() => {
    if (!running) return
    const onKey = (e: KeyboardEvent) => {
      const inCard = !!cardRef.current?.contains(e.target as Node)
      let handled = true
      if (e.key === "Escape") end("skip")
      else if (e.key === "ArrowRight" || (e.key === "Enter" && !(inCard && (e.target as HTMLElement).closest("button")))) next()
      else if (e.key === "ArrowLeft") back()
      else handled = false
      if (handled) e.preventDefault()
      // stopping the event still lets a focused card button click on Enter or Space (that is the browser's default)
      if (handled || e.key !== "Tab") e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [running, next, back, end])

  // focus the card on each step, for screen readers and the keyboard
  React.useEffect(() => {
    if (settled) cardRef.current?.focus({ preventScroll: true })
  }, [settled, index])

  const value = React.useMemo(() => ({ start, running }), [start, running])

  let layer: React.ReactNode = null
  if (step) {
    const vw = window.innerWidth, vh = window.innerHeight
    const room = box && (vh - box.y - box.h > 240 || box.y > 240 || vw - box.x - box.w > 380 || box.x > 380)
    const mode = !settled ? "wait" : !box ? "center" : isMobile || !room ? "dock" : "anchor"
    // dock away from the target: at the top when it sits in the lower half
    const dockTop = !!box && box.y + box.h / 2 > vh / 2
    const card = (
      <TourCard
        ref={setCard}
        step={step}
        index={index}
        total={total}
        welcome={index === 0}
        onBack={back}
        onNext={next}
        onSkip={() => end("skip")}
      />
    )
    layer = createPortal(
      <>
        <Spotlight box={mode === "wait" || mode === "center" ? null : box} />
        {mode === "anchor" && (
          <Popover open>
            <PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => DOMRect.fromRect({ x: box!.x, y: box!.y, width: box!.w, height: box!.h }) } }} />
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={12}
              collisionPadding={16}
              updatePositionStrategy="always"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
              className="pointer-events-auto z-[1001] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border-0 bg-transparent p-0 shadow-none"
            >
              {card}
            </PopoverContent>
          </Popover>
        )}
        {(mode === "center" || mode === "dock") && (
          <div
            className={cn(
              "pointer-events-none fixed inset-x-0 z-[1001] flex justify-center px-4",
              mode === "center" ? "inset-y-0 items-center" : dockTop ? "top-0 pt-4" : "bottom-0 pb-4"
            )}
          >
            <div className={cn("pointer-events-auto w-full", index === 0 ? "max-w-md" : "max-w-sm")}>{card}</div>
          </div>
        )}
      </>,
      document.body
    )
  }

  return (
    <TourCtx.Provider value={value}>
      {children}
      {layer}
    </TourCtx.Provider>
  )
}

/** A press on the tour is not a press outside the open phone drawer: Radix would close it under a sidebar step. */
const stopPress = (e: React.PointerEvent) => {
  e.stopPropagation()
  if (e.target === e.currentTarget || !(e.target as HTMLElement).closest("button")) e.preventDefault()
}

/** The dimmed page with a rounded hole over the target: the hole's own shadow is the dim (an SVG mask painted
 *  unreliably in Chrome). A clear layer on top takes every pointer event, the hole's included. */
function Spotlight({ box }: { box: Box | null }) {
  return (
    <div className="fixed inset-0 z-[1000] animate-in fade-in-0 duration-200" aria-hidden="true">
      {box ? (
        <div
          className="absolute left-0 top-0 rounded-[14px] transition-[transform,width,height] duration-300 ease-out motion-reduce:transition-none"
          // the aqua edge, then the dim out to every corner of the screen
          style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, boxShadow: "0 0 0 2px var(--color-vic-aqua), 0 0 0 200vmax rgb(11 17 24 / 0.62)" }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgb(11 17 24 / 0.62)" }} />
      )}
      <div className="pointer-events-auto absolute inset-0" onPointerDown={stopPress} />
    </div>
  )
}

const TourCard = React.forwardRef<
  HTMLDivElement,
  { step: TourStep; index: number; total: number; welcome: boolean; onBack: () => void; onNext: () => void; onSkip: () => void }
>(function TourCard({ step, index, total, welcome, onBack, onNext, onSkip }, ref) {
  const last = index + 1 === total
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vic-tour-title"
      aria-describedby="vic-tour-body"
      tabIndex={-1}
      onPointerDown={stopPress}
      className="relative isolate overflow-hidden rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl outline-none animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
    >
      {welcome && <RingSlot tone="soft" className="absolute -right-28 -top-32 -z-10 w-52" />}
      <p className="num text-xs font-bold text-primary">
        Tour · {index + 1} of {total}
      </p>
      <h2 id="vic-tour-title" className="mt-1.5 text-lg font-extrabold leading-snug text-heading">
        {step.title}
      </h2>
      <p id="vic-tour-body" className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {step.body}
      </p>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip} className="-ml-2 text-muted-foreground">
          Skip
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {index > 0 && (
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft /> Back
            </Button>
          )}
          <Button size="sm" onClick={onNext}>
            {last ? "Finish" : index === 0 ? "Show me around" : "Next"} {!last && <ArrowRight />}
          </Button>
        </div>
      </div>
    </div>
  )
})
