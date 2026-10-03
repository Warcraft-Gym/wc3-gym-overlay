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
import akaLife from "./w3c/__fixtures__/aka.Medusa.json";
import detailsFixture from "./w3c/__fixtures__/match-details.d0wi.vsUndead.json";
import profileD0wi from "./w3c/__fixtures__/player.d0wi.json";
import { matchDetailSchema, w3cMatchSchema, type W3cMatch } from "./w3c/client";

const liveMatch = w3cMatchSchema.parse(ongoing); // ElTurry#1520 vs CactusPunch#2510, Autumn Leaves v2
const opponentTag = liveMatch.teams.flatMap((t) => t.players).find((p) => p.battleTag !== "ElTurry#1520")!.battleTag;
const history: W3cMatch[] = [...season25.matches, ...season24.matches].map((m) => w3cMatchSchema.parse(m));

function deps(overrides: Partial<OpponentWatcherDeps> = {}): OpponentWatcherDeps {
  return {
    fetchOngoingMatch: vi.fn(async () => liveMatch),
    fetchSeasonIds: vi.fn(async () => [25, 24, 23]),
    fetchMatchHistory: vi.fn(async () => history),
    fetchAka: vi.fn(async () => akaLife),
    fetchProfile: vi.fn(async () => profileD0wi),
    fetchMatchDetail: vi.fn(async () => matchDetailSchema.parse(detailsFixture[0])),
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
    // The opponent's two seasons, then your own two (for "your record").
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(4);
    expect(vi.mocked(d.fetchMatchHistory).mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [opponentTag, 25],
      [opponentTag, 24],
      ["ElTurry#1520", 25],
      ["ElTurry#1520", 24],
    ]);
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

  it("adds identity and play style after the basics (end to end on d0wi's real data)", async () => {
    // ElTurry's real live match, re-cast as Undead vs d0wi so the real
    // history and score sheets apply.
    const [mine, theirs] = liveMatch.teams.flatMap((t) => t.players);
    const me = mine.battleTag === "ElTurry#1520" ? mine : theirs;
    const vsD0wi = {
      ...liveMatch,
      teams: [{ players: [{ ...me, race: 8 }] }, { players: [{ ...me, battleTag: "d0wi#2726", name: "d0wi", race: 4 }] }],
    };
    const sheets = new Map(detailsFixture.map((x) => [x.match.id, matchDetailSchema.parse(x)]));
    const d = deps({
      fetchOngoingMatch: vi.fn(async () => vsD0wi),
      fetchMatchDetail: vi.fn(async (id: string) => sheets.get(id)!),
    });
    await setTag("ElTurry#1520");
    await pollOnce(d, freshCaches());
    const card = readKey(OPPONENT).card!;
    expect(card.extrasStatus).toBe("ok");
    expect(card.identity).toEqual({ aka: "Life", country: "CN", seasons: 19 });
    expect(card.style).toEqual({
      games: 8,
      goldPerMinute: 560,
      goldVsOpponents: 1.06,
      killsVsOpponents: 1.22,
      upkeepGames: 4,
      mercsPerGame: 1.4,
      heroKillsPerGame: 0.8,
      opponentHeroKillsPerGame: 2.1,
    });
    // Your own history is d0wi's too in this test, cast as Undead: no Undead games, so 0-0.
    expect(card.myRecord).toEqual({ vsRace: { wins: 0, losses: 0 }, onMap: { wins: 0, losses: 0 } });
    expect(d.fetchMatchDetail).toHaveBeenCalledTimes(8);
    expect(d.fetchAka).toHaveBeenCalledWith("d0wi#2726");
  });

  it("keeps the card when the extras fail", async () => {
    const d = deps({
      fetchAka: vi.fn(async () => Promise.reject(new Error("503"))),
      fetchProfile: vi.fn(async () => Promise.reject(new Error("503"))),
      fetchMatchDetail: vi.fn(async () => Promise.reject(new Error("503"))),
    });
    await setTag("ElTurry#1520");
    await pollOnce(d, freshCaches());
    const state = readKey(OPPONENT);
    expect(state.status).toBe("ok");
    expect(state.card?.identity).toBeNull();
    expect(state.card?.style).toBeNull();
  });

  it("reuses cached extras for a rematch", async () => {
    let id = "m1";
    const d = deps({ fetchOngoingMatch: vi.fn(async () => ({ ...liveMatch, id })) });
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    id = "m2";
    await pollOnce(d, caches);
    expect(d.fetchAka).toHaveBeenCalledTimes(1);
    expect(readKey(OPPONENT).card?.identity?.aka).toBe("Life");
  });

  it("rebuilds a card stored by an earlier app run for the same match", async () => {
    const d = deps();
    await setTag("ElTurry#1520");
    // What the previous version left behind: the same live match, an old card.
    await writeKey(OPPONENT, {
      status: "ok",
      matchId: liveMatch.id,
      live: true,
      error: null,
      card: { ...(await (async () => { await pollOnce(deps(), freshCaches()); return readKey(OPPONENT).card!; })()), identity: undefined, style: undefined, extrasStatus: undefined },
      updatedAt: null,
    });
    const caches = freshCaches();
    await pollOnce(d, caches);
    expect(readKey(OPPONENT).card?.extrasStatus).toBe("ok");
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(4);
    expect(d.showOpponentWindow).not.toHaveBeenCalled(); // not a new game: no surprise pop-up
    await pollOnce(d, caches);
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(4); // only once per run
  });

  it("makes one request per poll while the same match is live", async () => {
    const d = deps();
    const caches = freshCaches();
    await setTag("ElTurry#1520");
    await pollOnce(d, caches);
    await pollOnce(d, caches);
    await pollOnce(d, caches);
    expect(d.fetchOngoingMatch).toHaveBeenCalledTimes(3);
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(4);
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
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(4);
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
