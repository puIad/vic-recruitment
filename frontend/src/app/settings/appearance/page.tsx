import { Monitor, Moon, SwatchBook, Sun, type LucideIcon } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCircularTransition } from "@/hooks/use-circular-transition"
import { useTheme } from "@/hooks/use-theme"
import { useUi } from "@/lib/vic/ui"
import { cn } from "@/lib/utils"

type Mode = "light" | "dark" | "system"
const MODES: { mode: Mode; label: string; text: string; icon: LucideIcon }[] = [
  { mode: "light", label: "Light", text: "White working surfaces, as in the charter's pages. The default.", icon: Sun },
  { mode: "dark", label: "Dark", text: "Dark Jungle Green #141e27, easier in the evening.", icon: Moon },
  { mode: "system", label: "Match my device", text: "Follows your operating system's setting.", icon: Monitor },
]

function Preview({ mode }: { mode: Mode }) {
  const dark = mode === "dark"
  const half = mode === "system"
  return (
    <div className="flex h-24 overflow-hidden rounded-xl border" aria-hidden="true">
      <div className={cn("flex w-1/4 flex-col gap-1.5 p-2", dark || half ? "bg-[#0e1720]" : "bg-vic-ink")}>
        <span className="h-1.5 w-8 rounded-full bg-vic-aqua" />
        <span className="h-1.5 w-full rounded-full bg-white/25" />
        <span className="h-1.5 w-3/4 rounded-full bg-white/25" />
      </div>
      <div
        className={cn("flex-1 space-y-2 p-3", dark ? "bg-[#141e27]" : "bg-white")}
        style={half ? { background: "linear-gradient(90deg,#fff 50%,#141e27 50%)" } : undefined}
      >
        <span className="block h-2.5 w-1/2 rounded-full bg-[#127dbb]" />
        <span className={cn("block h-2 w-3/4 rounded-full", dark ? "bg-white/20" : "bg-[#141e27]/15")} />
        <span className="block h-2 w-2/3 rounded-full bg-[#69c4af]/70" />
      </div>
    </div>
  )
}

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const { startTransition } = useCircularTransition()
  const openCustomizer = useUi((s) => s.setCustomizerOpen)
  return (
    <BaseLayout title="Appearance" description="Light or dark, and how the dashboard is laid out." watermark="Appearance">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Mode</CardTitle>
          <CardDescription>Your choice is remembered on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Mode">
            {MODES.map((m) => {
              const on = theme === m.mode
              return (
                <button
                  key={m.mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={(e) => startTransition({ x: e.clientX, y: e.clientY }, () => setTheme(m.mode))}
                  className={cn("cursor-pointer space-y-3 rounded-2xl border p-4 text-left transition-colors", on ? "border-primary bg-accent" : "hover:border-primary/40 hover:bg-muted/50")}
                >
                  <Preview mode={m.mode} />
                  <span className="flex items-center gap-2 font-bold">
                    <m.icon className="size-4 text-primary" /> {m.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">{m.text}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Palette and layout</CardTitle>
          <CardDescription>The charter's colours, or one of the three activity-department palettes. Sidebar style and side live here too.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openCustomizer(true)}>
            <SwatchBook /> Open the customizer
          </Button>
        </CardContent>
      </Card>
    </BaseLayout>
  )
}
