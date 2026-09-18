/**
 * C-104: the toggle-overlay shortcut hint (`or press <kbd>…</kbd>`) reads
 * live off `useStoreValue(SETTINGS)`, in both the "build selected" and
 * "nothing selected" states, so it always reflects whatever combo the user
 * last set in Settings.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../../config";
import type { AnyBuild } from "../../data/useAllBuilds";
import { createLocalBuild } from "../../lib/localBuilds";
import { SETTINGS } from "../../store/keys";
import { writeKey } from "../../store/state";
import { SelectedBuildHeader } from "./SelectedBuildHeader";

const build: AnyBuild = {
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
  source: "site",
};

async function setToggleCombo(combo: string): Promise<void> {
  await writeKey(SETTINGS, {
    apiBase: "https://wc3-gnl-website.vercel.app",
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

    render(<SelectedBuildHeader build={build} apiBase="https://wc3-gnl-website.vercel.app" />);

    expect(screen.getByText(/F9/)).toBeTruthy();
  });

  it("shows the current combo when nothing is selected", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");

    render(<SelectedBuildHeader build={null} apiBase="https://wc3-gnl-website.vercel.app" />);

    expect(screen.getByText(/F9/)).toBeTruthy();
  });

  it("updates the hint after the combo changes", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");
    const { rerender } = render(<SelectedBuildHeader build={build} apiBase="https://wc3-gnl-website.vercel.app" />);
    expect(screen.getByText(/F9/)).toBeTruthy();

    await setToggleCombo("CommandOrControl+Shift+F10");
    rerender(<SelectedBuildHeader build={build} apiBase="https://wc3-gnl-website.vercel.app" />);

    expect(screen.getByText(/F10/)).toBeTruthy();
  });
});

describe("SelectedBuildHeader — private builds (F002)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a PRIVATE badge and hides 'Open on site' for a local build", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");
    const local: AnyBuild = createLocalBuild({
      title: "My private opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go" }],
    });

    render(<SelectedBuildHeader build={local} apiBase="https://wc3-gnl-website.vercel.app" />);

    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.queryByText("Open on site")).toBeNull();
  });

  it("shows 'Open on site' and no PRIVATE badge for a site build", async () => {
    await setToggleCombo("CommandOrControl+Shift+F9");

    render(<SelectedBuildHeader build={build} apiBase="https://wc3-gnl-website.vercel.app" />);

    expect(screen.getByText("Open on site")).toBeTruthy();
    expect(screen.queryByText("Private")).toBeNull();
  });
});
