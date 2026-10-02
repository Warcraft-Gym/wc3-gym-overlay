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
 *  clause - never an em dash.
 *
 *  F010b: when `summary.notTimed > 0` (some matched worker rows were
 *  excluded from every count above, see `planVsActual.ts`'s
 *  `WORKER_ICONS`), a trailing " (workers not timed)" is appended after
 *  everything else - never when `notTimed` is 0, so a build with no worker
 *  steps at all reads exactly as it did before this field existed. */
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
  const joined = parts.join(" · ");
  return summary.notTimed > 0 ? `${joined} (workers not timed)` : joined;
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
 *  with no icon at all (`status: "unmatched-no-icon"`).
 *
 *  F010b: when the row fell short of its own plan step's count (`shortBy`
 *  on `row`, set by `compareBuild` for a step like "Train 2× Peasant" that
 *  found fewer occurrences than it asked for), " · 1 of 2" is appended -
 *  the first number is how many were actually found (`count - shortBy`).
 *  Never appended for a fully missed row (`row.actual` is `null` there -
 *  nothing to put the count "next to"). */
export function formatActual(row: ComparisonRow): string {
  if (row.status === "unmatched-no-icon") return "No icon to match";
  if (!row.actual) return "Not done";
  const base = `${row.actual.time} · ${row.actual.supply} supply`;
  if (row.shortBy && row.count !== undefined) return `${base} · ${row.count - row.shortBy} of ${row.count}`;
  return base;
}

/** Signed delta label - time governs when the plan step has one (matching
 *  `rowStatus`'s own precedence), falling back to supply, "Not done" for a
 *  miss, "No icon to match" for an unmatched-no-icon row, "–" (en dash) for
 *  a `"not-timed"` worker row (F010b - a worker's own order is never judged
 *  early/late, see `planVsActual.ts`'s `WORKER_ICONS`), or "On plan" when
 *  the row matched but had nothing measurable to diff (no time or supply on
 *  the plan step at all). */
export function formatDelta(row: ComparisonRow): string {
  if (row.status === "unmatched-no-icon") return "No icon to match";
  if (row.status === "missed") return "Not done";
  if (row.status === "not-timed") return "–";
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
  // F010b: a matched worker row (WORKER_ICONS) - not early/late/on-plan,
  // just not judged on timing at all.
  "not-timed": "Not timed",
};

/**
 * Status -> design token classes for the chip. Reuses existing tokens only
 * (no new colour values), picked for a distinct, already-meaningful hue per
 * status:
 *  - on-plan: `difficulty-beginner` (green, #68c040) - F010a (follow-up of
 *    F010): this used to be `win` (#4F95D8, a medium blue), which sits far
 *    too close to `early`'s `arcane` (also a medium blue, oklch 70% 0.14
 *    245 - roughly the same lightness/chroma as `win`, ~20deg apart in
 *    hue) to read as a different status at a glance, especially for anyone
 *    with a blue/blue confusion. `difficulty-beginner` is the app's only
 *    other "this is good" token and is a clearly different hue (green)
 *    from `early` (blue), `late` (amber) and `missed` (red) - hitting the
 *    plan is a small win, same as a beginner-friendly build being an easy
 *    one.
 *  - early: `arcane` (the secondary Lordaeron-blue accent, otherwise
 *    unused outside decoration) - a deviation, but not a bad one; a
 *    distinct hue from `on-plan` (now green, was the too-similar `win`)
 *    and `loss` keeps it from reading as either.
 *  - late: `difficulty-intermediate` (amber) - the same "pay attention"
 *    amber the difficulty scale already uses for its middle step; a build
 *    running behind is a caution, not yet a failure.
 *  - missed: `loss` (red) - the build called for it and it never happened;
 *    the same semantic the rest of the app uses for "this went badly".
 *  - unmatched-no-icon: `faint`/`line` (neutral) - not a deviation at all,
 *    just a plan step this build can't even compare (no icon to match).
 *  - not-timed (F010b): the same neutral `faint`/`line` token as
 *    unmatched-no-icon - reusing it rather than adding a colour, since this
 *    is the same kind of "not a deviation" case: a matched worker row,
 *    just one this view doesn't judge for timing (see `WORKER_ICONS`,
 *    `planVsActual.ts`).
 *
 * Text labels (`STATUS_LABEL` above) are unchanged - colour is never the
 * only signal.
 */
export const STATUS_CLASS: Record<ComparisonStatus, string> = {
  "on-plan": "border-difficulty-beginner/50 bg-difficulty-beginner/10 text-difficulty-beginner",
  early: "border-arcane/50 bg-arcane/10 text-arcane",
  late: "border-difficulty-intermediate/50 bg-difficulty-intermediate/10 text-difficulty-intermediate",
  missed: "border-loss/50 bg-loss/10 text-loss",
  "unmatched-no-icon": "border-line text-faint",
  "not-timed": "border-line text-faint",
};
