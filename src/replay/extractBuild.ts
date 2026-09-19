import type { EditorFormInput } from "../lib/buildEditorSchema";
import { describeId } from "./idMap";
import { FOOD_COST } from "./foodCost";
import { computeCancelledOrders, filterLikelyRejected, type DroppedInfo } from "./rejectedOrders";
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
      // `extractBuild`'s `applyCancels`/`dropLikelyRejected` pipeline,
      // which strips cancel events and F002-rejected orders out of the
      // event stream before it ever reaches `dedupeAndMerge`). Exhaustiveness only.
      return "";
  }
}

type MergedStep = {
  kind: ReplayEvent["kind"];
  id: string;
  /** F002: the time the step *displays* at — the first **surviving**
   *  (non-cancelled) order's ms, set lazily the first time a survivor joins
   *  the group (see the feature spec's scrutiny case 3: a group must never
   *  be anchored at a fully-cancelled order's timestamp). Until a survivor
   *  arrives this equals the group's first (possibly-cancelled) order's ms,
   *  but such a group is always dropped by the `count > 0` filter below. */
  ms: number;
  /** The *window* anchor — fixed at the group's first order regardless of
   *  cancellation, so the `MERGE_WINDOW_MS` bound below is unaffected by
   *  which particular order within the group ends up surviving. */
  windowAnchorMs: number;
  lastMs: number;
  count: number;
  ordered: number;
  cancelled: number;
};

/** Belt-and-braces cap on top of the merge window itself: a 6th consecutive
 *  same-id unit order always starts a new group, even if it still lands
 *  inside `MERGE_WINDOW_MS` of the group's first order. */
const MAX_MERGE_COUNT = 5;

/** Drops building re-orders within `DEDUPE_WINDOW_MS` of the previous kept
 *  order for the same id, then merges consecutive same-id unit orders into
 *  one counted step. The merge window is anchored to the *group's first*
 *  order (`event.ms - group.windowAnchorMs <= MERGE_WINDOW_MS`), not the
 *  previous order — a sliding "previous order" comparison lets a steady
 *  stream of orders chain without bound (a 13-order, 96s-long "Train 13×
 *  Peasant" step from one order roughly every 8s, each within 10s of the
 *  last). Anchoring to the first order bounds every group's total span to
 *  `MERGE_WINDOW_MS`. Both passes only ever look at the immediately
 *  preceding kept/merged entry — "consecutive" per the feature spec, not
 *  "anywhere within the window".
 *
 *  F001: `cancelled` orders (raw unit/hero orders in `removed`) still take
 *  part in grouping/adjacency and bump the group's `ordered` count, but
 *  never bump `count` (the number that actually renders/costs supply). A
 *  unit/hero group left with `count === 0` (every order in it cancelled)
 *  is dropped entirely — no step at all, matching a fully-cancelled order.
 *
 *  F002: `events` never contains orders `filterLikelyRejected` dropped
 *  (the caller strips them before calling this) — they play no part in
 *  grouping/adjacency at all, unlike cancelled orders (see `extractBuild`). */
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
      event.ms - prev.windowAnchorMs <= MERGE_WINDOW_MS
    ) {
      prev.ordered += 1;
      if (isCancelled) {
        prev.cancelled += 1;
      } else {
        if (prev.count === 0) prev.ms = event.ms; // F002: first surviving order anchors the display time
        prev.count += 1;
        prev.lastMs = event.ms;
      }
      continue;
    }
    merged.push({
      kind: event.kind,
      id: event.id,
      ms: event.ms,
      windowAnchorMs: event.ms,
      lastMs: event.ms,
      count: isCancelled ? 0 : 1,
      ordered: 1,
      cancelled: isCancelled ? 1 : 0,
    });
  }

  return merged.filter((step) => step.count > 0 || (step.kind !== "unit" && step.kind !== "hero"));
}

/** F002: for every order `filterLikelyRejected` dropped, attaches it to the
 *  nearest surviving merged step of the same kind/id within
 *  `MERGE_WINDOW_MS` (the group it would have joined had the game accepted
 *  it) — else it's only reflected in the top-level `dropped` summary, not
 *  on any particular step. Returns a map keyed by the step's index in
 *  `mergedSteps`, mirroring `cancelledMeta`. */
