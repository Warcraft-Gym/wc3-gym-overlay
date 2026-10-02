/**
 * F006 (last-replay-watcher) — Settings' "Replays" section: the
 * auto-import checkbox, the replay-folder Choose…/Reset buttons (backed by
 * `host.openFolder()`), the BattleTag field, and the watcher status line.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import { SETTINGS, type Settings } from "../../store/keys";
import { writeKey } from "../../store/state";
import { SettingsModal } from "./SettingsModal";

function baseSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiBase: "https://warcraft-gym.com",
    opacity: 1,
    scale: 1,
    shortcuts: {
      toggle_overlay: "CommandOrControl+Shift+O",
      timer_play_pause: "CommandOrControl+Shift+P",
      timer_reset: "CommandOrControl+Shift+R",
      step_next: "CommandOrControl+Shift+]",
      step_prev: "CommandOrControl+Shift+[",
    },
    autoUpdate: true,
    skippedVersion: null,
    autoImport: true,
    replayFolder: null,
    myBattleTag: null,
    ...overrides,
  };
}

function renderSettings(settings: Settings) {
  return render(
    <SettingsModal settings={settings} registrations={[]} onRegistrations={() => {}} onClose={() => {}} />,
  );
}

describe("SettingsModal — Replays", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(host, "getReplayWatcherStatus").mockReturnValue({
      watchingFolders: [],
      lastPickedUpAtMs: null,
      lastError: null,
    });
    vi.spyOn(host, "onReplayWatcherStatusChanged").mockReturnValue(() => {});
    await writeKey(SETTINGS, baseSettings());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("toggles autoImport via the checkbox", async () => {
    renderSettings(baseSettings({ autoImport: true }));
    const checkbox = screen.getByRole("checkbox", { name: "Auto-detect a finished game" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(async () => {
      const stored = (await import("../../store/state")).readKey(SETTINGS);
      expect(stored.autoImport).toBe(false);
    });
  });

  it("Choose… sets replayFolder from host.openFolder(), Reset clears it", async () => {
    vi.spyOn(host, "openFolder").mockResolvedValue("/Users/pilot/MyReplays");
    renderSettings(baseSettings({ replayFolder: null }));

    fireEvent.click(screen.getByRole("button", { name: "Choose…" }));

    await waitFor(async () => {
      const { readKey } = await import("../../store/state");
      expect(readKey(SETTINGS).replayFolder).toBe("/Users/pilot/MyReplays");
    });

    cleanup();
    const { readKey } = await import("../../store/state");
    renderSettings(baseSettings({ replayFolder: readKey(SETTINGS).replayFolder }));
    expect(screen.getByText("/Users/pilot/MyReplays")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(readKey(SETTINGS).replayFolder).toBeNull();
    });
  });

  it("does not change replayFolder when the folder dialog is cancelled", async () => {
    vi.spyOn(host, "openFolder").mockResolvedValue(null);
    await writeKey(SETTINGS, baseSettings({ replayFolder: "/already/set" }));
    renderSettings(baseSettings({ replayFolder: "/already/set" }));

    fireEvent.click(screen.getByRole("button", { name: "Choose…" }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    const { readKey } = await import("../../store/state");
    expect(readKey(SETTINGS).replayFolder).toBe("/already/set");
  });

  it("persists myBattleTag as the user types, clearing to null when emptied", async () => {
    renderSettings(baseSettings({ myBattleTag: null }));
    const field = screen.getByLabelText("My BattleTag");

    fireEvent.change(field, { target: { value: "Player#1234" } });
    await waitFor(async () => {
      const { readKey } = await import("../../store/state");
      expect(readKey(SETTINGS).myBattleTag).toBe("Player#1234");
    });

    fireEvent.change(field, { target: { value: "" } });
    await waitFor(async () => {
      const { readKey } = await import("../../store/state");
      expect(readKey(SETTINGS).myBattleTag).toBeNull();
    });
  });

  it("shows the watcher status line, including the last-error text", () => {
    vi.spyOn(host, "getReplayWatcherStatus").mockReturnValue({
      watchingFolders: ["/data/Warcraft III/BattleNet"],
      lastPickedUpAtMs: null,
      lastError: "Permission denied reading /custom/replays",
    });
    renderSettings(baseSettings());

    expect(screen.getByTestId("replay-watcher-status").textContent).toBe(
      "Permission denied reading /custom/replays",
    );
  });

  it("shows 'Auto-import is off' instead of a folder count when disabled", () => {
    vi.spyOn(host, "getReplayWatcherStatus").mockReturnValue({
      watchingFolders: [],
      lastPickedUpAtMs: null,
      lastError: null,
    });
    renderSettings(baseSettings({ autoImport: false }));

    expect(screen.getByTestId("replay-watcher-status").textContent).toBe("Auto-import is off");
  });

  it("shows the watched folder count and last pick-up time when everything is healthy", () => {
    const pickedUpAt = new Date("2026-01-01T14:32:00");
    vi.spyOn(host, "getReplayWatcherStatus").mockReturnValue({
      watchingFolders: ["/data/Warcraft III/BattleNet", "/doc/Warcraft III/BattleNet"],
      lastPickedUpAtMs: pickedUpAt.getTime(),
      lastError: null,
    });
    renderSettings(baseSettings());

    const text = screen.getByTestId("replay-watcher-status").textContent ?? "";
    expect(text).toContain("Watching 2 folders");
    expect(text).toContain("last game picked up");
  });
});
