"use client"

import { Check, Moon, Sun } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { useCircularTransition } from "@/hooks/use-circular-transition"
import { colorThemes } from "@/config/theme-data"
import { radiusOptions, baseColors } from "@/config/theme-customizer-constants"
import { ColorPicker } from "@/components/color-picker"
import { cn } from "@/lib/utils"
import "./circular-transition.css"

interface ThemeTabProps {
  selectedTheme: string
  setSelectedTheme: (theme: string) => void
  selectedRadius: string
  setSelectedRadius: (radius: string) => void
  /** the Light / Dark buttons: off on the Appearance page, which has its own Mode card */
  showMode?: boolean
}

/** Swatches shown for each palette (light mode accents): [primary, deco-from, deco-to] */
const SWATCH: Record<string, string[]> = {
  vic: ["#127dbb", "#69c4af", "#1a52a2"],
  spark: ["#f24407", "#f29a09", "#141e27"],
  "english-bubble": ["#1a52a2", "#127dbb", "#69c4af"],
  training: ["#5700cf", "#7849a8", "#69c4af"],
}

export function ThemeTab({ selectedTheme, setSelectedTheme, selectedRadius, setSelectedRadius, showMode = true }: ThemeTabProps) {
  const { isDarkMode, brandColorsValues, setBrandColorsValues, applyTheme, applyRadius, handleColorChange } = useThemeManager()
  const { toggleTheme } = useCircularTransition()

  const choose = (value: string) => {
    setSelectedTheme(value)
    setBrandColorsValues({})
    applyTheme(value, isDarkMode)
  }

  return (
    <div className="space-y-6 p-4">
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Palette</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The charter's core colours, or one of the three activity-department palettes (IT Charter, page 16). The logo never changes colour.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Palette">
          {colorThemes.map((t) => {
            const on = selectedTheme === t.value
            return (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(t.value)}
                className={cn(
                  "relative cursor-pointer rounded-2xl border p-3 text-left transition-colors",
                  on ? "border-primary bg-accent" : "border-border hover:border-primary/40 hover:bg-muted/60"
                )}
              >
                <span className="flex gap-1.5">
                  {(SWATCH[t.value] || []).map((c, i) => (
                    <span key={i} className="size-5 rounded-full border border-black/10" style={{ background: c }} />
                  ))}
                </span>
                <span className="mt-2 block text-sm font-bold">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{(t.preset.label || "").split("·")[1]?.trim()}</span>
                {on && (
                  <span className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-semibold">Corner radius</Label>
        <div className="grid grid-cols-5 gap-2">
          {radiusOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "cursor-pointer rounded-xl border p-2.5 text-center text-xs font-semibold transition-colors",
                selectedRadius === option.value ? "border-primary bg-accent" : "border-border hover:border-primary/40"
              )}
              onClick={() => {
                setSelectedRadius(option.value)
                applyRadius(option.value)
              }}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>

      {showMode && (
        <>
          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={!isDarkMode ? "soft" : "outline"}
                size="sm"
                onClick={(e) => isDarkMode && toggleTheme(e)}
                className="mode-toggle-button relative cursor-pointer overflow-hidden"
              >
                <Sun /> Light
              </Button>
              <Button
                variant={isDarkMode ? "soft" : "outline"}
                size="sm"
                onClick={(e) => !isDarkMode && toggleTheme(e)}
                className="mode-toggle-button relative cursor-pointer overflow-hidden"
              >
                <Moon /> Dark
              </Button>
            </div>
          </div>
        </>
      )}

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="brand-colors" className="overflow-hidden rounded-xl border">
          <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 hover:no-underline">
            <Label className="cursor-pointer text-sm font-semibold">Fine-tune colours</Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 border-t bg-muted/20 px-4 pb-4 pt-2">
            {baseColors.map((color) => (
              <div key={color.cssVar} className="flex items-center justify-between">
                <ColorPicker label={color.name} cssVar={color.cssVar} value={brandColorsValues[color.cssVar] || ""} onChange={handleColorChange} />
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
