import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const platform = /Mac/i.test(navigator.userAgent) ? 'darwin' : /Win/i.test(navigator.userAgent) ? 'win32' : 'linux'
document.body.dataset.platform = platform

// Set the appearance before React mounts, so the window never flashes white.
document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

// A quick note is never really closed, only put away (the window is reused).
window.close = () => void window.vellum.app.hide()

// No <StrictMode>: its development double-mount would create the
// (imperative) Muya editor twice.
createRoot(document.getElementById('root')!).render(<App />)
