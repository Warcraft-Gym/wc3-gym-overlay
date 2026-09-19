import { BUILD_TIME_S, HALL_LINE, PRODUCER_OF, TRAIN_TIME_S } from "./gameData";
import type { ReplayEvent } from "./types";

/**
 * F002: a surviving unit/hero order — the shape `filterLikelyRejected`
 * consumes and returns. Identical to `ReplayEvent` (kept as an alias, not a
 * new type, so callers can pass `extractBuild.ts`'s already-cancel-resolved
 * event list straight through).
 */
export type RawOrder = ReplayEvent;

/** How many of a merged step's orders would have been dropped as "likely
 *  rejected" — see `extractBuild.ts`'s per-step `dropped` meta. */
export interface DroppedInfo {
  count: number;
  byId: Record<string, number>;
  orderIndices: number[];
}

export interface FilterLikelyRejectedOptions {
  /** Real WC3 production queues hold at most 5 orders. Overridable only for
   *  tests — the pipeline in `extractBuild.ts` always uses the default. */
  capacity?: number;
}

const QUEUE_CAPACITY = 5;

/** The four starting Town-Hall-equivalent producers — one always exists at
 *  ms = 0 for every race, with no `"building"` event required (see the
 *  feature spec's "Verified game data" section). A player only ever issues
 *  orders whose producer resolves to their own race's hall id, so seeding
 *  all four unconditionally is harmless. */
const HALL_IDS = ["htow", "ogre", "etol", "unpl"] as const;

interface QueuedOrder {
  order: ReplayEvent;
  finishMs: number;
}

interface ProducerInstance {
  availableAt: number;
  queue: QueuedOrder[];
}

/** A `"building"` event's producer type, or `undefined` if it never creates
 *  a new producer instance: a tier-up (`HALL_LINE` key — same physical
 *  building/queue as the hall it upgrades) or an id with no known build
 *  time (not a producer building at all). */
function producerTypeForBuildingEvent(id: string): string | undefined {
  if (id in HALL_LINE) return undefined;
  if (id in BUILD_TIME_S) return id;
  return undefined;
}

function buildProducers(buildings: readonly ReplayEvent[]): Map<string, ProducerInstance[]> {
  const byType = new Map<string, ProducerInstance[]>();
  const add = (type: string, availableAt: number) => {
    const instance: ProducerInstance = { availableAt, queue: [] };
    const list = byType.get(type);
    if (list) list.push(instance);
    else byType.set(type, [instance]);
  };

  for (const hallId of HALL_IDS) add(hallId, 0);

  for (const event of buildings) {
    if (event.kind !== "building") continue;
    const type = producerTypeForBuildingEvent(event.id);
    if (!type) continue;
    add(type, event.ms + BUILD_TIME_S[type]! * 1000);
  }

  return byType;
}

/** Drops orders whose finish time has already passed as of `atMs` from the
 *  front of every producer's queue. Finish times chain non-decreasingly
 *  down a producer's FIFO, so only the front can ever be due. */
function retire(producers: readonly ProducerInstance[], atMs: number): void {
  for (const producer of producers) {
    while (producer.queue.length > 0 && producer.queue[0]!.finishMs <= atMs) producer.queue.shift();
  }
}

function producersOfType(byType: Map<string, ProducerInstance[]>, type: string, atMs: number): ProducerInstance[] {
  const list = byType.get(type) ?? [];
  retire(list, atMs);
  return list.filter((p) => p.availableAt <= atMs);
}

interface QueueSlot {
  producer: ProducerInstance;
  index: number;
  order: ReplayEvent;
}

function findExactSlot(producers: readonly ProducerInstance[], id: string, slot: number): QueueSlot | undefined {
  let best: QueueSlot | undefined;
  for (const producer of producers) {
    const occupant = producer.queue[slot];
    if (occupant && occupant.order.id === id && (!best || occupant.order.ms > best.order.ms)) {
      best = { producer, index: slot, order: occupant.order };
    }
  }
  return best;
}

function findMostRecentPending(producers: readonly ProducerInstance[], id: string): QueueSlot | undefined {
  let best: QueueSlot | undefined;
  for (const producer of producers) {
    for (let index = 0; index < producer.queue.length; index++) {
      const entry = producer.queue[index]!;
      if (entry.order.id === id && (!best || entry.order.ms > best.order.ms)) {
        best = { producer, index, order: entry.order };
      }
    }
  }
  return best;
}

