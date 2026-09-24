import type { CommandRegistry } from "./commands";
import type { MenuDef } from "./menubar";
import { comboFromEvent } from "./keymap";

/** True while a modal owns the keyboard; global shortcuts are ignored. */
export let modalOpen = false;

function modal(title: string): { box: HTMLDivElement; close: () => void } {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal";
  box.innerHTML = `<h2></h2>`;
  box.querySelector("h2")!.textContent = title;
  overlay.append(box);
  document.body.append(overlay);
  modalOpen = true;
  const close = () => {
    overlay.remove();
    modalOpen = false;
  };
  overlay.addEventListener("mousedown", (e) => e.target === overlay && close());
  return { box, close };
}

export function promptText(title: string, placeholder = "", initial = ""): Promise<string | null> {
  return new Promise((resolve) => {
    const { box, close } = modal(title);
    const input = document.createElement("input");
    input.className = "modal-input";
    input.placeholder = placeholder;
    input.value = initial;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    actions.innerHTML = `<button data-v="cancel">Cancel</button><button data-v="ok" class="primary">OK</button>`;
    box.append(input, actions);
    const done = (v: string | null) => {
      close();
      resolve(v);
    };
    actions.addEventListener("click", (e) => {
      const v = (e.target as HTMLElement).dataset.v;
      if (v) done(v === "ok" ? input.value.trim() || null : null);
    });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(input.value.trim() || null);
      if (e.key === "Escape") done(null);
    });
    input.focus();
    input.select();
  });
}

export function openShortcutsDialog(registry: CommandRegistry, menus: MenuDef[]) {
  const { box, close } = modal("Keyboard Shortcuts");
  const list = document.createElement("div");
  list.className = "shortcut-list";
  const note = document.createElement("p");
  note.className = "modal-note";
  note.textContent = "Click a shortcut, then press the new keys. Esc cancels, Backspace clears.";
  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.innerHTML = `<button data-v="reset">Reset all</button><button data-v="close" class="primary">Close</button>`;
  box.append(note, list, actions);
  box.classList.add("wide");

  let capturing: { id: string; btn: HTMLButtonElement } | null = null;

  function render() {
    list.innerHTML = "";
    for (const menu of menus) {
      const h = document.createElement("h3");
      h.textContent = menu.title;
      list.append(h);
      for (const id of menu.items) {
        const cmd = id === "-" ? null : registry.get(id);
        if (!cmd) continue;
        const row = document.createElement("div");
        row.className = "shortcut-row";
        const label = document.createElement("span");
        label.textContent = cmd.label;
        const btn = document.createElement("button");
        btn.className = "shortcut-key";
        btn.textContent = registry.binding(id) || "—";
        btn.addEventListener("click", () => startCapture(id, btn));
        const reset = document.createElement("button");
        reset.className = "shortcut-reset";
        reset.title = `Reset to ${cmd.key || "none"}`;
        reset.textContent = "↺";
        reset.hidden = registry.isDefault(id);
        reset.addEventListener("click", () => {
          registry.reset(id);
          render();
        });
        row.append(label, reset, btn);
        list.append(row);
      }
    }
  }

  function startCapture(id: string, btn: HTMLButtonElement) {
    if (capturing) capturing.btn.classList.remove("capturing");
    capturing = { id, btn };
    btn.classList.add("capturing");
    btn.textContent = "Press keys…";
  }

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (!capturing) {
      if (e.key === "Escape") finish();
      return;
    }
    e.preventDefault();
    if (e.key === "Escape") {
      capturing = null;
      render();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      registry.bind(capturing.id, "");
      capturing = null;
      render();
      return;
    }
    const combo = comboFromEvent(e);
    if (!combo) return; // modifier only, keep waiting
    if (!/^(Ctrl|Alt)\+/.test(combo) && !/^F\d+$/.test(combo) && !/^Shift\+F\d+$/.test(combo)) {
      note.textContent = "Use Ctrl or Alt with a key (or a function key).";
      return;
    }
    const stolen = registry.bind(capturing.id, combo);
    note.textContent = stolen ? `${combo} was removed from “${stolen.label}”.` : `Saved ${combo}.`;
    capturing = null;
    render();
  };
  window.addEventListener("keydown", onKey, true);

  const finish = () => {
    window.removeEventListener("keydown", onKey, true);
    close();
  };
  box.parentElement!.addEventListener("mousedown", (e) => {
    if (e.target === box.parentElement) window.removeEventListener("keydown", onKey, true);
  });
  actions.addEventListener("click", (e) => {
    const v = (e.target as HTMLElement).dataset.v;
    if (v === "reset") {
      registry.reset();
      note.textContent = "All shortcuts reset to defaults.";
      render();
    } else if (v === "close") finish();
  });

  render();
}
