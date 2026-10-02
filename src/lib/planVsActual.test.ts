/**
 * F009 (plan-vs-actual-engine) – `compareBuild`/`pickMe` unit tests, plus
 * two real builds hand-checked row-by-row against the real production
 * replay fixture (`src/api/__fixtures__/replay-import.production.json`,
 * already committed by an earlier feature) – see docstrings below for how
 * each row's status was worked out.
 */
import { describe, expect, it } from "vitest";
import type { ApiBuildStep } from "../api/schema";
import type { ReplayImportStep } from "../api/replayImport";
import PRODUCTION_FIXTURE from "../api/__fixtures__/replay-import.production.json";
import BM_MI_BUILD from "./__fixtures__/build.bm-mi-1-grunt-into-hhs-2-burrow-tech-622e.json";
import FARSEER_BUILD from "./__fixtures__/build.farseer-headhunter-2-burrow-tech.json";
import {
  ON_PLAN_SUPPLY_TOLERANCE,
  ON_PLAN_TIME_TOLERANCE_SECONDS,
  compareBuild,
  expandActualSteps,
  parseStepCount,
  pickMe,
  type ComparisonRow,
} from "./planVsActual";

function step(overrides: Partial<ApiBuildStep> & { instruction: string }): ApiBuildStep {
  return overrides;
}

function actualStep(overrides: Partial<ReplayImportStep> & Pick<ReplayImportStep, "time" | "supply" | "instruction" | "icon">): ReplayImportStep {
  return overrides;
}

/** Trims a comparison row down to the fields these tests assert on. */
function simplify(row: ComparisonRow) {
  return { icon: row.plan.icon, status: row.status, supplyDelta: row.supplyDelta, timeDelta: row.timeDelta };
}

describe("parseStepCount", () => {
  it("parses a × count prefix", () => {
    expect(parseStepCount("Train 2× Peon")).toBe(2);
    expect(parseStepCount("Train 4× Peon")).toBe(4);
  });

  it("parses an ascii x count prefix case-insensitively", () => {
    expect(parseStepCount("2x Peon")).toBe(2);
    expect(parseStepCount("2X Peon")).toBe(2);
  });

  it("defaults to 1 when there's no count prefix", () => {
    expect(parseStepCount("Build Altar of Storms")).toBe(1);
    expect(parseStepCount("Hero: Far Seer")).toBe(1);
  });
});

describe("expandActualSteps", () => {
  it("expands a multi-unit step into N occurrences keeping time/supply/instruction", () => {
    const steps: ReplayImportStep[] = [actualStep({ time: "0:44", supply: 8, instruction: "Train 4× Peon", icon: "or-peon" })];
    const expanded = expandActualSteps(steps);
    expect(expanded).toHaveLength(4);
    for (const occurrence of expanded) {
      expect(occurrence).toEqual({ icon: "or-peon", time: "0:44", supply: 8, instruction: "Train 4× Peon" });
    }
  });

  it("keeps a single-unit step as exactly one occurrence", () => {
    const steps: ReplayImportStep[] = [actualStep({ time: "0:05", supply: 7, instruction: "Build Altar of Storms", icon: "or-altar" })];
    expect(expandActualSteps(steps)).toHaveLength(1);
  });

  it("preserves overall order across a mix of single- and multi-unit steps", () => {
    const steps: ReplayImportStep[] = [
      actualStep({ time: "0:01", supply: 5, instruction: "Train 2× Peon", icon: "or-peon" }),
      actualStep({ time: "0:05", supply: 7, instruction: "Build Altar of Storms", icon: "or-altar" }),
    ];
    expect(expandActualSteps(steps).map((o) => o.icon)).toEqual(["or-peon", "or-peon", "or-altar"]);
  });
});

