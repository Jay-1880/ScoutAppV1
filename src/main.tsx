import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'
import { router } from '@/router'
import './index.css'

const root = document.getElementById('root')
const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? 'https://zany-cormorant-687.convex.cloud'

if (!root) {
  throw new Error('Root element not found')
}

const convex = new ConvexReactClient(convexUrl)

createRoot(root).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        themes={["light", "dark", "team1880"]}
        enableSystem
        disableTransitionOnChange
      >
        <RouterProvider router={router} />
      </ThemeProvider>
    </ConvexAuthProvider>
  </StrictMode>,
)
