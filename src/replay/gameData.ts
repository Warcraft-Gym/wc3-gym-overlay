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

  // --- Racial heroes (55, every race) ---
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

  // --- Tavern heroes (F002: hired instantly, corrected from F001's 55 —
  // game knowledge; the wiki pages carry no build time) ---
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
  nftb: 0, // mercenary-camp unit
  ngir: 0, // mercenary-camp unit
};

/**
 * F002: unit/hero id -> the building id that trains it, for the
 * per-producer queue simulation in `rejectedOrders.ts`. Values are FourCC
 * building ids from `w3gjs`'s `mappings.buildings` table, the string
 * literal `"tavern"` for the nine neutral tavern heroes (always available,
 * unlimited capacity — any tavern anywhere can train any hero), or
 * `undefined` for ids that are never subject to the queue/rejection model:
 * `hmil` (Call to Arms transform), `ospm` (Ethereal Spirit Walker
 * transform), `ubsp` (Destroyer transform), `ushd` (Shade — a free Acolyte
 * upgrade, not a queued order), `nftb`/`ngir` (mercenary-camp hires).
 *
 * Verified 2026-09-19 by the orchestrator against w3gjs's `mappings.buildings`.
 */
export const PRODUCER_OF: Record<string, string | undefined> = {
  // --- Human ---
  hpea: "htow",
  hfoo: "hbar",
  hrif: "hbar",
  hkni: "hbar",
  hmpr: "hars",
  hsor: "hars",
  hspt: "hars",
  hmtm: "harm",
  hgyr: "harm",
  hmtt: "harm",
  hrtt: "harm",
  hgry: "hgra",
  hdhw: "hgra",
  Hamg: "halt",
  Hpal: "halt",
  Hmkg: "halt",
  Hblm: "halt",
  hmil: undefined,

  // --- Orc ---
  opeo: "ogre",
  ogru: "obar",
  ohun: "obar",
  otbk: "obar",
  ocat: "obar",
  oshm: "osld",
  odoc: "osld",
  ospw: "osld",
  orai: "obea",
  okod: "obea",
  owyv: "obea",
  otbr: "obea",
  otau: "otto",
  Obla: "oalt",
  Ofar: "oalt",
  Otch: "oalt",
  Oshd: "oalt",
  ospm: undefined,

  // --- Night elf ---
  ewsp: "etol",
  earc: "eaom",
  esen: "eaom",
  ebal: "eaom",
  edry: "eaoe",
  edoc: "eaoe",
  emtg: "eaoe",
  ehip: "eaow",
  edot: "eaow",
  efdr: "eaow",
  echm: "edos",
  Edem: "eate",
  Ekee: "eate",
  Emoo: "eate",
  Ewar: "eate",

  // --- Undead ---
  uaco: "unpl",
  ugho: "usep",
  ucry: "usep",
  ugar: "usep",
  uabo: "uslh",
  umtw: "uslh",
  uobs: "uslh",
  unec: "utod",
  uban: "utod",
  ufro: "ubon",
  Udea: "uaod",
  Ulic: "uaod",
  Udre: "uaod",
  Ucrl: "uaod",
  ubsp: undefined,
  ushd: undefined,

  // --- Tavern heroes (always available, unlimited) ---
  Nngs: "tavern",
  Nbrn: "tavern",
  Npbm: "tavern",
  Nbst: "tavern",
  Nplh: "tavern",
  Ntin: "tavern",
  Nfir: "tavern",
  Nalc: "tavern",
  Npal: "tavern",

  // --- Never queued (transforms/summons/mercenaries) ---
  nftb: undefined,
  ngir: undefined,
};

/**
 * F002: a tier-up building id -> the producer id it upgrades in place (the
 * production queue, and the physical building, are the same across a
 * tier-up — Keep/Castle is still "the town hall"). The game starts with
 * exactly one hall at t = 0; a tier-up build event never adds a second
 * producer instance (see `rejectedOrders.ts`).
 */
export const HALL_LINE: Record<string, string> = {
  hkee: "htow",
  hcas: "htow",
  ostr: "ogre",
  ofrt: "ogre",
  etoa: "etol",
  etoe: "etol",
  unp1: "unpl",
  unp2: "unpl",
};

/**
 * F002: producer building id -> seconds to construct (verified 2026-09-19,
 * warcraft.wiki.gg `|buildtime=`). A producer ordered (a `"building"` event)
 * at `ms` becomes available at `ms + BUILD_TIME_S × 1000` — construction is
 * assumed to start on the order and to complete (cancelled/destroyed
 * buildings are not modelled). The four starting halls are available at
 * t = 0 without needing a `"building"` event (see `rejectedOrders.ts`).
 */
export const BUILD_TIME_S: Record<string, number> = {
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
};
