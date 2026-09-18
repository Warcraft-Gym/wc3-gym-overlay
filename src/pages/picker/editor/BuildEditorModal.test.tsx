/**
 * C-504: the editor renders required-field errors on an empty Save, saves a
 * valid form via `lib/localBuilds.ts`'s helpers, and pre-fills a "Duplicate"
 * with "(copy)".
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyBuild } from "../../../data/useAllBuilds";
import { LOCAL_BUILDS } from "../../../store/keys";
import { readKey } from "../../../store/state";

const fetchIconsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../api/client")>("../../../api/client");
  return { ...actual, fetchIcons: fetchIconsMock };
});

const { BuildEditorModal } = await import("./BuildEditorModal");

const SITE_BUILD: AnyBuild = {
  slug: "human-fast-expand",
  title: "Human Fast Expand",
  race: "human",
  vsRaces: ["orc"],
  difficulty: "beginner",
  tags: ["fast-expand"],
  summary: "A safe fast expand into the mid game.",
  author: "Coach",
  featured: false,
  publishedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  steps: [{ instruction: "Train peasant", time: "0:00", icon: "hu-peasant" }],
  source: "site",
};

function fillMinimalValidForm() {
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "My test opener" } });
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Race" })).getByRole("button", { name: "Orc" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Difficulty" }), { target: { value: "beginner" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Summary/ }), {
    target: { value: "A solid, safe opening build for beginners." },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Author" }), { target: { value: "Me" } });
  fireEvent.click(screen.getByRole("button", { name: /Add step/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Step 1 instruction" }), {
    target: { value: "Peon to gold" },
  });
}

describe("BuildEditorModal", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchIconsMock.mockReset();
    fetchIconsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("shows required-field errors on Save with an empty form", () => {
    const onClose = vi.fn();
    render(
      <BuildEditorModal mode="new" sourceBuild={null} apiBase="https://site.test" allBuilds={[]} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("dialog", { name: "New private build" })).toBeTruthy();
    const alerts = screen.getAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves a valid form to the local builds store and closes", async () => {
    const onClose = vi.fn();
    render(
      <BuildEditorModal mode="new" sourceBuild={null} apiBase="https://site.test" allBuilds={[]} onClose={onClose} />,
    );

    fillMinimalValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = readKey(LOCAL_BUILDS);
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("My test opener");
    expect(saved[0].race).toBe("orc");
    expect(saved[0].steps).toHaveLength(1);
    expect(saved[0].steps[0].instruction).toBe("Peon to gold");
  });

  it("pre-fills a duplicate of a site build with '(copy)' in the title", () => {
    render(
      <BuildEditorModal
        mode="duplicate"
        sourceBuild={SITE_BUILD}
        apiBase="https://site.test"
        allBuilds={[SITE_BUILD]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Duplicate build" })).toBeTruthy();
    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    expect(title.value).toBe("Human Fast Expand (copy)");
  });
});
