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
  frontmatter. The file itself is named after the creation time
  (`2026-10-21_15-04.md`), so the title can change freely without touching
  the file name.
- **Start / end time**: the start time and city are fixed when the note is
  created; *Set end time* stamps the end.
- **Global shortcut** (default `⌘.`), show/hide from anywhere. The window stays
  put when you click other apps; closing only hides it.
- **All notes** (`⌘K` / `⌘P`), **new note** (`⌘N`), **settings** (`⌘,`), hide (`⌘W` / `Esc`).
- **Location** on its own line under the timestamp, editable.
- **Delete** a note from the switcher with `⌘⌫` (press twice within two seconds
  to confirm).
- Liquid-glass UI with real macOS vibrancy.
- **Light / dark / system appearance.** The default follows the operating
  system and switches live when you change it in the system settings.
- **iCloud Drive sync.** On macOS and Windows, Settings → Notes folder can move
  the vault into iCloud Drive. Because every note is a plain Markdown file, the
  same folder can be opened by any iCloud-capable editor on another Mac or an
  iPhone.

## Storage

Notes live in `~/Documents/Vellum` (changeable in Settings). On macOS and
Windows, **Settings → Notes folder → Use iCloud Drive** moves them to
`iCloud Drive/Vellum` so iCloud keeps the files in sync. You can also use
**Change…** to point Vellum at an existing Obsidian vault inside iCloud Drive;
open that same folder as a vault in Obsidian on your phone. Nested lists are
written with one tab per level, matching Obsidian's indentation.

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

Each note is a file named after its creation time, e.g.
`2026-10-21_15-04.md`. Notes created in the same minute get a `-2`, `-3`, …
suffix so nothing is overwritten.

## Install

| Platform | Download |
| --- | --- |
| macOS (Apple silicon) | [`Vellum-arm64.dmg`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-arm64.dmg) |
| macOS (Intel) | [`Vellum-x64.dmg`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-x64.dmg) |
| Windows (x64 + arm64) | [`Vellum-Setup.exe`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-Setup.exe) |
| Linux (x64) | [`Vellum-x86_64.AppImage`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-x86_64.AppImage) |
| Linux (arm64) | [`Vellum-arm64.AppImage`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-arm64.AppImage) |
| Debian / Ubuntu | [`Vellum-amd64.deb`](https://github.com/JackSuuu/vellum/releases/latest/download/Vellum-amd64.deb) |

The macOS build is ad-hoc signed (no Apple Developer ID), so on first launch
the system will refuse to open it directly — drag Vellum to `/Applications`,
then right-click it and choose **Open**, and confirm. The app then launches
normally from then on.

## Project layout

```
src/main/        Electron main: window, tray, global shortcut, vault (.md files), IPC
src/preload/     contextBridge API (window.vellum)
src/shared/      types + IPC channel names
src/renderer/    React UI (title bar, note header, notes popover, settings) + Muya editor
vendor/muya/     Muya source from MarkText (MIT) — see VELLUM_PATCHES.md
scripts/         ui-probe.mjs (end-to-end checks), gen-icons.mjs
landing/         Static landing page (deploy to Vercel with this as the root dir)
```

## Commands

```bash
npm install
npm run dev          # development
npm test             # build + end-to-end checks (scripts/ui-probe.mjs all)
npm run dist:mac     # release/Vellum-arm64.dmg / Vellum-arm64.zip
npm run dist:win     # release/Vellum-Setup.exe  (+ -x64 / -arm64)
npm run dist:linux   # release/Vellum-<arch>.AppImage / .deb
npx electron scripts/gen-icons.mjs   # regenerate icons
```

Artifact names are fixed (`Vellum-arm64.dmg`, `Vellum-Setup.exe`, …) so the
download links in `landing/index.html` never have to change between releases.

## Releasing

```bash
# 1. bump "version" in package.json
npm run dist:mac

# 2. tag + publish
git tag v0.1.1
git push origin main --tags
gh release create v0.1.1 \
  release/Vellum-arm64.dmg release/Vellum-x64.dmg \
  release/Vellum-Setup.exe release/Vellum-x86_64.AppImage \
  --title "Vellum v0.1.1" --generate-notes

# 3. the landing page download button now resolves via
#    releases/latest/download/Vellum-arm64.dmg
```

`scripts/ui-probe.mjs` launches the built app in a throw-away profile and
checks layout, drag regions, live-Markdown typing, saving, renaming, note
switching, end time, settings, and the close/re-open lifecycle. It writes
screenshots to `/tmp/vellum-probe-*.png`.

## Notes

- Only one instance runs at a time; opening the app again brings the existing
  window forward. After installing a new build, quit the old one first
  (tray menu → *Quit Vellum*), otherwise the old process keeps running.
- Builds are ad-hoc signed (no Developer ID certificate); on first launch use
  right-click → *Open*. A real certificate in the keychain is used automatically
  when one is present.

## Credits

The editor is Muya from MarkText — Copyright (c) 2017-present Luo Ran,
2018-present MarkText Contributors — MIT License (`vendor/muya/LICENSE`,
also shipped as `licenses/muya-marktext-LICENSE.txt` inside the app).
