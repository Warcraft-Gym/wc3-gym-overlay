/**
 * F002 — the Tauri host's `openBinaryFile`: native open dialog scoped to a
 * caller-supplied filter, then a binary `readFile` on the picked path.
 * Mocks every Tauri plugin this module touches so it never actually reaches
 * a Tauri runtime.
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

const openMock = vi.fn();
const saveMock = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
  save: (...args: unknown[]) => saveMock(...args),
}));

const readFileMock = vi.fn();
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const documentDirMock = vi.fn();
vi.mock("@tauri-apps/api/path", () => ({
  documentDir: (...args: unknown[]) => documentDirMock(...args),
}));

import { createTauriHost } from "./tauri";

describe("tauri host — openBinaryFile", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the dialog scoped to the given filter and defaulted to the Documents dir, then reads the picked path", async () => {
    documentDirMock.mockResolvedValue("/Users/pilot/Documents");
    openMock.mockResolvedValue("/Users/pilot/Documents/Warcraft III/BattleNet/Replays/game.w3g");
    const bytes = new Uint8Array([1, 2, 3]);
    readFileMock.mockResolvedValue(bytes);

    const host = createTauriHost();
    const filters = [{ name: "Warcraft III replay", extensions: ["w3g"] }];
    const result = await host.openBinaryFile(filters);

    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      filters,
      defaultPath: "/Users/pilot/Documents",
    });
    expect(readFileMock).toHaveBeenCalledWith(
      "/Users/pilot/Documents/Warcraft III/BattleNet/Replays/game.w3g",
    );
    expect(result).toEqual({ name: "game.w3g", bytes });
  });

  it("resolves null when the dialog is cancelled", async () => {
    documentDirMock.mockResolvedValue("/Users/pilot/Documents");
    openMock.mockResolvedValue(null);

    const host = createTauriHost();
    const result = await host.openBinaryFile([{ name: "Warcraft III replay", extensions: ["w3g"] }]);

    expect(result).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("still resolves a picked path even when documentDir() rejects", async () => {
    documentDirMock.mockRejectedValue(new Error("unsupported"));
    openMock.mockResolvedValue("/tmp/game.w3g");
    readFileMock.mockResolvedValue(new Uint8Array([9]));

    const host = createTauriHost();
    const result = await host.openBinaryFile([{ name: "Warcraft III replay", extensions: ["w3g"] }]);

    expect(result).toEqual({ name: "game.w3g", bytes: new Uint8Array([9]) });
  });
});