describe("compareBuild – reordering is order-tolerant", () => {
  it("matches the k-th occurrence of each icon independently, so a reordered plan doesn't cascade into misses", () => {
    // Plan trains a Grunt, then a Peon. The actual log did it the other way
    // around (Peon first, then Grunt) – per-icon k-th matching still pairs
    // each plan step with its own icon's occurrence, so neither row misses.
    const plan: ApiBuildStep[] = [
      step({ icon: "or-grunt", supply: 10, instruction: "Train Grunt" }),
      step({ icon: "or-peon", supply: 5, instruction: "Train Peon" }),
    ];
    const actual: ReplayImportStep[] = [
      actualStep({ time: "0:10", supply: 5, instruction: "Train Peon", icon: "or-peon" }),
      actualStep({ time: "0:20", supply: 10, instruction: "Train Grunt", icon: "or-grunt" }),
    ];
    const { rows } = compareBuild(plan, actual);
    expect(rows.map((r) => r.status)).toEqual(["on-plan", "on-plan"]);
    expect(rows[0].actual).toEqual({ time: "0:20", supply: 10 });
    expect(rows[1].actual).toEqual({ time: "0:10", supply: 5 });
  });
});

describe("compareBuild – missed steps", () => {
  it("reports missed when the actual log has no occurrence left for a plan icon", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-headhunter", supply: 17, instruction: "Train Headhunter" })];
    const { rows, summary } = compareBuild(plan, []);
    expect(rows[0]).toMatchObject({ status: "missed", actual: null, supplyDelta: null, timeDelta: null });
    expect(summary).toMatchObject({ total: 1, onPlan: 0, early: 0, late: 0, missed: 1 });
    expect(summary.firstSlip).toEqual({ index: 0, supply: 17, time: null });
  });

  it("reports missed for the Nth occurrence of an icon once the actual log runs out", () => {
    const plan: ApiBuildStep[] = [
      step({ icon: "or-burrow", supply: 7, instruction: "Build Orc Burrow" }),
      step({ icon: "or-burrow", supply: 17, instruction: "Build Orc Burrow" }),
    ];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:12", supply: 7, instruction: "Build Orc Burrow", icon: "or-burrow" })];
    const { rows } = compareBuild(plan, actual);
    expect(rows[0].status).toBe("on-plan");
    expect(rows[1].status).toBe("missed");
  });
});

describe("compareBuild – extras collapsing", () => {
  it("collapses actual icons never seen in the plan, in order of first appearance, with a running count", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 5, instruction: "Train Peon" })];
    const actual: ReplayImportStep[] = [
      actualStep({ time: "0:01", supply: 5, instruction: "Train Peon", icon: "or-peon" }),
      actualStep({ time: "4:51", supply: 34, instruction: "Build Beastiary", icon: "or-beastiary" }),
      actualStep({ time: "4:58", supply: 34, instruction: "Build Beastiary", icon: "or-beastiary" }),
      actualStep({ time: "6:00", supply: 34, instruction: "Train Raider", icon: "or-raider" }),
    ];
    const { extras } = compareBuild(plan, actual);
    expect(extras).toEqual([
      { icon: "or-beastiary", count: 2, firstTime: "4:51", firstSupply: 34, instruction: "Build Beastiary" },
      { icon: "or-raider", count: 1, firstTime: "6:00", firstSupply: 34, instruction: "Train Raider" },
    ]);
  });

  it("does not surface extra occurrences of an icon that IS in the plan, just beyond its matched count", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 8, instruction: "Train Peon" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:44", supply: 8, instruction: "Train 4× Peon", icon: "or-peon" })];
    const { extras, rows } = compareBuild(plan, actual);
    expect(extras).toEqual([]);
    expect(rows[0].status).toBe("on-plan"); // matched the first of the 4 occurrences; the other 3 are simply unmatched.
  });
});

