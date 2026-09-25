import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./styles.css";

import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import {
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import { callCommand, getHTML, insert } from "@milkdown/kit/utils";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readText } from "@tauri-apps/plugin-clipboard-manager";

import { CommandRegistry } from "./commands";
import { mountMenuBar, type MenuDef } from "./menubar";
import { modalOpen, openShortcutsDialog, promptText } from "./dialogs";
import { applySettings, settings, updateSettings, WIDTH_DEFAULT, WIDTH_MAX, WIDTH_MIN } from "./settings";

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "All files", extensions: ["*"] },
];

const editorEl = document.getElementById("editor")!;
const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
const fileNameEl = document.getElementById("file-name")!;
const wordsEl = document.getElementById("words")!;
const modeBtn = document.getElementById("mode") as HTMLButtonElement;
const appWindow = getCurrentWindow();
const webview = getCurrentWebview();

let crepe: Crepe | null = null;
let filePath: string | null = null;
let savedMarkdown = ""; // baseline to compute dirty state
let sourceMode = false;
let zoom = 1;

// ---------- helpers ----------

const baseName = (p: string | null) => (p ? p.split(/[\\/]/).pop()! : "Untitled");
const dirName = (p: string) => p.replace(/[\\/][^\\/]*$/, "");

function resolveLocal(url: string): string {
  if (!filePath || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
  if (/^[a-z]:[\\/]/i.test(url)) return convertFileSrc(url); // absolute windows path
  const parts = dirName(filePath).split(/[\\/]/);
  for (const seg of decodeURI(url).split(/[\\/]/)) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return convertFileSrc(parts.join("\\"));
}

function currentMarkdown(): string {
  return sourceMode ? sourceEl.value : crepe?.getMarkdown() ?? "";
}

function isDirty(): boolean {
  return currentMarkdown() !== savedMarkdown;
}

function refreshStatus() {
  const dirty = isDirty();
  const name = baseName(filePath);
  fileNameEl.textContent = (dirty ? "• " : "") + name;
  fileNameEl.title = filePath ?? "";
  appWindow.setTitle(`${dirty ? "• " : ""}${name} — md-viewer`);
  const words = currentMarkdown().match(/\S+/g)?.length ?? 0;
  wordsEl.textContent = `${words} words`;
}

// ---------- editor lifecycle ----------

async function mountEditor(markdown: string) {
  if (crepe) await crepe.destroy();
  editorEl.innerHTML = "";
  crepe = new Crepe({
    root: editorEl,
    defaultValue: markdown,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: { proxyDomURL: resolveLocal },
      [Crepe.Feature.Placeholder]: { text: "Start writing…" },
    },
  });
  // "-" bullets instead of remark's default "*": smaller diffs for most files
  crepe.editor.config((ctx) => ctx.update(remarkStringifyOptionsCtx, (o) => ({ ...o, bullet: "-" as const })));
  crepe.on((api) => api.markdownUpdated(() => refreshStatus()));
  await crepe.create();
}

async function loadDocument(path: string | null, text: string) {
  filePath = path;
  if (sourceMode) {
    sourceEl.value = text;
    savedMarkdown = text;
  } else {
    await mountEditor(text);
    // Milkdown normalizes on parse; use its output as the clean baseline
    savedMarkdown = crepe!.getMarkdown();
  }
  document.getElementById("scroller")!.scrollTop = 0;
  refreshStatus();
}

async function setSourceMode(on: boolean) {
  if (on === sourceMode) return;
  const md = currentMarkdown();
  const wasDirty = isDirty();
  sourceMode = on;
  if (on) {
    await crepe?.destroy();
    crepe = null;
    editorEl.hidden = true;
    sourceEl.hidden = false;
    sourceEl.value = md;
    sourceEl.focus();
  } else {
    sourceEl.hidden = true;
    editorEl.hidden = false;
    await mountEditor(md);
    // re-baseline so a pure mode round-trip doesn't mark the doc dirty
    if (!wasDirty) savedMarkdown = crepe!.getMarkdown();
  }
  modeBtn.textContent = on ? "Rich" : "Source";
  refreshStatus();
}

// ---------- file ops ----------

async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true;
  return ask(`Discard unsaved changes to ${baseName(filePath)}?`, {
    title: "Unsaved changes",
    kind: "warning",
    okLabel: "Discard",
    cancelLabel: "Cancel",
  });
}

