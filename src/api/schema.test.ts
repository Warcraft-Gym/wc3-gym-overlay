import { describe, expect, it } from "vitest";
import { buildsListResponseSchema } from "./schema";
import liveFixture from "./__fixtures__/builds.live.json";

const fixtureListResponse = {
  builds: [
    {
      slug: "human-fast-expand",
      title: "Human Fast Expand",
      race: "human",
      vsRaces: ["orc"],
      difficulty: "beginner",
      tags: ["fast-expand"],
      summary: "A safe fast expand into the mid game.",
      author: "coach",
      featured: true,
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      steps: [
        { time: "0:00", supply: 5, instruction: "Train peasant" },
        { instruction: "Scout when able" },
      ],
    },
  ],
};

describe("apiBuildListItemSchema (via buildsListResponseSchema)", () => {
  it("accepts a fixture list response", () => {
    const result = buildsListResponseSchema.safeParse(fixtureListResponse);
    expect(result.success).toBe(true);
  });

  it("rejects a build without a slug", () => {
    const broken = {
      builds: [
        {
          ...fixtureListResponse.builds[0],
          slug: undefined,
        },
      ],
    };
    const result = buildsListResponseSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("accepts null for patch/authorDiscord/maintainer/sourceUrl (the live API's shape for an unset optional field)", () => {
    const withNulls = {
      builds: [
        {
          ...fixtureListResponse.builds[0],
          patch: null,
          authorDiscord: null,
          maintainer: null,
          sourceUrl: null,
        },
      ],
    };
    const result = buildsListResponseSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
  });

  it("defaults vsRaces to [] when the key is absent", () => {
    const withoutVsRaces: Record<string, unknown> = { ...fixtureListResponse.builds[0] };
    delete withoutVsRaces.vsRaces;
    const result = buildsListResponseSchema.safeParse({ builds: [withoutVsRaces] });
    expect(result.success).toBe(true);
    expect(result.success && result.data.builds[0].vsRaces).toEqual([]);
  });

  it("accepts a build listing several opponent races", () => {
    const result = buildsListResponseSchema.safeParse({
      builds: [{ ...fixtureListResponse.builds[0], vsRaces: ["orc", "undead"] }],
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.builds[0].vsRaces).toEqual(["orc", "undead"]);
  });

  it("tolerates a legacy vsRace key alongside/instead of vsRaces (F005, site migration)", () => {
    const rest: Record<string, unknown> = { ...fixtureListResponse.builds[0] };
    delete rest.vsRaces;
    const legacy = { ...rest, vsRace: "orc" };
    const result = buildsListResponseSchema.safeParse({ builds: [legacy] });
    expect(result.success).toBe(true);
    // Unknown keys are stripped, not merged — `vsRaces` falls back to its
    // default. Cache migration (store/keys.ts) is what actually recovers
    // the opponent from a legacy `vsRace`.
    expect(result.success && result.data.builds[0].vsRaces).toEqual([]);
    expect(result.success && "vsRace" in result.data.builds[0]).toBe(false);
  });

  it("parses the live fixture captured from /api/builds, with every item having an array vsRaces", () => {
    const result = buildsListResponseSchema.safeParse(liveFixture);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.builds.length).toBeGreaterThan(0);
    for (const item of result.data.builds) {
      expect(Array.isArray(item.vsRaces)).toBe(true);
    }
    expect(result.data.builds.some((b) => b.vsRaces.length === 0)).toBe(true);
    expect(result.data.builds.some((b) => b.vsRaces.length >= 2)).toBe(true);
  });
});
