import type { EditorFormInput } from "../lib/buildEditorSchema";
import { describeId } from "./idMap";
import { FOOD_COST } from "./foodCost";
import type { ExtractBuildOptions, ImportedBuildStep, ReplayEvent, ReplayPlayer, ReplayRace, ReplaySummary } from "./types";

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
  }
}

type MergedStep = { kind: ReplayEvent["kind"]; id: string; ms: number; lastMs: number; count: number };

/** Drops building re-orders within `DEDUPE_WINDOW_MS` of the previous kept
 *  order for the same id, then merges consecutive same-id unit orders
 *  within `MERGE_WINDOW_MS` into one counted step. Both passes only ever
 *  look at the immediately preceding kept/merged entry — "consecutive" per
 *  the feature spec, not "anywhere within the window". */
function dedupeAndMerge(events: readonly ReplayEvent[]): MergedStep[] {
  const deduped: ReplayEvent[] = [];
  const lastBuildingMs = new Map<string, number>();
  for (const event of events) {
    if (event.kind === "building") {
      const lastMs = lastBuildingMs.get(event.id);
      if (lastMs !== undefined && event.ms - lastMs <= DEDUPE_WINDOW_MS) continue;
      lastBuildingMs.set(event.id, event.ms);
    }
    deduped.push(event);
  }

  const merged: MergedStep[] = [];
  for (const event of deduped) {
    const prev = merged[merged.length - 1];
    if (event.kind === "unit" && prev?.kind === "unit" && prev.id === event.id && event.ms - prev.lastMs <= MERGE_WINDOW_MS) {
      prev.count += 1;
      prev.lastMs = event.ms;
      continue;
    }
    merged.push({ kind: event.kind, id: event.id, ms: event.ms, lastMs: event.ms, count: 1 });
  }
  return merged;
}

export function extractBuild(summary: ReplaySummary, playerId: number, opts: ExtractBuildOptions = {}): EditorFormInput {
  const cutoffMs = opts.cutoffMs ?? DEFAULT_CUTOFF_MS;
  const includeUpgrades = opts.includeUpgrades ?? true;
  const includeItems = opts.includeItems ?? false;

  const player = summary.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`extractBuild: no player with id ${playerId} in this replay.`);
  const opponents = summary.players.filter((p) => p.id !== playerId);

  const filtered = (summary.events[playerId] ?? [])
    .filter((e) => e.ms <= cutoffMs)
    .filter((e) => includeUpgrades || e.kind !== "upgrade")
    .filter((e) => includeItems || e.kind !== "item")
    .slice()
    .sort((a, b) => a.ms - b.ms);

  const mergedSteps = dedupeAndMerge(filtered);

  let supply = START_SUPPLY;
  const steps: ImportedBuildStep[] = mergedSteps.map((step) => {
    const displaySupply = Math.min(supply, MAX_SUPPLY);
    if (step.kind === "unit" || step.kind === "hero") {
      supply += (FOOD_COST[step.id] ?? 0) * step.count;
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
      `Imported from replay ${summary.map.file} (v${summary.version}, ${durationLabel}). Trim and annotate before sharing.`,
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
  };
}
