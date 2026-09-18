import { describe, expect, it } from "vitest";
import { localBuildSchema } from "./keys";

function fullLocalBuild(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: "local-11111111-1111-1111-1111-111111111111",
    title: "My private opener",
    race: "orc",
    vsRaces: ["human"],
    difficulty: "beginner",
    patch: "2.0.4",
    tags: ["rush"],
    summary: "A quick private opener.",
    author: "Me",
    steps: [{ time: "0:00", supply: 5, instruction: "Train peon" }],
    description: "Longer private notes.",
    source: "local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("localBuildSchema", () => {
  it("accepts a full build", () => {
    const result = localBuildSchema.safeParse(fullLocalBuild());
    expect(result.success).toBe(true);
  });

  it("rejects a missing title", () => {
    const broken: Record<string, unknown> = fullLocalBuild();
    delete broken.title;
    const result = localBuildSchema.safeParse(broken);
    expect(result.success).toBe(false);
  });

  it("rejects zero steps", () => {
    const result = localBuildSchema.safeParse(fullLocalBuild({ steps: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a slug that isn't the local-<uuid> shape", () => {
    const result = localBuildSchema.safeParse(fullLocalBuild({ slug: "human-fast-expand" }));
    expect(result.success).toBe(false);
  });

  it("defaults vsRaces to [] when absent", () => {
    const raw: Record<string, unknown> = fullLocalBuild();
    delete raw.vsRaces;
    const result = localBuildSchema.safeParse(raw);
    expect(result.success).toBe(true);
    expect(result.success && result.data.vsRaces).toEqual([]);
  });
});
