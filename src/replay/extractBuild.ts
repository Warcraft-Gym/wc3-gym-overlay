import type { EditorFormInput } from "../lib/buildEditorSchema";
import { describeId } from "./idMap";
import { FOOD_COST } from "./foodCost";
import { TRAIN_TIME_S } from "./gameData";
import type {
  ExtractBuildOptions,
  ImportedBuildStep,
  ImportedStepMeta,
  ReplayEvent,
  ReplayPlayer,
  ReplayRace,
  ReplaySummary,
} from "./types";

/**
 * Turns a parsed replay + a chosen player into a private-build-editor-ready
 * draft. Returns `EditorFormInput` (not a bespoke "draft" shape) so the
 * result drops straight into `buildEditorSchema`'s `editorFormSchema` —
 * see the feature spec's scope item 5 ("clamp to buildEditorSchema limits
 * so `buildEditorSchema.safeParse(draft).success` is true"). The fields the
 * spec's own sketch of the draft type doesn't cover (`author`, `patch`,
 * `authorDiscord`, `sourceUrl`, `description`) get sane placeholders here;
 * F002's editor UI lets the user fill them in before saving, exactly like
 * any other freshly-created private build.
 */

const DEFAULT_CUTOFF_MS = 480_000;
const START_SUPPLY = 5;
const MAX_SUPPLY = 100;
const MERGE_WINDOW_MS = 10_000;
const DEDUPE_WINDOW_MS = 2_000;

const RACE_LABELS: Record<ReplayRace, string> = {
  human: "Human",
  orc: "Orc",
  nightelf: "Night Elf",
  undead: "Undead",
  random: "Random",
};

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** A player's race for display purposes: prefers the *detected* race (from
 *  their actual builds) and only falls back to the lobby-selected race when
 *  nothing was detected yet (e.g. a very short/aborted game). */
function effectiveRace(player: ReplayPlayer): ReplayRace {
  return player.raceDetected !== "random" ? player.raceDetected : player.race;
}

function instructionFor(kind: ReplayEvent["kind"], title: string, count: number): string {
  switch (kind) {
    case "unit":
      return count >= 2 ? `Train ${count}× ${title}` : `Train ${title}`;
    case "building":
      return `Build ${title}`;
    case "hero":
      return `Hero: ${title}`;
    case "upgrade":
      return `Research ${title}`;
    case "item":
      return `Buy ${title}`;
    case "cancel":
      // Never reaches a rendered step — `dedupeAndMerge` only ever builds
      // "cancel"-kind groups from already-filtered-out cancel events (see
      // `applyCancelsOption`'s caller). Exhaustiveness only.
      return "";
  }
}

type MergedStep = {
  kind: ReplayEvent["kind"];
  id: string;
  ms: number;
  lastMs: number;
  count: number;
  ordered: number;
  cancelled: number;
};

/** Belt-and-braces cap on top of the merge window itself: a 6th consecutive
 *  same-id unit order always starts a new group, even if it still lands
 *  inside `MERGE_WINDOW_MS` of the group's first order. */
const MAX_MERGE_COUNT = 5;

/**
 * F001: computes, for every cancellable (`"unit"` | `"hero"`) order in
 * `events`, the ms at which it would finish training — a simple per-id FIFO
 * (F002 replaces this with real per-producer queues): an order's finish
 * time is `orderMs + position * TRAIN_TIME_S[id] * 1000`, where `position`
 * is 1 for the first still-pending order of that id ahead of it (inclusive
 * of itself) and increments for every earlier same-id order that hadn't
 * finished yet when this one was placed. Ids with no known train time are
 * always pending (`Infinity`).
 */
