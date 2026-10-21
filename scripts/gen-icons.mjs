/**
 * Renders the app + tray icons from SVG with Chromium (via Electron), so we
 * get real gradients, blur and anti-aliasing.
 *
 *   npx electron scripts/gen-icons.mjs
 *
 * Output (resources/):
 *   icon.png              1024x1024  app icon (electron-builder makes .icns/.ico from it)
 *   tray.png              32x32      coloured tray icon (Windows / Linux)
 *   trayTemplate.png      16x16      macOS menu-bar template (black + alpha)
 *   trayTemplate@2x.png   32x32
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

/* Monochrome, skeuomorphic: a clipped stack of paper on a charcoal tile
   (Apple macOS icon grid: 824px body inside 1024px). */
const APP_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b3b40"/>
      <stop offset="0.55" stop-color="#1f1f23"/>
      <stop offset="1" stop-color="#0c0c0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.62">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="0.18" stop-color="#fff" stop-opacity="0.06"/>
      <stop offset="0.85" stop-color="#000" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0.15" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ececef"/>
    </linearGradient>
    <linearGradient id="paperBack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9d9de"/>
      <stop offset="1" stop-color="#b9b9c0"/>
    </linearGradient>
    <linearGradient id="clip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a4a50"/>
      <stop offset="0.45" stop-color="#16161a"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <linearGradient id="clipShine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="wire" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8e8e96"/>
      <stop offset="0.5" stop-color="#f4f4f6"/>
      <stop offset="1" stop-color="#7a7a82"/>
    </linearGradient>
    <filter id="sheetShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <filter id="bodyShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.3"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>
    </filter>
    <clipPath id="squircle"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath>
    <clipPath id="front"><rect x="0" y="0" width="470" height="560" rx="22"/></clipPath>
  </defs>

  <!-- charcoal tile -->
  <g filter="url(#bodyShadow)"><rect x="100" y="100" width="824" height="824" rx="185" fill="url(#body)"/></g>
  <g clip-path="url(#squircle)">
    <rect x="100" y="100" width="824" height="824" fill="url(#glow)"/>
    <rect x="100" y="100" width="824" height="824" fill="#000" filter="url(#grain)"/>
  </g>
  <rect x="103" y="103" width="818" height="818" rx="182" fill="none" stroke="url(#rim)" stroke-width="6"/>

  <!-- stack of paper: two sheets behind, one in front -->
  <g filter="url(#sheetShadow)">
    <rect x="0" y="0" width="470" height="560" rx="22" fill="url(#paperBack)" transform="translate(292 262) rotate(-7 235 280)"/>
    <rect x="0" y="0" width="470" height="560" rx="22" fill="#e2e2e6" transform="translate(272 252) rotate(4 235 280)"/>
    <g transform="translate(277 246) rotate(-1.5 235 280)">
      <rect x="0" y="0" width="470" height="560" rx="22" fill="url(#paper)"/>
      <rect x="0" y="0" width="470" height="560" fill="#000" filter="url(#grain)" clip-path="url(#front)"/>
      <!-- faint ruling -->
      ${[170, 238, 306, 374, 442].map((y) => `<rect x="44" y="${y}" width="382" height="2.5" fill="#000" opacity="0.08"/>`).join('')}
      <!-- handwritten ink: a heading and two checklist lines -->
      <path d="M52 132 C 92 118, 130 140, 168 126 S 236 118, 270 128" fill="none" stroke="#18181b" stroke-width="15" stroke-linecap="round"/>
      <rect x="50" y="190" width="38" height="38" rx="10" fill="#18181b"/>
      <path d="M59 209 l9 9 l15 -18" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M110 211 C 150 202, 196 220, 238 208 S 300 204, 330 212" fill="none" stroke="#3f3f46" stroke-width="10" stroke-linecap="round"/>
      <rect x="52" y="260" width="34" height="34" rx="9" fill="none" stroke="#18181b" stroke-width="5.5"/>
      <path d="M110 279 C 146 270, 182 286, 220 276 S 262 272, 282 279" fill="none" stroke="#71717a" stroke-width="10" stroke-linecap="round"/>
      <path d="M52 352 C 110 344, 170 360, 236 350 S 330 344, 380 352" fill="none" stroke="#a1a1aa" stroke-width="8" stroke-linecap="round"/>
      <path d="M52 420 C 96 414, 150 426, 200 418" fill="none" stroke="#a1a1aa" stroke-width="8" stroke-linecap="round"/>
    </g>
  </g>

  <!-- binder clip -->
  <g transform="translate(512 292)">
    <path d="M-60 -78 C -60 -128, 60 -128, 60 -78" fill="none" stroke="url(#wire)" stroke-width="11" stroke-linecap="round"/>
    <path d="M-44 -78 C -44 -112, 44 -112, 44 -78" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="4"/>
    <g filter="url(#softShadow)">
      <path d="M-96 -2 L -78 -64 Q -74 -78 -60 -78 L 60 -78 Q 74 -78 78 -64 L 96 -2 Q 98 12 84 12 L -84 12 Q -98 12 -96 -2 Z" fill="url(#clip)"/>
    </g>
    <path d="M-96 -2 L -78 -64 Q -74 -78 -60 -78 L 60 -78 Q 74 -78 78 -64 L 96 -2 Q 98 12 84 12 L -84 12 Q -98 12 -96 -2 Z" fill="url(#clipShine)"/>
    <path d="M-74 -66 L 74 -66" stroke="#fff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
  </g>
</svg>`

/* Menu-bar glyph: a note with two lines, drawn as a mask (black + alpha). */
const glyph = (color) => `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect x="12" y="7" width="40" height="50" rx="9" fill="none" stroke="${color}" stroke-width="5.5"/>
  <rect x="21" y="19" width="22" height="5.5" rx="2.75" fill="${color}"/>
  <rect x="21" y="30" width="22" height="5.5" rx="2.75" fill="${color}"/>
  <rect x="21" y="41" width="14" height="5.5" rx="2.75" fill="${color}"/>
</svg>`

async function render(win, svg, size) {
  const html = `<!doctype html><html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;width:${size}px;height:${size}px">
  </body></html>`
  win.setContentSize(size, size)
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 150))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  win.webContents.setZoomFactor(1)
  const outputs = [
    ['icon.png', APP_ICON, 1024],
    ['tray.png', APP_ICON, 32],
    ['trayTemplate.png', glyph('#000'), 16],
    ['trayTemplate@2x.png', glyph('#000'), 32]
  ]
  for (const [name, svg, size] of outputs) {
    writeFileSync(join(OUT, name), await render(win, svg, size))
    console.log(`  ✓ ${name} (${size}x${size})`)
  }
  app.quit()
})
