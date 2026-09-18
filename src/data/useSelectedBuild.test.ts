import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ApiBuildListItem } from "../api/schema";
import { createLocalBuild } from "../lib/localBuilds";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG } from "../store/keys";
import { writeKey } from "../store/state";
import { writeLocalBuilds } from "./localBuildsStore";
import { useSelectedBuild } from "./useSelectedBuild";

function fakeBuild(slug: string): ApiBuildListItem {
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
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    steps: [{ instruction: "start", time: "0:00" }],
  };
}

describe("useSelectedBuild", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("returns null when nothing is selected", () => {
    const { result } = renderHook(() => useSelectedBuild());
    expect(result.current).toBeNull();
  });

  it("returns null when the selected slug isn't in the cache", async () => {
    await writeKey(BUILDS_CACHE, { fetchedAt: "x", apiBase: "http://x", builds: [fakeBuild("a")] });
    await writeKey(SELECTED_BUILD_SLUG, "missing");

    const { result } = renderHook(() => useSelectedBuild());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("returns the matching build (with steps) from the cache", async () => {
    await writeKey(BUILDS_CACHE, {
      fetchedAt: "x",
      apiBase: "http://x",
      builds: [fakeBuild("a"), fakeBuild("b")],
    });
    await writeKey(SELECTED_BUILD_SLUG, "b");

    const { result } = renderHook(() => useSelectedBuild());
    await waitFor(() => expect(result.current?.slug).toBe("b"));
    expect(result.current?.steps).toEqual([{ instruction: "start", time: "0:00" }]);
    expect(result.current?.source).toBe("site");
  });

  it("resolves a local slug from LOCAL_BUILDS, offline and without touching the site cache", async () => {
    const local = createLocalBuild({
      title: "Private opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go" }],
    });
    await writeLocalBuilds([local]);
    await writeKey(SELECTED_BUILD_SLUG, local.slug);

    const { result } = renderHook(() => useSelectedBuild());
    await waitFor(() => expect(result.current?.slug).toBe(local.slug));
    expect(result.current?.source).toBe("local");
  });

  it("prefers a local build over a site build sharing the same slug", async () => {
    const local = createLocalBuild({
      title: "Private wins",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go" }],
    });
    await writeLocalBuilds([local]);
    await writeKey(BUILDS_CACHE, { fetchedAt: "x", apiBase: "http://x", builds: [fakeBuild(local.slug)] });
    await writeKey(SELECTED_BUILD_SLUG, local.slug);

    const { result } = renderHook(() => useSelectedBuild());
    await waitFor(() => expect(result.current?.title).toBe("Private wins"));
  });
});
