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
  /** Only set for `kind: "cancel"` events resolved from a queue-icon click
   *  (`via: "slot"`): the `slotNumber` w3gjs's `RemoveUnitFromBuildingQueue`
   *  action carried (0 = the unit currently training, 1-4 = queue
   *  positions). A cancel event's `id` is the unit/hero FourCC being
   *  *removed* from a production queue, not a finished order — see
   *  `rejectedOrders.ts`'s `computeCancelledOrders`. */
  slot?: number;
  /** F001: only set for `kind: "cancel"` — how the cancel was issued.
   *  `"slot"` is the pre-existing queue-icon-click cancel (`slot` is set);
   *  `"esc"` is the Esc/Cancel-button cancel resolved via the player's
   *  selection (`parseReplay.ts`'s `resolveEscCancel`). */
  via?: "esc" | "slot";
  /** F001: only set for `via: "esc"` cancels resolved against a building
   *  under construction (`"building"`) or a research/tier-up in progress
   *  (`"research"`) — omitted for unit/hero cancels, which behave like
   *  slot cancels downstream (see `rejectedOrders.ts`). */
  target?: "building" | "research";
  /** F001: only set for `via: "esc"` cancels resolved against a *known*
   *  pending order (unit/hero train order, or a research/tier-up) — the
   *  exact `ms` of that original order, so `rejectedOrders.ts` can match it
   *  precisely instead of falling back to its type-level FIFO heuristic
   *  (needed to disambiguate e.g. two same-type producers). Internal to the
   *  cancel-resolution pipeline; not part of the oracle-parity contract. */
  cancelsOrderMs?: number;
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
  /** F001: how many Esc/Cancel-button cancels per player couldn't be
   *  resolved to a unit/hero/building/research (empty or ambiguous
   *  selection, or no matching pending order) — diagnostics only, never
   *  thrown. Keyed by player id; optional (omitted by hand-built test
   *  fixtures that predate F001, treated the same as "no data"). */
  unresolvedCancels?: Record<number, number>;
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
  /** F002: drop orders the game most likely refused (spam-clicks past a
   *  full production queue) before building the step list (default true).
   *  `false` reproduces the pre-F002 extraction (cancels still applied). */
  dropLikelyRejected?: boolean;
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
