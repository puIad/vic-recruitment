import { GROUPS } from "../components/settings-groups"
import { SettingsPage } from "../components/settings-form"

export default function TimingSettings() {
  return <SettingsPage group={GROUPS.timing} />
}
