/**
 * Types shared between the main process, the preload bridge and the renderer.
 * Keep this file dependency-free so it can be imported from every layer.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export type AccentColor = 'purple' | 'blue' | 'pink' | 'orange' | 'green' | 'graphite'

export interface NoteTemplate {
  id: string
  /** Name shown in menus. */
  name: string
  /** Title of new notes. Supports the same {{placeholders}} as the body. */
  title?: string
  /** Body of new notes. Supports {{date}} {{time}} {{datetime}} {{weekday}} {{location}} */
  content: string
}

export interface Note {
  id: string
  title: string
  /** Canonical storage format: raw Markdown (source of truth). */
  markdown: string
  /** Start time — fixed the moment the note is created. */
  createdAt: number
  updatedAt: number
  /** End time — set by the user when the note is finished. */
  endedAt: number | null
  /** Where the note was started (fixed, like the start time). */
  location: string
  pinned: boolean
  templateId: string | null
}

export interface AppSettings {
  /** Global accelerator, e.g. "CommandOrControl+Shift+N". */
  hotkey: string
  alwaysOnTop: boolean
  /** Hide the floating window as soon as it loses focus (off by default). */
  hideOnBlur: boolean
  /** 0.4 - 1 */
  opacity: number
  theme: ThemeMode
  /** Window width in px. */
  width: number
  height: number
  locale: string
  templates: NoteTemplate[]
  defaultTemplateId: string
  fontSize: number
  /** Typeface of the note (title + body). */
  fontFamily: 'sans' | 'serif'
  /** Theme colour (checkboxes, links, selection, active buttons). */
  accent: AccentColor
  /** Folder that holds the .md files. `null` = the default Documents folder. */
  vaultPath: string | null
  /** Create a fresh note (with template) every time the hotkey opens the window. */
  newNoteOnHotkey: boolean
  locationEnabled: boolean
}

export interface AppData {
  settings: AppSettings
  currentNoteId: string | null
}

export interface LocationInfo {
  city: string
  region: string
  country: string
  timezone: string
  ip: string
  source: string
  updatedAt: number
}

export interface TemplateContext {
  title: string
  date: string
  time: string
  datetime: string
  weekday: string
  location: string
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface HotkeyStatus {
  ok: boolean
  accelerator: string
  error?: string
}

export interface VaultStatus {
  path: string
  noteCount: number
}
