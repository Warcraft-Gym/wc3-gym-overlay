import { describe, expect, it } from "vitest";
import detailsFixture from "./__fixtures__/match-details.d0wi.vsUndead.json";
import profileD0wi from "./__fixtures__/player.d0wi.json";
import season24 from "./__fixtures__/search.d0wi.season24.json";
import season25 from "./__fixtures__/search.d0wi.season25.json";
import { matchDetailSchema, w3cMatchSchema } from "./client";
import { buildIdentity, buildOpponentCard, buildStyle, type LiveMatch, type OpponentCard } from "./opponentCard";
import { deriveTags, MAX_TAGS } from "./tags";

const history = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));
const live: LiveMatch = {
  matchId: "live-1",
  map: "Hammerfall",
  startTime: "2026-10-02T23:03:50.342+00:00",
  me: { battleTag: "NecroDoom#11385", race: 8, rndRace: null },
  opponent: { battleTag: "d0wi#2726", name: "d0wi", race: 4, rndRace: null, oldMmr: 1858, location: "FR", ranking: { rank: 19 } },
};
const d0wi: OpponentCard = {
  ...buildOpponentCard(live, history),
  identity: buildIdentity({ name: null }, profileD0wi),
  style: buildStyle(detailsFixture.map((d) => matchDetailSchema.parse(d)), "d0wi#2726"),
};

describe("deriveTags on d0wi's real card (vs Undead on Hammerfall)", () => {
  it("names his tendencies, threats first, with evidence", () => {
    expect(deriveTags(d0wi).map((t) => [t.label, t.tone])).toEqual([
      ["Wins fights", "threat"],
      ["Weak on Hammerfall", "opening"],
      ["Fragile heroes", "opening"],
      ["Floats into upkeep", "opening"],
      ["Always Demon Hunter", "info"],
    ]);
  });

  it("every tag carries the numbers behind it", () => {
    const evidence = Object.fromEntries(deriveTags(d0wi).map((t) => [t.id, t.evidence]));
    expect(evidence["weak-map"]).toBe("36% here vs 52% overall");
    expect(evidence["fragile-heroes"]).toBe("Loses 2.1 heroes per game");
    expect(evidence["wins-fights"]).toBe("22% more kills than his opponents");
    expect(evidence.predictable).toBe("Demon Hunter first in 15 of 18 games");
  });
});

describe("deriveTags thresholds", () => {
  it("streaks of 3+, pros, new accounts, grinders", () => {
    const ids = (c: Partial<OpponentCard>) => deriveTags({ ...d0wi, style: null, ...c }).map((t) => t.id);
    expect(ids({ streak: { result: "W", length: 3 } })).toContain("hot-streak");
    expect(ids({ streak: { result: "L", length: 4 } })).toContain("cold-streak");
    expect(ids({ streak: { result: "W", length: 2 } })).not.toContain("hot-streak");
    expect(ids({ identity: { aka: "Life", country: "CN", seasons: 8 } })).toContain("pro");
    expect(ids({ identity: { aka: null, country: null, seasons: 1 } })).toContain("new-account");
    expect(ids({ gamesLast24h: 10 })).toContain("grinding");
  });

  it("game-length tags need enough games", () => {
    const ids = (phases: OpponentCard["phases"], earlyWins: OpponentCard["earlyWins"] = null) =>
      deriveTags({ ...d0wi, style: null, phases, earlyWins }).map((t) => t.id);
    const r = (wins: number, losses: number) => ({ wins, losses });
    expect(ids({ early: r(0, 0), mid: r(0, 0), late: r(4, 1) })).toContain("strong-late");
    expect(ids({ early: r(0, 0), mid: r(0, 0), late: r(1, 4) })).toContain("fades-late");
    expect(ids({ early: r(0, 0), mid: r(0, 0), late: r(3, 1) })).not.toContain("strong-late");
    expect(ids(null, { count: 4, of: 10 })).toContain("rusher");
    expect(ids(null, { count: 2, of: 10 })).not.toContain("rusher");
  });

  it("caps the strip", () => {
    const busy: OpponentCard = {
      ...d0wi,
      identity: { aka: "Life", country: "CN", seasons: 8 },
      streak: { result: "W", length: 5 },
      gamesLast24h: 12,
      style: { games: 8, goldPerMinute: 700, goldVsOpponents: 1.3, killsVsOpponents: 1.4, upkeepGames: 6, mercsPerGame: 2, heroKillsPerGame: 2, opponentHeroKillsPerGame: 2 },
    };
    const tags = deriveTags(busy);
    expect(tags).toHaveLength(MAX_TAGS);
    expect(tags[0].tone).toBe("threat");
  });
});