function attachDroppedToSteps(mergedSteps: readonly MergedStep[], droppedOrders: readonly ReplayEvent[]): Record<number, number> {
  const droppedMeta: Record<number, number> = {};
  for (const order of droppedOrders) {
    let bestIndex = -1;
    let bestDistanceMs = Infinity;
    mergedSteps.forEach((step, index) => {
      if (step.kind !== order.kind || step.id !== order.id) return;
      const distanceMs = Math.abs(order.ms - step.ms);
      if (distanceMs <= MERGE_WINDOW_MS && distanceMs < bestDistanceMs) {
        bestDistanceMs = distanceMs;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) droppedMeta[bestIndex] = (droppedMeta[bestIndex] ?? 0) + 1;
  }
  return droppedMeta;
}

/** F003: the caption shown under a step's instruction in the editor
 *  (`data-import-note`) — never persisted (see `EditorStepInput.importNote`'s
 *  docblock). `undefined` when the step had neither a cancel nor a dropped
 *  order attached to it. */
function importNoteFor(cancelled: ImportedStepMeta | undefined, dropped: number | undefined): string | undefined {
  const parts: string[] = [];
  if (cancelled && cancelled.cancelled > 0) parts.push(`${cancelled.ordered} ordered · ${cancelled.cancelled} cancelled`);
  if (dropped && dropped > 0) parts.push(`${dropped} dropped (likely rejected)`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** F001: `extractBuild`'s return value, extending `EditorFormInput` (what
 *  actually gets saved / drops into the editor) with a side `meta` map of
 *  per-step cancel counts — kept off `steps`/`EditorFormInput` itself so it
 *  never round-trips through the editor form or a saved `LocalBuild` (see
 *  `ImportedStepMeta`'s docblock). Only steps that had at least one order
 *  cancelled get an entry, keyed by that step's index in `steps`.
 *
 *  F002: `meta.dropped` is the same idea for orders the "likely rejected"
 *  filter dropped (see `attachDroppedToSteps`), and the top-level `dropped`
 *  is the raw `filterLikelyRejected` summary for the whole import (empty
 *  when `dropLikelyRejected` is off). */
export interface ExtractBuildResult extends EditorFormInput {
  meta: { cancelled: Record<number, ImportedStepMeta>; dropped: Record<number, number> };
  dropped: DroppedInfo;
}

const EMPTY_DROPPED: DroppedInfo = { count: 0, byId: {}, orderIndices: [] };

export function extractBuild(summary: ReplaySummary, playerId: number, opts: ExtractBuildOptions = {}): ExtractBuildResult {
  const cutoffMs = opts.cutoffMs ?? DEFAULT_CUTOFF_MS;
  const includeUpgrades = opts.includeUpgrades ?? true;
  const includeItems = opts.includeItems ?? false;
  const applyCancels = opts.applyCancels ?? true;
  const dropLikelyRejected = opts.dropLikelyRejected ?? true;

  const player = summary.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`extractBuild: no player with id ${playerId} in this replay.`);
  const opponents = summary.players.filter((p) => p.id !== playerId);

  const filtered = (summary.events[playerId] ?? [])
    .filter((e) => e.ms <= cutoffMs)
    .filter((e) => includeUpgrades || e.kind !== "upgrade")
    .filter((e) => includeItems || e.kind !== "item")
    .slice()
    .sort((a, b) => a.ms - b.ms);

  const removedOrders = applyCancels ? computeCancelledOrders(filtered, filtered) : new Set<ReplayEvent>();
  const survivingOrders = filtered.filter((e) => (e.kind === "unit" || e.kind === "hero") && !removedOrders.has(e));

  const { accepted, dropped } = dropLikelyRejected
    ? filterLikelyRejected(survivingOrders, filtered)
    : { accepted: survivingOrders, dropped: EMPTY_DROPPED };
  const rejectedSet = new Set(survivingOrders.filter((order) => !accepted.includes(order)));

  const eventsForMerge = filtered.filter((e) => !rejectedSet.has(e));
  const mergedSteps = dedupeAndMerge(eventsForMerge, removedOrders);
  const droppedMeta = attachDroppedToSteps(mergedSteps, [...rejectedSet]);

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
    steps: steps.map((step, index) => ({
      time: step.time,
      supply: String(step.supply),
      instruction: step.instruction,
      icon: step.icon ?? "",
      importNote: importNoteFor(cancelledMeta[index], droppedMeta[index]),
    })),
    meta: { cancelled: cancelledMeta, dropped: droppedMeta },
    dropped,
  };
}
