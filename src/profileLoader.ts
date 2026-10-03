/**
 * Loads your own W3Champions profile into the store (`PROFILE`) for the
 * picker's Profile tab. About 12 to 15 requests: seasons, two history pages,
 * ladder stats, two MMR timelines, aka, profile and up to STYLE_GAMES score
 * sheets (2 at a time). Nothing goes through our site.
 *
 * Refreshed when the tab opens (if older than PROFILE_TTL_MS), from the
 * refresh button, and when a game you were in ends.
 */

import { isValidBattleTag, inBatches, DETAIL_CONCURRENCY, HISTORY_PAGE_SIZE } from "./opponentWatcher";
import { PROFILE, SETTINGS, type ProfileState } from "./store/keys";
import { readKey, writeKey } from "./store/state";
import {
  fetchAka,
  fetchGameModeStats,
  fetchMatchDetail,
  fetchMatchHistory,
  fetchMmrTimeline,
  fetchProfile,
  fetchSeasonIds,
  type W3cMatchDetail,
} from "./w3c/client";
import { buildIdentity, STYLE_GAMES } from "./w3c/opponentCard";
import { buildProfile, mainRace, profileStyleIds, raceId, type Profile } from "./w3c/profile";

/** A profile younger than this is shown as is when the tab opens. */
export const PROFILE_TTL_MS = 5 * 60_000;

export type ProfileDeps = {
  fetchSeasonIds: typeof fetchSeasonIds;
  fetchMatchHistory: typeof fetchMatchHistory;
  fetchGameModeStats: typeof fetchGameModeStats;
  fetchMmrTimeline: typeof fetchMmrTimeline;
  fetchAka: typeof fetchAka;
  fetchProfile: typeof fetchProfile;
  fetchMatchDetail: typeof fetchMatchDetail;
  now: () => number;
};

export const defaultProfileDeps: ProfileDeps = {
  fetchSeasonIds,
  fetchMatchHistory,
  fetchGameModeStats,
  fetchMmrTimeline,
  fetchAka,
  fetchProfile,
  fetchMatchDetail,
  now: () => Date.now(),
};

/** Fetch and build one player's profile. Optional pieces (ladder stats,
 *  MMR timeline, aka, score sheets) degrade to empty, never fail the load. */
export async function loadProfile(tag: string, deps: ProfileDeps): Promise<Profile | null> {
  const [current, previous] = await deps.fetchSeasonIds();
  const seasons = [current, previous].filter((s): s is number => typeof s === "number");
  const history = (await Promise.all(seasons.map((s) => deps.fetchMatchHistory(tag, s, HISTORY_PAGE_SIZE)))).flat();
  const race = mainRace(history, tag);
  const id = race ? raceId(race) : null;
  const oldestFirst = [...seasons].reverse();
  const [stats, timelines, aka, w3cProfile, details] = await Promise.all([
    typeof current === "number" ? deps.fetchGameModeStats(tag, current).catch(() => []) : Promise.resolve([]),
    id === null
      ? Promise.resolve([])
      : Promise.all(oldestFirst.map((s) => deps.fetchMmrTimeline(tag, id, s).catch(() => []))),
    deps.fetchAka(tag).catch(() => null),
    deps.fetchProfile(tag).catch(() => null),
    race
      ? inBatches(profileStyleIds(history, tag, race, STYLE_GAMES), DETAIL_CONCURRENCY, (matchId) =>
          deps.fetchMatchDetail(matchId).catch((): W3cMatchDetail | null => null),
        )
      : Promise.resolve([]),
  ]);
  return buildProfile({
    tag,
    history,
    stats,
    mmrHistory: timelines.flat().map((p) => p.mmr),
    identity: buildIdentity(aka, w3cProfile),
    details: details.filter((d): d is W3cMatchDetail => d !== null),
    now: deps.now(),
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function write(next: Partial<ProfileState>): Promise<void> {
  await writeKey(PROFILE, { ...readKey(PROFILE), ...next });
}

let inFlight: Promise<void> | null = null;

/** Whether the stored profile should be reloaded (see the module comment). */
export function needsRefresh(state: ProfileState, tag: string, now: number): boolean {
  if (state.tag?.toLowerCase() !== tag.toLowerCase() || state.status === "error" || state.status === "idle") return true;
  if (!state.fetchedAt) return true;
  return now - Date.parse(state.fetchedAt) >= PROFILE_TTL_MS;
}

/** Reload your profile into the store, once at a time. */
export function refreshProfile(options: { force?: boolean } = {}, deps: ProfileDeps = defaultProfileDeps): Promise<void> {
  if (inFlight) return inFlight;
  const tag = readKey(SETTINGS).myBattleTag;
  if (!tag || !isValidBattleTag(tag)) return Promise.resolve();
  const state = readKey(PROFILE);
  if (!options.force && !needsRefresh(state, tag, deps.now())) return Promise.resolve();
  const sameTag = state.tag?.toLowerCase() === tag.toLowerCase();
  inFlight = (async () => {
    await write({ status: "loading", tag, error: null, profile: sameTag ? state.profile : null });
    try {
      const profile = await loadProfile(tag, deps);
      await write({ status: "ok", profile, error: null, fetchedAt: new Date(deps.now()).toISOString() });
    } catch (err) {
      await write({ status: "error", error: `Couldn't load your W3Champions profile: ${describe(err)}` });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
