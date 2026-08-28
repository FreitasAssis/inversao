import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from './ui/pwa'
import { Site } from './ui/Site'
import './ui/style.css'

// Production only: in development it would cache a dev shell and hand it back,
// which is indistinguishable from the build being broken.
if (import.meta.env.PROD) registerServiceWorker()

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <StrictMode>
    <Site />
  </StrictMode>,
)
