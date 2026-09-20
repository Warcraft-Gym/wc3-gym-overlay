/**
 * F002 — the picker's launch update check: once per mount, after
 * `UPDATE_CHECK_DELAY_MS`, `host.checkForUpdate()` runs — but only when
 * `settings.autoUpdate` was on when the component mounted. Never fires a
 * second time on its own.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPDATE_CHECK_DELAY_MS } from "../../config";
import { host } from "../../host";
import { SETTINGS, type Settings } from "../../store/keys";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock, fetchIcons: vi.fn().mockResolvedValue([]) };
});

const { App } = await import("./App");

function settingsValue(autoUpdate: boolean): Settings {
  return {
    apiBase: "https://wc3-gnl-website.vercel.app",
    opacity: 1,
    scale: 1,
    shortcuts: {
      toggle_overlay: "CommandOrControl+Shift+O",
      timer_play_pause: "CommandOrControl+Shift+P",
      timer_reset: "CommandOrControl+Shift+R",
      step_next: "CommandOrControl+Shift+]",
      step_prev: "CommandOrControl+Shift+[",
    },
    autoUpdate,
    skippedVersion: null,
  };
}

describe("App — launch update check", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchBuildsMock.mockReset();
    fetchBuildsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.style.overflow = "";
  });

  it("checks for an update once, after the delay, when autoUpdate is true", async () => {
    localStorage.setItem(SETTINGS.name, JSON.stringify(settingsValue(true)));
    const checkForUpdate = vi.spyOn(host, "checkForUpdate").mockResolvedValue(null);

    vi.useFakeTimers();
    render(<App />);

    expect(checkForUpdate).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS);
    });

    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    // Never fires again on its own.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS * 5);
    });
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("never checks when autoUpdate is false", async () => {
    localStorage.setItem(SETTINGS.name, JSON.stringify(settingsValue(false)));
    const checkForUpdate = vi.spyOn(host, "checkForUpdate").mockResolvedValue(null);

    vi.useFakeTimers();
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DELAY_MS * 5);
    });

    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});
