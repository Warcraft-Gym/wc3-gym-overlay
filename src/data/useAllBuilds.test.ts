import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBuildListItem } from "../api/schema";
import { createLocalBuild } from "../lib/localBuilds";
import { BUILDS_CACHE } from "../store/keys";
import { writeKey } from "../store/state";

const fetchBuildsMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, fetchBuilds: fetchBuildsMock };
});

const { useAllBuilds, isLocalBuild } = await import("./useAllBuilds");
const { writeLocalBuilds } = await import("./localBuildsStore");

function siteBuild(slug: string, updatedAt: string): ApiBuildListItem {
  return {
    slug,
    title: slug,
    race: "human",
    vsRaces: [],
    difficulty: "beginner",
    tags: [],
    summary: "s",
    author: "a",
    featured: false,
    publishedAt: updatedAt,
    updatedAt,
    steps: [],
  };
}

describe("useAllBuilds", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchBuildsMock.mockReset();
    fetchBuildsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it("stamps site builds with source:'site' and local builds keep source:'local'", async () => {
    // F003: `useBuilds`'s own fetch effect fires on mount and overwrites
    // `BUILDS_CACHE` with whatever `fetchBuilds` resolves to — so the mock
    // must resolve to the *same* site build seeded below. Leaving the
    // default `mockResolvedValue([])` from `beforeEach` in place raced that
    // overwrite against this test's `waitFor` (cache "site-a" → briefly
    // clobbered back to `[]` by the in-flight fetch → "site-a" again once
    // `useBuilds` re-derives from the still-present raw response), which
    // only stayed stable when earlier tests in the file happened to leave
    // the module's `parsedCache` (`store/state.ts`) primed a particular
    // way — hence "passes in the suite, fails alone".
    const site = [siteBuild("site-a", "2026-01-01T00:00:00.000Z")];
    fetchBuildsMock.mockResolvedValue(site);
    await writeKey(BUILDS_CACHE, {
      fetchedAt: "x",
      apiBase: "http://x",
      builds: site,
    });
    await writeLocalBuilds([createLocalBuild({
      title: "Private",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go" }],
    })]);

    const { result } = renderHook(() => useAllBuilds());
    await waitFor(() => expect(result.current.builds.length).toBe(2));

    const [first, second] = result.current.builds;
    expect(isLocalBuild(first)).toBe(true);
    expect(second.source).toBe("site");
  });

  it("orders local builds newest-updatedAt-first, ahead of site builds", async () => {
    const site = [siteBuild("site-a", "2026-06-01T00:00:00.000Z")];
    fetchBuildsMock.mockResolvedValue(site);
    await writeKey(BUILDS_CACHE, {
      fetchedAt: "x",
      apiBase: "http://x",
      builds: site,
    });
    // F003-followup-1: explicit `updatedAt` fixtures instead of a real
    // 2 ms `setTimeout` gap between the two `createLocalBuild` calls — the
    // ordering assertion below only needs two distinct timestamps, not
    // wall-clock time actually elapsing between them.
    const older = {
      ...createLocalBuild({
        title: "Older",
        race: "orc",
        vsRaces: [],
        difficulty: "beginner",
        tags: [],
        summary: "s",
        author: "a",
        steps: [{ instruction: "go" }],
      }),
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    };
    const newer = {
      ...createLocalBuild({
        title: "Newer",
        race: "orc",
        vsRaces: [],
        difficulty: "beginner",
        tags: [],
        summary: "s",
        author: "a",
        steps: [{ instruction: "go" }],
      }),
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:00.000Z",
    };
    await writeLocalBuilds([older, newer]);

    const { result } = renderHook(() => useAllBuilds());
    await waitFor(() => expect(result.current.builds.length).toBe(3));

    expect(result.current.builds.map((b) => b.title)).toEqual(["Newer", "Older", "site-a"]);
  });

  it("renders local builds even when the site fetch fails and the cache is empty", async () => {
    fetchBuildsMock.mockRejectedValueOnce(new Error("network down"));
    await writeLocalBuilds([createLocalBuild({
      title: "Offline-safe",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go" }],
    })]);

    const { result } = renderHook(() => useAllBuilds());
    await waitFor(() => expect(result.current.status).toBe("empty"));
    expect(result.current.builds.map((b) => b.title)).toEqual(["Offline-safe"]);
  });
});
