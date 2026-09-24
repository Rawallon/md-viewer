// Shortcut strings look like "Ctrl+Shift+S". Keys come from KeyboardEvent.code,
// so bindings follow physical key position regardless of Shift state.

const STORAGE_KEY = "md-viewer.keymap";

const CODE_NAMES: Record<string, string> = {
  Slash: "/",
  IntlRo: "/", // ABNT2 "/" key
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  NumpadAdd: "Num+",
  NumpadSubtract: "Num-",
  Space: "Space",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

export function comboFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  // AltGr (= Ctrl+Alt on Windows) producing a character is text input, e.g. ² on ABNT2
  if (e.getModifierState("AltGraph") && e.key.length === 1) return null;
  let key: string;
  if (e.code.startsWith("Key")) key = e.code.slice(3);
  else if (e.code.startsWith("Digit")) key = e.code.slice(5);
  else if (CODE_NAMES[e.code]) key = CODE_NAMES[e.code];
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
  return [...mods, key].join("+");
}

export type Overrides = Record<string, string>; // command id -> combo ("" = unbound)

export function loadOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: Overrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable: bindings last for this session only */
  }
}
