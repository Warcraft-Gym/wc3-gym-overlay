import { ID_MAP } from "./idMap";

/**
 * Food (population) cost per unit/hero id, used by `extractBuild.ts` to
 * derive the running supply count. Values are the standard WC3 melee
 * population costs; heroes are a flat 5 for every race. Built by mapping
 * over `ID_MAP` (rather than hand-copying the id list a second time) so
 * `Object.keys(FOOD_COST)` holds `ID_MAP`'s unit+hero key set, plus the
 * creeps and mercenaries of `CREEP_COSTS` — see `idMap.test.ts`.
 */
const RAW_COSTS: Record<string, number> = {
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
  hmtt: 4,
  hrtt: 4,
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
  ehip: 2,
  edot: 2,
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

/** Creep and mercenary food, the `fused` column of the game's
 *  Units/UnitBalance.slk (patch 1.30.4). A hired mercenary takes this much
 *  supply. Goblin Zeppelin, Magic Vault and Icy Treasure Box have none. */
const CREEP_COSTS: Record<string, number> = {
  nftb: 3,
  ngir: 4,
  nadk: 5, nadr: 8, nadw: 2, nanb: 1, nanm: 1, nass: 3, nban: 1, nbdk: 5, nbdm: 2, nbdr: 2, nbot: 0,
  nbwm: 8, nbzd: 8, nbzk: 5, nbzw: 2, ncea: 2, ncen: 3, ncer: 2, ndrd: 4, ndrm: 2, ndtb: 3, ndth: 3,
  ndtp: 2, ndtr: 2, ndtt: 2, ndtw: 5, nenf: 4, nfps: 3, nfrs: 3, nfsh: 4, nfsp: 2, nftk: 5, nftr: 2,
  nftt: 2, ngdk: 5, ngna: 1, ngnb: 2, ngno: 1, ngns: 2, ngnv: 4, ngnw: 2, ngrd: 8, ngrk: 2, ngrw: 2,
  ngsp: 2, nhrr: 2, nhrw: 2, nits: 3, nitt: 2, nkob: 1, nkog: 2, nlds: 4, nlsn: 4, nmfs: 2, nmgw: 4,
  nmrr: 2, nmsn: 3, nndk: 5, nndr: 8, nnht: 2, nnwa: 2, nnwl: 3, nogl: 6, nogm: 4, nogr: 2, nomg: 4,
  nowb: 3, npfl: 2, nrdk: 2, nrdr: 5, nrog: 2, nrvs: 3, nrwm: 8, nrzm: 4, nsc2: 2, nsc3: 4, nscb: 1,
  nskf: 2, nskm: 2, nslf: 2, nstl: 4, nsts: 2, nthl: 6, ntrt: 3, nvdg: 4, nvdw: 2, nws1: 4,
};

const HERO_FOOD_COST = 5;

export const FOOD_COST: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(ID_MAP)) {
    if (entry.kind === "unit") out[id] = RAW_COSTS[id] ?? CREEP_COSTS[id] ?? 0;
    else if (entry.kind === "hero") out[id] = HERO_FOOD_COST;
  }
  for (const [id, cost] of Object.entries(CREEP_COSTS)) out[id] ??= cost;
  return out;
})();
