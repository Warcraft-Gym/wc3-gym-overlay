/**
 * Shared types for the replay → build-order-draft pipeline. Kept separate
 * from `parseReplay.ts`/`extractBuild.ts` so tests and UI code (F002) can
 * import just the shapes without pulling in `w3gjs`.
 */

export type ReplayRace = "human" | "orc" | "nightelf" | "undead" | "random";

export type ReplayEventKind = "unit" | "building" | "upgrade" | "hero" | "item" | "cancel";

export interface ReplayEvent {
  kind: ReplayEventKind;
  id: string;
  ms: number;
  /** Only set for `kind: "cancel"`: the `slotNumber` w3gjs's
   *  `RemoveUnitFromBuildingQueue` action carried (0 = the unit currently
   *  training, 1-4 = queue positions). A cancel event's `id` is the
   *  unit/hero FourCC being *removed* from a production queue, not a
   *  finished order — see `extractBuild.ts`'s `computeCancelledOrders`. */
  slot?: number;
}

export interface ReplayPlayer {
  id: number;
  name: string;
  race: ReplayRace;
  raceDetected: ReplayRace;
  teamId: number;
  isObserver: boolean;
}

export interface ReplaySummary {
  map: { file: string; name: string };
  version: string;
  buildNumber: number;
  durationMs: number;
  players: ReplayPlayer[];
  events: Record<number, ReplayEvent[]>;
}

export type ReplayParseErrorCode = "not_a_replay" | "unsupported_version" | "corrupt";

export class ReplayParseError extends Error {
  code: ReplayParseErrorCode;

  constructor(code: ReplayParseErrorCode, message: string) {
    super(message);
    this.name = "ReplayParseError";
    this.code = code;
  }
}

export type IdKind = "unit" | "building" | "hero" | "upgrade" | "item";

export interface DescribedId {
  iconKey?: string;
  title: string;
  kind: IdKind;
}

/** Internal, typed representation of a step while `extractBuild` computes it
 *  (numeric supply, optional icon). The function's public return value is
 *  stringified into `EditorFormInput` (see `extractBuild.ts`) so it drops
 *  straight into the private-build editor form — see that file's docblock
 *  for why the draft is shaped that way instead of the loosely-typed shape
 *  the feature spec sketches. */
export interface ImportedBuildStep {
  time: string;
  supply: number;
  instruction: string;
  icon?: string;
}

export interface ExtractBuildOptions {
  cutoffMs?: number;
  includeUpgrades?: boolean;
  includeItems?: boolean;
  /** F004: set when the replay came from a W3Champions match link (e.g.
   *  "w3champions.com/match/<id>") — appended as a "Source: …" sentence to
   *  the generated draft's `summary`, clamped together with the rest of it. */
  sourceLabel?: string;
  /** F001: honour the replay's own cancel commands when building the step
   *  list (default true). `false` is test-only — it reproduces the
   *  pre-F001 cancel-blind extraction so tests can diff the two. */
  applyCancels?: boolean;
}

/** F001: how many of a merged step's orders were cancelled before they
 *  finished training. `ordered` is the raw count issued for that step
 *  (before merge-collapsing removed/duplicate orders out of the count);
 *  `cancelled` is how many of those were removed. Kept out of the
 *  persisted/editor-facing `EditorFormInput` shape — F003 renders these as
 *  an `importNote` instead — so `extractBuild` returns them on a side
 *  `meta.cancelled` map keyed by the step's index in `steps`, and only for
 *  steps that actually had a cancel applied. */
export interface ImportedStepMeta {
  ordered: number;
  cancelled: number;
}
