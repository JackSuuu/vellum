import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type { Note } from '@shared/types'

/**
 * The vault is the folder the user picks for storing notes.
 * Every note is a plain `.md` file with a small YAML-ish frontmatter block,
 * so the notes stay readable (and greppable) outside of Vellum.
 *
 *   ---
 *   id: note_l3k2j1
 *   title: Apartment hunting
 *   created: 2026-10-21T09:12:00.000Z
 *   updated: 2026-10-21T09:20:00.000Z
 *   ended: 2026-10-21T11:02:00.000Z
 *   pinned: false
 *   ---
 *
 *   # Apartment hunting
 *   ...
 */

const FRONTMATTER_FENCE = '---'

export interface VaultNoteFile {
  note: Note
  filePath: string
  fileName: string
}

export function defaultVaultPath(): string {
  return join(app.getPath('documents'), 'Vellum')
}

/** Make sure the vault folder exists and return it. */
export function ensureVault(folder: string): string {
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  return folder
}

/**
 * `2026-10-21_15-04` — the moment the note was created, in local time.
 * It is the whole file name, so notes sort by time in Finder / the file
 * manager of the platform. The title is deliberately *not* part of it: the
 * title can change at any time, and renaming files on every edit would be
 * churn. The title lives in the frontmatter instead.
 */
function createdStamp(timestamp: number): string {
  const created = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())}`
  const time = `${pad(created.getHours())}-${pad(created.getMinutes())}`
  return `${date}_${time}`
}

/** `2026-10-21_15-04` — the file name of a note, without extension. */
function fileBaseName(note: Note): string {
  return createdStamp(note.createdAt)
}

function serializeFrontmatter(note: Note): string {
  const lines = [
    FRONTMATTER_FENCE,
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
    `ended: ${note.endedAt ? new Date(note.endedAt).toISOString() : ''}`,
    `location: ${JSON.stringify(note.location ?? '')}`,
    `pinned: ${note.pinned ? 'true' : 'false'}`,
    `template: ${note.templateId ?? ''}`,
    FRONTMATTER_FENCE,
    ''
  ]
  return lines.join('\n')
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith(`${FRONTMATTER_FENCE}\n`) && !raw.startsWith(`${FRONTMATTER_FENCE}\r\n`)) {
    return { meta: {}, body: raw }
  }
  const lines = raw.split(/\r?\n/)
  const meta: Record<string, string> = {}
  let index = 1
  for (; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === FRONTMATTER_FENCE) {
      index += 1
      break
    }
    const match = line.match(/^([a-zA-Z]+):\s?(.*)$/)
    if (match) meta[match[1].toLowerCase()] = match[2].trim()
  }
  const body = lines.slice(index).join('\n')
  return { meta, body }
}

function parseValue(raw: string | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      return trimmed.replace(/^"|"$/g, '')
    }
  }
  return trimmed
}

/** Read a single `.md` file into a Note (returns null when it is not a note). */
export function readNoteFile(filePath: string): VaultNoteFile | null {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
  const { meta, body } = parseFrontmatter(raw)
  if (!meta.id) return null
  const created = Date.parse(meta.created ?? '') || Date.now()
  const updated = Date.parse(meta.updated ?? '') || created
  const ended = meta.ended ? Date.parse(meta.ended) || null : null
  // The title lives in the frontmatter; only very old files fall back to the body.
  const title = 'title' in meta ? parseValue(meta.title) : deriveTitleFromBody(body)
  const note: Note = {
    id: meta.id,
    title,
    markdown: body.replace(/^\n+/, ''),
    createdAt: created,
    updatedAt: updated,
    endedAt: ended,
    location: parseValue(meta.location),
    pinned: meta.pinned === 'true',
    templateId: meta.template ? meta.template : null
  }
  return { note, filePath, fileName: basename(filePath) }
}

function deriveTitleFromBody(body: string): string {
  const heading = body.match(/^\s{0,3}#{1,6}\s+(.+)$/m)
  if (heading) return heading[1].trim().slice(0, 80)
  const line = body
    .split('\n')
    .map((l) => l.replace(/^[\s>#*-]+/, '').trim())
    .find((l) => l.length > 0)
  return line ? line.slice(0, 80) : ''
}

/** All notes inside the vault, newest first. */
export function listNotes(folder: string): VaultNoteFile[] {
  if (!existsSync(folder)) return []
  const files = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.md'))
  const notes: VaultNoteFile[] = []
  for (const name of files) {
    const filePath = join(folder, name)
    try {
      if (!statSync(filePath).isFile()) continue
    } catch {
      continue
    }
    const entry = readNoteFile(filePath)
    if (entry) notes.push(entry)
  }
  return notes.sort((a, b) => b.note.updatedAt - a.note.updatedAt)
}

function uniqueFilePath(folder: string, note: Note, currentPath: string | null): string {
  const base = fileBaseName(note)
  let candidate = join(folder, `${base}.md`)
  let counter = 2
  while (existsSync(candidate) && candidate !== currentPath) {
    candidate = join(folder, `${base}-${counter}.md`)
    counter += 1
  }
  return candidate
}

/**
 * Write the note to disk. The file name is the note title plus the moment it
 * was created (`Groceries_2026-10-21_15-04.md`), and it is renamed when the
 * title or the start time changes.
 */
export function writeNote(
  folder: string,
  note: Note,
  currentPath: string | null,
  options: { rename?: boolean } = {}
): VaultNoteFile {
  ensureVault(folder)
  const target = options.rename
    ? uniqueFilePath(folder, note, currentPath)
    : (currentPath ?? uniqueFilePath(folder, note, null))
  const content = `${serializeFrontmatter(note)}\n${note.markdown.replace(/^\n+/, '')}`
  const tmp = `${target}.tmp`
  writeFileSync(tmp, content, 'utf-8')
  renameSync(tmp, target)

  if (currentPath && currentPath !== target && existsSync(currentPath)) {
    try {
      rmSync(currentPath, { force: true })
    } catch (error) {
      console.error('[vault] failed to remove the old file:', error)
    }
  }
  return { note, filePath: target, fileName: basename(target) }
}

/**
 * Bring notes written by older builds up to the current naming scheme
 * (`Title_YYYY-MM-DD_HH-MM.md`). Files that already match are left alone.
 */
export function migrateNoteFileNames(folder: string): number {
  if (!existsSync(folder)) return 0
  let renamed = 0
  for (const entry of listNotes(folder)) {
    const expected = fileBaseName(entry.note)
    if (entry.fileName === `${expected}.md`) continue
    const target = uniqueFilePath(folder, entry.note, entry.filePath)
    if (target === entry.filePath) continue
    try {
      renameSync(entry.filePath, target)
      renamed += 1
    } catch (error) {
      console.error('[vault] failed to rename the note file:', error)
    }
  }
  return renamed
}

export function deleteNote(filePath: string): void {
  try {
    rmSync(filePath, { force: true })
  } catch (error) {
    console.error('[vault] failed to delete the note file:', error)
  }
}

/** Copy every note into a new folder (used when the user changes the vault). */
export function moveNotes(from: string, to: string): void {
  ensureVault(to)
  for (const entry of listNotes(from)) {
    writeNote(to, entry.note, null)
  }
}
