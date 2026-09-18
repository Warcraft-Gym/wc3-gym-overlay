import { describe, expect, it } from "vitest";
import type { ApiBuildListItem } from "../api/schema";
import type { LocalBuild } from "../store/keys";
import {
  createLocalBuild,
  deleteLocalBuild,
  duplicateAsLocal,
  isLocalSlug,
  updateLocalBuild,
  type LocalBuildInput,
} from "./localBuilds";

function localInput(overrides: Partial<LocalBuildInput> = {}): LocalBuildInput {
  return {
    title: "My private opener",
    race: "orc",
    vsRaces: ["human"],
    difficulty: "beginner",
    tags: ["rush"],
    summary: "A quick private opener.",
    author: "Me",
    steps: [{ time: "0:00", supply: 5, instruction: "Train peon" }],
    ...overrides,
  };
}

function siteBuild(overrides: Partial<ApiBuildListItem> = {}): ApiBuildListItem {
  return {
    slug: "human-fast-expand",
    title: "Human Fast Expand",
    race: "human",
    vsRaces: ["orc"],
    difficulty: "beginner",
    tags: ["fast-expand"],
    summary: "A safe fast expand.",
    author: "Coach",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    steps: [{ instruction: "Train peasant", time: "0:00", iconUrl: "https://x/icon.webp" }],
    ...overrides,
  };
}

describe("isLocalSlug", () => {
  it("recognizes a local-<uuid> slug", () => {
    expect(isLocalSlug("local-11111111-1111-1111-1111-111111111111")).toBe(true);
  });

  it("rejects a site slug", () => {
    expect(isLocalSlug("human-fast-expand")).toBe(false);
  });
});

describe("createLocalBuild", () => {
  it("mints a local-<uuid> slug and matching timestamps", () => {
    const build = createLocalBuild(localInput());
    expect(isLocalSlug(build.slug)).toBe(true);
    expect(build.source).toBe("local");
    expect(build.createdAt).toBe(build.updatedAt);
    expect(new Date(build.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("mints distinct slugs for two builds", () => {
    const a = createLocalBuild(localInput());
    const b = createLocalBuild(localInput());
    expect(a.slug).not.toBe(b.slug);
  });
});

describe("updateLocalBuild", () => {
  it("is immutable and bumps updatedAt on the matched build only", async () => {
    const a = createLocalBuild(localInput({ title: "A" }));
    const b = createLocalBuild(localInput({ title: "B" }));
    const list = [a, b];

    await new Promise((resolve) => setTimeout(resolve, 2));
    const next = updateLocalBuild(list, a.slug, { title: "A v2" });

    expect(next).not.toBe(list);
    expect(list[0].title).toBe("A"); // original untouched
    expect(next.find((build) => build.slug === a.slug)?.title).toBe("A v2");
    expect(next.find((build) => build.slug === a.slug)?.updatedAt).not.toBe(a.updatedAt);
    expect(next.find((build) => build.slug === b.slug)).toEqual(b);
  });

  it("returns the list unchanged in content when the slug isn't found", () => {
    const a = createLocalBuild(localInput());
    const next = updateLocalBuild([a], "local-missing", { title: "nope" });
    expect(next).toEqual([a]);
  });
});

describe("deleteLocalBuild", () => {
  it("removes the matching build and leaves the rest", () => {
    const a = createLocalBuild(localInput({ title: "A" }));
    const b = createLocalBuild(localInput({ title: "B" }));
    const next = deleteLocalBuild([a, b], a.slug);
    expect(next).toEqual([b]);
  });
});

describe("duplicateAsLocal", () => {
  it("copies a site build, keeps steps, and sets source:local + '(copy)' title", () => {
    const site = siteBuild();
    const copy = duplicateAsLocal(site);

    expect(isLocalSlug(copy.slug)).toBe(true);
    expect(copy.slug).not.toBe(site.slug);
    expect(copy.title).toBe("Human Fast Expand (copy)");
    expect(copy.source).toBe("local");
    expect(copy.steps).toEqual(site.steps);
    expect(copy.steps).not.toBe(site.steps);
  });

  it("copies a local build too", () => {
    const original = createLocalBuild(localInput({ title: "Original" }));
    const copy = duplicateAsLocal(original);
    expect(copy.title).toBe("Original (copy)");
    expect(copy.slug).not.toBe(original.slug);
  });

  it("does not mutate the source build", () => {
    const site = siteBuild();
    const beforeSteps = site.steps;
    duplicateAsLocal(site);
    expect(site.steps).toBe(beforeSteps);
  });

  it("carries description across from a local source but leaves it undefined for a site source", () => {
    const local: LocalBuild = { ...createLocalBuild(localInput()), description: "notes" };
    const copyFromLocal = duplicateAsLocal(local);
    expect(copyFromLocal.description).toBe("notes");

    const copyFromSite = duplicateAsLocal(siteBuild());
    expect(copyFromSite.description).toBeUndefined();
  });
});
