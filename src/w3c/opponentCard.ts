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
import { compositionSchema } from "./composition";
import { isKnownHero } from "./heroes";
import type { W3cAka, W3cMatch, W3cMatchDetail, W3cPlayer, W3cProfile } from "./client";

export const CARD_RACES = ["human", "orc", "nightelf", "undead", "random"] as const;
export type CardRace = (typeof CARD_RACES)[number];

export const RACE_BY_ID: Readonly<Record<number, CardRace>> = { 0: "random", 1: "human", 2: "orc", 4: "nightelf", 8: "undead" };

/** Most recent results shown as the form strip. */
export const FORM_LENGTH = 10;
/** Games against your race needed before openers use only those games. */
export const MIN_GAMES_FOR_MATCHUP = 3;
/** Below this many games in total, the card says the sample is thin. */
export const MIN_GAMES_FOR_STATS = 5;
/** Opener rows shown (most common two-hero combinations). */
export const OPENERS_SHOWN = 2;
/** A combination needs at least this many games to be shown. */
export const MIN_OPENER_GAMES = 2;
/** A game shorter than this counts as decided early. */
export const EARLY_GAME_MINUTES = 10;
/** Score sheets read for the play-style line (one request each). */
export const STYLE_GAMES = 8;
/** Gold lost to upkeep above this in a game counts as "into upkeep". */
export const UPKEEP_NOTABLE_GOLD = 500;
const DAY_MS = 24 * 60 * 60_000;
/** Games from this length on count as late. */
export const LATE_GAME_MINUTES = 20;
/**
 * Elo-style scale for the MMR win chance, fitted (log loss) to 1,730
 * player-games of real W3Champions 1v1 results captured 2026-10-03. The
 * textbook 400 was overconfident (predicted 64% won 59%, 74% won 61%):
 * matchmaking pairs similar players, so MMR gaps say less than chess Elo.
 */
export const MMR_WIN_SCALE = 675;

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
  firstHero: z
    .object({ hero: z.string(), count: z.number(), wins: z.number().optional(), losses: z.number().optional() })
    .nullable(),
  openers: z.array(
    z.object({ heroes: z.array(z.string()), count: z.number(), wins: z.number().optional(), losses: z.number().optional() }),
  ),
  avgMinutes: z.object({ win: z.number().nullable(), loss: z.number().nullable() }),
  // Added after the first local beta: optional so stored cards still parse.
  headToHead: recordSchema.nullable().optional(),
  streak: z.object({ result: z.enum(["W", "L"]), length: z.number() }).nullable().optional(),
  gamesLast24h: z.number().optional(),
  earlyWins: z.object({ count: z.number(), of: z.number() }).nullable().optional(),
  extrasStatus: z.enum(["loading", "ok", "error"]).optional(),
  /** Your expected win probability from the MMR gap (0..1), or null. */
  winChance: z.number().nullable().optional(),
  /** Their record by game length (same basis as the openers). */
  phases: z.object({ early: recordSchema, mid: recordSchema, late: recordSchema }).nullable().optional(),
  /** Their usual army against your race, from their replays. */
  composition: compositionSchema.nullable().optional(),
  armyStatus: z.enum(["loading", "ok", "error"]).optional(),
  /** Your own record with your race against theirs, overall and on this map. */
  myRecord: z.object({ vsRace: recordSchema, onMap: recordSchema }).nullable().optional(),
  identity: z
    .object({ aka: z.string().nullable(), country: z.string().nullable(), seasons: z.number() })
    .nullable()
    .optional(),
  style: z
    .object({
      games: z.number(),
      goldPerMinute: z.number(),
      /** Opponent's gold over their own opponents', 1.12 = 12% more. */
      goldVsOpponents: z.number().nullable(),
      killsVsOpponents: z.number().nullable(),
      upkeepGames: z.number(),
      mercsPerGame: z.number(),
      heroKillsPerGame: z.number().optional(),
      opponentHeroKillsPerGame: z.number().optional(),
    })
    .nullable()
    .optional(),
});
export type OpponentCard = z.infer<typeof opponentCardSchema>;
export type OpponentIdentity = NonNullable<OpponentCard["identity"]>;
export type OpponentStyle = NonNullable<OpponentCard["style"]>;

export type Game = {
  id: string;
  won: boolean;
  map: string;
  vsRace: CardRace;
  vsTag: string;
  heroes: string[];
  minutes: number;
  start: string;
};

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
      id: match.id,
      vsTag: other.battleTag,
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

