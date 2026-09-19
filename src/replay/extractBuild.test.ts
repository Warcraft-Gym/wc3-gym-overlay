import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReplay } from "./parseReplay";
import { extractBuild } from "./extractBuild";
import { editorFormSchema } from "../lib/buildEditorSchema";
import type { ReplaySummary } from "./types";

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
