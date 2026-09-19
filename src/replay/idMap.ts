import { HERO_NAMES, ITEM_NAMES, UPGRADE_NAMES } from "./w3gjsData";
import type { DescribedId, IdKind } from "./types";

/**
 * WC3 object id -> site icon key / display title / event kind, for every
 * melee unit, building (including tier-up ids) and hero of the four races,
 * plus the tavern-recruitable neutral heroes. Ids are the FourCC codes
 * `w3gjs` decodes from the replay stream (`node_modules/w3gjs/dist/esm/
 * mappings.js`'s `units`/`buildings` tables gave the authoritative id ->
 * English-name pairs this was built from); icon keys are matched against
 * the site's `/api/icons` manifest (141 keys, snapshotted in
 * `__fixtures__/icon-keys.json`).
 *
 * A handful of ids have no matching site icon (human's Cannon Tower, night
 * elf's Entangled Gold Mine is simply not tracked, the Forsaken Paladin
 * neutral hero) — those keep a real title but omit `iconKey`, per the
 * feature spec's "leave icon undefined but keep the title" fallback.
 */
export const ID_MAP: Record<string, { iconKey?: string; title: string; kind: IdKind }> = {
  // --- Human units ---
  hpea: { iconKey: "hu-peasant", title: "Peasant", kind: "unit" },
  hfoo: { iconKey: "hu-footman", title: "Footman", kind: "unit" },
  hrif: { iconKey: "hu-rifleman", title: "Rifleman", kind: "unit" },
  hkni: { iconKey: "hu-knight", title: "Knight", kind: "unit" },
  hmpr: { iconKey: "hu-priest", title: "Priest", kind: "unit" },
  hsor: { iconKey: "hu-sorceress", title: "Sorceress", kind: "unit" },
  hspt: { iconKey: "hu-spellbreaker", title: "Spell Breaker", kind: "unit" },
  hmtm: { iconKey: "hu-mortar", title: "Mortar Team", kind: "unit" },
  hgyr: { iconKey: "hu-flying-machine", title: "Flying Machine", kind: "unit" },
  hgry: { iconKey: "hu-gryphon", title: "Gryphon Rider", kind: "unit" },
  hmtt: { iconKey: "hu-siege-engine", title: "Siege Engine", kind: "unit" },
  hrtt: { iconKey: "hu-siege-engine", title: "Siege Engine", kind: "unit" },
  hdhw: { iconKey: "hu-dragonhawk", title: "Dragonhawk Rider", kind: "unit" },
  hmil: { iconKey: "hu-militia", title: "Militia", kind: "unit" },
  // --- Human buildings ---
  htow: { iconKey: "hu-town-hall", title: "Town Hall", kind: "building" },
  hkee: { iconKey: "hu-keep", title: "Keep", kind: "building" },
  hcas: { iconKey: "hu-castle", title: "Castle", kind: "building" },
  hhou: { iconKey: "hu-farm", title: "Farm", kind: "building" },
  halt: { iconKey: "hu-altar", title: "Altar of Kings", kind: "building" },
  hbar: { iconKey: "hu-barracks", title: "Barracks", kind: "building" },
  hlum: { iconKey: "hu-lumber-mill", title: "Lumber Mill", kind: "building" },
  hbla: { iconKey: "hu-blacksmith", title: "Blacksmith", kind: "building" },
  hars: { iconKey: "hu-arcane-sanctum", title: "Arcane Sanctum", kind: "building" },
  harm: { iconKey: "hu-workshop", title: "Workshop", kind: "building" },
  hgra: { iconKey: "hu-aviary", title: "Gryphon Aviary", kind: "building" },
  hvlt: { iconKey: "hu-arcane-vault", title: "Arcane Vault", kind: "building" },
  hwtw: { iconKey: "hu-scout-tower", title: "Scout Tower", kind: "building" },
  hgtw: { iconKey: "hu-guard-tower", title: "Guard Tower", kind: "building" },
  hatw: { iconKey: "hu-arcane-tower", title: "Arcane Tower", kind: "building" },
  hctw: { title: "Cannon Tower", kind: "building" },
  // --- Human heroes ---
  Hamg: { iconKey: "hu-archmage", title: "Archmage", kind: "hero" },
  Hpal: { iconKey: "hu-paladin", title: "Paladin", kind: "hero" },
  Hmkg: { iconKey: "hu-mountain-king", title: "Mountain King", kind: "hero" },
  Hblm: { iconKey: "hu-blood-mage", title: "Blood Mage", kind: "hero" },

  // --- Orc units ---
  opeo: { iconKey: "or-peon", title: "Peon", kind: "unit" },
  ogru: { iconKey: "or-grunt", title: "Grunt", kind: "unit" },
  ohun: { iconKey: "or-headhunter", title: "Troll Headhunter", kind: "unit" },
  otbk: { iconKey: "or-berserker", title: "Troll Berserker", kind: "unit" },
  ocat: { iconKey: "or-demolisher", title: "Demolisher", kind: "unit" },
  oshm: { iconKey: "or-shaman", title: "Shaman", kind: "unit" },
  odoc: { iconKey: "or-witch-doctor", title: "Witch Doctor", kind: "unit" },
  ospw: { iconKey: "or-spirit-walker", title: "Spirit Walker", kind: "unit" },
  ospm: { iconKey: "or-spirit-walker", title: "Spirit Walker", kind: "unit" },
  orai: { iconKey: "or-raider", title: "Raider", kind: "unit" },
  okod: { iconKey: "or-kodo", title: "Kodo Beast", kind: "unit" },
  owyv: { iconKey: "or-wind-rider", title: "Wind Rider", kind: "unit" },
  otau: { iconKey: "or-tauren", title: "Tauren", kind: "unit" },
  otbr: { iconKey: "or-batrider", title: "Troll Batrider", kind: "unit" },
  // --- Orc buildings ---
  ogre: { iconKey: "or-great-hall", title: "Great Hall", kind: "building" },
  ostr: { iconKey: "or-stronghold", title: "Stronghold", kind: "building" },
  ofrt: { iconKey: "or-fortress", title: "Fortress", kind: "building" },
  otrb: { iconKey: "or-burrow", title: "Orc Burrow", kind: "building" },
  orbr: { iconKey: "or-burrow", title: "Reinforced Orc Burrow", kind: "building" },
  oalt: { iconKey: "or-altar", title: "Altar of Storms", kind: "building" },
  obar: { iconKey: "or-barracks", title: "Barracks", kind: "building" },
  ofor: { iconKey: "or-war-mill", title: "War Mill", kind: "building" },
  osld: { iconKey: "or-spirit-lodge", title: "Spirit Lodge", kind: "building" },
  obea: { iconKey: "or-beastiary", title: "Beastiary", kind: "building" },
  otto: { iconKey: "or-tauren-totem", title: "Tauren Totem", kind: "building" },
  ovln: { iconKey: "or-voodoo-lounge", title: "Voodoo Lounge", kind: "building" },
  owtw: { iconKey: "or-watch-tower", title: "Watch Tower", kind: "building" },
  // --- Orc heroes ---
  Obla: { iconKey: "or-blademaster", title: "Blademaster", kind: "hero" },
  Ofar: { iconKey: "or-far-seer", title: "Far Seer", kind: "hero" },
  Otch: { iconKey: "or-tauren-chieftain", title: "Tauren Chieftain", kind: "hero" },
  Oshd: { iconKey: "or-shadow-hunter", title: "Shadow Hunter", kind: "hero" },

  // --- Night elf units ---
  ewsp: { iconKey: "ne-wisp", title: "Wisp", kind: "unit" },
  earc: { iconKey: "ne-archer", title: "Archer", kind: "unit" },
  esen: { iconKey: "ne-huntress", title: "Huntress", kind: "unit" },
  ebal: { iconKey: "ne-glaive-thrower", title: "Glaive Thrower", kind: "unit" },
  edry: { iconKey: "ne-dryad", title: "Dryad", kind: "unit" },
  edoc: { iconKey: "ne-druid-of-the-claw", title: "Druid of the Claw", kind: "unit" },
  emtg: { iconKey: "ne-mountain-giant", title: "Mountain Giant", kind: "unit" },
  ehip: { iconKey: "ne-hippogryph", title: "Hippogryph", kind: "unit" },
  edot: { iconKey: "ne-druid-of-the-talon", title: "Druid of the Talon", kind: "unit" },
  efdr: { iconKey: "ne-faerie-dragon", title: "Faerie Dragon", kind: "unit" },
  echm: { iconKey: "ne-chimaera", title: "Chimaera", kind: "unit" },
  // --- Night elf buildings ---
  etol: { iconKey: "ne-tree-of-life", title: "Tree of Life", kind: "building" },
  etoa: { iconKey: "ne-tree-of-ages", title: "Tree of Ages", kind: "building" },
  etoe: { iconKey: "ne-tree-of-eternity", title: "Tree of Eternity", kind: "building" },
  emow: { iconKey: "ne-moon-well", title: "Moon Well", kind: "building" },
  eate: { iconKey: "ne-altar", title: "Altar of Elders", kind: "building" },
  eaom: { iconKey: "ne-ancient-of-war", title: "Ancient of War", kind: "building" },
  edob: { iconKey: "ne-hunters-hall", title: "Hunter's Hall", kind: "building" },
  eaoe: { iconKey: "ne-ancient-of-lore", title: "Ancient of Lore", kind: "building" },
  eaow: { iconKey: "ne-ancient-of-wind", title: "Ancient of Wind", kind: "building" },
  edos: { iconKey: "ne-chimaera-roost", title: "Chimaera Roost", kind: "building" },
  eden: { iconKey: "ne-ancient-of-wonders", title: "Ancient of Wonders", kind: "building" },
  etrp: { iconKey: "ne-ancient-protector", title: "Ancient Protector", kind: "building" },
  // --- Night elf heroes ---
  Edem: { iconKey: "ne-demon-hunter", title: "Demon Hunter", kind: "hero" },
  Ekee: { iconKey: "ne-keeper-of-the-grove", title: "Keeper of the Grove", kind: "hero" },
  Emoo: { iconKey: "ne-priestess-of-the-moon", title: "Priestess of the Moon", kind: "hero" },
  Ewar: { iconKey: "ne-warden", title: "Warden", kind: "hero" },

  // --- Undead units ---
  uaco: { iconKey: "ud-acolyte", title: "Acolyte", kind: "unit" },
  ugho: { iconKey: "ud-ghoul", title: "Ghoul", kind: "unit" },
  ucry: { iconKey: "ud-crypt-fiend", title: "Crypt Fiend", kind: "unit" },
  ugar: { iconKey: "ud-gargoyle", title: "Gargoyle", kind: "unit" },
  uabo: { iconKey: "ud-abomination", title: "Abomination", kind: "unit" },
  umtw: { iconKey: "ud-meat-wagon", title: "Meat Wagon", kind: "unit" },
  uobs: { iconKey: "ud-obsidian-statue", title: "Obsidian Statue", kind: "unit" },
  ubsp: { iconKey: "ud-destroyer", title: "Destroyer", kind: "unit" },
  unec: { iconKey: "ud-necromancer", title: "Necromancer", kind: "unit" },
  uban: { iconKey: "ud-banshee", title: "Banshee", kind: "unit" },
  ufro: { iconKey: "ud-frost-wyrm", title: "Frost Wyrm", kind: "unit" },
  ushd: { iconKey: "ud-shade", title: "Shade", kind: "unit" },
  // --- Undead buildings ---
  unpl: { iconKey: "ud-necropolis", title: "Necropolis", kind: "building" },
  unp1: { iconKey: "ud-halls-of-the-dead", title: "Halls of the Dead", kind: "building" },
  unp2: { iconKey: "ud-black-citadel", title: "Black Citadel", kind: "building" },
  uzig: { iconKey: "ud-ziggurat", title: "Ziggurat", kind: "building" },
  uaod: { iconKey: "ud-altar", title: "Altar of Darkness", kind: "building" },
  usep: { iconKey: "ud-crypt", title: "Crypt", kind: "building" },
  ugrv: { iconKey: "ud-graveyard", title: "Graveyard", kind: "building" },
  uslh: { iconKey: "ud-slaughterhouse", title: "Slaughterhouse", kind: "building" },
  utod: { iconKey: "ud-temple-of-the-damned", title: "Temple of the Damned", kind: "building" },
  ubon: { iconKey: "ud-boneyard", title: "Boneyard", kind: "building" },
  usap: { iconKey: "ud-sacrificial-pit", title: "Sacrificial Pit", kind: "building" },
  utom: { iconKey: "ud-tomb-of-relics", title: "Tomb of Relics", kind: "building" },
  uzg1: { iconKey: "ud-spirit-tower", title: "Spirit Tower", kind: "building" },
  uzg2: { iconKey: "ud-nerubian-tower", title: "Nerubian Tower", kind: "building" },
  ugol: { iconKey: "ud-haunted-mine", title: "Haunted Gold Mine", kind: "building" },
  // --- Undead heroes ---
  Udea: { iconKey: "ud-death-knight", title: "Death Knight", kind: "hero" },
  Ulic: { iconKey: "ud-lich", title: "Lich", kind: "hero" },
  Udre: { iconKey: "ud-dreadlord", title: "Dreadlord", kind: "hero" },
  Ucrl: { iconKey: "ud-crypt-lord", title: "Crypt Lord", kind: "hero" },

  // --- Neutral (tavern) heroes ---
  Nngs: { iconKey: "nt-naga-sea-witch", title: "Naga Sea Witch", kind: "hero" },
  Nbrn: { iconKey: "nt-dark-ranger", title: "Dark Ranger", kind: "hero" },
  Npbm: { iconKey: "nt-pandaren-brewmaster", title: "Pandaren Brewmaster", kind: "hero" },
  Nbst: { iconKey: "nt-beastmaster", title: "Beastmaster", kind: "hero" },
  Nplh: { iconKey: "nt-pit-lord", title: "Pit Lord", kind: "hero" },
  Ntin: { iconKey: "nt-goblin-tinker", title: "Goblin Tinker", kind: "hero" },
  Nfir: { iconKey: "nt-firelord", title: "Firelord", kind: "hero" },
  Nalc: { iconKey: "nt-goblin-alchemist", title: "Goblin Alchemist", kind: "hero" },
  // No matching site icon for the Forsaken Paladin — keep the title, no icon.
  Npal: { title: "Forsaken Paladin", kind: "hero" },

  // --- Neutral hostile / mercenary-camp units seen in the wild fixtures ---
  // (creep-camp units, not race melee units — the site's manifest has no
  // icon for them; kept here so `describeId` still returns a real title).
  nftb: { title: "Forest Troll Berserker", kind: "unit" },
  ngir: { title: "Goblin Shredder", kind: "unit" },
};

