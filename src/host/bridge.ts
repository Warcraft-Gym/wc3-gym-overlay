/**
 * Host abstraction — the overlay app runs either inside a Tauri webview
 * (native windows, global shortcuts, OS opener) or a plain browser tab
 * (dev preview / fallback). Every host-specific capability goes through
 * this interface so the rest of the app never branches on the runtime.
 */

export type ShortcutAction =
  | "toggle_overlay"
  | "timer_play_pause"
  | "timer_reset"
  | "step_next"
  | "step_prev";

export type ShortcutMap = Record<ShortcutAction, string>;

export type ShortcutRegistrationResult = {
  action: ShortcutAction;
  combo: string;
  registered: boolean;
  error?: string;
};

export type WindowBounds = { x: number; y: number; width: number; height: number };

/** F002: an update the host found available. `portable` is true when the
 *  running build has no updater (the portable exe) — the UI should offer
 *  `downloadUrl` instead of an in-place install. */
export type UpdateInfo = {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  portable: boolean;
  downloadUrl?: string;
};

/** F002: progress reported while `installUpdate` downloads the update.
 *  `contentLength` is `null` when the server didn't report a size. */
export type UpdateProgress = {
  downloaded: number;
  contentLength: number | null;
};

export interface Host {
  readonly kind: "tauri" | "browser";
  showWindow(label: string): Promise<void>;
  hideWindow(label: string): Promise<void>;
  toggleWindow(label: string): Promise<void>;
  isWindowVisible(label: string): Promise<boolean>;
  startDragging(): Promise<void>;
  registerShortcuts(
    map: ShortcutMap,
    onAction: (action: ShortcutAction) => void,
  ): Promise<ShortcutRegistrationResult[]>;
  unregisterAllShortcuts(): Promise<void>;
  notifyStateChanged(): Promise<void>;
  onStateChanged(cb: () => void): () => void;
  openExternal(url: string): Promise<void>;
  /** Current window position/size, or null when unsupported (browser host). */
  getWindowBounds(): Promise<WindowBounds | null>;
  setWindowBounds(bounds: WindowBounds): Promise<void>;
  /** Fires whenever the current window moves or is resized. No-op
   *  unsubscribe / never fires in the browser host. */
  onWindowBoundsChanged(cb: () => void): () => void;
  /** F004: prompts to save `contents` as a text file named `suggestedName`.
   *  Tauri: the native save dialog + `writeTextFile`. Browser: a Blob
   *  download. Resolves `true` once written, `false` if the user cancelled
   *  the dialog (browser mode has no cancel path — it always resolves
   *  `true`). */
  saveTextFile(suggestedName: string, contents: string): Promise<boolean>;
  /** F004: prompts to pick a text file and resolves its contents, or `null`
   *  if the user cancelled. Tauri: the native open dialog + `readTextFile`.
   *  Browser: a hidden `<input type="file">`. */
  openTextFile(): Promise<string | null>;
  /** F002: prompts to pick a binary file matching `filters` and resolves
   *  its name + raw bytes, or `null` if the user cancelled. Tauri: the
   *  native open dialog + `readFile` (scoped by `fs:allow-read-file`).
   *  Browser: a hidden `<input type="file">`. Used for importing a
   *  Warcraft III `.w3g` replay. */
  openBinaryFile(
    filters: { name: string; extensions: string[] }[],
  ): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** F002: resolves the available update, or `null` when already up to
   *  date. Browser host always resolves `null` — there is no updater. */
  checkForUpdate(): Promise<UpdateInfo | null>;
  /** F002: downloads + installs the update found by the last
   *  `checkForUpdate()` call, reporting progress via `onProgress`. Browser
   *  host resolves immediately without downloading anything. */
  installUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void>;
  /** F002: restarts the app after an install. Browser host reloads the
   *  page instead, matching the "come back on the new version" effect. */
  relaunch(): Promise<void>;
  /** F002: true when running the portable exe, which has no updater
   *  wired up — the UI should offer a manual download instead. */
  isPortableBuild(): Promise<boolean>;
}
