/**
 * F006 (last-replay-watcher) — wires the store's `settings.autoImport` /
 * `settings.replayFolder` to the host's `watchLastReplay`, and exposes the
 * single subscription point a later feature (F004 of this mission's own
 * numbering — the replay-import pipeline) hooks into to react to a
 * freshly-picked-up replay. Mirrors `shortcuts.ts`'s shape: a top-level
 * module that's free to depend on both `host` and `store/state.ts`, since
 * neither of those depends back on it (unlike `host/lastReplayWatcher.ts`,
 * which cannot — see that module's doc comment).
 */

import { host } from "./host";
import type { ReplayEvent, ReplayWatcherOptions, ReplayWatcherStatus } from "./host/bridge";
import { SETTINGS } from "./store/keys";
import { readKey } from "./store/state";

type ReplayListener = (event: ReplayEvent) => void;

const listeners = new Set<ReplayListener>();

/** The single exported subscription point other features hook into to
 *  react to a freshly-picked-up replay. Returns an unsubscribe function.
 *  Nothing in this feature subscribes yet — the watcher updates the status
 *  (see `host.getReplayWatcherStatus()`) regardless of whether anyone is
 *  listening. */
export function onLastReplay(listener: ReplayListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(event: ReplayEvent): void {
  for (const listener of listeners) listener(event);
}

function currentOpts(): ReplayWatcherOptions {
  const settings = readKey(SETTINGS);
  return { autoImport: settings.autoImport, replayFolder: settings.replayFolder };
}

function optsEqual(a: ReplayWatcherOptions, b: ReplayWatcherOptions): boolean {
  return a.autoImport === b.autoImport && a.replayFolder === b.replayFolder;
}

let stopCurrent: (() => void) | null = null;
let lastOpts: ReplayWatcherOptions | null = null;

/** (Re)starts the poll loop with the settings' current `autoImport` /
 *  `replayFolder`, but only actually restarts the loop (stop + start) when
 *  one of those two values changed — called on every cross-window store
 *  change (`host.onStateChanged`), most of which have nothing to do with
 *  these settings. */
function applyCurrentSettings(): void {
  const opts = currentOpts();
  if (lastOpts && optsEqual(lastOpts, opts)) return;
  lastOpts = opts;
  stopCurrent?.();
  stopCurrent = host.watchLastReplay(opts, notifyListeners);
}

/**
 * Starts the one-and-only `LastReplay.w3g` watcher for this app instance.
 * Call once from the picker window (see `pages/picker/App.tsx`) — the
 * picker is the only window that stays alive (hidden, never closed) for
 * the app's whole lifetime (see `docs/overlay.md`'s troubleshooting
 * section), so a single watcher started there covers the app regardless of
 * whether the overlay window is currently shown. Returns a teardown
 * function; the app itself never calls it (there's nothing to tear down
 * until the process exits), but tests do.
 */
export function startReplayWatcher(): () => void {
  applyCurrentSettings();
  const unlisten = host.onStateChanged(applyCurrentSettings);
  return () => {
    unlisten();
    stopCurrent?.();
    stopCurrent = null;
    lastOpts = null;
  };
}

/** Re-exported for the Settings UI's status line — see
 *  `pages/picker/SettingsModal.tsx`. */
export function getReplayWatcherStatus(): ReplayWatcherStatus {
  return host.getReplayWatcherStatus();
}

export function onReplayWatcherStatusChanged(cb: (status: ReplayWatcherStatus) => void): () => void {
  return host.onReplayWatcherStatusChanged(cb);
}
