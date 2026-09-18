import { describe, expect, it } from "vitest";
import { filterBuilds, sortBuilds } from "./filterBuilds";
import type { ApiBuildListItem } from "../api/schema";
import type { AnyBuild } from "../data/useAllBuilds";

function build(overrides: Partial<ApiBuildListItem>): ApiBuildListItem {
  return {
    slug: "slug",
    title: "Title",
    race: "human",
    vsRaces: [],
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
  build({ slug: "human-vs-orc", race: "human", vsRaces: ["orc"], title: "Human Fast Expand", summary: "Safe opener", author: "Coach A", tags: ["fast-expand"] }),
  build({ slug: "human-vs-any", race: "human", vsRaces: [], title: "Human Rifle Push", summary: "Aggressive rifles", author: "Coach B", tags: ["rifle"] }),
  build({ slug: "orc-vs-human", race: "orc", vsRaces: ["human"], title: "Orc Grunt Rush", summary: "Early pressure", author: "Coach C", tags: ["rush"] }),
  build({ slug: "undead-vs-nightelf-or-human", race: "undead", vsRaces: ["nightelf", "human"], title: "Ghoul Pull", summary: "Fast tech into fiends", author: "Coach A", tags: [] }),
];

describe("filterBuilds", () => {
  it("returns every build when no filter is given", () => {
    expect(filterBuilds(builds, {})).toHaveLength(4);
  });

  it("filters by race", () => {
    const result = filterBuilds(builds, { race: "human" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-orc", "human-vs-any"]);
  });

  it("matches vsRace builds that include that opponent, or have no restriction", () => {
    const result = filterBuilds(builds, { vsRace: "orc" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-orc", "human-vs-any"]);
  });

  it("matches a multi-race build when the filter is one of its races", () => {
    const result = filterBuilds(builds, { vsRace: "human" });
    expect(result.map((b) => b.slug)).toEqual([
      "human-vs-any",
      "orc-vs-human",
      "undead-vs-nightelf-or-human",
    ]);
  });

  it("treats an explicit vsRace filter of 'any' as no filter", () => {
    expect(filterBuilds(builds, { vsRace: "any" })).toHaveLength(4);
  });

  it("treats a build with empty vsRaces as matching every opponent filter", () => {
    const anyBuild = build({ slug: "any-only", vsRaces: [] });
    expect(filterBuilds([anyBuild], { vsRace: "undead" })).toEqual([anyBuild]);
  });

  it("searches title, summary, author and tags, case-insensitively", () => {
    expect(filterBuilds(builds, { q: "RIFLE" }).map((b) => b.slug)).toEqual(["human-vs-any"]);
    expect(filterBuilds(builds, { q: "coach a" }).map((b) => b.slug)).toEqual(["human-vs-orc", "undead-vs-nightelf-or-human"]);
    expect(filterBuilds(builds, { q: "fast-expand" }).map((b) => b.slug)).toEqual(["human-vs-orc"]);
  });

  it("combines race, vsRace and search filters", () => {
    const result = filterBuilds(builds, { race: "human", vsRace: "any", q: "push" });
    expect(result.map((b) => b.slug)).toEqual(["human-vs-any"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterBuilds(builds, { q: "nonexistent" })).toEqual([]);
  });

  it("filters by difficulty", () => {
    const mixed = [
      build({ slug: "beg", difficulty: "beginner" }),
      build({ slug: "int", difficulty: "intermediate" }),
      build({ slug: "adv", difficulty: "advanced" }),
    ];
    expect(filterBuilds(mixed, { difficulty: "intermediate" }).map((b) => b.slug)).toEqual(["int"]);
  });

  it("treats an unstamped build as 'site' for the source filter", () => {
    expect(filterBuilds(builds, { source: "site" })).toHaveLength(4);
    expect(filterBuilds(builds, { source: "local" })).toHaveLength(0);
    expect(filterBuilds(builds, { source: "all" })).toHaveLength(4);
  });

  it("filters a merged AnyBuild[] list by source", () => {
    const mixed: AnyBuild[] = [
      { ...build({ slug: "site-a" }), source: "site" },
      {
        slug: "local-11111111-1111-1111-1111-111111111111",
        title: "Private",
        race: "human",
        vsRaces: [],
        difficulty: "beginner",
        tags: [],
        summary: "s",
        author: "a",
        steps: [{ instruction: "go" }],
        source: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(filterBuilds(mixed, { source: "local" }).map((b) => b.slug)).toEqual([
      "local-11111111-1111-1111-1111-111111111111",
    ]);
    expect(filterBuilds(mixed, { source: "site" }).map((b) => b.slug)).toEqual(["site-a"]);
    expect(filterBuilds(mixed, { source: "all" })).toHaveLength(2);
  });
});

describe("sortBuilds", () => {
  const unsorted: ApiBuildListItem[] = [
    build({ slug: "b", title: "Banana build", updatedAt: "2026-01-05T00:00:00.000Z" }),
    build({ slug: "a", title: "Apple build", updatedAt: "2026-01-10T00:00:00.000Z" }),
    build({ slug: "c", title: "Carrot build", updatedAt: "2026-01-01T00:00:00.000Z" }),
  ];

  it("sorts by most recently updated first", () => {
    expect(sortBuilds(unsorted, "updated").map((b) => b.slug)).toEqual(["a", "b", "c"]);
  });

  it("sorts by title A-Z", () => {
    expect(sortBuilds(unsorted, "title").map((b) => b.slug)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...unsorted];
    sortBuilds(unsorted, "title");
    expect(unsorted).toEqual(copy);
  });
});
