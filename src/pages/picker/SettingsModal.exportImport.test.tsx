/**
 * F004 — "Export all private builds" and "Import builds…" in Settings.
 * Export calls `host.saveTextFile` with a JSON payload that round-trips
 * through `parseImport`; the import flow adds a new build and reports
 * "Imported N, skipped M" via `role="status"`, then skips a re-import of
 * the same file (dedupe by title+steps fingerprint).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import { exportAll, parseImport } from "../../lib/buildExchange";
import { createLocalBuild } from "../../lib/localBuilds";
import { LOCAL_BUILDS, SETTINGS, type Settings } from "../../store/keys";
import { readKey, writeKey } from "../../store/state";
import { SettingsModal } from "./SettingsModal";

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

function renderSettings() {
  return render(
    <SettingsModal settings={SETTINGS_VALUE} registrations={[]} onRegistrations={() => {}} onClose={() => {}} />,
  );
}

describe("SettingsModal — export/import private builds", () => {
  beforeEach(async () => {
    localStorage.clear();
    await writeKey(SETTINGS, SETTINGS_VALUE);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Export all private builds calls host.saveTextFile with valid, round-trippable JSON", async () => {
    const build = createLocalBuild({
      title: "My private opener",
      race: "orc",
      vsRaces: ["human"],
      difficulty: "beginner",
      tags: ["rush"],
      summary: "A quick private opener.",
      author: "Me",
      steps: [{ time: "0:00", supply: 5, instruction: "Train peon" }],
    });
    await writeKey(LOCAL_BUILDS, [build]);

    const saveTextFile = vi.spyOn(host, "saveTextFile").mockResolvedValue(true);

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Export all private builds" }));

    await waitFor(() => expect(saveTextFile).toHaveBeenCalledTimes(1));
    const [name, contents] = saveTextFile.mock.calls[0];
    expect(name).toBe("wc3gym-builds.wc3gym.json");
    expect(JSON.parse(contents)).toEqual(exportAll([build]));
  });

  it("disables Export all when there are no private builds", async () => {
    await writeKey(LOCAL_BUILDS, []);
    renderSettings();
    const button = screen.getByRole("button", { name: "Export all private builds" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("Import adds a new build and reports the count via role=status; re-importing skips it", async () => {
    await writeKey(LOCAL_BUILDS, []);
    const json = JSON.stringify(
      exportAll([
        createLocalBuild({
          title: "Imported opener",
          race: "human",
          vsRaces: [],
          difficulty: "beginner",
          tags: [],
          summary: "Imported from a file.",
          author: "Friend",
          steps: [{ instruction: "Train peasant" }],
        }),
      ]),
    );
    expect(parseImport(json).errors).toEqual([]);

    const openTextFile = vi.spyOn(host, "openTextFile").mockResolvedValue(json);

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Import builds…" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Imported 1, skipped 0"));
    expect(readKey(LOCAL_BUILDS)).toHaveLength(1);
    expect(openTextFile).toHaveBeenCalledTimes(1);

    // Re-importing the same file is a no-op add, reported as a full skip —
    // this is the "already imported" notice from C-506.
    fireEvent.click(screen.getByRole("button", { name: "Import builds…" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Imported 0, skipped 1"));
    expect(readKey(LOCAL_BUILDS)).toHaveLength(1);
  });

  it("does nothing when the import dialog is cancelled", async () => {
    await writeKey(LOCAL_BUILDS, []);
    vi.spyOn(host, "openTextFile").mockResolvedValue(null);

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Import builds…" }));

    await waitFor(() => expect(host.openTextFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).toBeNull();
    expect(readKey(LOCAL_BUILDS)).toHaveLength(0);
  });
});
