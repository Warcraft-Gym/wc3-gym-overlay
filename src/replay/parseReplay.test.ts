import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReplay } from "./parseReplay";
import { ReplayParseError } from "./types";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

describe("parseReplay", () => {
  // Each of these parses a real ~100-300KB replay with w3gjs — fast alone,
  // but the whole suite runs its test files concurrently, so a generous
  // explicit timeout avoids flaking under load (see idMap.test.ts).
  const FIXTURE_TIMEOUT_MS = 15_000;

  it(
    "parses ced_vs_lyn.w3g (1.32)",
    async () => {
      const summary = await parseReplay(loadFixture("ced_vs_lyn.w3g"));
      expect(summary.version).toMatch(/^1\.32/);
      expect(summary.durationMs).toBeGreaterThan(60_000);
      expect(summary.players).toHaveLength(2);
      for (const p of summary.players) {
        expect(["human", "orc", "nightelf", "undead"]).toContain(p.raceDetected);
        expect(p.isObserver).toBe(false);
      }
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    "parses phoenix_vs_changer_concealed_hill.w3g (2.0)",
    async () => {
      const summary = await parseReplay(loadFixture("phoenix_vs_changer_concealed_hill.w3g"));
      expect(summary.version).toMatch(/^2\.0/);
      expect(summary.durationMs).toBeGreaterThan(60_000);
      expect(summary.players).toHaveLength(2);
      for (const p of summary.players) {
        expect(["human", "orc", "nightelf", "undead"]).toContain(p.raceDetected);
      }
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    "parses fortitude_vs_focus_northern_isles.w3g (3.0) and matches the known fixture facts",
    async () => {
      const summary = await parseReplay(loadFixture("fortitude_vs_focus_northern_isles.w3g"));
      expect(summary.version).toBe("3.00");
      expect(summary.durationMs).toBeGreaterThan(60_000);
      expect(summary.durationMs).toBeGreaterThanOrEqual(823_000 - 2_000);
      expect(summary.durationMs).toBeLessThanOrEqual(823_000 + 2_000);
      expect(summary.map.file).toContain("NorthernIsles");
      expect(summary.map.name).toBe("Northern Isles");
      expect(summary.players).toHaveLength(2);

      const noname = summary.players.find((p) => p.name === "noname#114787");
      const focus = summary.players.find((p) => p.name === "FoCuS#31324");
      expect(noname).toBeDefined();
      expect(focus).toBeDefined();
      expect(noname?.raceDetected).toBe("human");
      expect(focus?.raceDetected).toBe("orc");
    },
    FIXTURE_TIMEOUT_MS,
  );

  it("rejects random bytes as not_a_replay", async () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) % 256;
    await expect(parseReplay(bytes)).rejects.toMatchObject({
      code: "not_a_replay",
    });
    await expect(parseReplay(bytes)).rejects.toBeInstanceOf(ReplayParseError);
  });

  it("rejects a truncated fixture as corrupt", async () => {
    const full = loadFixture("fortitude_vs_focus_northern_isles.w3g");
    const truncated = full.slice(0, 4096);
    await expect(parseReplay(truncated)).rejects.toMatchObject({ code: "corrupt" });
  });
});
