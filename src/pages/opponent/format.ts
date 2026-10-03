/** Text formatting for the opponent card. Pure, so it is tested directly. */

import type { CardRace, OpponentCard as Card, WinLoss } from "../../w3c/opponentCard";

export const RACE_LABEL: Readonly<Record<CardRace, string>> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  random: "Random",
};

/** "12–6 (67%)", or "no games". */
export function formatRecord(r: WinLoss): string {
  const games = r.wins + r.losses;
  if (games === 0) return "no games";
  return `${r.wins}–${r.losses} (${Math.round((r.wins / games) * 100)}%)`;
}

/** "12–6". */
export function formatWinLoss(r: WinLoss): string {
  return `${r.wins}–${r.losses}`;
}

/** Win rate 0..1, or null with no games. */
export function winRate(r: WinLoss): number | null {
  const games = r.wins + r.losses;
  return games === 0 ? null : r.wins / games;
}

/** 1.06 → "+6%", 0.8 → "-20%". */
export function formatRelative(ratio: number): string {
  const pct = Math.round((ratio - 1) * 100);
  return `${pct >= 0 ? "+" : "-"}${Math.abs(pct)}%`;
}

/** "7 per game", "0.4 per game". */
export function perGameLabel(perGame: number): string {
  return `${Number.isInteger(perGame) ? perGame : perGame.toFixed(1)} per game`;
}

/** The line under the name: "1858 MMR · #19 · FR · 19 seasons". */
export function subtitleLine(card: Card): string {
  const { opponent, identity } = card;
  const seasons = identity ? (identity.seasons <= 1 ? "first season" : `${identity.seasons} seasons`) : null;
  return [
    opponent.mmr !== null ? `${opponent.mmr} MMR` : null,
    opponent.rank !== null ? `#${opponent.rank}` : null,
    identity?.country ?? opponent.location,
    seasons,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "8 games in 24 h", "1 game in 24 h", or null. */
export function activityNote(card: Card): string | null {
  const n = card.gamesLast24h ?? 0;
  return n > 0 ? `${n} game${n === 1 ? "" : "s"} in 24 h` : null;
}

/** "15/18 · 9–6": how often, then how it went. */
export function openerStat(count: number, of: number, record?: { wins?: number; losses?: number }): string {
  const wl = typeof record?.wins === "number" && typeof record?.losses === "number" ? ` · ${record.wins}–${record.losses}` : "";
  return `${count}/${of}${wl}`;
}

/** Colour a record from your point of view: their high win rate is a threat. */
export type Tone = "threat" | "opening" | "neutral";

export function toneOfTheirRate(rate: number | null, games: number, minGames = 5): Tone {
  if (rate === null || games < minGames) return "neutral";
  if (rate >= 0.6) return "threat";
  if (rate <= 0.4) return "opening";
  return "neutral";
}

export function toneOfYourRate(rate: number | null, games: number, minGames = 5): Tone {
  const theirs = toneOfTheirRate(rate, games, minGames);
  return theirs === "threat" ? "opening" : theirs === "opening" ? "threat" : "neutral";
}

/** Win chance colour: under 45% a threat, over 55% an opening. */
export function toneOfWinChance(p: number): Tone {
  if (p < 0.45) return "threat";
  if (p > 0.55) return "opening";
  return "neutral";
}
