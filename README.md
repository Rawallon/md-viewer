# md-viewer

Lightweight Markdown viewer/editor for Windows. Tauri 2 (system WebView2) + Milkdown Crepe (Typora-style WYSIWYG).

## Shortcuts

| Key | Action |
| --- | --- |
| Ctrl+O | Open |
| Ctrl+S / Ctrl+Shift+S | Save / Save As |
| Ctrl+N | New |
| Ctrl+/ | Toggle rich / source mode |
| Ctrl+click | Open link in browser |

Drag a `.md` file onto the window to open it. `md-viewer.exe path\to\file.md` opens from CLI.

## Dev

Needs Rust (MSVC) + VS Build Tools (C++ workload) + Node.

```sh
npm install
npm run tauri dev
npm run tauri build   # -> src-tauri/target/release/md-viewer.exe + bundle/nsis installer
```
