/**
 * F009 (plan-vs-actual-engine) – the Tauri host's `readReplayFile`: real
 * `stat` + `readFile` wiring for `retryReview()`. Same mocking pattern as
 * `tauri.lastReplayWatcher.test.ts`.
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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

const readFileMock = vi.fn();
const statMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readDir: vi.fn().mockResolvedValue([]),
  stat: (...args: unknown[]) => statMock(...args),
  exists: vi.fn().mockResolvedValue(false),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dataDir: vi.fn().mockRejectedValue(new Error("unused")),
  documentDir: vi.fn().mockRejectedValue(new Error("unused")),
  join: vi.fn(),
}));

import { createTauriHost } from "./tauri";

describe("tauri host – readReplayFile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves bytes + mtime (from FileInfo.mtime) for a real path", async () => {
    const mtime = new Date(1700000000000);
    statMock.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: 10,
      mtime,
      atime: null,
      birthtime: null,
      readonly: false,
      fileAttributes: null,
    });
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]));

    const host = createTauriHost();
    const result = await host.readReplayFile("/x/LastReplay.w3g");

    expect(result).toEqual({ bytes: new Uint8Array([1, 2, 3]), mtimeMs: mtime.getTime() });
  });

  it("resolves null when stat fails (file gone, or outside the fs scope)", async () => {
    statMock.mockRejectedValue(new Error("ENOENT"));
    readFileMock.mockResolvedValue(new Uint8Array());

    const host = createTauriHost();
    expect(await host.readReplayFile("/x/LastReplay.w3g")).toBeNull();
  });

  it("resolves null when readFile fails", async () => {
    statMock.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: 10,
      mtime: new Date(1),
      atime: null,
      birthtime: null,
      readonly: false,
      fileAttributes: null,
    });
    readFileMock.mockRejectedValue(new Error("permission denied"));

    const host = createTauriHost();
    expect(await host.readReplayFile("/x/LastReplay.w3g")).toBeNull();
  });

  it("resolves null when FileInfo.mtime is null", async () => {
    statMock.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      isSymlink: false,
      size: 10,
      mtime: null,
      atime: null,
      birthtime: null,
      readonly: false,
      fileAttributes: null,
    });
    readFileMock.mockResolvedValue(new Uint8Array([1]));

    const host = createTauriHost();
    expect(await host.readReplayFile("/x/LastReplay.w3g")).toBeNull();
  });
});
