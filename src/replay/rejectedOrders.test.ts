import { describe, expect, it } from "vitest";
import { computeCancelledOrders, filterLikelyRejected } from "./rejectedOrders";
import type { ReplayEvent } from "./types";

function unit(id: string, ms: number): ReplayEvent {
  return { kind: "unit", id, ms };
}

function building(id: string, ms: number): ReplayEvent {
  return { kind: "building", id, ms };
}

function cancel(id: string, ms: number, slot?: number): ReplayEvent {
  return { kind: "cancel", id, ms, slot };
}

describe("computeCancelledOrders — F001-scrutiny cases (F002 per-producer/slot simulation)", () => {
  it("(1) cross-group: hpea@1s, hpea@12s, cancel slot 0 @14s — the unit in production (0:01) is killed, the 0:12 order survives", () => {
    const events = [unit("hpea", 1_000), unit("hpea", 12_000), cancel("hpea", 14_000, 0)];
    const removed = computeCancelledOrders(events, events);
    expect(removed.has(events[0]!)).toBe(true); // the 0:01 order (queue head) — killed
    expect(removed.has(events[1]!)).toBe(false); // the 0:12 order survives
    expect(removed.size).toBe(1);
  });

  it("(2) parallel producers: two hfoo (one per Barracks) both finish at +20s; a cancel at +25s (after both finished) is ignored", () => {
    const events = [
      building("hbar", 0),
      building("hbar", 0),
      unit("hfoo", 60_000),
      unit("hfoo", 60_000),
      cancel("hfoo", 85_000), // +25s after the 60_000 orders, both already finished (60_000+20_000=80_000)
    ];
    const removed = computeCancelledOrders(events, events);
    expect(removed.size).toBe(0);
  });

  it("(3) a fully cancelled first order does not anchor the merged step — computeCancelledOrders correctly marks only the first order cancelled", () => {
    const events = [building("hbar", 0), unit("hfoo", 61_000), cancel("hfoo", 62_000, 0), unit("hfoo", 65_000)];
    const removed = computeCancelledOrders(events, events);
    expect(removed.has(events[1]!)).toBe(true);
    expect(removed.has(events[3]!)).toBe(false);
    expect(removed.size).toBe(1);
  });

  it("a cancel with no matching pending order anywhere is ignored", () => {
    const events = [cancel("hpea", 5_000, 0)];
    expect(() => computeCancelledOrders(events, events)).not.toThrow();
    expect(computeCancelledOrders(events, events).size).toBe(0);
  });
});

describe("filterLikelyRejected", () => {
  it("7 hfoo orders within 1s with one Barracks: 5 accepted, 2 dropped (byId.hfoo === 2)", () => {
    const buildings = [building("hbar", 0)]; // available at 60_000
    const orders = Array.from({ length: 7 }, (_, i) => unit("hfoo", 61_000 + i * 100));
    const { accepted, dropped } = filterLikelyRejected(orders, buildings);
    expect(accepted).toHaveLength(5);
    expect(dropped.count).toBe(2);
    expect(dropped.byId.hfoo).toBe(2);
    expect(dropped.orderIndices).toEqual([5, 6]);
  });

  it("with a 2nd Barracks completed 10s earlier: all 7 accepted", () => {
    const buildings = [building("hbar", 0), building("hbar", 61_000)]; // 2nd available at 121_000
    const orders = Array.from({ length: 7 }, (_, i) => unit("hfoo", 131_000 + i * 100));
    const { accepted, dropped } = filterLikelyRejected(orders, buildings);
    expect(accepted).toHaveLength(7);
    expect(dropped.count).toBe(0);
  });

  it("an order at t where the earliest in-flight order finishes at t-1 is accepted", () => {
    const buildings = [building("hbar", 0)]; // available at 60_000
    const orders = [
      unit("hfoo", 60_000), // finishes at 80_000
      unit("hfoo", 61_000), // finishes at 100_000
      unit("hfoo", 62_000), // finishes at 120_000
      unit("hfoo", 63_000), // finishes at 140_000
      unit("hfoo", 64_000), // finishes at 160_000 — 5 in flight, queue full
      unit("hfoo", 80_001), // earliest in-flight (80_000) finished at t-1 → accepted
    ];
    const { accepted, dropped } = filterLikelyRejected(orders, buildings);
    expect(accepted).toHaveLength(6);
    expect(dropped.count).toBe(0);
  });

  it("workers on the starting hall are accepted from t = 0 with no Build event needed", () => {
    const { accepted, dropped } = filterLikelyRejected([unit("hpea", 0)], []);
    expect(accepted).toHaveLength(1);
    expect(dropped.count).toBe(0);
  });

  it("a tier-up (hkee Build event) does not add a second Town Hall producer", () => {
    const buildings = [building("hkee", 0)];
    const orders = Array.from({ length: 6 }, (_, i) => unit("hpea", i * 10));
    const { accepted, dropped } = filterLikelyRejected(orders, buildings);
    expect(accepted).toHaveLength(5); // still capacity 5 — the tier-up did not add a producer
    expect(dropped.count).toBe(1);
    expect(dropped.byId.hpea).toBe(1);
  });

  it("a tavern hero is always accepted", () => {
    const hero: ReplayEvent = { kind: "hero", id: "Nngs", ms: 0 };
    const { accepted, dropped } = filterLikelyRejected([hero], []);
    expect(accepted).toHaveLength(1);
    expect(dropped.count).toBe(0);
  });

  it("an id without a producer is always accepted, even issued 10 times instantly", () => {
    const orders = Array.from({ length: 10 }, () => unit("hmil", 0));
    const { accepted, dropped } = filterLikelyRejected(orders, []);
    expect(accepted).toHaveLength(10);
    expect(dropped.count).toBe(0);
  });
});
