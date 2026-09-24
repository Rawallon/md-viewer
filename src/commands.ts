import { comboFromEvent, loadOverrides, saveOverrides, type Overrides } from "./keymap";

export interface Command {
  id: string;
  label: string;
  /** default shortcut */
  key?: string;
  /**
   * The browser/editor already handles the default key (copy, undo, bold…).
   * We only intercept when the user rebinds it.
   */
  native?: boolean;
  checked?: () => boolean;
  run: () => unknown;
}

export class CommandRegistry {
  private cmds = new Map<string, Command>();
  private overrides: Overrides = loadOverrides();
  private listeners: (() => void)[] = [];

  add(...cmds: Command[]) {
    for (const c of cmds) this.cmds.set(c.id, c);
  }

  get(id: string) {
    return this.cmds.get(id);
  }

  all() {
    return [...this.cmds.values()];
  }

  binding(id: string): string {
    return this.overrides[id] ?? this.cmds.get(id)?.key ?? "";
  }

  isDefault(id: string) {
    return !(id in this.overrides);
  }

  /** Assign combo to id; returns the command it was taken from, if any. */
  bind(id: string, combo: string): Command | undefined {
    let stolen: Command | undefined;
    if (combo) {
      for (const c of this.cmds.values()) {
        if (c.id !== id && this.binding(c.id) === combo) {
          this.overrides[c.id] = "";
          stolen = c;
        }
      }
    }
    if (combo === (this.cmds.get(id)?.key ?? "")) delete this.overrides[id];
    else this.overrides[id] = combo;
    this.persist();
    return stolen;
  }

  reset(id?: string) {
    if (id) delete this.overrides[id];
    else this.overrides = {};
    this.persist();
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  /** Global keydown handler. Returns true if a command ran. */
  handleKey(e: KeyboardEvent): boolean {
    const combo = comboFromEvent(e);
    if (!combo) return false;
    for (const c of this.cmds.values()) {
      if (this.binding(c.id) !== combo) continue;
      if (c.native && combo === c.key) return false; // let the default behavior happen
      e.preventDefault();
      e.stopPropagation();
      c.run();
      return true;
    }
    return false;
  }

  private persist() {
    saveOverrides(this.overrides);
    this.listeners.forEach((fn) => fn());
  }
}
