import { describe, expect, it } from "vitest";
import { buildsListResponseSchema } from "./schema";

const fixtureListResponse = {
  builds: [
    {
      slug: "human-fast-expand",
      title: "Human Fast Expand",
      race: "human",
      vsRace: "orc",
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
});
