/**
 * F009 (plan-vs-actual-engine) – `compareBuild`/`pickMe` unit tests, plus
 * two real builds hand-checked row-by-row against the real production
 * replay fixture (`src/api/__fixtures__/replay-import.production.json`,
 * already committed by an earlier feature) – see docstrings below for how
 * each row's status was worked out.
 *
 * F010a – follow-up of F010: a third real pair below
 * (`human-mk-pally-mass-hawks-vs-elf-c9ac` vs `ALL_OPTIONS_FIXTURE`) checks
 * the icon-optional fix against real production data where an actual step
 * genuinely has no `icon`.
 *
 * F010b (plan-counts-and-workers) – follow-up of F010a: every real pair's
 * row-by-row expectations below were hand-recomputed for two further
 * changes to `compareBuild` – a plan step's own "N×" count now consumes N
 * actual occurrences (not 1), and worker icons (`WORKER_ICONS`) are never
 * judged early/late/on-plan. See each describe block's updated comments
 * for exactly what changed and why.
 */
import { describe, expect, it } from "vitest";
import type { ApiBuildStep } from "../api/schema";
import type { ReplayImportStep } from "../api/replayImport";
import PRODUCTION_FIXTURE from "../api/__fixtures__/replay-import.production.json";
import ALL_OPTIONS_FIXTURE from "../api/__fixtures__/replay-import.production.all-options.json";
import BM_MI_BUILD from "./__fixtures__/build.bm-mi-1-grunt-into-hhs-2-burrow-tech-622e.json";
import FARSEER_BUILD from "./__fixtures__/build.farseer-headhunter-2-burrow-tech.json";
import HUMAN_BUILD from "./__fixtures__/build.human-mk-pally-mass-hawks-vs-elf-c9ac.json";
import {
  ON_PLAN_SUPPLY_TOLERANCE,
  ON_PLAN_TIME_TOLERANCE_SECONDS,
  WORKER_ICONS,
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

  // F010b: a plan step's own instruction can be full of digits that are
  // *not* an "N×"/"Nx" count prefix (ordinal prose, not a unit count) - the
  // regex must not misfire on any of these. The first two are real
  // instructions from `FARSEER_BUILD` below (see the farseer-headhunter
  // real pair).
  it("does not misfire on plan prose that has digits but no ×/x count form", () => {
    expect(parseStepCount("Send 4 of your starting peons to gold, the 5th builds an Altar.")).toBe(1);
    expect(parseStepCount("The 4th peon produced gathers lumber. Queue another (6th) peon.")).toBe(1);
    expect(parseStepCount("4 wisps on gold, 5th builds altar.")).toBe(1);
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
    // Plan trains a Grunt, then a Headhunter (neither is a worker icon -
    // this test is about reordering, not F010b's worker handling). The
    // actual log did it the other way around (Headhunter first, then
    // Grunt) – per-icon k-th matching still pairs each plan step with its
    // own icon's occurrence, so neither row misses.
    const plan: ApiBuildStep[] = [
      step({ icon: "or-grunt", supply: 10, instruction: "Train Grunt" }),
      step({ icon: "or-headhunter", supply: 5, instruction: "Train Headhunter" }),
    ];
    const actual: ReplayImportStep[] = [
      actualStep({ time: "0:10", supply: 5, instruction: "Train Headhunter", icon: "or-headhunter" }),
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
    // or-grunt, not or-peon – a worker icon's own row would be "not-timed"
    // (F010b), not "on-plan"; this test is about the extras rule, not that.
    const plan: ApiBuildStep[] = [step({ icon: "or-grunt", supply: 8, instruction: "Train Grunt" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:44", supply: 8, instruction: "Train 4× Grunt", icon: "or-grunt" })];
    const { extras, rows } = compareBuild(plan, actual);
    expect(extras).toEqual([]);
    expect(rows[0].status).toBe("on-plan"); // matched the first of the 4 occurrences; the other 3 are simply unmatched.
  });
});

// --- F010b: a plan step's own "N×" count consumes N actual occurrences ---

describe("compareBuild – a plan step's own N× count consumes N occurrences", () => {
  it("a 'Train 2× Peon' plan step consumes 2 occurrences, not 1, so the next plan row doesn't read one unit early", () => {
    const plan: ApiBuildStep[] = [
      step({ icon: "or-grunt", supply: 5, instruction: "Train 2× Grunt" }),
      step({ icon: "or-grunt", supply: 7, instruction: "Train Grunt" }),
    ];
    const actual: ReplayImportStep[] = [
      actualStep({ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }),
      actualStep({ time: "0:05", supply: 6, instruction: "Train Grunt", icon: "or-grunt" }),
      actualStep({ time: "0:22", supply: 7, instruction: "Train Grunt", icon: "or-grunt" }),
    ];
    const { rows } = compareBuild(plan, actual);
    // Row 0 ("2×") consumes occurrences 0 and 1, reporting the first (0:01).
    expect(rows[0]).toMatchObject({ actual: { time: "0:01", supply: 5 }, count: 2, shortBy: undefined });
    // Row 1 ("Grunt") picks up occurrence 2 (0:22) next, not occurrence 1
    // (0:05) – which is what would happen if the "2×" plan step had only
    // consumed 1 occurrence, same bug this fixes for the real human build
    // below (human-mk-pally-mass-hawks-vs-elf-c9ac).
    expect(rows[1]).toMatchObject({ actual: { time: "0:22", supply: 7 }, count: 1, shortBy: undefined });
  });

  it("records shortBy (N - found) when fewer than N occurrences remain, and still judges the row on the first one found", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-grunt", supply: 5, instruction: "Train 3× Grunt" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" })];
    const { rows } = compareBuild(plan, actual);
    expect(rows[0]).toMatchObject({ status: "on-plan", actual: { time: "0:01", supply: 5 }, count: 3, shortBy: 2 });
  });

  it("is still 'missed' (not shortBy-with-no-actual) when none of the N occurrences are found", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-grunt", supply: 5, instruction: "Train 3× Grunt" })];
    const { rows } = compareBuild(plan, []);
    expect(rows[0]).toMatchObject({ status: "missed", actual: null, count: 3, shortBy: 3 });
  });
});

