/**
 * Wires the store's `settings.shortcuts` map to the host's global shortcut
 * registration, and dispatches each action to the right store/window
 * mutation. Re-applying always unregisters everything first, so changing a
 * combo (or re-mounting in dev) never collides with a stale registration.
 */

import { host } from "./host";
import type { ShortcutAction, ShortcutMap, ShortcutRegistrationResult } from "./host/bridge";
import { W3C_SCOUTING_ENABLED, WINDOW_OPPONENT, WINDOW_OVERLAY } from "./config";
import { resolveSelectedSteps } from "./data/selectedBuildSteps";
import { reset, stepNext, stepPrev, togglePlayPause } from "./lib/timerActions";
import { SELECTED_BUILD_SLUG, SETTINGS } from "./store/keys";
import { readKey } from "./store/state";
import type { TimedStep } from "./store/timer";

function currentSteps(): TimedStep[] {
  const slug = readKey(SELECTED_BUILD_SLUG);
  return resolveSelectedSteps(slug);
}

async function dispatch(action: ShortcutAction): Promise<void> {
  switch (action) {
    case "toggle_overlay":
      await host.toggleWindow(WINDOW_OVERLAY);
      return;
    case "toggle_opponent":
      await host.toggleWindow(WINDOW_OPPONENT);
      return;
    case "timer_play_pause":
      await togglePlayPause();
      return;
    case "timer_reset":
      await reset();
      return;
    case "step_next":
      await stepNext(currentSteps());
      return;
    case "step_prev":
      await stepPrev(currentSteps());
      return;
  }
}

/** The shortcuts this build offers: the opponent card's only while the
 *  scouting features are on (see W3C_SCOUTING_ENABLED). */
export function activeShortcuts(map: ShortcutMap, scouting = W3C_SCOUTING_ENABLED): ShortcutMap {
  if (scouting) return map;
  return Object.fromEntries(Object.entries(map).filter(([action]) => action !== "toggle_opponent")) as ShortcutMap;
}

export async function applyShortcuts(): Promise<ShortcutRegistrationResult[]> {
  const settings = readKey(SETTINGS);
  await host.unregisterAllShortcuts();
  if (!settings.shortcutsEnabled) return [];
  return host.registerShortcuts(activeShortcuts(settings.shortcuts), (action) => {
    void dispatch(action);
  });
}

/** Displays a combo as `Ctrl+Shift+…` on Windows/Linux, `⌘⇧…` on macOS. */
export function formatCombo(combo: string): string {
  const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform ?? navigator.userAgent);
  const symbols: Record<string, string> = isMac
    ? { commandorcontrol: "⌘", command: "⌘", cmd: "⌘", shift: "⇧", alt: "⌥", option: "⌥", ctrl: "⌃", control: "⌃" }
    : { commandorcontrol: "Ctrl", command: "Ctrl", cmd: "Ctrl", shift: "Shift", alt: "Alt", option: "Alt", ctrl: "Ctrl", control: "Ctrl" };

  const parts = combo.split("+").map((part) => symbols[part.toLowerCase()] ?? part);
  return isMac ? parts.join("") : parts.join("+");
}
