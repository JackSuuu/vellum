import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AppData, AppSettings, Note, NoteTemplate } from '@shared/types'

const DEFAULT_TEMPLATE: NoteTemplate = {
  id: 'default',
  name: 'Quick note',
  // Start time and place are shown in the header, so the body starts empty.
  title: '',
  content: ''
}

/** Body of the template shipped by older builds (title + date + place inside the body). */
const LEGACY_TEMPLATE_BODY = '# {{title}}\n\n{{date}} {{time}}\n📍 {{location}}\n'

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: 'CommandOrControl+.',
  alwaysOnTop: true,
  hideOnBlur: false,
  opacity: 0.86,
  theme: 'light',
  width: 440,
  height: 620,
  locale: 'en-US',
  templates: [DEFAULT_TEMPLATE],
  defaultTemplateId: DEFAULT_TEMPLATE.id,
  fontSize: 14,
  fontFamily: 'sans',
  accent: 'purple',
  vaultPath: null,
  newNoteOnHotkey: true,
  locationEnabled: true
}

const emptyData = (): AppData => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  currentNoteId: null
})

/**
 * A tiny, dependency-free JSON store (lowdb-style API) living in the main
 * process. Writes are debounced and atomic (tmp file + rename) so a crash can
 * never leave a half-written database behind.
 */
class JsonStore {
  private data: AppData = emptyData()
  private timer: NodeJS.Timeout | null = null
  private readonly file: string

  constructor(fileName = 'vellum-data.json') {
    this.file = join(app.getPath('userData'), fileName)
    this.load()
  }

  get path(): string {
    return this.file
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return
      const raw = readFileSync(this.file, 'utf-8')
      if (!raw.trim()) return
      const parsed = JSON.parse(raw) as Partial<AppData>
      this.data = {
        ...emptyData(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
      }
      // Older builds could hide the window on blur; the quick note must stay put.
      this.data.settings.hideOnBlur = false
      // The old default template repeated the title, time and place in the body.
      for (const template of this.data.settings.templates) {
        if (template.content === LEGACY_TEMPLATE_BODY) {
          template.content = ''
          template.title = template.title ?? ''
          if (!template.name) template.name = 'Quick note'
        }
      }
      // Drop keys from removed features (sidebar, todo drawer).
      const legacy = this.data.settings as unknown as Record<string, unknown>
      delete legacy.sidebarOpen
      delete legacy.showTodoPanel
    } catch (error) {
      console.error('[store] failed to read database, starting fresh:', error)
      this.data = emptyData()
    }
  }

  read(): AppData {
    return this.data
  }

  /** Mutate + schedule a flush. */
  update(mutator: (data: AppData) => void): AppData {
    mutator(this.data)
    this.scheduleFlush()
    return this.data
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 180)
  }

  /** Force an immediate, atomic write. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      const dir = dirname(this.file)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
      renameSync(tmp, this.file)
    } catch (error) {
      console.error('[store] failed to persist database:', error)
    }
  }
}

let store: JsonStore | null = null

export function getStore(): JsonStore {
  if (!store) store = new JsonStore()
  return store
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function createNote(
  markdown: string,
  templateId: string | null = null,
  title = '',
  location = ''
): Note {
  const now = Date.now()
  return {
    id: newId('note'),
    title,
    markdown,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    location,
    pinned: false,
    templateId
  }
}

