import type { AccentColor } from '@shared/types'

export const ACCENTS: Record<AccentColor, { label: string; color: string; ink: string }> = {
  purple: { label: 'Purple', color: '#8b5cf6', ink: '#6d3fe0' },
  blue: { label: 'Blue', color: '#0a84ff', ink: '#0a6cdc' },
  pink: { label: 'Pink', color: '#ec4899', ink: '#cf2c7d' },
  orange: { label: 'Orange', color: '#f59e0b', ink: '#c77800' },
  green: { label: 'Green', color: '#22c55e', ink: '#16893f' },
  graphite: { label: 'Graphite', color: '#6b7280', ink: '#4b5160' }
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`
}

/** Set the accent on <html>, so Muya's floating menus (attached to <body>) follow it too. */
export function applyAccent(accent: AccentColor | undefined): void {
  const { color, ink } = ACCENTS[accent ?? 'purple'] ?? ACCENTS.purple
  const root = document.documentElement.style
  root.setProperty('--accent', color)
  root.setProperty('--accent-ink', ink)
  root.setProperty('--accent-soft', rgba(color, 0.14))
  root.setProperty('--accent-ring', rgba(color, 0.38))
  // Muya (MarkText editor) theme variables
  root.setProperty('--theme-color', color)
  root.setProperty('--highlight-color', rgba(color, 0.25))
  root.setProperty('--selection-color', rgba(color, 0.22))
  root.setProperty('--link-color', ink)
}
