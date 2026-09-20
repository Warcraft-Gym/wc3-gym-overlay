/**
 * F002 — clicking "Import replay" in the picker top bar calls
 * `host.openBinaryFile` with a `.w3g` filter, and a picked file opens the
 * (lazily-loaded) `ReplayImportModal`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import { LOCAL_BUILDS, SETTINGS, type Settings } from "../../store/keys";
import { writeKey } from "../../store/state";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../api/client")>("../../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock, fetchIcons: vi.fn().mockResolvedValue([]) };
});

const { App } = await import("./App");

const SETTINGS_VALUE: Settings = {
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
  autoUpdate: false,
  skippedVersion: null,
};

describe("App — Import replay", () => {
  beforeEach(async () => {
    localStorage.clear();
    await writeKey(SETTINGS, SETTINGS_VALUE);
    await writeKey(LOCAL_BUILDS, []);
    fetchBuildsMock.mockReset();
    fetchBuildsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("calls host.openBinaryFile with the .w3g filter when clicked, and no file picked opens nothing", async () => {
    const openBinaryFile = vi.spyOn(host, "openBinaryFile").mockResolvedValue(null);

    render(<App />);

    const button = await screen.findByRole("button", { name: "Import replay" });
    fireEvent.click(button);

    await waitFor(() => expect(openBinaryFile).toHaveBeenCalledTimes(1));
    expect(openBinaryFile).toHaveBeenCalledWith([{ name: "Warcraft III replay", extensions: ["w3g"] }]);
    expect(screen.queryByRole("dialog", { name: "Import replay" })).toBeNull();
  });

  it("opens the Import replay dialog once a file is picked", async () => {
    vi.spyOn(host, "openBinaryFile").mockResolvedValue({ name: "game.w3g", bytes: new Uint8Array([1, 2, 3]) });

    render(<App />);

    const button = await screen.findByRole("button", { name: "Import replay" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("dialog", { name: "Import replay" })).toBeTruthy());
  });
});
