/**
 * Regression coverage for the focus-steal bug (F001): showing the overlay
 * window must never call `setFocus()` — an activated overlay steals focus
 * from Warcraft III and pauses a single-player game. The picker is a normal
 * window and may still be focused when shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeWindow = {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  setFocus: ReturnType<typeof vi.fn>;
};

function makeFakeWindow(visible = false): FakeWindow {
  return {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(visible),
    setFocus: vi.fn().mockResolvedValue(undefined),
  };
}

const windows = new Map<string, FakeWindow>();

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: vi.fn((label: string) => Promise.resolve(windows.get(label) ?? null)),
  },
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

import { createTauriHost } from "./tauri";
import { WINDOW_OVERLAY, WINDOW_PICKER } from "../config";

describe("tauri host — overlay never takes focus", () => {
  beforeEach(() => {
    windows.clear();
    windows.set(WINDOW_OVERLAY, makeFakeWindow(false));
    windows.set(WINDOW_PICKER, makeFakeWindow(false));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("showWindow(overlay) calls show() and never calls setFocus()", async () => {
    const host = createTauriHost();

    await host.showWindow(WINDOW_OVERLAY);

    const overlay = windows.get(WINDOW_OVERLAY)!;
    expect(overlay.show).toHaveBeenCalledTimes(1);
    expect(overlay.setFocus).not.toHaveBeenCalled();
  });

  it("toggleWindow(overlay) hidden -> shown never calls setFocus()", async () => {
    const host = createTauriHost();
    const overlay = windows.get(WINDOW_OVERLAY)!;
    overlay.isVisible.mockResolvedValue(false);

    await host.toggleWindow(WINDOW_OVERLAY);

    expect(overlay.show).toHaveBeenCalledTimes(1);
    expect(overlay.setFocus).not.toHaveBeenCalled();
  });

  it("showWindow(picker) may focus — the picker is a normal window", async () => {
    const host = createTauriHost();

    await host.showWindow(WINDOW_PICKER);

    const picker = windows.get(WINDOW_PICKER)!;
    expect(picker.show).toHaveBeenCalledTimes(1);
    expect(picker.setFocus).toHaveBeenCalledTimes(1);
  });
});
