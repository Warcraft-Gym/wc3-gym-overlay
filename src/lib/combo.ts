/**
 * Keyboard-shortcut combo strings in the Tauri global-shortcut format, e.g.
 * "CommandOrControl+Shift+O". `comboFromKeyboardEvent` builds one from a
 * `keydown`; `isValidCombo` sanity-checks a combo string built either way;
 * `tokenFromCode` and `unshiftKey` back the browser host's `keydown` matcher
 * (see `host/browser.ts`) so a physical key registers the same combo
 * regardless of whether Shift changes what `event.key` reports.
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

/**
 * Maps a Shift-modified US-keyboard symbol back to the unshifted key that
 * produces it, e.g. "}" (Shift+]) -> "]". A physical `Ctrl+Shift+]` press
 * reports `event.key === "}"` on a real US keyboard, so without this the
 * combo built from that keydown (or matched against a stored combo) would
 * record/require "}" instead of the "]" a user actually sees on their key.
 */
const SHIFTED_KEY_MAP: Record<string, string> = {
  "}": "]",
  "{": "[",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
  "|": "\\",
  _: "-",
  "+": "=",
  "~": "`",
};

export function unshiftKey(key: string): string {
  return SHIFTED_KEY_MAP[key] ?? key;
}

function normalizeKey(key: string): string {
  const base = unshiftKey(key);
  if (base.length === 1) return base.toUpperCase();
  return NAMED_KEYS[base] ?? base;
}

const CODE_TOKEN_MAP: Record<string, string> = {
  BracketRight: "]",
  BracketLeft: "[",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

/**
 * Maps a `KeyboardEvent.code` (physical key, Shift-independent) to the
 * canonical combo token it represents: `"BracketRight"` -> `"]"`,
 * `"KeyO"` -> `"O"`, `"Digit5"` -> `"5"`. Returns null for codes with no
 * single-character token (modifier keys, arrows, etc.) — callers fall back
 * to `event.key` / `unshiftKey(event.key)` for those.
 */
export function tokenFromCode(code: string): string | null {
  if (code in CODE_TOKEN_MAP) return CODE_TOKEN_MAP[code];

  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];

  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];

  return null;
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
