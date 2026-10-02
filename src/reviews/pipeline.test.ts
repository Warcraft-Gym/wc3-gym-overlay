/**
 * F009 (plan-vs-actual-engine) – the review pipeline: `onLastReplay` →
 * snapshot the selected build → import → `pickMe` → `compareBuild` →
 * `LAST_REVIEW`. `fetch` is mocked throughout (via a controllable deferred
 * mock) – no real network. `host.watchLastReplay`/`host.onStateChanged`
 * are spied so `startReplayWatcher()` never touches a real filesystem;
 * `onLastReplay` itself is the real module (not mocked) so these tests
 * exercise the actual subscription wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBuildListItem } from "../api/schema";
import { host } from "../host";
import { DEFAULT_SHORTCUTS } from "../config";
import { startReplayWatcher } from "../replayWatcher";
import { BUILDS_CACHE, LAST_REVIEW, SELECTED_BUILD_SLUG, SETTINGS, type Settings } from "../store/keys";
import { readKey, writeKey } from "../store/state";
import { markReviewSeen, resolveReview, retryReview, startReviewPipeline } from "./pipeline";
import type { Review } from "./types";
// F010a – follow-up of F010: the real "every option on" production
// response (see `api/replayImport.test.ts`'s doc comment on this same
// fixture) – this review pipeline always sends exactly these options (see
// `REVIEW_CUTOFF_SECONDS`/`REVIEW_INCLUDE_UPGRADES`/`REVIEW_INCLUDE_ITEMS`
// above), so this is the real shape a production review import receives,
// including the two icon-less item-purchase steps that used to make
// `storeOkReview` below unreachable (the whole response failed `safeParse`).
import ALL_OPTIONS_FIXTURE from "../api/__fixtures__/replay-import.production.all-options.json";

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiBase: "https://warcraft-gym.com",
    opacity: 1,
    scale: 1,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    autoUpdate: true,
    skippedVersion: null,
    autoImport: true,
    replayFolder: null,
    myBattleTag: null,
    ...overrides,
  };
}

function fakeBuild(overrides: Partial<ApiBuildListItem> = {}): ApiBuildListItem {
  return {
    slug: "plan-a",
    title: "Plan A",
    race: "orc",
    vsRaces: [],
    difficulty: "beginner",
    tags: [],
    summary: "s",
    author: "a",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    // or-grunt, not or-peon - a worker icon's own plan row is "not-timed"
    // (F010b), excluded from `summary.total`/`onPlan`, which several tests
    // below assert on against `replayResponse()`'s matching step.
    steps: [{ time: "0:00", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }],
    ...overrides,
  };
}

async function selectBuild(build: ApiBuildListItem): Promise<void> {
  await writeKey(BUILDS_CACHE, { fetchedAt: "x", apiBase: "https://warcraft-gym.com", builds: [build] });
  await writeKey(SELECTED_BUILD_SLUG, build.slug);
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: () => Promise.resolve(body) } as unknown as Response;
}

function replayResponse(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    map: "lastrefuge.anon",
    duration: "11:03",
    version: "1.32",
    source: { label: "LastReplay.w3g" },
    players: [
      {
        id: 1,
        name: "Me#1111",
        race: "orc",
        dropped: 0,
        build: {
          title: "t",
          race: "orc",
          vsRaces: ["undead"],
          difficulty: "intermediate",
          patch: "",
          tags: ["replay"],
          summary: "s",
          author: "Me#1111",
          authorDiscord: "",
          sourceUrl: "",
          description: "",
          steps: [{ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }],
        },
      },
      {
        id: 2,
        name: "Foe#2222",
        race: "undead",
        dropped: 0,
        build: {
          title: "t2",
          race: "undead",
          vsRaces: ["orc"],
          difficulty: "intermediate",
          patch: "",
          tags: ["replay"],
          summary: "s",
          author: "Foe#2222",
          authorDiscord: "",
          sourceUrl: "",
          description: "",
          steps: [],
        },
      },
    ],
    ...overrides,
  };
}

type PendingFetch = { resolve: (response: Response) => void; reject: (err: unknown) => void };

/** A controllable `fetch` mock: every call creates a pending promise this
 *  test resolves/rejects explicitly, and honours `init.signal` the same
 *  way a real `fetch` would (rejecting with a real `AbortError` once the
 *  signal fires) – needed to exercise "newest wins, abort the old
 *  request" for real, not just by inspecting whether `.abort()` was
 *  called. */
