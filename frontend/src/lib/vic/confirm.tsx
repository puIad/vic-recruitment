import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useVic } from "./store"

export interface ConfirmOptions {
  title: string
  body?: React.ReactNode
  okLabel?: string
  /** writes that are hard to undo (lock, replace, redraw) use the stronger button */
  danger?: boolean
}

type Ask = (o: ConfirmOptions) => Promise<boolean>
const ConfirmContext = React.createContext<Ask | null>(null)

/** Promise-based confirmation dialog: `if (await confirm({ title, body })) ...` */
export function useConfirm(): Ask {
  const ask = React.useContext(ConfirmContext)
  if (!ask) throw new Error("useConfirm must be used inside <ConfirmProvider>")
  return ask
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null)
  const resolver = React.useRef<((v: boolean) => void) | null>(null)
  const setModals = useVic((s) => s.setModals)

  const ask = React.useCallback<Ask>(
    (o) =>
      new Promise<boolean>((resolve) => {
        if (resolver.current) resolver.current(false)
        else setModals(1)
        resolver.current = resolve
        setOpts(o)
      }),
    [setModals]
  )

  const close = (v: boolean) => {
    if (!resolver.current) return
    resolver.current(v)
    resolver.current = null
    setOpts(null)
    setModals(-1)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Dialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{opts?.title}</DialogTitle>
            <DialogDescription className="sr-only">Confirm this action</DialogDescription>
          </DialogHeader>
          <div className="text-sm leading-relaxed text-foreground/90 [&_li]:mt-1 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{opts?.body}</div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button autoFocus variant={opts?.danger ? "destructive" : "default"} onClick={() => close(true)}>
              {opts?.okLabel || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

/** Small inline spinner used inside buttons that run a long action. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={"animate-spin " + (className || "size-4")} />
}
