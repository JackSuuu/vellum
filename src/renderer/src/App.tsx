import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings, Note, SaveState } from '@shared/types'
import { MuyaEditor, type MuyaEditorHandle } from './components/MuyaEditor'
import { NoteHeader } from './components/NoteHeader'
import { NotesPopover } from './components/NotesPopover'
import { SettingsPanel } from './components/SettingsPanel'
import { TitleBar } from './components/TitleBar'
import { applyAccent } from './lib/accent'
import { applyTheme, setSystemTheme, watchSystemTheme } from './lib/theme'

const SAVE_DELAY = 350

function countWords(markdown: string): number {
  const text = markdown.replace(/[#>*_`~=\-[\]()!|]/g, ' ')
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0
  const latin = text.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, ' ').split(/\s+/).filter(Boolean).length
  return cjk + latin
}

const wordLabel = (n: number): string => `${n} ${n === 1 ? 'word' : 'words'}`

export default function App(): React.JSX.Element {
  const platform = document.body.dataset.platform ?? 'darwin'
  const [note, setNote] = useState<Note | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [panel, setPanelState] = useState<'none' | 'notes' | 'settings'>('none')
  const [closing, setClosing] = useState(false)
  const sheetRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<number | null>(null)

  const panelRef = useRef(panel)
  panelRef.current = panel

  /** Panels fade out before they are removed. */
  type Panel = 'none' | 'notes' | 'settings'
  const setPanel = useCallback((next: Panel | ((p: Panel) => Panel)) => {
    const prev = panelRef.current
    const target = typeof next === 'function' ? next(prev) : next
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
    if (target === 'none' && prev !== 'none') {
      setClosing(true)
      closeTimer.current = window.setTimeout(() => {
        setClosing(false)
        setPanelState('none')
      }, 140)
      return
    }
    setClosing(false)
    setPanelState(target)
  }, [])

  const editorRef = useRef<MuyaEditorHandle>(null)
  const noteRef = useRef<Note | null>(null)
  noteRef.current = note
  /** Markdown that is on disk for the current note. */
  const savedRef = useRef<{ id: string; markdown: string } | null>(null)
  const timerRef = useRef<number | null>(null)

  /* ------------------------------------------------------------- saving -- */
  const persist = useCallback(async (id: string, markdown: string) => {
    if (savedRef.current?.id === id && savedRef.current.markdown === markdown) return
    setSaveState('saving')
    try {
      await window.vellum.notes.update(id, { markdown })
      if (noteRef.current?.id === id) savedRef.current = { id, markdown }
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [])

  /** Write whatever the editor holds right now (used before switching notes / hiding). */
  const flush = useCallback(async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
    const current = noteRef.current
    if (!current || !editorRef.current) return
    await persist(current.id, editorRef.current.flush())
  }, [persist])

  const onEditorChange = useCallback(
    (markdown: string) => {
      const current = noteRef.current
      if (!current) return
      if (savedRef.current?.id === current.id && savedRef.current.markdown === markdown) return
      setNote((n) => (n && n.id === current.id ? { ...n, markdown } : n))
      setSaveState('saving')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void persist(current.id, markdown), SAVE_DELAY)
    },
    [persist]
  )

  /* --------------------------------------------------------- switching -- */
  const open = useCallback(
    async (next: Note | null) => {
      if (!next) return
      if (noteRef.current?.id === next.id) {
        setPanel('none')
        return
      }
      await flush()
      setPanel('none')
      savedRef.current = { id: next.id, markdown: next.markdown }
      setNote(next)
      setSaveState('idle')
      void window.vellum.notes.setCurrent(next.id)
      // Swap immediately, then a short opacity-only fade (GPU composited, no
      // layout or blur work), so the switch never stalls.
      requestAnimationFrame(() => {
        const sheet = sheetRef.current
        sheet?.getAnimations().forEach((a) => a.cancel())
        sheet?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' })
        editorRef.current?.focus()
      })
    },
    [flush, setPanel]
  )

  const refreshList = useCallback(async () => setNotes(await window.vellum.notes.list()), [])

  const newNote = useCallback(async () => {
    await flush()
    await open(await window.vellum.notes.create())
  }, [flush, open])

  /* ---------------------------------------------------------- bootstrap -- */
  useEffect(() => {
    watchSystemTheme()
    void (async () => {
      const [loadedSettings, current] = await Promise.all([window.vellum.settings.get(), window.vellum.notes.current()])
      setSettings(loadedSettings)
      applyAccent(loadedSettings.accent)
      applyTheme(loadedSettings.theme ?? 'system')
      if (current) {
        savedRef.current = { id: current.id, markdown: current.markdown }
        setNote(current)
      }
    })()
  }, [])

  /* Events coming from the main process (tray menu, global shortcut). */
  useEffect(() => {
    const offs = [
      window.vellum.on.newNote(() => void newNote()),
      window.vellum.on.openSettings(() => setPanel('settings')),
      window.vellum.on.settingsChanged((next) => {
        setSettings(next)
        applyAccent(next.accent)
        applyTheme(next.theme ?? 'system')
      }),
      window.vellum.on.noteChanged(async (id) => {
        // Saves are never echoed back, so this is always another note
        // (picked in the tray, created by the shortcut, or after a delete).
        if (id && id === noteRef.current?.id) return
        void open(id ? await window.vellum.notes.get(id) : await window.vellum.notes.current())
      }),
      window.vellum.on.systemTheme((isDark) => setSystemTheme(isDark))
    ]
    return () => offs.forEach((off) => off())
  }, [newNote, open])

  /* Save when the window goes to the background or closes. */
  useEffect(() => {
    const onBlur = (): void => void flush()
    window.addEventListener('blur', onBlur)
    window.addEventListener('beforeunload', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('beforeunload', onBlur)
    }
  }, [flush])

  const hide = useCallback(async () => {
    await flush()
    await window.vellum.app.hide()
  }, [flush])

  /* Keyboard shortcuts. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void newNote()
      } else if (mod && (event.code === 'KeyK' || event.key.toLowerCase() === 'p')) {
        event.preventDefault()
        void refreshList()
        setPanel((p) => (p === 'notes' ? 'none' : 'notes'))
      } else if (mod && event.key === ',') {
        event.preventDefault()
        setPanel((p) => (p === 'settings' ? 'none' : 'settings'))
      } else if (mod && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        void hide()
      } else if (event.key === 'Escape' && !event.defaultPrevented) {
        if (panel !== 'none') setPanel('none')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide, newNote, panel, refreshList, setPanel])

  /* ----------------------------------------------------------- updates -- */
  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    if (patch.accent) applyAccent(patch.accent)
    if (patch.theme) applyTheme(patch.theme)
    setSettings(await window.vellum.settings.update(patch))
  }, [])

  const rename = useCallback(async (title: string) => {
    const current = noteRef.current
    if (!current) return
    setNote({ ...current, title })
    const saved = await window.vellum.notes.update(current.id, { title })
    if (saved && noteRef.current?.id === saved.id) setNote((n) => (n ? { ...n, title: saved.title } : n))
  }, [])

  const setStarted = useCallback(async (createdAt: number) => {
    const current = noteRef.current
    if (!current) return
    setNote({ ...current, createdAt })
    await window.vellum.notes.update(current.id, { createdAt })
  }, [])

  const setEnded = useCallback(async (endedAt: number | null) => {
    const current = noteRef.current
    if (!current) return
    setNote({ ...current, endedAt })
    await window.vellum.notes.update(current.id, { endedAt })
  }, [])

  const deleteNote = useCallback(
    async (target: Note) => {
      await window.vellum.notes.remove(target.id)
      await refreshList()
      if (target.id === noteRef.current?.id) {
        noteRef.current = null
        savedRef.current = null
        const next = await window.vellum.notes.current()
        if (next) {
          savedRef.current = { id: next.id, markdown: next.markdown }
          setNote(next)
        }
      }
    },
    [refreshList]
  )

  if (!note || !settings) {
    return <div className="shell shell-loading" />
  }

  return (
    <div className="shell" data-platform={platform} data-font={settings.fontFamily ?? 'sans'}>
      <TitleBar
        platform={platform}
        pinned={settings.alwaysOnTop}
        notesOpen={panel === 'notes'}
        settingsOpen={panel === 'settings'}
        onClose={() => void hide()}
        onMinimize={() => void window.vellum.app.minimize()}
        onTogglePin={() => void updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
        onToggleNotes={() => {
          void refreshList()
          setPanel((p) => (p === 'notes' ? 'none' : 'notes'))
        }}
        onNewNote={() => void newNote()}
        onToggleSettings={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}
      />

      <main className="sheet" ref={sheetRef}>
        <NoteHeader note={note} onRename={(t) => void rename(t)} onSetStarted={(t) => void setStarted(t)} onSetEnded={(e) => void setEnded(e)} onEnterBody={() => editorRef.current?.focus()} />
        <div className="editor-scroll" data-probe="editor">
          <MuyaEditor ref={editorRef} noteKey={note.id} markdown={note.markdown} fontSize={settings.fontSize} onChange={onEditorChange} />
        </div>
      </main>

      <footer className="statusbar" data-probe="statusbar">
        <span>{wordLabel(countWords(note.markdown))}</span>
        <span className="status-dot" data-state={saveState} />
        <span>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'Saved'}</span>
      </footer>

      {panel === 'notes' ? (
        <NotesPopover
          notes={notes}
          currentId={note.id}
          closing={closing}
          onOpen={(n) => void open(n)}
          onDelete={(n) => void deleteNote(n)}
          onClose={() => setPanel('none')}
        />
      ) : null}
      {panel === 'settings' ? (
        <SettingsPanel settings={settings} closing={closing} onChange={(p) => void updateSettings(p)} onClose={() => setPanel('none')} />
      ) : null}
    </div>
  )
}
