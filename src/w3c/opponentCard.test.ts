import { describe, expect, it } from "vitest";
import ongoing from "./__fixtures__/ongoing.ElTurry.json";
import season24 from "./__fixtures__/search.d0wi.season24.json";
import season25 from "./__fixtures__/search.d0wi.season25.json";
import akaD0wi from "./__fixtures__/aka.d0wi.json";
import akaLife from "./__fixtures__/aka.Medusa.json";
import detailsFixture from "./__fixtures__/match-details.d0wi.vsUndead.json";
import profileD0wi from "./__fixtures__/player.d0wi.json";
import { matchDetailSchema, w3cMatchSchema, type W3cMatch } from "./client";
import { W3C_HEROES } from "./heroes";
import {
  buildIdentity,
  buildOpponentCard,
  buildStyle,
  styleGameIds,
  mapKey,
  opponentCardSchema,
  opponentGames,
  raceOf,
  readLiveMatch,
  type LiveMatch,
} from "./opponentCard";

const history: W3cMatch[] = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));

/** A real pairing seen live on 2026-10-02 23:03 UTC on Hammerfall:
 *  NecroDoom#11385 (Undead) vs d0wi#2726 (Night Elf, 1858 MMR, FR). */
const live: LiveMatch = {
  matchId: "live-1",
  map: "Hammerfall",
  startTime: "2026-10-02T23:03:50.342+00:00",
  me: { battleTag: "NecroDoom#11385", race: 8, rndRace: null },
  opponent: { battleTag: "d0wi#2726", name: "d0wi", race: 4, rndRace: null, oldMmr: 1858, location: "FR", ranking: { rank: 19 } },
};

describe("W3C fixtures", () => {
  it("parse with the client schemas (real responses, 2026-10-02)", () => {
    expect(() => w3cMatchSchema.parse(ongoing)).not.toThrow();
    expect(history).toHaveLength(109);
  });

  it("every hero name in the real histories is mapped or 'unknown'", () => {
    const names = new Set(history.flatMap((m) => m.teams.flatMap((t) => t.players.flatMap((p) => (p.heroes ?? []).map((h) => h.name)))));
    for (const name of names) expect(name === "unknown" || name in W3C_HEROES).toBe(true);
  });
});

describe("readLiveMatch", () => {
  it("finds me and the opponent in a real live match, case-insensitively", () => {
    const match = w3cMatchSchema.parse(ongoing);
    const read = readLiveMatch(match, "elturry#1520");
    expect(read?.me.battleTag).toBe("ElTurry#1520");
    expect(read?.opponent.battleTag).not.toBe("ElTurry#1520");
    expect(read?.map).toBe("Autumn Leaves v2");
  });

  it("is null when I am not in it", () => {
    expect(readLiveMatch(w3cMatchSchema.parse(ongoing), "Nobody#1")).toBeNull();
  });
});

describe("helpers", () => {
  it("raceOf resolves a random pick", () => {
    expect(raceOf({ race: 0, rndRace: 8 })).toBe("undead");
    expect(raceOf({ race: 0, rndRace: null })).toBe("random");
    expect(raceOf({ race: 4 })).toBe("nightelf");
  });

  it("mapKey drops version suffixes", () => {
    expect(mapKey("Echo Isles v2")).toBe("echo isles");
    expect(mapKey("Hammerfall")).toBe("hammerfall");
    expect(mapKey("Last Refuge v1.5")).toBe("last refuge");
  });

  it("opponentGames keeps only the race they play now and de-duplicates", () => {
    expect(opponentGames([...history, ...history], "d0wi#2726", "nightelf")).toHaveLength(109);
    expect(opponentGames(history, "d0wi#2726", "orc")).toHaveLength(0);
  });
});

