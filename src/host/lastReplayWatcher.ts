/**
 * F006 (last-replay-watcher) — the `LastReplay.w3g` poll engine, shared by
 * every real fs backend (today: only Tauri's `plugin-fs` + `api/path`,
 * wired up in `host/tauri.ts`).
 *
 * Kept independent of `store/state.ts` and `host/index.ts` on purpose:
 * `host/tauri.ts` sits on the import path `host/index.ts` walks to build
 * the Tauri `Host`, and `store/state.ts` itself imports `host` (to notify
 * other windows after a write) — importing `store/state.ts` from here would
 * close a real module cycle: `host/index → host/tauri → lastReplayWatcher →
 * store/state → host/index`. Both filesystem access and "which mtimes have
 * already been handled" persistence are injected instead (`ReplayFsOps` /
 * `ReplayPersistence`); the real localStorage-backed persistence (see
 * `host/tauri.ts`) only reuses `store/keys.ts`'s `LAST_REPLAY_HANDLED` type
 * and zod schema — never `store/state.ts`'s read/write helpers — so this
 * module stays a leaf with no store dependency at all.
 *
 * The game overwrites `LastReplay.w3g` after every match, and the exact
 * moment the write finishes isn't documented — so a file is only ever
 * handed to `onReplay` once its size *and* mtime have read back unchanged
 * across two consecutive polls (`LAST_REPLAY_STABILITY_POLLS`), and only
 * once per genuinely new mtime (tracked per path in `ReplayPersistence`,
 * so a restart with an unchanged file fires nothing, and the file already
 * sitting there on first install is recorded as handled, not imported).
 */

import type { ReplayEvent, ReplayWatcherOptions, ReplayWatcherStatus } from "./bridge";

/** How often the watch loop polls every candidate `LastReplay.w3g`. */
export const LAST_REPLAY_POLL_INTERVAL_MS = 5000;

/** How many consecutive polls a candidate's size+mtime must read back
 *  unchanged before it's considered done writing. */
export const LAST_REPLAY_STABILITY_POLLS = 2;

const BATTLENET_RELATIVE_PATH = ["Warcraft III", "BattleNet"] as const;
const LAST_REPLAY_FILE_NAME = "LastReplay.w3g";
const REPLAYS_DIR_NAME = "Replays";

/** Minimal fs surface the engine needs — implemented against
 *  `@tauri-apps/plugin-fs` + `@tauri-apps/api/path` in `host/tauri.ts`,
 *  and against a fake in-memory filesystem in tests. */
export type ReplayFsOps = {
  dataDir(): Promise<string>;
  documentDir(): Promise<string>;
  joinPath(...parts: string[]): Promise<string>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]>;
  stat(path: string): Promise<{ size: number; mtimeMs: number | null }>;
  readFile(path: string): Promise<Uint8Array>;
};

/** Persistence for "which mtime have we already handled for this path",
 *  keyed by absolute path. Backed by a zod-validated store key in
 *  `host/tauri.ts` (see that module's doc comment for why it doesn't go
 *  through `store/state.ts`). */
export type ReplayPersistence = {
  getHandledMtimes(): Record<string, number>;
  setHandledMtimes(value: Record<string, number>): void;
};

type StabilityState = {
  size: number;
  mtimeMs: number;
  stableCount: number;
};

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type LastReplayWatcher = {
  watchLastReplay(opts: ReplayWatcherOptions, onReplay: (event: ReplayEvent) => void): () => void;
  getStatus(): ReplayWatcherStatus;
  onStatusChanged(cb: (status: ReplayWatcherStatus) => void): () => void;
};

