import { beforeEach, describe, expect, it } from "vitest";
import type { ApiBuildListItem } from "../api/schema";
import { createLocalBuild } from "../lib/localBuilds";
import { BUILDS_CACHE } from "../store/keys";
import { writeKey } from "../store/state";
import { writeLocalBuilds } from "./localBuildsStore";
import { resolveSelectedSteps } from "./selectedBuildSteps";

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

describe("resolveSelectedSteps", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns [] when slug is null", () => {
    expect(resolveSelectedSteps(null)).toEqual([]);
  });

  it("returns [] for an unknown slug", () => {
    expect(resolveSelectedSteps("missing")).toEqual([]);
  });

  it("resolves a site slug from BUILDS_CACHE", async () => {
    await writeKey(BUILDS_CACHE, { fetchedAt: "x", apiBase: "http://x", builds: [fakeBuild("a")] });

    expect(resolveSelectedSteps("a")).toEqual([{ instruction: "start", time: "0:00" }]);
  });

  it("resolves a local slug from LOCAL_BUILDS, not the site cache", async () => {
    const local = createLocalBuild({
      title: "Private opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: [],
      summary: "s",
      author: "a",
      steps: [{ instruction: "go", time: "0:05" }],
    });
    await writeLocalBuilds([local]);
    await writeKey(BUILDS_CACHE, { fetchedAt: "x", apiBase: "http://x", builds: [fakeBuild(local.slug)] });

    expect(resolveSelectedSteps(local.slug)).toEqual([{ instruction: "go", time: "0:05" }]);
  });

  it("falls back to the site cache for a stale local slug no longer in LOCAL_BUILDS", async () => {
    await writeKey(BUILDS_CACHE, {
      fetchedAt: "x",
      apiBase: "http://x",
      builds: [fakeBuild("local-11111111-1111-1111-1111-111111111111")],
    });

    expect(resolveSelectedSteps("local-11111111-1111-1111-1111-111111111111")).toEqual([
      { instruction: "start", time: "0:00" },
    ]);
  });
});
