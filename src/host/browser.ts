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
  UpdateInfo,
  WindowBounds,
} from "./bridge";
import { tokenFromCode, unshiftKey } from "../lib/combo";

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

  return matchesKeyToken(key, event);
}

/**
 * Matches the combo's non-modifier token against the event, in order:
 * 1. `event.code` (physical key, Shift-independent — the source of truth
 *    when available),
 * 2. `event.key` case-insensitively (handles named keys like "Escape"),
 * 3. the un-shifted equivalent of `event.key` (a real US keyboard reports
 *    `key: "}"` for `Ctrl+Shift+]`, not `"]"`).
 */
function matchesKeyToken(token: string, event: KeyboardEvent): boolean {
  const wanted = token.toLowerCase();

  const codeToken = tokenFromCode(event.code);
  if (codeToken !== null && codeToken.toLowerCase() === wanted) return true;

  if (event.key.toLowerCase() === wanted) return true;

  return unshiftKey(event.key).toLowerCase() === wanted;
}

/**
 * Test hook (no native equivalent): `?failShortcut=<action>` on the URL
 * makes the browser host report that one action as a failed registration,
 * with the same error shape `tauri.ts` produces for a real OS-level
 * conflict — lets the diagnostics UI (warning text, Re-register) be tested
 * without an actual second application holding the combo. No-op otherwise.
 */
const SIMULATED_REGISTRATION_ERROR = "already registered by another application";

function failShortcutOverride(): string | null {
  return new URLSearchParams(location.search).get("failShortcut");
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

  const failing = failShortcutOverride();
  return entries.map(([action, combo]) =>
    action === failing
      ? { action, combo, registered: false, error: SIMULATED_REGISTRATION_ERROR }
      : { action, combo, registered: true },
  );
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

/**
 * F004: a single hidden `<input type="file">`, created once and left
 * attached to `document.body` for the lifetime of the page — not
 * created-and-removed per call. Two reasons: (1) `openTextFile()` can be
 * called from a real user click and needs a live element to `.click()`;
 * (2) a Playwright test drives this exact element directly via
 * `locator('input[type=file]').setInputFiles(...)`, which requires the
 * element to already exist in the DOM — `setInputFiles` never opens a
 * native dialog (unlike `.click()`), so it works headlessly with no
 * `filechooser` interception needed.
 */
let importFileInput: HTMLInputElement | null = null;

function getImportFileInput(): HTMLInputElement {
  if (importFileInput && document.body.contains(importFileInput)) return importFileInput;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.style.display = "none";
  document.body.appendChild(input);
  importFileInput = input;
  return input;
}

function readFileAsText(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/** F002: a second persistent hidden `<input type="file">`, matching the
 *  pattern above for `openTextFile` but for binary replay imports — kept
 *  separate (rather than reusing `importFileInput`) so its `accept` filter
 *  stays specific to whatever extensions the caller passes, and so a
 *  Playwright test can target it independently of the JSON-import input
 *  via `page.waitForEvent("filechooser")` on the "Import replay" button's
 *  click. */
let importBinaryFileInput: HTMLInputElement | null = null;

function getImportBinaryFileInput(extensions: string[]): HTMLInputElement {
  if (importBinaryFileInput && document.body.contains(importBinaryFileInput)) return importBinaryFileInput;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = extensions.map((ext) => `.${ext}`).join(",");
  input.style.display = "none";
  document.body.appendChild(input);
  importBinaryFileInput = input;
  return input;
}

function readFileAsBytes(file: File): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
}

/** Browser fallback for `saveTextFile` — a Blob download via a throwaway
 *  `<a download>` link, the standard no-dependency way to trigger a save
 *  prompt from script without a native file-system API. */
async function saveTextFile(suggestedName: string, contents: string): Promise<boolean> {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

/** Browser fallback for `openTextFile` — see `getImportFileInput`'s doc
 *  comment for why the input is a persistent singleton rather than created
 *  fresh per call. Resetting `.value` before `.click()` ensures a `change`
 *  event fires even when the same file is picked twice in a row. */
async function openTextFile(): Promise<string | null> {
  const input = getImportFileInput();
  input.value = "";
  return new Promise((resolve) => {
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void readFileAsText(file).then(resolve);
    };
    input.click();
  });
}

/** F002: browser fallback for `openBinaryFile` — same pattern as
 *  `openTextFile` above but resolves raw bytes (`Uint8Array`) instead of
 *  text, for importing a `.w3g` replay. `page.waitForEvent("filechooser")`
 *  intercepts the native chooser that `.click()` opens; Playwright's
 *  `setInputFiles` on the input element itself also works headlessly,
 *  matching the existing `openTextFile` test pattern. */
async function openBinaryFile(
  filters: { name: string; extensions: string[] }[],
): Promise<{ name: string; bytes: Uint8Array } | null> {
  const extensions = filters.flatMap((filter) => filter.extensions);
  const input = getImportBinaryFileInput(extensions);
  input.value = "";
  return new Promise((resolve) => {
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void readFileAsBytes(file).then((bytes) => resolve(bytes ? { name: file.name, bytes } : null));
    };
    input.click();
  });
}

/** F002: the browser host has no updater — always report "no update". */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  return null;
}

/** F002: nothing to install in the browser host — resolves immediately.
 *  Takes no arguments even though `Host#installUpdate` declares an
 *  `onProgress` callback param — there is nothing to report progress on,
 *  and TS allows an implementation with fewer parameters than its
 *  declared function type. */
async function installUpdate(): Promise<void> {
  // No-op — there is no update to download or install.
}

/** F002: the browser host's stand-in for a native app restart. */
async function relaunch(): Promise<void> {
  location.reload();
}

/** F002: the browser host is never the portable build. */
async function isPortableBuild(): Promise<boolean> {
  return false;
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
    openBinaryFile,
    saveTextFile,
    openTextFile,
    checkForUpdate,
    installUpdate,
    relaunch,
    isPortableBuild,
  };
}
