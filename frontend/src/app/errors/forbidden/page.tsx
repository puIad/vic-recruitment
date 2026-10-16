import { ErrorScreen } from "@/components/error-screen"

export default function ForbiddenPage() {
  return (
    <ErrorScreen code="403" title="This needs the owner">
      Setup and a few other maintenance steps can only be run by the owner, the account that runs the sync triggers. Ask them, or use the actions you do have.
    </ErrorScreen>
  )
}
