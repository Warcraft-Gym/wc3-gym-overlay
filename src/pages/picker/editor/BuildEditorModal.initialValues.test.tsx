/**
 * F002 — `BuildEditorModal`'s `initialValues` prop, the "smallest possible
 * change" that lets `ReplayImportModal` seed a "new" build's form with a
 * replay-derived draft instead of the blank defaults.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorFormInput } from "../../../lib/buildEditorSchema";

const fetchIconsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../api/client")>("../../../api/client");
  return { ...actual, fetchIcons: fetchIconsMock };
});

const { BuildEditorModal } = await import("./BuildEditorModal");

const REPLAY_DRAFT: EditorFormInput = {
  title: "FoCuS#31324 (Orc) vs Human — Northern Isles",
  race: "orc",
  vsRaces: ["human"],
  difficulty: "intermediate",
  patch: "",
  tags: "replay",
  summary: "Imported from replay NorthernIsles.w3x (v3.00, 13:43). Trim and annotate before sharing.",
  author: "Replay Import",
  authorDiscord: "",
  sourceUrl: "",
  description: "",
  steps: [
    { time: "0:03", supply: "5", instruction: "Build Altar of Storms", icon: "nt-altar-of-storms" },
    { time: "0:10", supply: "5", instruction: "Build Orc Burrow", icon: "nt-burrow" },
  ],
};

describe("BuildEditorModal — seeded by a replay import (initialValues)", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchIconsMock.mockReset();
    fetchIconsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("pre-fills title, tags, and steps from initialValues instead of the blank defaults", () => {
    render(
      <BuildEditorModal
        mode="new"
        sourceBuild={null}
        apiBase="https://site.test"
        allBuilds={[]}
        onClose={vi.fn()}
        initialValues={REPLAY_DRAFT}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    expect(title.value).toBe(REPLAY_DRAFT.title);

    const step1 = screen.getByRole("textbox", { name: "Step 1 instruction" }) as HTMLInputElement;
    expect(step1.value).toBe("Build Altar of Storms");
    const step2 = screen.getByRole("textbox", { name: "Step 2 instruction" }) as HTMLInputElement;
    expect(step2.value).toBe("Build Orc Burrow");
  });

  it("still uses the blank defaults for mode 'new' when initialValues is omitted", () => {
    render(
      <BuildEditorModal mode="new" sourceBuild={null} apiBase="https://site.test" allBuilds={[]} onClose={vi.fn()} />,
    );

    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    expect(title.value).toBe("");
  });
});