async function openPath(path: string) {
  try {
    const text = await invoke<string>("read_file", { path });
    await loadDocument(path, text);
  } catch (e) {
    await message(String(e), { title: "Open failed", kind: "error" });
  }
}

async function cmdOpen() {
  if (!(await confirmDiscard())) return;
  const path = await open({ multiple: false, directory: false, filters: MD_FILTERS });
  if (typeof path === "string") await openPath(path);
}

async function cmdNew() {
  if (!(await confirmDiscard())) return;
  await loadDocument(null, "");
}

async function cmdSave(saveAs = false): Promise<boolean> {
  let path = filePath;
  if (!path || saveAs) {
    path = await save({ defaultPath: filePath ?? "Untitled.md", filters: MD_FILTERS });
    if (!path) return false;
  }
  const md = currentMarkdown();
  try {
    await invoke("write_file", { path, contents: md });
  } catch (e) {
    await message(String(e), { title: "Save failed", kind: "error" });
    return false;
  }
  filePath = path;
  savedMarkdown = md;
  refreshStatus();
  return true;
}

const EXPORT_CSS = `body{max-width:820px;margin:40px auto;padding:0 20px;font:16px/1.65 "Segoe UI",system-ui,sans-serif;color:#1f1f1f}
pre,code{font-family:"Cascadia Code",Consolas,monospace;background:#f4f4f4;border-radius:4px}code{padding:1px 4px}pre{padding:12px;overflow:auto}pre code{padding:0}
table{border-collapse:collapse}th,td{border:1px solid #d0d0d0;padding:6px 12px}blockquote{margin:0;padding-left:16px;border-left:4px solid #ddd;color:#555}img{max-width:100%}`;

