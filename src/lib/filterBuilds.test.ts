import { describe, expect, it } from "vitest";
import { filterBuilds } from "./filterBuilds";
import type { ApiBuildListItem } from "../api/schema";

function build(overrides: Partial<ApiBuildListItem>): ApiBuildListItem {
  return {
    slug: "slug",
    title: "Title",
    race: "human",
    vsRace: "any",
    difficulty: "beginner",
    tags: [],
    summary: "Summary",
    author: "Author",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    steps: [],
    ...overrides,
  };
}

const builds: ApiBuildListItem[] = [
  build({ slug: "human-vs-orc", race: "human", vsRace: "orc", title: "Human Fast Expand", summary: "Safe opener", author: "Coach A", tags: ["fast-expand"] }),
  build({ slug: "human-vs-any", race: "human", vsRace: "any", title: "Human Rifle Push", summary: "Aggressive rifles", author: "Coach B", tags: ["rifle"] }),
  build({ slug: "orc-vs-human", race: "orc", vsRace: "human", title: "Orc Grunt Rush", summary: "Early pressure", author: "Coach C", tags: ["rush"] }),
  build({ slug: "undead-vs-nightelf", race: "undead", vsRace: "nightelf", title: "Ghoul Pull", summary: "Fast tech into fiends", author: "Coach A", tags: [] }),
];

describe("filterBuilds", () => {
  it("returns every build when no filter is given", () => {
    expect(filterBuilds(builds, {})).toHaveLength(4);
  });

  it("filters by race", () => {
    const result = filterBuilds(builds, { race: "human" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-orc", "human-vs-any"]);
  });

  it("matches vsRace builds for that opponent or any", () => {
    const result = filterBuilds(builds, { vsRace: "orc" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-orc", "human-vs-any"]);
  });

  it("treats an explicit vsRace filter of 'any' as no filter", () => {
    expect(filterBuilds(builds, { vsRace: "any" })).toHaveLength(4);
  });

  it("searches title, summary, author and tags, case-insensitively", () => {
    expect(filterBuilds(builds, { q: "RIFLE" }).map((b) => b.slug)).toEqual(["human-vs-any"]);
    expect(filterBuilds(builds, { q: "coach a" }).map((b) => b.slug)).toEqual(["human-vs-orc", "undead-vs-nightelf"]);
    expect(filterBuilds(builds, { q: "fast-expand" }).map((b) => b.slug)).toEqual(["human-vs-orc"]);
  });

  it("combines race, vsRace and search filters", () => {
    const result = filterBuilds(builds, { race: "human", vsRace: "any", q: "push" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-any"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterBuilds(builds, { q: "nonexistent" })).toEqual([]);
  });
});
