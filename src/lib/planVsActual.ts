/**
 * F009 (plan-vs-actual-engine) – pure comparison between a build's plan
 * steps (`ApiBuildStep`, from `api/schema.ts` – the same shape for site
 * builds and local builds, see `store/keys.ts`'s `localBuildSchema`) and a
 * replay import's actual steps (`ReplayImportStep`, from
 * `api/replayImport.ts`). No React, no I/O – the pipeline that wires this
 * up to a real replay (`src/reviews/pipeline.ts`) is the only caller that
 * touches the network or the store.
 *
 * Matching is by icon key, independently per icon: the k-th occurrence of
 * an icon in the plan matches the k-th occurrence of that icon in the
 * actual log (`matchOccurrencesByIcon`/`expandActualSteps` below) – not a
 * single running index across the whole build. That's what makes the
 * comparison order-tolerant: a build that trains two Grunts then a Peon
 * compares the same as one that trains the Peon first, instead of a
 * reordering cascading into every later step reading as "missed".
 *
 * `pickMe` (the second half of this module) is a separate, unrelated pure
 * judgment – given a replay's player list, which one is "you" – kept here
 * rather than its own file because both are tiny, both are pure, and both
 * only make sense together (there is no review without a build comparison
 * *and* knowing who you are in it).
 *
 * F010a: an actual step can have no `icon` at all (an item purchase the
 * icon catalogue doesn't cover, see `replayImportStepSchema`'s doc
 * comment) – it never has anything to match by icon, so every such
 * occurrence always ends up in `extras`, grouped by `instruction` instead
 * of icon (see `compareBuild` below).
 */

import type { ApiBuildStep } from "../api/schema";
import type { ReplayImportStep } from "../api/replayImport";

// --- compareBuild ------------------------------------------------------

/** Within this many supply apart (inclusive), a step with no `time` on the
 *  plan counts as "on plan" rather than early/late. */
export const ON_PLAN_SUPPLY_TOLERANCE = 1;

/** Within this many seconds apart (inclusive), a step with a `time` on the
 *  plan counts as "on plan" rather than early/late. */
export const ON_PLAN_TIME_TOLERANCE_SECONDS = 10;

export type ComparisonStatus = "on-plan" | "early" | "late" | "missed" | "unmatched-no-icon";

export type ComparisonActual = { time: string; supply: number };

export type ComparisonRow = {
  /** Index into the plan's own step array – stable identity for a row
   *  regardless of icon grouping, and what `summary.firstSlip.index`
   *  points back into. */
  index: number;
  plan: ApiBuildStep;
  actual: ComparisonActual | null;
  /** `actual.supply - plan.supply`, only when both sides have a `supply`. */
  supplyDelta: number | null;
  /** `actual.time - plan.time` in seconds, only when the plan step has a
   *  `time` (actual steps always have one). */
  timeDelta: number | null;
  status: ComparisonStatus;
};

export type ExtraGroup = {
  /** Absent for an actual occurrence whose wire step had no `icon` at all
   *  (an item purchase not in the icon catalogue, under `includeItems` –
   *  see `expandActualSteps`) – never matched to a plan step, grouped by
   *  `instruction` instead so distinct untracked items don't collapse into
   *  one "Also did" row. */
  icon?: string;
  count: number;
  firstTime: string;
  firstSupply: number;
  instruction: string;
};

export type FirstSlip = { index: number; supply: number | null; time: string | null };

export type ComparisonSummary = {
  total: number;
  onPlan: number;
  early: number;
  late: number;
  missed: number;
  /** The earliest row (in plan order) whose status isn't `"on-plan"`
   *  (`"unmatched-no-icon"` rows are excluded – there is nothing to be
   *  early/late/missed about when the plan step itself can't be matched),
   *  or `null` when every row is on plan. */
  firstSlip: FirstSlip | null;
};

export type ComparisonResult = {
  rows: ComparisonRow[];
  extras: ExtraGroup[];
  summary: ComparisonSummary;
};

/** Parses a `"m:ss"` time string into whole seconds. Returns `null` for
 *  anything that doesn't match – callers only ever feed this validated
 *  `time` strings, but staying defensive here means a single malformed
 *  value degrades to "can't tell", not a thrown exception for the whole
 *  comparison. */
