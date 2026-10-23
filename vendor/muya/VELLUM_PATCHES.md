# Local changes to the vendored Muya source

Source: https://github.com/marktext/marktext — `packages/muya` (MIT, see LICENSE),
commit in `UPSTREAM_COMMIT`. Tests, e2e and examples were removed; everything
else is unmodified except:

1. `src/utils/prism/loadLanguage.ts` — Prism language grammars are loaded with
   `import.meta.glob` from this project's `node_modules` instead of the
   monorepo-relative path `../../../node_modules/prismjs/...`, which does not
   exist outside the MarkText repository.
2. `tsconfig.json` copied from upstream so the bundler compiles the legacy
   (`experimentalDecorators`) decorators.
- `src/types/index.d.ts` references `vite/client` types for `import.meta.glob`.
3. `src/block/base/format.ts` — `_normalizeFullWidthMarkers()`: full-width
   markers typed by CJK input methods at the start of a line (`【 】`, `［ ］`,
   `【x】`, `》`) are rewritten to `[ ]`, `[x]`, `>` before Muya's normal
   Markdown conversion, so task lists and quotes also work with a Chinese IME.
4. `src/editor/index.ts` — when an undo / redo operation ends at
   `...meta.checked`, the checkbox is an attachment of the `task-list-item`
   rather than a child, so the generic `find('checked')` lookup missed it and
   the circle kept its old state. Sync that attachment explicitly.
