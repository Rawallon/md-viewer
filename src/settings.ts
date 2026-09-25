const STORAGE_KEY = "md-viewer.settings";

export interface Settings {
  /** cap the text column at `width` px (text only, excludes side padding) */
  limitWidth: boolean;
  width: number;
  wordWrap: boolean;
}

export const WIDTH_MIN = 300;
export const WIDTH_MAX = 4000;
export const WIDTH_DEFAULT = 780;

const DEFAULTS: Settings = { limitWidth: true, width: WIDTH_DEFAULT, wordWrap: true };

export const settings: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
  applySettings();
}

/** Reflect settings in the DOM: CSS var + body classes + textarea wrap. */
export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--content-width", `${settings.width}px`);
  document.body.classList.toggle("full-width", !settings.limitWidth);
  document.body.classList.toggle("no-wrap", !settings.wordWrap);
  const source = document.getElementById("source") as HTMLTextAreaElement | null;
  if (source) source.wrap = settings.wordWrap ? "soft" : "off";
}
