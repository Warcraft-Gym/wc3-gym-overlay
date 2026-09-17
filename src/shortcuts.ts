/**
 * Wires the store's `settings.shortcuts` map to the host's global shortcut
 * registration, and dispatches each action to the right store/window
 * mutation. Re-applying always unregisters everything first, so changing a
 * combo (or re-mounting in dev) never collides with a stale registration.
 */

import { host } from "./host";
import type { ShortcutAction, ShortcutRegistrationResult } from "./host/bridge";
import { WINDOW_OVERLAY } from "./config";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG, SETTINGS, TIMER } from "./store/keys";
import { readKey, updateKey } from "./store/state";
import { isRunning, jumpToStep, pauseTimer, resetTimer, startTimer, type TimedStep } from "./store/timer";

function currentSteps(): TimedStep[] {
  const slug = readKey(SELECTED_BUILD_SLUG);
  if (!slug) return [];
  const cache = readKey(BUILDS_CACHE);
  const build = cache.builds.find((b) => b.slug === slug);
  return build?.steps ?? [];
}

async function dispatch(action: ShortcutAction): Promise<void> {
  const now = Date.now();
  switch (action) {
    case "toggle_overlay":
      await host.toggleWindow(WINDOW_OVERLAY);
      return;
    case "timer_play_pause":
      await updateKey(TIMER, (t) => (isRunning(t) ? pauseTimer(t, now) : startTimer(t, now)));
      return;
    case "timer_reset":
      await updateKey(TIMER, () => resetTimer());
      return;
    case "step_next":
      await updateKey(TIMER, (t) => jumpToStep(t, currentSteps(), 1, now));
      return;
    case "step_prev":
      await updateKey(TIMER, (t) => jumpToStep(t, currentSteps(), -1, now));
      return;
  }
}

export async function applyShortcuts(): Promise<ShortcutRegistrationResult[]> {
  const settings = readKey(SETTINGS);
  await host.unregisterAllShortcuts();
  return host.registerShortcuts(settings.shortcuts, (action) => {
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
