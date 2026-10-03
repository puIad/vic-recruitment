import * as React from "react"
import { Link } from "react-router-dom"
import { Home } from "lucide-react"
import { RingStage } from "@/components/brand/ring-stage"
import { Button } from "@/components/ui/button"

/** Error pages (404, 403, 401, 500, maintenance) set in the iris: the status code is the big Light word, as on the Content page. */
export function ErrorScreen({
  code,
  title,
  children,
  variant = "panel",
  actions,
}: {
  code: string
  title: string
  children: React.ReactNode
  variant?: "screen" | "panel"
  actions?: React.ReactNode
}) {
  return (
    <div className={variant === "panel" ? "flex flex-1 flex-col p-4 lg:p-6" : undefined}>
      <RingStage variant={variant} logo={variant === "screen"} aria-labelledby="error-title">
        <p className="text-[5.5rem] font-light leading-none tracking-tight text-vic-aqua md:text-[6rem]" aria-hidden="true">
          {code}
        </p>
        <h1 id="error-title" className="mt-3 text-balance text-[1.7rem] font-extrabold leading-tight tracking-tight text-heading">
          {title}
        </h1>
        <p className="mt-2 text-balance text-base font-normal text-muted-foreground">{children}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actions ?? (
            <Button asChild>
              <Link to="/">
                <Home /> Back to the overview
              </Link>
            </Button>
          )}
        </div>
      </RingStage>
    </div>
  )
}
