import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReplay } from "./parseReplay";
import { extractBuild } from "./extractBuild";
import { editorFormSchema } from "../lib/buildEditorSchema";
import type { ReplayEvent, ReplaySummary } from "./types";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

function clockToMs(clock: string): number {
  const [minutes, seconds] = clock.split(":").map(Number);
  return (minutes * 60 + seconds) * 1000;
}

describe("extractBuild", () => {
  let summary: ReplaySummary;
  let focusId: number;
  let humanId: number;

  // Parsing is fast alone but the whole suite runs its test files
  // concurrently — see idMap.test.ts / parseReplay.test.ts for the same
  // generous explicit timeout to avoid flaking under load.
  beforeAll(async () => {
    summary = await parseReplay(loadFixture("fortitude_vs_focus_northern_isles.w3g"));
    focusId = summary.players.find((p) => p.name === "FoCuS#31324")!.id;
    humanId = summary.players.find((p) => p.name === "noname#114787")!.id;
  }, 15_000);

  it("produces steps sorted by time with valid shape, and non-decreasing supply from 5", () => {
    const draft = extractBuild(summary, focusId);
    expect(draft.steps.length).toBeGreaterThan(0);

    let lastMs = -1;
    let lastSupply = -1;
    for (const step of draft.steps) {
      expect(step.time).toMatch(/^\d{1,2}:\d{2}$/);
      const supply = Number(step.supply);
      expect(Number.isInteger(supply)).toBe(true);
      expect(supply).toBeGreaterThanOrEqual(5);
      expect(step.instruction.length).toBeGreaterThanOrEqual(2);
      expect(step.instruction.length).toBeLessThanOrEqual(160);

      const ms = clockToMs(step.time);
      expect(ms).toBeGreaterThanOrEqual(lastMs);
      lastMs = ms;
      expect(supply).toBeGreaterThanOrEqual(lastSupply);
      lastSupply = supply;
    }
    expect(Number(draft.steps[0]!.supply)).toBe(5);
  });

  it("contains the known build sequence in order for FoCuS (orc)", () => {
    const draft = extractBuild(summary, focusId);
    const instructions = draft.steps.map((s) => s.instruction);
    const expectedInOrder = ["Build Altar of Storms", "Build Orc Burrow", "Build Barracks", "Build War Mill", "Train Grunt"];

    let searchFrom = 0;
    for (const expected of expectedInOrder) {
      const idx = instructions.indexOf(expected, searchFrom);
      expect(idx, `expected to find "${expected}" after index ${searchFrom}`).toBeGreaterThanOrEqual(searchFrom);
      searchFrom = idx + 1;
    }

    const altarStep = draft.steps.find((s) => s.instruction === "Build Altar of Storms")!;
    expect(altarStep.time).toBe("0:03");
    const burrowStep = draft.steps.find((s) => s.instruction === "Build Orc Burrow")!;
    expect(burrowStep.time).toBe("0:10");
    const barracksStep = draft.steps.find((s) => s.instruction === "Build Barracks")!;
    expect(barracksStep.time).toBe("0:35");
    const warMillStep = draft.steps.find((s) => s.instruction === "Build War Mill")!;
    expect(warMillStep.time).toBe("1:06");
    const gruntStep = draft.steps.find((s) => s.instruction === "Train Grunt")!;
    expect(gruntStep.time).toBe("1:35");
  });

  it("has exactly one Far Seer hero step, timed between 00:03 and 02:03", () => {
    const draft = extractBuild(summary, focusId);
    const heroSteps = draft.steps.filter((s) => s.instruction === "Hero: Far Seer");
    expect(heroSteps).toHaveLength(1);
    const ms = clockToMs(heroSteps[0]!.time);
    expect(ms).toBeGreaterThan(3_000);
    expect(ms).toBeLessThan(123_000);
  });

  it("collapses a building re-issued within 2s into a single step (human Altar of Kings)", () => {
    const draft = extractBuild(summary, humanId);
    const altarSteps = draft.steps.filter((s) => s.instruction === "Build Altar of Kings");
    expect(altarSteps).toHaveLength(1);
    expect(altarSteps[0]!.time).toBe("0:03");
  });

  it("merges consecutive identical unit orders within 10s (orc 2x Peon at 00:01)", () => {
    const draft = extractBuild(summary, focusId);
    const peonStep = draft.steps.find((s) => s.time === "0:01");
    expect(peonStep?.instruction).toBe("Train 2× Peon");
  });

  it("respects cutoffMs, includeUpgrades and includeItems", () => {
    const withUpgrades = extractBuild(summary, focusId, { includeUpgrades: true });
    expect(withUpgrades.steps.some((s) => s.instruction.startsWith("Research"))).toBe(true);

    const cutoff = extractBuild(summary, focusId, { cutoffMs: 120_000, includeUpgrades: false });
    for (const step of cutoff.steps) {
      expect(clockToMs(step.time)).toBeLessThanOrEqual(120_000);
      expect(step.instruction.startsWith("Research")).toBe(false);
    }

    const defaultResult = extractBuild(summary, focusId);
    const withItems = extractBuild(summary, focusId, { includeItems: true });
    const nonBuySteps = withItems.steps.filter((s) => !s.instruction.startsWith("Buy "));
    expect(nonBuySteps).toEqual(defaultResult.steps);
    const buySteps = withItems.steps.filter((s) => s.instruction.startsWith("Buy "));
    expect(buySteps.length).toBeGreaterThanOrEqual(1);
  });

  it("validates against the private-build editor schema", () => {
    const draft = extractBuild(summary, focusId);
    const result = editorFormSchema.safeParse(draft);
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues)).toBe(true);
  });

  it("clamps title/summary/instruction lengths to the editor schema limits", () => {
    const draft = extractBuild(summary, focusId);
    expect(draft.title.length).toBeLessThanOrEqual(90);
    expect(draft.summary.length).toBeLessThanOrEqual(200);
    for (const step of draft.steps) expect(step.instruction.length).toBeLessThanOrEqual(160);
  });
});

