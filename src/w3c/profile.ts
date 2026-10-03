/**
 * Your own W3Champions profile, for the picker's Profile tab: the same
 * history the opponent card reads, turned on yourself. Pure: the loader
 * (`profileLoader.ts`) fetches, this file only computes.
 */

import { z } from "zod";
import type { W3cGameModeStat, W3cMatch, W3cMatchDetail } from "./client";
import {
  buildStyle,
  EARLY_GAME_MINUTES,
  FORM_LENGTH,
  LATE_GAME_MINUTES,
  mapKey,
  mostCommon,
  opponentGames,
  record,
  type CardRace,
  type Game,
  type OpponentIdentity,
} from "./opponentCard";
import { TAG_THRESHOLDS } from "./tags";

/** The four races a profile is split by (random opponents are left out). */
export const PROFILE_RACES = ["human", "orc", "nightelf", "undead"] as const;
const RACE_IDS: Readonly<Record<(typeof PROFILE_RACES)[number], number>> = { human: 1, orc: 2, nightelf: 4, undead: 8 };
/** Maps with fewer games than this are too noisy to call best or worst. */
export const PROFILE_MAP_MIN_GAMES = 5;
/** Best and worst maps shown. */
export const PROFILE_MAPS_SHOWN = 2;
/** First heroes listed under "Your heroes". */
export const PROFILE_HEROES_SHOWN = 3;
/** At most this many strengths and this many weaknesses. */
export const PROFILE_TAGS_PER_SIDE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const winLoss = z.object({ wins: z.number(), losses: z.number() });

export const profileSchema = z.object({
  battleTag: z.string(),
  name: z.string(),
  race: z.enum(["human", "orc", "nightelf", "undead", "random"]),
  mmr: z.number().nullable(),
  rank: z.number().nullable(),
  identity: z.object({ aka: z.string().nullable(), country: z.string().nullable(), seasons: z.number() }).nullable(),
  mmrHistory: z.array(z.number()),
  peakMmr: z.number().nullable(),
  overall: winLoss,
  matchups: z.array(z.object({ race: z.enum(PROFILE_RACES), record: winLoss })),
  bestMaps: z.array(z.object({ map: z.string(), record: winLoss })),
  worstMaps: z.array(z.object({ map: z.string(), record: winLoss })),
  form: z.array(z.enum(["W", "L"])),
  streak: z.object({ result: z.enum(["W", "L"]), length: z.number() }).nullable(),
  gamesToday: z.number(),
  phases: z.object({ early: winLoss, mid: winLoss, late: winLoss }),
  heroes: z.array(z.object({ hero: z.string(), count: z.number(), wins: z.number(), losses: z.number() })),
  style: z
    .object({
      games: z.number(),
      goldPerMinute: z.number(),
      goldVsOpponents: z.number().nullable(),
      killsVsOpponents: z.number().nullable(),
      upkeepGames: z.number(),
      mercsPerGame: z.number(),
      heroKillsPerGame: z.number().optional(),
      opponentHeroKillsPerGame: z.number().optional(),
    })
    .nullable(),
});
export type Profile = z.infer<typeof profileSchema>;
type WinLoss = z.infer<typeof winLoss>;

/** The race you play most in this history (your profile is about that race). */
export function mainRace(history: W3cMatch[], tag: string): CardRace | null {
  let best: { race: CardRace; games: number } | null = null;
  for (const race of PROFILE_RACES) {
    const games = opponentGames(history, tag, race).length;
    if (games > 0 && (!best || games > best.games)) best = { race, games };
  }
  return best?.race ?? null;
}

export function raceId(race: CardRace): number | null {
  return race === "random" ? null : RACE_IDS[race];
}

function rate(r: WinLoss): number {
  return r.wins / (r.wins + r.losses);
}

/** Map keys are lowercased for matching; show the name as W3Champions
 *  writes it, without the version suffix ("Echo Isles v2" -> "Echo Isles"). */
function mapNames(history: W3cMatch[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of history) {
    const key = mapKey(m.mapName);
    if (!names.has(key)) names.set(key, m.mapName.replace(/\s+v\d+(\.\d+)*$/i, "").trim());
  }
  return names;
}

