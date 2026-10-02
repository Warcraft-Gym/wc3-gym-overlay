/**
 * Detects the player's live W3Champions 1v1 and writes the opponent card to
 * the store (`OPPONENT`), where the in-game overlay picks it up.
 *
 * One loop, started once from the picker window (it stays alive while
 * hidden): every `OPPONENT_POLL_MS` it asks W3Champions whether
 * `settings.myBattleTag` is in a game (a 204 when not, so one tiny request).
 * A new match id triggers the card: the opponent's history for the current
 * and previous season (cached per opponent), then `buildOpponentCard`. When
 * the player is no longer in a game, `live` turns false and the card stays.
 *
 * Polite by design (the API is unofficial and unmetered): nothing runs while
 * the BattleTag is empty or the feature is off, one request per poll, the
 * history only once per match, and a longer pause after errors.
 */

import { OPPONENT, SETTINGS, type OpponentState } from "./store/keys";
import { readKey, writeKey } from "./store/state";
import { fetchMatchHistory, fetchOngoingMatch, fetchSeasonIds, type W3cMatch } from "./w3c/client";
import { buildOpponentCard, readLiveMatch } from "./w3c/opponentCard";

export const OPPONENT_POLL_MS = 15_000;
export const OPPONENT_ERROR_BACKOFF_MS = 60_000;
/** Opponent histories are reused for this long (a rematch is instant). */
export const HISTORY_CACHE_MS = 30 * 60_000;
/** Season ids change rarely. */
export const SEASONS_CACHE_MS = 12 * 60 * 60_000;
/** Matches per season page; two seasons cover a regular's recent games. */
export const HISTORY_PAGE_SIZE = 100;

export type OpponentWatcherDeps = {
  fetchOngoingMatch: typeof fetchOngoingMatch;
  fetchSeasonIds: typeof fetchSeasonIds;
  fetchMatchHistory: typeof fetchMatchHistory;
  now: () => number;
};

const defaultDeps: OpponentWatcherDeps = { fetchOngoingMatch, fetchSeasonIds, fetchMatchHistory, now: () => Date.now() };

/** A "Name#1234" tag; the number is what W3Champions keys on. */
export function isValidBattleTag(value: string): boolean {
  return /^[^#\s]{2,16}#\d{3,6}$/.test(value.trim());
}

type Caches = {
  seasons: { ids: number[]; at: number } | null;
  history: Map<string, { matches: W3cMatch[]; at: number }>;
};

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function write(next: Partial<OpponentState>, now: number): Promise<void> {
  await writeKey(OPPONENT, { ...readKey(OPPONENT), ...next, updatedAt: new Date(now).toISOString() });
}

async function seasonIds(deps: OpponentWatcherDeps, caches: Caches): Promise<number[]> {
  const now = deps.now();
  if (caches.seasons && now - caches.seasons.at < SEASONS_CACHE_MS) return caches.seasons.ids;
  const ids = await deps.fetchSeasonIds();
  caches.seasons = { ids, at: now };
  return ids;
}

async function opponentHistory(tag: string, deps: OpponentWatcherDeps, caches: Caches): Promise<W3cMatch[]> {
  const key = tag.toLowerCase();
  const cached = caches.history.get(key);
  if (cached && deps.now() - cached.at < HISTORY_CACHE_MS) return cached.matches;
  const [current, previous] = await seasonIds(deps, caches);
  const seasons = [current, previous].filter((s): s is number => typeof s === "number");
  const pages = await Promise.all(seasons.map((season) => deps.fetchMatchHistory(tag, season, HISTORY_PAGE_SIZE)));
  const matches = pages.flat();
  caches.history.set(key, { matches, at: deps.now() });
  return matches;
}

/** One poll. Returns the delay before the next one. Exported for tests. */
export async function pollOnce(deps: OpponentWatcherDeps, caches: Caches): Promise<number> {
  const settings = readKey(SETTINGS);
  const tag = settings.myBattleTag?.trim() ?? "";
  if (!settings.opponentCard || !isValidBattleTag(tag)) return OPPONENT_POLL_MS;

  const state = readKey(OPPONENT);
  let match: W3cMatch | null;
  try {
    match = await deps.fetchOngoingMatch(tag);
  } catch (err) {
    console.warn("[wc3gym] W3Champions live-match check failed", err);
    return OPPONENT_ERROR_BACKOFF_MS;
  }

  if (!match) {
    if (state.live) await write({ live: false }, deps.now());
    return OPPONENT_POLL_MS;
  }
  if (match.id === state.matchId) return OPPONENT_POLL_MS;

  const live = readLiveMatch(match, tag);
  if (!live) return OPPONENT_POLL_MS;

  await write({ status: "loading", matchId: live.matchId, live: true, error: null, card: null }, deps.now());
  try {
    const history = await opponentHistory(live.opponent.battleTag, deps, caches);
    await write({ status: "ok", card: buildOpponentCard(live, history) }, deps.now());
    return OPPONENT_POLL_MS;
  } catch (err) {
    console.warn("[wc3gym] could not build the opponent card", err);
    await write({ status: "error", error: `Couldn't load ${live.opponent.battleTag}'s games: ${describe(err)}` }, deps.now());
    return OPPONENT_ERROR_BACKOFF_MS;
  }
}

let running: (() => void) | null = null;

/** Starts the single watcher loop; returns a stop function. Calling it again
 *  while running returns the existing stop (StrictMode double-mount safe). */
export function startOpponentWatcher(deps: OpponentWatcherDeps = defaultDeps): () => void {
  if (running) return running;
  const caches: Caches = { seasons: null, history: new Map() };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const loop = async () => {
    const delay = await pollOnce(deps, caches).catch((err: unknown) => {
      console.warn("[wc3gym] opponent watcher error", err);
      return OPPONENT_ERROR_BACKOFF_MS;
    });
    if (!stopped) timer = setTimeout(() => void loop(), delay);
  };
  void loop();

  running = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    running = null;
  };
  return running;
}
