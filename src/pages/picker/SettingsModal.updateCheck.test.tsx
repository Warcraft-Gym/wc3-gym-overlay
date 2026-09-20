/**
 * F002 — Settings' "Auto-update on launch" checkbox and "Check for
 * updates" button. The button's own state (idle → checking → result) is
 * independent of the launch-check flow (`useUpdateFlow`); it always
 * surfaces the result, including a version the user already skipped.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../host";
import type { UpdateInfo } from "../../host/bridge";
import { APP_VERSION } from "../../version";
import { SETTINGS, type Settings } from "../../store/keys";
import { writeKey } from "../../store/state";
import { SettingsModal } from "./SettingsModal";

const AVAILABLE: UpdateInfo = {
  version: "9.9.9",
  currentVersion: APP_VERSION,
  notes: "Mock release notes",
  portable: false,
};

function baseSettings(overrides: Partial<Settings> = {}): Settings {
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
    autoUpdate: true,
    skippedVersion: null,
    ...overrides,
  };
}

function renderSettings(settings: Settings, onOpenUpdate = vi.fn()) {
  return render(
    <SettingsModal
      settings={settings}
      registrations={[]}
      onRegistrations={() => {}}
      onClose={() => {}}
      onOpenUpdate={onOpenUpdate}
    />,
  );
}

describe("SettingsModal — updates", () => {
  beforeEach(async () => {
    localStorage.clear();
    await writeKey(SETTINGS, baseSettings());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reflects settings.autoUpdate and toggles it via updateKey", async () => {
    renderSettings(baseSettings({ autoUpdate: true }));

    const checkbox = screen.getByRole("checkbox", { name: "Auto-update on launch" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(async () => {
      const { readKey } = await import("../../store/state");
      expect(readKey(SETTINGS).autoUpdate).toBe(false);
    });
  });

  it("Check for updates: checking → latest version, no Update button", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(null);
    renderSettings(baseSettings());

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(screen.getByRole("status").textContent).toBe("Checking…");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(`You're on the latest version (${APP_VERSION})`),
    );
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Update anyway" })).toBeNull();
  });

  it("Check for updates: version available shows Update, which calls onOpenUpdate", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(AVAILABLE);
    const onOpenUpdate = vi.fn();
    renderSettings(baseSettings(), onOpenUpdate);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Version 9.9.9 available"));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(onOpenUpdate).toHaveBeenCalledWith(AVAILABLE);
  });

  it("Check for updates: a skipped version shows '(skipped)' and Update anyway", async () => {
    vi.spyOn(host, "checkForUpdate").mockResolvedValue(AVAILABLE);
    const onOpenUpdate = vi.fn();
    renderSettings(baseSettings({ skippedVersion: "9.9.9" }), onOpenUpdate);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Version 9.9.9 available (skipped)"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Update anyway" }));
    expect(onOpenUpdate).toHaveBeenCalledWith(AVAILABLE);
  });

  it("Check for updates: a failing check shows 'Couldn't check for updates'", async () => {
    vi.spyOn(host, "checkForUpdate").mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderSettings(baseSettings());

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Couldn't check for updates"));
  });

  it("shows no update-check status line before the button is ever clicked", () => {
    renderSettings(baseSettings());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
