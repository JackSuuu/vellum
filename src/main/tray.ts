import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { broadcast } from './bus'
import { getTemplate } from './ipc'
import { allNotes } from './notes'
import { getStore } from './store'
import { getMainWindow, hideWindow, showWindow, toggleWindow } from './window'

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  const isMac = process.platform === 'darwin'
  // Packaged: <app.asar>/resources/…  (electron-builder `files`); dev: <repo>/resources/…
  const iconPath = join(__dirname, '../../resources', isMac ? 'trayTemplate.png' : 'tray.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) console.error(`[tray] icon not found at ${iconPath}`)
  if (isMac) image.setTemplateImage(true)
  return image
}

function buildMenu(): Electron.Menu {
  const store = getStore()
  const data = store.read()
  const settings = data.settings

  const templates: Electron.MenuItemConstructorOptions[] = data.settings.templates.map((template) => ({
    label: template.name,
    type: 'radio',
    checked: template.id === settings.defaultTemplateId,
    click: () => {
      store.update((d) => {
        d.settings.defaultTemplateId = template.id
      })
      broadcast(IPC.eventSettingsChanged, store.read().settings)
      showWindow()
      broadcast(IPC.eventNewNote, template.id)
    }
  }))

  const notes: Electron.MenuItemConstructorOptions[] = allNotes().slice(0, 10).map((note) => ({
    label: note.title || 'Untitled',
    type: 'radio',
    checked: note.id === data.currentNoteId,
    click: () => {
      store.update((d) => {
        d.currentNoteId = note.id
      })
      showWindow()
      broadcast(IPC.eventNoteChanged, note.id)
    }
  }))

  const template = getTemplate()

  return Menu.buildFromTemplate([
    { label: 'New Note', click: () => { showWindow(); broadcast(IPC.eventNewNote, template.id) } },
    { label: 'Show / Hide Quick Note', click: () => toggleWindow() },
    { type: 'separator' },
    { label: 'Template', submenu: templates.length ? templates : [{ label: 'None', enabled: false }] },
    {
      label: 'Recent Notes',
      submenu: notes.length ? notes : [{ label: 'No notes yet', enabled: false }]
    },
    { type: 'separator' },
    { label: 'Settings…', click: () => { showWindow(); broadcast(IPC.eventOpenSettings) } },
    { type: 'separator' },
    {
      label: 'Quit Vellum',
      click: () => {
        getStore().flush()
        app.quit()
      }
    }
  ])
}

export function createTray(): Tray {
  if (tray) return tray
  tray = new Tray(trayIcon())
  tray.setToolTip('Vellum Quick Note')
  tray.setContextMenu(buildMenu())
  tray.on('click', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isVisible() && win.isFocused()) hideWindow()
    else showWindow()
  })
  return tray
}

export function refreshTray(): void {
  if (!tray) return
  tray.setContextMenu(buildMenu())
}