export function createLastReplayWatcher(fs: ReplayFsOps, persistence: ReplayPersistence): LastReplayWatcher {
  let status: ReplayWatcherStatus = { watchingFolders: [], lastPickedUpAtMs: null, lastError: null };
  const statusListeners = new Set<(status: ReplayWatcherStatus) => void>();
  // Per-path in-progress stability tracking (poll-to-poll, not persisted —
  // a restart simply starts re-counting from the first poll it sees).
  const stabilityByPath = new Map<string, StabilityState>();
  // Error keys logged in the *previous* tick, so an error condition that's
  // still ongoing isn't re-logged every 5s, but one that cleared and later
  // recurs logs again.
  let previouslyLoggedErrorKeys = new Set<string>();

  function setStatus(next: Partial<ReplayWatcherStatus>): void {
    status = { ...status, ...next };
    for (const listener of statusListeners) listener(status);
  }

  /** Resolves the two auto-detected roots ($DATA and $DOCUMENT +
   *  `Warcraft III/BattleNet`), skipping whichever doesn't exist yet — no
   *  OS detection needed, since a root simply won't exist on the platform
   *  that doesn't use it. */
  async function defaultRoots(report: (key: string, err: unknown) => void): Promise<string[]> {
    const roots: string[] = [];
    // Wrapped in arrow functions rather than passing `fs.dataDir` /
    // `fs.documentDir` straight through: extracting a method off an object
    // loses its `this` binding when called later, which breaks a
    // class-based `ReplayFsOps` (as used in tests) even though the real
    // Tauri wiring (plain exported functions, no `this`) happens to be
    // fine either way.
    const baseDirs: [string, () => Promise<string>][] = [
      ["data", () => fs.dataDir()],
      ["document", () => fs.documentDir()],
    ];
    for (const [name, baseDirFn] of baseDirs) {
      try {
        const base = await baseDirFn();
        const root = await fs.joinPath(base, ...BATTLENET_RELATIVE_PATH);
        if (await fs.exists(root)) roots.push(root);
      } catch (err) {
        report(`root:${name}`, err);
      }
    }
    return roots;
  }

  /** Account-folder candidates under a BattleNet-shaped root: one per
   *  immediate subdirectory, each `<root>/<accountId>/Replays/LastReplay.w3g`. */
  async function candidatesUnderBattleNetRoot(
    root: string,
    report: (key: string, err: unknown) => void,
  ): Promise<string[]> {
    try {
      const entries = await fs.readDir(root);
      const candidates: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory) continue;
        candidates.push(await fs.joinPath(root, entry.name, REPLAYS_DIR_NAME, LAST_REPLAY_FILE_NAME));
      }
      return candidates;
    } catch (err) {
      report(`readdir:${root}`, err);
      return [];
    }
  }

  /** Resolves this tick's watched root(s) and candidate `LastReplay.w3g`
   *  paths, honouring `opts.replayFolder`'s two accepted shapes: a folder
   *  that directly contains `LastReplay.w3g`, or one shaped like a
   *  BattleNet folder (account-id subfolders). An override entirely
   *  replaces the auto-detected roots. */
  async function resolveCandidates(
    opts: ReplayWatcherOptions,
    report: (key: string, err: unknown) => void,
  ): Promise<{ roots: string[]; candidates: string[] }> {
    if (opts.replayFolder) {
      const direct = await fs.joinPath(opts.replayFolder, LAST_REPLAY_FILE_NAME);
      let hasDirect = false;
      try {
        hasDirect = await fs.exists(direct);
      } catch (err) {
        report(`exists:${direct}`, err);
      }
      if (hasDirect) return { roots: [opts.replayFolder], candidates: [direct] };
      return { roots: [opts.replayFolder], candidates: await candidatesUnderBattleNetRoot(opts.replayFolder, report) };
    }

    const roots = await defaultRoots(report);
    const candidateLists = await Promise.all(roots.map((root) => candidatesUnderBattleNetRoot(root, report)));
    return { roots, candidates: candidateLists.flat() };
  }

  async function pollOnce(opts: ReplayWatcherOptions, onReplay: (event: ReplayEvent) => void): Promise<void> {
    const currentErrorKeys = new Set<string>();
    let lastErrorMessage: string | null = null;

    function report(key: string, err: unknown): void {
      currentErrorKeys.add(key);
      lastErrorMessage = describeError(err);
      if (!previouslyLoggedErrorKeys.has(key)) {
        console.warn(`[wc3gym] last-replay watcher: ${key}: ${lastErrorMessage}`);
      }
    }

    const { roots, candidates } = await resolveCandidates(opts, report);
    setStatus({ watchingFolders: roots });

    if (roots.length === 0) {
      report("no-roots", new Error("no Warcraft III replay folder found yet"));
    }

    const handled = persistence.getHandledMtimes();
    let handledDirty = false;
    const ready: { path: string; mtimeMs: number }[] = [];

    for (const path of candidates) {
      let info: { size: number; mtimeMs: number | null };
      try {
        info = await fs.stat(path);
      } catch (err) {
        report(`stat:${path}`, err);
        continue;
      }
      if (info.mtimeMs === null) continue;
      const mtimeMs = info.mtimeMs;

      if (!(path in handled)) {
        // Seen for the first time ever — record it as already-handled so
        // whatever game is already sitting there (first run after install)
        // is never treated as "new".
        handled[path] = mtimeMs;
        handledDirty = true;
        stabilityByPath.delete(path);
        continue;
      }

      if (handled[path] === mtimeMs) {
        // Unchanged since we last handled it — nothing to do. Forget any
        // in-progress stability tracking so a later genuine change starts
        // counting from zero, not from a stale streak.
        stabilityByPath.delete(path);
        continue;
      }

      const previous = stabilityByPath.get(path);
      const stableCount =
        previous && previous.size === info.size && previous.mtimeMs === mtimeMs ? previous.stableCount + 1 : 1;
      stabilityByPath.set(path, { size: info.size, mtimeMs, stableCount });

      if (stableCount >= LAST_REPLAY_STABILITY_POLLS) {
        ready.push({ path, mtimeMs });
      }
    }

    if (handledDirty) persistence.setHandledMtimes({ ...handled });
    previouslyLoggedErrorKeys = currentErrorKeys;
    setStatus({ lastError: currentErrorKeys.size > 0 ? lastErrorMessage : null });

    if (ready.length === 0) return;

    // Several accounts can finish a game in the same tick — only the
    // newest fires; the rest stay pending (still "ready") for a later tick.
    ready.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const winner = ready[0];

    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(winner.path);
    } catch (err) {
      const key = `read:${winner.path}`;
      const message = describeError(err);
      if (!previouslyLoggedErrorKeys.has(key)) {
        console.warn(`[wc3gym] last-replay watcher: ${key}: ${message}`);
      }
      previouslyLoggedErrorKeys = new Set([...previouslyLoggedErrorKeys, key]);
      setStatus({ lastError: message });
      return;
    }

    const next = { ...persistence.getHandledMtimes(), [winner.path]: winner.mtimeMs };
    persistence.setHandledMtimes(next);
    stabilityByPath.delete(winner.path);
    setStatus({ lastPickedUpAtMs: Date.now(), lastError: null });
    onReplay({ path: winner.path, mtimeMs: winner.mtimeMs, bytes });
  }

  function watchLastReplay(opts: ReplayWatcherOptions, onReplay: (event: ReplayEvent) => void): () => void {
    if (!opts.autoImport) {
      setStatus({ watchingFolders: [], lastError: null });
      return () => {};
    }

    let stopped = false;

    function tick(): void {
      if (stopped) return;
      pollOnce(opts, onReplay).catch((err) => {
        // Defensive only — pollOnce itself catches every fs call, so this
        // is never expected to actually run. Still: a failing tick must
        // never take the interval down with it (no unhandled rejection).
        console.warn("[wc3gym] last-replay watcher: unexpected poll failure", err);
        setStatus({ lastError: describeError(err) });
      });
    }

    tick();
    const timer = setInterval(tick, LAST_REPLAY_POLL_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  return {
    watchLastReplay,
    getStatus: () => status,
    onStatusChanged(cb: (status: ReplayWatcherStatus) => void): () => void {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
  };
}
