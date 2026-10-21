import { List, Pin, Plus, Settings2 } from 'lucide-react'

interface TitleBarProps {
  platform: string
  pinned: boolean
  notesOpen: boolean
  settingsOpen: boolean
  onClose: () => void
  onMinimize: () => void
  onTogglePin: () => void
  onToggleNotes: () => void
  onNewNote: () => void
  onToggleSettings: () => void
}

/**
 * The whole strip drags the window (`app-region: drag`); every control inside
 * is `no-drag`. The window is frameless, so these are the only window controls.
 */
export function TitleBar(props: TitleBarProps): React.JSX.Element {
  const isMac = props.platform === 'darwin'

  const lights = (
    <div className="traffic-lights no-drag" data-probe="traffic-lights">
      <button type="button" className="light light-close" aria-label="Close" title="Close (hide)" onClick={props.onClose} />
      <button type="button" className="light light-min" aria-label="Minimize" title="Minimize" onClick={props.onMinimize} />
      <button
        type="button"
        className="light light-pin"
        data-on={props.pinned}
        aria-label="Keep on top"
        title={props.pinned ? 'Floating above other windows' : 'Keep above other windows'}
        onClick={props.onTogglePin}
      >
        <Pin size={7} strokeWidth={3} />
      </button>
    </div>
  )

  const actions = (
    <div className="titlebar-actions no-drag">
      <button
        type="button"
        className="glass-button"
        data-active={props.notesOpen}
        aria-label="All notes"
        title="Switch note (⌘K)"
        data-probe="notes-button"
        onClick={props.onToggleNotes}
      >
        <List size={15} strokeWidth={2} />
      </button>
      <button type="button" className="glass-button" aria-label="New note" title="New note (⌘N)" onClick={props.onNewNote}>
        <Plus size={16} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        className="glass-button"
        data-active={props.settingsOpen}
        aria-label="Settings"
        title="Settings (⌘,)"
        data-probe="settings-button"
        onClick={props.onToggleSettings}
      >
        <Settings2 size={15} strokeWidth={2} />
      </button>
    </div>
  )

  return (
    <header className="titlebar" data-probe="titlebar">
      {isMac ? lights : null}
      <div className="titlebar-drag" data-probe="drag-area" />
      {actions}
      {isMac ? null : lights}
    </header>
  )
}
