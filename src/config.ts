/** Static configuration for the overlay app — window labels, defaults, timing. */

import type { ShortcutMap } from "./host/bridge";

export const DEFAULT_API_BASE = "https://warcraft3.gym";

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
