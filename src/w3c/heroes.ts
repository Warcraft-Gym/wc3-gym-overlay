/**
 * W3Champions hero names → the site's icon keys and display titles.
 * Collected 2026-10-02 from real match histories of players of every race
 * (all 25 heroes, including the 3.0 Forsaken Paladin). Four W3C names differ
 * from the in-game title: `sorceror` (Blood Mage), `avatarofflame`
 * (Firelord), `bansheeranger` (Dark Ranger), `tinker` / `alchemist` (Goblin
 * Tinker / Goblin Alchemist). W3C also sends `unknown` for unrecognised
 * heroes, which the card skips.
 */

export type HeroInfo = { icon: string; title: string };

export const W3C_HEROES: Readonly<Record<string, HeroInfo>> = {
  archmage: { icon: "hu-archmage", title: "Archmage" },
  mountainking: { icon: "hu-mountain-king", title: "Mountain King" },
  paladin: { icon: "hu-paladin", title: "Paladin" },
  sorceror: { icon: "hu-blood-mage", title: "Blood Mage" },
  forsakenpaladin: { icon: "hu-forsaken-paladin", title: "Forsaken Paladin" },
  blademaster: { icon: "or-blademaster", title: "Blademaster" },
  farseer: { icon: "or-far-seer", title: "Far Seer" },
  taurenchieftain: { icon: "or-tauren-chieftain", title: "Tauren Chieftain" },
  shadowhunter: { icon: "or-shadow-hunter", title: "Shadow Hunter" },
  demonhunter: { icon: "ne-demon-hunter", title: "Demon Hunter" },
  keeperofthegrove: { icon: "ne-keeper-of-the-grove", title: "Keeper of the Grove" },
  priestessofthemoon: { icon: "ne-priestess-of-the-moon", title: "Priestess of the Moon" },
  warden: { icon: "ne-warden", title: "Warden" },
  deathknight: { icon: "ud-death-knight", title: "Death Knight" },
  lich: { icon: "ud-lich", title: "Lich" },
  dreadlord: { icon: "ud-dreadlord", title: "Dreadlord" },
  cryptlord: { icon: "ud-crypt-lord", title: "Crypt Lord" },
  seawitch: { icon: "nt-naga-sea-witch", title: "Naga Sea Witch" },
  bansheeranger: { icon: "nt-dark-ranger", title: "Dark Ranger" },
  pandarenbrewmaster: { icon: "nt-pandaren-brewmaster", title: "Pandaren Brewmaster" },
  beastmaster: { icon: "nt-beastmaster", title: "Beastmaster" },
  pitlord: { icon: "nt-pit-lord", title: "Pit Lord" },
  tinker: { icon: "nt-goblin-tinker", title: "Goblin Tinker" },
  avatarofflame: { icon: "nt-firelord", title: "Firelord" },
  alchemist: { icon: "nt-goblin-alchemist", title: "Goblin Alchemist" },
};

/** Display info for a W3C hero name; unknown names fall back to a readable
 *  title and no icon (GameIcon then shows its lettered chip). */
export function heroInfo(name: string): HeroInfo | { icon: undefined; title: string } {
  return W3C_HEROES[name] ?? { icon: undefined, title: name };
}

export function isKnownHero(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(W3C_HEROES, name);
}
