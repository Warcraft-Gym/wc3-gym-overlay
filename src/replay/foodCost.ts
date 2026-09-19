import { ID_MAP } from "./idMap";

/**
 * Food (population) cost per unit/hero id, used by `extractBuild.ts` to
 * derive the running supply count. Values are the standard WC3 melee
 * population costs; heroes are a flat 5 for every race. Built by mapping
 * over `ID_MAP` (rather than hand-copying the id list a second time) so
 * `Object.keys(FOOD_COST)` is always exactly `ID_MAP`'s unit+hero key set —
 * see `idMap.test.ts`.
 */
const RAW_COSTS: Record<string, number> = {
  // Human
  hpea: 1,
  hfoo: 2,
  hrif: 3,
  hkni: 4,
  hmpr: 2,
  hsor: 2,
  hspt: 2,
  hmtm: 3,
  hgyr: 2,
  hgry: 4,
  hmtt: 4,
  hrtt: 4,
  hdhw: 3,
  hmil: 0,
  // Orc
  opeo: 1,
  ogru: 2,
  ohun: 2,
  otbk: 2,
  ocat: 3,
  oshm: 2,
  odoc: 2,
  ospw: 3,
  ospm: 0,
  orai: 2,
  okod: 4,
  owyv: 3,
  otau: 5,
  otbr: 2,
  // Night elf
  ewsp: 1,
  earc: 2,
  esen: 2,
  ebal: 3,
  edry: 2,
  edoc: 3,
  emtg: 6,
  ehip: 2,
  edot: 2,
  efdr: 3,
  echm: 5,
  // Undead
  uaco: 0,
  ugho: 2,
  ucry: 2,
  ugar: 2,
  uabo: 4,
  umtw: 3,
  uobs: 3,
  ubsp: 3,
  unec: 2,
  uban: 2,
  ufro: 6,
  ushd: 1,
};

const HERO_FOOD_COST = 5;

export const FOOD_COST: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(ID_MAP)) {
    if (entry.kind === "unit") out[id] = RAW_COSTS[id] ?? 0;
    else if (entry.kind === "hero") out[id] = HERO_FOOD_COST;
  }
  return out;
})();
