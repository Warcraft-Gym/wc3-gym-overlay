/**
 * C-505: the editor schema mirrors the site's own submission rules
 * (`src/lib/builds/submission.ts` on the site) field-for-field, except the
 * minimum step count — the site requires >= 3 steps for a public
 * submission, the private editor only requires >= 1 (see spec.md).
 */
import { describe, expect, it } from "vitest";
import type { AnyBuild } from "../data/useAllBuilds";
import type { LocalBuild } from "../store/keys";
import { createEditorFormSchema, fromBuild, toLocalBuildInput, type EditorFormInput } from "./buildEditorSchema";

function validForm(overrides: Partial<EditorFormInput> = {}): EditorFormInput {
  return {
    title: "My test opener",
    race: "orc",
    vsRaces: ["human", "nightelf"],
    difficulty: "beginner",
    patch: "",
    tags: "test, opener",
    summary: "A solid, safe opening build for beginners to learn timings.",
    author: "Me",
    authorDiscord: "",
    sourceUrl: "",
    description: "",
    steps: [{ time: "0:00", supply: "5", instruction: "Peon to gold", icon: "or-peon" }],
    ...overrides,
  };
}

describe("createEditorFormSchema — field rules mirrored from the site", () => {
  const schema = createEditorFormSchema();

  it("accepts a fully valid form", () => {
    const result = schema.safeParse(validForm());
    expect(result.success).toBe(true);
  });

  it("rejects an empty form with one error per required field", () => {
    const result = schema.safeParse(validForm({ title: "", summary: "", race: "", steps: [] } as never));
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["title", "summary", "race", "steps"]));
  });

  it("title must be 6-90 characters", () => {
    expect(schema.safeParse(validForm({ title: "abc" })).success).toBe(false);
    expect(schema.safeParse(validForm({ title: "a".repeat(91) })).success).toBe(false);
    expect(schema.safeParse(validForm({ title: "abcdef" })).success).toBe(true);
  });

  it("summary must be 20-200 characters", () => {
    expect(schema.safeParse(validForm({ summary: "too short" })).success).toBe(false);
    expect(schema.safeParse(validForm({ summary: "a".repeat(201) })).success).toBe(false);
  });

  it("race must be a known enum value", () => {
    expect(schema.safeParse(validForm({ race: "" })).success).toBe(false);
    expect(schema.safeParse(validForm({ race: "martian" })).success).toBe(false);
  });

  it("difficulty must be a known enum value", () => {
    expect(schema.safeParse(validForm({ difficulty: "" })).success).toBe(false);
  });

  it("vsRaces dedupes (there are only 4 possible races, so the 4-max cap never actually rejects)", () => {
    const result = schema.safeParse(
      validForm({ vsRaces: ["human", "human", "orc", "nightelf", "undead", "human"] as never }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vsRaces).toEqual(["human", "orc", "nightelf", "undead"]);
    }
  });

  it("vsRaces may be empty (means any opponent)", () => {
    expect(schema.safeParse(validForm({ vsRaces: [] })).success).toBe(true);
  });

  it("patch is optional but capped at 16 characters", () => {
    expect(schema.safeParse(validForm({ patch: "a".repeat(17) })).success).toBe(false);
    expect(schema.safeParse(validForm({ patch: "1.36.1" })).success).toBe(true);
  });

  it("tags become lowercase and are capped at 8 (site's rule does not dedupe)", () => {
    const result = schema.safeParse(validForm({ tags: "Rush, Fast-Expand, a,b,c,d,e,f,g" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["rush", "fast-expand", "a", "b", "c", "d", "e", "f"]);
    }
  });

  it("author must be 2-60 characters", () => {
    expect(schema.safeParse(validForm({ author: "a" })).success).toBe(false);
    expect(schema.safeParse(validForm({ author: "a".repeat(61) })).success).toBe(false);
  });

  it("sourceUrl must start with http(s):// when present", () => {
    expect(schema.safeParse(validForm({ sourceUrl: "ftp://x" })).success).toBe(false);
    expect(schema.safeParse(validForm({ sourceUrl: "https://example.com" })).success).toBe(true);
    expect(schema.safeParse(validForm({ sourceUrl: "" })).success).toBe(true);
  });

  it("requires at least one step", () => {
    expect(schema.safeParse(validForm({ steps: [] })).success).toBe(false);
  });

  it("step instruction must be 2-160 characters", () => {
    expect(
      schema.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "x", icon: "" }] })).success,
    ).toBe(false);
    expect(
      schema.safeParse(
        validForm({ steps: [{ time: "", supply: "", instruction: "a".repeat(161), icon: "" }] }),
      ).success,
    ).toBe(false);
  });

  it("step time must be empty or mm:ss (max 5 chars)", () => {
    expect(
      schema.safeParse(validForm({ steps: [{ time: "9:9", supply: "", instruction: "Scout", icon: "" }] }))
        .success,
    ).toBe(false);
    expect(
      schema.safeParse(validForm({ steps: [{ time: "1:05", supply: "", instruction: "Scout", icon: "" }] }))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "Scout", icon: "" }] })).success,
    ).toBe(true);
  });

  it("step supply must be 0-100 or empty", () => {
    expect(
      schema.safeParse(validForm({ steps: [{ time: "", supply: "101", instruction: "Scout", icon: "" }] }))
        .success,
    ).toBe(false);
    expect(
      schema.safeParse(validForm({ steps: [{ time: "", supply: "100", instruction: "Scout", icon: "" }] }))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "Scout", icon: "" }] })).success,
    ).toBe(true);
  });

  it("step icon must be a known key (when a known-icon checker is supplied) or empty", () => {
    const strict = createEditorFormSchema((key) => key === "or-peon");
    expect(
      strict.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "Scout", icon: "or-peon" }] }))
        .success,
    ).toBe(true);
    expect(
      strict.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "Scout", icon: "bogus" }] }))
        .success,
    ).toBe(false);
    expect(
      strict.safeParse(validForm({ steps: [{ time: "", supply: "", instruction: "Scout", icon: "" }] })).success,
    ).toBe(true);
  });
});

