/**
 * F010 (review-ui) - pure text formatting for the post-game review view
 * (`pages/picker/review/ReviewModal.tsx`). No React, no I/O - same split as
 * `lib/planVsActual.ts` (pure comparison logic) vs. the pipeline that wires
 * it up to the store.
 */

import type { ComparisonRow, ComparisonStatus, ComparisonSummary } from "./planVsActual";

/** "14/21 on plan · 3 early · 2 late · 2 missed · first slip at 22 supply" -
 *  the slip reads the plan step's own time when it has one (matching
 *  `compareBuild`'s own rule for what a step is measured against - see
 *  `rowStatus` in `planVsActual.ts`), falling back to supply, and is
 *  omitted entirely when every row is on plan. A middle dot joins every
 *  clause - never an em dash. */
export function formatComparisonSummary(summary: ComparisonSummary): string {
  const parts = [
    `${summary.onPlan}/${summary.total} on plan`,
    `${summary.early} early`,
    `${summary.late} late`,
    `${summary.missed} missed`,
  ];
  if (summary.firstSlip) {
    const at = summary.firstSlip.time ?? (summary.firstSlip.supply !== null ? `${summary.firstSlip.supply} supply` : null);
    if (at) parts.push(`first slip at ${at}`);
  }
  return parts.join(" · ");
}

/** Human label for a plan step's own target - "0:32", "7 supply",
 *  "0:32 · 7 supply" when the step carries both, or "No target" when it
 *  carries neither (so there is nothing for `compareBuild` to measure a
 *  deviation against - see `rowStatus`). */
export function formatPlanTarget(row: ComparisonRow): string {
  const parts: string[] = [];
  if (row.plan.time !== undefined) parts.push(row.plan.time);
  if (row.plan.supply !== undefined) parts.push(`${row.plan.supply} supply`);
  return parts.length > 0 ? parts.join(" · ") : "No target";
}

/** Human label for what actually happened for a row - "0:41 · 8 supply",
 *  "Not done" for a missed step, or "No icon to match" for a plan step
 *  with no icon at all (`status: "unmatched-no-icon"`). */
export function formatActual(row: ComparisonRow): string {
  if (row.status === "unmatched-no-icon") return "No icon to match";
  if (!row.actual) return "Not done";
  return `${row.actual.time} · ${row.actual.supply} supply`;
}

/** Signed delta label - time governs when the plan step has one (matching
 *  `rowStatus`'s own precedence), falling back to supply, "Not done" for a
 *  miss, "No icon to match" for an unmatched-no-icon row, or "On plan" when
 *  the row matched but had nothing measurable to diff (no time or supply on
 *  the plan step at all). */
export function formatDelta(row: ComparisonRow): string {
  if (row.status === "unmatched-no-icon") return "No icon to match";
  if (row.status === "missed") return "Not done";
  if (row.timeDelta !== null) return `${row.timeDelta >= 0 ? "+" : ""}${row.timeDelta} s`;
  if (row.supplyDelta !== null) return `${row.supplyDelta >= 0 ? "+" : ""}${row.supplyDelta} supply`;
  return "On plan";
}

/** Accessible text label for a row's status chip - never color alone. */
export const STATUS_LABEL: Record<ComparisonStatus, string> = {
  "on-plan": "On plan",
  early: "Early",
  late: "Late",
  missed: "Missed",
  "unmatched-no-icon": "Not tracked",
};

/**
 * Status -> design token classes for the chip. Reuses existing tokens only
 * (no new colour values), picked for a distinct, already-meaningful hue per
 * status:
 *  - on-plan: `win` (the same blue the rest of the app already uses for a
 *    good result) - hitting the plan is a small win.
 *  - early: `arcane` (the secondary Lordaeron-blue accent, otherwise
 *    unused outside decoration) - a deviation, but not a bad one; a
 *    distinct hue from `win` and `loss` keeps it from reading as either.
 *  - late: `difficulty-intermediate` (amber) - the same "pay attention"
 *    amber the difficulty scale already uses for its middle step; a build
 *    running behind is a caution, not yet a failure.
 *  - missed: `loss` (red) - the build called for it and it never happened;
 *    the same semantic the rest of the app uses for "this went badly".
 *  - unmatched-no-icon: `faint`/`line` (neutral) - not a deviation at all,
 *    just a plan step this build can't even compare (no icon to match).
 */
export const STATUS_CLASS: Record<ComparisonStatus, string> = {
  "on-plan": "border-win/50 bg-win/10 text-win",
  early: "border-arcane/50 bg-arcane/10 text-arcane",
  late: "border-difficulty-intermediate/50 bg-difficulty-intermediate/10 text-difficulty-intermediate",
  missed: "border-loss/50 bg-loss/10 text-loss",
  "unmatched-no-icon": "border-line text-faint",
};
