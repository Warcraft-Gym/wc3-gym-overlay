// F002: must run before `w3gjs` does — see the shim's docblock for why
// (it's a global-scope Node builtin, not a module `vite-plugin-node-
// polyfills`'s aliases can cover). No-op under Node/vitest.
import "./shims/globals";
import W3GReplay from "w3gjs";
import type { GameDataBlock, TimeslotBlock } from "w3gjs";
import { ESC_CANCEL_ORDER_NUMERIC, HERO_IDS, UPGRADE_NAMES, decodeOrderId } from "./w3gjsData";
import { HALL_LINE, PRODUCER_OF, TRAIN_TIME_S, buildTimeForBuildingId } from "./gameData";
import {
  applyAssignGroupHotkey,
  applyChangeSelection,
  applySelectGroupHotkey,
  createSelectionState,
  snapshot,
  type ObjectKey,
  type SelectionState,
} from "./selection";
import { ReplayParseError, type ReplayEvent, type ReplayPlayer, type ReplayRace, type ReplaySummary } from "./types";
import { humanizeMapName } from "./mapName";

/** The 28-byte magic every `.w3g` file starts with — checked before handing
 *  the buffer to `w3gjs` so a non-replay file gets a clean, typed error
 *  instead of whatever `w3gjs` throws (or silently mis-parses) on garbage
 *  input. */
const REPLAY_MAGIC = new Uint8Array([
  ...Array.from("Warcraft III recorded game", (c) => c.charCodeAt(0)),
  0x1a,
  0x00,
]);

const MIN_SUPPORTED_VERSION = 1.32;

/** Action ids that carry a FourCC order id we care about (unit/building
 *  train orders, hero training, research, item use). `0x10` orders have no
 *  target (train/hero/research/tier-up self-casts, and the Esc/Cancel
 *  button); `0x11`/`0x12` orders have a target position (and, for `0x12`,
 *  a target object) — real "build a new building" orders. */
const ORDER_ACTION_IDS = new Set([0x10, 0x11, 0x12]);

/** F001: `RemoveUnitFromBuildingQueue` — a player cancelling a queued unit
 *  or hero order (w3gjs `ActionParser.js` action ids 0x1e/0x1f; note these
 *  are the same numeric values as the *outer* `gamedatablock`'s own
 *  0x1e/0x1f timeslot markers checked below — two unrelated fields that
 *  happen to share a byte range). Carries `slotNumber` (0 = the unit
 *  currently training, 1-4 = queue positions) and `itemId`, the FourCC of
 *  the order being removed, decoded the same way as hero training below. */
const CANCEL_ACTION_IDS = new Set([0x1e, 0x1f]);

/** F001: `ChangeSelectionAction` (add/remove units to the current
 *  selection), `AssignGroupHotkeyAction` (records a control group's
 *  members) and `SelectGroupHotkeyAction` (recalls a control group,
 *  replacing the current selection) — see `selection.ts`. */
const CHANGE_SELECTION_ACTION_ID = 0x16;
const ASSIGN_GROUP_HOTKEY_ACTION_ID = 0x17;
const SELECT_GROUP_HOTKEY_ACTION_ID = 0x18;

interface PendingOrder {
  id: string;
  ms: number;
}

/** F001: a train/hero order's `PendingOrder` plus when it finishes training
 *  and stops being cancellable — chained off the *previous* queued order's
 *  `finishMs` (real WC3 queues train one item at a time), exactly like
 *  `rejectedOrders.ts`'s `simulate()`. Without this, an Esc long after an
 *  order's real completion could still "cancel" it — a stale-queue false
 *  positive found via the oracle
 *  (`w3c_6aaef370d867fad24f913624_echo_isles.w3g`'s Deathmark had a second,
 *  spurious `hpea` cancel from exactly this). */
interface QueuedTrainOrder extends PendingOrder {
  finishMs: number;
}

/** F001: per-player bookkeeping `resolveEscCancel` needs to turn a raw
 *  Esc/Cancel-button press into a resolved cancel event — built up as the
 *  same low-level pass walks train/hero/research/tier-up orders. See the
 *  feature plan's "Order attribution"/"Generic cancel" design. */
