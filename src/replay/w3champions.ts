import type { ReplayRace } from "./types";

/**
 * F004 — turns a pasted W3Champions match link/id into replay bytes the
 * existing `parseReplay` pipeline already knows how to read. Deliberately
 * does not import from `parseReplay.ts` (which pulls in `w3gjs`): this
 * module is a thin network/parsing-free layer so a link paste never has to
 * wait on (or bundle-couple to) the replay parser itself — only actually
 * opening the fetched bytes does that, exactly like the file-upload flow.
 */

/** Every W3Champions API call in this module goes through this origin —
 *  kept as the one place that changes if the backend ever moves. */
export const W3C_API = "https://website-backend.w3champions.com";

const MATCH_ID_RE = /^[0-9a-f]{24}$/i;
// Accepts https://w3champions.com/match/<id>, the www. and http variants,
// a bare "w3champions.com/match/<id>", and anything trailing the id
// (/<something> or ?query or #hash).
const MATCH_URL_RE = /^(?:https?:\/\/)?(?:www\.)?w3champions\.com\/match\/([0-9a-f]{24})(?:[/?#].*)?$/i;

/**
 * Trims the input and extracts a lower-case 24-hex-char W3Champions match
 * id from a match link (with or without scheme/`www.`, with or without a
 * trailing path/query) or a bare id. Returns `null` for anything else.
 */
export function parseMatchRef(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (MATCH_ID_RE.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(MATCH_URL_RE);
  return match ? match[1].toLowerCase() : null;
}

export type W3ChampionsErrorCode = "invalid_ref" | "not_found" | "unreachable" | "bad_response";

export class W3ChampionsError extends Error {
  code: W3ChampionsErrorCode;

  constructor(code: W3ChampionsErrorCode, message: string) {
    super(message);
    this.name = "W3ChampionsError";
    this.code = code;
  }
}

/** The same 28-byte `.w3g` magic `parseReplay.ts` checks — duplicated
 *  (rather than imported from there) so this module never statically pulls
 *  `w3gjs` in just to validate a byte prefix. */
const REPLAY_MAGIC = new Uint8Array([
  ...Array.from("Warcraft III recorded game", (c) => c.charCodeAt(0)),
  0x1a,
  0x00,
]);

function hasReplayMagic(bytes: Uint8Array): boolean {
  if (bytes.length < REPLAY_MAGIC.length) return false;
  for (let i = 0; i < REPLAY_MAGIC.length; i++) {
    if (bytes[i] !== REPLAY_MAGIC[i]) return false;
  }
  return true;
}

/** W3Champions' match-summary `race` field: verified against the
 *  `w3c_6aae9d48d867fad24f911778_last_refuge.w3g` fixture — the API's
 *  `race: 1` for Dretwiak#2963 and `race: 0` for SoulKeeper#1844 match the
 *  *lobby-selected* race `parseReplay` reports as `ReplayPlayer.race`
 *  (human and random respectively; SoulKeeper's *detected* in-game race,
 *  `raceDetected`, was undead — W3Champions' `race` is the pick, not the
 *  outcome of picking Random). 2/4/8 follow the same power-of-two pattern
 *  W3Champions uses elsewhere for orc/night elf/undead; anything else maps
 *  to "unknown" rather than guessing further. */
const MATCH_RACE_BY_CODE: Record<number, ReplayRace> = {
  0: "random",
  1: "human",
  2: "orc",
  4: "nightelf",
  8: "undead",
};

export interface W3CMatchPlayer {
  battleTag: string;
  race: ReplayRace | "unknown";
  won: boolean;
}

export interface W3CMatchSummary {
  map: string;
  durationSeconds: number;
  players: W3CMatchPlayer[];
}

function mapMatchRace(code: unknown): ReplayRace | "unknown" {
  return typeof code === "number" && code in MATCH_RACE_BY_CODE ? MATCH_RACE_BY_CODE[code] : "unknown";
}

/** Defensive shape-check over the match JSON — returns `undefined` (never
 *  throws) for anything that doesn't look like the documented response, so
 *  a backend field rename degrades to "no caption" instead of failing the
 *  whole import. */
function mapMatchJson(json: unknown): W3CMatchSummary | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const match = (json as { match?: unknown }).match;
  if (typeof match !== "object" || match === null) return undefined;
  const m = match as Record<string, unknown>;
  if (typeof m.map !== "string" || typeof m.durationInSeconds !== "number") return undefined;

  const teams = Array.isArray(m.teams) ? m.teams : [];
  const players: W3CMatchPlayer[] = [];
  for (const team of teams) {
    const teamPlayers = team && typeof team === "object" && Array.isArray((team as { players?: unknown }).players)
      ? ((team as { players: unknown[] }).players)
      : [];
    for (const raw of teamPlayers) {
      if (typeof raw !== "object" || raw === null) continue;
      const p = raw as Record<string, unknown>;
      if (typeof p.battleTag !== "string") continue;
      players.push({ battleTag: p.battleTag, race: mapMatchRace(p.race), won: p.won === true });
    }
  }

  return { map: m.map, durationSeconds: m.durationInSeconds, players };
}

/** Best-effort: resolves to `undefined` for anything that isn't a clean
 *  `{ ok, json() }` response, rather than throwing — fetching the match
 *  summary is a caption nicety, never a reason to fail the import (see the
 *  module docblock and the feature spec: "failure to fetch it is not an
 *  error"). */
async function safeMatchSummary(settled: PromiseSettledResult<Response>): Promise<W3CMatchSummary | undefined> {
  if (settled.status !== "fulfilled" || !settled.value.ok) return undefined;
  return settled.value
    .json()
    .then(mapMatchJson)
    .catch(() => undefined);
}

export interface FetchW3ChampionsReplayOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface FetchW3ChampionsReplayResult {
  bytes: Uint8Array;
  fileName: string;
  match?: W3CMatchSummary;
}

/**
 * Fetches a replay from W3Champions' public match-replay API. Never throws
 * anything but `W3ChampionsError`. The match-summary fetch (map/duration/
 * players, for the modal's optional caption) runs in parallel and is
 * best-effort — see `safeMatchSummary`.
 */
export async function fetchW3ChampionsReplay(
  matchId: string,
  { fetchImpl = globalThis.fetch, timeoutMs = 20_000 }: FetchW3ChampionsReplayOptions = {},
): Promise<FetchW3ChampionsReplayResult> {
  const replayController = new AbortController();
  const matchController = new AbortController();
  const replayTimer = setTimeout(() => replayController.abort(), timeoutMs);
  const matchTimer = setTimeout(() => matchController.abort(), timeoutMs);

  let replayResult: PromiseSettledResult<Response>;
  let matchResult: PromiseSettledResult<Response>;
  try {
    [replayResult, matchResult] = await Promise.allSettled([
      fetchImpl(`${W3C_API}/api/replays/${matchId}`, { signal: replayController.signal }),
      fetchImpl(`${W3C_API}/api/matches/${matchId}`, { signal: matchController.signal }),
    ]);
  } finally {
    clearTimeout(replayTimer);
    clearTimeout(matchTimer);
  }

  if (replayResult.status === "rejected") {
    throw new W3ChampionsError("unreachable", `Could not reach W3Champions: ${String(replayResult.reason)}`);
  }
  const response = replayResult.value;
  if (response.status === 404) {
    throw new W3ChampionsError("not_found", `Match ${matchId} was not found on W3Champions.`);
  }
  if (!response.ok) {
    throw new W3ChampionsError("bad_response", `W3Champions returned HTTP ${response.status}.`);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await response.arrayBuffer();
  } catch (err) {
    throw new W3ChampionsError("bad_response", `Failed to read the W3Champions response body: ${String(err)}`);
  }
  const bytes = new Uint8Array(buffer);
  if (!hasReplayMagic(bytes)) {
    throw new W3ChampionsError("bad_response", "W3Champions did not return a replay file.");
  }

  const match = await safeMatchSummary(matchResult);

  return { bytes, fileName: `${matchId}.w3g`, match };
}