function computeFinishTimes(cancellableEvents: readonly ReplayEvent[]): Map<ReplayEvent, number> {
  const finishByOrder = new Map<ReplayEvent, number>();
  const ordersById = new Map<string, ReplayEvent[]>();
  for (const order of cancellableEvents) {
    const list = ordersById.get(order.id);
    if (list) list.push(order);
    else ordersById.set(order.id, [order]);
  }

  for (const [id, orders] of ordersById) {
    const trainS = TRAIN_TIME_S[id];
    const pendingFinishMs: number[] = [];
    for (const order of orders) {
      while (pendingFinishMs.length > 0 && pendingFinishMs[0]! <= order.ms) pendingFinishMs.shift();
      const position = pendingFinishMs.length + 1;
      const finishMs = trainS === undefined ? Infinity : order.ms + position * trainS * 1000;
      pendingFinishMs.push(finishMs);
      pendingFinishMs.sort((a, b) => a - b);
      finishByOrder.set(order, finishMs);
    }
  }
  return finishByOrder;
}

/**
 * F001: for every `"cancel"` event (processed oldest-first), finds the most
 * recent still-pending `"unit"`/`"hero"` order of the same id placed before
 * the cancel and marks it removed. "Still pending" per `computeFinishTimes`
 * — an order that already finished training is never removed, and a cancel
 * with no matching pending order is ignored (never throws). Returns the set
 * of removed order objects (matched by reference).
 */
function computeCancelledOrders(sortedEvents: readonly ReplayEvent[]): ReadonlySet<ReplayEvent> {
  const cancellable = sortedEvents.filter((e) => e.kind === "unit" || e.kind === "hero");
  const cancels = sortedEvents.filter((e) => e.kind === "cancel").slice().sort((a, b) => a.ms - b.ms);
  if (cancels.length === 0) return new Set();

  const finishByOrder = computeFinishTimes(cancellable);
  const removed = new Set<ReplayEvent>();

  for (const cancel of cancels) {
    let candidate: ReplayEvent | undefined;
    for (const order of cancellable) {
      if (removed.has(order) || order.id !== cancel.id || order.ms >= cancel.ms) continue;
      const finishMs = finishByOrder.get(order) ?? Infinity;
      if (finishMs <= cancel.ms) continue; // already finished — not pending anymore
      if (!candidate || order.ms > candidate.ms) candidate = order;
    }
    if (candidate) removed.add(candidate);
  }
  return removed;
}

/** Drops building re-orders within `DEDUPE_WINDOW_MS` of the previous kept
 *  order for the same id, then merges consecutive same-id unit orders into
 *  one counted step. The merge window is anchored to the *group's first*
 *  order (`event.ms - group.ms <= MERGE_WINDOW_MS`), not the previous order
 *  — a sliding "previous order" comparison lets a steady stream of orders
 *  chain without bound (a 13-order, 96s-long "Train 13× Peasant" step from
 *  one order roughly every 8s, each within 10s of the last). Anchoring to
 *  the first order bounds every group's total span to `MERGE_WINDOW_MS`.
 *  Both passes only ever look at the immediately preceding kept/merged
 *  entry — "consecutive" per the feature spec, not "anywhere within the
 *  window".
 *
 *  F001: `cancelled` orders (raw unit/hero orders in `removed`) still take
 *  part in grouping/adjacency and bump the group's `ordered` count, but
 *  never bump `count` (the number that actually renders/costs supply). A
 *  unit/hero group left with `count === 0` (every order in it cancelled)
 *  is dropped entirely — no step at all, matching a fully-cancelled order. */
function dedupeAndMerge(events: readonly ReplayEvent[], removed: ReadonlySet<ReplayEvent>): MergedStep[] {
  const deduped: ReplayEvent[] = [];
  const lastBuildingMs = new Map<string, number>();
  for (const event of events) {
    if (event.kind === "cancel") continue; // never itself a step
    if (event.kind === "building") {
      const lastMs = lastBuildingMs.get(event.id);
      if (lastMs !== undefined && event.ms - lastMs <= DEDUPE_WINDOW_MS) continue;
      lastBuildingMs.set(event.id, event.ms);
    }
    deduped.push(event);
  }

  const merged: MergedStep[] = [];
  for (const event of deduped) {
    const isCancelled = removed.has(event);
    const prev = merged[merged.length - 1];
    if (
      event.kind === "unit" &&
      prev?.kind === "unit" &&
      prev.id === event.id &&
      prev.count < MAX_MERGE_COUNT &&
      event.ms - prev.ms <= MERGE_WINDOW_MS
    ) {
      prev.ordered += 1;
      if (isCancelled) {
        prev.cancelled += 1;
      } else {
        prev.count += 1;
        prev.lastMs = event.ms;
      }
      continue;
    }
    merged.push({
      kind: event.kind,
      id: event.id,
      ms: event.ms,
      lastMs: event.ms,
      count: isCancelled ? 0 : 1,
      ordered: 1,
      cancelled: isCancelled ? 1 : 0,
    });
  }

  return merged.filter((step) => step.count > 0 || (step.kind !== "unit" && step.kind !== "hero"));
}

