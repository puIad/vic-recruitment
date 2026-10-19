import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// A deploy replaces the hashed chunks: a page opened before it fails to load the next route. Reload (once a minute at most) to pick up the new build.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (Date.now() - Number(sessionStorage.getItem('vic:reloaded') || 0) < 60000) return // already reloaded a moment ago: no loop
    sessionStorage.setItem('vic:reloaded', String(Date.now()))
  } catch {
    return // no storage: a reload loop is worse than the error screen
  }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
