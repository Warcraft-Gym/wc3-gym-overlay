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

/** F002: how long after mount the picker waits before checking for an
 *  update, so the check never delays the picker's own first paint. */
export const UPDATE_CHECK_DELAY_MS = 3000;

/** F002: the release workflow (`.github/workflows/overlay-release.yml`)
 *  re-uploads the portable exe under this version-less name on every
 *  release, so it always resolves to the latest build — see that
 *  workflow's "stable-name copies" step. Offered to portable-build users
 *  instead of an in-place install, since the portable exe has no
 *  updater wired up. */
export const PORTABLE_DOWNLOAD_URL =
  "https://github.com/Warcraft-Gym/wc3-gnl-website/releases/latest/download/Warcraft-3-Gym-Overlay-Portable.exe";

/** F002: linked from the banner when an install fails, so the user has a
 *  manual fallback without needing to know a GitHub URL by heart. */
export const RELEASES_PAGE_URL = "https://github.com/Warcraft-Gym/wc3-gnl-website/releases";