/** F001: `extractBuild`'s return value, extending `EditorFormInput` (what
 *  actually gets saved / drops into the editor) with a side `meta` map of
 *  per-step cancel counts — kept off `steps`/`EditorFormInput` itself so it
 *  never round-trips through the editor form or a saved `LocalBuild` (see
 *  `ImportedStepMeta`'s docblock). Only steps that had at least one order
 *  cancelled get an entry, keyed by that step's index in `steps`. */
export interface ExtractBuildResult extends EditorFormInput {
  meta: { cancelled: Record<number, ImportedStepMeta> };
}

export function extractBuild(summary: ReplaySummary, playerId: number, opts: ExtractBuildOptions = {}): ExtractBuildResult {
  const cutoffMs = opts.cutoffMs ?? DEFAULT_CUTOFF_MS;
  const includeUpgrades = opts.includeUpgrades ?? true;
  const includeItems = opts.includeItems ?? false;
  const applyCancels = opts.applyCancels ?? true;

  const player = summary.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`extractBuild: no player with id ${playerId} in this replay.`);
  const opponents = summary.players.filter((p) => p.id !== playerId);

  const filtered = (summary.events[playerId] ?? [])
    .filter((e) => e.ms <= cutoffMs)
    .filter((e) => includeUpgrades || e.kind !== "upgrade")
    .filter((e) => includeItems || e.kind !== "item")
    .slice()
    .sort((a, b) => a.ms - b.ms);

  const removedOrders = applyCancels ? computeCancelledOrders(filtered) : new Set<ReplayEvent>();
  const mergedSteps = dedupeAndMerge(filtered, removedOrders);

  let supply = START_SUPPLY;
  const cancelledMeta: Record<number, ImportedStepMeta> = {};
  const steps: ImportedBuildStep[] = mergedSteps.map((step, index) => {
    const displaySupply = Math.min(supply, MAX_SUPPLY);
    if (step.kind === "unit" || step.kind === "hero") {
      supply += (FOOD_COST[step.id] ?? 0) * step.count;
    }
    if (step.cancelled > 0) {
      cancelledMeta[index] = { ordered: step.ordered, cancelled: step.cancelled };
    }
    const described = describeId(step.id);
    return {
      time: formatClock(step.ms),
      supply: displaySupply,
      instruction: clamp(instructionFor(step.kind, described.title, step.count), 160),
      icon: described.iconKey,
    };
  });

  const race = effectiveRace(player);
  const vsRaces = [...new Set(opponents.map(effectiveRace))];
  const raceLabel = RACE_LABELS[race];
  const vsLabel = vsRaces.map((r) => RACE_LABELS[r]).join(" & ") || "the field";
  const durationLabel = formatClock(summary.durationMs);

  return {
    title: clamp(`${player.name} (${raceLabel}) vs ${vsLabel} — ${summary.map.name}`, 90),
    race,
    vsRaces,
    difficulty: "intermediate",
    patch: "",
    tags: "replay",
    summary: clamp(
      `Imported from replay ${summary.map.file} (v${summary.version}, ${durationLabel}). Trim and annotate before sharing.` +
        (opts.sourceLabel ? ` Source: ${opts.sourceLabel}` : ""),
      200,
    ),
    author: "Replay Import",
    authorDiscord: "",
    sourceUrl: "",
    description: "",
    steps: steps.map((step) => ({
      time: step.time,
      supply: String(step.supply),
      instruction: step.instruction,
      icon: step.icon ?? "",
    })),
    meta: { cancelled: cancelledMeta },
  };
}
