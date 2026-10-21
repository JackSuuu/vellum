/**
 * UI probe: launches the built app (out/) in an isolated profile, runs a
 * scenario, prints measurements and saves screenshots to /tmp/vellum-probe-*.png
 *
 *   node scripts/ui-probe.mjs [basic|typing|notes|settings|theme|persist|all]
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import electronPath from 'electron'

const PORT = 9360
const scenario = process.argv[2] ?? 'basic'
const userData = mkdtempSync(join(tmpdir(), 'vellum-probe-'))
const vault = join(userData, 'vault')

const child = spawn(electronPath, ['out/main/index.js', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, VELLUM_VAULT_PATH: vault }
})
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))

async function stop() {
  const exited = new Promise((r) => child.once('exit', r))
  child.kill('SIGTERM')
  const ok = await Promise.race([exited.then(() => true), sleep(6000).then(() => false)])
  if (!ok) {
    console.log('!! app ignored SIGTERM')
    child.kill('SIGKILL')
  }
}

let ws
let seq = 0
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => reject(new Error(`${method} timeout`)), 30000)
  })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval error')
  return r.result.value
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`/tmp/vellum-probe-${name}.png`, Buffer.from(data, 'base64'))
  console.log(`screenshot /tmp/vellum-probe-${name}.png`)
}
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
}
async function rect(selector) {
  return evaluate(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null })()`
  )
}
async function key(text) {
  for (const ch of text) {
    if (ch === '\n') {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter' })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    } else {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
    }
    await sleep(30)
  }
}
let failures = 0
const check = (label, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? '✓' : '✗'} ${label}${extra ? `  — ${extra}` : ''}`)
}

try {
  let page
  for (let i = 0; i < 80 && !page; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.includes('index.html'))
    } catch {
      /* not up yet */
    }
    if (!page) await sleep(500)
  }
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  for (let i = 0; i < 40; i++) {
    if (await evaluate(`Boolean(document.querySelector('.mu-container'))`)) break
    await sleep(250)
  }
  await evaluate('window.vellum.app.focus()')
  await sleep(600)

  /* ------------------------------------------------------------ layout -- */
  const boxes = JSON.parse(
    await evaluate(`JSON.stringify(Object.fromEntries([...document.querySelectorAll('[data-probe]')].map(el => { const r = el.getBoundingClientRect(); return [el.dataset.probe, [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]] })))`)
  )
  console.log('layout', JSON.stringify(boxes))
  const win = await evaluate('JSON.stringify([innerWidth, innerHeight])')
  console.log('window', win)
  const [W, H] = JSON.parse(win)
  const inside = (b) => b && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W + 1 && b[1] + b[3] <= H + 1 && b[2] > 0 && b[3] > 0
  for (const name of ['titlebar', 'note-header', 'note-title', 'editor', 'statusbar', 'traffic-lights']) check(`${name} visible inside window`, inside(boxes[name]), JSON.stringify(boxes[name]))
  check('title sits below the title bar', boxes['note-title'][1] >= boxes.titlebar[1] + boxes.titlebar[3], '')
  check('editor fills the space between header and status bar', boxes.editor[3] > H * 0.5, `${boxes.editor[3]}px of ${H}`)
  // Drag region: the empty part of the top bar must be draggable, controls must not be.
  const drag = JSON.parse(
    await evaluate(`JSON.stringify({
      area: getComputedStyle(document.querySelector('[data-probe=drag-area]')).getPropertyValue('app-region') || getComputedStyle(document.querySelector('.titlebar'))['-webkit-app-region'],
      bar: getComputedStyle(document.querySelector('.titlebar'))['-webkit-app-region'],
      button: getComputedStyle(document.querySelector('[data-probe=notes-button]'))['-webkit-app-region'],
      light: getComputedStyle(document.querySelector('.light-close'))['-webkit-app-region'],
      hit: (() => { const r = document.querySelector('[data-probe=drag-area]').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el?.dataset?.probe || el?.className })()
    })`)
  )
  check('top bar is a drag region', drag.bar === 'drag', JSON.stringify(drag))
  check('buttons in the top bar stay clickable (no-drag)', drag.button === 'no-drag' && drag.light === 'no-drag')
  check('empty top-bar space is not covered by another element', drag.hit === 'drag-area', drag.hit)
  await shot('initial')

  /* ------------------------------------------------------------ typing -- */
  if (scenario === 'typing' || scenario === 'all') {
    const cases = [
      ['# Heading', 'h1'],
      ['## Sub', 'h2'],
      ['- item', 'ul > li'],
      ['1. first', 'ol > li'],
      ['> quoted', 'blockquote'],
      ['- [ ] task', 'li.mu-task-list-item, li input[type=checkbox]'],
      ['**bold** after', 'strong'],
      ['*it* after', 'em'],
      ['~~gone~~ after', 'del, s'],
      ['`code` after', 'code'],
      ['```', 'pre, .mu-code-block, .mu-fenced-code'],
      ['(paren) x', 'p'],
      ['"quote" x', 'p'],
      ['[link](https://a.b) x', '.mu-link, a'],
      ['---', 'hr, .mu-thematic-break']
    ]
    const editor = await rect('.mu-container')
    await evaluate(`(() => {
      window.__t = []; const t0 = performance.now(); const T = (...a) => window.__t.push([Math.round(performance.now() - t0), ...a])
      const desc = (el) => el ? (el.tagName + '.' + (el.className?.toString?.() || '').slice(0, 30)) : 'null'
      document.addEventListener('focusout', (e) => T('focusout', desc(e.target), '->', desc(e.relatedTarget), new Error().stack.split('\\n').slice(2, 5).join(' | ')), true)
      document.addEventListener('focusin', (e) => T('focusin', desc(e.target)), true)
      window.addEventListener('blur', () => T('window-blur'))
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && n.contains?.(document.activeElement) === false && n.querySelector?.('[contenteditable]')) T('removed-editable', desc(n)) }).observe(document.body, { childList: true, subtree: true })
      const origFetch = window.vellum.notes.update
      return true })()`)
    for (const [input, selector] of cases) {
      await evaluate(`window.__t.push(['---', ${JSON.stringify(input)}]); true`)
      await evaluate(`window.__muya.setContent(''); true`)
      await sleep(80)
      await click(editor.x + 60, editor.y + 22)
      await sleep(80)
      await key(input)
      await key(input === '```' || input === '---' ? '\nZ' : 'Z')
      await sleep(200)
      const res = JSON.parse(
        await evaluate(`JSON.stringify({ ok: !!document.querySelector('.mu-container').querySelector(${JSON.stringify(selector)}), md: window.__muya.getMarkdown(), focus: document.activeElement?.className?.toString().slice(0,40), hasFocus: document.hasFocus(), vis: document.visibilityState })`)
      )
      if (!res.ok || !res.md.includes('Z')) {
        console.log('   focus state:', JSON.stringify({ focus: res.focus, hasFocus: res.hasFocus, vis: res.vis }))
        const t = JSON.parse(await evaluate(`JSON.stringify(window.__t.slice(window.__t.map(e => e[0]).lastIndexOf('---')))`))
        console.log(t.map((e) => '     ' + JSON.stringify(e)).join('\n'))
      }
      // The markdown must be exactly what was typed (no stray auto-paired markers).
      const expected = input === '```' ? '```\nZ\n```' : input === '---' ? '---\n\nZ' : input + 'Z'
      check(`type ${JSON.stringify(input).padEnd(22)} renders ${selector}`, res.ok && res.md.trim() === expected, JSON.stringify(res.md))
    }
    // "/" on an empty line opens MarkText's quick-insert menu.
    await evaluate(`window.__muya.setContent(''); true`)
    await sleep(80)
    await click(editor.x + 60, editor.y + 22)
    await key('/')
    await sleep(300)
    const quick = await evaluate(`(() => { const m = document.querySelector('.mu-quick-insert'); if (!m) return 'missing'; const r = m.getBoundingClientRect(); return getComputedStyle(m).display !== 'none' && r.height > 20 ? 'shown' : 'hidden' })()`)
    check('"/" opens the quick-insert menu', quick === 'shown', quick)
    await shot('quick-insert')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })

    // Selecting text shows the floating format toolbar.
    await evaluate(`window.__muya.setContent('select these words'); true`)
    await sleep(150)
    const para = await rect('.mu-container p')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: para.x + 4, y: para.cy, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: para.x + 120, y: para.cy, button: 'left', buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: para.x + 120, y: para.cy, button: 'left', clickCount: 1 })
    await sleep(400)
    const picker = await evaluate(`(() => { const m = document.querySelector('.mu-format-picker'); if (!m) return 'missing'; const r = m.getBoundingClientRect(); return r.width > 40 && r.height > 10 && getComputedStyle(m).opacity !== '0' ? 'shown' : 'hidden' })()`)
    check('selecting text shows the format toolbar', picker === 'shown', picker)
    await shot('format-bar')

    // MarkText key bindings (⌘ on macOS). modifiers: Alt=1 Ctrl=2 Meta=4 Shift=8
    const combo = async (code, k, modifiers) => {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: k, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, modifiers })
      await sleep(250)
    }
    const meta = 4
    const shortcutCases = [
      ['⌘B on a selection', 'make me bold', async () => {
        const p = await evaluate(`(() => { const el = document.querySelector('.mu-container p'); const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { x: b.left, r: b.right, y: b.top + b.height / 2 } })()`)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x + 1, y: p.y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.r - 1, y: p.y, button: 'left', buttons: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.r - 1, y: p.y, button: 'left', clickCount: 1 })
        await sleep(250)
        await combo('KeyB', 'b', meta)
      }, 'strong', '**make me bold**'],
      ['⌘2 makes a heading', 'title', async () => combo('Digit2', '2', meta), 'h2', '## title'],
      ['⌥⌘X makes a task list', 'todo', async () => combo('KeyX', 'x', meta | 1), 'li input[type=checkbox], li.mu-task-list-item', '- [ ] todo'],
      ['⌥⌘- inserts a horizontal line', '', async () => combo('Minus', '-', meta | 1), 'hr, .mu-thematic-break', '---']
    ]
    for (const [label, text, run, selector, expected] of shortcutCases) {
      await evaluate(`window.__muya.setContent(${JSON.stringify(text)}); true`)
      await sleep(120)
      await click(editor.x + 60, editor.y + 22)
      await sleep(100)
      await run()
      const res = JSON.parse(await evaluate(`JSON.stringify({ ok: !!document.querySelector('.mu-container').querySelector(${JSON.stringify(selector)}), md: window.__muya.getMarkdown() })`))
      check(label, res.ok && res.md.includes(expected), JSON.stringify(res.md))
    }

    await evaluate(`window.__muya.setContent('# Shopping\\n\\n- [ ] milk\\n- [x] eggs\\n\\nSome **bold**, *italic*, \`code\` and [a link](https://example.com).\\n\\n> A quote\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |\\n'); true`)
  }

  /* --------------------------------------------------------- persist -- */
  if (scenario === 'persist' || scenario === 'all') {
    const editor = await rect('.mu-container')
    await evaluate(`window.__muya.setContent(''); true`)
    await sleep(100)
    await click(editor.x + 60, editor.y + 22)
    await key('# Persist me\n- [ ] one')
    await sleep(900)
    const files = readdirSync(vault).filter((f) => f.endsWith('.md'))
    const disk = files.map((f) => readFileSync(join(vault, f), 'utf-8')).join('\n=====\n')
    check('typed markdown is written to the .md file', disk.includes('# Persist me') && disk.includes('- [ ] one'), JSON.stringify(disk.slice(-80)))
    // Title is separate from the body.
    const title = await rect('[data-probe=note-title]')
    await click(title.cx, title.cy)
    await evaluate(`(() => { const el = document.querySelector('[data-probe=note-title]'); el.select(); return true })()`)
    await key('Groceries\n')
    await sleep(600)
    const files2 = readdirSync(vault).filter((f) => f.endsWith('.md'))
    const disk2 = files2.map((f) => readFileSync(join(vault, f), 'utf-8')).join('\n')
    // The file name is the creation date only: `YYYY-MM-DD_HH-MM.md`.
    const named = files2.find((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(-\d+)?\.md$/.test(f))
    check(
      'title is saved in the frontmatter and names the file',
      Boolean(named) && disk2.includes('title: "Groceries"'),
      files2.join(',')
    )
    check('body keeps its content after renaming', disk2.includes('# Persist me'), '')
    // New note, then come back: content must still be there.
    await evaluate(`document.querySelector('[aria-label="New note"]').click(); true`)
    await sleep(800)
    const empty = await evaluate('window.__muya.getMarkdown()')
    check('new note starts empty', empty.trim() === '', JSON.stringify(empty))
    await evaluate(`document.querySelector('[data-probe=notes-button]').click(); true`)
    await sleep(500)
    await shot('notes')
    await evaluate(`[...document.querySelectorAll('.notes-open')].find(b => b.textContent.includes('Groceries'))?.click(); true`)
    await sleep(500)
    const back = await evaluate('window.__muya.getMarkdown()')
    check('switching back restores the note', back.includes('# Persist me') && back.includes('- [ ] one'), JSON.stringify(back))
    // End time.
    await evaluate(`document.querySelector('[data-probe=end-time]').click(); true`)
    await sleep(500)
    const ended = readdirSync(vault)
      .filter((f) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}(-\d+)?\.md$/.test(f))
      .map((f) => readFileSync(join(vault, f), 'utf-8'))
      .join('\n')
    check('end time is stamped', /ended: \d{4}-/.test(ended), ended.match(/ended:.*/)?.[0])
    await shot('persist')
  }

  /* -------------------------------------------------------- settings -- */
  if (scenario === 'settings' || scenario === 'all') {
    await evaluate(`document.querySelector('[data-probe=settings-button]').click(); true`)
    await sleep(400)
    const panel = await rect('[data-probe=settings-panel]')
    check('settings panel opens inside the window', panel && panel.y >= 40 && panel.h > 100, JSON.stringify(panel))
    const hk = await evaluate(`(async () => JSON.stringify(await window.vellum.app.setHotkey('CommandOrControl+.')))()`)
    check('⌘. can be registered as the global shortcut', hk.includes('"ok":true'), hk)
    await shot('settings')
  }

  /* ------------------------------------------------------------ theme -- */
  if (scenario === 'theme' || scenario === 'all') {
    const themeState = () =>
      evaluate(
        `JSON.stringify({
           attr: document.documentElement.dataset.theme,
           colorScheme: document.documentElement.style.colorScheme,
           ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
           editor: getComputedStyle(document.querySelector('.mu-container') || document.body).getPropertyValue('--editor-color').trim()
         })`
      ).then(JSON.parse)

    // The settings panel may still be open from the previous scenario.
    const panelOpen = await evaluate(`!!document.querySelector('[data-probe=settings-panel]')`)
    if (!panelOpen) {
      await evaluate(`document.querySelector('[data-probe=settings-button]').click(); true`)
      await sleep(400)
    }

    const pick = (label) =>
      evaluate(
        `(() => {
           const buttons = [...document.querySelectorAll('.settings-panel .segmented button')]
           const target = buttons.find((b) => b.textContent.trim() === ${JSON.stringify(label)})
           if (!target) return false
           target.click()
           return true
         })()`
      )

    const offered = await evaluate(
      `[...document.querySelectorAll('.settings-panel .segmented button')].map((b) => b.textContent.trim()).join(',')`
    )
    check('the appearance switch offers Light / Dark / System', offered.includes('Light') && offered.includes('Dark') && offered.includes('System'), offered)

    // Light first, so the comparison does not depend on the current system look.
    check('light appearance can be selected', await pick('Light'))
    await sleep(400)
    const light = await themeState()
    check('light mode is applied to the document', light.attr === 'light', JSON.stringify(light))
    check('light mode flips the colour scheme', light.colorScheme === 'light', light.colorScheme)

    check('dark appearance can be selected', await pick('Dark'))
    await sleep(400)
    const dark = await themeState()
    check('dark mode is applied to the document', dark.attr === 'dark', JSON.stringify(dark))
    check('dark mode flips the colour scheme', dark.colorScheme === 'dark', dark.colorScheme)
    check('dark mode uses light text', dark.ink !== light.ink, `${light.ink} -> ${dark.ink}`)
    check('the editor follows dark mode', dark.editor !== light.editor, `${light.editor} -> ${dark.editor}`)
    await shot('theme-dark')

    // Back to the system appearance.
    check('the system appearance can be selected', await pick('System'))
    await sleep(400)
    const back = await themeState()
    check('the appearance can be set back to System', back.attr === 'light' || back.attr === 'dark', JSON.stringify(back))
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`)
    await sleep(300)
  }

  /* ------------------------------------------------------- lifecycle -- */
  if (scenario === 'lifecycle' || scenario === 'all') {
    const state = () => evaluate(`JSON.stringify({ vis: document.visibilityState, md: window.__muya.getMarkdown() })`).then(JSON.parse)
    await evaluate(`window.__muya.setContent('keep me'); true`)
    await sleep(300)
    const settings = JSON.parse(await evaluate(`(async () => JSON.stringify(await window.vellum.settings.get()))()`))
    check('hide-on-blur is off', settings.hideOnBlur === false, `hideOnBlur=${settings.hideOnBlur}`)

    // Red button / ⌘W: the window must only hide, not be destroyed.
    await evaluate(`window.close(); true`).catch(() => null)
    await sleep(800)
    let alive = true
    let afterClose = null
    try {
      afterClose = await state()
    } catch {
      alive = false
    }
    check('closing hides the window instead of destroying it', alive && afterClose?.vis === 'hidden', JSON.stringify(afterClose))

    // Clicking the app icon again = second launch -> must show the same window.
    const second = spawn(electronPath, ['out/main/index.js', `--user-data-dir=${userData}`], {
      stdio: 'ignore',
      env: { ...process.env, VELLUM_VAULT_PATH: vault }
    })
    const secondExit = await Promise.race([new Promise((r) => second.once('exit', (code) => r(code))), sleep(8000).then(() => 'still running')])
    await sleep(800)
    const afterRelaunch = await state().catch(() => null)
    check('a second launch exits and re-shows the existing window', secondExit !== 'still running' && afterRelaunch?.vis === 'visible', `${secondExit} ${JSON.stringify(afterRelaunch)}`)
    check('content survives close + reopen', afterRelaunch?.md?.includes('keep me'), JSON.stringify(afterRelaunch?.md))
    if (secondExit === 'still running') second.kill('SIGKILL')

    // Hide via the app (Esc/close button), then the global-shortcut action.
    await evaluate(`window.vellum.app.hide().then(() => true)`)
    await sleep(500)
    const hidden = await state()
    await evaluate(`window.vellum.app.focus().then(() => true)`)
    await sleep(600)
    const shown = await state()
    check('hide -> show round trip works', hidden.vis === 'hidden' && shown.vis === 'visible', `${hidden.vis} -> ${shown.vis}`)
  }
} catch (error) {
  failures++
  console.error('probe failed:', error)
} finally {
  const tail = log
    .split('\n')
    .filter((l) => /error|Uncaught|exception/i.test(l) && !/devtools|bind\(\)/i.test(l))
    .slice(-10)
    .join('\n')
  if (tail) console.log('--- app errors ---\n' + tail)
  console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
  await stop()
  process.exit(failures ? 1 : 0)
}
