import { describe, expect, it } from "vitest";
import { buildProfile, deriveProfileTags, mainRace } from "./profile";
import { D0WI, profileInputs, realProfile } from "./testProfile";

// Expected values computed independently in Python from the same fixtures.
describe("buildProfile on d0wi's real history", () => {
  it("plays Night Elf, with the ladder MMR and rank of the current season", () => {
    const p = realProfile();
    expect(mainRace(profileInputs().history, D0WI)).toBe("nightelf");
    expect(p.race).toBe("nightelf");
    expect(p.name).toBe("d0wi");
    expect(p.mmr).toBe(1830);
    expect(p.rank).toBe(84);
    expect(p.identity).toEqual({ aka: null, country: "FR", seasons: 19 });
  });

  it("MMR history spans both seasons, oldest first, with the peak", () => {
    const p = realProfile();
    expect(p.mmrHistory).toHaveLength(25);
    expect(p.mmrHistory[0]).toBe(1747);
    expect(p.peakMmr).toBe(1904);
  });

  it("records overall, per matchup (random opponents by the race they rolled) and by length", () => {
    const p = realProfile();
    expect(p.overall).toEqual({ wins: 57, losses: 52 });
    expect(p.matchups).toEqual([
      { race: "human", record: { wins: 13, losses: 7 } },
      { race: "orc", record: { wins: 18, losses: 24 } },
      { race: "nightelf", record: { wins: 14, losses: 15 } },
      { race: "undead", record: { wins: 12, losses: 6 } },
    ]);
    expect(p.phases).toEqual({
      early: { wins: 19, losses: 9 },
      mid: { wins: 32, losses: 34 },
      late: { wins: 6, losses: 9 },
    });
  });

  it("best and worst maps need 5 games, named without the version suffix", () => {
    const p = realProfile();
    expect(p.bestMaps).toEqual([
      { map: "Turtle Rock", record: { wins: 9, losses: 2 } },
      { map: "Echo Isles", record: { wins: 5, losses: 2 } },
    ]);
    expect(p.worstMaps).toEqual([
      { map: "Hammerfall", record: { wins: 5, losses: 9 } },
      { map: "Northern Isles", record: { wins: 7, losses: 10 } },
    ]);
  });

  it("form, streak, games in the last 24 h and first heroes", () => {
    const p = realProfile();
    expect(p.form.join("")).toBe("WLWWWLLWLL");
    expect(p.streak).toEqual({ result: "W", length: 1 });
    expect(p.gamesToday).toBe(8);
    expect(p.heroes[0]).toMatchObject({ hero: "demonhunter", count: 99 });
    expect(p.heroes.map((h) => h.hero)).toEqual(["demonhunter", "pandarenbrewmaster", "keeperofthegrove"]);
  });

  it("is null without any 1v1 games", () => {
    expect(buildProfile({ ...profileInputs(), history: [] })).toBeNull();
  });

  it("leaves MMR and rank empty when the ladder has no entry for the race", () => {
    const p = buildProfile({ ...profileInputs(), stats: [], mmrHistory: [] });
    expect(p?.mmr).toBeNull();
    expect(p?.rank).toBeNull();
    expect(p?.peakMmr).toBeNull();
  });
});

describe("deriveProfileTags", () => {
  it("d0wi's strengths and weaknesses, each with its evidence", () => {
    const { strengths, weaknesses } = deriveProfileTags(realProfile());
    expect(strengths.map((t) => `${t.label}: ${t.evidence}`)).toEqual([
      "Strong vs Human: 13–7 (65%)",
      "Strong vs Undead: 12–6 (67%)",
      "Strong on Turtle Rock: 82% here vs 52% overall",
      "Strong early: 19–9 in games under 10 min",
      "Wins fights: 22% more kills than opponents",
    ]);
    expect(weaknesses.map((t) => `${t.label}: ${t.evidence}`)).toEqual([
      "Weak on Hammerfall: 36% here vs 52% overall",
      "Fades late: 6–9 in games over 20 min",
      "Fragile heroes: Loses 2.1 heroes per game",
      "Floats into upkeep: Lost gold to upkeep in 4 of 8 games",
    ]);
  });

  it("says nothing without enough games", () => {
    const p = realProfile();
    const thin = {
      ...p,
      matchups: p.matchups.map((m) => ({ ...m, record: { wins: 3, losses: 0 } })),
      bestMaps: [],
      worstMaps: [],
      phases: { early: { wins: 4, losses: 0 }, mid: { wins: 0, losses: 0 }, late: { wins: 0, losses: 4 } },
      style: null,
    };
    expect(deriveProfileTags(thin)).toEqual({ strengths: [], weaknesses: [] });
  });
});

describe("picking a race (Random included)", () => {
  /** d0wi's history with his 10 newest games re-labelled as Random picks
   *  that rolled Night Elf, the way W3Champions records them. */
  function withRandomGames() {
    const input = profileInputs();
    const newest = [...input.history].sort((a, b) => (a.startTime < b.startTime ? 1 : -1)).slice(0, 10);
    const ids = new Set(newest.map((m) => m.id));
    const history = input.history.map((m) =>
      ids.has(m.id)
        ? {
            ...m,
            teams: m.teams.map((t) => ({
              ...t,
              players: t.players.map((p) => (p.battleTag === D0WI ? { ...p, race: 0, rndRace: 4 } : p)),
            })),
          }
        : m,
    );
    return { ...input, history, stats: [...input.stats, { race: 0, gameMode: 1, mmr: 1700, rank: 300, wins: 6, losses: 4 }] };
  }

  it("counts games per race picked in the lobby", () => {
    expect(realProfile().racesPlayed).toEqual([
      { race: "human", games: 0 },
      { race: "orc", games: 0 },
      { race: "nightelf", games: 109 },
      { race: "undead", games: 0 },
      { race: "random", games: 0 },
    ]);
    expect(buildProfile(withRandomGames())?.racesPlayed.find((r) => r.race === "random")?.games).toBe(10);
  });

  it("Random shows only the Random games, with Random's own ladder entry", () => {
    const p = buildProfile({ ...withRandomGames(), race: "random" });
    expect(p?.race).toBe("random");
    expect((p?.overall.wins ?? 0) + (p?.overall.losses ?? 0)).toBe(10);
    expect(p?.form.join("")).toBe("WLWWWLLWLL");
    expect(p?.mmr).toBe(1700);
    expect(p?.rank).toBe(300);
  });

  it("the picked race leaves the Random games out", () => {
    const p = buildProfile({ ...withRandomGames(), race: "nightelf" });
    expect((p?.overall.wins ?? 0) + (p?.overall.losses ?? 0)).toBe(99);
    expect(p?.mmr).toBe(1830);
  });

  it("a race with no games falls back to the one picked most", () => {
    expect(buildProfile({ ...profileInputs(), race: "orc" })?.race).toBe("nightelf");
  });
});
