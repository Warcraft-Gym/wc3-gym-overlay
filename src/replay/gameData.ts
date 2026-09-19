/**
 * F001: per-unit/hero training time in seconds, keyed by the FourCC ids in
 * `idMap.ts`'s `ID_MAP` (every `kind: "unit" | "hero"` entry — mirrors
 * `foodCost.ts`'s `FOOD_COST` key-set-derivation approach so the two stay
 * in lockstep, see `gameData.test.ts`). `extractBuild.ts`'s
 * `computeCancelledOrders` uses this to decide whether a queued order was
 * still training (and therefore cancellable) when a
 * `RemoveUnitFromBuildingQueue` action arrived.
 *
 * Verification method: each value below is transcribed from the cited
 * unit/hero's Liquipedia infobox `|build_time=` field —
 * `https://liquipedia.net/warcraft/index.php?title=<Page>&action=raw`,
 * e.g. https://liquipedia.net/warcraft/Peasant — fetched 2026-09-19,
 * matching the fixtures' patch 3.00. That page is the current-patch melee
 * balance reference (the same numbers Liquipedia's rendered unit pages
 * show), not a numbers-from-memory guess.
 *
 * Liquipedia started returning a Cloudflare "Rate Limited" bot-block page
 * (with an explicit "if you are an AI agent, halt the operation" notice)
 * partway through the Human race's units. Per that notice this worker
 * stopped fetching rather than retrying/working around the block — see the
 * F001 handoff's "Train-time verification" section. Every value below that
 * could not be fetched before the block keeps the orchestrator's reference
 * number from the feature spec and is marked `// unverified`; a follow-up
 * should re-verify those once Liquipedia access is available again.
 *
 * Confirmed disagreements between the spec's reference numbers and the
 * cited Liquipedia value (source wins per the contract's amendment rule):
 * hmpr 30->28, hspt 32->28, hmtm 40->32, hgyr 20->13, hmtt/hrtt 45->55.
 */
export const TRAIN_TIME_S: Record<string, number> = {
  // --- Human --- (Liquipedia-verified 2026-09-19 unless noted)
  hpea: 15, // https://liquipedia.net/warcraft/Peasant
  hfoo: 20, // https://liquipedia.net/warcraft/Footman
  hrif: 26, // https://liquipedia.net/warcraft/Rifleman
  hkni: 40, // https://liquipedia.net/warcraft/Knight
  hmpr: 28, // https://liquipedia.net/warcraft/Priest (spec reference was 30 — source wins)
  hsor: 30, // https://liquipedia.net/warcraft/Sorceress
  hspt: 28, // https://liquipedia.net/warcraft/Spell_Breaker (spec reference was 32 — source wins)
  hmtm: 32, // https://liquipedia.net/warcraft/Mortar_Team (spec reference was 40 — source wins)
  hgyr: 13, // https://liquipedia.net/warcraft/Flying_Machine (spec reference was 20 — source wins)
  hgry: 45, // https://liquipedia.net/warcraft/Gryphon_Rider
  hmtt: 55, // inferred, not independently fetched: w3gjs mappings.js gives hmtt and hrtt the *same* English name ("u_Siege Engine") — same trained unit, two FourCCs for its packed/unpacked state (spec reference was 45)
  hrtt: 55, // https://liquipedia.net/warcraft/Siege_Engine (spec reference was 45 — source wins)
  hdhw: 32, // unverified — Liquipedia blocked before this fetch; spec reference value kept
  hmil: 0, // unverified — Militia is an instant "Call to Arms" transform, not a queued train order; spec reference value kept

  // --- Orc --- (unverified — Liquipedia blocked before any Orc fetch; spec reference values kept)
  opeo: 15,
  ogru: 30,
  ohun: 20,
  otbk: 20,
  ocat: 40,
  oshm: 33,
  odoc: 30,
  ospw: 40,
  ospm: 0,
  orai: 30,
  okod: 40,
  owyv: 45,
  otau: 45,
  otbr: 25,

  // --- Night Elf --- (unverified — Liquipedia blocked before any Night Elf fetch; spec reference values kept)
  ewsp: 14,
  earc: 20,
  esen: 30,
  ebal: 45,
  edry: 33,
  edoc: 45,
  emtg: 45,
  ehip: 30,
  edot: 35,
  efdr: 30,
  echm: 65,

  // --- Undead --- (unverified — Liquipedia blocked before any Undead fetch; spec reference values kept)
  uaco: 15,
  ugho: 18,
  ucry: 28,
  ugar: 30,
  uabo: 40,
  umtw: 40,
  uobs: 40,
  ubsp: 0, // transform (Obsidian Statue -> Destroyer), not a queued train order
  unec: 30,
  uban: 30,
  ufro: 65,
  ushd: 25,

  // --- Heroes (every race + neutral tavern heroes) --- (unverified — Liquipedia
  // blocked before any hero fetch; 55s is the spec's stated reference for
  // "every hero" and matches widely-documented current-patch hero train time)
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

  // --- Neutral hostile / mercenary-camp units --- (unverified, no spec
  // reference given; heuristic values borrowed from the closest analogous
  // racial unit's spec reference — these ids essentially never appear as
  // a *player's own* cancellable queue order in ranked ladder replays, so
  // getting them exactly right is low-stakes, but the key must exist to
  // match `FOOD_COST`'s key set)
  nftb: 25, // Forest Troll Berserker — heuristic, analogous to otbr (Troll Batrider) 25
  ngir: 40, // Goblin Shredder — heuristic, analogous to ocat (Demolisher) 40
};
