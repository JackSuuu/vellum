import { app, nativeTheme, net, protocol } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureNote, prefetchLocation, registerHotkey, registerIpcHandlers } from './ipc'
import { migrateLegacyNotes } from './notes'
import { unregisterShortcut } from './shortcut'
import { getStore } from './store'
import { createTray, refreshTray } from './tray'
import { createMainWindow, setAlwaysOnTop, setBaseSize, showWindow } from './window'

const isDev = !app.isPackaged

/* The `asset://` protocol serves attachments copied into the user data dir.
   It works in dev (http://localhost) and prod (file://) alike. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// Single instance: a second launch focuses the floating window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.whenReady().then(() => {
    // The glass theme is light; keep the macOS vibrancy material light too.
    nativeTheme.themeSource = 'light'
    // Move notes from the old JSON database into the markdown vault.
    migrateLegacyNotes()

    const settings = getStore().read().settings
    setBaseSize(settings.width, settings.height)
    setAlwaysOnTop(settings.alwaysOnTop)

    registerIpcHandlers()

    protocol.handle('asset', async (request) => {
      const { pathname } = new URL(request.url)
      const filePath = join(app.getPath('userData'), 'assets', decodeURIComponent(pathname))
      return net.fetch(pathToFileURL(filePath).toString())
    })

    void ensureNote()
    createMainWindow()
    createTray()

    const status = registerHotkey(settings.hotkey)
    if (!status.ok) {
      console.warn(`[shortcut] could not register ${settings.hotkey}: ${status.error}`)
    }

    prefetchLocation()

    // The tray menu mirrors the note list, refresh it whenever data changes.
    setInterval(refreshTray, 4000)
  })

  app.on('activate', () => {
    showWindow()
  })
}

app.on('window-all-closed', () => {
  // Keep running in the tray: the global shortcut must still work.
})

app.on('before-quit', () => {
  unregisterShortcut()
  getStore().flush()
})

process.on('uncaughtException', (error) => {
  console.error('[main] uncaught exception:', error)
})

export { isDev }