interface PlayerCancelState {
  selection: SelectionState;
  /** Object -> its still-pending train/hero orders, oldest first (Esc
   *  cancels the *newest*, i.e. the end of this array). */
  trainQueues: Map<ObjectKey, QueuedTrainOrder[]>;
  /** Object -> its single in-flight research/tier-up order, if any. */
  researchPending: Map<ObjectKey, PendingOrder>;
  /** Every object that has ever had a train/research entry — lets branch 3
   *  (building cancel) tell "an object we've never seen issue an order"
   *  (probably a just-built building) apart from "a producer whose queue
   *  happens to be empty right now". */
  knownObjects: Set<ObjectKey>;
  /** Buildings under construction, not bound to any object (the builder is
   *  selected when the order is issued, not the building-to-be). */
  pendingBuildOrders: PendingOrder[];
  unresolvedCancels: number;
  /** F001: the `ms` of the last `0x0D0008` press seen for this player,
   *  win or lose — see `ESC_DEBOUNCE_MS`. */
  lastEscMs: number;
}

/** F001: real ladder replays show back-to-back `0x0D0008` presses as close
 *  as ~240ms apart that only ever remove *one* pending order between them
 *  (verified against `w3c_6aaef370d867fad24f913624_echo_isles.w3g`'s
 *  Deathmark, where a second Esc 239ms after a resolved one has no matching
 *  oracle cancel, and `w3c_6aaef285d867fad24f9135d5_autumn_leaves.w3g`'s
 *  Sonik, 420ms). Treated as the client coalescing a double-press/spam-click
 *  into a single logical command — a second press within this window is a
 *  no-op, not counted as unresolved either. */
const ESC_DEBOUNCE_MS = 500;

function createPlayerCancelState(): PlayerCancelState {
  return {
    selection: createSelectionState(),
    trainQueues: new Map(),
    researchPending: new Map(),
    knownObjects: new Set(),
    pendingBuildOrders: [],
    unresolvedCancels: 0,
    lastEscMs: -Infinity,
  };
}

/** F001: does `id` (an order's decoded FourCC) train a unit or hero? Tavern
 *  heroes included — `PRODUCER_OF[id] === "tavern"` is still a defined
 *  producer, just an unlimited one. */
function isTrainableId(id: string): boolean {
  return HERO_IDS.has(id) || PRODUCER_OF[id] !== undefined;
}

/** F001: does `id` start a research or a tier-up (both modelled as a single
 *  in-flight "research" on whichever object issued them — see the feature
 *  plan's note that a tier-up is "a research of the hall"). */
function isResearchLikeId(id: string): boolean {
  return id in HALL_LINE || id in UPGRADE_NAMES;
}

/** F001: records a train/hero order against the first-selected object, if
 *  any is selected — orders issued with nothing selected (rare, and never
 *  cancellable via Esc since there'd be nothing to select afterwards) are
 *  simply not bound to anything. */
function bindTrainOrder(state: PlayerCancelState, id: string, ms: number): void {
  const [firstSelected] = snapshot(state.selection);
  if (!firstSelected) return;
  const queue = state.trainQueues.get(firstSelected) ?? [];
  const lastFinishMs = queue.length > 0 ? queue[queue.length - 1]!.finishMs : -Infinity;
  const trainS = TRAIN_TIME_S[id] ?? 0;
  queue.push({ id, ms, finishMs: Math.max(ms, lastFinishMs) + trainS * 1000 });
  state.trainQueues.set(firstSelected, queue);
  state.knownObjects.add(firstSelected);
}

/** F001: drops orders at the front of `queue` whose training has already
 *  finished as of `atMs` — finish times chain non-decreasingly (see
 *  `PendingOrder.finishMs`), so only the front can ever be due. */
function retireFinishedOrders(queue: QueuedTrainOrder[], atMs: number): void {
  while (queue.length > 0 && queue[0]!.finishMs <= atMs) queue.shift();
}

