/**
 * The picker as shipped: the W3Champions scouting features are off until
 * the Gym admins approve them (W3C_SCOUTING_ENABLED = false). No Profile
 * tab, no Opponent button or shortcut, no W3Champions settings, and the
 * live-game watcher never starts.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { W3C_SCOUTING_ENABLED } from "../../config";
import { host } from "../../host";
import { SETTINGS } from "../../store/keys";
import { readKey } from "../../store/state";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
const startWatcher = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock, fetchIcons: vi.fn().mockResolvedValue([]) };
});
vi.mock("../../opponentWatcher", async () => {
  const actual = await vi.importActual<typeof import("../../opponentWatcher")>("../../opponentWatcher");
  return { ...actual, startOpponentWatcher: startWatcher };
});

const { App } = await import("./App");

describe("App as shipped (scouting features off)", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchBuildsMock.mockReset();
    fetchBuildsMock.mockResolvedValue([]);
    startWatcher.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("the switch is off in this build", () => {
    expect(W3C_SCOUTING_ENABLED).toBe(false);
  });

  it("offers Builds and Settings only, with no Opponent button, and never starts the watcher", async () => {
    await act(async () => render(<App />));
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Builds", "Settings"]);
    expect(screen.queryByRole("button", { name: "Opponent" })).toBeNull();
    expect(screen.getByRole("toolbar", { name: "Build actions" })).toBeTruthy();
    expect(startWatcher).not.toHaveBeenCalled();
  });

  it("a remembered Profile tab (from 0.6.0) opens on Builds instead", async () => {
    localStorage.setItem(SETTINGS.name, JSON.stringify({ ...readKey(SETTINGS), pickerTab: "profile" }));
    await act(async () => render(<App />));
    expect(screen.getByRole("tab", { name: "Builds" }).getAttribute("aria-selected")).toBe("true");
  });

  it("Settings has no W3Champions group and no opponent shortcut", async () => {
    await act(async () => render(<App />));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Settings" })));
    expect(screen.queryByRole("region", { name: "W3Champions" })).toBeNull();
    expect(screen.queryByText("Toggle opponent card")).toBeNull();
    expect(screen.getByText("Toggle overlay")).toBeTruthy();
  });

  it("registers no opponent shortcut", async () => {
    const register = vi.spyOn(host, "registerShortcuts");
    await act(async () => render(<App />));
    await act(async () => Promise.resolve());
    expect(register).toHaveBeenCalled();
    for (const [map] of register.mock.calls) expect(Object.keys(map)).not.toContain("toggle_opponent");
  });
});
