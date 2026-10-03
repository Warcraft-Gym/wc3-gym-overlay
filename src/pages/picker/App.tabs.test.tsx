/** The picker's sections: Builds and Profile are remembered, Settings is a
 *  tab but never reopens by itself. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS } from "../../store/keys";
import { readKey } from "../../store/state";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock, fetchIcons: vi.fn().mockResolvedValue([]) };
});
vi.mock("../../opponentWatcher", async () => {
  const actual = await vi.importActual<typeof import("../../opponentWatcher")>("../../opponentWatcher");
  return { ...actual, startOpponentWatcher: () => () => {} };
});
vi.mock("../../profileLoader", () => ({ refreshProfile: vi.fn(async () => undefined) }));

const { App } = await import("./App");

const selected = () => screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent);

describe("App tabs", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchBuildsMock.mockReset();
    fetchBuildsMock.mockResolvedValue([]);
  });
  afterEach(() => cleanup());

  it("opens on Builds, with the build actions in that tab only", async () => {
    await act(async () => render(<App />));
    expect(selected()).toEqual(["Builds"]);
    expect(screen.getByRole("toolbar", { name: "Build actions" })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Profile" })));
    expect(screen.queryByRole("toolbar", { name: "Build actions" })).toBeNull();
  });

  it("Settings is a tab: the header and the panel agree, and it is not remembered", async () => {
    await act(async () => render(<App />));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Profile" })));
    expect(readKey(SETTINGS).pickerTab).toBe("profile");
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Settings" })));
    expect(selected()).toEqual(["Settings"]);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("picker-tab-settings");
    expect(screen.getByRole("region", { name: "Shortcuts" })).toBeTruthy();
    expect(readKey(SETTINGS).pickerTab).toBe("profile");
  });

  it("the Profile tab's Open Settings button switches to the Settings tab", async () => {
    await act(async () => render(<App />));
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: "Profile" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Open Settings/ })));
    expect(selected()).toEqual(["Settings"]);
  });
});
