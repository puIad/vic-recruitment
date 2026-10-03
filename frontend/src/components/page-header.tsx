import * as React from "react"
import { Sparkles } from "lucide-react"
import { OutlineWord } from "@/components/brand/motifs"
import { cn } from "@/lib/utils"

/**
 * Page title in the charter's voice: Gilroy Heavy in blue over a Light line of context. The hairline-outlined
 * watermark is the Content page's giant outlined word, kept behind the header and only on wide screens.
 */
export function PageHeader({
  title,
  description,
  actions,
  watermark,
  className,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  watermark?: string
  className?: string
}) {
  return (
    <div className={cn("relative isolate flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      {watermark && !actions && (
        <OutlineWord className="absolute -top-5 right-0 -z-10 hidden text-[6rem] opacity-30 lg:block">{watermark}</OutlineWord>
      )}
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-heading md:text-[2.125rem] md:leading-[1.1]">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-base font-normal text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Marks a screen that is a placeholder for a feature idea: what it is, and what it needs to become real. */
export function PlaceholderBanner({ idea, needs, className }: { idea: React.ReactNode; needs: React.ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-2xl border-2 border-dashed border-primary/35 bg-accent/60 p-4 text-sm leading-relaxed",
        className
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-bold text-foreground">Placeholder: a feature idea, shown with sample data</p>
        <p className="mt-1 text-foreground/85">
          <b className="font-semibold">The idea.</b> {idea}
        </p>
        <p className="mt-1 text-muted-foreground">
          <b className="font-semibold text-foreground/85">To make it real.</b> {needs}
        </p>
      </div>
    </div>
  )
}
