import { ErrorScreen } from "@/components/error-screen"

export default function NotFoundPage() {
  return (
    <ErrorScreen code="404" title="That page doesn't exist">
      The link may be old, or the page moved when the dashboard changed. The sidebar has everything that is here today.
    </ErrorScreen>
  )
}
