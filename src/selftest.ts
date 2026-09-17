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
import type { ShortcutRegistrationResult } from "./host/bridge";

export type SelftestPage = "picker" | "overlay";

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
  }

  if (host.kind === "tauri") {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("selftest_done");
  }
}
