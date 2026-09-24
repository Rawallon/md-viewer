import type { CommandRegistry } from "./commands";

export interface MenuDef {
  title: string;
  items: (string | "-")[]; // command ids, "-" = separator
}

/**
 * Windows-style menu bar: click to open, hover to switch while open,
 * arrows/Enter/Esc to navigate, Alt alone focuses the first menu.
 */
export function mountMenuBar(root: HTMLElement, menus: MenuDef[], registry: CommandRegistry) {
  let openIndex = -1;
  let activeItem = -1;
  const titles: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];

  // keep editor focus + selection when clicking the menu
  root.addEventListener("mousedown", (e) => e.preventDefault());

  menus.forEach((menu, i) => {
    const wrap = document.createElement("div");
    wrap.className = "menu";
    const title = document.createElement("button");
    title.className = "menu-title";
    title.textContent = menu.title;
    title.addEventListener("click", () => (openIndex === i ? close() : open(i)));
    title.addEventListener("mouseenter", () => openIndex >= 0 && openIndex !== i && open(i));
    const panel = document.createElement("div");
    panel.className = "menu-panel";
    panel.hidden = true;
    wrap.append(title, panel);
    root.append(wrap);
    titles.push(title);
    panels.push(panel);
  });

  function render(i: number) {
    const panel = panels[i];
    panel.innerHTML = "";
    for (const id of menus[i].items) {
      if (id === "-") {
        panel.append(Object.assign(document.createElement("div"), { className: "menu-sep" }));
        continue;
      }
      const cmd = registry.get(id);
      if (!cmd) continue;
      const item = document.createElement("button");
      item.className = "menu-item";
      item.dataset.id = id;
      const check = cmd.checked?.() ? "✓" : "";
      item.innerHTML = `<span class="menu-check">${check}</span><span class="menu-label"></span><span class="menu-key"></span>`;
      item.querySelector(".menu-label")!.textContent = cmd.label;
      item.querySelector(".menu-key")!.textContent = registry.binding(id);
      item.addEventListener("click", () => {
        close();
        cmd.run();
      });
      item.addEventListener("mouseenter", () => highlight(itemsOf(i).indexOf(item)));
      panel.append(item);
    }
  }

  const itemsOf = (i: number) => [...panels[i].querySelectorAll<HTMLButtonElement>(".menu-item")];

  function highlight(n: number) {
    const items = itemsOf(openIndex);
    if (!items.length) return;
    activeItem = (n + items.length) % items.length;
    items.forEach((el, k) => el.classList.toggle("active", k === activeItem));
  }

  function open(i: number, focusFirst = false) {
    if (openIndex >= 0) close();
    openIndex = i;
    render(i);
    panels[i].hidden = false;
    titles[i].classList.add("open");
    activeItem = -1;
    if (focusFirst) highlight(0);
  }

  function close() {
    if (openIndex < 0) return;
    panels[openIndex].hidden = true;
    titles[openIndex].classList.remove("open");
    openIndex = -1;
  }

  document.addEventListener("mousedown", (e) => {
    if (openIndex >= 0 && !root.contains(e.target as Node)) close();
  });
  window.addEventListener("blur", close);

  // Alt tap (no other key in between) toggles the menu
  let altAlone = false;
  window.addEventListener(
    "keydown",
    (e) => {
      altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey;
      if (openIndex < 0) return;
      const handled = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Escape"];
      if (!handled.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "ArrowDown") highlight(activeItem + 1);
      else if (e.key === "ArrowUp") highlight(activeItem - 1);
      else if (e.key === "ArrowLeft") open((openIndex - 1 + menus.length) % menus.length, true);
      else if (e.key === "ArrowRight") open((openIndex + 1) % menus.length, true);
      else if (e.key === "Escape") close();
      else if (e.key === "Enter") itemsOf(openIndex)[activeItem]?.click();
    },
    true,
  );
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt" && altAlone) {
      e.preventDefault();
      openIndex >= 0 ? close() : open(0, true);
    }
    altAlone = false;
  });

  return { close };
}
