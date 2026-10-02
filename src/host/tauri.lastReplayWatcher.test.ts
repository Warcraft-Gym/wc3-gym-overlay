/**
 * F006 (last-replay-watcher) — the Tauri host's wiring of `watchLastReplay`
 * / `getReplayWatcherStatus` / `openFolder` onto the real
 * `@tauri-apps/plugin-fs` + `@tauri-apps/api/path` calls. The poll engine's
 * own logic (stability, persistence, multi-account "newest wins", error
 * handling) is covered exhaustively against a fake filesystem in
 * `lastReplayWatcher.test.ts` — this file only proves the real plugin calls
 * are wired up correctly (right functions, right arguments, right mapping
 * of `FileInfo.mtime` to `mtimeMs`). Mocks every Tauri plugin this module
 * touches, same pattern as `tauri.openBinaryFile.test.ts`. Fake timers — no
 * real waiting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: vi.fn().mockResolvedValue(null) },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  PhysicalPosition: class {},
  PhysicalSize: class {},
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn(),
  unregisterAll: vi.fn(),
  isRegistered: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

const openMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
  save: vi.fn(),
}));

const readFileMock = vi.fn();
const readDirMock = vi.fn();
const statMock = vi.fn();
const existsMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: (...args: unknown[]) => readDirMock(...args),
  stat: (...args: unknown[]) => statMock(...args),
  exists: (...args: unknown[]) => existsMock(...args),
}));

const dataDirMock = vi.fn();
const documentDirMock = vi.fn();
const joinMock = vi.fn();
vi.mock("@tauri-apps/api/path", () => ({
  dataDir: (...args: unknown[]) => dataDirMock(...args),
  documentDir: (...args: unknown[]) => documentDirMock(...args),
  join: (...args: unknown[]) => joinMock(...args),
}));

import { createTauriHost } from "./tauri";
import { LAST_REPLAY_POLL_INTERVAL_MS } from "./lastReplayWatcher";
import { LAST_REPLAY_HANDLED } from "../store/keys";

function join(...parts: string[]): string {
  return parts.join("/");
}

async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await Promise.resolve();
  }
}

describe("tauri host — watchLastReplay / openFolder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    dataDirMock.mockResolvedValue("/Users/pilot/Library/Application Support");
    documentDirMock.mockResolvedValue("/Users/pilot/Documents");
    joinMock.mockImplementation((...parts: string[]) => Promise.resolve(join(...parts)));
    existsMock.mockResolvedValue(false);
    readDirMock.mockResolvedValue([]);
    statMock.mockRejectedValue(new Error("ENOENT"));
    readFileMock.mockResolvedValue(new Uint8Array());
  });

  afterEach(() => {
    // The Tauri host's poll engine is a module-level singleton (one per
    // webview, see `tauri.ts`'s doc comment) — every test must stop its own
    // loop so a leftover interval/stale stability state never bleeds into
    // the next test.
    for (const stop of activeStops) stop();
    activeStops.length = 0;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const activeStops: (() => void)[] = [];
  function startWatch(
    host: ReturnType<typeof createTauriHost>,
    opts: { autoImport: boolean; replayFolder: string | null },
    onReplay: (event: { path: string; mtimeMs: number; bytes: Uint8Array }) => void,
  ): void {
    activeStops.push(host.watchLastReplay(opts, onReplay));
  }

  it("polls both $DATA and $DOCUMENT BattleNet roots and fires onReplay with mtime from FileInfo.mtime", async () => {
    const dataRoot = "/Users/pilot/Library/Application Support/Warcraft III/BattleNet";
    existsMock.mockImplementation((path: string) => Promise.resolve(path === dataRoot));
    readDirMock.mockImplementation((path: string) =>
      Promise.resolve(path === dataRoot ? [{ name: "0", isDirectory: true, isFile: false, isSymlink: false }] : []),
    );
    const replayPath = `${dataRoot}/0/Replays/LastReplay.w3g`;
    const mtime = new Date(1700000000000);
    statMock.mockImplementation((path: string) =>
      path === replayPath
        ? Promise.resolve({
            isFile: true,
            isDirectory: false,
            isSymlink: false,
            size: 1234,
            mtime,
            atime: null,
            birthtime: null,
            readonly: false,
            fileAttributes: null,
          })
        : Promise.reject(new Error("ENOENT")),
    );
    readFileMock.mockResolvedValue(new Uint8Array([9, 9]));
    // Simulate a watcher that's already been running a while, having
    // already handled an older mtime at this path — otherwise the very
    // first poll ever for a path always just records it as handled (see
    // lastReplayWatcher.test.ts's first-run coverage), never firing.
    localStorage.setItem(LAST_REPLAY_HANDLED.name, JSON.stringify({ [replayPath]: mtime.getTime() - 1 }));

    const host = createTauriHost();
    const onReplay = vi.fn();
    startWatch(host, { autoImport: true, replayFolder: null }, onReplay);
    await flush();
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS);
    await flush();

    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onReplay.mock.calls[0][0]).toMatchObject({
      path: replayPath,
      mtimeMs: mtime.getTime(),
      bytes: new Uint8Array([9, 9]),
    });
    expect(host.getReplayWatcherStatus().watchingFolders).toEqual([dataRoot]);
  });

  it("autoImport: false never calls stat", async () => {
    const host = createTauriHost();
    startWatch(host, { autoImport: false, replayFolder: null }, vi.fn());
    await vi.advanceTimersByTimeAsync(LAST_REPLAY_POLL_INTERVAL_MS * 3);
    await flush();
    expect(statMock).not.toHaveBeenCalled();
  });

  it("persists the handled mtime under the LAST_REPLAY_HANDLED store key", async () => {
    const dataRoot = "/Users/pilot/Library/Application Support/Warcraft III/BattleNet";
    existsMock.mockImplementation((path: string) => Promise.resolve(path === dataRoot));
    readDirMock.mockImplementation((path: string) =>
      Promise.resolve(path === dataRoot ? [{ name: "0", isDirectory: true, isFile: false, isSymlink: false }] : []),
    );
    const replayPath = `${dataRoot}/0/Replays/LastReplay.w3g`;
    statMock.mockImplementation((path: string) =>
      path === replayPath
        ? Promise.resolve({
            isFile: true,
            isDirectory: false,
            isSymlink: false,
            size: 1,
            mtime: new Date(42),
            atime: null,
            birthtime: null,
            readonly: false,
            fileAttributes: null,
          })
        : Promise.reject(new Error("ENOENT")),
    );

    const host = createTauriHost();
    startWatch(host, { autoImport: true, replayFolder: null }, vi.fn());
    await flush();

    const stored = JSON.parse(localStorage.getItem(LAST_REPLAY_HANDLED.name) ?? "{}");
    expect(stored[replayPath]).toBe(42);
  });

  it("openFolder opens the native dialog with directory: true", async () => {
    openMock.mockResolvedValue("/Users/pilot/Replays");
    const host = createTauriHost();
    const result = await host.openFolder();
    expect(openMock).toHaveBeenCalledWith({ multiple: false, directory: true });
    expect(result).toBe("/Users/pilot/Replays");
  });

  it("openFolder resolves null when the dialog is cancelled", async () => {
    openMock.mockResolvedValue(null);
    const host = createTauriHost();
    expect(await host.openFolder()).toBeNull();
  });
});
