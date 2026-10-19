"use client"

import React from "react"
import { Layout, Palette, RotateCcw, SwatchBook, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { useSidebarConfig } from "@/hooks/use-sidebar-config"
import { RADIUS_DEFAULT, useUi } from "@/lib/vic/ui"
import { ThemeTab } from "./theme-tab"
import { LayoutTab } from "./layout-tab"

interface ThemeCustomizerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ThemeCustomizer({ open, onOpenChange }: ThemeCustomizerProps) {
  const { isDarkMode, resetTheme, setBrandColorsValues, applyTheme } = useThemeManager()
  const { updateConfig: updateSidebarConfig } = useSidebarConfig()

  const [activeTab, setActiveTab] = React.useState("theme")
  const selectedTheme = useUi((s) => s.palette)
  const setSelectedTheme = useUi((s) => s.setPalette)
  const selectedRadius = useUi((s) => s.radius)
  const setSelectedRadius = useUi((s) => s.setRadius)

  const handleReset = () => {
    setSelectedTheme("vic")
    setSelectedRadius(RADIUS_DEFAULT)
    setBrandColorsValues({})
    resetTheme() // drops every inline override: the tokens in index.css apply again
    updateSidebarConfig({ variant: "inset", collapsible: "offcanvas", side: "left" })
  }

  // Re-apply the chosen palette when the mode flips (each palette has a light and a dark side)
  React.useEffect(() => {
    applyTheme(selectedTheme, isDarkMode)
    document.documentElement.style.setProperty("--radius", selectedRadius)
  }, [isDarkMode, selectedTheme, selectedRadius, applyTheme])

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="right"
        className="pointer-events-auto flex w-[400px] max-w-full flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
      >
        <SheetHeader className="space-y-0 p-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-accent p-2 text-primary">
              <SwatchBook className="h-4 w-4" />
            </div>
            <SheetTitle className="text-lg font-bold">Customize</SheetTitle>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handleReset} className="size-8 cursor-pointer" aria-label="Reset to the VIC defaults">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => onOpenChange(false)} className="size-8 cursor-pointer" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <SheetDescription className="sr-only">Choose a palette, corner radius and sidebar layout for the dashboard.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
            <div className="px-4 py-2">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-full p-1">
                <TabsTrigger value="theme" className="cursor-pointer rounded-full data-[state=active]:bg-background">
                  <Palette className="mr-1 h-4 w-4" /> Theme
                </TabsTrigger>
                <TabsTrigger value="layout" className="cursor-pointer rounded-full data-[state=active]:bg-background">
                  <Layout className="mr-1 h-4 w-4" /> Layout
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="theme" className="mt-0 flex-1">
              <ThemeTab selectedTheme={selectedTheme} setSelectedTheme={setSelectedTheme} selectedRadius={selectedRadius} setSelectedRadius={setSelectedRadius} />
            </TabsContent>
            <TabsContent value="layout" className="mt-0 flex-1">
              <LayoutTab />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
