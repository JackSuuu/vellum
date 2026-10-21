import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Flag, MapPin, X } from 'lucide-react'
import type { Note } from '@shared/types'
import { formatTime } from '../lib/format'

interface NoteHeaderProps {
  note: Note
  onRename: (title: string) => void
  onSetStarted: (createdAt: number) => void
  onSetEnded: (endedAt: number | null) => void
  onEnterBody: () => void
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const yearDayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

function formatDay(date: Date): string {
  return date.getFullYear() === new Date().getFullYear() ? dayFormat.format(date) : yearDayFormat.format(date)
}

/** `<input type="datetime-local">` wants local "YYYY-MM-DDTHH:mm". */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Small glass pop-up to correct a date / time. */
function TimeEditor({
  label,
  value,
  onSave,
  onClose
}: {
  label: string
  value: number
  onSave: (ms: number) => void
  onClose: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(toLocalInput(value))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const save = (): void => {
    const ms = new Date(draft).getTime()
    if (Number.isFinite(ms)) onSave(ms)
    onClose()
  }

  return (
    <div className="time-editor" ref={ref} data-probe="time-editor">
      <div className="time-editor-label">{label}</div>
      <input
        type="datetime-local"
        className="glass-input"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onClose()
        }}
      />
      <div className="time-editor-actions">
        <button type="button" className="text-button" onClick={() => setDraft(toLocalInput(Date.now()))}>
          Now
        </button>
        <button type="button" className="text-button primary" onClick={save}>
          Done
        </button>
      </div>
    </div>
  )
}

/** Obsidian-style inline title, kept apart from the Markdown body. */
export function NoteHeader({ note, onRename, onSetStarted, onSetEnded, onEnterBody }: NoteHeaderProps): React.JSX.Element {
  const [draft, setDraft] = useState(note.title)
  const [editing, setEditing] = useState<'start' | 'end' | null>(null)

  useEffect(() => setDraft(note.title), [note.id, note.title])
  useEffect(() => setEditing(null), [note.id])

  const commit = (): void => {
    const next = draft.trim()
    if (next !== note.title) onRename(next)
  }

  const started = new Date(note.createdAt)
  const ended = note.endedAt ? new Date(note.endedAt) : null
  const sameDay = ended ? ended.toDateString() === started.toDateString() : true

  return (
    <section className="note-header" data-probe="note-header">
      <input
        className="note-title"
        data-probe="note-title"
        value={draft}
        placeholder="Untitled"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault()
            commit()
            onEnterBody()
          }
        }}
      />

      <div className="note-meta" data-probe="note-meta">
        <span className="meta-anchor">
          <button
            type="button"
            className="meta-pill meta-pill-start"
            data-probe="start-time"
            title="Start time — filled in automatically, click to change"
            onClick={() => setEditing((e) => (e === 'start' ? null : 'start'))}
          >
            <CalendarClock size={14} strokeWidth={2} />
            {formatDay(started)} · {formatTime(started)}
          </button>
          {editing === 'start' ? (
            <TimeEditor label="Start" value={note.createdAt} onSave={onSetStarted} onClose={() => setEditing(null)} />
          ) : null}
        </span>

        <span className="meta-arrow">→</span>

        <span className="meta-anchor">
          {ended ? (
            <span className="meta-pill meta-pill-done" data-probe="end-time">
              <button
                type="button"
                className="meta-pill-body"
                title={`Ended ${ended.toLocaleString()} — click to change`}
                onClick={() => setEditing((e) => (e === 'end' ? null : 'end'))}
              >
                <Flag size={13} strokeWidth={2.2} />
                {sameDay ? formatTime(ended) : `${formatDay(ended)} · ${formatTime(ended)}`}
              </button>
              <button type="button" className="meta-pill-clear" aria-label="Remove end time" title="Remove end time" onClick={() => onSetEnded(null)}>
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="meta-pill"
              data-probe="end-time"
              title="Stamp the current time as the end of this note"
              onClick={() => onSetEnded(Date.now())}
            >
              <Flag size={13} strokeWidth={2.2} />
              Set end time
            </button>
          )}
          {editing === 'end' && note.endedAt ? (
            <TimeEditor label="End" value={note.endedAt} onSave={(ms) => onSetEnded(ms)} onClose={() => setEditing(null)} />
          ) : null}
        </span>

      </div>

      {note.location ? (
        <div className="note-place" title={note.location} data-probe="note-place">
          <MapPin size={14} strokeWidth={2} />
          <span className="truncate">{note.location}</span>
        </div>
      ) : null}
    </section>
  )
}
