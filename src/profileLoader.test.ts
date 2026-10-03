import { beforeEach, describe, expect, it, vi } from "vitest";
import gameModeStats from "./w3c/__fixtures__/game-mode-stats.d0wi.json";
import timeline24 from "./w3c/__fixtures__/mmr-timeline.d0wi.s24.json";
import timeline25 from "./w3c/__fixtures__/mmr-timeline.d0wi.s25.json";
import profileD0wi from "./w3c/__fixtures__/player.d0wi.json";
import season24 from "./w3c/__fixtures__/search.d0wi.season24.json";
import season25 from "./w3c/__fixtures__/search.d0wi.season25.json";
import detailsFixture from "./w3c/__fixtures__/match-details.d0wi.vsUndead.json";
import { clearProfileCache, loadProfile, needsRefresh, PROFILE_TTL_MS, refreshProfile, type ProfileDeps } from "./profileLoader";
import { PROFILE, SETTINGS } from "./store/keys";
import { readKey, writeKey } from "./store/state";
import { matchDetailSchema, w3cMatchSchema } from "./w3c/client";
import { D0WI, PROFILE_NOW } from "./w3c/testProfile";

function deps(overrides: Partial<ProfileDeps> = {}): ProfileDeps {
  const pages: Record<number, unknown[]> = { 25: season25.matches, 24: season24.matches };
  const timelines: Record<number, { mmr: number; date: string }[]> = { 25: timeline25.mmrRpAtDates, 24: timeline24.mmrRpAtDates };
  const details = detailsFixture.map((d) => matchDetailSchema.parse(d));
  return {
    fetchSeasonIds: vi.fn(async () => [25, 24]),
    fetchMatchHistory: vi.fn(async (_tag: string, season: number) => (pages[season] ?? []).map((m) => w3cMatchSchema.parse(m))),
    fetchGameModeStats: vi.fn(async () => gameModeStats),
    fetchMmrTimeline: vi.fn(async (_tag: string, _race: number, season: number) => timelines[season] ?? []),
    fetchAka: vi.fn(async () => ({ name: null })),
    fetchProfile: vi.fn(async () => profileD0wi),
    fetchMatchDetail: vi.fn(async (id: string) => details.find((d) => d.match.id === id) ?? details[0]),
    now: () => PROFILE_NOW,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearProfileCache();
});

describe("loadProfile", () => {
  it("builds d0wi's profile from both seasons, the ladder stats and 8 score sheets", async () => {
    const d = deps();
    const p = await loadProfile(D0WI, d);
    expect(p?.overall).toEqual({ wins: 57, losses: 52 });
    expect(p?.mmr).toBe(1830);
    expect(p?.mmrHistory[0]).toBe(1747); // season 24 first
    expect(d.fetchMmrTimeline).toHaveBeenCalledWith(D0WI, 4, 24);
    expect(d.fetchMatchDetail).toHaveBeenCalledTimes(8);
  });

  it("optional pieces failing do not fail the profile", async () => {
    const boom = async () => {
      throw new Error("503");
    };
    const p = await loadProfile(D0WI, deps({ fetchGameModeStats: boom, fetchMmrTimeline: boom, fetchAka: boom, fetchProfile: boom, fetchMatchDetail: boom }));
    expect(p?.overall).toEqual({ wins: 57, losses: 52 });
    expect(p?.mmr).toBeNull();
    expect(p?.style).toBeNull();
  });
});

describe("refreshProfile", () => {
  it("does nothing without a valid BattleTag", async () => {
    const d = deps();
    await refreshProfile({}, d);
    expect(d.fetchSeasonIds).not.toHaveBeenCalled();
    expect(readKey(PROFILE).status).toBe("idle");
  });

  it("stores the profile, then skips a reload while it is fresh", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: D0WI });
    const d = deps();
    await refreshProfile({}, d);
    expect(readKey(PROFILE)).toMatchObject({ status: "ok", tag: D0WI, error: null });
    expect(readKey(PROFILE).profile?.name).toBe("d0wi");
    await refreshProfile({}, d);
    expect(d.fetchSeasonIds).toHaveBeenCalledTimes(1);
    await refreshProfile({ force: true }, d);
    expect(d.fetchSeasonIds).toHaveBeenCalledTimes(2);
  });

  it("records an error the tab can show", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: D0WI });
    await refreshProfile({}, deps({ fetchSeasonIds: async () => Promise.reject(new Error("W3Champions answered 503")) }));
    expect(readKey(PROFILE).status).toBe("error");
    expect(readKey(PROFILE).error).toContain("503");
  });
});

describe("switching race", () => {
  it("reloads for the new race without fetching the history again", async () => {
    await writeKey(SETTINGS, { ...readKey(SETTINGS), myBattleTag: D0WI });
    const d = deps();
    await refreshProfile({}, d);
    await writeKey(SETTINGS, { ...readKey(SETTINGS), profileRace: "random" });
    await refreshProfile({}, d);
    expect(readKey(PROFILE).race).toBe("random");
    expect(d.fetchMatchHistory).toHaveBeenCalledTimes(2); // two seasons, once
    // d0wi has no Random games, so the profile falls back to Night Elf.
    expect(readKey(PROFILE).profile?.race).toBe("nightelf");
  });

  it("asks W3Champions for Random's MMR line with race id 0", async () => {
    const d = deps();
    const season25 = (await d.fetchMatchHistory(D0WI, 25)).map((m) => ({
      ...m,
      teams: m.teams.map((t) => ({ ...t, players: t.players.map((p) => (p.battleTag === D0WI ? { ...p, race: 0, rndRace: 4 } : p)) })),
    }));
    const random = deps({ fetchMatchHistory: vi.fn(async (_t: string, s: number) => (s === 25 ? season25 : [])) });
    const p = await loadProfile(D0WI, random, "random");
    expect(p?.race).toBe("random");
    expect(random.fetchMmrTimeline).toHaveBeenCalledWith(D0WI, 0, 25);
  });
});

describe("needsRefresh", () => {
  const ok = { status: "ok" as const, tag: D0WI, race: null, profile: null, error: null, fetchedAt: new Date(PROFILE_NOW).toISOString() };
  it("reloads when stale, for another tag, or after an error", () => {
    expect(needsRefresh(ok, D0WI, PROFILE_NOW + 1000)).toBe(false);
    expect(needsRefresh(ok, D0WI, PROFILE_NOW + PROFILE_TTL_MS)).toBe(true);
    expect(needsRefresh(ok, "Other#1234", PROFILE_NOW)).toBe(true);
    expect(needsRefresh({ ...ok, status: "error" }, D0WI, PROFILE_NOW)).toBe(true);
    expect(needsRefresh(ok, D0WI, PROFILE_NOW, "random")).toBe(true);
  });
});
