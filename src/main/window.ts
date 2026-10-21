import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import { DEFAULT_SETTINGS } from './store'

const isMac = process.platform === 'darwin'

let mainWindow: BrowserWindow | null = null
let alwaysOnTop = DEFAULT_SETTINGS.alwaysOnTop
let baseWidth = DEFAULT_SETTINGS.width
let baseHeight = DEFAULT_SETTINGS.height
/** Set right before the app quits, so `close` is allowed to really close. */
let quitting = false
/** Only centre the window the first time; afterwards keep where the user dragged it. */
let positioned = false

app.on('before-quit', () => {
  quitting = true
})

/* Signals (logout, `kill`, test runners) must really quit, not just hide. */
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(signal, () => {
    quitting = true
    app.quit()
  })
}

/**
 * Frameless, transparent window. There is deliberately NO `titleBarStyle`:
 * on macOS it brings the native traffic lights back on top of the page,
 * which is what made them overlap the title. The app draws its own window
 * controls in a draggable top bar instead.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: baseWidth,
    height: baseHeight,
    minWidth: 340,
    minHeight: 380,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    hasShadow: true,
    // Real desktop blur behind the glass on macOS.
    ...(isMac ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    alwaysOnTop,
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  win.setAlwaysOnTop(alwaysOnTop, 'floating')
  // `skipTransformProcessType` keeps the Dock icon stable; without it macOS
  // flips the app into an accessory process and the Dock icon comes and goes.
  win.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void win.loadURL(rendererUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  win.once('ready-to-show', () => showWindow())

  // Closing (red button, ⌘W) only hides the quick note; it is recreated on demand.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow = win
  return win
}

function positionWindow(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const [w, h] = win.getSize()
  win.setPosition(Math.round(x + (width - w) / 2), Math.round(y + Math.max(24, (height - h) / 3)))
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** Show + focus the quick note, recreating the window if it was destroyed. */
export function showWindow(): void {
  const win = getMainWindow()
  if (!win) {
    // ready-to-show will call back into showWindow once the page is loaded.
    createMainWindow()
    return
  }
  if (!positioned) {
    positionWindow(win)
    positioned = true
  }
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  if (isMac) app.focus({ steal: true })
  win.focus()
}

export function hideWindow(): void {
  getMainWindow()?.hide()
}

export function minimizeWindow(): void {
  getMainWindow()?.minimize()
}

export function toggleWindow(): void {
  const win = getMainWindow()
  if (win && win.isVisible() && win.isFocused()) hideWindow()
  else showWindow()
}

export function setAlwaysOnTop(value: boolean): void {
  alwaysOnTop = value
  getMainWindow()?.setAlwaysOnTop(value, 'floating')
}

export function getAlwaysOnTop(): boolean {
  return alwaysOnTop
}

export function setBaseSize(width: number, height: number): void {
  baseWidth = width
  baseHeight = height
}

export function getBaseWidth(): number {
  return baseWidth
}
