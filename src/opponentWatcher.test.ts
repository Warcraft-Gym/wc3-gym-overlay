import { beforeEach, describe, expect, it, vi } from "vitest";
import ongoing from "./w3c/__fixtures__/ongoing.ElTurry.json";
import season24 from "./w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "./w3c/__fixtures__/search.d0wi.season25.json";
import {
  isValidBattleTag,
  OPPONENT_ERROR_BACKOFF_MS,
  OPPONENT_POLL_MS,
  pollOnce,
  startOpponentWatcher,
  type OpponentWatcherDeps,
} from "./opponentWatcher";
import { OPPONENT, SETTINGS } from "./store/keys";
import { readKey, writeKey } from "./store/state";
import { w3cMatchSchema, type W3cMatch } from "./w3c/client";

const liveMatch = w3cMatchSchema.parse(ongoing); // ElTurry#1520 vs CactusPunch#2510, Autumn Leaves v2
const opponentTag = liveMatch.teams.flatMap((t) => t.players).find((p) => p.battleTag !== "ElTurry#1520")!.battleTag;
const history: W3cMatch[] = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));

function deps(overrides: Partial<OpponentWatcherDeps> = {}): OpponentWatcherDeps {
  return {
    fetchOngoingMatch: vi.fn(async () => liveMatch),
    fetchSeasonIds: vi.fn(async () => [25, 24, 23]),
    fetchMatchHistory: vi.fn(async () => history),
    showOpponentWindow: vi.fn(async () => {}),
    now: () => Date.parse("2026-10-03T00:00:00Z"),
    ...overrides,
  };
}

const freshCaches = () => ({ seasons: null, history: new Map() });

async function setTag(tag: string | null, opponentCard = true) {
  await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: tag, opponentCard });
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("isValidBattleTag", () => {
  it("accepts real tags and rejects malformed ones", () => {
    for (const ok of ["d0wi#2726", "NecroDoom#11385", "IIIIIlllIIIl#3697", "Elf#1754", " ElTurry#1520 "]) expect(isValidBattleTag(ok)).toBe(true);
    for (const bad of ["", "d0wi", "#2726", "d0wi#", "d0 wi#2726", "d0wi#27"]) expect(isValidBattleTag(bad)).toBe(false);
  });
});

describe("pollOnce", () => {
  it("does nothing until a valid BattleTag is set", async () => {
    const d = deps();
    await setTag(null);
    expect(await pollOnce(d, freshCaches())).toBe(OPPONENT_POLL_MS);
    await setTag("not a tag");
    expect(await pollOnce(d, freshCaches())).toBe(OPPONENT_POLL_MS);
    expect(d.fetchOngoingMatch).not.toHaveBeenCalled();
  });

  it("does nothing when the feature is off", async () => {
    const d = deps();
    await setTag("ElTurry#1520", false);
    await pollOnce(d, freshCaches());
    expect(d.fetchOngoingMatch).not.toHaveBeenCalled();
  });

  it("builds the card once for a new live match, from two seasons", async () => {
    const d = deps();
    await setTag("ElTurry#1520");
    await pollOnce(d, freshCaches());
    const state = readKey(OPPONENT);
    expect(state.status).toBe("ok");
    expect(state.live).toBe(true);
    expect(state.matchId).toBe(liveMatch.id);
    expect(state.card?.opponent.battleTag).toBe(opponentTag);
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d.fetchMatchHistory).mock.calls.map((c) => c[1])).toEqual([25, 24]);
  });

  it("opens the opponent window once per new match, unless switched off", async () => {
    const d = deps();
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    await pollOnce(d, caches);
    expect(d.showOpponentWindow).toHaveBeenCalledTimes(1);

    const quiet = deps();
    localStorage.clear();
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: "ElTurry#1520", opponentAutoOpen: false });
    await pollOnce(quiet, freshCaches());
    expect(readKey(OPPONENT).status).toBe("ok");
    expect(quiet.showOpponentWindow).not.toHaveBeenCalled();
  });

  it("still builds the card when the window cannot be opened", async () => {
    const d = deps({ showOpponentWindow: vi.fn(async () => Promise.reject(new Error("no window"))) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await setTag("ElTurry#1520");
    await pollOnce(d, freshCaches());
    expect(readKey(OPPONENT).status).toBe("ok");
  });

  it("makes one request per poll while the same match is live", async () => {
    const d = deps();
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    await pollOnce(d, caches);
    await pollOnce(d, caches);
    expect(d.fetchOngoingMatch).toHaveBeenCalledTimes(3);
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(2);
  });

  it("reuses a cached opponent history for a rematch", async () => {
    let id = "m1";
    const d = deps({ fetchOngoingMatch: vi.fn(async () => ({ ...liveMatch, id })) });
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    id = "m2";
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).matchId).toBe("m2");
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(2);
  });

  it("marks the card not live when the game ends, keeping it", async () => {
    let inGame = true;
    const d = deps({ fetchOngoingMatch: vi.fn(async () => (inGame ? liveMatch : null)) });
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    inGame = false;
    await pollOnce(d, caches);
    const state = readKey(OPPONENT);
    expect(state.live).toBe(false);
    expect(state.card?.opponent.battleTag).toBe(opponentTag);
  });

  it("ends a live card when the feature is switched off or the tag cleared mid-game", async () => {
    const d = deps();
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).live).toBe(true);
    await setTag("ElTurry#1520", false);
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).live).toBe(false);

    await setTag("ElTurry#1520");
    await writeKey(OPPONENT, { ...readKey(OPPONENT), matchId: null });
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).live).toBe(true);
    await setTag(null);
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).live).toBe(false);
  });

  it("ignores a live match I am not part of (a mistyped tag)", async () => {
    const d = deps();
    await setTag("Somebody#1234");
    await pollOnce(d, freshCaches());
    expect(readKey(OPPONENT).status).toBe("idle");
  });

  it("backs off after a failed live check and leaves the state alone", async () => {
    const d = deps({ fetchOngoingMatch: vi.fn(async () => Promise.reject(new Error("offline"))) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await setTag("ElTurry#1520");
    expect(await pollOnce(d, freshCaches())).toBe(OPPONENT_ERROR_BACKOFF_MS);
    expect(readKey(OPPONENT).status).toBe("idle");
  });

  it("shows an error card when the history cannot be loaded", async () => {
    const d = deps({ fetchMatchHistory: vi.fn(async () => Promise.reject(new Error("W3Champions answered 503"))) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await setTag("ElTurry#1520");
    expect(await pollOnce(d, freshCaches())).toBe(OPPONENT_ERROR_BACKOFF_MS);
    const state = readKey(OPPONENT);
    expect(state.status).toBe("error");
    expect(state.live).toBe(true);
    expect(state.error).toContain("503");
  });
});

describe("startOpponentWatcher", () => {
  it("runs one loop, polls on the interval, and stops cleanly", async () => {
    vi.useFakeTimers();
    try {
      const d = deps();
      await setTag("ElTurry#1520");
      const stop = startOpponentWatcher(d);
      expect(startOpponentWatcher(d)).toBe(stop);
      await vi.advanceTimersByTimeAsync(0);
      expect(d.fetchOngoingMatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(OPPONENT_POLL_MS);
      expect(d.fetchOngoingMatch).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(OPPONENT_POLL_MS * 3);
      expect(d.fetchOngoingMatch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
