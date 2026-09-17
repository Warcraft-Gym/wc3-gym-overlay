/**
 * Browser host implementation — used for `pnpm dev` / plain browser preview
 * where there is no Tauri runtime. Windows are simulated: the current page
 * can hide itself via a `data-hidden` attribute, other "windows" are opened
 * as separate tabs.
 */

import type {
  Host,
  ShortcutAction,
  ShortcutMap,
  ShortcutRegistrationResult,
  WindowBounds,
} from "./bridge";

const BROADCAST_CHANNEL = "wc3gym";
const HIDDEN_ATTR = "data-hidden";

function currentLabel(): string {
  const path = location.pathname.split("/").pop() ?? "";
  return path.replace(/\.html$/, "");
}

async function showWindow(label: string): Promise<void> {
  if (label === currentLabel()) {
    document.documentElement.removeAttribute(HIDDEN_ATTR);
    return;
  }
  window.open(`${label}.html`);
}

async function hideWindow(label: string): Promise<void> {
  if (label === currentLabel()) {
    document.documentElement.setAttribute(HIDDEN_ATTR, "true");
  }
}

async function isWindowVisible(label: string): Promise<boolean> {
  if (label === currentLabel()) {
    return document.documentElement.getAttribute(HIDDEN_ATTR) !== "true";
  }
  return false;
}

async function toggleWindow(label: string): Promise<void> {
  const visible = await isWindowVisible(label);
  if (visible) await hideWindow(label);
  else await showWindow(label);
}

async function startDragging(): Promise<void> {
  // No-op in a plain browser tab — there is no native window to drag.
}

function isMac(): boolean {
  return /Mac|iPhone|iPod|iPad/.test(navigator.platform ?? navigator.userAgent);
}

/** Parses combos like "CommandOrControl+Shift+O" into a matcher over a KeyboardEvent. */
function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));

  const wantCtrl = modifiers.has("commandorcontrol")
    ? !isMac()
    : modifiers.has("ctrl") || modifiers.has("control");
  const wantMeta = modifiers.has("commandorcontrol")
    ? isMac()
    : modifiers.has("command") || modifiers.has("cmd") || modifiers.has("meta");
  const wantShift = modifiers.has("shift");
  const wantAlt = modifiers.has("alt") || modifiers.has("option");

  if (event.ctrlKey !== wantCtrl) return false;
  if (event.metaKey !== wantMeta) return false;
  if (event.shiftKey !== wantShift) return false;
  if (event.altKey !== wantAlt) return false;

  return event.key.toLowerCase() === key.toLowerCase() || event.code.toLowerCase() === `key${key.toLowerCase()}`;
}

async function registerShortcuts(
  map: ShortcutMap,
  onAction: (action: ShortcutAction) => void,
): Promise<ShortcutRegistrationResult[]> {
  const entries = Object.entries(map) as [ShortcutAction, string][];

  const handler = (event: KeyboardEvent) => {
    for (const [action, combo] of entries) {
      if (comboMatches(combo, event)) {
        event.preventDefault();
        onAction(action);
        break;
      }
    }
  };
  window.addEventListener("keydown", handler);
  browserKeydownHandler = handler;

  return entries.map(([action, combo]) => ({ action, combo, registered: true }));
}

let browserKeydownHandler: ((event: KeyboardEvent) => void) | null = null;

async function unregisterAllShortcuts(): Promise<void> {
  if (browserKeydownHandler) {
    window.removeEventListener("keydown", browserKeydownHandler);
    browserKeydownHandler = null;
  }
}

function getChannel(): BroadcastChannel {
  return new BroadcastChannel(BROADCAST_CHANNEL);
}

async function notifyStateChanged(): Promise<void> {
  const channel = getChannel();
  channel.postMessage("state-changed");
  channel.close();
}

function onStateChanged(cb: () => void): () => void {
  const channel = getChannel();
  channel.onmessage = () => cb();
  return () => channel.close();
}

async function openExternal(url: string): Promise<void> {
  window.open(url, "_blank", "noopener");
}

/** No native window to measure/move in a plain browser tab. */
async function getWindowBounds(): Promise<WindowBounds | null> {
  return null;
}

async function setWindowBounds(): Promise<void> {
  // No-op — there is no native window to position.
}

function onWindowBoundsChanged(): () => void {
  return () => {};
}

export function createBrowserHost(): Host {
  return {
    kind: "browser",
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
  };
}
