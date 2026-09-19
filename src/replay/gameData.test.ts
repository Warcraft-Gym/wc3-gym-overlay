import { describe, expect, it } from "vitest";
import { ID_MAP } from "./idMap";
import { FOOD_COST } from "./foodCost";
import { BUILD_TIME_S, HALL_LINE, PRODUCER_OF, TRAIN_TIME_S } from "./gameData";

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

  // Full reference table, every value verified against warcraft.wiki.gg's
  // unit/hero infobox `|buildtime=` field on 2026-09-19 (see gameData.ts's
  // header for the exact source URLs and the transform/mercenary = 0 rule).
  it("matches the warcraft.wiki.gg-verified reference for every id", () => {
    const REFERENCE: Record<string, number> = {
      // --- Human ---
      hpea: 15,
      hfoo: 20,
      hrif: 26,
      hkni: 40,
      hmpr: 28,
      hsor: 30,
      hspt: 28,
      hmtm: 32,
      hgyr: 13,
      hgry: 45,
      hmtt: 55,
      hrtt: 55,
      hdhw: 28,
      hmil: 0,

      // --- Orc ---
      opeo: 15,
      ogru: 30,
      ohun: 22,
      otbk: 22,
      ocat: 40,
      oshm: 30,
      odoc: 30,
      ospw: 38,
      ospm: 0,
      orai: 28,
      okod: 30,
      owyv: 35,
      otau: 39,
      otbr: 28,

      // --- Night Elf ---
      ewsp: 14,
      earc: 20,
      esen: 30,
      ebal: 42,
      edry: 30,
      edoc: 35,
      emtg: 50,
      ehip: 30,
      edot: 22,
      efdr: 25,
      echm: 60,

      // --- Undead ---
      uaco: 15,
      ugho: 18,
      ucry: 30,
      ugar: 35,
      uabo: 40,
      umtw: 36,
      uobs: 35,
      ubsp: 0,
      unec: 24,
      uban: 28,
      ufro: 60,
      ushd: 15,

      // --- Heroes (every race + neutral tavern heroes) ---
      Hamg: 55,
      Hpal: 55,
      Hmkg: 55,
      Hblm: 55,
      Obla: 55,
      Ofar: 55,
      Otch: 55,
      Oshd: 55,
      Edem: 55,
      Ekee: 55,
      Emoo: 55,
      Ewar: 55,
      Udea: 55,
      Ulic: 55,
      Udre: 55,
      Ucrl: 55,
      // --- Tavern heroes (F002: hired instantly, not 55 — game knowledge,
      // the wiki pages carry no build time) ---
      Nngs: 0,
      Nbrn: 0,
      Npbm: 0,
      Nbst: 0,
      Nplh: 0,
      Ntin: 0,
      Nfir: 0,
      Nalc: 0,
      Npal: 0,

      // --- Neutral hostile / mercenary-camp units ---
      nftb: 0,
      ngir: 0,
    };

    expect(TRAIN_TIME_S).toEqual(REFERENCE);
  });

  it("hires every tavern hero (N*) instantly", () => {
    const tavernIds = ["Nngs", "Nbrn", "Npbm", "Nbst", "Nplh", "Ntin", "Nfir", "Nalc", "Npal"];
    for (const id of tavernIds) expect(TRAIN_TIME_S[id]).toBe(0);
  });
});

const BUILDING_IDS = new Set(Object.entries(ID_MAP).filter(([, v]) => v.kind === "building").map(([id]) => id));
const NEVER_QUEUED_IDS = new Set(["hmil", "ospm", "ubsp", "ushd", "nftb", "ngir"]);

describe("PRODUCER_OF", () => {
  it("covers every unit/hero id in ID_MAP", () => {
    const expectedIds = Object.entries(ID_MAP)
      .filter(([, entry]) => entry.kind === "unit" || entry.kind === "hero")
      .map(([id]) => id)
      .sort();
    expect(Object.keys(PRODUCER_OF).sort()).toEqual(expectedIds);
  });

  it("maps every id to a real building id (present in ID_MAP as kind: building), \"tavern\", or undefined for the six never-queued ids", () => {
    for (const [id, producer] of Object.entries(PRODUCER_OF)) {
      if (NEVER_QUEUED_IDS.has(id)) {
        expect(producer, `${id} should have no producer`).toBeUndefined();
        continue;
      }
      if (producer === "tavern") continue;
      expect(producer, `${id}: ${producer} is not undefined/"tavern" and not a known building id`).toBeDefined();
      expect(BUILDING_IDS.has(producer!), `${id}: ${producer} is not a building id in ID_MAP`).toBe(true);
    }
  });

  it("routes every tavern hero (N*) to \"tavern\"", () => {
    for (const [id, producer] of Object.entries(PRODUCER_OF)) {
      if (/^N/.test(id)) expect(producer).toBe("tavern");
    }
  });

  it("has no producer for the six never-queued ids (transforms/summons/mercenaries)", () => {
    for (const id of NEVER_QUEUED_IDS) expect(PRODUCER_OF[id]).toBeUndefined();
  });
});

describe("HALL_LINE", () => {
  it("is the literal tier-up table", () => {
    expect(HALL_LINE).toEqual({
      hkee: "htow",
      hcas: "htow",
      ostr: "ogre",
      ofrt: "ogre",
      etoa: "etol",
      etoe: "etol",
      unp1: "unpl",
      unp2: "unpl",
    });
  });
});

describe("BUILD_TIME_S", () => {
  it("is the literal, warcraft.wiki.gg-verified table", () => {
    expect(BUILD_TIME_S).toEqual({
      htow: 180,
      hbar: 60,
      hars: 70,
      harm: 60,
      hgra: 75,
      halt: 60,
      ogre: 135,
      obar: 60,
      obea: 60,
      osld: 70,
      otto: 70,
      oalt: 60,
      etol: 120,
      eaom: 60,
      eaoe: 70,
      eaow: 60,
      edos: 80,
      eate: 60,
      unpl: 90,
      usep: 60,
      uslh: 60,
      utod: 60,
      ubon: 70,
      uaod: 60,
    });
  });
});
