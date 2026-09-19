/**
 * F001: per-unit/hero training time in seconds, keyed by the FourCC ids in
 * `idMap.ts`'s `ID_MAP` (every `kind: "unit" | "hero"` entry — mirrors
 * `foodCost.ts`'s `FOOD_COST` key-set-derivation approach so the two stay
 * in lockstep, see `gameData.test.ts`). `extractBuild.ts`'s
 * `computeCancelledOrders` uses this to decide whether a queued order was
 * still training (and therefore cancellable) when a
 * `RemoveUnitFromBuildingQueue` action arrived.
 *
 * Source: https://warcraft.wiki.gg/wiki/<Unit>_(Warcraft_III) — |buildtime=
 * (verified 2026-09-19); Spirit Walker from the patch-note line "Build time
 * reduced to 38"; transforms (Militia, Ethereal Spirit Walker, Destroyer)
 * and mercenaries = 0
 */
export const TRAIN_TIME_S: Record<string, number> = {
  // --- Human ---
  hpea: 15, // https://warcraft.wiki.gg/wiki/Peasant_(Warcraft_III)
  hfoo: 20, // https://warcraft.wiki.gg/wiki/Footman_(Warcraft_III)
  hrif: 26, // https://warcraft.wiki.gg/wiki/Rifleman_(Warcraft_III)
  hkni: 40, // https://warcraft.wiki.gg/wiki/Knight_(Warcraft_III)
  hmpr: 28, // https://warcraft.wiki.gg/wiki/Priest_(Warcraft_III)
  hsor: 30, // https://warcraft.wiki.gg/wiki/Sorceress_(Warcraft_III)
  hspt: 28, // https://warcraft.wiki.gg/wiki/Spell_Breaker_(Warcraft_III)
  hmtm: 32, // https://warcraft.wiki.gg/wiki/Mortar_Team_(Warcraft_III)
  hgyr: 13, // https://warcraft.wiki.gg/wiki/Flying_Machine_(Warcraft_III)
  hgry: 45, // https://warcraft.wiki.gg/wiki/Gryphon_Rider_(Warcraft_III)
  hmtt: 55, // https://warcraft.wiki.gg/wiki/Siege_Engine_(Warcraft_III) — packed state, same trained unit as hrtt
  hrtt: 55, // https://warcraft.wiki.gg/wiki/Siege_Engine_(Warcraft_III)
  hdhw: 28, // https://warcraft.wiki.gg/wiki/Dragonhawk_Rider_(Warcraft_III)
  hmil: 0, // Militia is an instant "Call to Arms" transform, not a queued train order

  // --- Orc ---
  opeo: 15, // https://warcraft.wiki.gg/wiki/Peon_(Warcraft_III)
  ogru: 30, // https://warcraft.wiki.gg/wiki/Grunt_(Warcraft_III)
  ohun: 22, // https://warcraft.wiki.gg/wiki/Troll_Headhunter_(Warcraft_III)
  otbk: 22, // https://warcraft.wiki.gg/wiki/Demolisher_(Warcraft_III)
  ocat: 40, // https://warcraft.wiki.gg/wiki/Kodo_Beast_(Warcraft_III)
  oshm: 30, // https://warcraft.wiki.gg/wiki/Shaman_(Warcraft_III)
  odoc: 30, // https://warcraft.wiki.gg/wiki/Witch_Doctor_(Warcraft_III)
  ospw: 38, // https://warcraft.wiki.gg/wiki/Spirit_Walker_(Warcraft_III) — patch note "Build time reduced to 38"
  ospm: 0, // Ethereal Spirit Walker is a transform, not a queued train order
  orai: 28, // https://warcraft.wiki.gg/wiki/Raider_(Warcraft_III)
  okod: 30, // https://warcraft.wiki.gg/wiki/Kodo_Beast_(Warcraft_III)
  owyv: 35, // https://warcraft.wiki.gg/wiki/Wind_Rider_(Warcraft_III)
  otau: 39, // https://warcraft.wiki.gg/wiki/Tauren_(Warcraft_III)
  otbr: 28, // https://warcraft.wiki.gg/wiki/Troll_Batrider_(Warcraft_III)

  // --- Night Elf ---
  ewsp: 14, // https://warcraft.wiki.gg/wiki/Wisp_(Warcraft_III)
  earc: 20, // https://warcraft.wiki.gg/wiki/Archer_(Warcraft_III)
  esen: 30, // https://warcraft.wiki.gg/wiki/Huntress_(Warcraft_III)
  ebal: 42, // https://warcraft.wiki.gg/wiki/Glaive_Thrower_(Warcraft_III)
  edry: 30, // https://warcraft.wiki.gg/wiki/Druid_of_the_Claw_(Warcraft_III)
  edoc: 35, // https://warcraft.wiki.gg/wiki/Dryad_(Warcraft_III)
  emtg: 50, // https://warcraft.wiki.gg/wiki/Mountain_Giant_(Warcraft_III)
  ehip: 30, // https://warcraft.wiki.gg/wiki/Hippogryph_(Warcraft_III)
  edot: 22, // https://warcraft.wiki.gg/wiki/Druid_of_the_Talon_(Warcraft_III)
  efdr: 25, // https://warcraft.wiki.gg/wiki/Faerie_Dragon_(Warcraft_III)
  echm: 60, // https://warcraft.wiki.gg/wiki/Chimaera_(Warcraft_III)

  // --- Undead ---
  uaco: 15, // https://warcraft.wiki.gg/wiki/Acolyte_(Warcraft_III)
  ugho: 18, // https://warcraft.wiki.gg/wiki/Ghoul_(Warcraft_III)
  ucry: 30, // https://warcraft.wiki.gg/wiki/Crypt_Fiend_(Warcraft_III)
  ugar: 35, // https://warcraft.wiki.gg/wiki/Gargoyle_(Warcraft_III)
  uabo: 40, // https://warcraft.wiki.gg/wiki/Abomination_(Warcraft_III)
  umtw: 36, // https://warcraft.wiki.gg/wiki/Meat_Wagon_(Warcraft_III)
  uobs: 35, // https://warcraft.wiki.gg/wiki/Obsidian_Statue_(Warcraft_III)
  ubsp: 0, // transform (Obsidian Statue -> Destroyer), not a queued train order
  unec: 24, // https://warcraft.wiki.gg/wiki/Necromancer_(Warcraft_III)
  uban: 28, // https://warcraft.wiki.gg/wiki/Banshee_(Warcraft_III)
  ufro: 60, // https://warcraft.wiki.gg/wiki/Frost_Wyrm_(Warcraft_III)
  ushd: 15, // https://warcraft.wiki.gg/wiki/Shade_(Warcraft_III)

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
  Nngs: 55,
  Nbrn: 55,
  Npbm: 55,
  Nbst: 55,
  Nplh: 55,
  Ntin: 55,
  Nfir: 55,
  Nalc: 55,
  Npal: 55,

  // --- Neutral hostile / mercenary-camp units ---
  nftb: 0, // mercenary-camp unit
  ngir: 0, // mercenary-camp unit
};
