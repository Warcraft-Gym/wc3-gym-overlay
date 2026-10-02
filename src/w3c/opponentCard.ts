/**
 * The opponent card: what a player can act on when a W3Champions 1v1 starts.
 * Pure functions only (no fetch, no store), so they are tested against real
 * captured responses in `__fixtures__/`.
 *
 * Input: the live match (`/matches/ongoing/{me}`) and the opponent's match
 * history (current season first, then the previous one). Output: MMR, rank,
 * form, the opponent's record against your race and on this map, and how
 * they usually open (heroes in pick order).
 *
 * Only games where the opponent played the race they are playing now count,
 * since a Night Elf's openers say nothing about their Orc. When the sample
 * against your race is too small, openers fall back to all their games with
 * that race, and the card says so.
 */

import { z } from "zod";
import { isKnownHero } from "./heroes";
import type { W3cMatch, W3cPlayer } from "./client";

export const CARD_RACES = ["human", "orc", "nightelf", "undead", "random"] as const;
export type CardRace = (typeof CARD_RACES)[number];

const RACE_BY_ID: Readonly<Record<number, CardRace>> = { 0: "random", 1: "human", 2: "orc", 4: "nightelf", 8: "undead" };

/** Most recent results shown as the form strip. */
export const FORM_LENGTH = 10;
/** Games against your race needed before openers use only those games. */
export const MIN_GAMES_FOR_MATCHUP = 3;
/** Below this many games in total, the card says the sample is thin. */
export const MIN_GAMES_FOR_STATS = 5;
/** Opener rows shown (most common hero pairs). */
export const OPENERS_SHOWN = 2;

export function raceOf(player: Pick<W3cPlayer, "race" | "rndRace">): CardRace {
  const random = player.rndRace !== null && player.rndRace !== undefined ? RACE_BY_ID[player.rndRace] : undefined;
  if (random && random !== "random") return random;
  return RACE_BY_ID[player.race] ?? "random";
}

/** "Echo Isles v2" and "Echo Isles" are the same map for scouting. */
export function mapKey(mapName: string): string {
  return mapName
    .toLowerCase()
    .replace(/\s+v\d+(\.\d+)*$/, "")
    .trim();
}

const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type LiveMatch = {
  matchId: string;
  map: string;
  startTime: string;
  me: W3cPlayer;
  opponent: W3cPlayer;
};

/** The live 1v1 seen from `myTag`'s side, or null when it isn't a 1v1 that
 *  includes them. */
export function readLiveMatch(match: W3cMatch, myTag: string): LiveMatch | null {
  const players = match.teams.flatMap((team) => team.players);
  if (players.length !== 2) return null;
  const me = players.find((p) => sameTag(p.battleTag, myTag));
  const opponent = players.find((p) => !sameTag(p.battleTag, myTag));
  if (!me || !opponent) return null;
  return { matchId: match.id, map: match.mapName, startTime: match.startTime, me, opponent };
}

const recordSchema = z.object({ wins: z.number(), losses: z.number() });
export type WinLoss = z.infer<typeof recordSchema>;

export const opponentCardSchema = z.object({
  matchId: z.string(),
  map: z.string(),
  myRace: z.enum(CARD_RACES),
  opponent: z.object({
    battleTag: z.string(),
    name: z.string(),
    race: z.enum(CARD_RACES),
    mmr: z.number().nullable(),
    rank: z.number().nullable(),
    location: z.string().nullable(),
  }),
  sampleSize: z.number(),
  thinSample: z.boolean(),
  /** Newest first, "W" or "L". */
  form: z.array(z.enum(["W", "L"])),
  overall: recordSchema,
  vsMyRace: recordSchema.nullable(),
  onMap: recordSchema,
  openersBasis: z.enum(["vs-your-race", "all-games"]),
  openerGames: z.number(),
  firstHero: z.object({ hero: z.string(), count: z.number() }).nullable(),
  openers: z.array(z.object({ heroes: z.array(z.string()), count: z.number() })),
  avgMinutes: z.object({ win: z.number().nullable(), loss: z.number().nullable() }),
});
export type OpponentCard = z.infer<typeof opponentCardSchema>;

type Game = { won: boolean; map: string; vsRace: CardRace; heroes: string[]; minutes: number; start: string };

/** The opponent's games with the race they are playing now, newest first,
 *  de-duplicated by match id (seasons can overlap at the boundary). */
export function opponentGames(history: W3cMatch[], opponentTag: string, race: CardRace): Game[] {
  const seen = new Set<string>();
  const games: Game[] = [];
  for (const match of history) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    const players = match.teams.flatMap((team) => team.players);
    if (players.length !== 2) continue;
    const them = players.find((p) => sameTag(p.battleTag, opponentTag));
    const other = players.find((p) => !sameTag(p.battleTag, opponentTag));
    if (!them || !other || typeof them.won !== "boolean") continue;
    if (race !== "random" && raceOf(them) !== race) continue;
    games.push({
      won: them.won,
      map: mapKey(match.mapName),
      vsRace: raceOf(other),
      heroes: (them.heroes ?? []).map((h) => h.name).filter(isKnownHero),
      minutes: match.durationInSeconds / 60,
      start: match.startTime,
    });
  }
  return games.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
}

function record(games: Game[]): WinLoss {
  const wins = games.filter((g) => g.won).length;
  return { wins, losses: games.length - wins };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function mostCommon(keys: string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function buildOpponentCard(live: LiveMatch, history: W3cMatch[]): OpponentCard {
  const myRace = raceOf(live.me);
  const theirRace = raceOf(live.opponent);
  const games = opponentGames(history, live.opponent.battleTag, theirRace);

  const vsMine = myRace === "random" ? [] : games.filter((g) => g.vsRace === myRace);
  const useMatchup = vsMine.length >= MIN_GAMES_FOR_MATCHUP;
  const openerBase = (useMatchup ? vsMine : games).filter((g) => g.heroes.length > 0);

  const first = mostCommon(openerBase.map((g) => g.heroes[0]))[0];
  const pairs = mostCommon(openerBase.map((g) => g.heroes.slice(0, 2).join("+"))).slice(0, OPENERS_SHOWN);
  const durationBase = useMatchup ? vsMine : games;

  return {
    matchId: live.matchId,
    map: live.map,
    myRace,
    opponent: {
      battleTag: live.opponent.battleTag,
      name: live.opponent.name ?? live.opponent.battleTag.split("#")[0],
      race: theirRace,
      mmr: live.opponent.oldMmr ?? null,
      rank: live.opponent.ranking?.rank ?? null,
      location: live.opponent.location || null,
    },
    sampleSize: games.length,
    thinSample: games.length < MIN_GAMES_FOR_STATS,
    form: games.slice(0, FORM_LENGTH).map((g) => (g.won ? "W" : "L")),
    overall: record(games),
    vsMyRace: myRace === "random" ? null : record(vsMine),
    onMap: record(games.filter((g) => g.map === mapKey(live.map))),
    openersBasis: useMatchup ? "vs-your-race" : "all-games",
    openerGames: openerBase.length,
    firstHero: first ? { hero: first.key, count: first.count } : null,
    openers: pairs.map((p) => ({ heroes: p.key.split("+"), count: p.count })),
    avgMinutes: {
      win: average(durationBase.filter((g) => g.won).map((g) => g.minutes)),
      loss: average(durationBase.filter((g) => !g.won).map((g) => g.minutes)),
    },
  };
}
