import { RotateCcw } from "lucide-react"
import { ErrorScreen } from "@/components/error-screen"
import { Button } from "@/components/ui/button"
import { signInUrl } from "@/lib/vic/api"

export default function UnauthorizedPage() {
  return (
    <ErrorScreen
      code="401"
      title="Your sign-in has ended"
      actions={
        <Button onClick={() => (window.location.href = signInUrl)}>
          <RotateCcw /> Sign in again
        </Button>
      }
    >
      Sign-ins last 48 hours. Signing back in within that window skips the Google permission screen.
    </ErrorScreen>
  )
}
