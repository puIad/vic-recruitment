import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Dev: the SPA talks to the same-origin /api/* contract of web/ (Vercel functions). Locally that is the mock
// server `npm run mock` (test/webdev.js: real api/ functions, Google mocked). It checks the Origin header against
// its own origin, so the proxy presents it as itself.
const MOCK = process.env.VIC_API || "http://localhost:3000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    'import.meta.env.VITE_BASENAME': JSON.stringify(process.env.VITE_BASENAME || ''),
  },
  // Vercel serves web/dist (web/vercel.json: buildCommand + outputDirectory), next to web/api
  build: { outDir: "../web/dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": { target: MOCK, headers: { Origin: MOCK } },
      "/dev-login": { target: MOCK, headers: { Origin: MOCK } },
    },
  },
})
