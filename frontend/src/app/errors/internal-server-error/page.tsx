import { RotateCcw } from "lucide-react"
import { ErrorScreen } from "@/components/error-screen"
import { Button } from "@/components/ui/button"

export default function InternalServerErrorPage() {
  return (
    <ErrorScreen
      code="500"
      title="The recruitment script didn't answer"
      actions={
        <Button onClick={() => window.location.reload()}>
          <RotateCcw /> Try again
        </Button>
      }
    >
      Google Apps Script may be busy or restarting. Nothing was changed. If a long action was running, it may still finish: reload in a minute before running it again.
    </ErrorScreen>
  )
}
