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

  it(
    "parses w3c_6aae9d48d867fad24f911778_last_refuge.w3g (3.0, W3Champions match import fixture, F004)",
    async () => {
      const summary = await parseReplay(loadFixture("w3c_6aae9d48d867fad24f911778_last_refuge.w3g"));
      expect(summary.version).toBe("3.00");
      expect(summary.map.file).toContain("LastRefuge");
      expect(summary.durationMs).toBeGreaterThanOrEqual(782_000 - 2_000);
      expect(summary.durationMs).toBeLessThanOrEqual(782_000 + 2_000);
      expect(summary.players).toHaveLength(2);

      const dretwiak = summary.players.find((p) => p.name === "Dretwiak#2963");
      const soulkeeper = summary.players.find((p) => p.name === "SoulKeeper#1844");
      expect(dretwiak).toBeDefined();
      expect(soulkeeper).toBeDefined();
      expect(dretwiak?.raceDetected).toBe("human");
      expect(soulkeeper?.raceDetected).toBe("undead");
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

  describe("F001 — cancel events (C-701)", () => {
    function cancelsFor(summary: Awaited<ReturnType<typeof parseReplay>>, playerName: string) {
      const player = summary.players.find((p) => p.name === playerName);
      expect(player, `expected a player named ${playerName}`).toBeDefined();
      return (summary.events[player!.id] ?? []).filter((e) => e.kind === "cancel");
    }

    it(
      "Turtle Rock: lolicore#21233 cancelled hpea (slot 4) around 10.9s; Promario#11149 has none",
      async () => {
        const summary = await parseReplay(loadFixture("w3c_6aaef330d867fad24f91360c_turtle_rock.w3g"));
        const lolicoreCancels = cancelsFor(summary, "lolicore#21233");
        expect(lolicoreCancels).toHaveLength(1);
        expect(lolicoreCancels[0]).toMatchObject({ kind: "cancel", id: "hpea", slot: 4 });
        expect(lolicoreCancels[0]!.ms).toBeGreaterThanOrEqual(10_500);
        expect(lolicoreCancels[0]!.ms).toBeLessThanOrEqual(11_500);

        expect(cancelsFor(summary, "Promario#11149")).toHaveLength(0);
      },
      FIXTURE_TIMEOUT_MS,
    );

    it(
      "Hammerfall: Starglobal#4361 cancelled opeo around 92s; shiNe#1396 has none",
      async () => {
        const summary = await parseReplay(loadFixture("w3c_6aaef31bd867fad24f913602_hammerfall.w3g"));
        const starglobalCancels = cancelsFor(summary, "Starglobal#4361");
        expect(starglobalCancels).toHaveLength(1);
        expect(starglobalCancels[0]).toMatchObject({ kind: "cancel", id: "opeo" });
        expect(starglobalCancels[0]!.ms).toBeGreaterThanOrEqual(91_000);
        expect(starglobalCancels[0]!.ms).toBeLessThanOrEqual(93_000);

        expect(cancelsFor(summary, "shiNe#1396")).toHaveLength(0);
      },
      FIXTURE_TIMEOUT_MS,
    );

    it(
      // The feature spec's "verified facts" undercount this fixture's real
      // cancels (see the F001 handoff's "Train-time verification" /
      // "Issues discovered" — ground truth has a 2nd Dkblitz cancel (uobs
      // @ ~8:05) and one Sonik cancel (esen @ ~8:34) neither the spec nor
      // C-701's literal wording mention). C-701 only asserts *this*
      // cancel exists in this window, not that it's the player's only one,
      // so this test sticks to that literal assertion.
      "Autumn Leaves: Dkblitz#11988 cancelled ugho around 258s",
      async () => {
        const summary = await parseReplay(loadFixture("w3c_6aaef285d867fad24f9135d5_autumn_leaves.w3g"));
        const dkblitzCancels = cancelsFor(summary, "Dkblitz#11988");
        const ughoCancel = dkblitzCancels.find((e) => e.id === "ugho");
        expect(ughoCancel).toMatchObject({ kind: "cancel", id: "ugho" });
        expect(ughoCancel!.ms).toBeGreaterThanOrEqual(257_000);
        expect(ughoCancel!.ms).toBeLessThanOrEqual(259_000);
      },
      FIXTURE_TIMEOUT_MS,
    );

    it(
      "the four pre-F001 fixtures still parse with no cancel expectations",
      async () => {
        for (const name of [
          "ced_vs_lyn.w3g",
          "phoenix_vs_changer_concealed_hill.w3g",
          "fortitude_vs_focus_northern_isles.w3g",
          "w3c_6aae9d48d867fad24f911778_last_refuge.w3g",
        ]) {
          const summary = await parseReplay(loadFixture(name));
          expect(summary.players.length).toBeGreaterThan(0);
        }
      },
      FIXTURE_TIMEOUT_MS * 4,
    );
  });
});
