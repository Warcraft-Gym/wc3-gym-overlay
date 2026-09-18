import { describe, expect, it } from "vitest";
import { createLocalBuild } from "./localBuilds";
import {
  EXPORT_FORMAT_MULTI,
  EXPORT_FORMAT_SINGLE,
  EXPORT_VERSION,
  exportAll,
  exportBuild,
  fingerprint,
  importBuilds,
  parseImport,
  slugifyForFilename,
  type ExportedBuild,
} from "./buildExchange";
import type { LocalBuildInput } from "./localBuilds";

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

function exportedBuild(overrides: Partial<ExportedBuild> = {}): ExportedBuild {
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

describe("exportBuild / exportAll", () => {
  it("wraps a single build with format/version and drops slug/timestamps/authorDiscord/sourceUrl", () => {
    const build = createLocalBuild(localInput({ authorDiscord: "me#0001", sourceUrl: "https://x" }));
    const file = exportBuild(build);

    expect(file.format).toBe(EXPORT_FORMAT_SINGLE);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.build).toEqual({
      title: "My private opener",
      race: "orc",
      vsRaces: ["human"],
      difficulty: "beginner",
      patch: undefined,
      tags: ["rush"],
      summary: "A quick private opener.",
      author: "Me",
      steps: [{ time: "0:00", supply: 5, instruction: "Train peon", icon: undefined }],
      description: undefined,
    });
    expect(file.build).not.toHaveProperty("slug");
    expect(file.build).not.toHaveProperty("createdAt");
    expect(file.build).not.toHaveProperty("authorDiscord");
    expect(file.build).not.toHaveProperty("sourceUrl");
  });

  it("wraps a list of builds under the multi format", () => {
    const builds = [createLocalBuild(localInput({ title: "A" })), createLocalBuild(localInput({ title: "B" }))];
    const file = exportAll(builds);

    expect(file.format).toBe(EXPORT_FORMAT_MULTI);
    expect(file.builds.map((b) => b.title)).toEqual(["A", "B"]);
  });
});

describe("parseImport", () => {
  it("round-trips a single-format export", () => {
    const build = createLocalBuild(localInput());
    const json = JSON.stringify(exportBuild(build));

    const { builds, errors } = parseImport(json);

    expect(errors).toEqual([]);
    expect(builds).toHaveLength(1);
    expect(builds[0].title).toBe(build.title);
    expect(builds[0].steps).toEqual(build.steps.map((s) => ({ ...s, icon: s.icon })));
  });

  it("round-trips a multi-format export", () => {
    const builds = [createLocalBuild(localInput({ title: "A" })), createLocalBuild(localInput({ title: "B" }))];
    const json = JSON.stringify(exportAll(builds));

    const result = parseImport(json);

    expect(result.errors).toEqual([]);
    expect(result.builds.map((b) => b.title)).toEqual(["A", "B"]);
  });

  it("tolerates a missing format by trying the bare build shape", () => {
    const bare = exportedBuild({ title: "No wrapper" });
    const result = parseImport(JSON.stringify(bare));

    expect(result.errors).toEqual([]);
    expect(result.builds).toEqual([bare]);
  });

  it("returns errors for malformed JSON, without throwing", () => {
    const result = parseImport("{not valid json");

    expect(result.builds).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns errors for a well-formed but invalid build", () => {
    const result = parseImport(JSON.stringify({ format: EXPORT_FORMAT_SINGLE, version: 1, build: { title: "" } }));

    expect(result.builds).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("fingerprint", () => {
  it("is stable for the same title and steps", async () => {
    const a = await fingerprint(exportedBuild());
    const b = await fingerprint(exportedBuild());
    expect(a).toBe(b);
  });

  it("changes when the title changes", async () => {
    const a = await fingerprint(exportedBuild());
    const b = await fingerprint(exportedBuild({ title: "Different title" }));
    expect(a).not.toBe(b);
  });

  it("changes when a step's instruction changes", async () => {
    const a = await fingerprint(exportedBuild());
    const b = await fingerprint(
      exportedBuild({ steps: [{ time: "0:00", supply: 5, instruction: "Train something else" }] }),
    );
    expect(a).not.toBe(b);
  });

  it("ignores fields outside title/steps (patch, tags, summary, author)", async () => {
    const a = await fingerprint(exportedBuild());
    const b = await fingerprint(exportedBuild({ patch: "2.1", tags: ["other"], author: "Someone else" }));
    expect(a).toBe(b);
  });
});

describe("importBuilds", () => {
  it("adds a new build and mints a fresh local slug", async () => {
    const { next, added, skipped } = await importBuilds([], [exportedBuild()]);

    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(next).toHaveLength(1);
    expect(next[0].slug).toMatch(/^local-/);
    expect(next[0].title).toBe("My private opener");
  });

  it("skips a build whose fingerprint already exists locally", async () => {
    const existing = createLocalBuild(localInput());

    const { next, added, skipped } = await importBuilds([existing], [exportedBuild()]);

    expect(added).toBe(0);
    expect(skipped).toBe(1);
    expect(next).toEqual([existing]);
  });

  it("imports a build with a changed title as new, even with the same steps", async () => {
    const existing = createLocalBuild(localInput());

    const { next, added, skipped } = await importBuilds([existing], [exportedBuild({ title: "Renamed opener" })]);

    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(next).toHaveLength(2);
  });

  it("does not mutate the existing list", async () => {
    const existing = [createLocalBuild(localInput())];
    const existingCopy = [...existing];

    await importBuilds(existing, [exportedBuild({ title: "New one" })]);

    expect(existing).toEqual(existingCopy);
  });

  it("de-duplicates two identical builds within the same incoming batch", async () => {
    const { next, added, skipped } = await importBuilds([], [exportedBuild(), exportedBuild()]);

    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(next).toHaveLength(1);
  });
});

describe("slugifyForFilename", () => {
  it("lowercases and hyphenates a title", () => {
    expect(slugifyForFilename("My Test Opener!")).toBe("my-test-opener");
  });

  it("falls back to a default for a title with no alphanumerics", () => {
    expect(slugifyForFilename("!!!")).toBe("private-build");
  });
});