export function record(games: Game[]): WinLoss {
  const wins = games.filter((g) => g.won).length;
  return { wins, losses: games.length - wins };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function mostCommon(keys: string[]): { key: string; count: number }[] {
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
  const recordWhere = (pick: (g: Game) => boolean) => record(openerBase.filter(pick));
  const pairs = mostCommon(openerBase.filter((g) => g.heroes.length >= 2).map((g) => g.heroes.slice(0, 2).join("+")))
    .filter((p) => p.count >= MIN_OPENER_GAMES)
    .slice(0, OPENERS_SHOWN);
  const durationBase = useMatchup ? vsMine : games;
  const versusMe = games.filter((g) => sameTag(g.vsTag, live.me.battleTag));
  const wins = durationBase.filter((g) => g.won);
  const reference = Date.parse(live.startTime);

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
    firstHero: first ? { hero: first.key, count: first.count, ...recordWhere((g) => g.heroes[0] === first.key) } : null,
    openers: pairs.map((p) => ({
      heroes: p.key.split("+"),
      count: p.count,
      ...recordWhere((g) => g.heroes.slice(0, 2).join("+") === p.key),
    })),
    avgMinutes: {
      win: average(durationBase.filter((g) => g.won).map((g) => g.minutes)),
      loss: average(durationBase.filter((g) => !g.won).map((g) => g.minutes)),
    },
    // From the opponent's side, so flip it: their losses are your wins.
    headToHead: versusMe.length > 0 ? { wins: versusMe.filter((g) => !g.won).length, losses: versusMe.filter((g) => g.won).length } : null,
    streak: streakOf(games),
    gamesLast24h: Number.isNaN(reference)
      ? 0
      : games.filter((g) => {
          const t = Date.parse(g.start);
          return t <= reference && reference - t < DAY_MS;
        }).length,
    earlyWins: wins.length > 0 ? { count: wins.filter((g) => g.minutes < EARLY_GAME_MINUTES).length, of: wins.length } : null,
    winChance: winChance(live.me.oldMmr, live.opponent.oldMmr),
    phases:
      durationBase.length > 0
        ? {
            early: record(durationBase.filter((g) => g.minutes < EARLY_GAME_MINUTES)),
            mid: record(durationBase.filter((g) => g.minutes >= EARLY_GAME_MINUTES && g.minutes < LATE_GAME_MINUTES)),
            late: record(durationBase.filter((g) => g.minutes >= LATE_GAME_MINUTES)),
          }
        : null,
  };
}

/** The opponent's current run of identical results, newest first. */
function streakOf(games: Game[]): { result: "W" | "L"; length: number } | null {
  if (games.length === 0) return null;
  const first = games[0].won;
  let length = 0;
  while (length < games.length && games[length].won === first) length++;
  return { result: first ? "W" : "L", length };
}

/** Match ids whose score sheets feed the play-style line: the opponent's
 *  most recent games against your race, or all their games when there are
 *  too few of those (same basis as the openers). */
export function styleGameIds(card: OpponentCard, history: W3cMatch[], limit = STYLE_GAMES): string[] {
  const games = opponentGames(history, card.opponent.battleTag, card.opponent.race);
  const vsMine = games.filter((g) => g.vsRace === card.myRace);
  const base = card.openersBasis === "vs-your-race" ? vsMine : games;
  return base.slice(0, limit).map((g) => g.id);
}

/** Known-player name and how long they have been on the ladder. */
export function buildIdentity(aka: W3cAka | null, profile: W3cProfile | null): OpponentIdentity | null {
  if (!aka && !profile) return null;
  return {
    aka: aka?.name?.trim() || null,
    country: aka?.country ? aka.country.toUpperCase() : null,
    seasons: profile?.participatedInSeasons?.length ?? 0,
  };
}

function ratio(mine: number, theirs: number): number | null {
  return theirs > 0 ? Math.round((mine / theirs) * 100) / 100 : null;
}

/** Averages over the opponent's score sheets, relative to the players they
 *  faced in those same games (raw totals mostly measure game length). */
export function buildStyle(details: W3cMatchDetail[], opponentTag: string): OpponentStyle | null {
  let gold = 0;
  let goldOpp = 0;
  let kills = 0;
  let killsOpp = 0;
  let minutes = 0;
  let upkeepGames = 0;
  let mercs = 0;
  let heroKills = 0;
  let heroKillsOpp = 0;
  let games = 0;
  for (const detail of details) {
    const them = detail.playerScores.find((p) => sameTag(p.battleTag, opponentTag));
    const other = detail.playerScores.find((p) => !sameTag(p.battleTag, opponentTag));
    if (!them || !other || detail.match.durationInSeconds <= 0) continue;
    games++;
    minutes += detail.match.durationInSeconds / 60;
    gold += them.resourceScore.goldCollected;
    goldOpp += other.resourceScore.goldCollected;
    kills += them.unitScore.unitsKilled;
    killsOpp += other.unitScore.unitsKilled;
    if (them.resourceScore.goldUpkeepLost > UPKEEP_NOTABLE_GOLD) upkeepGames++;
    mercs += them.heroScore.mercsHired;
    heroKills += them.heroScore.heroesKilled;
    heroKillsOpp += other.heroScore.heroesKilled;
  }
  if (games === 0) return null;
  return {
    games,
    goldPerMinute: Math.round(gold / minutes),
    goldVsOpponents: ratio(gold, goldOpp),
    killsVsOpponents: ratio(kills, killsOpp),
    upkeepGames,
    mercsPerGame: Math.round((mercs / games) * 10) / 10,
    heroKillsPerGame: Math.round((heroKills / games) * 10) / 10,
    opponentHeroKillsPerGame: Math.round((heroKillsOpp / games) * 10) / 10,
  };
}

/** Your expected win probability from the MMR gap (see MMR_WIN_SCALE). */
export function winChance(myMmr: number | null | undefined, theirMmr: number | null | undefined): number | null {
  if (typeof myMmr !== "number" || typeof theirMmr !== "number") return null;
  const p = 1 / (1 + 10 ** (-(myMmr - theirMmr) / MMR_WIN_SCALE));
  return Math.round(p * 100) / 100;
}

/** Your own results with your race against their race, overall and on this
 *  map, from your match history. */
export function buildMyRecord(
  myHistory: W3cMatch[],
  myTag: string,
  myRace: CardRace,
  theirRace: CardRace,
  map: string,
): NonNullable<OpponentCard["myRecord"]> | null {
  if (myRace === "random") return null;
  const mine = opponentGames(myHistory, myTag, myRace).filter((g) => theirRace === "random" || g.vsRace === theirRace);
  return { vsRace: record(mine), onMap: record(mine.filter((g) => g.map === mapKey(map))) };
}
