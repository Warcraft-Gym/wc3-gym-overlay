import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WINDOW_OPPONENT } from "../../config";
import { host } from "../../host";
import { OPPONENT, SETTINGS, type OpponentState } from "../../store/keys";
import { readKey, writeKey } from "../../store/state";
import season24 from "../../w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "../../w3c/__fixtures__/search.d0wi.season25.json";
import akaLife from "../../w3c/__fixtures__/aka.Medusa.json";
import detailsFixture from "../../w3c/__fixtures__/match-details.d0wi.vsUndead.json";
import profileD0wi from "../../w3c/__fixtures__/player.d0wi.json";
import { matchDetailSchema, w3cMatchSchema } from "../../w3c/client";
import { buildIdentity, buildOpponentCard, buildStyle, type LiveMatch } from "../../w3c/opponentCard";
import {
  emptyMessage,
  formatRecord,
  formatRelative,
  identityLine,
  momentumLine,
  OpponentPanel,
  phasesLine,
  winLossSuffix,
} from "./OpponentPanel";

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
    expect(screen.getByText("d0wi")).toBeTruthy();
    expect(screen.getByText("Night Elf")).toBeTruthy(); // the crest's screen-reader name
    expect(screen.getByText("1858 MMR · rank 19 · FR")).toBeTruthy();
    expect(screen.getByText("12–6 (67%)")).toBeTruthy();
    expect(screen.getByText("5–9 (36%)")).toBeTruthy();
    // "vs Undead" and "Opens vs Undead" are crests now, named for screen readers.
    expect(screen.getAllByText("Undead")).toHaveLength(2);
    expect(screen.getByText(/^Opens vs/)).toBeTruthy();
    expect(screen.queryByText(/Night Elf ·/)).toBeNull();
    expect(screen.getByText("15 of 18 · 9–6")).toBeTruthy();
    expect(screen.getByText("11 of 18 · 6–5")).toBeTruthy();
    expect(screen.getByText("2 of 18 · 2–0")).toBeTruthy();
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

const withExtras = {
  ...card,
  extrasStatus: "ok" as const,
  identity: buildIdentity(akaLife, profileD0wi),
  style: buildStyle(detailsFixture.map((d) => matchDetailSchema.parse(d)), "d0wi#2726"),
};

describe("extras formatting", () => {
  it("formatRelative", () => {
    expect(formatRelative(1.06)).toBe("+6%");
    expect(formatRelative(1.22)).toBe("+22%");
    expect(formatRelative(0.8)).toBe("-20%");
    expect(formatRelative(1)).toBe("+0%");
  });

  it("identityLine", () => {
    expect(identityLine({ aka: "Life", country: "CN", seasons: 19 })).toBe("aka Life · CN · 19 seasons");
    expect(identityLine({ aka: "Life", country: null, seasons: 1 })).toBe("aka Life · first season");
    expect(identityLine({ aka: null, country: null, seasons: 19 })).toBe("19 seasons");
    expect(identityLine({ aka: null, country: null, seasons: 1 })).toBe("First season");
    expect(identityLine(null)).toBeNull();
  });

  it("momentumLine skips a single result", () => {
    expect(momentumLine(card)).toBe("8 games in 24 h");
    expect(momentumLine({ ...card, streak: { result: "L", length: 3 }, gamesLast24h: 1 })).toBe("3 losses in a row · 1 game in 24 h");
    expect(momentumLine({ ...card, streak: { result: "W", length: 1 }, gamesLast24h: 0 })).toBeNull();
  });
});

describe("OpponentPanel with extras (real d0wi data, Life's aka)", () => {
  it("shows identity, momentum, early wins and play style", async () => {
    await show(state({ card: withExtras }));
    expect(screen.getByText("aka Life · CN · 19 seasons")).toBeTruthy();
    expect(screen.getByText("8 games in 24 h")).toBeTruthy();
    expect(screen.getByText("Wins before 10 min")).toBeTruthy();
    expect(screen.getByText("3 of 12")).toBeTruthy();
    expect(screen.getByText(/560 gold\/min · \+6% gold vs his opponents/)).toBeTruthy();
    expect(screen.getByText("+22% kills vs his opponents")).toBeTruthy();
    expect(screen.getByText("Into upkeep in 4 of 8 · 1.4 mercs per game")).toBeTruthy();
    expect(screen.queryByText("You vs them")).toBeNull();
  });

  it("shows the head-to-head when you have met", async () => {
    await show(state({ card: { ...withExtras, headToHead: { wins: 2, losses: 1 } } }));
    expect(screen.getByText("You vs them")).toBeTruthy();
    expect(screen.getByText("2–1 (67%)")).toBeTruthy();
  });

  it("says the play style is loading", async () => {
    await show(state({ card: { ...card, extrasStatus: "loading" } }));
    expect(screen.getByText("Loading play style…")).toBeTruthy();
  });
});

describe("top picks (real d0wi data)", () => {
  const top = {
    ...withExtras,
    winChance: 0.53,
    myRecord: { vsRace: { wins: 12, losses: 6 }, onMap: { wins: 1, losses: 1 } },
  };

  it("formatters", () => {
    expect(winLossSuffix({ wins: 6, losses: 5 })).toBe(" · 6–5");
    expect(winLossSuffix({})).toBe("");
    expect(phasesLine(card.phases)).toBe("Under 10 min 3–1 · 10–20 min 6–2 · 20+ min 3–3");
    expect(phasesLine({ early: { wins: 0, losses: 0 }, mid: { wins: 1, losses: 0 }, late: { wins: 0, losses: 0 } })).toBe("10–20 min 1–0");
    expect(phasesLine(null)).toBeNull();
  });

  it("shows win chance, game length, opener records, hero kills and your record", async () => {
    await show(state({ card: top }));
    expect(screen.getByText("Your win chance")).toBeTruthy();
    expect(screen.getByText("53% (MMR)")).toBeTruthy();
    expect(screen.getByText("Under 10 min 3–1 · 10–20 min 6–2 · 20+ min 3–3")).toBeTruthy();
    expect(screen.getByText("15 of 18 · 9–6")).toBeTruthy();
    expect(screen.getByText("11 of 18 · 6–5")).toBeTruthy();
    expect(screen.getByText("2 of 18 · 2–0")).toBeTruthy();
    expect(screen.getByText("Hero kills 0.8 per game · loses 2.1")).toBeTruthy();
    expect(screen.getByText("Your games on Hammerfall")).toBeTruthy();
    expect(screen.getByText("1–1 (50%)")).toBeTruthy();
    expect(screen.getAllByText("12–6 (67%)")).toHaveLength(2); // their record vs you-race, and yours vs their race
  });
});