async function cmdExportHtml() {
  await setSourceMode(false);
  const body = crepe!.editor.action(getHTML());
  const title = baseName(filePath).replace(/\.[^.]+$/, "");
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${title}</title><style>${EXPORT_CSS}</style></head>\n<body>\n${body}\n</body></html>\n`;
  const path = await save({
    defaultPath: (filePath ?? "Untitled.md").replace(/\.[^.\\/]+$/, "") + ".html",
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!path) return;
  try {
    await invoke("write_file", { path, contents: html });
  } catch (e) {
    await message(String(e), { title: "Export failed", kind: "error" });
  }
}

// ---------- edit / format ----------

/**
 * Run a Milkdown command in rich mode; no-op in source mode.
 * Takes the command itself: its `.key` is only assigned once an editor loads it.
 */
function md(cmd: { key: Parameters<typeof callCommand>[0] }, payload?: unknown) {
  return () => {
    if (!crepe || sourceMode) return;
    crepe.editor.action(callCommand(cmd.key, payload as never));
    crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  };
}

// Copy/cut puts markdown on the clipboard. Milkdown already serializes the
// selection to markdown as text/plain; drop text/html so other apps paste that.
let richCopy = false;
const markdownOnly = (e: ClipboardEvent) => {
  if (richCopy || !e.clipboardData) return;
  const text = e.clipboardData.getData("text/plain");
  if (!text) return;
  e.clipboardData.clearData();
  e.clipboardData.setData("text/plain", text);
};
editorEl.addEventListener("copy", markdownOnly);
editorEl.addEventListener("cut", markdownOnly);

function copyRich() {
  richCopy = true;
  document.execCommand("copy");
  richCopy = false;
}

async function paste() {
  const text = await readText().catch(() => "");
  if (!text) return;
  if (sourceMode) {
    sourceEl.setRangeText(text, sourceEl.selectionStart, sourceEl.selectionEnd, "end");
    refreshStatus();
  } else crepe?.editor.action(insert(text));
}

function undo() {
  if (sourceMode) document.execCommand("undo");
  else md(undoCommand)();
}

function redo() {
  if (sourceMode) document.execCommand("redo");
  else md(redoCommand)();
}

async function insertLink() {
  if (!crepe || sourceMode) return;
  const href = await promptText("Insert link", "https://…");
  if (!href) return;
  const empty = crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.selection.empty);
  if (empty) crepe.editor.action(insert(`[${href}](${href})`, true));
  else md(toggleLinkCommand, { href })();
}

function toggleTask() {
  if (!crepe || sourceMode) return;
  crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const findItem = () => {
      const $from = view.state.selection.$from;
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === "list_item") return { node, pos: $from.before(d) };
      }
      return null;
    };
    if (!findItem()) callCommand(wrapInBulletListCommand.key)(ctx);
    const item = findItem();
    if (!item) return;
    const checked = item.node.attrs.checked == null ? false : null;
    view.dispatch(view.state.tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked }));
    view.focus();
  });
}

function setZoom(z: number) {
  zoom = Math.min(3, Math.max(0.5, Math.round(z * 10) / 10));
  webview.setZoom(zoom);
  try {
    localStorage.setItem("md-viewer.zoom", String(zoom));
  } catch {
    /* ignore */
  }
}

async function setTextWidth() {
  const input = await promptText(
    `Text width in pixels (${WIDTH_MIN}–${WIDTH_MAX}, default ${WIDTH_DEFAULT})`,
    String(WIDTH_DEFAULT),
    String(settings.width),
  );
  if (input == null) return;
  const n = parseInt(input, 10);
  if (!Number.isFinite(n)) {
    await message(`“${input}” is not a number.`, { title: "Text width", kind: "error" });
    return;
  }
  updateSettings({ width: Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, n)), limitWidth: true });
}

// ---------- commands + menu ----------

const registry = new CommandRegistry();
registry.add(
  { id: "file.new", label: "New", key: "Ctrl+N", run: cmdNew },
  { id: "file.open", label: "Open…", key: "Ctrl+O", run: cmdOpen },
  { id: "file.save", label: "Save", key: "Ctrl+S", run: () => cmdSave() },
  { id: "file.saveAs", label: "Save As…", key: "Ctrl+Shift+S", run: () => cmdSave(true) },
  { id: "file.exportHtml", label: "Export as HTML…", key: "Ctrl+Shift+E", run: cmdExportHtml },
  { id: "file.print", label: "Print / Export PDF…", key: "Ctrl+P", run: () => window.print() },
  // Alt+F4 always works too (handled by Windows)
  { id: "file.exit", label: "Exit", key: "Ctrl+W", run: () => appWindow.close() },

  { id: "edit.undo", label: "Undo", key: "Ctrl+Z", native: true, run: undo },
  { id: "edit.redo", label: "Redo", key: "Ctrl+Y", native: true, run: redo },
  { id: "edit.cut", label: "Cut", key: "Ctrl+X", native: true, run: () => document.execCommand("cut") },
  { id: "edit.copy", label: "Copy (Markdown)", key: "Ctrl+C", native: true, run: () => document.execCommand("copy") },
  { id: "edit.copyRich", label: "Copy as Rich Text", key: "Ctrl+Shift+C", run: copyRich },
  { id: "edit.paste", label: "Paste", key: "Ctrl+V", native: true, run: paste },
  { id: "edit.selectAll", label: "Select All", key: "Ctrl+A", native: true, run: () => document.execCommand("selectAll") },

  { id: "fmt.bold", label: "Bold", key: "Ctrl+B", native: true, run: md(toggleStrongCommand) },
  { id: "fmt.italic", label: "Italic", key: "Ctrl+I", native: true, run: md(toggleEmphasisCommand) },
  { id: "fmt.strike", label: "Strikethrough", key: "Ctrl+Alt+X", run: md(toggleStrikethroughCommand) },
  { id: "fmt.code", label: "Inline Code", key: "Ctrl+E", run: md(toggleInlineCodeCommand) },
  { id: "fmt.link", label: "Link…", key: "Ctrl+K", run: insertLink },
  { id: "fmt.p", label: "Paragraph", key: "Ctrl+Alt+0", run: md(turnIntoTextCommand) },
  { id: "fmt.h1", label: "Heading 1", key: "Ctrl+Alt+1", run: md(wrapInHeadingCommand, 1) },
  { id: "fmt.h2", label: "Heading 2", key: "Ctrl+Alt+2", run: md(wrapInHeadingCommand, 2) },
  { id: "fmt.h3", label: "Heading 3", key: "Ctrl+Alt+3", run: md(wrapInHeadingCommand, 3) },
  { id: "fmt.bullet", label: "Bullet List", key: "Ctrl+Alt+8", run: md(wrapInBulletListCommand) },
  { id: "fmt.ordered", label: "Numbered List", key: "Ctrl+Alt+7", run: md(wrapInOrderedListCommand) },
  { id: "fmt.task", label: "Task List", key: "Ctrl+Alt+9", run: toggleTask },
  { id: "fmt.quote", label: "Quote", key: "Ctrl+Shift+B", run: md(wrapInBlockquoteCommand) },
  { id: "fmt.codeBlock", label: "Code Block", key: "Ctrl+Alt+C", run: md(createCodeBlockCommand) },
  { id: "fmt.table", label: "Table", key: "Ctrl+Alt+T", run: md(insertTableCommand, { row: 3, col: 3 }) },
  { id: "fmt.hr", label: "Horizontal Rule", key: "Ctrl+Alt+H", run: md(insertHrCommand) },

  {
    id: "view.source",
    label: "Source Mode",
    key: "Ctrl+/",
    checked: () => sourceMode,
    run: () => setSourceMode(!sourceMode),
  },
  {
    id: "view.wordWrap",
    label: "Word Wrap",
    key: "Alt+Z",
    checked: () => settings.wordWrap,
    run: () => updateSettings({ wordWrap: !settings.wordWrap }),
  },
  {
    id: "view.limitWidth",
    label: "Limit Text Width",
    key: "Ctrl+Alt+W",
    checked: () => settings.limitWidth,
    run: () => updateSettings({ limitWidth: !settings.limitWidth }),
  },
  { id: "view.textWidth", label: "Set Text Width…", run: setTextWidth },
  { id: "view.zoomIn", label: "Zoom In", key: "Ctrl+=", run: () => setZoom(zoom + 0.1) },
  { id: "view.zoomOut", label: "Zoom Out", key: "Ctrl+-", run: () => setZoom(zoom - 0.1) },
  { id: "view.zoomReset", label: "Reset Zoom", key: "Ctrl+0", run: () => setZoom(1) },
  { id: "view.shortcuts", label: "Keyboard Shortcuts…", key: "Ctrl+,", run: () => openShortcutsDialog(registry, MENUS) },

  {
    id: "help.about",
    label: "About md-viewer",
    run: async () =>
      message(`md-viewer ${await getVersion()}\nLightweight Markdown editor.\ngithub.com/Rawallon/md-viewer`, {
        title: "About",
      }),
  },
);

const MENUS: MenuDef[] = [
  { title: "File", items: ["file.new", "file.open", "-", "file.save", "file.saveAs", "-", "file.exportHtml", "file.print", "-", "file.exit"] },
  { title: "Edit", items: ["edit.undo", "edit.redo", "-", "edit.cut", "edit.copy", "edit.copyRich", "edit.paste", "-", "edit.selectAll"] },
  {
    title: "Format",
    items: [
      "fmt.bold", "fmt.italic", "fmt.strike", "fmt.code", "fmt.link", "-",
      "fmt.p", "fmt.h1", "fmt.h2", "fmt.h3", "-",
      "fmt.bullet", "fmt.ordered", "fmt.task", "fmt.quote", "fmt.codeBlock", "fmt.table", "fmt.hr",
    ],
  },
  { title: "View", items: ["view.source", "-", "view.wordWrap", "view.limitWidth", "view.textWidth", "-", "view.zoomIn", "view.zoomOut", "view.zoomReset", "-", "view.shortcuts"] },
  { title: "Help", items: ["help.about"] },
];

applySettings();
mountMenuBar(document.getElementById("menubar")!, MENUS, registry);

window.addEventListener(
  "keydown",
  (e) => {
    if (!modalOpen) registry.handleKey(e);
  },
  true,
);

// ---------- wiring ----------

// Ctrl+click opens links in the default browser
editorEl.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("a");
  if (!a || !e.ctrlKey) return;
  e.preventDefault();
  const href = a.getAttribute("href") ?? "";
  if (/^(https?|mailto):/i.test(href)) openUrl(href);
});

modeBtn.addEventListener("click", () => setSourceMode(!sourceMode));
sourceEl.addEventListener("input", refreshStatus);

webview.onDragDropEvent(async (event) => {
  if (event.payload.type !== "drop") return;
  const path = event.payload.paths.find((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p));
  if (path && (await confirmDiscard())) await openPath(path);
});

appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard())) event.preventDefault();
});

(async () => {
  try {
    const z = Number(localStorage.getItem("md-viewer.zoom"));
    if (z && z !== 1) setZoom(z);
  } catch {
    /* ignore */
  }
  const startup = await invoke<string | null>("startup_file");
  if (startup) await openPath(startup);
  if (!crepe) await loadDocument(null, ""); // no startup file, or it failed to open
})();
