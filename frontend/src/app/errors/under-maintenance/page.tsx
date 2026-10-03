import { ErrorScreen } from "@/components/error-screen"

export default function UnderMaintenancePage() {
  return (
    <ErrorScreen code="503" title="Back in a few minutes">
      A new version of the script is being deployed. The data is safe in the Master; reload shortly and carry on.
    </ErrorScreen>
  )
}
