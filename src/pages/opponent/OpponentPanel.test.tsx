import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOW_OPPONENT } from "../../config";
import { host } from "../../host";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { readKey, writeKey } from "../../store/state";
import season24 from "../../w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "../../w3c/__fixtures__/search.d0wi.season25.json";
import { w3cMatchSchema } from "../../w3c/client";
import { buildOpponentCard, type LiveMatch } from "../../w3c/opponentCard";
import { emptyMessage, formatRecord, OpponentPanel } from "./OpponentPanel";

const history = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));
const live: LiveMatch = {
  matchId: "live-1",
  map: "Hammerfall",
  startTime: "2026-10-02T23:03:50.342+00:00",
  me: { battleTag: "NecroDoom#11385", race: 8, rndRace: null },
  opponent: { battleTag: "d0wi#2726", name: "d0wi", race: 4, rndRace: null, oldMmr: 1858, location: "FR", ranking: { rank: 19 } },
};
const card = buildOpponentCard(live, history);
const idle: OpponentState = { status: "idle", matchId: null, live: false, error: null, card: null, updatedAt: null };

function state(overrides: Partial<OpponentState> = {}): OpponentState {
  return { status: "ok", matchId: "live-1", live: true, error: null, card, updatedAt: "2026-10-03T00:00:00Z", ...overrides };
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

describe("formatRecord", () => {
  it("formats wins, losses and a rounded rate", () => {
    expect(formatRecord({ wins: 12, losses: 6 })).toBe("12–6 (67%)");
    expect(formatRecord({ wins: 0, losses: 0 })).toBe("no games");
  });
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

describe("OpponentPanel", () => {
  it("shows the real card for d0wi on Hammerfall", async () => {
    await show(state());
    expect(screen.getByText("d0wi · Night Elf")).toBeTruthy();
    expect(screen.getByText(/1858 MMR · rank 19 · FR/)).toBeTruthy();
    expect(screen.getByText("12–6 (67%)")).toBeTruthy();
    expect(screen.getByText("5–9 (36%)")).toBeTruthy();
    expect(screen.getByText("Opens vs Undead")).toBeTruthy();
    expect(screen.getByText("15 of 18")).toBeTruthy();
    expect(screen.getByText("11 of 18")).toBeTruthy();
    expect(screen.getByText("2 of 18")).toBeTruthy();
    expect(screen.getByLabelText("Recent form, newest first: W L W W W L L W L L")).toBeTruthy();
    expect(screen.queryByText("Last game")).toBeNull();
  });

  it("keeps the last opponent after the game, labelled", async () => {
    await show(state({ live: false }));
    expect(screen.getByText("Last game")).toBeTruthy();
    expect(screen.getByText("12–6 (67%)")).toBeTruthy();
  });

  it("says what it is waiting for", async () => {
    await show(idle);
    expect(screen.getByText("Waiting for your next W3Champions 1v1.")).toBeTruthy();
  });

  it("asks for a BattleTag first", async () => {
    await show(state(), null);
    expect(screen.getByText(/Set your BattleTag/)).toBeTruthy();
    expect(screen.queryByText("12–6 (67%)")).toBeNull();
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
