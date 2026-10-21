import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import type { Note } from '@shared/types'
import { formatRelative, formatTime } from '../lib/format'

interface NotesPopoverProps {
  notes: Note[]
  currentId: string
  closing: boolean
  onOpen: (note: Note) => void
  onDelete: (note: Note) => void
  onClose: () => void
}

function preview(markdown: string): string {
  return (
    markdown
      .split('\n')
      .map((line) => line.replace(/^\s*([#>*+-]|\d+\.|- \[[ xX]\])+\s*/, '').replace(/[*_`~=[\]]/g, '').trim())
      .find(Boolean) ?? ''
  ).slice(0, 90)
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const month = new Intl.DateTimeFormat(undefined, { month: 'short' })

/** A little tear-off calendar page showing the note's start date. */
function DateTile({ ms }: { ms: number }): React.JSX.Element {
  const date = new Date(ms)
  const otherYear = date.getFullYear() !== new Date().getFullYear()
  return (
    <span className="date-tile" title={date.toLocaleString()}>
      <span className="date-tile-month">{month.format(date)}{otherYear ? ` ’${String(date.getFullYear()).slice(2)}` : ''}</span>
      <span className="date-tile-day">{date.getDate()}</span>
    </span>
  )
}

/** ⌘K switcher: type to filter, ↑/↓ to move, ↩ to open, esc to close. */
export function NotesPopover({ notes, currentId, closing, onOpen, onDelete, onClose }: NotesPopoverProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [armed, setArmed] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const armTimer = useRef<number | null>(null)

  /** ⌘⌫ once arms the selected note, a second ⌘⌫ (within 2 s) deletes it. */
  const deleteSelected = (note: Note | undefined): void => {
    if (!note) return
    if (armTimer.current) window.clearTimeout(armTimer.current)
    if (armed === note.id) {
      setArmed(null)
      onDelete(note)
      return
    }
    setArmed(note.id)
    armTimer.current = window.setTimeout(() => setArmed(null), 2000)
  }

  useEffect(() => inputRef.current?.focus(), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.markdown.toLowerCase().includes(q))
  }, [notes, query])

  // Start on the note after the current one, so ⌘K ↩ jumps to the previous note.
  useEffect(() => {
    if (query) setIndex(0)
    else {
      const current = filtered.findIndex((n) => n.id === currentId)
      setIndex(current === 0 && filtered.length > 1 ? 1 : 0)
    }
  }, [query, filtered, currentId])

  useEffect(() => {
    setIndex((i) => Math.max(0, Math.min(i, filtered.length - 1)))
  }, [filtered.length])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div className="popover-backdrop" data-closing={closing} onMouseDown={onClose}>
      <div className="glass-panel notes-popover" data-probe="notes-popover" onMouseDown={(e) => e.stopPropagation()}>
        <div className="search-field">
          <Search size={14} strokeWidth={2.2} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Switch to note…"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                e.stopPropagation()
                deleteSelected(filtered[index])
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setArmed(null)
                setIndex((i) => Math.min(filtered.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setArmed(null)
                setIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter' && filtered[index]) {
                e.preventDefault()
                onOpen(filtered[index])
              }
            }}
          />
          <kbd className="kbd">⌘K</kbd>
        </div>

        <ul className="notes-list" ref={listRef}>
          {filtered.length === 0 ? <li className="notes-empty">No notes</li> : null}
          {filtered.map((note, i) => (
            <li
              key={note.id}
              className="notes-row"
              data-index={i}
              data-selected={i === index}
              data-active={note.id === currentId}
              data-armed={armed === note.id}
              onMouseMove={() => setIndex(i)}
            >
              <button type="button" className="notes-open" onClick={() => onOpen(note)}>
                <DateTile ms={note.createdAt} />
                <span className="notes-text">
                  <span className="notes-title">
                    {note.title || 'Untitled'}
                    {note.id === currentId ? <span className="notes-current">current</span> : null}
                  </span>
                  <span className="notes-when">
                    {weekday.format(new Date(note.createdAt))} · {formatTime(new Date(note.createdAt))}
                    <span className="notes-edited">edited {formatRelative(note.updatedAt)}</span>
                  </span>
                  <span className="notes-preview">
                    {armed === note.id ? 'Press ⌘⌫ again to delete' : preview(note.markdown) || 'Empty note'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="notes-delete"
                data-armed={armed === note.id}
                aria-label="Delete note"
                title={armed === note.id ? 'Click again to delete' : 'Delete'}
                onClick={() => {
                  if (armed === note.id) onDelete(note)
                  else setArmed(note.id)
                }}
                onMouseLeave={() => setArmed((a) => (a === note.id ? null : a))}
              >
                {armed === note.id ? 'Delete' : <Trash2 size={13} strokeWidth={2} />}
              </button>
            </li>
          ))}
        </ul>
        <div className="notes-hint">
          <span>↑↓ select</span>
          <span>↩ open</span>
          <span>⌘⌫ delete</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
