/**
 * Read-only client for the public W3Champions website backend (no auth).
 * Verified 2026-10-02 against live responses (fixtures in `__fixtures__/`):
 *
 * - `GET /matches/ongoing/{battleTag}` → 200 with the live match, or
 *   204 No Content when the player is not in a game.
 * - `GET /matches/search?playerId=…&gateway=20&season=…&gameMode=1` →
 *   `{ matches, count }`, newest first, each player with `heroes` and `won`.
 * - `GET /ladder/seasons` → `[{ id }]`, newest first.
 *
 * The API is unofficial and publishes no rate limits: callers poll gently
 * and cache (see `opponentWatcher.ts`). Schemas validate only the fields the
 * overlay reads and tolerate `null` where the live API sends it (a live
 * match has `heroes: null` and `won: false` until it ends).
 */

import { z } from "zod";
import { W3C_API_BASE, W3C_GATEWAY, W3C_GAME_MODE_1V1 } from "../config";

export class W3cError extends Error {
  readonly kind: "network" | "http" | "invalid";
  readonly cause?: unknown;

  constructor(kind: "network" | "http" | "invalid", message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "W3cError";
    this.kind = kind;
    this.cause = options?.cause;
  }
}

const heroSchema = z.object({
  name: z.string(),
  level: z.number().nullable().optional(),
});

export const w3cPlayerSchema = z.object({
  battleTag: z.string(),
  name: z.string().nullable().optional(),
  race: z.number(),
  rndRace: z.number().nullable().optional(),
  oldMmr: z.number().nullable().optional(),
  currentMmr: z.number().nullable().optional(),
  won: z.boolean().nullable().optional(),
  location: z.string().nullable().optional(),
  heroes: z.array(heroSchema).nullable().optional(),
  ranking: z.object({ rank: z.number().nullable().optional() }).nullable().optional(),
});

export const w3cMatchSchema = z.object({
  id: z.string(),
  mapName: z.string(),
  startTime: z.string(),
  durationInSeconds: z.number(),
  gameMode: z.number(),
  teams: z.array(z.object({ players: z.array(w3cPlayerSchema) })),
});

const searchResponseSchema = z.object({
  matches: z.array(w3cMatchSchema).nullable().default([]),
  count: z.number().optional(),
});

const seasonsSchema = z.array(z.object({ id: z.number() }));

export type W3cPlayer = z.infer<typeof w3cPlayerSchema>;
export type W3cMatch = z.infer<typeof w3cMatchSchema>;

async function getJson(path: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${W3C_API_BASE}${path}`, { cache: "no-store", signal });
  } catch (err) {
    throw new W3cError("network", `network error fetching W3Champions ${path}`, { cause: err });
  }
  if (response.status === 204) return { status: 204, body: null };
  if (!response.ok) throw new W3cError("http", `W3Champions answered ${response.status} for ${path}`);
  try {
    return { status: response.status, body: await response.json() };
  } catch (err) {
    throw new W3cError("invalid", `W3Champions sent invalid JSON for ${path}`, { cause: err });
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new W3cError("invalid", `W3Champions ${what} failed validation: ${parsed.error.message}`);
  return parsed.data;
}

/** The player's live match, or `null` when they are not in a game. */
export async function fetchOngoingMatch(battleTag: string, signal?: AbortSignal): Promise<W3cMatch | null> {
  const { status, body } = await getJson(`/matches/ongoing/${encodeURIComponent(battleTag)}`, signal);
  if (status === 204 || body === null || body === "") return null;
  return parse(w3cMatchSchema, body, "live match");
}

/** Season ids, newest first. */
export async function fetchSeasonIds(signal?: AbortSignal): Promise<number[]> {
  const { body } = await getJson("/ladder/seasons", signal);
  return parse(seasonsSchema, body, "season list")
    .map((s) => s.id)
    .sort((a, b) => b - a);
}

/** A player's 1v1 matches in one season, newest first (one page). */
export async function fetchMatchHistory(
  battleTag: string,
  season: number,
  pageSize = 100,
  signal?: AbortSignal,
): Promise<W3cMatch[]> {
  const query = new URLSearchParams({
    playerId: battleTag,
    gateway: String(W3C_GATEWAY),
    season: String(season),
    gameMode: String(W3C_GAME_MODE_1V1),
    offset: "0",
    pageSize: String(pageSize),
  });
  const { body } = await getJson(`/matches/search?${query.toString()}`, signal);
  return parse(searchResponseSchema, body, "match history").matches ?? [];
}

// --- Opponent extras: identity and per-game score sheets --------------------

const akaSchema = z.object({
  name: z.string().nullable().optional(),
  main_race: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  liquipedia: z.string().nullable().optional(),
});
export type W3cAka = z.infer<typeof akaSchema>;

const profileSchema = z.object({
  participatedInSeasons: z.array(z.object({ id: z.number() })).nullable().default([]),
});
export type W3cProfile = z.infer<typeof profileSchema>;

const scoreSchema = z.object({
  battleTag: z.string(),
  unitScore: z.object({ unitsProduced: z.number(), unitsKilled: z.number(), largestArmy: z.number() }),
  heroScore: z.object({ heroesKilled: z.number(), itemsObtained: z.number(), mercsHired: z.number(), expGained: z.number() }),
  resourceScore: z.object({ goldCollected: z.number(), lumberCollected: z.number(), goldUpkeepLost: z.number() }),
});
export const matchDetailSchema = z.object({
  match: z.object({ id: z.string(), durationInSeconds: z.number() }),
  playerScores: z.array(scoreSchema),
});
export type W3cMatchDetail = z.infer<typeof matchDetailSchema>;

/** Known-player data ("aka"): a real name, country and Liquipedia page for
 *  pros (every Grandmaster had it on 2026-10-03); all fields null otherwise.
 *  Note: `/players/{tag}` itself returns an empty aka; only `/aka` has it. */
export async function fetchAka(battleTag: string, signal?: AbortSignal): Promise<W3cAka> {
  const { body } = await getJson(`/players/${encodeURIComponent(battleTag)}/aka`, signal);
  return parse(akaSchema, body, "player aka");
}

/** The player's profile: which seasons they played. */
export async function fetchProfile(battleTag: string, signal?: AbortSignal): Promise<W3cProfile> {
  const { body } = await getJson(`/players/${encodeURIComponent(battleTag)}`, signal);
  return parse(profileSchema, body, "player profile");
}

/** One finished game's score sheet for both players. */
export async function fetchMatchDetail(matchId: string, signal?: AbortSignal): Promise<W3cMatchDetail> {
  const { body } = await getJson(`/matches/${encodeURIComponent(matchId)}`, signal);
  return parse(matchDetailSchema, body, "match details");
}
