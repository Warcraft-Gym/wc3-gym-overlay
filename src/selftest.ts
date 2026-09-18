/**
 * CI/QA hook: when `?selftest=1` is on the URL, or the Rust side reports
 * `WC3GYM_SELFTEST=1` (native launches only, no URL to pass a flag through),
 * print one JSON line per shortcut registration and (from the picker page)
 * one line per declared window, then ask Rust to exit. Forwarding through
 * the `selftest_log` Tauri command (rather than plain `console.log`) means
 * the launcher can capture the lines from the process's stdout instead of
 * scraping the webview console. A no-op whenever the flag is absent.
 */

import { WINDOW_OVERLAY, WINDOW_PICKER } from "./config";
import { host } from "./host";
import type { ShortcutAction, ShortcutRegistrationResult } from "./host/bridge";
import { SETTINGS } from "./store/keys";
import { updateKey } from "./store/state";

export type SelftestPage = "picker" | "overlay";

/** F001 regression guard: after showing the overlay through the real host
 *  API, both windows must report their actual OS focus state, and the
 *  overlay's must be `false` — an activated overlay steals focus from
 *  Warcraft III and pauses the game. `FOCUS_SETTLE_MS` gives the OS window
 *  manager time to settle the (non-)activation before we read it back. */
const FOCUS_SETTLE_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isSelftestEnabled(): Promise<boolean> {
  const urlFlag = new URLSearchParams(location.search).get("selftest") === "1";
  if (urlFlag) return true;
  if (host.kind !== "tauri") return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("selftest_enabled");
  } catch {
    return false;
  }
}

async function logLine(payload: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify(payload);
  if (host.kind === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("selftest_log", { line });
  } else {
    console.log(line);
  }
}

async function logWindowState(label: string): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const win = await WebviewWindow.getByLabel(label);
  if (!win) return;
  await logLine({
    selftest: "window",
    label,
    alwaysOnTop: await win.isAlwaysOnTop(),
    decorations: await win.isDecorated(),
    visible: await win.isVisible(),
  });
}

/**
 * Applies `WC3GYM_SELFTEST_SHORTCUT_OVERRIDE=<action>=<combo>` (native
 * selftest runs only) to the stored settings *before* `applyShortcuts()`
 * runs, so C-403's F9-override selftest run registers a standalone
 * function-key combo without needing a separate localStorage-seeding path.
 * A no-op whenever selftest mode or the override env var is absent.
 */
export async function applySelftestShortcutOverride(): Promise<void> {
  if (host.kind !== "tauri") return;
  if (!(await isSelftestEnabled())) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string | null>("selftest_shortcut_override");
    if (!raw) return;

    const [action, combo] = raw.split("=");
    if (!action || !combo) return;

    await updateKey(SETTINGS, (s) => ({
      ...s,
      shortcuts: { ...s.shortcuts, [action as ShortcutAction]: combo },
    }));
  } catch {
    // Override is a QA-only convenience — never block normal startup on it.
  }
}

/** Call once `applyShortcuts()` has resolved, passing its results. */
export async function runSelftest(
  page: SelftestPage,
  registrations: ShortcutRegistrationResult[],
): Promise<void> {
  if (!(await isSelftestEnabled())) return;

  for (const result of registrations) {
    await logLine({
      selftest: "shortcut",
      action: result.action,
      combo: result.combo,
      registered: result.registered,
    });
  }

  if (page === "picker" && host.kind === "tauri") {
    await logWindowState(WINDOW_PICKER);
    await logWindowState(WINDOW_OVERLAY);

    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await host.showWindow(WINDOW_OVERLAY);
    await delay(FOCUS_SETTLE_MS);

    const overlayWin = await WebviewWindow.getByLabel(WINDOW_OVERLAY);
    if (overlayWin) {
      await logLine({
        selftest: "focus",
        label: WINDOW_OVERLAY,
        shownViaHost: true,
        visible: await overlayWin.isVisible(),
        focused: await overlayWin.isFocused(),
      });
    }

    const pickerWin = await WebviewWindow.getByLabel(WINDOW_PICKER);
    if (pickerWin) {
      await logLine({ selftest: "focus", label: WINDOW_PICKER, focused: await pickerWin.isFocused() });
    }
  }

  if (host.kind === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("selftest_done");
  }
}
