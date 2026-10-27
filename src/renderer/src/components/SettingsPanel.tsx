import { useEffect, useState } from 'react'
import { Cloud, FolderOpen, X } from 'lucide-react'
import type { AppSettings, VaultStatus } from '@shared/types'
import { ACCENTS } from '../lib/accent'

interface SettingsPanelProps {
  settings: AppSettings
  closing: boolean
  onChange: (patch: Partial<AppSettings>) => void
  onClose: () => void
}

/** "CommandOrControl+Shift+." -> "⌘⇧." on macOS. */
function prettyAccelerator(accelerator: string, isMac: boolean): string {
  if (!isMac) return accelerator.replace('CommandOrControl', 'Ctrl')
  return accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, '')
}

export function SettingsPanel({ settings, closing, onChange, onClose }: SettingsPanelProps): React.JSX.Element {
  const isMac = document.body.dataset.platform === 'darwin'
  const [recording, setRecording] = useState(false)
  const [hotkeyStatus, setHotkeyStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [vaultPath, setVaultPath] = useState('')
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const [icloudBusy, setICloudBusy] = useState(false)
  const [icloudError, setICloudError] = useState<string | null>(null)
  const template = settings.templates.find((t) => t.id === settings.defaultTemplateId) ?? settings.templates[0]

  const refreshVault = async (): Promise<void> => {
    const status = await window.vellum.app.vaultStatus()
    setVault(status)
    setVaultPath(status.path)
  }

  useEffect(() => {
    void refreshVault()
  }, [])

  const useICloud = async (): Promise<void> => {
    setICloudBusy(true)
    setICloudError(null)
    try {
      const result = await window.vellum.app.useICloudVault()
      if (!result.ok) {
        setICloudError(result.error ?? 'Could not use iCloud Drive.')
        return
      }
      await refreshVault()
    } catch {
      setICloudError('Could not move the notes into iCloud Drive.')
    } finally {
      setICloudBusy(false)
    }
  }

  const record = (event: React.KeyboardEvent): void => {
    event.preventDefault()
    if (event.key === 'Escape') {
      setRecording(false)
      return
    }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return
    const parts: string[] = []
    if (event.metaKey || event.ctrlKey) parts.push('CommandOrControl')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    if (parts.length === 0) {
      setHotkeyStatus({ ok: false, text: 'Use at least one modifier key (⌘, ⌥, ⌃).' })
      return
    }
    // `code` is layout independent: Shift+. still records ".".
    const fromCode = event.code.startsWith('Key')
      ? event.code.slice(3)
      : event.code.startsWith('Digit')
        ? event.code.slice(5)
        : ({ Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: 'Space' } as Record<string, string>)[event.code]
    const key = fromCode ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
    const accelerator = [...parts, key].join('+')
    setRecording(false)
    void window.vellum.app.setHotkey(accelerator).then((status) => {
      if (status.ok) {
        onChange({ hotkey: accelerator })
        setHotkeyStatus({ ok: true, text: `Saved. Press ${prettyAccelerator(accelerator, isMac)} anywhere to show or hide.` })
      } else {
        setHotkeyStatus({ ok: false, text: status.error ?? 'That shortcut is not available.' })
        // Keep the previous shortcut working.
        void window.vellum.app.setHotkey(settings.hotkey)
      }
    })
  }

  return (
    <div className="popover-backdrop" data-closing={closing} onMouseDown={onClose}>
      <div className="glass-panel settings-panel" data-probe="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Settings</h2>
          <button type="button" className="glass-button small" aria-label="Close settings" onClick={onClose}>
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>

        <div className="setting-group">
          <div className="setting-row">
            <span>Show / hide shortcut</span>
            <button
              type="button"
              className="hotkey-field"
              data-recording={recording}
              onClick={() => setRecording(true)}
              onKeyDown={recording ? record : undefined}
              onBlur={() => setRecording(false)}
            >
              {recording ? 'Press keys…' : prettyAccelerator(settings.hotkey, isMac)}
            </button>
          </div>
          {hotkeyStatus ? <p className={`setting-note ${hotkeyStatus.ok ? 'ok' : 'error'}`}>{hotkeyStatus.text}</p> : null}

          <Toggle label="Keep above other windows" on={settings.alwaysOnTop} onToggle={() => onChange({ alwaysOnTop: !settings.alwaysOnTop })} />
          <Toggle
            label="Start a new note when opened with the shortcut"
            on={settings.newNoteOnHotkey}
            onToggle={() => onChange({ newNoteOnHotkey: !settings.newNoteOnHotkey })}
          />
          <Toggle label="Save the city with new notes" on={settings.locationEnabled} onToggle={() => onChange({ locationEnabled: !settings.locationEnabled })} />
          <div className="setting-row">
            <span>Appearance</span>
            <div className="segmented">
              {(
                [
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                  ['system', 'System']
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  data-active={(settings.theme ?? 'system') === value}
                  onClick={() => onChange({ theme: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>Theme colour</span>
            <div className="accent-swatches">
              {(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="accent-swatch"
                  title={ACCENTS[key].label}
                  aria-label={ACCENTS[key].label}
                  data-active={(settings.accent ?? 'purple') === key}
                  style={{ '--swatch': ACCENTS[key].color } as React.CSSProperties}
                  onClick={() => onChange({ accent: key })}
                />
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>Typeface</span>
            <div className="segmented">
              {(
                [
                  ['sans', 'Sans', 'Aa'],
                  ['serif', 'Serif', 'Aa']
                ] as const
              ).map(([value, label, sample]) => (
                <button
                  key={value}
                  type="button"
                  data-active={(settings.fontFamily ?? 'sans') === value}
                  data-font={value}
                  onClick={() => onChange({ fontFamily: value })}
                >
                  <span className="segmented-sample">{sample}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>Text size</span>
            <input
              type="range"
              min={13}
              max={20}
              value={settings.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            />
          </div>
        </div>

        {template ? (
          <div className="setting-group">
            <div className="setting-label">New note template</div>
            <input
              className="glass-input"
              placeholder="Title (optional), e.g. {{date}}"
              value={template.title ?? ''}
              onChange={(e) =>
                onChange({ templates: settings.templates.map((t) => (t.id === template.id ? { ...t, title: e.target.value } : t)) })
              }
            />
            <textarea
              className="glass-input template-body"
              placeholder="Body (Markdown, optional)"
              value={template.content}
              onChange={(e) =>
                onChange({ templates: settings.templates.map((t) => (t.id === template.id ? { ...t, content: e.target.value } : t)) })
              }
            />
            <p className="setting-note">{'{{date}} {{time}} {{weekday}} {{datetime}} {{location}}'}</p>
          </div>
        ) : null}

        <div className="setting-group">
          <div className="setting-label">Notes folder</div>
          <div className="setting-row">
            <span className="folder-path" title={vaultPath}>
              <FolderOpen size={13} strokeWidth={2} />
              {vaultPath}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void window.vellum.app.chooseVaultFolder().then((folder) => {
                  if (folder) {
                    setICloudError(null)
                    void refreshVault()
                  }
                })
              }
            >
              Change…
            </button>
          </div>
          {vault?.iCloudAvailable ? (
            <>
              <div className="setting-row">
                <span className="folder-path" title={vault.iCloudPath ?? undefined}>
                  <Cloud size={13} strokeWidth={2} />
                  iCloud Drive
                </span>
                {vault.iCloudActive ? (
                  <span className="icloud-state">Syncing</span>
                ) : (
                  <button type="button" className="text-button" disabled={icloudBusy} onClick={() => void useICloud()}>
                    {icloudBusy ? 'Moving…' : 'Use iCloud Drive'}
                  </button>
                )}
              </div>
              <p className="setting-note">
                {vault.iCloudActive
                  ? 'Open this folder as a vault in Obsidian to read the notes on your phone.'
                  : 'Use Change… to pick an existing Obsidian vault in iCloud Drive, or move the notes into iCloud Drive/Vellum.'}
              </p>
              {icloudError ? <p className="setting-note error">{icloudError}</p> : null}
            </>
          ) : null}
          <p className="setting-note">Every note is a Markdown file in this folder.</p>
        </div>

        <button type="button" className="text-button danger" onClick={() => void window.vellum.app.quit()}>
          Quit Vellum
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button type="button" className="switch" role="switch" aria-checked={on} data-on={on} onClick={onToggle} />
    </div>
  )
}