/** F001 follow-up-2: a steady stream of same-id unit orders must not merge
 *  without bound (see the feature spec's failure spec — 13 Peasant orders
 *  spread over 96s were merged into a single "Train 13× Peasant" step). */
describe("extractBuild — merge window (F001 follow-up-2)", () => {
  function summaryWithEvents(events: ReplayEvent[]): ReplaySummary {
    return {
      map: { file: "synthetic.w3x", name: "Synthetic" },
      version: "3.00",
      buildNumber: 1,
      durationMs: 120_000,
      players: [{ id: 0, name: "Solo#1", race: "human", raceDetected: "human", teamId: 0, isObserver: false }],
      events: { 0: events },
    };
  }

  it("bounds a steady stream of same-id unit orders to groups of at most 2 within a 10s window", () => {
    // 13 "hpea" (Peasant) orders, 8s apart, starting at 1s: 1, 9, 17, ..., 97.
    const events: ReplayEvent[] = Array.from({ length: 13 }, (_, i) => ({
      kind: "unit" as const,
      id: "hpea",
      ms: 1_000 + i * 8_000,
    }));
    const draft = extractBuild(summaryWithEvents(events), 0);

    let lastSupply = -1;
    for (const step of draft.steps) {
      const match = step.instruction.match(/^Train (\d+)× Peasant$/);
      if (match) {
        const count = Number(match[1]);
        expect(count).toBeLessThan(3); // never N >= 3 — each group spans at most 10s, so at most 2 orders 8s apart
        expect(step.instruction).toBe("Train 2× Peasant");
      }
      const supply = Number(step.supply);
      if (lastSupply >= 0) {
        // Peasant costs 1 food; supply rises by exactly the group's count.
        const impliedCount = supply - lastSupply;
        expect(impliedCount).toBeGreaterThanOrEqual(1);
        expect(impliedCount).toBeLessThanOrEqual(2);
      }
      lastSupply = supply;
    }
    expect(draft.steps.some((s) => /Train \d+× Peasant/.test(s.instruction))).toBe(true);
  });

  describe("Last Refuge fixture (Dretwiak, human)", () => {
    let dretwiakDraft: ReturnType<typeof extractBuild>;

    beforeAll(async () => {
      const lastRefuge = await parseReplay(loadFixture("w3c_6aae9d48d867fad24f911778_last_refuge.w3g"));
      const dretwiakId = lastRefuge.players.find((p) => p.name === "Dretwiak#2963")!.id;
      dretwiakDraft = extractBuild(lastRefuge, dretwiakId);
    }, 15_000);

    it("never merges more than 5 consecutive train orders into one step", () => {
      for (const step of dretwiakDraft.steps) {
        const match = step.instruction.match(/^Train (\d+)× /);
        if (match) expect(Number(match[1])).toBeLessThanOrEqual(5);
      }
    });

    it("never lets supply jump by more than 5 between consecutive steps within the first 3:00", () => {
      let lastMs = -1;
      let lastSupply = -1;
      for (const step of dretwiakDraft.steps) {
        const ms = clockToMs(step.time);
        if (ms > 180_000) break;
        if (lastSupply >= 0) expect(Number(step.supply) - lastSupply).toBeLessThanOrEqual(5);
        lastMs = ms;
        lastSupply = Number(step.supply);
      }
      expect(lastMs).toBeGreaterThanOrEqual(0);
    });

    it("does not merge the first step into 'Train 13× Peasant'", () => {
      expect(dretwiakDraft.steps[0]?.instruction).not.toBe("Train 13× Peasant");
    });
  });
});
