import type { AppSettings } from '@shared/types'

export const DEFAULT_GLASS_BLUR = 30
const MIN_ALPHA = 0.4
const MAX_BLUR = 64

/**
 * The glass tint lives in CSS as `rgb(var(--glass-rgb) / var(--glass-alpha))`,
 * so the window can become more or less opaque without touching the theme
 * palette. Blur strength is a plain px variable.
 */
export function applyGlass(opacity: AppSettings['opacity'], blur: AppSettings['glassBlur']): void {
  const root = document.documentElement.style
  const alpha = Math.min(1, Math.max(MIN_ALPHA, Number.isFinite(opacity) ? opacity : 0.8))
  const px = Math.min(MAX_BLUR, Math.max(0, Number.isFinite(blur) ? blur : DEFAULT_GLASS_BLUR))
  root.setProperty('--glass-alpha', String(alpha))
  root.setProperty('--glass-blur', `${px}px`)
}
