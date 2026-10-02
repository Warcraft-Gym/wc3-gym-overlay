/**
 * F006 (last-replay-watcher) — the poll engine in isolation, against an
 * in-memory fake filesystem (no Tauri plugin involved; see
 * `tauri.lastReplayWatcher.test.ts` for the thin wiring test over the real
 * plugin-fs/path mocks). Fake timers throughout — no real waiting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLastReplayWatcher,
  LAST_REPLAY_POLL_INTERVAL_MS,
  type ReplayFsOps,
  type ReplayPersistence,
} from "./lastReplayWatcher";
import type { ReplayEvent, ReplayWatcherOptions } from "./bridge";

type FakeEntry = { size: number; mtimeMs: number | null; bytes: Uint8Array };

/** In-memory stand-in for `@tauri-apps/plugin-fs` + `@tauri-apps/api/path`:
 *  `dirs` maps a directory path to its immediate subdirectory names,
 *  `files` maps a file path to its current stat/contents. `stat`/`readFile`
 *  throw (matching a real ENOENT) for a path not present in `files`. */
class FakeFs implements ReplayFsOps {
  dataDirPath = "/data";
  documentDirPath = "/doc";
  dirs = new Map<string, string[]>();
  files = new Map<string, FakeEntry>();

  async dataDir(): Promise<string> {
    return this.dataDirPath;
  }
  async documentDir(): Promise<string> {
    return this.documentDirPath;
  }
  async joinPath(...parts: string[]): Promise<string> {
    return parts.join("/");
  }
  async exists(path: string): Promise<boolean> {
    return this.dirs.has(path) || this.files.has(path);
  }
  async readDir(path: string): Promise<{ name: string; isDirectory: boolean }[]> {
    const names = this.dirs.get(path);
    if (!names) throw new Error(`ENOENT: ${path}`);
    return names.map((name) => ({ name, isDirectory: true }));
  }
  async stat(path: string): Promise<{ size: number; mtimeMs: number | null }> {
    const entry = this.files.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    return { size: entry.size, mtimeMs: entry.mtimeMs };
  }
  async readFile(path: string): Promise<Uint8Array> {
    const entry = this.files.get(path);
    if (!entry) throw new Error(`ENOENT: ${path}`);
    return entry.bytes;
  }
}

function createMemoryPersistence(initial: Record<string, number> = {}): ReplayPersistence {
  let store: Record<string, number> = { ...initial };
  return {
    getHandledMtimes: () => ({ ...store }),
    setHandledMtimes: (value) => {
      store = { ...value };
    },
  };
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const DEFAULT_OPTS: ReplayWatcherOptions = { autoImport: true, replayFolder: null };

/** `/data/Warcraft III/BattleNet/<accountId>/Replays/LastReplay.w3g`. */
function accountPath(root: string, accountId: string): string {
  return `${root}/${accountId}/Replays/LastReplay.w3g`;
}

const DATA_BATTLENET_ROOT = "/data/Warcraft III/BattleNet";
const DOC_BATTLENET_ROOT = "/doc/Warcraft III/BattleNet";

/** Drains the real microtask queue repeatedly — `pollOnce` chains many
 *  sequential `await`s (dataDir → exists → readDir → stat → …), more than
 *  a single microtask turn, so one `await` here isn't enough to observe
 *  its result. Promise resolution isn't affected by fake timers, so this
 *  doesn't need `vi.advanceTimersByTimeAsync`. */
async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}

