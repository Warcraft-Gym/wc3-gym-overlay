/**
 * F010 (review-ui) - pure formatting helpers for the post-game review view.
 */
import { describe, expect, it } from "vitest";
import type { ComparisonRow, ComparisonSummary } from "./planVsActual";
import { formatActual, formatComparisonSummary, formatDelta, formatPlanTarget, STATUS_CLASS, STATUS_LABEL } from "./reviewSummary";

function summary(overrides: Partial<ComparisonSummary> = {}): ComparisonSummary {
  return { total: 21, onPlan: 7, early: 5, late: 3, missed: 6, notTimed: 0, firstSlip: null, ...overrides };
}

describe("formatComparisonSummary", () => {
  it("joins every clause with a middle dot, never an em dash", () => {
    const text = formatComparisonSummary(summary({ firstSlip: { index: 5, supply: 7, time: "0:33" } }));
    expect(text).toBe("7/21 on plan · 5 early · 3 late · 6 missed · first slip at 0:33");
    // U+2014 is an em dash; none of this view's copy ever uses one.
    expect(text.split("").some((ch) => ch.codePointAt(0) === 0x2014)).toBe(false);
  });

  it("uses the slipped step's time when it has one, not its supply", () => {
    const text = formatComparisonSummary(summary({ firstSlip: { index: 2, supply: 9, time: "1:02" } }));
    expect(text).toContain("first slip at 1:02");
    expect(text).not.toContain("9 supply");
  });

  it("falls back to supply when the slipped step has no time", () => {
    const text = formatComparisonSummary(summary({ firstSlip: { index: 2, supply: 9, time: null } }));
    expect(text).toContain("first slip at 9 supply");
  });

  it("omits the slip clause entirely when every row is on plan", () => {
    const text = formatComparisonSummary(summary({ total: 3, onPlan: 3, early: 0, late: 0, missed: 0, firstSlip: null }));
    expect(text).toBe("3/3 on plan · 0 early · 0 late · 0 missed");
  });

  // F010b: worker rows (`notTimed`).
  it("appends '(workers not timed)' when notTimed > 0", () => {
    const text = formatComparisonSummary(
      summary({ total: 24, onPlan: 12, early: 6, late: 4, missed: 2, notTimed: 6, firstSlip: { index: 4, supply: null, time: "0:47" } }),
    );
    expect(text).toBe("12/24 on plan · 6 early · 4 late · 2 missed · first slip at 0:47 (workers not timed)");
  });

  it("omits the worker suffix entirely when notTimed is 0", () => {
    const text = formatComparisonSummary(summary({ notTimed: 0, firstSlip: { index: 4, supply: null, time: "0:47" } }));
    expect(text).not.toContain("workers not timed");
  });

  it("appends the worker suffix even when every judged row is on plan (no firstSlip clause to attach after)", () => {
    const text = formatComparisonSummary(summary({ total: 3, onPlan: 3, early: 0, late: 0, missed: 0, notTimed: 2, firstSlip: null }));
    expect(text).toBe("3/3 on plan · 0 early · 0 late · 0 missed (workers not timed)");
  });
});

function row(overrides: Partial<ComparisonRow> = {}): ComparisonRow {
  return {
    index: 0,
    plan: { time: "0:30", supply: 7, instruction: "Build Barracks", icon: "or-barracks" },
    actual: { time: "0:41", supply: 8 },
    supplyDelta: 1,
    timeDelta: 11,
    status: "late",
    ...overrides,
  };
}

describe("formatPlanTarget", () => {
  it("combines time and supply when both are set", () => {
    expect(formatPlanTarget(row())).toBe("0:30 · 7 supply");
  });

  it("falls back to 'No target' when the plan step has neither", () => {
    expect(formatPlanTarget(row({ plan: { instruction: "Scout" } }))).toBe("No target");
  });
});

describe("formatActual", () => {
  it("renders the actual time and supply when matched", () => {
    expect(formatActual(row())).toBe("0:41 · 8 supply");
  });

  it("renders 'Not done' for a missed row", () => {
    expect(formatActual(row({ status: "missed", actual: null }))).toBe("Not done");
  });

  it("renders 'No icon to match' for an unmatched-no-icon row", () => {
    expect(formatActual(row({ status: "unmatched-no-icon", actual: null }))).toBe("No icon to match");
  });

  it("renders the actual time/supply for a not-timed (worker) row, same as any matched row", () => {
    expect(formatActual(row({ status: "not-timed", plan: { instruction: "Train Peasant", icon: "hu-peasant" } }))).toBe("0:41 · 8 supply");
  });

  // F010b: shortBy > 0 appends "<found> of <count>" next to the actual.
  it("appends 'N of M' when the row fell short of its own plan step's count", () => {
    expect(formatActual(row({ count: 2, shortBy: 1 }))).toBe("0:41 · 8 supply · 1 of 2");
  });

  it("does not append anything when shortBy is 0/undefined, even with a count set", () => {
    expect(formatActual(row({ count: 2, shortBy: undefined }))).toBe("0:41 · 8 supply");
  });

  it("never appends 'N of M' for a missed row - there is no actual to put it next to", () => {
    expect(formatActual(row({ status: "missed", actual: null, count: 2, shortBy: 2 }))).toBe("Not done");
  });
});

describe("formatDelta", () => {
  it("signs a positive time delta", () => {
    expect(formatDelta(row({ timeDelta: 11 }))).toBe("+11 s");
  });

  it("signs a negative time delta", () => {
    expect(formatDelta(row({ status: "early", timeDelta: -8 }))).toBe("-8 s");
  });

  it("falls back to supply when the plan step has no time", () => {
    expect(formatDelta(row({ timeDelta: null, supplyDelta: 2 }))).toBe("+2 supply");
  });

  it("renders 'Not done' for a missed row", () => {
    expect(formatDelta(row({ status: "missed", actual: null, timeDelta: null, supplyDelta: null }))).toBe("Not done");
  });

  // F010b: a worker row's delta cell never shows a number, even though
  // timeDelta/supplyDelta were computed - "–" (en dash), not an em dash.
  it("renders '–' for a not-timed (worker) row, ignoring any computed delta", () => {
    expect(formatDelta(row({ status: "not-timed", timeDelta: -8, supplyDelta: 1 }))).toBe("–");
  });
});

describe("STATUS_LABEL / STATUS_CLASS - not-timed (F010b)", () => {
  it("has a 'Not timed' label", () => {
    expect(STATUS_LABEL["not-timed"]).toBe("Not timed");
  });

  it("reuses an existing neutral token, not a new colour", () => {
    expect(STATUS_CLASS["not-timed"]).toBe(STATUS_CLASS["unmatched-no-icon"]);
  });
});
