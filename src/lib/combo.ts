/**
 * Keyboard-shortcut combo strings in the Tauri global-shortcut format, e.g.
 * "CommandOrControl+Shift+O". `comboFromKeyboardEvent` builds one from a
 * `keydown`; `isValidCombo` sanity-checks a combo string built either way.
 */

const LONE_MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);

const NAMED_KEYS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  Escape: "Esc",
};

function normalizeKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return NAMED_KEYS[key] ?? key;
}

/**
 * Builds `CommandOrControl+Shift+X`-style strings from a `keydown` event.
 * Requires at least one of Ctrl/Cmd/Alt as a modifier (Shift alone is not
 * enough — it's too easy to collide with normal typing). Returns null for a
 * lone modifier keypress or a combo missing a required modifier.
 */
export function comboFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (LONE_MODIFIER_KEYS.has(event.key.toLowerCase())) return null;

  const hasRequiredModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (!hasRequiredModifier) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(normalizeKey(event.key));

  return parts.join("+");
}

const MODIFIER_TOKENS = new Set([
  "commandorcontrol",
  "command",
  "cmd",
  "ctrl",
  "control",
  "alt",
  "option",
  "shift",
]);
const REQUIRED_MODIFIER_TOKENS = new Set(["commandorcontrol", "command", "cmd", "ctrl", "control", "alt", "option"]);

/** True when `combo` has at least one required modifier and a non-modifier key. */
export function isValidCombo(combo: string): boolean {
  const parts = combo.split("+").filter(Boolean);
  if (parts.length < 2) return false;

  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((p) => p.toLowerCase());

  if (MODIFIER_TOKENS.has(key.toLowerCase())) return false;
  if (!modifiers.every((m) => MODIFIER_TOKENS.has(m))) return false;
  if (!modifiers.some((m) => REQUIRED_MODIFIER_TOKENS.has(m))) return false;

  return true;
}
