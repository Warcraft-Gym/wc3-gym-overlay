// F002: must run before `w3gjs` does — see the shim's docblock for why
// (it's a global-scope Node builtin, not a module `vite-plugin-node-
// polyfills`'s aliases can cover). No-op under Node/vitest.
import "./shims/globals";
import W3GReplay from "w3gjs";
import type { GameDataBlock, TimeslotBlock } from "w3gjs";
import { HERO_IDS, decodeOrderId } from "./w3gjsData";
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
 *  train orders, hero training, research, item use). */
const ORDER_ACTION_IDS = new Set([0x10, 0x11, 0x12]);

/** F001: `RemoveUnitFromBuildingQueue` — a player cancelling a queued unit
 *  or hero order (w3gjs `ActionParser.js` action ids 0x1e/0x1f; note these
 *  are the same numeric values as the *outer* `gamedatablock`'s own
 *  0x1e/0x1f timeslot markers checked below — two unrelated fields that
 *  happen to share a byte range). Carries `slotNumber` (0 = the unit
 *  currently training, 1-4 = queue positions) and `itemId`, the FourCC of
 *  the order being removed, decoded the same way as hero training below. */
const CANCEL_ACTION_IDS = new Set([0x1e, 0x1f]);

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
 *  (`CANCEL_ACTION_IDS`), so this collector (renamed from
 *  `collectHeroTrainingEvents`) now also emits `kind: "cancel"` events —
 *  same cumulative `elapsedMs`, same per-player routing. An undecodable
 *  cancel `itemId` is skipped, never thrown. */
function collectLowLevelEvents(replay: W3GReplay): Map<number, ReplayEvent[]> {
  const events = new Map<number, ReplayEvent[]>();
  let elapsedMs = 0;

  replay.on("gamedatablock", (block: GameDataBlock) => {
    if (block.id !== 0x1f && block.id !== 0x1e) return;
    const timeslot = block as TimeslotBlock;
    elapsedMs += timeslot.timeIncrement;

    for (const commandBlock of timeslot.commandBlocks) {
      for (const action of commandBlock.actions) {
        const playerEvents = events.get(commandBlock.playerId) ?? [];

        if (ORDER_ACTION_IDS.has(action.id)) {
          const orderId = (action as { orderId: number[] }).orderId;
          const decoded = decodeOrderId(orderId);
          if (!decoded.isFourCC || !HERO_IDS.has(decoded.value)) continue;
          if (playerEvents.some((e) => e.kind === "hero" && e.id === decoded.value)) continue; // first order only
          playerEvents.push({ kind: "hero", id: decoded.value, ms: elapsedMs });
          events.set(commandBlock.playerId, playerEvents);
          continue;
        }

        if (CANCEL_ACTION_IDS.has(action.id)) {
          const cancelAction = action as { slotNumber: number; itemId: number[] };
          const decoded = decodeOrderId(cancelAction.itemId);
          if (!decoded.isFourCC) continue; // never throw on an undecodable itemId
          playerEvents.push({ kind: "cancel", id: decoded.value, ms: elapsedMs, slot: cancelAction.slotNumber });
          events.set(commandBlock.playerId, playerEvents);
        }
      }
    }
  });

  return events;
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
  for (const p of output.players) {
    const combined = [
      ...collectOrderEvents(p.units?.order, "unit"),
      ...collectOrderEvents(p.buildings?.order, "building"),
      ...collectOrderEvents(p.upgrades?.order, "upgrade"),
      ...collectOrderEvents(p.items?.order, "item"),
      ...(lowLevelEvents.get(p.id) ?? []),
    ].sort((a, b) => a.ms - b.ms);
    events[p.id] = combined;
  }

  return {
    map: { file: output.map.file, name: humanizeMapName(output.map.file || output.map.path) },
    version: output.version,
    buildNumber: output.buildNumber,
    durationMs: output.duration,
    players,
    events,
  };
}