function bindResearchOrder(state: PlayerCancelState, id: string, ms: number): void {
  const [firstSelected] = snapshot(state.selection);
  if (!firstSelected) return;
  state.researchPending.set(firstSelected, { id, ms });
  state.knownObjects.add(firstSelected);
}

interface LowLevelResult {
  events: Map<number, ReplayEvent[]>;
  unresolvedCancels: Map<number, number>;
}

/**
 * F001: resolves a `0x0D0008` Esc/Cancel-button press into a typed cancel
 * event, per the feature plan's four-branch design:
 *  1. a selected object with pending train/hero orders -> its newest one;
 *  2. else a selected object with a pending research/tier-up -> that;
 *  3. else, if exactly one *unrecognised* object is selected (never issued
 *     a train/research order — presumably a building mid-construction),
 *     the most recently ordered still-under-construction building;
 *  4. else `undefined` (nothing matches) — the caller counts it as
 *     unresolved and drops it, never throws.
 */
function resolveEscCancel(state: PlayerCancelState, ms: number): ReplayEvent | undefined {
  const selected = snapshot(state.selection);

  for (const key of selected) {
    const queue = state.trainQueues.get(key);
    if (!queue) continue;
    retireFinishedOrders(queue, ms);
    if (queue.length > 0) {
      const order = queue.pop()!;
      return { kind: "cancel", id: order.id, ms, via: "esc", cancelsOrderMs: order.ms };
    }
  }

  for (const key of selected) {
    const research = state.researchPending.get(key);
    if (research) {
      state.researchPending.delete(key);
      return { kind: "cancel", id: research.id, ms, via: "esc", target: "research", cancelsOrderMs: research.ms };
    }
  }

  if (selected.length === 1 && !state.knownObjects.has(selected[0]!)) {
    let bestIndex = -1;
    let bestDeltaMs = Infinity;
    state.pendingBuildOrders.forEach((order, index) => {
      const buildTimeS = buildTimeForBuildingId(order.id);
      if (buildTimeS === undefined) return;
      const deltaMs = ms - order.ms;
      if (deltaMs >= 0 && deltaMs <= buildTimeS * 1000 && deltaMs < bestDeltaMs) {
        bestDeltaMs = deltaMs;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      const [order] = state.pendingBuildOrders.splice(bestIndex, 1);
      return { kind: "cancel", id: order!.id, ms, via: "esc", target: "building", cancelsOrderMs: order!.ms };
    }
  }

  return undefined;
}

function hasReplayMagic(bytes: Uint8Array): boolean {
  if (bytes.length < REPLAY_MAGIC.length) return false;
  for (let i = 0; i < REPLAY_MAGIC.length; i++) {
    if (bytes[i] !== REPLAY_MAGIC[i]) return false;
  }
  return true;
}

function mapRaceCode(code: string): ReplayRace {
  switch (code) {
    case "H":
      return "human";
    case "O":
      return "orc";
    case "N":
      return "nightelf";
    case "U":
      return "undead";
    default:
      return "random";
  }
}

/** Walks a player's four `.order` arrays (already split into these
 *  categories by `w3gjs`) into our flat `ReplayEvent[]`. */
function collectOrderEvents(
  order: { id: string; ms: number }[] | undefined,
  kind: ReplayEvent["kind"],
): ReplayEvent[] {
  if (!order) return [];
  return order.map((entry) => ({ kind, id: entry.id, ms: entry.ms }));
}

/** `w3gjs` records hero *ability* training (`heroCollector`) but never the
 *  moment the hero unit itself finished training — that order's FourCC
 *  (the hero's own unit id, e.g. "Ofar") isn't in any of its `units`/
 *  `buildings`/`upgrades`/`items` tables, so `Player.handleStringencodedItemID`
 *  silently drops it. We replay the same `"gamedatablock"` stream `w3gjs`
 *  itself listens to and pick out those orders directly. See
 *  `w3gjsData.ts`'s `decodeOrderId` docblock for the byte-decoding this
 *  mirrors, and the feature spec's "Research already done" section.
 *
 *  F001: the same low-level stream also carries queue-cancel actions
 *  (`CANCEL_ACTION_IDS`, now tagged `via: "slot"`) and, new in this
 *  feature, the selection actions (`CHANGE_SELECTION_ACTION_ID` etc.) and
 *  every train/hero/research/tier-up order — tracked via `selection.ts` and
 *  `PlayerCancelState` so a `0x0D0008` Esc/Cancel-button press
 *  (`resolveEscCancel`) can be turned into the same `kind: "cancel"` shape,
 *  tagged `via: "esc"`. An undecodable cancel `itemId`, or an Esc that
 *  resolves to nothing, is skipped/counted — never thrown. */
function collectLowLevelEvents(replay: W3GReplay): LowLevelResult {
  const events = new Map<number, ReplayEvent[]>();
  const playerStates = new Map<number, PlayerCancelState>();
  let elapsedMs = 0;

  const stateFor = (playerId: number): PlayerCancelState => {
    let state = playerStates.get(playerId);
    if (!state) {
      state = createPlayerCancelState();
      playerStates.set(playerId, state);
    }
    return state;
  };

  replay.on("gamedatablock", (block: GameDataBlock) => {
    if (block.id !== 0x1f && block.id !== 0x1e) return;
    const timeslot = block as TimeslotBlock;
    elapsedMs += timeslot.timeIncrement;

    for (const commandBlock of timeslot.commandBlocks) {
      const state = stateFor(commandBlock.playerId);

      for (const action of commandBlock.actions) {
        const playerEvents = events.get(commandBlock.playerId) ?? [];

        if (action.id === CHANGE_SELECTION_ACTION_ID) {
          const a = action as { selectMode: number; units: readonly [number, number][] };
          applyChangeSelection(state.selection, a.selectMode, a.units);
          continue;
        }
        if (action.id === ASSIGN_GROUP_HOTKEY_ACTION_ID) {
          const a = action as { groupNumber: number; units: readonly [number, number][] };
          applyAssignGroupHotkey(state.selection, a.groupNumber, a.units);
          continue;
        }
        if (action.id === SELECT_GROUP_HOTKEY_ACTION_ID) {
          const a = action as { groupNumber: number };
          applySelectGroupHotkey(state.selection, a.groupNumber);
          continue;
        }

        if (ORDER_ACTION_IDS.has(action.id)) {
          const orderId = (action as { orderId: number[] }).orderId;
          const decoded = decodeOrderId(orderId);

          if (action.id === 0x10 && !decoded.isFourCC) {
            if (decoded.numeric === ESC_CANCEL_ORDER_NUMERIC) {
              const isDebounced = elapsedMs - state.lastEscMs < ESC_DEBOUNCE_MS;
              state.lastEscMs = elapsedMs;
              if (!isDebounced) {
                const resolved = resolveEscCancel(state, elapsedMs);
                if (resolved) {
                  playerEvents.push(resolved);
                  events.set(commandBlock.playerId, playerEvents);
                } else {
                  state.unresolvedCancels += 1;
                }
              }
            }
            continue;
          }

          if (!decoded.isFourCC) continue;

          if (action.id === 0x10) {
            // Train/hero orders and research/tier-up orders are always
            // self-cast (no target) — bind them to whoever is selected.
            if (isTrainableId(decoded.value)) {
              bindTrainOrder(state, decoded.value, elapsedMs);
            } else if (isResearchLikeId(decoded.value)) {
              bindResearchOrder(state, decoded.value, elapsedMs);
            }
          } else {
            // 0x11/0x12: a positional "build a new building" order — the
            // *builder* is selected, not the building, so this never binds
            // to an object (see the feature plan's "Order attribution").
            if (decoded.value in HALL_LINE) {
              bindResearchOrder(state, decoded.value, elapsedMs);
            } else if (buildTimeForBuildingId(decoded.value) !== undefined) {
              state.pendingBuildOrders.push({ id: decoded.value, ms: elapsedMs });
            }
          }

          if (HERO_IDS.has(decoded.value)) {
            // F001 (oracle parity): every hero-training order is recorded
            // as its own raw event, redundant repeats included — the oracle
            // itself logs every order verbatim rather than simulating which
            // ones the game actually accepted (verified against
            // `oracle_6aaef370d867fad24f913624.json`'s two "Mountain King"
            // entries 90ms apart, and
            // `oracle_6aaef285d867fad24f9135d5.json`'s two "Dark Ranger"
            // ones 121ms apart). Collapsing a redundant re-click into one
            // *displayed* step is `extractBuild.ts`'s `dedupeAndMerge`'s job
            // (the same 2s reorder window it already uses for buildings),
            // not this raw event stream's.
            playerEvents.push({ kind: "hero", id: decoded.value, ms: elapsedMs });
            events.set(commandBlock.playerId, playerEvents);
          }
          continue;
        }

        if (CANCEL_ACTION_IDS.has(action.id)) {
          const cancelAction = action as { slotNumber: number; itemId: number[] };
          const decoded = decodeOrderId(cancelAction.itemId);
          if (!decoded.isFourCC) continue; // never throw on an undecodable itemId
          playerEvents.push({
            kind: "cancel",
            id: decoded.value,
            ms: elapsedMs,
            slot: cancelAction.slotNumber,
            via: "slot",
          });
          events.set(commandBlock.playerId, playerEvents);
        }
      }
    }
  });

  const unresolvedCancels = new Map<number, number>();
  for (const [playerId, state] of playerStates) {
    if (state.unresolvedCancels > 0) unresolvedCancels.set(playerId, state.unresolvedCancels);
  }
  return { events, unresolvedCancels };
}

/**
 * Parses a `.w3g` replay buffer into a `ReplaySummary`: map/version/duration
 * metadata, non-observer players, and every unit/building/upgrade/item/hero
 * event each player issued, in ms, plus (F001) any `"cancel"` events for
 * queued unit/hero orders the player removed. Never throws anything but
 * `ReplayParseError`.
 */
export async function parseReplay(bytes: Uint8Array): Promise<ReplaySummary> {
  if (!hasReplayMagic(bytes)) {
    throw new ReplayParseError("not_a_replay", "File is missing the Warcraft III replay header.");
  }

  const replay = new W3GReplay();
  const lowLevelEvents = collectLowLevelEvents(replay);

  let output;
  try {
    output = await replay.parse(Buffer.from(bytes));
  } catch (err) { // never swallow: rethrow below as a ReplayParseError
    if (err instanceof ReplayParseError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ReplayParseError("corrupt", `Failed to parse replay: ${message}`);
  }

  const versionNumber = parseFloat(output.version);
  if (Number.isNaN(versionNumber) || versionNumber < MIN_SUPPORTED_VERSION) {
    throw new ReplayParseError("unsupported_version", `Replay version ${output.version} is not supported.`);
  }

  const players: ReplayPlayer[] = output.players.map((p) => ({
    id: p.id,
    name: p.name,
    race: mapRaceCode(p.race),
    raceDetected: mapRaceCode(p.raceDetected || p.race),
    teamId: p.teamid,
    isObserver: false, // w3gjs already excludes observers from `players` (see W3GReplay.js cleanup()).
  }));

  const events: Record<number, ReplayEvent[]> = {};
  const unresolvedCancels: Record<number, number> = {};
  for (const p of output.players) {
    const combined = [
      ...collectOrderEvents(p.units?.order, "unit"),
      ...collectOrderEvents(p.buildings?.order, "building"),
      ...collectOrderEvents(p.upgrades?.order, "upgrade"),
      ...collectOrderEvents(p.items?.order, "item"),
      ...(lowLevelEvents.events.get(p.id) ?? []),
    ].sort((a, b) => a.ms - b.ms);
    events[p.id] = combined;
    const unresolved = lowLevelEvents.unresolvedCancels.get(p.id);
    if (unresolved) unresolvedCancels[p.id] = unresolved;
  }

  return {
    map: { file: output.map.file, name: humanizeMapName(output.map.file || output.map.path) },
    version: output.version,
    buildNumber: output.buildNumber,
    durationMs: output.duration,
    players,
    events,
    unresolvedCancels,
  };
}