describe("fromBuild / toLocalBuildInput round-trip", () => {
  const schema = createEditorFormSchema();

  it("fromBuild converts a site build into editable form values", () => {
    const build: AnyBuild = {
      slug: "human-fast-expand",
      title: "Human Fast Expand",
      race: "human",
      vsRaces: ["orc"],
      difficulty: "beginner",
      tags: ["fast-expand", "safe"],
      summary: "A safe fast expand into the mid game.",
      author: "Coach",
      featured: false,
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      steps: [{ instruction: "Train peasant", time: "0:00", supply: 5, icon: "hu-peasant" }],
      source: "site",
    };
    const form = fromBuild(build);
    expect(form.title).toBe("Human Fast Expand");
    expect(form.tags).toBe("fast-expand, safe");
    expect(form.steps).toEqual([{ time: "0:00", supply: "5", instruction: "Train peasant", icon: "hu-peasant" }]);

    const parsed = schema.parse(form);
    const input = toLocalBuildInput(parsed, "https://example.test");
    expect(input.steps[0].iconUrl).toBe("https://example.test/wc3-icons/hu-peasant.webp");
  });

  it("fromBuild round-trips a local build's optional fields", () => {
    const local: LocalBuild = {
      slug: "local-11111111-1111-1111-1111-111111111111",
      title: "My private opener",
      race: "orc",
      vsRaces: [],
      difficulty: "beginner",
      tags: ["rush"],
      summary: "A quick private opener for practice sessions.",
      author: "Me",
      authorDiscord: "me#0001",
      sourceUrl: "https://example.com/guide",
      steps: [{ instruction: "Train peon", time: "0:00", supply: 5 }],
      description: "Longer notes.",
      source: "local",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const form = fromBuild(local);
    expect(form.authorDiscord).toBe("me#0001");
    expect(form.sourceUrl).toBe("https://example.com/guide");
    expect(form.description).toBe("Longer notes.");
  });

  it("toLocalBuildInput omits an empty patch/description/icon", () => {
    const parsed = schema.parse(validForm());
    const input = toLocalBuildInput(parsed, "https://example.test");
    expect(input.patch).toBeUndefined();
    expect(input.description).toBeUndefined();
  });
});
