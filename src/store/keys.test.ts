import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS } from "../config";
import { localBuildSchema, settingsSchema } from "./keys";

/** F002: shape written by every 0.3.x settings save — no `autoUpdate` or
 *  `skippedVersion` key at all, since neither existed yet. */
const RAW_0_3_X_SETTINGS = {
  apiBase: "https://wc3-gnl-website.vercel.app",
  opacity: 1,
  scale: 1,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

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

describe("settingsSchema — F002 autoUpdate/skippedVersion migration", () => {
  it("defaults autoUpdate to true and skippedVersion to null for 0.3.x settings missing both keys", () => {
    const result = settingsSchema.safeParse(RAW_0_3_X_SETTINGS);
    expect(result.success).toBe(true);
    expect(result.success && result.data.autoUpdate).toBe(true);
    expect(result.success && result.data.skippedVersion).toBeNull();
  });

  it("keeps an explicit autoUpdate/skippedVersion the user already set", () => {
    const result = settingsSchema.safeParse({
      ...RAW_0_3_X_SETTINGS,
      autoUpdate: false,
      skippedVersion: "0.4.1",
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.autoUpdate).toBe(false);
    expect(result.success && result.data.skippedVersion).toBe("0.4.1");
  });
});