describe("buildOpponentCard on the real d0wi history", () => {
  // Expected values computed independently from the raw fixtures (python,
  // same rules) on 2026-10-03.
  const card = buildOpponentCard(live, history);

  it("identifies the opponent", () => {
    expect(card.opponent).toEqual({ battleTag: "d0wi#2726", name: "d0wi", race: "nightelf", mmr: 1858, rank: 19, location: "FR" });
    expect(card.myRace).toBe("undead");
    expect(card.map).toBe("Hammerfall");
  });

  it("sample, form and records", () => {
    expect(card.sampleSize).toBe(109);
    expect(card.thinSample).toBe(false);
    expect(card.form.join("")).toBe("WLWWWLLWLL");
    expect(card.overall).toEqual({ wins: 57, losses: 52 });
    expect(card.vsMyRace).toEqual({ wins: 12, losses: 6 });
    expect(card.onMap).toEqual({ wins: 5, losses: 9 });
  });

  it("openers against your race", () => {
    expect(card.openersBasis).toBe("vs-your-race");
    expect(card.openerGames).toBe(18);
    expect(card.firstHero).toEqual({ hero: "demonhunter", count: 15 });
    expect(card.openers).toEqual([
      { heroes: ["demonhunter", "seawitch"], count: 11 },
      { heroes: ["pandarenbrewmaster", "demonhunter"], count: 2 },
    ]);
    expect(card.avgMinutes).toEqual({ win: 16, loss: 19 });
  });

  it("round-trips through the stored schema", () => {
    expect(opponentCardSchema.parse(card)).toEqual(card);
  });
});

describe("thin data", () => {
  it("falls back to all games for openers when there are few against my race", () => {
    const fewVsHuman = { ...live, me: { battleTag: "Me#1", race: 1, rndRace: null } };
    const card = buildOpponentCard(fewVsHuman, history.slice(0, 9));
    expect(card.vsMyRace?.wins).toBeGreaterThanOrEqual(0);
    expect(card.openersBasis).toBe("all-games");
  });

  it("says the sample is thin and never divides by zero with no history", () => {
    const card = buildOpponentCard(live, []);
    expect(card.sampleSize).toBe(0);
    expect(card.thinSample).toBe(true);
    expect(card.firstHero).toBeNull();
    expect(card.openers).toEqual([]);
    expect(card.avgMinutes).toEqual({ win: null, loss: null });
    expect(card.form).toEqual([]);
  });

  it("has no matchup record when I am random", () => {
    const card = buildOpponentCard({ ...live, me: { battleTag: "Me#1", race: 0, rndRace: null } }, history);
    expect(card.vsMyRace).toBeNull();
    expect(card.openersBasis).toBe("all-games");
  });
});

describe("extras computed from the history (real d0wi data)", () => {
  const card = buildOpponentCard(live, history);

  it("streak, activity and early wins", () => {
    expect(card.streak).toEqual({ result: "W", length: 1 });
    expect(card.gamesLast24h).toBe(8);
    expect(card.earlyWins).toEqual({ count: 3, of: 12 });
  });

  it("no head-to-head when you never met", () => {
    expect(card.headToHead).toBeNull();
  });

  it("head-to-head from your side when you did", () => {
    const asShifu = buildOpponentCard({ ...live, me: { battleTag: "shifu#31833", race: 4, rndRace: null } }, history);
    expect(asShifu.headToHead).toEqual({ wins: 0, losses: 1 });
  });

  it("picks the 8 most recent games against your race for the score sheets", () => {
    expect(styleGameIds(card, history)).toEqual([
      "6ac027418c6ce278894f6b14",
      "6a11d8dfe406684e942f9465",
      "6a11cb6ee406684e942f8ccc",
      "6a118681e406684e942f671f",
      "6a117da3e406684e942f6354",
      "6a11794be406684e942f6148",
      "6a10365f73588e6634d9f9ef",
      "6a10296c73588e6634d9f5cd",
    ]);
  });
});

describe("buildStyle on d0wi's real score sheets", () => {
  it("averages relative to the players he faced", () => {
    const details = detailsFixture.map((d) => matchDetailSchema.parse(d));
    expect(buildStyle(details, "d0wi#2726")).toEqual({
      games: 8,
      goldPerMinute: 560,
      goldVsOpponents: 1.06,
      killsVsOpponents: 1.22,
      upkeepGames: 4,
      mercsPerGame: 1.4,
    });
  });

  it("is null without usable sheets", () => {
    expect(buildStyle([], "d0wi#2726")).toBeNull();
  });
});

describe("buildIdentity", () => {
  it("names a known pro (real /aka response for Medusa#31315)", () => {
    expect(buildIdentity(akaLife, null)).toEqual({ aka: "Life", country: "CN", seasons: 0 });
  });

  it("an unknown player keeps only the seasons played", () => {
    expect(buildIdentity(akaD0wi, profileD0wi)).toEqual({ aka: null, country: null, seasons: 19 });
  });

  it("is null with nothing to go on", () => {
    expect(buildIdentity(null, null)).toBeNull();
  });
});
