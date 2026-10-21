import type { ThemeMode } from '@shared/types'

/**
 * The appearance follows the OS by default. The renderer owns the concrete
 * theme (`<html data-theme>`); the main process owns `nativeTheme.themeSource`,
 * so the native layer (macOS vibrancy, native dialogs) matches the web layer.
 */
export type ResolvedTheme = 'light' | 'dark'

const media = window.matchMedia('(prefers-color-scheme: dark)')

let mode: ThemeMode = 'system'
/** The appearance the OS currently uses (only matters in "system" mode). */
let systemIsDark = media.matches

export function resolvedTheme(): ResolvedTheme {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemIsDark ? 'dark' : 'light'
}

function paint(): void {
  const theme = resolvedTheme()
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  // Muya's own stylesheet uses a `.dark` ancestor class for some bits.
  root.classList.toggle('dark', theme === 'dark')
}

/** Apply the theme. `system` follows the OS and updates live. */
export function applyTheme(next: ThemeMode): void {
  mode = next
  paint()
}

/** The OS changed its appearance; only matters in "system" mode. */
export function setSystemTheme(isDark: boolean): void {
  systemIsDark = isDark
  if (mode === 'system') paint()
}

/** Fallback for platforms where the main process does not report the change. */
export function watchSystemTheme(): void {
  media.addEventListener('change', (event) => setSystemTheme(event.matches))
}