describe("compareBuild – thresholds at the boundary", () => {
  it("±1 supply is on-plan, ±2 is early/late, when the plan step has no time", () => {
    const plan: ApiBuildStep[] = [step({ icon: "x", supply: 10, instruction: "i" })];
    expect(compareBuild(plan, [actualStep({ time: "0:00", supply: 10 + ON_PLAN_SUPPLY_TOLERANCE, instruction: "i", icon: "x" })]).rows[0].status).toBe(
      "on-plan",
    );
    expect(
      compareBuild(plan, [actualStep({ time: "0:00", supply: 10 - ON_PLAN_SUPPLY_TOLERANCE, instruction: "i", icon: "x" })]).rows[0].status,
    ).toBe("on-plan");
    expect(
      compareBuild(plan, [actualStep({ time: "0:00", supply: 10 + ON_PLAN_SUPPLY_TOLERANCE + 1, instruction: "i", icon: "x" })]).rows[0].status,
    ).toBe("late");
    expect(
      compareBuild(plan, [actualStep({ time: "0:00", supply: 10 - ON_PLAN_SUPPLY_TOLERANCE - 1, instruction: "i", icon: "x" })]).rows[0].status,
    ).toBe("early");
  });

  it("±10s is on-plan, ±11s is early/late, when the plan step has a time (even with a supply mismatch)", () => {
    const plan: ApiBuildStep[] = [step({ icon: "x", time: "1:00", supply: 10, instruction: "i" })];
    const atSeconds = (deltaSeconds: number) => {
      const total = 60 + deltaSeconds;
      const time = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
      return compareBuild(plan, [actualStep({ time, supply: 999, instruction: "i", icon: "x" })]).rows[0].status;
    };
    expect(atSeconds(ON_PLAN_TIME_TOLERANCE_SECONDS)).toBe("on-plan");
    expect(atSeconds(-ON_PLAN_TIME_TOLERANCE_SECONDS)).toBe("on-plan");
    expect(atSeconds(ON_PLAN_TIME_TOLERANCE_SECONDS + 1)).toBe("late");
    expect(atSeconds(-(ON_PLAN_TIME_TOLERANCE_SECONDS + 1))).toBe("early");
  });
});

describe("compareBuild – a plan without times uses supply for status", () => {
  it("every row's status derives from supplyDelta, timeDelta is always null", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 5, instruction: "Train Peon" })];
    const { rows } = compareBuild(plan, [actualStep({ time: "0:01", supply: 5, instruction: "Train Peon", icon: "or-peon" })]);
    expect(rows[0].timeDelta).toBeNull();
    expect(rows[0].supplyDelta).toBe(0);
    expect(rows[0].status).toBe("on-plan");
  });
});

describe("compareBuild – a plan step with no icon", () => {
  it("is reported as unmatched-no-icon, not missed", () => {
    const plan: ApiBuildStep[] = [step({ supply: 5, instruction: "Some step with no icon at all" })];
    const { rows, summary } = compareBuild(plan, []);
    expect(rows[0]).toMatchObject({ status: "unmatched-no-icon", actual: null });
    // unmatched-no-icon rows never count toward onPlan/early/late/missed or firstSlip.
    expect(summary).toMatchObject({ onPlan: 0, early: 0, late: 0, missed: 0, firstSlip: null });
  });
});

describe("compareBuild – immutability", () => {
  it("never mutates the plan or actual input arrays/objects", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 5, time: "0:00", instruction: "Train Peon" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:01", supply: 5, instruction: "Train Peon", icon: "or-peon" })];
    const planCopy = JSON.parse(JSON.stringify(plan));
    const actualCopy = JSON.parse(JSON.stringify(actual));
    compareBuild(plan, actual);
    expect(plan).toEqual(planCopy);
    expect(actual).toEqual(actualCopy);
  });
});

// --- pickMe ----------------------------------------------------------------

