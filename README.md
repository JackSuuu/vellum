# Vellum

A floating quick-note window for macOS (also Windows / Linux) in the spirit of
Raycast Notes: one keystroke to open, write Markdown that renders as you type,
close it and carry on. Every note is a plain `.md` file in a folder you choose.

## Features

- **Live Markdown, MarkText's engine.** The editor is **Muya**, the editing core
  of [MarkText](https://github.com/marktext/marktext). Typing `# `, `- `, `1. `,
  `> `, `- [ ] `, `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, ```` ``` ````,
  `---`, links and tables renders in place (Typora-style). Select text for the
  floating format bar; type `/` on an empty line for the quick-insert menu.
- **Isolated title** (Obsidian-style) above the body, stored in the file's
  frontmatter and used as the file name.
- **Start / end time**: the start time and city are fixed when the note is
  created; *Set end time* stamps the end.
- **Global shortcut** (default `⌘.`), show/hide from anywhere. The window stays
  put when you click other apps; closing only hides it.
- **All notes** (`⌘P`), **new note** (`⌘N`), **settings** (`⌘,`), hide (`⌘W` / `Esc`).
- Liquid-glass UI with real macOS vibrancy.

## Storage

Notes live in `~/Documents/Vellum` (changeable in Settings):

```markdown
---
id: note_mvi4plnapo9mgs
title: "Groceries"
created: 2026-10-21T13:09:26.614Z
updated: 2026-10-21T13:09:30.925Z
ended:
location: "Edinburgh, Scotland, United Kingdom"
pinned: false
template: default
---

- [ ] milk
```

Settings are kept in `vellum-data.json` in the app's user-data folder.

## Project layout

```
src/main/        Electron main: window, tray, global shortcut, vault (.md files), IPC
src/preload/     contextBridge API (window.vellum)
src/shared/      types + IPC channel names
src/renderer/    React UI (title bar, note header, notes popover, settings) + Muya editor
vendor/muya/     Muya source from MarkText (MIT) — see VELLUM_PATCHES.md
scripts/         ui-probe.mjs (end-to-end checks), gen-icons.mjs
```

## Commands

```bash
npm install
npm run dev          # development
npm test             # build + end-to-end checks (scripts/ui-probe.mjs all)
npm run dist:mac     # release/Vellum-<version>-arm64.dmg / .zip
npx electron scripts/gen-icons.mjs   # regenerate icons
```

`scripts/ui-probe.mjs` launches the built app in a throw-away profile and
checks layout, drag regions, live-Markdown typing, saving, renaming, note
switching, end time, settings, and the close/re-open lifecycle. It writes
screenshots to `/tmp/vellum-probe-*.png`.

## Notes

- Only one instance runs at a time; opening the app again brings the existing
  window forward. After installing a new build, quit the old one first
  (tray menu → *Quit Vellum*), otherwise the old process keeps running.
- Builds are not code-signed; on first launch use right-click → *Open*.

## Credits

The editor is Muya from MarkText — Copyright (c) 2017-present Luo Ran,
2018-present MarkText Contributors — MIT License (`vendor/muya/LICENSE`,
also shipped as `licenses/muya-marktext-LICENSE.txt` inside the app).
