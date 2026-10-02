/**
 * F009 (plan-vs-actual-engine) – the persisted shape of a post-game review
 * (`store/keys.ts`'s `LAST_REVIEW`), plus the zod schema that validates it.
 * Mirrors `lib/planVsActual.ts`'s `ComparisonResult` structurally (kept as
 * its own schema, not a derived one, matching this codebase's existing
 * convention of zod schemas living apart from the pure logic they validate
 * – e.g. `api/schema.ts`'s `apiBuildStepSchema` vs `lib/filterBuilds.ts`).
 */

import { z } from "zod";
import { apiBuildStepSchema, raceSchema } from "../api/schema";
import { replayImportStepSchema } from "../api/replayImport";

// --- comparison (mirrors lib/planVsActual.ts's ComparisonResult) ---------

const comparisonStatusSchema = z.enum(["on-plan", "early", "late", "missed", "unmatched-no-icon"]);

const comparisonActualSchema = z.object({ time: z.string(), supply: z.number() });

const comparisonRowSchema = z.object({
  index: z.number(),
  plan: apiBuildStepSchema,
  actual: comparisonActualSchema.nullable(),
  supplyDelta: z.number().nullable(),
  timeDelta: z.number().nullable(),
  status: comparisonStatusSchema,
});

const extraGroupSchema = z.object({
  // F010a: absent for an actual occurrence whose wire step had no `icon`
  // at all (an untracked item purchase) – see `lib/planVsActual.ts`'s
  // `ExtraGroup`.
  icon: z.string().optional(),
  count: z.number(),
  firstTime: z.string(),
  firstSupply: z.number(),
  instruction: z.string(),
});

const firstSlipSchema = z.object({
  index: z.number(),
  supply: z.number().nullable(),
  time: z.string().nullable(),
});

const comparisonSummarySchema = z.object({
  total: z.number(),
  onPlan: z.number(),
  early: z.number(),
  late: z.number(),
  missed: z.number(),
  firstSlip: firstSlipSchema.nullable(),
});

export const comparisonResultSchema = z.object({
  rows: z.array(comparisonRowSchema),
  extras: z.array(extraGroupSchema),
  summary: comparisonSummarySchema,
});

// --- review ----------------------------------------------------------------

/** One player's steps as captured at import time – stored for every
 *  player (not just "me"), so `resolveReview` can recompute "which one is
 *  you" later purely from what's already on disk, without re-importing. */
export const reviewPlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  race: z.string(),
  steps: z.array(replayImportStepSchema),
});

export const reviewPlanSchema = z.object({
  slug: z.string(),
  title: z.string(),
  race: raceSchema,
  steps: z.array(apiBuildStepSchema),
});

export const meStatusSchema = z.enum(["resolved", "unresolved", "not-1v1"]);

export const reviewSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: z.object({ path: z.string(), mtimeMs: z.number() }),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  map: z.string(),
  duration: z.string(),
  players: z.array(reviewPlayerSchema),
  meId: z.number().nullable(),
  meStatus: meStatusSchema,
  plan: reviewPlanSchema.nullable(),
  comparison: comparisonResultSchema.nullable(),
  seen: z.boolean(),
  /** F010 (review-ui): true when this review came from "Review a replay
   *  file..." (`importReviewBytes`, `reviews/pipeline.ts`) rather than a
   *  real auto-detected pickup. `source.path` is just the chosen file's own
   *  name in that case, not a real filesystem path, so the review view's
   *  Retry action re-opens the file dialog instead of calling
   *  `retryReview()` (there is nothing to re-read by path). Optional so a
   *  review persisted before this field existed still parses, defaulting to
   *  `false` (an auto-detected review). */
  manual: z.boolean().optional(),
});

export type ComparisonResultDto = z.infer<typeof comparisonResultSchema>;
export type ReviewPlayer = z.infer<typeof reviewPlayerSchema>;
export type ReviewPlan = z.infer<typeof reviewPlanSchema>;
export type MeStatus = z.infer<typeof meStatusSchema>;
export type Review = z.infer<typeof reviewSchema>;