describe("pickMe", () => {
  const p1 = { id: 1, name: "IIIIIlllIIIl#3697", race: "orc" };
  const p2 = { id: 2, name: "iNSUPERABLE#11842", race: "undead" };

  it("is not-1v1 when there aren't exactly two players", () => {
    expect(pickMe([], {})).toEqual({ kind: "not-1v1" });
    expect(pickMe([p1], {})).toEqual({ kind: "not-1v1" });
    expect(pickMe([p1, p2, { id: 3, name: "third#1", race: "human" }], {})).toEqual({ kind: "not-1v1" });
  });

  it("matches a full Name#1234 BattleTag, case-insensitively", () => {
    expect(pickMe([p1, p2], { myBattleTag: "iiiiillliiil#3697" })).toEqual({ kind: "resolved", player: p1 });
  });

  it("matches on just the name part when myBattleTag has no #", () => {
    expect(pickMe([p1, p2], { myBattleTag: "insuperable" })).toEqual({ kind: "resolved", player: p2 });
  });

  it("falls back to race when exactly one player matches planRace", () => {
    expect(pickMe([p1, p2], { planRace: "undead" })).toEqual({ kind: "resolved", player: p2 });
  });

  it("is unresolved when neither a tag match nor a unique race match is found", () => {
    expect(pickMe([p1, p2], {})).toEqual({ kind: "unresolved" });
    expect(pickMe([p1, p2], { myBattleTag: "someone-else#1" })).toEqual({ kind: "unresolved" });
    // Both players share a race – race alone can't disambiguate.
    const bothOrc = [p1, { ...p2, race: "orc" }];
    expect(pickMe(bothOrc, { planRace: "orc" })).toEqual({ kind: "unresolved" });
  });

  it("prefers a BattleTag match over a race match when both would resolve differently", () => {
    // planRace matches p2 (undead), but the BattleTag explicitly says p1.
    expect(pickMe([p1, p2], { myBattleTag: "IIIIIlllIIIl#3697", planRace: "undead" })).toEqual({
      kind: "resolved",
      player: p1,
    });
  });
});

// --- real pair: bm-mi-1-grunt-into-hhs-2-burrow-tech-622e vs the real replay -----

/**
 * Hand-checked against the two fixtures: `BM_MI_BUILD` (21 steps, all
 * timed) is the plan; the committed production replay's orc player
 * (`IIIIIlllIIIl#3697`, 28 actual steps) is "actual". Every row below was
 * worked out by hand from the two fixtures' raw step lists – see the
 * per-row notes for anything non-obvious.
 */
