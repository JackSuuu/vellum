import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const platform = /Mac/i.test(navigator.userAgent) ? 'darwin' : /Win/i.test(navigator.userAgent) ? 'win32' : 'linux'
document.body.dataset.platform = platform

// A quick note is never really closed, only put away (the window is reused).
window.close = () => void window.vellum.app.hide()

// No <StrictMode>: its development double-mount would create the
// (imperative) Muya editor twice.
createRoot(document.getElementById('root')!).render(<App />)