// --- F010b: worker icons are matched but not timed -------------------------

describe("compareBuild – worker icons are matched but not timed", () => {
  it("lists every known worker icon", () => {
    expect([...WORKER_ICONS].sort()).toEqual(["hu-peasant", "ne-wisp", "or-peon", "ud-acolyte"]);
  });

  it("a matched worker row is 'not-timed', not on-plan/early/late, and still consumes its occurrence", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", time: "0:05", supply: 5, instruction: "Train Peon" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:40", supply: 5, instruction: "Train Peon", icon: "or-peon" })];
    const { rows } = compareBuild(plan, actual);
    // 0:40 vs plan's 0:05 would be "late" by `rowStatus`'s own rule if this
    // weren't a worker row – not-timed overrides that, it is never judged.
    expect(rows[0]).toMatchObject({ status: "not-timed", actual: { time: "0:40", supply: 5 } });
  });

  it("an unmatched worker row is still 'missed', not 'not-timed' – there is nothing to not-time", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 5, instruction: "Train Peon" })];
    const { rows } = compareBuild(plan, []);
    expect(rows[0].status).toBe("missed");
  });

  it("excludes not-timed rows from summary's counts (total counts judged rows only) and from firstSlip", () => {
    const plan: ApiBuildStep[] = [
      step({ icon: "or-peon", time: "0:00", supply: 5, instruction: "Train Peon" }),
      step({ icon: "or-war-mill", time: "1:00", supply: 9, instruction: "Build War Mill" }),
    ];
    const actual: ReplayImportStep[] = [
      // Peon trained very late – would be "late" and the firstSlip if it
      // were judged at all; being a worker, it must not be either.
      actualStep({ time: "0:50", supply: 5, instruction: "Train Peon", icon: "or-peon" }),
      actualStep({ time: "1:02", supply: 9, instruction: "Build War Mill", icon: "or-war-mill" }),
    ];
    const { summary } = compareBuild(plan, actual);
    expect(summary).toEqual({
      total: 1,
      onPlan: 1,
      early: 0,
      late: 0,
      missed: 0,
      notTimed: 1,
      firstSlip: null,
    });
  });

  it("a worker icon never seen in the plan still shows up as an extra – the extras rule itself doesn't special-case workers", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-grunt", supply: 5, instruction: "Train Grunt" })];
    const actual: ReplayImportStep[] = [
      actualStep({ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" }),
      actualStep({ time: "0:05", supply: 6, instruction: "Train Peon", icon: "or-peon" }),
    ];
    const { extras } = compareBuild(plan, actual);
    expect(extras).toEqual([{ icon: "or-peon", count: 1, firstTime: "0:05", firstSupply: 6, instruction: "Train Peon" }]);
  });

  it("a worker icon that IS in the plan never shows up as an extra, same as any other matched icon", () => {
    const plan: ApiBuildStep[] = [step({ icon: "or-peon", supply: 5, instruction: "Train Peon" })];
    const actual: ReplayImportStep[] = [actualStep({ time: "0:01", supply: 5, instruction: "Train Peon", icon: "or-peon" })];
    const { extras } = compareBuild(plan, actual);
    expect(extras).toEqual([]);
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
    // or-grunt, not or-peon – see the comment on the extras test above.
    const plan: ApiBuildStep[] = [step({ icon: "or-grunt", supply: 5, instruction: "Train Grunt" })];
    const { rows } = compareBuild(plan, [actualStep({ time: "0:01", supply: 5, instruction: "Train Grunt", icon: "or-grunt" })]);
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
      // F010b: every or-peon row below flips from on-plan/early to
      // "not-timed" – or-peon is a worker icon (WORKER_ICONS); none of
      // these plan steps use an "N×" count, so the occurrence each one
      // consumes (and hence its actual/supplyDelta/timeDelta) is
      // unchanged, only the final status is.
      { icon: "or-peon", status: "not-timed", supplyDelta: 0, timeDelta: 1 }, // 0:00/5 vs 0:01/5
      { icon: "or-altar", status: "on-plan", supplyDelta: 1, timeDelta: 4 }, // 0:01/6 vs 0:05/7
      { icon: "or-peon", status: "not-timed", supplyDelta: -1, timeDelta: -6 }, // 0:07/6 vs 0:01/5 (2nd peon trained early, within 10s)
      { icon: "or-burrow", status: "on-plan", supplyDelta: 0, timeDelta: 5 }, // 0:12/7 vs 0:17/7
      { icon: "or-barracks", status: "on-plan", supplyDelta: 1, timeDelta: 2 }, // 0:32/7 vs 0:34/8
      { icon: "or-peon", status: "not-timed", supplyDelta: 0, timeDelta: -13 }, // 0:33/7 vs 0:20/7 – was the first real slip; a worker row can't be one anymore (see below)
      { icon: "or-peon", status: "not-timed", supplyDelta: 0, timeDelta: -1 }, // 0:45/8 vs 0:44/8
      // F010b: now the first slip – the earliest non-worker row that isn't on-plan.
      { icon: "or-war-mill", status: "late", supplyDelta: 25, timeDelta: 270 }, // 1:05/9 vs 5:35/34 – War Mill went up ~4.5m late
      // Plan's hero is a Blademaster – this player went Far Seer instead
      // (that shows up as the "or-far-seer" extra below), so the
      // Blademaster order has nothing in the actual log to match at all.
      { icon: "or-blademaster", status: "missed", supplyDelta: null, timeDelta: null },
      { icon: "or-peon", status: "not-timed", supplyDelta: -6, timeDelta: -26 }, // 1:10/14 vs 0:44/8 (5th or-peon match)
      { icon: "or-grunt", status: "on-plan", supplyDelta: 4, timeDelta: 3 }, // 1:32/15 vs 1:35/19
      { icon: "or-peon", status: "not-timed", supplyDelta: -10, timeDelta: -54 }, // 1:38/18 vs 0:44/8 (6th or-peon match)
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

  it("totals 4 on-plan, 2 early, 3 late, 6 missed, 6 not-timed, first slip at the 8th row (Build War Mill) now that the 6 or-peon rows are excluded", () => {
    const { summary } = compareBuild(planSteps, actualSteps);
    expect(summary).toEqual({
      total: 15,
      onPlan: 4,
      early: 2,
      late: 3,
      missed: 6,
      notTimed: 6,
      firstSlip: { index: 7, supply: 9, time: "1:05" },
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
      // F010b: both or-peon rows below flip from on-plan/early to
      // "not-timed" – or-peon is a worker icon; neither plan step has an
      // "N×" count, so the matched occurrence (and its supplyDelta) is
      // unchanged, only the status is.
      { icon: "or-peon", status: "not-timed", supplyDelta: 0, timeDelta: null }, // supply 5 vs 5
      { icon: "or-altar", status: "on-plan", supplyDelta: 1, timeDelta: null }, // supply 6 vs 7
      { icon: "or-burrow", status: "on-plan", supplyDelta: 0, timeDelta: null }, // supply 7 vs 7
      { icon: "or-peon", status: "not-timed", supplyDelta: -3, timeDelta: null }, // supply 8 vs 5 (2nd or-peon match) – was the first slip; see below for the new one
      // F010b: now the first slip – the earliest non-worker row that isn't on-plan.
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

  it("totals 3 on-plan, 3 early, 5 late, 6 missed, 2 not-timed, first slip at the 5th row (Build War Mill)", () => {
    const { summary } = compareBuild(planSteps, actualSteps);
    expect(summary).toEqual({
      total: 17,
      onPlan: 3,
      early: 3,
      late: 5,
      missed: 6,
      notTimed: 2,
      firstSlip: { index: 4, supply: 9, time: null },
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

// --- real pair (F010a): human-mk-pally-mass-hawks-vs-elf-c9ac vs the real
// "every option on" replay fixture ------------------------------------------

/**
 * F010a – follow-up of F010: hand-checked against a *second* real pair,
 * captured specifically to exercise the icon-optional fix under real
 * production data: `HUMAN_BUILD` (`human-mk-pally-mass-hawks-vs-elf-c9ac`,
 * 45 timed steps, fetched live from `/api/builds/...`) as the plan;
 * `ALL_OPTIONS_FIXTURE`'s human player (`Dretwiak#2963`, 60 actual steps,
 * captured live from `/api/replay-import` with `cutoffSeconds=900`,
 * `includeUpgrades=true`, `includeItems=true` – the exact options a review
 * sends) as "actual". Two of Dretwiak's actual steps have no `icon` at all
 * ("Buy Circlet of Nobility", "Buy Boots of Speed" – items the icon
 * catalogue doesn't cover); every row below was worked out from the two
 * fixtures' raw step lists (each row's comment is "plan time/supply vs
 * actual time/supply", or "plan time/supply – never done" for a miss).
 */
describe("compareBuild – real pair (F010a): human-mk-pally-mass-hawks-vs-elf-c9ac", () => {
  const planSteps = HUMAN_BUILD.steps as unknown as ApiBuildStep[];
  const actualSteps = ALL_OPTIONS_FIXTURE.players[0].build.steps as unknown as ReplayImportStep[];

  it("matches Dretwiak#2963 (human) as the all-options fixture's player 0", () => {
    expect(ALL_OPTIONS_FIXTURE.players[0].name).toBe("Dretwiak#2963");
    expect(ALL_OPTIONS_FIXTURE.players[0].race).toBe("human");
    expect(planSteps).toHaveLength(45);
    expect(actualSteps).toHaveLength(60);
  });

  it("has two icon-less actual steps (untracked item purchases) – the F010a repro", () => {
    const iconLess = actualSteps.filter((s) => s.icon === undefined);
    expect(iconLess.map((s) => s.instruction)).toEqual(["Buy Circlet of Nobility", "Buy Boots of Speed"]);
  });

  it("produces the hand-checked row-by-row result", () => {
    const { rows } = compareBuild(planSteps, actualSteps);
    expect(rows.map(simplify)).toEqual([
      // F010b: every hu-peasant row below is now "not-timed" (hu-peasant is
      // a worker icon). Several of them also changed what they actually
      // matched: the plan's "Train 2× Peasant" steps (rows 0, 5, 17, 18,
      // 22, 27, 42 below) now correctly consume *2* occurrences each
      // instead of 1 (F010b's main fix - see `parseStepCount` applied to
      // the plan side in `compareBuild`), so every plain "Train Peasant"
      // row after the first "2×" one picks up a later occurrence than it
      // used to. The actual's own peasant-training steps are themselves
      // bursty (5×, then 1, then 3×, ...), so several of the newly-correct
      // occurrences land on a much later time/supply than before - two of
      // them (rows 22 and 27) flip what *would* have been their
      // early/late/on-plan judgement from early to late, though it no
      // longer matters for the final status since a worker row is never
      // judged either way.
      { icon: "hu-peasant", status: "not-timed", supplyDelta: 0, timeDelta: -1 }, // 0:02/5 vs 0:01/5 (count 2, found 2)
      { icon: "hu-altar", status: "late", supplyDelta: 4, timeDelta: 40 }, // 0:07/7 vs 0:47/11
      { icon: "hu-farm", status: "late", supplyDelta: 4, timeDelta: 14 }, // 0:18/7 vs 0:32/11
      { icon: "hu-barracks", status: "late", supplyDelta: 16, timeDelta: 207 }, // 0:20/7 vs 3:47/23
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -2, timeDelta: -21 }, // 0:22/7 vs 0:01/5 (3rd peasant occurrence - unchanged, still inside the actual's first 5× burst)
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -3, timeDelta: -39 }, // 0:40/8 vs 0:01/5 (count 2 - 4th/5th occurrences, both still 0:01/5)
      { icon: "hu-farm", status: "late", supplyDelta: 4, timeDelta: 18 }, // 0:58/10 vs 1:16/14
      { icon: "hu-peasant", status: "not-timed", supplyDelta: 0, timeDelta: -50 }, // 1:06/10 vs 0:16/10 - CHANGED (was 0:01/5): the "2×" rows above now consume 5 occurrences total, so this picks up the 6th (0:16/10), not the 4th
      // This player's hero is a Paladin – "Hero: Mountain King" has nothing
      // in the actual log to match at all.
      { icon: "hu-mountain-king", status: "missed", supplyDelta: null, timeDelta: null }, // plan 1:08/11 – never done
      { icon: "hu-footman", status: "late", supplyDelta: 32, timeDelta: 556 }, // 1:21/16 vs 10:37/48
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -7, timeDelta: -30 }, // 1:25/18 vs 0:55/11 - CHANGED (was 0:01/5): 7th occurrence now
      { icon: "hu-farm", status: "late", supplyDelta: 3, timeDelta: 55 }, // 1:38/19 vs 2:33/22
      { icon: "hu-footman", status: "late", supplyDelta: 29, timeDelta: 537 }, // 1:40/19 vs 10:37/48
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -10, timeDelta: -52 }, // 1:47/21 vs 0:55/11 - CHANGED (was 0:16/10): 8th occurrence now
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 2:01/22 – never done
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 2:19/24 – never done
      { icon: "hu-town-hall", status: "late", supplyDelta: 5, timeDelta: 233 }, // 2:59/26 vs 6:52/31
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -15, timeDelta: -129 }, // 3:04/26 vs 0:55/11 (count 2 - 9th/10th occurrences, both still 0:55/11 - unchanged)
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -13, timeDelta: -108 }, // 3:24/28 vs 1:36/15 - CHANGED (was 0:55/11): count 2, 11th occurrence now
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 4:11/30 – never done
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -10, timeDelta: -80 }, // 4:12/32 vs 2:52/22 - CHANGED (was 0:55/11): 13th occurrence now
      { icon: "hu-arcane-vault", status: "missed", supplyDelta: null, timeDelta: null }, // plan 4:37/33 – never done
      // CHANGED (was early, 1:21/14): count 2, 14th occurrence is 8:56/34 -
      // would be "late" by 259s if judged, but a worker row never is.
      { icon: "hu-peasant", status: "not-timed", supplyDelta: 1, timeDelta: 259 }, // 4:37/33 vs 8:56/34
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 4:48/35 – never done
      { icon: "hu-keep", status: "early", supplyDelta: -14, timeDelta: -86 }, // 4:49/37 vs 3:23/23
      { icon: "hu-lumber-mill", status: "early", supplyDelta: -21, timeDelta: -189 }, // 4:50/37 vs 1:41/16
      { icon: "hu-scout-tower", status: "early", supplyDelta: -26, timeDelta: -243 }, // 4:52/37 vs 0:49/11
      // CHANGED (was early, 1:36/15): count 2, 16th occurrence is 9:01/38.
      { icon: "hu-peasant", status: "not-timed", supplyDelta: 1, timeDelta: 247 }, // 4:54/37 vs 9:01/38
      { icon: "hu-scout-tower", status: "early", supplyDelta: -24, timeDelta: -209 }, // 5:02/39 vs 1:33/15 (2nd hu-scout-tower match)
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 5:17/39 – never done
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 5:42/41 – never done
      { icon: "hu-guard-tower", status: "late", supplyDelta: -12, timeDelta: 44 }, // 5:53/43 vs 6:37/31
      { icon: "hu-guard-tower", status: "late", supplyDelta: -9, timeDelta: 155 }, // 6:10/43 vs 8:45/34 (2nd hu-guard-tower match)
      { icon: "nt-upgrade", status: "early", supplyDelta: -20, timeDelta: -128 }, // 6:11/43 vs 4:03/23
      { icon: "hu-footman", status: "missed", supplyDelta: null, timeDelta: null }, // plan 6:22/43 – never done
      { icon: "hu-blacksmith", status: "early", supplyDelta: -22, timeDelta: -157 }, // 6:39/45 vs 4:02/23
      { icon: "hu-farm", status: "early", supplyDelta: -22, timeDelta: -196 }, // 6:42/45 vs 3:26/23 (3rd hu-farm match)
      { icon: "hu-blacksmith", status: "missed", supplyDelta: null, timeDelta: null }, // plan 6:45/45 – never done
      { icon: "hu-scout-tower", status: "early", supplyDelta: -17, timeDelta: -48 }, // 7:03/45 vs 6:15/28 (3rd hu-scout-tower match)
      // This player's hero is a Forsaken Paladin (shows up as the
      // "hu-forsaken-paladin" extra below), not the plan's Paladin.
      { icon: "hu-paladin", status: "missed", supplyDelta: null, timeDelta: null }, // plan 7:14/45 – never done
      { icon: "hu-aviary", status: "missed", supplyDelta: null, timeDelta: null }, // plan 7:18/50 – never done
      { icon: "nt-upgrade", status: "missed", supplyDelta: null, timeDelta: null }, // plan 7:37/50 – never done (only one nt-upgrade order in the actual log)
      // CHANGED (was early, 1:49/16): count 2, 17th occurrence is 9:52/43.
      { icon: "hu-peasant", status: "not-timed", supplyDelta: -7, timeDelta: 133 }, // 7:39/50 vs 9:52/43
      { icon: "hu-scout-tower", status: "early", supplyDelta: -21, timeDelta: -79 }, // 7:42/52 vs 6:23/31 (4th hu-scout-tower match)
      { icon: "hu-guard-tower", status: "late", supplyDelta: -12, timeDelta: 110 }, // 7:51/52 vs 9:41/40 (3rd hu-guard-tower match)
    ]);
  });

  it("every hu-peasant row's count matches its own 'N×' (or lack of one), with no shortfall - the actual log trained far more peasants than this plan ever asked for", () => {
    const { rows } = compareBuild(planSteps, actualSteps);
    const peasantRows = rows.filter((row) => row.plan.icon === "hu-peasant");
    expect(peasantRows).toHaveLength(12);
    expect(peasantRows.map((row) => row.count)).toEqual([2, 1, 2, 1, 1, 1, 2, 2, 1, 2, 2, 2]);
    expect(peasantRows.every((row) => row.shortBy === undefined)).toBe(true);
  });

  it("totals 0 on-plan, 9 early, 11 late, 13 missed, 12 not-timed, first slip at the 2nd row (Build Altar of Kings) - unchanged, since row 0 was already on-plan and a worker row is excluded from firstSlip either way", () => {
    const { summary } = compareBuild(planSteps, actualSteps);
    expect(summary).toEqual({
      total: 33,
      onPlan: 0,
      early: 9,
      late: 11,
      missed: 13,
      notTimed: 12,
      firstSlip: { index: 1, supply: 7, time: "0:07" },
    });
  });

  it("collects the actual icons/instructions this build's plan never mentions, including the two icon-less item purchases as distinct extras", () => {
    const { extras } = compareBuild(planSteps, actualSteps);
    expect(extras).toEqual([
      { icon: "hu-arcane-tower", count: 6, firstTime: "1:14", firstSupply: 14, instruction: "Build Arcane Tower" },
      { icon: "nt-dark-ranger", count: 1, firstTime: "2:15", firstSupply: 17, instruction: "Hero: Dark Ranger" },
      // F010a: these two have no `icon` at all (an untracked item
      // purchase) – grouped/keyed by `instruction` instead, so they don't
      // collapse into a single "Also did" row despite both lacking an icon.
      { count: 1, firstTime: "2:23", firstSupply: 22, instruction: "Buy Circlet of Nobility" },
      { count: 1, firstTime: "5:44", firstSupply: 23, instruction: "Buy Boots of Speed" },
      { icon: "hu-forsaken-paladin", count: 1, firstTime: "5:49", firstSupply: 23, instruction: "Hero: Forsaken Paladin" },
      { icon: "hu-rifleman", count: 5, firstTime: "6:21", firstSupply: 28, instruction: "Train Rifleman" },
    ]);
  });
});