function installFetchMock(): { calls: RequestInit[]; pending: PendingFetch[] } {
  const calls: RequestInit[] = [];
  const pending: PendingFetch[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Promise<Response>((resolve, reject) => {
        pending.push({ resolve, reject });
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    }),
  );
  return { calls, pending };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("review pipeline", () => {
  let teardown: (() => void) | null = null;

  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(host, "onStateChanged").mockReturnValue(() => {});
    vi.spyOn(host, "watchLastReplay").mockImplementation((_opts, onReplay) => {
      capturedOnReplay = onReplay;
      return () => {};
    });
    await writeKey(SETTINGS, settings());
    teardown = startReplayWatcher();
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  let capturedOnReplay: (event: { path: string; mtimeMs: number; bytes: Uint8Array }) => void = () => {};

  function fireReplay(path: string, mtimeMs: number, byte = 1): void {
    capturedOnReplay({ path, mtimeMs, bytes: new Uint8Array([byte]) });
  }

  it("stores an ok review: snapshot plan, pickMe by race, compareBuild against the resolved player", async () => {
    await selectBuild(fakeBuild());
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 1000);
    await flush();
    pending[0].resolve(okResponse(replayResponse()));
    await flush();

    const review = readKey(LAST_REVIEW);
    expect(review?.status).toBe("ok");
    expect(review?.source).toEqual({ path: "/x/LastReplay.w3g", mtimeMs: 1000 });
    expect(review?.map).toBe("lastrefuge.anon");
    expect(review?.meStatus).toBe("resolved"); // only one orc player, matches planRace
    expect(review?.meId).toBe(1);
    expect(review?.plan).toMatchObject({ slug: "plan-a", title: "Plan A", race: "orc" });
    expect(review?.comparison?.summary).toMatchObject({ total: 1, onPlan: 1 });
    expect(review?.seen).toBe(false);
    stop();
  });

  it("stores plan: null and comparison: null when no build is selected", async () => {
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 1000);
    await flush();
    pending[0].resolve(okResponse(replayResponse()));
    await flush();

    const review = readKey(LAST_REVIEW);
    expect(review?.status).toBe("ok");
    expect(review?.plan).toBeNull();
    expect(review?.comparison).toBeNull();
    // The players/steps are still captured, for the UI to list "what you did".
    expect(review?.players).toHaveLength(2);
    stop();
  });

  it("stores a status: error review with the server's message on a failed import", async () => {
    await selectBuild(fakeBuild());
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 2000);
    await flush();
    pending[0].resolve(errorResponse(422, { error: "Replay couldn't be parsed." }));
    await flush();

    const review = readKey(LAST_REVIEW);
    expect(review?.status).toBe("error");
    expect(review?.error).toBe("Replay couldn't be parsed.");
    expect(review?.source).toEqual({ path: "/x/LastReplay.w3g", mtimeMs: 2000 });
    expect(review?.map).toBe("");
    expect(review?.players).toEqual([]);
    // The plan snapshot is still captured even on failure.
    expect(review?.plan).toMatchObject({ slug: "plan-a" });
    stop();
  });

  it("newest wins: a replay arriving mid-import aborts the previous request and its result is discarded", async () => {
    await selectBuild(fakeBuild());
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/game1.w3g", 1000);
    await flush();
    expect(pending).toHaveLength(1);

    fireReplay("/x/game2.w3g", 2000);
    await flush();
    expect(pending).toHaveLength(2);

    // The first request was aborted – resolving it anyway must never land
    // in the store (there is no `.then` left that would write it).
    pending[0].resolve(okResponse(replayResponse({ map: "game1-map" })));
    pending[1].resolve(okResponse(replayResponse({ map: "game2-map" })));
    await flush();

    const review = readKey(LAST_REVIEW);
    expect(review?.source.path).toBe("/x/game2.w3g");
    expect(review?.map).toBe("game2-map");
    stop();
  });

  // F010a – follow-up of F010: `App.tsx` starts this pipeline from a plain
  // `useEffect(() => startReviewPipeline(), [])`, which React's
  // `<StrictMode>` (`pages/picker/main.tsx`) mounts twice in dev: mount,
  // run the effect's cleanup (the first subscription's unsubscribe),
  // remount, run the effect again (a second subscription). `onLastReplay`'s
  // `Set`-based subscribe/unsubscribe (`replayWatcher.ts`) already makes
  // this safe – only the second subscription is still registered by the
  // time a real replay fires – this test is a regression guard confirming
  // that stays true: exactly one request per replay, never two.
  it("StrictMode's mount/cleanup/remount of startReviewPipeline() still makes exactly one request per replay", async () => {
    await selectBuild(fakeBuild());
    const { calls, pending } = installFetchMock();

    const strictModeFirstStop = startReviewPipeline();
    strictModeFirstStop();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 1000);
    await flush();

    expect(calls).toHaveLength(1);
    expect(pending).toHaveLength(1);
    pending[0].resolve(okResponse(replayResponse()));
    await flush();

    expect(readKey(LAST_REVIEW)?.status).toBe("ok");
    stop();
  });

  // F010a – follow-up of F010: end to end against the real "every option
  // on" production response, whose two item-purchase steps have no `icon`
  // at all (see `ALL_OPTIONS_FIXTURE`'s import comment above). Pre-fix,
  // `storeOkReview` was unreachable for this response – the whole body
  // failed `replayImportResponseSchema.safeParse`, so this test would have
  // stored `status: "error"` with the "wasn't a valid reply" message.
  it("produces an ok review end to end for the real response with icon-less item-purchase steps", async () => {
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 1000);
    await flush();
    pending[0].resolve(okResponse(ALL_OPTIONS_FIXTURE));
    await flush();

    const review = readKey(LAST_REVIEW);
    expect(review?.status).toBe("ok");
    expect(review?.map).toBe("Last Refuge");
    expect(review?.players.map((p) => p.name)).toEqual(["Dretwiak#2963", "SoulKeeper#1844"]);
    const dretwiak = review?.players.find((p) => p.name === "Dretwiak#2963");
    expect(dretwiak?.steps.some((s) => s.instruction === "Buy Circlet of Nobility" && s.icon === undefined)).toBe(
      true,
    );
    stop();
  });

  it("snapshot independence: changing the selected build after import does not alter the stored review", async () => {
    await selectBuild(fakeBuild({ slug: "plan-a", title: "Plan A" }));
    const { pending } = installFetchMock();
    const stop = startReviewPipeline();

    fireReplay("/x/LastReplay.w3g", 1000);
    await flush();
    pending[0].resolve(okResponse(replayResponse()));
    await flush();

    await selectBuild(fakeBuild({ slug: "plan-b", title: "Plan B" }));

    const review = readKey(LAST_REVIEW);
    expect(review?.plan?.slug).toBe("plan-a");
    stop();
  });

  describe("retryReview", () => {
    it("re-imports when the file's current mtime still matches the failed review's source", async () => {
      const failed: Review = {
        id: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
        status: "error",
        error: "network fail",
        map: "",
        duration: "",
        players: [],
        meId: null,
        meStatus: "unresolved",
        plan: null,
        comparison: null,
        seen: false,
      };
      await writeKey(LAST_REVIEW, failed);
      vi.spyOn(host, "readReplayFile").mockResolvedValue({ bytes: new Uint8Array([1]), mtimeMs: 1000 });
      const { pending } = installFetchMock();

      const retry = retryReview();
      await flush();
      expect(pending).toHaveLength(1);
      pending[0].resolve(okResponse(replayResponse()));
      await retry;

      const review = readKey(LAST_REVIEW);
      expect(review?.status).toBe("ok");
    });

    it("reports a newer-game message instead of importing when the mtime changed", async () => {
      const failed: Review = {
        id: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
        status: "error",
        error: "network fail",
        map: "",
        duration: "",
        players: [],
        meId: null,
        meStatus: "unresolved",
        plan: null,
        comparison: null,
        seen: false,
      };
      await writeKey(LAST_REVIEW, failed);
      vi.spyOn(host, "readReplayFile").mockResolvedValue({ bytes: new Uint8Array([1]), mtimeMs: 2000 });
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await retryReview();

      expect(fetchMock).not.toHaveBeenCalled();
      const review = readKey(LAST_REVIEW);
      expect(review?.status).toBe("error");
      expect(review?.error).toMatch(/newer game/i);
    });

    it("is a no-op when the current review is status: ok", async () => {
      await selectBuild(fakeBuild());
      const { pending } = installFetchMock();
      const stop = startReviewPipeline();
      fireReplay("/x/LastReplay.w3g", 1000);
      await flush();
      pending[0].resolve(okResponse(replayResponse()));
      await flush();
      const before = readKey(LAST_REVIEW);

      const readSpy = vi.spyOn(host, "readReplayFile");
      await retryReview();
      expect(readSpy).not.toHaveBeenCalled();
      expect(readKey(LAST_REVIEW)).toEqual(before);
      stop();
    });
  });

  describe("resolveReview", () => {
    it("recomputes the comparison for a different meId without re-importing", async () => {
      const review: Review = {
        id: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
        status: "ok",
        map: "lastrefuge.anon",
        duration: "11:03",
        players: [
          { id: 1, name: "A#1", race: "orc", steps: [] },
          // or-grunt, not or-peon - a worker icon's row would be
          // "not-timed" (F010b), excluded from `summary.total`, which
          // would defeat the point of this test.
          { id: 2, name: "B#2", race: "undead", steps: [{ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }] },
        ],
        meId: 1,
        meStatus: "resolved",
        plan: { slug: "plan-a", title: "Plan A", race: "orc", steps: [{ time: "0:00", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }] },
        comparison: {
          rows: [],
          extras: [],
          summary: { total: 0, onPlan: 0, early: 0, late: 0, missed: 0, notTimed: 0, firstSlip: null },
        },
        seen: false,
      };

      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const updated = await resolveReview(review, 2);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(updated.meId).toBe(2);
      expect(updated.meStatus).toBe("resolved");
      expect(updated.comparison?.summary.total).toBe(1);
      expect(readKey(LAST_REVIEW)).toEqual(updated);
    });

    it("saves myBattleTag to Settings when rememberBattleTag is given", async () => {
      const review: Review = {
        id: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
        status: "ok",
        map: "m",
        duration: "d",
        players: [{ id: 1, name: "A#1", race: "orc", steps: [] }],
        meId: null,
        meStatus: "unresolved",
        plan: null,
        comparison: null,
        seen: false,
      };

      await resolveReview(review, 1, "A#1");
      expect(readKey(SETTINGS).myBattleTag).toBe("A#1");
    });
  });

  describe("markReviewSeen", () => {
    it("marks the current review seen", async () => {
      await writeKey(LAST_REVIEW, {
        id: "r1",
        createdAt: "2026-01-01T00:00:00.000Z",
        source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
        status: "ok",
        map: "m",
        duration: "d",
        players: [],
        meId: null,
        meStatus: "unresolved",
        plan: null,
        comparison: null,
        seen: false,
      });
      await markReviewSeen();
      expect(readKey(LAST_REVIEW)?.seen).toBe(true);
    });

    it("is a no-op when there is no review yet", async () => {
      await markReviewSeen();
      expect(readKey(LAST_REVIEW)).toBeNull();
    });
  });
});
