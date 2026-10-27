import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppSettings, HotkeyStatus, LocationInfo, Note, NoteTemplate } from '@shared/types'
import { broadcast } from './bus'
import { formatLocation, resolveLocation, waitForLocation } from './location'
import { registerShortcut } from './shortcut'
import { getStore, newId } from './store'
import { buildTemplateContext, renderTemplate } from './template'
import {
  allNotes,
  changeVault,
  createNoteInVault,
  findNote,
  findNoteFile,
  removeNote,
  saveNote,
  vaultPathForDisplay
} from './notes'
import { iCloudVaultPath, isInsideICloud } from './vault'
import {
  getBaseWidth,
  getMainWindow,
  hideWindow,
  minimizeWindow,
  setAlwaysOnTop as setWindowAlwaysOnTop,
  showWindow
} from './window'

export const DEFAULT_TEMPLATE_ID = 'default'

/** Location resolved at runtime (cached on disk between restarts). */
let currentLocation: LocationInfo | null = null

export function getCurrentLocation(): LocationInfo | null {
  return currentLocation
}

export function setCurrentLocation(info: LocationInfo | null): void {
  currentLocation = info
  broadcast(IPC.eventLocationChanged, info)
}

/** Resolve the location in the background so the first note is instant. */
export function prefetchLocation(): void {
  void resolveLocation()
    .then((info) => {
      if (info) setCurrentLocation(info)
    })
    .catch(() => undefined)
}

export function getTemplate(templateId?: string): NoteTemplate {
  const settings = getStore().read().settings
  return (
    settings.templates.find((t) => t.id === (templateId ?? settings.defaultTemplateId)) ??
    settings.templates[0] ?? { id: DEFAULT_TEMPLATE_ID, name: 'Quick note', title: '', content: '' }
  )
}

