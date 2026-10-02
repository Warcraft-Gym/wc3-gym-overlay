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

/** F003: a freshly-picked-up `LastReplay.w3g` — handed to `watchLastReplay`'s
 *  `onReplay` exactly once per genuinely new game (see that method's doc
 *  comment). `mtimeMs` is the file's own last-modified time (not the time it
 *  was picked up), used as the de-duplication key across restarts. */
export type ReplayEvent = {
  path: string;
  mtimeMs: number;
  bytes: Uint8Array;
};

/** F003: what `watchLastReplay` watches. `autoImport: false` disables
 *  polling entirely (no `stat` calls at all). `replayFolder` — when set —
 *  replaces the auto-detected BattleNet roots: either a folder that
 *  directly contains `LastReplay.w3g`, or one shaped like a BattleNet
 *  folder itself (account-id subfolders, each with `Replays/LastReplay.w3g`).
 *  A folder outside the capability-granted fs scope can be picked (the
 *  native dialog doesn't know about the scope), but every read against it
 *  then fails — surfaced as `lastError` on the status, not a crash; see
 *  `host/tauri.ts` / `host/lastReplayWatcher.ts` and docs/overlay.md. */
export type ReplayWatcherOptions = {
  autoImport: boolean;
  replayFolder: string | null;
};

/** F003: read-only status for the Settings UI's watcher status line.
 *  `watchingFolders` lists the root folder(s) currently being polled (empty
 *  when `autoImport` is off, or none of the roots exist yet).
 *  `lastPickedUpAtMs` is wall-clock time (not the replay's own `mtimeMs`) of
 *  the last time `onReplay` fired. `lastError` is the most recent poll
 *  failure's message (missing root, permission denied, unreadable/partial
 *  file), cleared on the next successful poll. */
export type ReplayWatcherStatus = {
  watchingFolders: string[];
  lastPickedUpAtMs: number | null;
  lastError: string | null;
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
  /** F003: prompts to pick a folder and resolves its path, or `null` if the
   *  user cancelled. Used by Settings' "Choose…" button for the replay
   *  folder override. Tauri: the native dialog with `directory: true`.
   *  Browser: no real folder picker — resolves `?mockFolder=<path>` off the
   *  URL for tests, `null` otherwise. */
  openFolder(): Promise<string | null>;
  /** F003: starts polling for a new `LastReplay.w3g` per `opts` (see
   *  `ReplayWatcherOptions`), calling `onReplay` at most once per poll tick
   *  with the *newest* genuinely-new replay found. Returns `stop()`.
   *  Calling `watchLastReplay` again before `stop()`ing the previous loop
   *  runs both concurrently — callers that want to react to changed `opts`
   *  (see `src/lastReplayWatcher.ts`) must `stop()` the old loop first. */
  watchLastReplay(opts: ReplayWatcherOptions, onReplay: (event: ReplayEvent) => void): () => void;
  /** F003: the most recently started/updated watch loop's status, for the
   *  Settings UI's status line. */
  getReplayWatcherStatus(): ReplayWatcherStatus;
  /** F003: fires whenever the watch loop's status changes (a poll tick, an
   *  error, a new `watchLastReplay`/`stop()` call). Returns an unsubscribe
   *  function. */
  onReplayWatcherStatusChanged(cb: (status: ReplayWatcherStatus) => void): () => void;
  /** F009 (plan-vs-actual-engine): re-reads a replay file by path, for
   *  `reviews/pipeline.ts`'s `retryReview()`; resolves `null` when the
   *  file no longer exists. Tauri: `readFile` + `stat` (the read-file scope
   *  already covers `$DATA/Warcraft III/**` and
   *  `$DOCUMENT/Warcraft III/**`, where every `LastReplay.w3g` this method
   *  is ever called with lives). Browser: there is no real filesystem; it
   *  returns whatever bytes/mtime the most recent `watchLastReplay`
   *  event (or test injection) for that exact path handed over, or `null`
   *  if that path was never seen. */
  readReplayFile(path: string): Promise<{ bytes: Uint8Array; mtimeMs: number } | null>;
}
