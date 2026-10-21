import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { VellumApi } from '@shared/api'
import type { AppSettings, Note, VaultStatus } from '@shared/types'

function subscribe<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    callback(...(args as T))
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: VellumApi = {
  notes: {
    list: () => ipcRenderer.invoke(IPC.notesList) as Promise<Note[]>,
    get: (id) => ipcRenderer.invoke(IPC.notesGet, id) as Promise<Note | null>,
    current: () => ipcRenderer.invoke(IPC.notesCurrent) as Promise<Note | null>,
    create: (input) => ipcRenderer.invoke(IPC.notesCreate, input) as Promise<Note>,
    update: (id, patch) =>
      ipcRenderer.invoke(IPC.notesUpdate, id, patch) as Promise<Note | null>,
    remove: (id) => ipcRenderer.invoke(IPC.notesDelete, id) as Promise<void>,
    setCurrent: (id) => ipcRenderer.invoke(IPC.notesSetCurrent, id) as Promise<void>
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<AppSettings>
  },
  app: {
    location: () => ipcRenderer.invoke(IPC.appLocation) as Promise<import('@shared/types').LocationInfo | null>,
    template: (id) => ipcRenderer.invoke(IPC.appTemplate, id) as Promise<import('@shared/types').NoteTemplate>,
    setHotkey: (accelerator) => ipcRenderer.invoke(IPC.appSetHotkey, accelerator) as Promise<import('@shared/types').HotkeyStatus>,
    minimize: () => ipcRenderer.invoke(IPC.appMinimize) as Promise<void>,
    setAlwaysOnTop: (value) => ipcRenderer.invoke(IPC.appSetAlwaysOnTop, value) as Promise<void>,
    focus: () => ipcRenderer.invoke(IPC.appFocus) as Promise<void>,
    hide: () => ipcRenderer.invoke(IPC.appHide) as Promise<void>,
    quit: () => ipcRenderer.invoke(IPC.appQuit) as Promise<void>,
    exportNote: (id) => ipcRenderer.invoke(IPC.appExportNote, id) as Promise<string | null>,
    pickAttachment: () => ipcRenderer.invoke(IPC.appPickAttachment) as Promise<string | null>,
    openSettings: () => ipcRenderer.invoke(IPC.appOpenSettings) as Promise<void>,
    chooseVaultFolder: () => ipcRenderer.invoke(IPC.appChooseFolder) as Promise<string | null>,
    revealNote: (id) => ipcRenderer.invoke(IPC.appRevealNote, id) as Promise<void>,
    vaultStatus: () => ipcRenderer.invoke(IPC.appVaultStatus) as Promise<VaultStatus>
  },
  on: {
    newNote: (cb) => subscribe(IPC.eventNewNote, cb),
    openSettings: (cb) => subscribe(IPC.eventOpenSettings, cb),
    noteChanged: (cb) => subscribe(IPC.eventNoteChanged, cb),
    settingsChanged: (cb) => subscribe(IPC.eventSettingsChanged, cb),
    locationChanged: (cb) => subscribe(IPC.eventLocationChanged, cb)
  }
}

contextBridge.exposeInMainWorld('vellum', api)