describe("lastReplayWatcher", () => {
  let fs: FakeFs;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fs = new FakeFs();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    warnSpy.mockRestore();
  });

  it("two account folders: both watched, the newest wins", async () => {
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0", "409329138"]);
    const path0 = accountPath(DATA_BATTLENET_ROOT, "0");
    const path1 = accountPath(DATA_BATTLENET_ROOT, "409329138");
    fs.files.set(path0, { size: 10, mtimeMs: 1000, bytes: bytesOf("a") });
    fs.files.set(path1, { size: 10, mtimeMs: 2000, bytes: bytesOf("b") });

    // Both already handled at their current mtime — the watcher has been
    // running a while before anything new happens.
    const persistence = createMemoryPersistence({ [path0]: 1000, [path1]: 2000 });
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    const stop = watcher.watchLastReplay(DEFAULT_OPTS, onReplay);
    await flush();
    expect(onReplay).not.toHaveBeenCalled();
    expect(watcher.getStatus().watchingFolders).toEqual([DATA_BATTLENET_ROOT]);

    // Both accounts finish a game "simultaneously".
    fs.files.set(path0, { size: 20, mtimeMs: 3000, bytes: bytesOf("a2") });
    fs.files.set(path1, { size: 30, mtimeMs: 4000, bytes: bytesOf("b2") });

    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // poll #2: first sight of new mtimes
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // poll #3: stable for 2 polls
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({ path: path1, mtimeMs: 4000 });
    expect(new TextDecoder().decode(onReplay.mock.calls[0][0].bytes)).toBe("b2");

    stop();
  });

  it("unchanged mtime fires nothing; a new mtime fires exactly once after two stable polls", async () => {
    const path = accountPath(DATA_BATTLENET_ROOT, "0");
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(path, { size: 100, mtimeMs: 1000, bytes: bytesOf("old") });

    const persistence = createMemoryPersistence({ [path]: 1000 });
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay(DEFAULT_OPTS, onReplay);
    await flush();

    // Unchanged across several ticks — never fires.
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    // A new game finishes.
    fs.files.set(path, { size: 200, mtimeMs: 2000, bytes: bytesOf("new") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // poll: first sight, not stable yet
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // poll: stable for 2 polls -> fires
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({ path, mtimeMs: 2000 });

    // Never fires again for the same mtime.
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
  });

  it("a growing file (size changes between polls) does not fire until it stops", async () => {
    const path = accountPath(DATA_BATTLENET_ROOT, "0");
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(path, { size: 0, mtimeMs: 1000, bytes: bytesOf("") });

    const persistence = createMemoryPersistence({ [path]: 1000 });
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay(DEFAULT_OPTS, onReplay);
    await flush();

    // The game writes the file in two differently-sized chunks, each with
    // its own mtime bump.
    fs.files.set(path, { size: 100, mtimeMs: 5000, bytes: bytesOf("partial-1") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // first sight of 5000
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    fs.files.set(path, { size: 150, mtimeMs: 6000, bytes: bytesOf("partial-12") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // changed again -> stability resets
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    // The write finishes — size/mtime stop changing.
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // same as previous poll -> stable
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({ path, mtimeMs: 6000 });
  });

  it("records a file already present on first run as handled, without importing it", async () => {
    const path = accountPath(DATA_BATTLENET_ROOT, "0");
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(path, { size: 42, mtimeMs: 999, bytes: bytesOf("pre-existing game") });

    const persistence = createMemoryPersistence(); // nothing handled yet — fresh install
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    const stop = watcher.watchLastReplay(DEFAULT_OPTS, onReplay);

    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(onReplay).not.toHaveBeenCalled();
    expect(persistence.getHandledMtimes()[path]).toBe(999);
    stop();

    // "Restart": a brand new engine instance, same persisted state, file
    // on disk hasn't changed.
    const watcherAfterRestart = createLastReplayWatcher(fs, persistence);
    const onReplayAfterRestart = vi.fn<(event: ReplayEvent) => void>();
    watcherAfterRestart.watchLastReplay(DEFAULT_OPTS, onReplayAfterRestart);
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(onReplayAfterRestart).not.toHaveBeenCalled();
  });

  it("a replayFolder override replaces the auto-detected roots", async () => {
    // Default root has its own file that *would* fire if it were used.
    const defaultPath = accountPath(DATA_BATTLENET_ROOT, "0");
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(defaultPath, { size: 10, mtimeMs: 1000, bytes: bytesOf("default") });

    // Override: a folder that directly contains LastReplay.w3g.
    const overrideFolder = "/custom/replays";
    const overridePath = `${overrideFolder}/LastReplay.w3g`;
    fs.files.set(overridePath, { size: 10, mtimeMs: 1000, bytes: bytesOf("override") });

    const persistence = createMemoryPersistence({ [defaultPath]: 1000, [overridePath]: 1000 });
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay({ autoImport: true, replayFolder: overrideFolder }, onReplay);
    await flush();
    expect(watcher.getStatus().watchingFolders).toEqual([overrideFolder]);

    // The default root's file changes — must be ignored entirely.
    fs.files.set(defaultPath, { size: 20, mtimeMs: 3000, bytes: bytesOf("default-2") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(onReplay).not.toHaveBeenCalled();

    // The override file changes — must fire.
    fs.files.set(overridePath, { size: 20, mtimeMs: 4000, bytes: bytesOf("override-2") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // first sight
    await flush();
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // stable
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({ path: overridePath, mtimeMs: 4000 });
  });

  it("a replayFolder override shaped like a BattleNet folder enumerates its account subfolders", async () => {
    const overrideFolder = "/custom/BattleNet";
    fs.dirs.set(overrideFolder, ["0"]);
    const path = accountPath(overrideFolder, "0");
    fs.files.set(path, { size: 10, mtimeMs: 1000, bytes: bytesOf("x") });

    const persistence = createMemoryPersistence();
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay({ autoImport: true, replayFolder: overrideFolder }, onReplay);
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 2);
    await flush();

    // First sight records it as handled, doesn't fire (same first-run rule
    // applies to an override folder).
    expect(onReplay).not.toHaveBeenCalled();
    expect(persistence.getHandledMtimes()[path]).toBe(1000);
  });

  it("autoImport: false never calls stat, and reports no watched folders", async () => {
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(accountPath(DATA_BATTLENET_ROOT, "0"), { size: 1, mtimeMs: 1, bytes: bytesOf("x") });
    const statSpy = vi.spyOn(fs, "stat");

    const watcher = createLastReplayWatcher(fs, createMemoryPersistence());
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay({ autoImport: false, replayFolder: null }, onReplay);

    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();

    expect(statSpy).not.toHaveBeenCalled();
    expect(onReplay).not.toHaveBeenCalled();
    expect(watcher.getStatus().watchingFolders).toEqual([]);
  });

  it("logs a persistent stat error once, keeps polling, and surfaces it on the status — clearing once it resolves", async () => {
    const goodPath = accountPath(DATA_BATTLENET_ROOT, "0");
    const badPath = accountPath(DATA_BATTLENET_ROOT, "1");
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0", "1"]);
    fs.files.set(goodPath, { size: 10, mtimeMs: 1000, bytes: bytesOf("good") });
    // badPath intentionally has no `files` entry -> stat() throws ENOENT
    // every poll (e.g. a permission error or a partially-written file).

    const persistence = createMemoryPersistence({ [goodPath]: 1000 });
    const watcher = createLastReplayWatcher(fs, persistence);
    const onReplay = vi.fn<(event: ReplayEvent) => void>();
    watcher.watchLastReplay(DEFAULT_OPTS, onReplay);
    await flush();

    expect(watcher.getStatus().lastError).not.toBeNull();
    const warnCallsAfterFirstPoll = warnSpy.mock.calls.length;
    expect(warnCallsAfterFirstPoll).toBeGreaterThan(0);

    // The same ongoing error must not be re-logged every tick.
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(warnSpy.mock.calls.length).toBe(warnCallsAfterFirstPoll);
    expect(watcher.getStatus().lastError).not.toBeNull();

    // The loop keeps going despite the other candidate's persistent error:
    // a genuine change on the healthy candidate still fires normally.
    fs.files.set(goodPath, { size: 20, mtimeMs: 2000, bytes: bytesOf("good-2") });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // first sight
    await flush();
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS); // stable
    await flush();
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({ path: goodPath, mtimeMs: 2000 });

    // Fixing the bad path clears the error on the next poll.
    fs.files.set(badPath, { size: 1, mtimeMs: 1, bytes: bytesOf("now readable") });
    persistence.setHandledMtimes({ ...persistence.getHandledMtimes(), [badPath]: 1 });
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS);
    await flush();
    expect(watcher.getStatus().lastError).toBeNull();
  });

  it("reports a missing-roots error when neither $DATA nor $DOCUMENT has a BattleNet folder yet", async () => {
    // Nothing registered in `fs.dirs` at all — simulates a fresh install
    // before Warcraft III has ever been run.
    const watcher = createLastReplayWatcher(fs, createMemoryPersistence());
    watcher.watchLastReplay(DEFAULT_OPTS, vi.fn());
    await flush();

    expect(watcher.getStatus().watchingFolders).toEqual([]);
    expect(watcher.getStatus().lastError).not.toBeNull();
  });

  it("watches both $DATA and $DOCUMENT roots when both exist", async () => {
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.dirs.set(DOC_BATTLENET_ROOT, ["1"]);
    fs.files.set(accountPath(DATA_BATTLENET_ROOT, "0"), { size: 1, mtimeMs: 1, bytes: bytesOf("a") });
    fs.files.set(accountPath(DOC_BATTLENET_ROOT, "1"), { size: 1, mtimeMs: 1, bytes: bytesOf("b") });

    const watcher = createLastReplayWatcher(fs, createMemoryPersistence());
    watcher.watchLastReplay(DEFAULT_OPTS, vi.fn());
    await flush();

    expect(watcher.getStatus().watchingFolders.sort()).toEqual([DATA_BATTLENET_ROOT, DOC_BATTLENET_ROOT].sort());
  });

  it("stop() tears down the poll loop — no further stat calls", async () => {
    fs.dirs.set(DATA_BATTLENET_ROOT, ["0"]);
    fs.files.set(accountPath(DATA_BATTLENET_ROOT, "0"), { size: 1, mtimeMs: 1, bytes: bytesOf("a") });
    const statSpy = vi.spyOn(fs, "stat");

    const watcher = createLastReplayWatcher(fs, createMemoryPersistence());
    const stop = watcher.watchLastReplay(DEFAULT_OPTS, vi.fn());
    await flush();
    const callsBeforeStop = statSpy.mock.calls.length;
    expect(callsBeforeStop).toBeGreaterThan(0);

    stop();
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 5);
    await flush();
    expect(statSpy.mock.calls.length).toBe(callsBeforeStop);
  });
});