function parseTimeSeconds(time: string): number | null {
  const match = /^(\d+):(\d{2})$/.exec(time);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

/** Parses the `"N×"` unit count off the front of an actual step's
 *  instruction (e.g. `"Train 4× Peon"` → `4`). Defaults to `1` when there
 *  is no count prefix (e.g. `"Build Altar of Storms"`). */
export function parseStepCount(instruction: string): number {
  // Not anchored to the start: the verified shape is `"Train 2× Peon"` –
  // the count sits after the verb, not at the front of the string.
  const match = /(\d+)\s*[×x]\s*/i.exec(instruction);
  if (!match) return 1;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

type ExpandedActual = {
  /** Absent for an item step the icon catalogue doesn't cover (see
   *  `replayImportStepSchema`'s doc comment, `api/replayImport.ts`) – such
   *  an occurrence can never be looked up by a plan step's icon (always a
   *  real string when matching is attempted, see `compareBuild`'s `!plan.icon`
   *  guard), so it always ends up in `extras` below. */
  icon?: string;
  time: string;
  supply: number;
  instruction: string;
};

/** Expands every actual step by its `N×` count into single occurrences
 *  that all keep the original step's `time`/`supply`/`instruction` – a
 *  replay log only ever records one timestamp per order, even when it
 *  trained several units at once. Order is preserved (occurrences of a
 *  multi-unit step are adjacent, in the original step's position). */
export function expandActualSteps(steps: ReplayImportStep[]): ExpandedActual[] {
  const expanded: ExpandedActual[] = [];
  for (const step of steps) {
    const count = parseStepCount(step.instruction);
    for (let i = 0; i < count; i++) {
      expanded.push({ icon: step.icon, time: step.time, supply: step.supply, instruction: step.instruction });
    }
  }
  return expanded;
}

/** Groups expanded actual occurrences by icon, preserving the chronological
 *  order within each icon's bucket – what `compareBuild` looks up the k-th
 *  occurrence from. Occurrences with no icon at all are dropped here (they
 *  can never be the k-th occurrence of a plan step's icon – a plan step
 *  only ever looks itself up by a real icon string, see `compareBuild`);
 *  they still flow into `extras` via the full (unfiltered) occurrence list
 *  there. */
function groupByIcon(expanded: ExpandedActual[]): Map<string, ExpandedActual[]> {
  const groups = new Map<string, ExpandedActual[]>();
  for (const occurrence of expanded) {
    if (!occurrence.icon) continue;
    const bucket = groups.get(occurrence.icon);
    if (bucket) bucket.push(occurrence);
    else groups.set(occurrence.icon, [occurrence]);
  }
  return groups;
}

function rowStatus(plan: ApiBuildStep, timeDelta: number | null, supplyDelta: number | null): ComparisonStatus {
  if (plan.time !== undefined) {
    // Time governs when the plan step has one – even if `timeDelta` itself
    // couldn't be computed (a malformed `plan.time`), fall through to
    // "on-plan" rather than mis-reporting a real miss as early/late.
    if (timeDelta === null) return "on-plan";
    if (Math.abs(timeDelta) <= ON_PLAN_TIME_TOLERANCE_SECONDS) return "on-plan";
    return timeDelta < 0 ? "early" : "late";
  }
  if (plan.supply !== undefined) {
    if (supplyDelta === null) return "on-plan";
    if (Math.abs(supplyDelta) <= ON_PLAN_SUPPLY_TOLERANCE) return "on-plan";
    return supplyDelta < 0 ? "early" : "late";
  }
  // Neither a time nor a supply to compare against – there is nothing to
  // call a deviation, so this never reports as a slip.
  return "on-plan";
}

/** Compares a build's plan steps against a replay's actual steps – see
 *  this module's doc comment for the matching rule. Never mutates either
 *  input array. */
export function compareBuild(planSteps: ApiBuildStep[], actualSteps: ReplayImportStep[]): ComparisonResult {
  const actualByIcon = groupByIcon(expandActualSteps(actualSteps));
  const consumedByIcon = new Map<string, number>();
  const matchedIcons = new Set<string>();

  const rows: ComparisonRow[] = planSteps.map((plan, index) => {
    if (!plan.icon) {
      return { index, plan, actual: null, supplyDelta: null, timeDelta: null, status: "unmatched-no-icon" };
    }

    matchedIcons.add(plan.icon);
    const occurrences = actualByIcon.get(plan.icon) ?? [];
    const consumed = consumedByIcon.get(plan.icon) ?? 0;
    consumedByIcon.set(plan.icon, consumed + 1);
    const match = occurrences[consumed];

    if (!match) {
      return { index, plan, actual: null, supplyDelta: null, timeDelta: null, status: "missed" };
    }

    const actual: ComparisonActual = { time: match.time, supply: match.supply };
    const supplyDelta = plan.supply !== undefined ? actual.supply - plan.supply : null;
    const planTimeSeconds = plan.time !== undefined ? parseTimeSeconds(plan.time) : null;
    const actualTimeSeconds = parseTimeSeconds(actual.time);
    const timeDelta =
      plan.time !== undefined && planTimeSeconds !== null && actualTimeSeconds !== null
        ? actualTimeSeconds - planTimeSeconds
        : null;

    return { index, plan, actual, supplyDelta, timeDelta, status: rowStatus(plan, timeDelta, supplyDelta) };
  });

  // Extras: actual occurrences whose icon never appears anywhere in the
  // plan at all (an icon that *is* in the plan, but appeared more times in
  // the actual log than the plan asked for, is simply left unmatched above
  // – not surfaced as an extra; see the module doc comment), plus every
  // occurrence with no icon at all (never matchable – see `groupByIcon`).
  // Grouped by icon when there is one, else by `instruction` – an icon-less
  // occurrence is never deduped against another icon-less occurrence of a
  // *different* item (e.g. "Buy Boots of Speed" vs "Buy Rod of
  // Necromancy") just because neither has an icon.
  const extras: ExtraGroup[] = [];
  const extraByKey = new Map<string, ExtraGroup>();
  for (const occurrence of expandActualSteps(actualSteps)) {
    if (occurrence.icon && matchedIcons.has(occurrence.icon)) continue;
    const key = occurrence.icon ?? occurrence.instruction;
    const existing = extraByKey.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const group: ExtraGroup = {
      icon: occurrence.icon,
      count: 1,
      firstTime: occurrence.time,
      firstSupply: occurrence.supply,
      instruction: occurrence.instruction,
    };
    extraByKey.set(key, group);
    extras.push(group);
  }

  let onPlan = 0;
  let early = 0;
  let late = 0;
  let missed = 0;
  let firstSlip: FirstSlip | null = null;
  for (const row of rows) {
    switch (row.status) {
      case "on-plan":
        onPlan += 1;
        break;
      case "early":
        early += 1;
        break;
      case "late":
        late += 1;
        break;
      case "missed":
        missed += 1;
        break;
      default:
        break;
    }
    if (firstSlip === null && (row.status === "early" || row.status === "late" || row.status === "missed")) {
      firstSlip = { index: row.index, supply: row.plan.supply ?? null, time: row.plan.time ?? null };
    }
  }

  return { rows, extras, summary: { total: rows.length, onPlan, early, late, missed, firstSlip } };
}

// --- pickMe --------------------------------------------------------------

/** The minimal player shape `pickMe` needs – satisfied by both
 *  `ReplayImportPlayer` (`api/replayImport.ts`) and a stored review's own
 *  `players` entries (`reviews/types.ts`), so `resolveReview` can call it
 *  again later without re-importing. */
export type PickMePlayer = { id: number; name: string; race: string };

export type PickMeResult =
  | { kind: "resolved"; player: PickMePlayer }
  | { kind: "unresolved" }
  | { kind: "not-1v1" };

export type PickMeOptions = {
  /** Settings' `myBattleTag` (e.g. `"Name#1234"`), or `null`/empty if unset. */
  myBattleTag?: string | null;
  /** The selected build's race, used as the fallback signal when no
   *  BattleTag match is found. `undefined`/`null` when no build is
   *  selected. */
  planRace?: string | null;
};

function namePart(name: string): string {
  const hashIndex = name.indexOf("#");
  return hashIndex === -1 ? name : name.slice(0, hashIndex);
}

function matchesBattleTag(player: PickMePlayer, myBattleTag: string): boolean {
  const wanted = myBattleTag.toLowerCase();
  if (myBattleTag.includes("#")) return player.name.toLowerCase() === wanted;
  return namePart(player.name).toLowerCase() === wanted;
}

/**
 * Picks "you" out of a replay's player list:
 * 1. Not a 1v1 (`players.length !== 2`) → `{ kind: "not-1v1" }` – a review
 *    only makes sense head-to-head, and matching below assumes exactly two
 *    players.
 * 2. A case-insensitive match on `myBattleTag` against the full
 *    `"Name#1234"` (or just the name part, when `myBattleTag` has no `#`)
 *    → that player.
 * 3. Else, exactly one player's `race` equals `planRace` → that player.
 * 4. Else → `{ kind: "unresolved" }`.
 */
export function pickMe(players: PickMePlayer[], options: PickMeOptions = {}): PickMeResult {
  if (players.length !== 2) return { kind: "not-1v1" };

  const { myBattleTag, planRace } = options;
  if (myBattleTag) {
    const tagMatch = players.find((player) => matchesBattleTag(player, myBattleTag));
    if (tagMatch) return { kind: "resolved", player: tagMatch };
  }

  if (planRace) {
    const raceMatches = players.filter((player) => player.race === planRace);
    if (raceMatches.length === 1) return { kind: "resolved", player: raceMatches[0] };
  }

  return { kind: "unresolved" };
}