function mapRecords(games: Game[], names: Map<string, string>): { map: string; record: WinLoss }[] {
  const keys = new Set(games.map((g) => g.map));
  return [...keys]
    .map((key) => ({ map: names.get(key) ?? key, record: record(games.filter((g) => g.map === key)) }))
    .filter((m) => m.record.wins + m.record.losses >= PROFILE_MAP_MIN_GAMES);
}

function streakOf(games: Game[]): Profile["streak"] {
  if (games.length === 0) return null;
  let length = 0;
  while (length < games.length && games[length].won === games[0].won) length++;
  return { result: games[0].won ? "W" : "L", length };
}

/** Your country as W3Champions shows it in your newest game. */
function latestLocation(history: W3cMatch[], tag: string): string | null {
  let best: { start: string; location: string } | null = null;
  for (const match of history) {
    const me = match.teams.flatMap((t) => t.players).find((p) => p.battleTag.toLowerCase() === tag.toLowerCase());
    if (me?.location && (!best || match.startTime > best.start)) best = { start: match.startTime, location: me.location };
  }
  return best?.location ?? null;
}

export type ProfileInputs = {
  tag: string;
  history: W3cMatch[];
  stats: W3cGameModeStat[];
  mmrHistory: number[];
  identity: OpponentIdentity | null;
  details: W3cMatchDetail[];
  now: number;
};

/** Everything the Profile tab shows, or null when there are no 1v1 games. */
export function buildProfile(input: ProfileInputs): Profile | null {
  const race = mainRace(input.history, input.tag);
  if (!race) return null;
  const games = opponentGames(input.history, input.tag, race);
  const stat = input.stats.find((s) => s.gameMode === 1 && s.race === raceId(race));
  const maps = mapRecords(games, mapNames(input.history));
  const byRate = [...maps].sort((a, b) => rate(b.record) - rate(a.record) || a.map.localeCompare(b.map));
  const best = byRate.filter((m) => rate(m.record) > 0.5).slice(0, PROFILE_MAPS_SHOWN);
  const worst = [...byRate].reverse().filter((m) => rate(m.record) < 0.5).slice(0, PROFILE_MAPS_SHOWN);
  const withHeroes = games.filter((g) => g.heroes.length > 0);

  return {
    battleTag: input.tag,
    name: input.tag.split("#")[0],
    race,
    mmr: stat?.mmr ?? null,
    rank: stat?.rank ?? null,
    identity: input.identity
      ? { ...input.identity, country: input.identity.country ?? latestLocation(input.history, input.tag) }
      : null,
    mmrHistory: input.mmrHistory,
    peakMmr: input.mmrHistory.length > 0 ? Math.max(...input.mmrHistory) : null,
    overall: record(games),
    matchups: PROFILE_RACES.map((vs) => ({ race: vs, record: record(games.filter((g) => g.vsRace === vs)) })),
    bestMaps: best,
    worstMaps: worst,
    form: games.slice(0, FORM_LENGTH).map((g) => (g.won ? "W" : "L")),
    streak: streakOf(games),
    gamesToday: games.filter((g) => {
      const t = Date.parse(g.start);
      return t <= input.now && input.now - t < DAY_MS;
    }).length,
    phases: {
      early: record(games.filter((g) => g.minutes < EARLY_GAME_MINUTES)),
      mid: record(games.filter((g) => g.minutes >= EARLY_GAME_MINUTES && g.minutes < LATE_GAME_MINUTES)),
      late: record(games.filter((g) => g.minutes >= LATE_GAME_MINUTES)),
    },
    heroes: mostCommon(withHeroes.map((g) => g.heroes[0]))
      .slice(0, PROFILE_HEROES_SHOWN)
      .map(({ key, count }) => ({ hero: key, count, ...record(withHeroes.filter((g) => g.heroes[0] === key)) })),
    style: buildStyle(input.details, input.tag),
  };
}

/** Match ids for the play-style score sheets: your latest games. */
export function profileStyleIds(history: W3cMatch[], tag: string, race: CardRace, limit: number): string[] {
  return opponentGames(history, tag, race)
    .slice(0, limit)
    .map((g) => g.id);
}

export type ProfileTag = { id: string; label: string; tone: "strength" | "weakness"; evidence: string };

const RACE_NAME: Readonly<Record<(typeof PROFILE_RACES)[number], string>> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const count = (r: WinLoss) => r.wins + r.losses;
const wl = (r: WinLoss) => `${r.wins}–${r.losses}`;