describe("compareBuild – real pair: bm-mi-1-grunt-into-hhs-2-burrow-tech-622e", () => {
  const planSteps = BM_MI_BUILD.steps as unknown as ApiBuildStep[];
  const actualSteps = PRODUCTION_FIXTURE.players[0].build.steps as unknown as ReplayImportStep[];

  it("matches IIIIIlllIIIl#3697 (orc) as the production fixture's player 0", () => {
    expect(PRODUCTION_FIXTURE.players[0].name).toBe("IIIIIlllIIIl#3697");
    expect(PRODUCTION_FIXTURE.players[0].race).toBe("orc");
    expect(actualSteps).toHaveLength(28);
    expect(planSteps).toHaveLength(21);
  });

  it("produces the hand-checked row-by-row result", () => {
    const { rows } = compareBuild(planSteps, actualSteps);
    expect(rows.map(simplify)).toEqual([
      { icon: "or-peon", status: "on-plan", supplyDelta: 0, timeDelta: 1 }, // 0:00/5 vs 0:01/5
      { icon: "or-altar", status: "on-plan", supplyDelta: 1, timeDelta: 4 }, // 0:01/6 vs 0:05/7
      { icon: "or-peon", status: "on-plan", supplyDelta: -1, timeDelta: -6 }, // 0:07/6 vs 0:01/5 (2nd peon trained early, within 10s)
      { icon: "or-burrow", status: "on-plan", supplyDelta: 0, timeDelta: 5 }, // 0:12/7 vs 0:17/7
      { icon: "or-barracks", status: "on-plan", supplyDelta: 1, timeDelta: 2 }, // 0:32/7 vs 0:34/8
      { icon: "or-peon", status: "early", supplyDelta: 0, timeDelta: -13 }, // 0:33/7 vs 0:20/7 – first real slip, 13s early
      { icon: "or-peon", status: "on-plan", supplyDelta: 0, timeDelta: -1 }, // 0:45/8 vs 0:44/8
      { icon: "or-war-mill", status: "late", supplyDelta: 25, timeDelta: 270 }, // 1:05/9 vs 5:35/34 – War Mill went up ~4.5m late
      // Plan's hero is a Blademaster – this player went Far Seer instead
      // (that shows up as the "or-far-seer" extra below), so the
      // Blademaster order has nothing in the actual log to match at all.
      { icon: "or-blademaster", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-peon", status: "early", supplyDelta: -6, timeDelta: -26 }, // 1:10/14 vs 0:44/8 (5th or-peon match)
      { icon: "or-grunt", status: "on-plan", supplyDelta: 4, timeDelta: 3 }, // 1:32/15 vs 1:35/19
      { icon: "or-peon", status: "early", supplyDelta: -10, timeDelta: -54 }, // 1:38/18 vs 0:44/8 (6th or-peon match)
      { icon: "or-burrow", status: "late", supplyDelta: 4, timeDelta: 30 }, // 1:55/19 vs 2:25/23
      // The plan calls for 2 Headhunters here; this player never built a
      // single one all game (raiders/forest trolls instead) – all four
      // Headhunter orders below are "missed", not just this one.
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-stronghold", status: "early", supplyDelta: 2, timeDelta: -24 }, // 2:41/21 vs 2:17/23
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-voodoo-lounge", status: "early", supplyDelta: 0, timeDelta: -30 }, // 3:07/23 vs 2:37/23
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-burrow", status: "late", supplyDelta: 4, timeDelta: 58 }, // 3:32/25 vs 4:30/29
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
    ]);
  });

  it("totals 7 on-plan, 5 early, 3 late, 6 missed, first slip at the 6th row (the 3rd or-peon order)", () => {
    const { summary } = compareBuild(planSteps, actualSteps);
    expect(summary).toEqual({
      total: 21,
      onPlan: 7,
      early: 5,
      late: 3,
      missed: 6,
      firstSlip: { index: 5, supply: 7, time: "0:33" },
    });
  });

  it("collects the actual icons this build's plan never mentions, in order of first appearance", () => {
    const { extras } = compareBuild(planSteps, actualSteps);
    expect(extras).toEqual([
      { icon: "or-far-seer", count: 1, firstTime: "1:08", firstSupply: 13, instruction: "Hero: Far Seer" },
      { icon: "or-tauren-chieftain", count: 1, firstTime: "4:44", firstSupply: 29, instruction: "Hero: Tauren Chieftain" },
      { icon: "or-beastiary", count: 2, firstTime: "4:51", firstSupply: 34, instruction: "Build Beastiary" },
      { icon: "nt-upgrade", count: 2, firstTime: "5:00", firstSupply: 34, instruction: "Research Berserker Strength" },
      { icon: "or-raider", count: 1, firstTime: "6:00", firstSupply: 34, instruction: "Train Raider" },
      { icon: "foresttroll", count: 1, firstTime: "6:43", firstSupply: 37, instruction: "Train Forest Troll Berserker" },
      { icon: "or-watch-tower", count: 1, firstTime: "7:11", firstSupply: 40, instruction: "Build Watch Tower" },
      { icon: "or-kodo", count: 1, firstTime: "7:34", firstSupply: 40, instruction: "Train Kodo Beast" },
    ]);
  });
});

// --- real pair: farseer-headhunter-2-burrow-tech vs the real replay --------

/**
 * `FARSEER_BUILD` (19 steps, supply only – no step has a `time` at all) vs
 * the same production replay's orc player. Every status below is driven
 * by `supplyDelta` (±1 tolerance), never `timeDelta` (always null, since
 * the plan has no times).
 */
describe("compareBuild – real pair: farseer-headhunter-2-burrow-tech", () => {
  const planSteps = FARSEER_BUILD.steps as unknown as ApiBuildStep[];
  const actualSteps = PRODUCTION_FIXTURE.players[0].build.steps as unknown as ReplayImportStep[];

  it("has 19 supply-only steps", () => {
    expect(planSteps).toHaveLength(19);
    expect(planSteps.every((s) => s.time === undefined)).toBe(true);
  });

  it("produces the hand-checked row-by-row result", () => {
    const { rows } = compareBuild(planSteps, actualSteps);
    expect(rows.map(simplify)).toEqual([
      { icon: "or-peon", status: "on-plan", supplyDelta: 0, timeDelta: null }, // supply 5 vs 5
      { icon: "or-altar", status: "on-plan", supplyDelta: 1, timeDelta: null }, // supply 6 vs 7
      { icon: "or-burrow", status: "on-plan", supplyDelta: 0, timeDelta: null }, // supply 7 vs 7
      { icon: "or-peon", status: "early", supplyDelta: -3, timeDelta: null }, // supply 8 vs 5 (2nd or-peon match) – first slip
      { icon: "or-war-mill", status: "late", supplyDelta: 25, timeDelta: null }, // supply 9 vs 34
      // This player never gathers lumber as its own order (no "nt-lumber"
      // instruction anywhere in the replay) – both nt-lumber rows miss.
      { icon: "nt-lumber", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-far-seer", status: "late", supplyDelta: 3, timeDelta: null }, // supply 10 vs 13 (1st or-far-seer match)
      { icon: "or-barracks", status: "early", supplyDelta: -8, timeDelta: null }, // supply 16 vs 8
      { icon: "nt-lumber", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-burrow", status: "late", supplyDelta: 6, timeDelta: null }, // supply 17 vs 23 (2nd or-burrow match)
      // Only one "or-far-seer" order ever appears in the actual log (the
      // hero itself) – the plan's 2nd far-seer-icon step (skill order, not
      // a build order) has nothing left to match.
      { icon: "or-far-seer", status: "missed", supplyDelta: null, timeDelta: null },
      // This player never trained a Headhunter at all – both rows miss.
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-stronghold", status: "late", supplyDelta: 2, timeDelta: null }, // supply 21 vs 23
      { icon: "or-headhunter", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-burrow", status: "late", supplyDelta: 2, timeDelta: null }, // supply 27 vs 29 (3rd or-burrow match)
      { icon: "or-voodoo-lounge", status: "early", supplyDelta: -6, timeDelta: null }, // supply 29 vs 23
      { icon: "or-tauren-chieftain", status: "early", supplyDelta: -5, timeDelta: null }, // supply 34 vs 29
      { icon: "nt-upgrade", status: "on-plan", supplyDelta: 0, timeDelta: null }, // supply 34 vs 34
      // "or-spirit-lodge" never appears in the actual log at all.
      { icon: "or-spirit-lodge", status: "missed", supplyDelta: null, timeDelta: null },
    ]);
  });

  it("totals 4 on-plan, 4 early, 5 late, 6 missed, first slip at the 4th row (the 2nd or-peon order)", () => {
    const { summary } = compareBuild(planSteps, actualSteps);
    expect(summary).toEqual({
      total: 19,
      onPlan: 4,
      early: 4,
      late: 5,
      missed: 6,
      firstSlip: { index: 3, supply: 8, time: null },
    });
  });

  it("collects the actual icons this build's plan never mentions, in order of first appearance", () => {
    const { extras } = compareBuild(planSteps, actualSteps);
    expect(extras).toEqual([
      { icon: "or-grunt", count: 3, firstTime: "1:35", firstSupply: 19, instruction: "Train Grunt" },
      { icon: "or-beastiary", count: 2, firstTime: "4:51", firstSupply: 34, instruction: "Build Beastiary" },
      { icon: "or-raider", count: 1, firstTime: "6:00", firstSupply: 34, instruction: "Train Raider" },
      { icon: "foresttroll", count: 1, firstTime: "6:43", firstSupply: 37, instruction: "Train Forest Troll Berserker" },
      { icon: "or-watch-tower", count: 1, firstTime: "7:11", firstSupply: 40, instruction: "Build Watch Tower" },
      { icon: "or-kodo", count: 1, firstTime: "7:34", firstSupply: 40, instruction: "Train Kodo Beast" },
    ]);
  });
});
