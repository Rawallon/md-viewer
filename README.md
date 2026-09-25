# md-viewer

Lightweight Markdown viewer/editor for Windows. Tauri 2 (system WebView2) + Milkdown Crepe (Typora-style WYSIWYG). ~5 MB exe.

## Features

- WYSIWYG editing, or raw source mode (Ctrl+/)
- Menu bar: File / Edit / Format / View / Help (Alt opens it, arrows navigate)
- Copy puts **Markdown** on the clipboard; Ctrl+Shift+C copies rich text
- Export to HTML, print / save as PDF
- Editable keyboard shortcuts: View → Keyboard Shortcuts… (Ctrl+,)
- Drag a `.md` file onto the window, or `md-viewer.exe path\to\file.md`
- **GFM** badge in the status bar when a file uses GitHub Flavored Markdown (tables, task lists, strikethrough, footnotes, autolinks); hover it for details
- Light/dark follows Windows

## Default shortcuts

| Key | Action |
| --- | --- |
| Ctrl+N / Ctrl+O | New / Open |
| Ctrl+S / Ctrl+Shift+S | Save / Save As |
| Ctrl+W / Alt+F4 | Exit (asks if unsaved) |
| Ctrl+Shift+E / Ctrl+P | Export HTML / Print (PDF) |
| Ctrl+C / Ctrl+Shift+C | Copy as Markdown / as rich text |
| Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+K | Bold / Italic / Inline code / Link |
| Ctrl+Alt+0…3 | Paragraph / Heading 1–3 |
| Ctrl+Alt+8 / 7 / 9 | Bullet / Numbered / Task list |
| Ctrl+Shift+B / Ctrl+Alt+C / Ctrl+Alt+T | Quote / Code block / Table |
| Ctrl+/ | Toggle source mode |
| Alt+Z | Toggle word wrap |
| Ctrl+Alt+W | Toggle text width limit (View → Set Text Width… to change it) |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / out / reset |
| Ctrl+click | Open link in browser |

Built-in keys (copy, paste, undo, bold, italic…) keep working even after you rebind them.

## Dev

Needs Rust (MSVC), VS Build Tools (C++ workload) and Node.

```sh
npm install
npm run tauri dev
npm run tauri build   # -> src-tauri/target/release/md-viewer.exe + bundle/nsis installer
```
