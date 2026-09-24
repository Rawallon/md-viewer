import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./styles.css";

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save, ask, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

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

let crepe: Crepe | null = null;
let filePath: string | null = null;
let savedMarkdown = ""; // baseline to compute dirty state
let sourceMode = false;

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

// ---------- wiring ----------

window.addEventListener(
  "keydown",
  (e) => {
    if (!e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const run = (fn: () => unknown) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    if (k === "s") run(() => cmdSave(e.shiftKey));
    else if (k === "o") run(cmdOpen);
    else if (k === "n") run(cmdNew);
    else if (k === "/") run(() => setSourceMode(!sourceMode));
  },
  true,
);

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

getCurrentWebview().onDragDropEvent(async (event) => {
  if (event.payload.type !== "drop") return;
  const path = event.payload.paths.find((p) => /\.(md|markdown|mdown|mkd|txt)$/i.test(p));
  if (path && (await confirmDiscard())) await openPath(path);
});

appWindow.onCloseRequested(async (event) => {
  if (!(await confirmDiscard())) event.preventDefault();
});

(async () => {
  const startup = await invoke<string | null>("startup_file");
  if (startup) await openPath(startup);
  if (!crepe) await loadDocument(null, ""); // no startup file, or it failed to open
})();
