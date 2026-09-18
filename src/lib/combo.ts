/**
 * Keyboard-shortcut combo strings in the Tauri global-shortcut format, e.g.
 * "CommandOrControl+Shift+O". `comboFromKeyboardEvent` builds one from a
 * `keydown`; `isValidCombo` sanity-checks a combo string built either way;
 * `tokenFromCode` and `unshiftKey` back the browser host's `keydown` matcher
 * (see `host/browser.ts`) so a physical key registers the same combo
 * regardless of whether Shift changes what `event.key` reports.
 */

const LONE_MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);

/**
 * Keys the global-shortcut plugin (and the underlying `global-hotkey` crate
 * it wraps — see `parse_key` in its `hotkey.rs`) accepts as a *standalone*
 * shortcut, no Ctrl/Cmd/Alt required, because they don't collide with normal
 * typing. `KeyboardEvent.key` already reports these with the exact spelling
 * the plugin parses (`"F9"`, `"PageUp"`, `"Insert"`, …), so no token mapping
 * is needed beyond membership/pattern checks.
 */
const STANDALONE_KEYS = new Set([
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Pause",
  "ScrollLock",
]);

const FUNCTION_KEY_PATTERN = /^F([1-9]|1[0-9]|2[0-4])$/;

/** True for F1–F24 and the other standalone keys in `STANDALONE_KEYS`. */
export function isStandaloneKey(key: string): boolean {
  return STANDALONE_KEYS.has(key) || FUNCTION_KEY_PATTERN.test(key);
}

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
 * enough — it's too easy to collide with normal typing) — *unless* the key
 * is a standalone key (F1–F24, Insert, Home, PageUp, …), which registers on
 * its own, e.g. `"F9"`, `"PageUp"`. Returns null for a lone modifier
 * keypress or a non-standalone key missing a required modifier.
 */
export function comboFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (LONE_MODIFIER_KEYS.has(event.key.toLowerCase())) return null;

  const hasRequiredModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (!hasRequiredModifier) {
    return isStandaloneKey(event.key) ? event.key : null;
  }

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(normalizeKey(event.key));

  return parts.join("+");
}

/**
 * Explains why a `keydown` was refused as a shortcut, for inline UI
 * feedback in `ShortcutEditor`. Returns null when the press was accepted
 * (handled by `comboFromKeyboardEvent`) or when it's a lone modifier
 * keypress, which is refused silently (a user reaching for Ctrl/Alt/Shift
 * mid-combo shouldn't see an error before they've finished pressing it).
 */
export function explainRefusal(event: KeyboardEvent): string | null {
  if (LONE_MODIFIER_KEYS.has(event.key.toLowerCase())) return null;

  const hasRequiredModifier = event.ctrlKey || event.metaKey || event.altKey;
  if (hasRequiredModifier || isStandaloneKey(event.key)) return null;

  return "Use Ctrl/Alt/⌘ + key, or a function key (F1–F12, Insert, Home, PageUp…)";
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

/**
 * True when `combo` has at least one required modifier and a non-modifier
 * key, or is a single standalone key (F1–F24, Insert, Home, PageUp, …).
 */
export function isValidCombo(combo: string): boolean {
  const parts = combo.split("+").filter(Boolean);
  if (parts.length === 1) return isStandaloneKey(parts[0]);
  if (parts.length < 2) return false;

  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((p) => p.toLowerCase());

  if (MODIFIER_TOKENS.has(key.toLowerCase())) return false;
  if (!modifiers.every((m) => MODIFIER_TOKENS.has(m))) return false;
  if (!modifiers.some((m) => REQUIRED_MODIFIER_TOKENS.has(m))) return false;

  return true;
}
