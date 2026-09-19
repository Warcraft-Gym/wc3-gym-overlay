import { describe, expect, it } from "vitest";
import { ID_MAP } from "./idMap";
import { FOOD_COST } from "./foodCost";
import { TRAIN_TIME_S } from "./gameData";

describe("TRAIN_TIME_S", () => {
  it("has exactly the same key set as FOOD_COST (every unit/hero id in ID_MAP)", () => {
    expect(Object.keys(TRAIN_TIME_S).sort()).toEqual(Object.keys(FOOD_COST).sort());
  });

  it("covers every unit/hero id in ID_MAP and nothing else", () => {
    const expectedIds = Object.entries(ID_MAP)
      .filter(([, entry]) => entry.kind === "unit" || entry.kind === "hero")
      .map(([id]) => id)
      .sort();
    expect(Object.keys(TRAIN_TIME_S).sort()).toEqual(expectedIds);
  });

  it("is all non-negative integers", () => {
    for (const [id, seconds] of Object.entries(TRAIN_TIME_S)) {
      expect(Number.isInteger(seconds), `${id}: ${seconds} is not an integer`).toBe(true);
      expect(seconds, `${id}: ${seconds} is negative`).toBeGreaterThanOrEqual(0);
    }
  });

  // Spot list of 10 values verified directly against Liquipedia's unit
  // infobox `|build_time=` field on 2026-09-19 (see gameData.ts's header
  // for the fetch method and why the rest are marked `// unverified`).
  it("matches the cited Liquipedia value for a verified sample of Human units", () => {
    expect(TRAIN_TIME_S.hpea).toBe(15); // https://liquipedia.net/warcraft/Peasant
    expect(TRAIN_TIME_S.hfoo).toBe(20); // https://liquipedia.net/warcraft/Footman
    expect(TRAIN_TIME_S.hrif).toBe(26); // https://liquipedia.net/warcraft/Rifleman
    expect(TRAIN_TIME_S.hkni).toBe(40); // https://liquipedia.net/warcraft/Knight
    expect(TRAIN_TIME_S.hmpr).toBe(28); // https://liquipedia.net/warcraft/Priest
    expect(TRAIN_TIME_S.hsor).toBe(30); // https://liquipedia.net/warcraft/Sorceress
    expect(TRAIN_TIME_S.hspt).toBe(28); // https://liquipedia.net/warcraft/Spell_Breaker
    expect(TRAIN_TIME_S.hmtm).toBe(32); // https://liquipedia.net/warcraft/Mortar_Team
    expect(TRAIN_TIME_S.hgyr).toBe(13); // https://liquipedia.net/warcraft/Flying_Machine
    expect(TRAIN_TIME_S.hgry).toBe(45); // https://liquipedia.net/warcraft/Gryphon_Rider
  });
});
