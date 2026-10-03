/**
 * Tags: the card's numbers turned into a few words a player can act on
 * ("Fragile heroes", "Weak on Hammerfall"). Each tag carries its evidence,
 * shown as the tooltip, so nothing is asserted without the numbers behind it.
 *
 * Thresholds were checked on 10 real W3Champions players' histories
 * (2026-10-03) so no tag fires for everyone or for no one, e.g. the share of
 * wins before 10 minutes ranged 0.12 to 0.39 (rusher at >= 0.33 fired for
 * 2 of 9), the same first hero >= 75% for 3 of 9.
 *
 * "Likely to expand" is deliberately absent: expansions only show in
 * replays, which the free card does not read (see OPPONENT_ARMY_ENABLED).
 */

import type { OpponentCard } from "./opponentCard";
import { heroInfo } from "./heroes";

/** From your point of view: a threat to respect, an opening to use, or neutral. */
export type TagTone = "threat" | "opening" | "info";

export type TagId =
  | "pro"
  | "new-account"
  | "hot-streak"
  | "cold-streak"
  | "grinding"
  | "rusher"
  | "strong-early"
  | "strong-late"
  | "fades-late"
  | "strong-map"
  | "weak-map"
  | "predictable"
  | "wins-fights"
  | "loses-fights"
  | "hero-hunter"
  | "fragile-heroes"
  | "strong-economy"
  | "weak-economy"
  | "upkeep";

export type OpponentTag = { id: TagId; label: string; tone: TagTone; evidence: string };

export const TAG_THRESHOLDS = {
  streak: 3,
  grindingGames24h: 10,
  rusherEarlyWinShare: 0.33,
  phaseMinGames: 5,
  strongPhaseWinRate: 0.6,
  weakPhaseWinRate: 0.4,
  mapMinGames: 5,
  mapDelta: 0.15,
  predictableShare: 0.75,
  predictableMinGames: 5,
  fightRatioHigh: 1.2,
  fightRatioLow: 0.85,
  heroKills: 1.5,
  heroesLost: 1.5,
  economyHigh: 1.1,
  economyLow: 0.9,
  upkeepShare: 0.5,
} as const;

/** At most this many tags, threats first, so the strip stays readable. */
export const MAX_TAGS = 6;

const rate = (r: { wins: number; losses: number }) => {
  const games = r.wins + r.losses;
  return games === 0 ? null : r.wins / games;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const games = (r: { wins: number; losses: number }) => r.wins + r.losses;

export function deriveTags(card: OpponentCard): OpponentTag[] {
  const t = TAG_THRESHOLDS;
  const tags: OpponentTag[] = [];
  const add = (id: TagId, label: string, tone: TagTone, evidence: string) => tags.push({ id, label, tone, evidence });

  if (card.identity?.aka) add("pro", `Pro: ${card.identity.aka}`, "threat", "Known player in W3Champions' records");
  else if (card.identity && card.identity.seasons <= 1) add("new-account", "New account", "info", "First season on W3Champions: could be a smurf");

  if (card.streak && card.streak.length >= t.streak) {
    if (card.streak.result === "W") add("hot-streak", `${card.streak.length}-win streak`, "threat", `Won the last ${card.streak.length} games`);
    else add("cold-streak", `${card.streak.length}-loss streak`, "opening", `Lost the last ${card.streak.length} games`);
  }
  if ((card.gamesLast24h ?? 0) >= t.grindingGames24h) add("grinding", "Grinding", "info", `${card.gamesLast24h} games in the last 24 h`);

  if (card.earlyWins && card.earlyWins.of >= t.phaseMinGames && card.earlyWins.count / card.earlyWins.of >= t.rusherEarlyWinShare) {
    add("rusher", "Rusher", "threat", `${card.earlyWins.count} of ${card.earlyWins.of} wins come before 10 min`);
  }
  if (card.phases) {
    const early = rate(card.phases.early);
    if (early !== null && games(card.phases.early) >= t.phaseMinGames && early >= t.strongPhaseWinRate && !tags.some((x) => x.id === "rusher")) {
      add("strong-early", "Strong early", "threat", `${pct(early)} in games under 10 min`);
    }
    const late = rate(card.phases.late);
    if (late !== null && games(card.phases.late) >= t.phaseMinGames) {
      if (late >= t.strongPhaseWinRate) add("strong-late", "Strong late", "threat", `${pct(late)} in games over 20 min`);
      else if (late <= t.weakPhaseWinRate) add("fades-late", "Fades late", "opening", `${pct(late)} in games over 20 min`);
    }
  }

  const overall = rate(card.overall);
  const onMap = rate(card.onMap);
  if (overall !== null && onMap !== null && games(card.onMap) >= t.mapMinGames) {
    if (onMap - overall >= t.mapDelta) add("strong-map", `Strong on ${card.map}`, "threat", `${pct(onMap)} here vs ${pct(overall)} overall`);
    else if (overall - onMap >= t.mapDelta) add("weak-map", `Weak on ${card.map}`, "opening", `${pct(onMap)} here vs ${pct(overall)} overall`);
  }

  if (card.firstHero && card.openerGames >= t.predictableMinGames && card.firstHero.count / card.openerGames >= t.predictableShare) {
    const hero = heroInfo(card.firstHero.hero).title;
    add("predictable", `Always ${hero}`, "info", `${hero} first in ${card.firstHero.count} of ${card.openerGames} games`);
  }

  const style = card.style;
  if (style) {
    if (style.killsVsOpponents !== null && style.killsVsOpponents >= t.fightRatioHigh) {
      add("wins-fights", "Wins fights", "threat", `${pct(style.killsVsOpponents - 1)} more kills than his opponents`);
    } else if (style.killsVsOpponents !== null && style.killsVsOpponents <= t.fightRatioLow) {
      add("loses-fights", "Loses fights", "opening", `${pct(1 - style.killsVsOpponents)} fewer kills than his opponents`);
    }
    if ((style.heroKillsPerGame ?? 0) >= t.heroKills) add("hero-hunter", "Hero hunter", "threat", `Kills ${style.heroKillsPerGame} heroes per game`);
    if ((style.opponentHeroKillsPerGame ?? 0) >= t.heroesLost) add("fragile-heroes", "Fragile heroes", "opening", `Loses ${style.opponentHeroKillsPerGame} heroes per game`);
    if (style.goldVsOpponents !== null && style.goldVsOpponents >= t.economyHigh) {
      add("strong-economy", "Strong economy", "threat", `Mines ${pct(style.goldVsOpponents - 1)} more gold than his opponents`);
    } else if (style.goldVsOpponents !== null && style.goldVsOpponents <= t.economyLow) {
      add("weak-economy", "Weak economy", "opening", `Mines ${pct(1 - style.goldVsOpponents)} less gold than his opponents`);
    }
    if (style.games > 0 && style.upkeepGames / style.games >= t.upkeepShare) {
      add("upkeep", "Floats into upkeep", "opening", `Lost gold to upkeep in ${style.upkeepGames} of ${style.games} games`);
    }
  }

  const order: Record<TagTone, number> = { threat: 0, opening: 1, info: 2 };
  return tags.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, MAX_TAGS);
}
