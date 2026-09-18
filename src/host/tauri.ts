/**
 * Tauri host implementation — real OS windows, global shortcuts, native
 * opener. "Hidden" for the overlay window means the OS window itself is
 * hidden (not a CSS trick), so it never appears in the taskbar/dock.
 */

import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import {
  register,
  unregisterAll,
  isRegistered,
  type ShortcutHandler,
} from "@tauri-apps/plugin-global-shortcut";
import { openUrl } from "@tauri-apps/plugin-opener";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import type {
  Host,
  ShortcutAction,
  ShortcutMap,
  ShortcutRegistrationResult,
  WindowBounds,
} from "./bridge";
import { WINDOW_OVERLAY } from "../config";

/** F004 — the only extension a private build's export/import file uses. */
const BUILD_FILE_FILTER = [{ name: "wc3gym build", extensions: ["json"] }];

const STATE_CHANGED_EVENT = "wc3gym:state-changed";

async function getWindow(label: string): Promise<WebviewWindow> {
  const win = await WebviewWindow.getByLabel(label);
  if (!win) throw new Error(`unknown window: ${label}`);
  return win;
}

/** The overlay must never take keyboard focus — stealing focus from a
 *  focused Warcraft III window pauses the (single-player) game. The window
 *  is also `focusable: false` / `focus: false` in `tauri.conf.json`, but
 *  `setFocus()` would still be a no-op-that-shouldn't-be-called on it, so
 *  it's guarded here too (`toggleWindow` delegates to this, so it inherits
 *  the guard for free). */
async function showWindow(label: string): Promise<void> {
  const win = await getWindow(label);
  await win.show();
  if (label !== WINDOW_OVERLAY) await win.setFocus();
}

async function hideWindow(label: string): Promise<void> {
  const win = await getWindow(label);
  await win.hide();
}

async function isWindowVisible(label: string): Promise<boolean> {
  const win = await getWindow(label);
  return win.isVisible();
}

async function toggleWindow(label: string): Promise<void> {
  const visible = await isWindowVisible(label);
  if (visible) await hideWindow(label);
  else await showWindow(label);
}

async function startDragging(): Promise<void> {
  await getCurrentWindow().startDragging();
}

const REGISTER_TIMEOUT_MS = 3000;

/** Rejects if `promise` doesn't settle within `ms` — the global-shortcut IPC
 *  call can otherwise hang indefinitely (e.g. missing OS permission) and
 *  take the whole `applyShortcuts()` chain down with it. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Registers each shortcut individually so one failure doesn't sink the rest. */
async function registerShortcuts(
  map: ShortcutMap,
  onAction: (action: ShortcutAction) => void,
): Promise<ShortcutRegistrationResult[]> {
  const entries = Object.entries(map) as [ShortcutAction, string][];
  const results: ShortcutRegistrationResult[] = [];
  for (const [action, combo] of entries) {
    const handler: ShortcutHandler = (event) => {
      if (event.state === "Pressed") onAction(action);
    };
    try {
      await withTimeout(register(combo, handler), REGISTER_TIMEOUT_MS, `register(${combo})`);
      const confirmed = await withTimeout(isRegistered(combo), REGISTER_TIMEOUT_MS, `isRegistered(${combo})`);
      results.push({ action, combo, registered: confirmed });
    } catch (err) {
      results.push({
        action,
        combo,
        registered: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function unregisterAllShortcuts(): Promise<void> {
  await unregisterAll();
}

async function notifyStateChanged(): Promise<void> {
  await emit(STATE_CHANGED_EVENT);
}

function onStateChanged(cb: () => void): () => void {
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  listen(STATE_CHANGED_EVENT, () => cb()).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

async function getWindowBounds(): Promise<WindowBounds | null> {
  const win = getCurrentWindow();
  const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  return { x: position.x, y: position.y, width: size.width, height: size.height };
}

async function setWindowBounds(bounds: WindowBounds): Promise<void> {
  const win = getCurrentWindow();
  await win.setPosition(new PhysicalPosition(bounds.x, bounds.y));
  await win.setSize(new PhysicalSize(bounds.width, bounds.height));
}

function onWindowBoundsChanged(cb: () => void): () => void {
  const win = getCurrentWindow();
  let cancelled = false;
  let unlistenMoved: (() => void) | undefined;
  let unlistenResized: (() => void) | undefined;

  win.onMoved(() => cb()).then((fn) => {
    if (cancelled) fn();
    else unlistenMoved = fn;
  });
  win.onResized(() => cb()).then((fn) => {
    if (cancelled) fn();
    else unlistenResized = fn;
  });

  return () => {
    cancelled = true;
    unlistenMoved?.();
    unlistenResized?.();
  };
}

/** Native save dialog + `writeTextFile` on whatever path the user picked.
 *  Resolves `false` (no write attempted) if the dialog is cancelled. */
async function saveTextFile(suggestedName: string, contents: string): Promise<boolean> {
  const path = await save({ defaultPath: suggestedName, filters: BUILD_FILE_FILTER });
  if (!path) return false;
  await writeTextFile(path, contents);
  return true;
}

/** Native open dialog + `readTextFile` on whatever path the user picked.
 *  `open()` without `multiple: true` never resolves an array, but the
 *  return type says it can — narrowed defensively rather than asserted. */
async function openTextFile(): Promise<string | null> {
  const path = await open({ multiple: false, filters: BUILD_FILE_FILTER });
  if (!path || Array.isArray(path)) return null;
  return readTextFile(path);
}

export function createTauriHost(): Host {
  return {
    kind: "tauri",
    showWindow,
    hideWindow,
    toggleWindow,
    isWindowVisible,
    startDragging,
    registerShortcuts,
    unregisterAllShortcuts,
    notifyStateChanged,
    onStateChanged,
    openExternal,
    getWindowBounds,
    setWindowBounds,
    onWindowBoundsChanged,
    saveTextFile,
    openTextFile,
  };
}
