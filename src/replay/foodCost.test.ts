import { describe, expect, it } from "vitest";
import { FOOD_COST } from "./foodCost";
import { ID_MAP } from "./idMap";

/**
 * Literal WC3 melee population-cost table, kept independent of
 * `foodCost.ts`'s own `RAW_COSTS` so a wrong value there can't silently
 * match itself. Heroes are a flat 5 across every race.
 */
const REFERENCE: Record<string, number> = {
  // Human
  hpea: 1,
  hfoo: 2,
  hrif: 3,
  hkni: 4,
  hmpr: 2,
  hsor: 2,
  hspt: 3,
  hmtm: 3,
  hgyr: 1,
  hgry: 4,
  hmtt: 3,
  hrtt: 3,
  hdhw: 3,
  hmil: 0,
  // Orc
  opeo: 1,
  ogru: 3,
  ohun: 2,
  otbk: 2,
  ocat: 4,
  oshm: 2,
  odoc: 2,
  ospw: 3,
  ospm: 0,
  orai: 3,
  okod: 4,
  owyv: 4,
  otau: 5,
  otbr: 2,
  // Night elf
  ewsp: 1,
  earc: 2,
  esen: 3,
  ebal: 3,
  edry: 3,
  edoc: 4,
  emtg: 7,
  ehip: 3,
  edot: 3,
  efdr: 2,
  echm: 5,
  // Undead
  uaco: 1,
  ugho: 2,
  ucry: 3,
  ugar: 2,
  uabo: 4,
  umtw: 4,
  uobs: 3,
  ubsp: 5,
  unec: 2,
  uban: 2,
  ufro: 7,
  ushd: 1,
};

for (const [id, entry] of Object.entries(ID_MAP)) {
  if (entry.kind === "hero") REFERENCE[id] = 5;
}

describe("FOOD_COST", () => {
  it("matches the WC3 melee population cost table exactly", () => {
    expect(FOOD_COST).toMatchObject(REFERENCE);
  });

  it("has exactly ID_MAP's unit+hero id set as keys", () => {
    const expectedKeys = Object.entries(ID_MAP)
      .filter(([, entry]) => entry.kind === "unit" || entry.kind === "hero")
      .map(([id]) => id)
      .sort();
    expect(Object.keys(FOOD_COST).sort()).toEqual(expectedKeys);
  });
});
