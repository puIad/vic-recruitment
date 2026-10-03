import * as React from "react"
import { ArchStack, RingSlot } from "@/components/brand/motifs"
import { VicLogo } from "@/components/brand/vic-logo"
import { cn } from "@/lib/utils"

/**
 * A page that sits in the iris of the charter's divider disc (sign-in, errors). Wide screens: the disc fills the
 * stage and the content is inside it. Phones: the disc becomes the gradient band the content rises out of.
 * variant="panel" is the same stage inside the app shell (a 404 inside the dashboard) instead of the whole screen.
 */
export function RingStage({
  children,
  variant = "screen",
  logo = true,
  className,
  ...rest
}: Omit<React.ComponentProps<"div">, "ref"> & { variant?: "screen" | "panel"; logo?: boolean }) {
  const panel = variant === "panel"
  const Tag = panel ? "div" : "main"
  return (
    <Tag
      className={cn(
        "relative isolate flex flex-col items-center overflow-hidden bg-background md:justify-center",
        panel ? "min-h-[36rem] flex-1 rounded-3xl border" : "min-h-svh",
        className
      )}
      {...rest}
    >
      <RingSlot
        className={cn(
          "absolute left-1/2 top-1/2 -z-10 hidden aspect-square -translate-x-1/2 -translate-y-1/2 md:block",
          panel ? "w-[max(1060px,130%)]" : "w-[max(1300px,175vh)]"
        )}
      />
      {logo && (
        <div className="relative flex h-44 w-full shrink-0 items-center justify-center overflow-hidden bg-vic-cover md:hidden">
          <ArchStack field={false} className="absolute inset-y-0 right-0 h-full w-1/2 opacity-70" />
          <VicLogo tone="white" className="relative h-14 w-auto" />
        </div>
      )}
      <section
        className={cn(
          "relative z-10 w-full max-w-[26rem] -mt-8 rounded-3xl bg-card px-6 pb-8 pt-8 text-center shadow-xl",
          "md:mt-0 md:max-w-[23.5rem] md:rounded-none md:bg-transparent md:p-0 md:shadow-none",
          !logo && "mt-8"
        )}
      >
        {children}
      </section>
    </Tag>
  )
}
