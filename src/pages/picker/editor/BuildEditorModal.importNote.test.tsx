/**
 * F003 (C-706): a replay-imported step's `importNote` ("5 ordered · 1
 * cancelled" / "N dropped (likely rejected)") is rendered in the editor
 * (`data-import-note`) but never persisted — the saved `LocalBuild` JSON
 * must carry no `importNote` key at all.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorFormInput } from "../../../lib/buildEditorSchema";
import { LOCAL_BUILDS } from "../../../store/keys";
import { readKey } from "../../../store/state";

const fetchIconsMock = vi.hoisted(() => vi.fn());
vi.mock("../../../api/client", async () => {
  const actual = await vi.importActual<typeof import("../../../api/client")>("../../../api/client");
  return { ...actual, fetchIcons: fetchIconsMock };
});

const { BuildEditorModal } = await import("./BuildEditorModal");

const REPLAY_DRAFT_WITH_NOTE: EditorFormInput = {
  title: "lolicore#21233 (Human) vs Human — Turtle Rock",
  race: "human",
  vsRaces: ["human"],
  difficulty: "intermediate",
  patch: "",
  tags: "replay",
  summary: "Imported from replay turtle_rock.w3x (v3.00, 8:00). Trim and annotate before sharing.",
  author: "Replay Import",
  authorDiscord: "",
  sourceUrl: "",
  description: "",
  steps: [
    { time: "0:09", supply: "9", instruction: "Train 4× Peasant", icon: "hu-peasant", importNote: "5 ordered · 1 cancelled" },
    { time: "0:32", supply: "9", instruction: "Build Farm", icon: "hu-farm" },
  ],
};

describe("BuildEditorModal — import provenance captions (F003, C-706)", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchIconsMock.mockReset();
    fetchIconsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders the importNote as a data-import-note caption under the affected step only", () => {
    render(
      <BuildEditorModal
        mode="new"
        sourceBuild={null}
        apiBase="https://site.test"
        allBuilds={[]}
        onClose={vi.fn()}
        initialValues={REPLAY_DRAFT_WITH_NOTE}
      />,
    );

    const notes = document.querySelectorAll("[data-import-note]");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe("5 ordered · 1 cancelled");
  });

  it("strips importNote on save: the serialised wc3gym.localBuilds value has no importNote key", async () => {
    const onClose = vi.fn();
    render(
      <BuildEditorModal
        mode="new"
        sourceBuild={null}
        apiBase="https://site.test"
        allBuilds={[]}
        onClose={onClose}
        initialValues={REPLAY_DRAFT_WITH_NOTE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const raw = localStorage.getItem("wc3gym.localBuilds");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("importNote");

    const saved = readKey(LOCAL_BUILDS);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.steps).toHaveLength(2);
    for (const step of saved[0]!.steps) {
      expect(Object.keys(step)).not.toContain("importNote");
    }
  });
});
