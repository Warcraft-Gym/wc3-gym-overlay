/**
 * F002 — `ReplayImportModal`. Uses a hand-built `ReplaySummary` fixture
 * object (not a real `.w3g`) and mocks the lazily-imported `parseReplay`/
 * `extractBuild` modules so these jsdom tests stay fast (< 2s) — the real
 * fixture is only exercised once, through `App.importReplay.test.tsx`'s
 * sibling in `extractBuild.test.ts` / `parseReplay.test.ts`, to catch API
 * drift.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayParseError, type ReplaySummary } from "../../../replay/types";

const parseReplayMock = vi.hoisted(() => vi.fn());
const extractBuildMock = vi.hoisted(() => vi.fn());

vi.mock("../../../replay/parseReplay", () => ({ parseReplay: parseReplayMock }));
vi.mock("../../../replay/extractBuild", () => ({ extractBuild: extractBuildMock }));

const { ReplayImportModal } = await import("./ReplayImportModal");

const SUMMARY: ReplaySummary = {
  map: { file: "NorthernIsles.w3x", name: "Northern Isles" },
  version: "3.00",
  buildNumber: 1,
  durationMs: 823_000,
  players: [
    { id: 0, name: "noname#114787", race: "human", raceDetected: "human", teamId: 0, isObserver: false },
    { id: 1, name: "FoCuS#31324", race: "orc", raceDetected: "orc", teamId: 1, isObserver: false },
  ],
  events: {},
};

/** Deterministic step-count formula: scales with cutoff, drops 3 for
 *  "no upgrades", adds 2 for "with items" — enough to exercise every
 *  preview-recompute case below without a real replay. */
function fakeExtractBuild(
  summary: ReplaySummary,
  playerId: number,
  opts: { cutoffMs?: number; includeUpgrades?: boolean; includeItems?: boolean },
) {
  const player = summary.players.find((p) => p.id === playerId)!;
  const cutoffMs = opts.cutoffMs ?? 480_000;
  let count = Math.floor(cutoffMs / 20_000) + 5;
  if (opts.includeUpgrades === false) count -= 3;
  if (opts.includeItems) count += 2;
  count = Math.max(count, 0);
  return {
    title: `${player.name} (Orc) vs Human — Northern Isles`,
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
    steps: Array.from({ length: count }, (_, i) => ({ time: "0:00", supply: "5", instruction: `Step ${i}`, icon: "" })),
  };
}

function renderModal(overrides: { onOpenInEditor?: (draft: unknown) => void; onClose?: () => void } = {}) {
  return render(
    <ReplayImportModal
      fileBytes={new Uint8Array([1, 2, 3])}
      apiBase="https://site.test"
      onClose={overrides.onClose ?? vi.fn()}
      onOpenInEditor={overrides.onOpenInEditor ?? vi.fn()}
    />,
  );
}

describe("ReplayImportModal", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("shows a busy state while reading, then renders players with the first non-observer selected by default", async () => {
    parseReplayMock.mockResolvedValue(SUMMARY);
    extractBuildMock.mockImplementation(fakeExtractBuild);

    renderModal();

    expect(screen.getByRole("status").textContent).toContain("Reading replay…");

    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());

    const humanRadio = screen.getByRole("radio", { name: "noname#114787 · Human" }) as HTMLInputElement;
    const orcRadio = screen.getByRole("radio", { name: "FoCuS#31324 · Orc" }) as HTMLInputElement;
    expect(humanRadio.checked).toBe(true);
    expect(orcRadio.checked).toBe(false);
    expect(screen.getByText("Northern Isles · v3.00 · 13:43")).toBeTruthy();
  });

  it("clamps the cutoff field on blur: below 1:00 up, above 20:00 down, invalid text reverts", async () => {
    parseReplayMock.mockResolvedValue(SUMMARY);
    extractBuildMock.mockImplementation(fakeExtractBuild);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const cutoff = screen.getByRole("textbox", { name: "Import up to" }) as HTMLInputElement;
    expect(cutoff.value).toBe("08:00");

    fireEvent.change(cutoff, { target: { value: "0:30" } });
    fireEvent.blur(cutoff);
    expect(cutoff.value).toBe("01:00");

    fireEvent.change(cutoff, { target: { value: "25:00" } });
    fireEvent.blur(cutoff);
    expect(cutoff.value).toBe("20:00");

    fireEvent.change(cutoff, { target: { value: "abc" } });
    fireEvent.blur(cutoff);
    expect(cutoff.value).toBe("20:00");
  });

  it("recomputes the live step-count preview when toggles change", async () => {
    parseReplayMock.mockResolvedValue(SUMMARY);
    extractBuildMock.mockImplementation(fakeExtractBuild);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const preview = () => screen.getByText(/steps$/);
    const before = preview().getAttribute("data-preview-count");

    fireEvent.click(screen.getByRole("checkbox", { name: "Include upgrades" }));

    await waitFor(() => {
      const after = preview().getAttribute("data-preview-count");
      expect(after).not.toBe(before);
    });
  });

  it.each([
    ["not_a_replay", "Not a Warcraft III replay"],
    ["unsupported_version", "Unsupported replay version (5.24)"],
    ["corrupt", "Couldn't read this replay"],
  ] as const)("shows the typed error message for code %s", async (code, expected) => {
    parseReplayMock.mockRejectedValue(new ReplayParseError(code, `Replay version 5.24 is not supported.`));
    renderModal();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(expected);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Open in editor" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a generic error and logs to console for an unexpected error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    parseReplayMock.mockRejectedValue(new Error("boom"));
    renderModal();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't read this replay");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("disables 'Open in editor' in every error state, leaving only Cancel/close actionable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    parseReplayMock.mockRejectedValue(new ReplayParseError("not_a_replay", "not a replay"));
    renderModal();

    await screen.findByRole("alert");
    expect(screen.queryByRole("radiogroup", { name: "Player" })).toBeNull();
    expect((screen.getByRole("button", { name: "Open in editor" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Close import") as HTMLButtonElement).disabled).toBe(false);
    consoleError.mockRestore();
  });

  it("'Open in editor' calls onOpenInEditor with a draft titled after the selected player", async () => {
    parseReplayMock.mockResolvedValue(SUMMARY);
    extractBuildMock.mockImplementation(fakeExtractBuild);
    const onOpenInEditor = vi.fn();
    renderModal({ onOpenInEditor });
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    fireEvent.click(screen.getByRole("radio", { name: "FoCuS#31324 · Orc" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));

    expect(onOpenInEditor).toHaveBeenCalledTimes(1);
    const draft = onOpenInEditor.mock.calls[0][0];
    expect(draft.title).toContain("FoCuS#31324");
  });
});
