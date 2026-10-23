import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  CodeBlockLanguageSelector,
  EmojiSelector,
  ImageResizeBar,
  ImageToolBar,
  InlineFormatToolbar,
  LinkTools,
  Muya,
  ParagraphQuickInsertMenu,
  PreviewToolBar,
  TableColumnToolbar,
  TableDragBar,
  TableRowColumMenu
} from '@muyajs/core'

/*
 * The editing engine is MarkText's own: Muya (`@muyajs/core`, MIT).
 * Typing `# `, `- `, `1. `, `> `, `- [ ] `, `**bold**`, `` `code` ``, ``` fences,
 * tables … renders in place, exactly like MarkText / Typora.
 *
 * Plugins are registered once on the class (that is how Muya works).
 */
let pluginsRegistered = false
function registerPlugins(): void {
  if (pluginsRegistered) return
  pluginsRegistered = true
  Muya.use(InlineFormatToolbar) // floating B / I / U / S / code / link bar on selection
  Muya.use(LinkTools, {
    jumpClick: (info: { href?: string } | null) => {
      const href = info?.href
      if (href && /^(https?:|mailto:)/i.test(href)) window.open(href, '_blank')
    }
  })
  Muya.use(ParagraphQuickInsertMenu) // type "/" on an empty line
  Muya.use(CodeBlockLanguageSelector)
  Muya.use(EmojiSelector)
  Muya.use(ImageToolBar)
  Muya.use(ImageResizeBar)
  Muya.use(TableColumnToolbar)
  Muya.use(TableDragBar)
  Muya.use(TableRowColumMenu)
  Muya.use(PreviewToolBar)
}

/*
 * MarkText's default macOS key bindings (desktop/src/main/keyboard/keybindingsDarwin.ts).
 * Muya has no built-in shortcuts; MarkText adds them through its app menu.
 * ⌘ is Ctrl on Windows / Linux. Keys are matched by `code`, so they do not
 * depend on the keyboard layout.
 */
type Binding = { mod: true; alt?: boolean; shift?: boolean; code: string; paragraph?: string; format?: string }
const BINDINGS: Binding[] = [
  { mod: true, code: 'Digit0', paragraph: 'paragraph' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ mod: true as const, code: `Digit${n}`, paragraph: `heading ${n}` })),
  { mod: true, code: 'Equal', paragraph: 'upgrade heading' },
  { mod: true, code: 'Minus', paragraph: 'degrade heading' },
  { mod: true, shift: true, code: 'KeyT', paragraph: 'table' },
  { mod: true, alt: true, code: 'KeyC', paragraph: 'pre' },
  { mod: true, alt: true, code: 'KeyQ', paragraph: 'blockquote' },
  { mod: true, alt: true, code: 'KeyM', paragraph: 'mathblock' },
  { mod: true, alt: true, code: 'KeyJ', paragraph: 'html' },
  { mod: true, alt: true, code: 'KeyO', paragraph: 'ol-order' },
  { mod: true, alt: true, code: 'KeyU', paragraph: 'ul-bullet' },
  { mod: true, alt: true, code: 'KeyX', paragraph: 'ul-task' },
  { mod: true, alt: true, code: 'Minus', paragraph: 'hr' },
  { mod: true, code: 'KeyB', format: 'strong' },
  { mod: true, code: 'KeyI', format: 'em' },
  { mod: true, code: 'KeyU', format: 'u' },
  { mod: true, shift: true, code: 'KeyH', format: 'mark' },
  { mod: true, code: 'Backquote', format: 'inline_code' },
  { mod: true, shift: true, code: 'KeyM', format: 'inline_math' },
  { mod: true, code: 'KeyD', format: 'del' },
  { mod: true, code: 'KeyL', format: 'link' },
  { mod: true, shift: true, code: 'KeyR', format: 'clear' }
]

function findBinding(event: KeyboardEvent, isMac: boolean): Binding | undefined {
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!mod) return undefined
  return BINDINGS.find((b) => b.code === event.code && !!b.alt === event.altKey && !!b.shift === event.shiftKey)
}

/**
 * Clean up pasted plain text before Muya parses it:
 * - remove the indentation shared by every line (an indented list would
 *   otherwise become a code block — 4+ leading spaces is code in Markdown);
 * - turn bullets / check boxes copied from other apps into Markdown lists.
 */
