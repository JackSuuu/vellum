import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Note } from '@shared/types'
import { createNote, getStore } from './store'
import {
  defaultVaultPath,
  deleteNote,
  ensureVault,
  listNotes,
  migrateNoteFileNames,
  moveNotes,
  writeNote
} from './vault'

/**
 * Note repository backed by plain `.md` files inside the vault folder.
 * The JSON database only keeps settings + the id of the current note.
 */

/** noteId -> absolute path of the file that holds it. */
const fileCache = new Map<string, string>()

/**
 * `VELLUM_VAULT_PATH` overrides the folder — the test suite uses it to keep
 * the notes inside a temporary directory.
 */
function vaultOverride(): string | null {
  const value = process.env['VELLUM_VAULT_PATH']
  return value && value.trim() ? value.trim() : null
}

export function vaultFolder(): string {
  const settings = getStore().read().settings
  return ensureVault(vaultOverride() || settings.vaultPath || defaultVaultPath())
}

export function vaultPathForDisplay(): string {
  return vaultOverride() || getStore().read().settings.vaultPath || defaultVaultPath()
}

/** Refresh the id -> file cache and return every note (newest first). */
export function allNotes(): Note[] {
  const folder = vaultFolder()
  const entries = listNotes(folder)
  fileCache.clear()
  for (const entry of entries) fileCache.set(entry.note.id, entry.filePath)
  return entries.map((entry) => entry.note)
}

export function findNote(id: string): Note | null {
  const cached = fileCache.get(id)
  if (cached) {
    const entry = listNotes(vaultFolder()).find((e) => e.filePath === cached)
    if (entry) return entry.note
  }
  return allNotes().find((note) => note.id === id) ?? null
}

export function findNoteFile(id: string): string | null {
  if (fileCache.has(id)) return fileCache.get(id) ?? null
  allNotes()
  return fileCache.get(id) ?? null
}

/** Persist a note. `rename` also renames the file on disk. */
export function saveNote(note: Note, options: { rename?: boolean } = {}): Note {
  const folder = vaultFolder()
  const currentPath = findNoteFile(note.id)
  const entry = writeNote(folder, note, currentPath, { rename: options.rename })
  fileCache.set(note.id, entry.filePath)
  return entry.note
}

export function removeNote(id: string): void {
  const path = findNoteFile(id)
  if (path) deleteNote(path)
  fileCache.delete(id)
}

export function createNoteInVault(
  markdown: string,
  templateId: string | null,
  title: string,
  location: string
): Note {
  const note = createNote(markdown, templateId, title, location)
  saveNote(note, { rename: true })
  return note
}

/** Move every note into a new folder and remember it in the settings. */
export function changeVault(nextFolder: string): void {
  const previous = vaultFolder()
  if (previous === nextFolder) return
  moveNotes(previous, nextFolder)
  getStore().update((data) => {
    data.settings.vaultPath = nextFolder
  })
  fileCache.clear()
  allNotes()
}

/** Rename the files of notes created by an older build to the current scheme. */
export function migrateNoteFileNamesInVault(): number {
  const renamed = migrateNoteFileNames(vaultFolder())
  if (renamed > 0) {
    console.log(`[vault] renamed ${renamed} note file(s) to the current scheme`)
  }
  fileCache.clear()
  allNotes()
  return renamed
}

/**
 * One-off migration for the old JSON database: notes that were stored inside
 * `vellum-data.json` are written into the vault as `.md` files.
 */
export function migrateLegacyNotes(): number {
  const file = join(app.getPath('userData'), 'vellum-data.json')
  if (!existsSync(file)) return 0
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as {
      notes?: Array<Partial<Note>>
      todos?: unknown[]
    }
    const legacy = Array.isArray(raw.notes) ? raw.notes : []
    let migrated = 0
    for (const item of legacy) {
      if (!item?.id) continue
      if (findNote(item.id)) continue
      const now = Date.now()
      const note: Note = {
        id: item.id,
        title: item.title || '',
        markdown: item.markdown || '',
        createdAt: item.createdAt ?? now,
        updatedAt: item.updatedAt ?? now,
        endedAt: null,
        location: '',
        pinned: Boolean(item.pinned),
        templateId: item.templateId ?? null
      }
      saveNote(note, { rename: true })
      migrated += 1
    }
    if (migrated > 0) {
      console.log(`[vault] migrated ${migrated} note(s) from the old database`)
    }
    delete (raw as { notes?: unknown }).notes
    delete (raw as { todos?: unknown }).todos
    writeFileSync(file, JSON.stringify(raw, null, 2), 'utf-8')
    return migrated
  } catch (error) {
    console.error('[vault] migration failed:', error)
    return 0
  }
}
