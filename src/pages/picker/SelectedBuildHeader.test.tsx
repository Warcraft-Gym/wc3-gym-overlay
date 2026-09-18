/**
 * C-104: the toggle-overlay shortcut hint (`or press <kbd>…</kbd>`) reads
 * live off `useStoreValue(SETTINGS)`, in both the "build selected" and
 * "nothing selected" states, so it always reflects whatever combo the user
 * last set in Settings.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiBuildListItem } from "../../api/schema";
import { DEFAULT_SHORTCUTS } from "../../config";
import { SETTINGS } from "../../store/keys";
import { writeKey } from "../../store/state";
import { SelectedBuildHeader } from "./SelectedBuildHeader";

const build: ApiBuildListItem = {
  slug: "human-fast-expand",
  title: "Human Fast Expand",
  race: "human",
  vsRaces: [],
  difficulty: "beginner",
  tags: [],
  summary: "Safe opener",
  author: "Coach",
  featured: false,
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  steps: [],
};

async function setToggleCombo(combo: string): Promise<void> {
  await writeKey(SETTINGS, {
    apiBase: "https://warcraft3.gym",
    opacity: 1,
    scale: 1,
    shortcuts: { ...DEFAULT_SHORTCUTS, toggle_overlay: combo },
  });
}

describe("SelectedBuildHeader — toggle-overlay hint", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the current combo when a build is selected", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");

    render(<SelectedBuildHeader build={build} apiBase="https://warcraft3.gym" />);

    expect(screen.getByText(/F9/)).toBeTruthy();
  });

  it("shows the current combo when nothing is selected", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");

    render(<SelectedBuildHeader build={null} apiBase="https://warcraft3.gym" />);

    expect(screen.getByText(/F9/)).toBeTruthy();
  });

  it("updates the hint after the combo changes", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");
    const { rerender } = render(<SelectedBuildHeader build={build} apiBase="https://warcraft3.gym" />);
    expect(screen.getByText(/F9/)).toBeTruthy();

    await setToggleCombo("CommandOrControl+Shift+F10");
    rerender(<SelectedBuildHeader build={build} apiBase="https://warcraft3.gym" />);

    expect(screen.getByText(/F10/)).toBeTruthy();
  });
});
