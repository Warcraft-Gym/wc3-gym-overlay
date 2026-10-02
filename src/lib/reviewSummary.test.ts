/**
 * F010 (review-ui) - pure formatting helpers for the post-game review view.
 */
import { describe, expect, it } from "vitest";
import type { ComparisonRow, ComparisonSummary } from "./planVsActual";
import { formatActual, formatComparisonSummary, formatDelta, formatPlanTarget } from "./reviewSummary";

function summary(overrides: Partial<ComparisonSummary> = {}): ComparisonSummary {
  return { total: 21, onPlan: 7, early: 5, late: 3, missed: 6, firstSlip: null, ...overrides };
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
});
