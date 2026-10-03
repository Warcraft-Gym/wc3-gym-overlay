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

import { WINDOW_OPPONENT } from "./config";
import { host } from "./host";
import { OPPONENT, SETTINGS, type OpponentState } from "./store/keys";
import { buildComposition, COMPOSITION_GAMES, fetchMatchSteps, type Composition, type ImportedSteps } from "./w3c/composition";
import { readKey, writeKey } from "./store/state";
import {
  fetchAka,
  fetchMatchDetail,
  fetchMatchHistory,
  fetchOngoingMatch,
  fetchProfile,
  fetchSeasonIds,
  type W3cMatch,
  type W3cMatchDetail,
} from "./w3c/client";
import {
  buildIdentity,
  buildMyRecord,
  buildOpponentCard,
  buildStyle,
  readLiveMatch,
  styleGameIds,
  type OpponentCard,
} from "./w3c/opponentCard";

export const OPPONENT_POLL_MS = 15_000;
export const OPPONENT_ERROR_BACKOFF_MS = 60_000;
/** Opponent histories are reused for this long (a rematch is instant). */
export const HISTORY_CACHE_MS = 30 * 60_000;
/** Season ids change rarely. */
export const SEASONS_CACHE_MS = 12 * 60 * 60_000;
/** Matches per season page; two seasons cover a regular's recent games. */
export const HISTORY_PAGE_SIZE = 100;
/**
 * W3Champions sometimes keeps a game listed as live for hours (one was 606
 * minutes old on 2026-10-03). A listing this old is treated as no game, so a
 * stuck entry never pins a "live" card.
 */
export const STALE_LIVE_MS = 90 * 60_000;
/** Score sheets are fetched this many at a time (polite to the API). */
export const DETAIL_CONCURRENCY = 2;

export type OpponentWatcherDeps = {
  fetchOngoingMatch: typeof fetchOngoingMatch;
  fetchSeasonIds: typeof fetchSeasonIds;
  fetchMatchHistory: typeof fetchMatchHistory;
  fetchAka: typeof fetchAka;
  fetchProfile: typeof fetchProfile;
  fetchMatchDetail: typeof fetchMatchDetail;
  fetchMatchSteps: typeof fetchMatchSteps;
  /** Opens the opponent window (it never takes focus, so the game keeps it). */
  showOpponentWindow: () => Promise<void>;
  now: () => number;
};

const defaultDeps: OpponentWatcherDeps = {
  fetchOngoingMatch,
  fetchSeasonIds,
  fetchMatchHistory,
  fetchAka,
  fetchProfile,
  fetchMatchDetail,
  fetchMatchSteps,
  showOpponentWindow: () => host.showWindow(WINDOW_OPPONENT),
  now: () => Date.now(),
};