/** Ids that are legitimately known (real title, correct `kind`) but have no
 *  matching site icon — mercenary/neutral units the manifest doesn't cover,
 *  a human tower tier the manifest skips, and one neutral hero. Consulted
 *  only by tests that otherwise require every unit/building/hero to carry
 *  an icon key. */
export const NO_ICON_IDS: ReadonlySet<string> = new Set(["hctw", "Npal", "nftb", "ngir"]);

function inferKind(id: string): IdKind {
  if (id.startsWith("R")) return "upgrade";
  if (/^[A-Z][a-z]{3}$/.test(id) || HERO_NAMES[id]) return "hero";
  return "unit";
}

/** Looks up a WC3 object id's icon/title/kind. Falls back to `w3gjs`'s
 *  upgrade/item name tables, then to the id itself as the title (per the
 *  spec's "unknown ids -> { title: id, ... }" rule). Never throws. */
export function describeId(id: string): DescribedId {
  const known = ID_MAP[id];
  if (known) return { iconKey: known.iconKey, title: known.title, kind: known.kind };

  if (id.startsWith("R")) {
    const name = UPGRADE_NAMES[id];
    return { iconKey: "nt-upgrade", title: name ?? id, kind: "upgrade" };
  }

  if (id === "stwp") {
    return { iconKey: "nt-scroll-of-town-portal", title: "Scroll of Town Portal", kind: "item" };
  }
  const itemName = ITEM_NAMES[id];
  if (itemName) return { title: itemName, kind: "item" };

  const heroName = HERO_NAMES[id];
  if (heroName) return { title: heroName, kind: "hero" };

  return { title: id, kind: inferKind(id) };
}
