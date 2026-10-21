import { globalShortcut } from 'electron'
import type { HotkeyStatus } from '@shared/types'

let registered: string | null = null

/**
 * Validate an accelerator without registering it. Electron's parser throws on
 * malformed accelerators, so we guard the UI against invalid input.
 */
export function isValidAccelerator(accelerator: string): boolean {
  if (!accelerator || !accelerator.trim()) return false
  try {
    // `globalShortcut.register` returns false for invalid accelerators and
    // throws only for badly malformed ones.
    const ok = globalShortcut.register(accelerator, () => {})
    if (ok) globalShortcut.unregister(accelerator)
    return ok
  } catch {
    return false
  }
}

export function registerShortcut(accelerator: string, handler: () => void): HotkeyStatus {
  unregisterShortcut()
  if (!accelerator) {
    return { ok: false, accelerator, error: 'Empty shortcut' }
  }
  try {
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) {
      return {
        ok: false,
        accelerator,
        error: 'The shortcut is already taken by another application.'
      }
    }
    registered = accelerator
    return { ok: true, accelerator }
  } catch (error) {
    return {
      ok: false,
      accelerator,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function unregisterShortcut(): void {
  if (registered) {
    globalShortcut.unregister(registered)
    registered = null
  }
}

export function getRegisteredShortcut(): string | null {
  return registered
}
