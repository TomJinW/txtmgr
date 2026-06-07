import shortcutManifest from "./shortcutManifest.json";

export type ShortcutAction = keyof typeof shortcutManifest;

// Windows Tauri dev builds can let browser defaults steal native menu
// accelerators, so the frontend mirrors the same manifest as a fallback.
function normalizedKey(value: string) {
  const key = value.toLowerCase();
  if (key === "del") return "delete";
  if (key === "esc") return "escape";
  if (key === "option") return "alt";
  if (key === "cmd") return "meta";
  return key;
}

export function windowsShortcutMatches(event: KeyboardEvent, action: ShortcutAction) {
  const shortcut = shortcutManifest[action].other;
  const parts = shortcut.split("+").map(normalizedKey);
  const expectedKey = parts[parts.length - 1] ?? "";

  if (event.metaKey) return false;
  if (event.ctrlKey !== parts.includes("ctrl")) return false;
  if (event.altKey !== parts.includes("alt")) return false;
  if (event.shiftKey !== parts.includes("shift")) return false;

  return normalizedKey(event.key) === expectedKey;
}