/**
 * Strengths and things to work on, with the same thresholds as the opponent
 * tags (see TAG_THRESHOLDS): a matchup or game phase at 60% or better is a
 * strength, 40% or worse a weakness; a map 15 points off your overall rate.
 */
export function deriveProfileTags(profile: Profile): { strengths: ProfileTag[]; weaknesses: ProfileTag[] } {
  const t = TAG_THRESHOLDS;
  const strengths: ProfileTag[] = [];
  const weaknesses: ProfileTag[] = [];
  const add = (tone: ProfileTag["tone"], id: string, label: string, evidence: string) =>
    (tone === "strength" ? strengths : weaknesses).push({ id, label, tone, evidence });
  const overall = count(profile.overall) > 0 ? rate(profile.overall) : 0.5;

  for (const { race, record: r } of profile.matchups) {
    if (count(r) < t.phaseMinGames) continue;
    if (rate(r) >= t.strongPhaseWinRate) add("strength", `vs-${race}`, `Strong vs ${RACE_NAME[race]}`, `${wl(r)} (${pct(rate(r))})`);
    else if (rate(r) <= t.weakPhaseWinRate) add("weakness", `vs-${race}`, `Weak vs ${RACE_NAME[race]}`, `${wl(r)} (${pct(rate(r))})`);
  }

  const bestMap = profile.bestMaps[0];
  if (bestMap && rate(bestMap.record) - overall >= t.mapDelta) {
    add("strength", "best-map", `Strong on ${bestMap.map}`, `${pct(rate(bestMap.record))} here vs ${pct(overall)} overall`);
  }
  const worstMap = profile.worstMaps[0];
  if (worstMap && overall - rate(worstMap.record) >= t.mapDelta) {
    add("weakness", "worst-map", `Weak on ${worstMap.map}`, `${pct(rate(worstMap.record))} here vs ${pct(overall)} overall`);
  }

  const phases = [
    ["early", "early", `under ${EARLY_GAME_MINUTES} min`],
    ["late", "late", `over ${LATE_GAME_MINUTES} min`],
  ] as const;
  for (const [key, word, span] of phases) {
    const r = profile.phases[key];
    if (count(r) < t.phaseMinGames) continue;
    if (rate(r) >= t.strongPhaseWinRate) add("strength", `strong-${word}`, `Strong ${word}`, `${wl(r)} in games ${span}`);
    else if (rate(r) <= t.weakPhaseWinRate) {
      add("weakness", `weak-${word}`, word === "late" ? "Fades late" : "Slow starts", `${wl(r)} in games ${span}`);
    }
  }

  const s = profile.style;
  if (s) {
    if (s.killsVsOpponents !== null && s.killsVsOpponents >= t.fightRatioHigh) {
      add("strength", "wins-fights", "Wins fights", `${pct(s.killsVsOpponents - 1)} more kills than opponents`);
    } else if (s.killsVsOpponents !== null && s.killsVsOpponents <= t.fightRatioLow) {
      add("weakness", "loses-fights", "Loses fights", `${pct(1 - s.killsVsOpponents)} fewer kills than opponents`);
    }
    if (s.goldVsOpponents !== null && s.goldVsOpponents >= t.economyHigh) {
      add("strength", "economy", "Out-farms", `${pct(s.goldVsOpponents - 1)} more gold than opponents`);
    } else if (s.goldVsOpponents !== null && s.goldVsOpponents <= t.economyLow) {
      add("weakness", "economy", "Behind on gold", `${pct(1 - s.goldVsOpponents)} less gold than opponents`);
    }
    if ((s.heroKillsPerGame ?? 0) >= t.heroKills) add("strength", "hero-hunter", "Hero hunter", `Kills ${s.heroKillsPerGame} heroes per game`);
    if ((s.opponentHeroKillsPerGame ?? 0) >= t.heroesLost) {
      add("weakness", "fragile-heroes", "Fragile heroes", `Loses ${s.opponentHeroKillsPerGame} heroes per game`);
    }
    if (s.games > 0 && s.upkeepGames / s.games >= t.upkeepShare) {
      add("weakness", "upkeep", "Floats into upkeep", `Lost gold to upkeep in ${s.upkeepGames} of ${s.games} games`);
    }
  }

  return { strengths: strengths.slice(0, PROFILE_TAGS_PER_SIDE), weaknesses: weaknesses.slice(0, PROFILE_TAGS_PER_SIDE) };
}
