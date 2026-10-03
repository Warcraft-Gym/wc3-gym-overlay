import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import season24 from "../../w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "../../w3c/__fixtures__/search.d0wi.season25.json";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { readKey, writeKey } from "../../store/state";
import { w3cMatchSchema } from "../../w3c/client";
import { buildOpponentCard, type LiveMatch } from "../../w3c/opponentCard";
import { CARD_EXPANDED_MS, cardVisible, formatRecord, OpponentCard } from "./OpponentCard";

const history = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));
const live: LiveMatch = {
  matchId: "live-1",
  map: "Hammerfall",
  startTime: "2026-10-02T23:03:50.342+00:00",
  me: { battleTag: "NecroDoom#11385", race: 8, rndRace: null },
  opponent: { battleTag: "d0wi#2726", name: "d0wi", race: 4, rndRace: null, oldMmr: 1858, location: "FR", ranking: { rank: 19 } },
};
const card = buildOpponentCard(live, history);

function state(overrides: Partial<OpponentState> = {}): OpponentState {
  return { status: "ok", matchId: "live-1", live: true, error: null, card, updatedAt: "2026-10-03T00:00:00Z", ...overrides };
}

async function show(s: OpponentState) {
  await writeKey(OPPONENT, s);
  render(<OpponentCard />);
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("formatRecord", () => {
  it("formats wins, losses and a rounded rate", () => {
    expect(formatRecord({ wins: 12, losses: 6 })).toBe("12–6 (67%)");
    expect(formatRecord({ wins: 0, losses: 0 })).toBe("no games");
  });
});

describe("cardVisible", () => {
  it("only while live, loaded and not dismissed for this match", () => {
    expect(cardVisible(state(), null)).toBe(true);
    expect(cardVisible(state({ live: false }), null)).toBe(false);
    expect(cardVisible(state({ status: "idle" }), null)).toBe(false);
    expect(cardVisible(state(), "live-1")).toBe(false);
    expect(cardVisible(state(), "older-match")).toBe(true);
    expect(cardVisible(state(), null, false)).toBe(false);
  });
});

describe("OpponentCard", () => {
  it("shows the real card for d0wi on Hammerfall", async () => {
    await show(state());
    expect(screen.getByRole("region", { name: "Opponent" })).toBeTruthy();
    expect(screen.getByText(/d0wi · Night Elf/)).toBeTruthy();
    expect(screen.getByText(/1858 MMR · rank 19 · FR/)).toBeTruthy();
    expect(screen.getByText("12–6 (67%)")).toBeTruthy();
    expect(screen.getByText("5–9 (36%)")).toBeTruthy();
    expect(screen.getByText("Opens vs Undead")).toBeTruthy();
    expect(screen.getByText("Naga Sea Witch")).toBeTruthy();
    expect(screen.getByText("15 of 18")).toBeTruthy();
    expect(screen.getByText("11 of 18")).toBeTruthy();
    expect(screen.getByText("2 of 18")).toBeTruthy();
    expect(screen.getByText("Pandaren Brewmaster")).toBeTruthy();
    expect(screen.getByLabelText("Recent form, newest first: W L W W W L L W L L")).toBeTruthy();
  });

  it("collapses to one line after a minute and expands on click", async () => {
    vi.useFakeTimers();
    try {
      await show(state());
      const toggle = screen.getByRole("button", { name: /d0wi · Night Elf/ });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      act(() => vi.advanceTimersByTime(CARD_EXPANDED_MS));
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText("12–6 (67%)")).toBeNull();
      fireEvent.click(toggle);
      expect(screen.getByText("12–6 (67%)")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("can be hidden for this match", async () => {
    await show(state());
    fireEvent.click(screen.getByRole("button", { name: "Hide opponent card" }));
    expect(screen.queryByRole("region", { name: "Opponent" })).toBeNull();
  });

  it("shows loading and error states", async () => {
    await show(state({ status: "loading", card: null }));
    expect(screen.getByText("Looking up your opponent…")).toBeTruthy();
  });

  it("shows the error message", async () => {
    await show(state({ status: "error", card: null, error: "Couldn't load d0wi#2726's games: W3Champions answered 503" }));
    expect(screen.getByRole("alert").textContent).toContain("503");
  });

  it("renders nothing when the feature is switched off", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), opponentCard: false });
    await show(state());
    expect(screen.queryByRole("region", { name: "Opponent" })).toBeNull();
  });

  it("renders nothing once the game is over", async () => {
    await show(state({ live: false }));
    expect(screen.queryByRole("region", { name: "Opponent" })).toBeNull();
  });
});