/** A "Name#1234" tag; the number is what W3Champions keys on. */
export function isValidBattleTag(value: string): boolean {
  return /^[^#\s]{2,16}#\d{3,6}$/.test(value.trim());
}

type Extras = Pick<OpponentCard, "identity" | "style">;

type Caches = {
  seasons: { ids: number[]; at: number } | null;
  history: Map<string, { matches: W3cMatch[]; at: number }>;
  extras?: Map<string, { value: Extras; at: number }>;
  army?: Map<string, { value: Composition | null; at: number }>;
  /** The match this watcher built a card for. A card stored by an earlier
   *  app run (possibly an older version, without newer fields) is rebuilt
   *  once rather than trusted. */
  builtMatchId?: string | null;
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

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** Identity and play style: 2 + up to STYLE_GAMES requests, cached per
 *  opponent like the history. A missing piece is null, never fatal. */
async function opponentExtras(card: OpponentCard, history: W3cMatch[], deps: OpponentWatcherDeps, caches: Caches): Promise<Extras> {
  const tag = card.opponent.battleTag;
  const key = `${tag.toLowerCase()}|${card.myRace}`;
  caches.extras ??= new Map();
  const cached = caches.extras.get(key);
  if (cached && deps.now() - cached.at < HISTORY_CACHE_MS) return cached.value;
  const [aka, profile] = await Promise.all([
    deps.fetchAka(tag).catch(() => null),
    deps.fetchProfile(tag).catch(() => null),
  ]);
  const details = await inBatches(styleGameIds(card, history), DETAIL_CONCURRENCY, (id) =>
    deps.fetchMatchDetail(id).catch((): W3cMatchDetail | null => null),
  );
  const value: Extras = {
    identity: buildIdentity(aka, profile),
    style: buildStyle(details.filter((d): d is W3cMatchDetail => d !== null), tag),
  };
  caches.extras.set(key, { value, at: deps.now() });
  return value;
}

/** Their usual army: up to COMPOSITION_GAMES replays parsed by our site,
 *  2 at a time, cached per opponent. A failed replay is skipped. */
async function opponentArmy(
  card: OpponentCard,
  history: W3cMatch[],
  apiBase: string,
  deps: OpponentWatcherDeps,
  caches: Caches,
): Promise<Composition | null> {
  const tag = card.opponent.battleTag;
  const key = `${tag.toLowerCase()}|${card.myRace}`;
  caches.army ??= new Map();
  const cached = caches.army.get(key);
  if (cached && deps.now() - cached.at < HISTORY_CACHE_MS) return cached.value;
  const ids = styleGameIds(card, history, COMPOSITION_GAMES);
  const games = await inBatches(ids, DETAIL_CONCURRENCY, (id) =>
    deps.fetchMatchSteps(apiBase, id, tag).catch((err: unknown) => {
      console.warn("[wc3gym] could not read a replay for the army", id, err);
      return null;
    }),
  );
  const value = buildComposition(games.filter((g): g is ImportedSteps => g !== null));
  caches.army.set(key, { value, at: deps.now() });
  return value;
}

/** One poll. Returns the delay before the next one. Exported for tests. */
export async function pollOnce(deps: OpponentWatcherDeps, caches: Caches): Promise<number> {
  const settings = readKey(SETTINGS);
  const tag = settings.myBattleTag?.trim() ?? "";
  const state = readKey(OPPONENT);
  if (!settings.opponentCard || !isValidBattleTag(tag)) {
    // Switched off or the tag cleared mid-game: end the live card rather
    // than leave it on screen with nothing left to update it.
    if (state.live) await write({ live: false }, deps.now());
    return OPPONENT_POLL_MS;
  }

  let match: W3cMatch | null;
  try {
    match = await deps.fetchOngoingMatch(tag);
  } catch (err) {
    console.warn("[wc3gym] W3Champions live-match check failed", err);
    return OPPONENT_ERROR_BACKOFF_MS;
  }

  const started = match ? Date.parse(match.startTime) : NaN;
  if (match && !Number.isNaN(started) && deps.now() - started >= STALE_LIVE_MS) match = null;

  if (!match) {
    if (state.live) await write({ live: false }, deps.now());
    return OPPONENT_POLL_MS;
  }
  if (match.id === state.matchId && match.id === caches.builtMatchId) return OPPONENT_POLL_MS;

  const live = readLiveMatch(match, tag);
  if (!live) return OPPONENT_POLL_MS;

  const sameMatchAsStored = live.matchId === state.matchId;
  caches.builtMatchId = live.matchId;
  // A fresh match starts from "loading"; a rebuild of the stored one keeps
  // showing the old card until the new one is ready.
  if (!sameMatchAsStored) {
    await write({ status: "loading", matchId: live.matchId, live: true, error: null, card: null }, deps.now());
  }
  if (settings.opponentAutoOpen && !sameMatchAsStored) {
    await deps.showOpponentWindow().catch((err: unknown) => console.warn("[wc3gym] could not open the opponent window", err));
  }
  try {
    const history = await opponentHistory(live.opponent.battleTag, deps, caches);
    const card = buildOpponentCard(live, history);
    await write({ status: "ok", live: true, card: { ...card, extrasStatus: "loading", armyStatus: "loading" } }, deps.now());
    // The basics are on screen; identity and play style follow.
    const extras = await opponentExtras(card, history, deps, caches).then(
      (value) => ({ ...value, extrasStatus: "ok" as const }),
      () => ({ extrasStatus: "error" as const }),
    );
    // Your own record in this matchup: your history, cached like theirs.
    const myHistory = await opponentHistory(tag, deps, caches).catch(() => null);
    const myRecord = myHistory ? buildMyRecord(myHistory, tag, card.myRace, card.opponent.race, card.map) : null;
    const withExtras = { ...card, ...extras, myRecord, armyStatus: "loading" as const };
    if (readKey(OPPONENT).matchId === live.matchId) await write({ card: withExtras }, deps.now());
    // Their army last: it reads replays, a few seconds after everything else.
    const army = await opponentArmy(card, history, settings.apiBase, deps, caches).then(
      (composition) => ({ composition, armyStatus: "ok" as const }),
      () => ({ composition: null, armyStatus: "error" as const }),
    );
    if (readKey(OPPONENT).matchId === live.matchId) await write({ card: { ...withExtras, ...army } }, deps.now());
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