/**
 * The shared per-producer FIFO simulation behind `computeCancelledOrders`
 * and `filterLikelyRejected` — see the feature spec's "design input from
 * F001's scrutiny" section. Processes `events` (unit/hero orders and,
 * when present, cancels) chronologically against real per-producer
 * production queues, capacity `capacity`:
 *  - an order for id `X` is routed to the available producer of
 *    `PRODUCER_OF[X]` with the fewest in-flight orders (< capacity);
 *    if every available producer is full it is rejected. Ids with no
 *    producer, and tavern heroes, are always accepted (no queue).
 *  - a cancel removes the occupant of its `slot` (0 = the unit in
 *    production) from whichever producer of `PRODUCER_OF[X]` currently
 *    holds `X` there — ties broken by the most recently ordered producer;
 *    with no exact-slot match it falls back to the most recent still
 *    -pending order of `X` anywhere; with nothing pending it is ignored.
 *    Removing an order frees its slot for later orders.
 */
function simulate(
  events: readonly ReplayEvent[],
  buildings: readonly ReplayEvent[],
  capacity: number,
): { rejected: ReadonlySet<ReplayEvent>; cancelled: ReadonlySet<ReplayEvent> } {
  const byType = buildProducers(buildings);
  const rejected = new Set<ReplayEvent>();
  const cancelled = new Set<ReplayEvent>();

  for (const event of events) {
    if (event.kind === "cancel") {
      const type = PRODUCER_OF[event.id];
      if (!type || type === "tavern") continue;
      const producers = producersOfType(byType, type, event.ms);
      const slot = event.slot ?? 0;
      const target = findExactSlot(producers, event.id, slot) ?? findMostRecentPending(producers, event.id);
      if (!target) continue;
      target.producer.queue.splice(target.index, 1);
      cancelled.add(target.order);
      continue;
    }

    if (event.kind !== "unit" && event.kind !== "hero") continue;

    const type = PRODUCER_OF[event.id];
    if (!type || type === "tavern") continue; // always accepted, no queue tracking

    const withRoom = producersOfType(byType, type, event.ms).filter((p) => p.queue.length < capacity);
    if (withRoom.length === 0) {
      rejected.add(event);
      continue;
    }
    withRoom.sort((a, b) => a.queue.length - b.queue.length || a.availableAt - b.availableAt);
    const chosen = withRoom[0]!;
    const lastFinish = chosen.queue.length > 0 ? chosen.queue[chosen.queue.length - 1]!.finishMs : -Infinity;
    const trainS = TRAIN_TIME_S[event.id] ?? 0;
    chosen.queue.push({ order: event, finishMs: Math.max(event.ms, lastFinish) + trainS * 1000 });
  }

  return { rejected, cancelled };
}

/**
 * F002: replaces F001's per-id FIFO (`computeFinishTimes`/
 * `computeCancelledOrders` formerly in `extractBuild.ts`) with the correct
 * per-producer, per-slot model — see the feature spec's "design input from
 * F001's scrutiny" section for the three divergences this fixes. Returns
 * the set of unit/hero orders (matched by reference) the game actually
 * cancelled.
 */
export function computeCancelledOrders(
  sortedEvents: readonly ReplayEvent[],
  buildings: readonly ReplayEvent[],
): ReadonlySet<ReplayEvent> {
  const relevant = sortedEvents.filter((e) => e.kind === "unit" || e.kind === "hero" || e.kind === "cancel");
  if (!relevant.some((e) => e.kind === "cancel")) return new Set();
  return simulate(relevant, buildings, QUEUE_CAPACITY).cancelled;
}

/**
 * F002: the opt-in "likely rejected" filter (scope item 1). `orders` are
 * the surviving unit/hero orders after `computeCancelledOrders` has already
 * removed the game's own cancels — this function only ever adds a *further*
 * capacity-based rejection on top, it never un-cancels anything.
 */
export function filterLikelyRejected(
  orders: readonly RawOrder[],
  buildings: readonly ReplayEvent[],
  opts: FilterLikelyRejectedOptions = {},
): { accepted: RawOrder[]; dropped: DroppedInfo } {
  const capacity = opts.capacity ?? QUEUE_CAPACITY;
  const { rejected } = simulate(orders, buildings, capacity);

  const accepted: RawOrder[] = [];
  const byId: Record<string, number> = {};
  const orderIndices: number[] = [];

  orders.forEach((order, index) => {
    if (rejected.has(order)) {
      byId[order.id] = (byId[order.id] ?? 0) + 1;
      orderIndices.push(index);
    } else {
      accepted.push(order);
    }
  });

  return { accepted, dropped: { count: orderIndices.length, byId, orderIndices } };
}
