/**
 * F001/F002 — the Tauri host's updater bridge: `checkForUpdate` maps the
 * plugin's `Update` resource onto `UpdateInfo`, `installUpdate` drives
 * `downloadAndInstall` on whatever update the last check resolved, and
 * `relaunch` delegates to the process plugin. Mocks every Tauri plugin this
 * module touches so it never actually reaches a Tauri runtime.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  documentDir: vi.fn(),
}));

const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));

const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

// F002: backs `isPortableBuild()` — defaults to "installed" (`true`) so the
// pre-existing tests below (written before portable detection landed) see
// the same `portable: false` behavior they always did.
const invokeMock = vi.fn().mockResolvedValue(true);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { createTauriHost } from "./tauri";

describe("tauri host — updater", () => {
  afterEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue(true);
  });

  it("checkForUpdate() resolves null when the plugin has no update", async () => {
    checkMock.mockResolvedValue(null);

    const host = createTauriHost();
    const result = await host.checkForUpdate();

    expect(result).toBeNull();
  });

  it("checkForUpdate() maps the plugin's Update onto UpdateInfo", async () => {
    checkMock.mockResolvedValue({
      version: "0.4.1",
      currentVersion: "0.4.0",
      date: "2026-09-20",
      body: "Fixes the thing.",
      downloadAndInstall: vi.fn(),
    });

    const host = createTauriHost();
    const result = await host.checkForUpdate();

    expect(result).toEqual({
      version: "0.4.1",
      currentVersion: "0.4.0",
      notes: "Fixes the thing.",
      date: "2026-09-20",
      portable: false,
    });
  });

  it("checkForUpdate() reports portable + downloadUrl when is_installed_bundle resolves false", async () => {
    invokeMock.mockResolvedValue(false);
    checkMock.mockResolvedValue({
      version: "0.4.1",
      currentVersion: "0.4.0",
      date: "2026-09-20",
      body: "Fixes the thing.",
      downloadAndInstall: vi.fn(),
    });

    const host = createTauriHost();
    const result = await host.checkForUpdate();

    expect(result).toMatchObject({ portable: true });
    expect(result?.downloadUrl).toMatch(/^https:\/\/github\.com\/.*Portable\.exe$/);
  });

  it("installUpdate() calls downloadAndInstall on the last checked update and reports progress", async () => {
    const downloadAndInstall = vi.fn(async (onEvent: (e: unknown) => void) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      onEvent({ event: "Finished" });
    });
    checkMock.mockResolvedValue({
      version: "0.4.1",
      currentVersion: "0.4.0",
      downloadAndInstall,
    });

    const host = createTauriHost();
    await host.checkForUpdate();
    const onProgress = vi.fn();
    await host.installUpdate(onProgress);

    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 0, contentLength: 100 });
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 40, contentLength: 100 });
    expect(onProgress).toHaveBeenCalledWith({ downloaded: 100, contentLength: 100 });
  });

  it("installUpdate() throws when no update was checked first", async () => {
    // Module-level pending-update state persists across `createTauriHost()`
    // calls (it mirrors the real plugin's `check()` -> `install()` handoff),
    // so a prior test in this file may have left one cached — clear it via
    // an explicit "no update" check before asserting the throw.
    checkMock.mockResolvedValue(null);
    const host = createTauriHost();
    await host.checkForUpdate();

    await expect(host.installUpdate(vi.fn())).rejects.toThrow(/checkForUpdate/);
  });

  it("relaunch() delegates to the process plugin", async () => {
    const host = createTauriHost();

    await host.relaunch();

    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("isPortableBuild() resolves false when is_installed_bundle resolves true", async () => {
    invokeMock.mockResolvedValue(true);
    const host = createTauriHost();

    await expect(host.isPortableBuild()).resolves.toBe(false);
    expect(invokeMock).toHaveBeenCalledWith("is_installed_bundle");
  });

  it("isPortableBuild() resolves true when is_installed_bundle resolves false", async () => {
    invokeMock.mockResolvedValue(false);
    const host = createTauriHost();

    await expect(host.isPortableBuild()).resolves.toBe(true);
  });
});
