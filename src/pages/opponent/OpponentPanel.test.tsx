import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOW_OPPONENT } from "../../config";
import { host } from "../../host";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { readKey, writeKey } from "../../store/state";
import { realCard } from "./testCard";
import { emptyMessage, OpponentPanel } from "./OpponentPanel";

const idle: OpponentState = { status: "idle", matchId: null, live: false, error: null, card: null, updatedAt: null };

function state(overrides: Partial<OpponentState> = {}): OpponentState {
  return { status: "ok", matchId: "live-1", live: true, error: null, card: realCard(), updatedAt: "2026-10-03T00:00:00Z", ...overrides };
}

async function show(s: OpponentState, tag: string | null = "NecroDoom#11385") {
  await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: tag });
  await writeKey(OPPONENT, s);
  render(<OpponentPanel />);
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("emptyMessage", () => {
  const on = { opponentCard: true, myBattleTag: "d0wi#2726" };
  it("explains why there is no card yet", () => {
    expect(emptyMessage({ ...on, opponentCard: false }, idle)).toContain("is off");
    expect(emptyMessage({ ...on, myBattleTag: null }, idle)).toContain("Set your BattleTag");
    expect(emptyMessage(on, idle)).toBe("Waiting for your next W3Champions 1v1.");
    expect(emptyMessage(on, state())).toBeNull();
    expect(emptyMessage(on, state({ live: false }))).toBeNull();
  });
});

describe("OpponentPanel (the window)", () => {
  it("puts the crest and name in the header, and the card below", async () => {
    await show(state());
    expect(screen.getByText("d0wi")).toBeTruthy();
    expect(screen.getAllByText("Night Elf").length).toBeGreaterThan(0); // crest names for screen readers
    expect(screen.getByRole("list", { name: "What to expect" })).toBeTruthy();
    expect(screen.queryByText("Last game")).toBeNull();
  });

  it("shows a known player's name as a badge", async () => {
    const card = realCard();
    await show(state({ card: { ...card, identity: { aka: "Life", country: "CN", seasons: 8 } } }));
    expect(screen.getByText("aka Life")).toBeTruthy();
  });

  it("labels the last opponent once the game is over", async () => {
    await show(state({ live: false }));
    expect(screen.getByText("Last game")).toBeTruthy();
  });

  it("says what it is waiting for", async () => {
    await show(idle);
    expect(screen.getByText("Waiting for your next W3Champions 1v1.")).toBeTruthy();
  });

  it("asks for a BattleTag first", async () => {
    await show(state(), null);
    expect(screen.getByText(/Set your BattleTag/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "What to expect" })).toBeNull();
  });

  it("shows the loading state", async () => {
    await show(state({ status: "loading", card: null }));
    expect(screen.getByText("Looking up your opponent…")).toBeTruthy();
  });

  it("shows the error message", async () => {
    await show(state({ status: "error", card: null, error: "Couldn't load d0wi#2726's games: W3Champions answered 503" }));
    expect(screen.getByRole("alert").textContent).toContain("503");
  });

  it("hides its own window from the close button", async () => {
    const hide = vi.spyOn(host, "hideWindow").mockResolvedValue();
    await show(state());
    fireEvent.click(screen.getByRole("button", { name: "Hide opponent window" }));
    expect(hide).toHaveBeenCalledWith(WINDOW_OPPONENT);
  });
});
