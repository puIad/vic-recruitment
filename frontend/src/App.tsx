import { BrowserRouter as Router } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarConfigProvider } from "@/contexts/sidebar-context"
import { AppRouter } from "@/components/router/app-router"
import { AuthGate } from "@/components/gate/gate-screen"
import { ConfirmProvider } from "@/lib/vic/confirm"
import { Toaster } from "@/components/ui/sonner"
import { BusyHint } from "@/components/busy-hint"

// Get basename from environment (for deployment) or use empty string for development
const basename = import.meta.env.VITE_BASENAME || ""

function App() {
  return (
    <div className="font-sans antialiased">
      <ThemeProvider defaultTheme="light" storageKey="vic-theme">
        <SidebarConfigProvider>
          <ConfirmProvider>
            <Router basename={basename}>
              <AuthGate>
                <AppRouter />
              </AuthGate>
            </Router>
            <Toaster position="bottom-right" richColors closeButton />
            <BusyHint />
          </ConfirmProvider>
        </SidebarConfigProvider>
      </ThemeProvider>
    </div>
  )
}

export default App
