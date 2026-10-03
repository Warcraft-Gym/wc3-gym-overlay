/** Static configuration for the overlay app — window labels, defaults, timing. */

import type { ShortcutMap } from "./host/bridge";

export const DEFAULT_API_BASE = "https://warcraft-gym.com";

/** Prior defaults that no longer resolve — settings read from disk with one
 *  of these as `apiBase` are migrated to `DEFAULT_API_BASE` (see
 *  `store/keys.ts`'s `settingsSchema`). F004: the site's Vercel preview
 *  domain was the default before the app moved to the production
 *  `warcraft-gym.com` domain (C-047). */
export const LEGACY_API_BASES: readonly string[] = ["https://warcraft3.gym", "https://wc3-gnl-website.vercel.app"];

export const WINDOW_PICKER = "picker";
export const WINDOW_OVERLAY = "overlay";
export const WINDOW_OPPONENT = "opponent";

/** Store polling / clock tick interval, in milliseconds. */
export const TICK_MS = 250;

/** Defaults that shipped earlier: a saved map still holding them is moved to
 *  the current defaults (see `migrateLegacyShortcuts` in store/keys.ts). */
export const LEGACY_DEFAULT_SHORTCUTS = {
  /** 0.1.0 to 0.5.1. */
  toggle_overlay: "CommandOrControl+Shift+O",
  /** 0.6.0 local betas only. */
  toggle_opponent: "CommandOrControl+Shift+M",
} as const;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggle_overlay: "CommandOrControl+Shift+B",
  toggle_opponent: "CommandOrControl+Shift+O",
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
  "https://github.com/Warcraft-Gym/wc3-gym-overlay/releases/latest/download/Warcraft-3-Gym-Overlay-Portable.exe";

/** F002: linked from the banner when an install fails, so the user has a
 *  manual fallback without needing to know a GitHub URL by heart. */
export const RELEASES_PAGE_URL = "https://github.com/Warcraft-Gym/wc3-gym-overlay/releases";

/** Public W3Champions website backend (unofficial, no auth). Used to detect
 *  the player's live 1v1 and scout the opponent. */
export const W3C_API_BASE = "https://website-backend.w3champions.com/api";
/** W3Champions gateway 20 is the (only) live one. */
export const W3C_GATEWAY = 20;
export const W3C_GAME_MODE_1V1 = 1;

/**
 * Opponent card "Army" section (their usual units, read from their replays
 * through our site's replay importer, about 5 site requests per new
 * opponent). Built and tested, but off until it ships as a premium feature
 * (decided 2026-10-03). While off, no replay requests are made and nothing
 * about the army is shown.
 */
export const OPPONENT_ARMY_ENABLED = false;

/**
 * The W3Champions scouting features: the opponent card (its window, the
 * Opponent button and shortcut, the live-game watcher) and the Profile tab,
 * plus their settings. Off until the Gym admins approve them (decided
 * 2026-10-03); while off nothing is shown and no W3Champions request is
 * made for them. Importing a build from a W3Champions match link is not
 * part of this and stays on.
 */
export const W3C_SCOUTING_ENABLED = false;