export function createNoteFromTemplate(templateId?: string): Note {
  const store = getStore()
  const template = getTemplate(templateId)
  const context = buildTemplateContext(template, currentLocation, new Date())
  // The title is edited in its own field, so a leading `# {{title}}` line in
  // older templates would only duplicate it inside the body.
  const body = renderTemplate(
    { ...template, content: template.content.replace(/^\s*#\s*\{\{\s*title\s*\}\}\s*\n*/i, '') },
    context
  )
  const title = renderTemplate({ ...template, content: template.title ?? '' }, context).trim()
  const note = createNoteInVault(body, template.id, title, context.location)
  store.update((data) => {
    data.currentNoteId = note.id
  })
  return note
}

/**
 * Create a note once the location is known so the header of the note is
 * complete. The lookup is bounded, the window is never blocked by it.
 */
export async function createNoteWithLocation(templateId?: string): Promise<Note> {
  if (!currentLocation && getStore().read().settings.locationEnabled) {
    const info = await waitForLocation()
    if (info) setCurrentLocation(info)
  }
  return createNoteFromTemplate(templateId)
}

/** Shared promise so concurrent callers never create two notes at once. */
let noteCreation: Promise<Note> | null = null

/** Ensure there is always something to write into. */
export async function ensureNote(): Promise<Note> {
  const store = getStore()
  const data = store.read()
  const notes = allNotes()
  const current = notes.find((n) => n.id === data.currentNoteId)
  if (current) return current
  if (notes.length > 0) {
    store.update((d) => {
      d.currentNoteId = notes[0].id
    })
    return notes[0]
  }
  if (!noteCreation) {
    noteCreation = createNoteWithLocation().finally(() => {
      noteCreation = null
    })
  }
  return noteCreation
}

/**
 * The one and only global-shortcut action: hide the quick note when it is in
 * front, otherwise bring it back (optionally on a fresh note).
 */
export function toggleFromHotkey(): void {
  const store = getStore()
  const settings = store.read().settings
  const win = getMainWindow()

  if (win && win.isVisible() && win.isFocused()) {
    store.flush()
    hideWindow()
    return
  }

  if (settings.newNoteOnHotkey) {
    const current = allNotes().find((n) => n.id === store.read().currentNoteId)
    if (current && current.markdown.trim()) {
      void createNoteWithLocation(settings.defaultTemplateId).then((note) => {
        broadcast(IPC.eventNoteChanged, note.id)
      })
    }
  }
  showWindow()
}

/** Register the global shortcut; used at startup and from the settings sheet. */
export function registerHotkey(accelerator: string): HotkeyStatus {
  return registerShortcut(accelerator, toggleFromHotkey)
}

export function registerIpcHandlers(): void {
  const store = getStore()

  /* ----------------------------- notes ------------------------------- */
  ipcMain.handle(IPC.notesList, () => allNotes().map((n) => ({ ...n })))

  ipcMain.handle(IPC.notesGet, (_e, id: string) => {
    const note = findNote(id)
    return note ? { ...note } : null
  })

  ipcMain.handle(IPC.notesCurrent, async () => {
    const note = await ensureNote()
    return { ...note }
  })

  ipcMain.handle(IPC.notesCreate, async (_e, input?: { templateId?: string }) => {
    const note = await createNoteWithLocation(input?.templateId)
    broadcast(IPC.eventNoteChanged, note.id)
    return { ...note }
  })

  ipcMain.handle(
    IPC.notesUpdate,
    (
      _e,
      id: string,
      patch: Partial<Pick<Note, 'markdown' | 'title' | 'pinned' | 'endedAt' | 'createdAt'>>
    ) => {
      const existing = findNote(id)
      if (!existing) return null

      const note: Note = { ...existing }
      let renamed = false

      if (typeof patch.markdown === 'string') note.markdown = patch.markdown
      // The title only lives in the frontmatter; the file name is the creation
      // date, so changing the title never touches the file on disk.
      if (typeof patch.title === 'string') note.title = patch.title.trim()
      if (typeof patch.pinned === 'boolean') note.pinned = patch.pinned
      if ('endedAt' in patch) note.endedAt = patch.endedAt ?? null
      // The start time is filled in automatically, but the user may correct it.
      // It is part of the file name, so a change has to rename the file too.
      if (typeof patch.createdAt === 'number' && Number.isFinite(patch.createdAt)) {
        if (patch.createdAt !== note.createdAt) renamed = true
        note.createdAt = patch.createdAt
      }
      note.updatedAt = Date.now()

      // No broadcast here: the renderer is the one editing, echoing the save
      // back would only risk reloading the editor while the user types.
      return { ...saveNote(note, { rename: renamed }) }
    }
  )

  ipcMain.handle(IPC.notesDelete, (_e, id: string) => {
    removeNote(id)
    const notes = allNotes()
    store.update((data) => {
      data.currentNoteId = notes[0]?.id ?? null
    })
    broadcast(IPC.eventNoteChanged, notes[0]?.id ?? null)
  })

  ipcMain.handle(IPC.notesSetCurrent, (_e, id: string) => {
    store.update((data) => {
      data.currentNoteId = id
    })
    broadcast(IPC.eventNoteChanged, id)
  })

  /* --------------------------- settings ------------------------------ */
  ipcMain.handle(IPC.settingsGet, () => ({ ...getStore().read().settings }))

  ipcMain.handle(IPC.settingsUpdate, (_e, patch: Partial<AppSettings>) => {
    const store = getStore()
    let next: AppSettings = store.read().settings
    const { vaultPath, ...rest } = patch

    // Move the notes over to the new folder before it is remembered.
    if (typeof vaultPath === 'string' && vaultPath) {
      changeVault(vaultPath)
    }

    store.update((data) => {
      data.settings = { ...data.settings, ...rest }
      next = data.settings
    })

    if (typeof patch.alwaysOnTop === 'boolean') setWindowAlwaysOnTop(patch.alwaysOnTop)
    if (typeof patch.hotkey === 'string') {
      const status = registerHotkey(patch.hotkey)
      if (!status.ok) console.warn('[shortcut]', status.error)
    }
    // "system" lets the OS decide; the concrete appearance is resolved in the
    // renderer, which then tells us what to show natively.
    if (typeof patch.theme === 'string') {
      nativeTheme.themeSource = patch.theme === 'system' ? 'system' : patch.theme
    }

    broadcast(IPC.eventSettingsChanged, next)
    return { ...next }
  })

  /* ------------------------------ app -------------------------------- */
  ipcMain.handle(IPC.appLocation, async () => {
    if (!currentLocation) {
      const info = await resolveLocation()
      if (info) setCurrentLocation(info)
    }
    return currentLocation
  })

  ipcMain.handle(IPC.appTemplate, (_e, id?: string) => getTemplate(id))

  ipcMain.handle(IPC.appSetHotkey, (_e, accelerator: string) => registerHotkey(accelerator))

  ipcMain.handle(IPC.appMinimize, () => {
    minimizeWindow()
  })

  ipcMain.handle(IPC.appSetAlwaysOnTop, (_e, value: boolean) => {
    setWindowAlwaysOnTop(value)
  })

  ipcMain.handle(IPC.appFocus, () => {
    showWindow()
  })

  ipcMain.handle(IPC.appHide, () => {
    hideWindow()
  })

  ipcMain.handle(IPC.appQuit, () => {
    store.flush()
    app.quit()
  })

  ipcMain.handle(IPC.appOpenSettings, () => {
    showWindow()
    getMainWindow()?.webContents.send(IPC.eventOpenSettings)
  })

  ipcMain.handle(IPC.appChooseFolder, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose the folder for your notes',
      defaultPath: vaultPathForDisplay(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    changeVault(folder)
    broadcast(IPC.eventNoteChanged, getStore().read().currentNoteId)
    return folder
  })

  ipcMain.handle(IPC.appUseICloud, () => {
    const folder = iCloudVaultPath()
    if (!folder) {
      return {
        ok: false,
        error:
          process.platform === 'darwin'
            ? 'Turn on iCloud Drive in System Settings first.'
            : 'iCloud Drive was not found on this computer.'
      }
    }
    try {
      changeVault(folder)
      broadcast(IPC.eventNoteChanged, getStore().read().currentNoteId)
      return { ok: true, path: folder }
    } catch (error) {
      console.error('[vault] failed to switch to iCloud Drive:', error)
      return { ok: false, error: 'Could not move the notes into iCloud Drive.' }
    }
  })

  ipcMain.handle(IPC.appRevealNote, (_e, id: string) => {
    const path = findNoteFile(id)
    if (path) shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.appVaultStatus, () => {
    const path = vaultPathForDisplay()
    const iCloudPath = iCloudVaultPath()
    return {
      path,
      noteCount: allNotes().length,
      iCloudAvailable: iCloudPath !== null,
      iCloudPath,
      iCloudActive: isInsideICloud(path)
    }
  })

  ipcMain.handle(IPC.appSystemTheme, () => ({
    isDark: nativeTheme.shouldUseDarkColors
  }))

  ipcMain.handle(IPC.appExportNote, async (_e, id: string) => {
    const note = findNote(id)
    if (!note) return null
    const result = await dialog.showSaveDialog({
      title: 'Export note',
      defaultPath: `${(note.title || 'note').replace(/[^\w\-\s]/g, '')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, note.markdown, 'utf-8')
    return result.filePath
  })

  ipcMain.handle(IPC.appPickAttachment, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Insert attachment',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const source = result.filePaths[0]
    const dir = join(app.getPath('userData'), 'assets')
    await mkdir(dir, { recursive: true })
    const name = `${newId('img')}${extname(source) || '.png'}`
    await copyFile(source, join(dir, name))
    return `asset://${name}`
  })

  ipcMain.handle(IPC.appWindowInfo, () => ({
    baseWidth: getBaseWidth(),
    platform: process.platform
  }))
}

export { formatLocation }
