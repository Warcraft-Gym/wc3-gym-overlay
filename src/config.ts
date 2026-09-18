/** Static configuration for the overlay app — window labels, defaults, timing. */

import type { ShortcutMap } from "./host/bridge";

export const DEFAULT_API_BASE = "https://wc3-gnl-website.vercel.app";

/** Prior defaults that no longer resolve — settings read from disk with one
 *  of these as `apiBase` are migrated to `DEFAULT_API_BASE` (see
 *  `store/keys.ts`'s `settingsSchema`). */
export const LEGACY_API_BASES: readonly string[] = ["https://warcraft3.gym"];

export const WINDOW_PICKER = "picker";
export const WINDOW_OVERLAY = "overlay";

/** Store polling / clock tick interval, in milliseconds. */
export const TICK_MS = 250;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggle_overlay: "CommandOrControl+Shift+O",
  timer_play_pause: "CommandOrControl+Shift+P",
  timer_reset: "CommandOrControl+Shift+R",
  step_next: "CommandOrControl+Shift+]",
  step_prev: "CommandOrControl+Shift+[",
};