export function normalizePastedText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)![0])
  let common = indents[0] ?? ''
  for (const indent of indents) {
    let i = 0
    while (i < common.length && i < indent.length && common[i] === indent[i]) i++
    common = common.slice(0, i)
  }
  return lines
    .map((line) => (line.startsWith(common) ? line.slice(common.length) : line.trimStart()))
    .map((line) =>
      line
        .replace(/^(\s*)[☐□▢◻]\s*/, '$1- [ ] ')
        .replace(/^(\s*)[☑✓✔✅☒]\s*/, '$1- [x] ')
        .replace(/^(\s*)[•◦▪▫●○·‣⁃]\s+/, '$1- ')
    )
    .join('\n')
}

export interface MuyaEditorHandle {
  focus: () => void
  /** Apply pending (frame-batched) edits and return the current markdown. */
  flush: () => string
}

interface MuyaEditorProps {
  /** Changing the key loads a different note. */
  noteKey: string
  markdown: string
  fontSize: number
  onChange: (markdown: string) => void
}

export const MuyaEditor = forwardRef<MuyaEditorHandle, MuyaEditorProps>(function MuyaEditor(
  { noteKey, markdown, fontSize, onChange },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const muyaRef = useRef<Muya | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useImperativeHandle(ref, () => ({
    focus: () => muyaRef.current?.focus(),
    flush: () => {
      const muya = muyaRef.current
      if (!muya) return ''
      muya.flush()
      return muya.getMarkdown()
    }
  }))

  /* Create the editor once. */
  useEffect(() => {
    registerPlugins()
    const host = hostRef.current
    if (!host) return
    const mount = document.createElement('div')
    host.appendChild(mount)

    const muya = new Muya(mount, {
      markdown,
      fontSize,
      lineHeight: 1.65,
      autoPairBracket: true,
      // Off: typing a full `**bold**` would otherwise leave a stray auto-inserted `**`.
      autoPairMarkdownSyntax: false,
      autoPairQuote: true,
      bulletListMarker: '-',
      preferLooseListItem: false,
      hideQuickInsertHint: false,
      spellcheckEnabled: true,
      frontMatter: false,
      superSubScript: false,
      footnote: false
    })
    muya.init()
    // Muya hard-codes `autocorrect="false"`; re-enable the OS text correction
    // that macOS / Windows provide for native text fields.
    muya.domNode.setAttribute('autocorrect', 'on')
    // The parent de-duplicates, so the change fired by setContent is harmless.
    muya.on('json-change', () => onChangeRef.current(muya.getMarkdown()))
    muyaRef.current = muya
    ;(window as unknown as { __muya?: Muya }).__muya = muya

    const isMac = document.body.dataset.platform === 'darwin'
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
      const undo = mod && event.code === 'KeyZ'
      // ⌘⇧Z on macOS, Ctrl+Y (and Ctrl+Shift+Z) elsewhere.
      const redo = mod && ((event.code === 'KeyZ' && event.shiftKey) || (!isMac && event.code === 'KeyY'))
      if (undo || redo) {
        event.preventDefault()
        event.stopPropagation()
        if (redo) muya.redo()
        else muya.undo()
        return
      }

      const binding = findBinding(event, isMac)
      if (!binding) return
      event.preventDefault()
      event.stopPropagation()
      if (binding.paragraph) muya.updateParagraph(binding.paragraph)
      else if (binding.format) muya.format(binding.format)
    }
    // Capture phase, so the binding wins over the editor's own key handling.
    host.addEventListener('keydown', onKeyDown, true)

    // Plain-text paste: re-dispatch the cleaned-up text (see normalizePastedText).
    const onPaste = (event: ClipboardEvent): void => {
      const data = event.clipboardData
      if (!data || (event as ClipboardEvent & { __vellum?: boolean }).__vellum) return
      if (data.types.includes('text/html') || data.types.includes('Files')) return
      const text = data.getData('text/plain')
      const cleaned = normalizePastedText(text)
      if (!text || cleaned === text) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const transfer = new DataTransfer()
      transfer.setData('text/plain', cleaned)
      const again = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
      ;(again as ClipboardEvent & { __vellum?: boolean }).__vellum = true
      event.target?.dispatchEvent(again)
    }
    host.addEventListener('paste', onPaste, true)

    return () => {
      host.removeEventListener('keydown', onKeyDown, true)
      host.removeEventListener('paste', onPaste, true)
      muyaRef.current = null
      muya.destroy()
      host.innerHTML = ''
    }
    // The editor is created once; later notes are loaded with setContent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Load another note. */
  const loadedKey = useRef(noteKey)
  useEffect(() => {
    const muya = muyaRef.current
    if (!muya || loadedKey.current === noteKey) return
    loadedKey.current = noteKey
    muya.setContent(markdown)
    muya.clearHistory()
  }, [noteKey, markdown])

  useEffect(() => {
    muyaRef.current?.setOptions({ fontSize }, true)
  }, [fontSize])

  return <div ref={hostRef} className="editor-host" />
})
