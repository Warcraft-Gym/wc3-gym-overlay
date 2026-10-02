/**
 * F009 (plan-vs-actual-engine) – `reviewSchema`'s shape, and
 * `LAST_REVIEW`'s "malformed stored value falls back to the default"
 * contract (the same guarantee every other store key gets from
 * `store/state.ts`'s `readKey`, exercised directly here for this key).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_REVIEW } from "../store/keys";
import { readKey } from "../store/state";
import { reviewSchema, type Review } from "./types";

function validReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
    status: "ok",
    map: "lastrefuge.anon",
    duration: "11:03",
    players: [
      { id: 1, name: "Me#1234", race: "orc", steps: [{ time: "0:01", supply: 5, instruction: "Train Peon", icon: "or-peon" }] },
      { id: 2, name: "Foe#5678", race: "undead", steps: [] },
    ],
    meId: 1,
    meStatus: "resolved",
    plan: {
      slug: "some-build",
      title: "Some Build",
      race: "orc",
      steps: [{ time: "0:00", supply: 5, instruction: "Train Peon", icon: "or-peon" }],
    },
    comparison: {
      rows: [
        {
          index: 0,
          plan: { time: "0:00", supply: 5, instruction: "Train Peon", icon: "or-peon" },
          actual: { time: "0:01", supply: 5 },
          supplyDelta: 0,
          timeDelta: 1,
          status: "on-plan",
        },
      ],
      extras: [],
      summary: { total: 1, onPlan: 1, early: 0, late: 0, missed: 0, firstSlip: null },
    },
    seen: false,
    ...overrides,
  };
}

describe("reviewSchema", () => {
  it("accepts a full ok review", () => {
    expect(reviewSchema.safeParse(validReview()).success).toBe(true);
  });

  it("accepts an error review with empty players/map/duration and a null comparison", () => {
    const errorReview: Review = {
      ...validReview(),
      status: "error",
      error: "Couldn't reach warcraft-gym.com. Check your connection.",
      map: "",
      duration: "",
      players: [],
      meId: null,
      meStatus: "unresolved",
      comparison: null,
    };
    expect(reviewSchema.safeParse(errorReview).success).toBe(true);
  });

  it("accepts plan: null (no build was selected)", () => {
    expect(reviewSchema.safeParse(validReview({ plan: null, comparison: null })).success).toBe(true);
  });

  it("rejects a missing source", () => {
    const broken: Record<string, unknown> = validReview();
    delete broken.source;
    expect(reviewSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an unknown meStatus value", () => {
    expect(reviewSchema.safeParse(validReview({ meStatus: "maybe" as never })).success).toBe(false);
  });
});

describe("LAST_REVIEW – malformed stored value falls back to the default (null)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("falls back to null on unparsable JSON", () => {
    localStorage.setItem(LAST_REVIEW.name, "{not json");
    expect(readKey(LAST_REVIEW)).toBeNull();
  });

  it("falls back to null when the shape fails schema validation", () => {
    localStorage.setItem(LAST_REVIEW.name, JSON.stringify({ id: "r1" }));
    expect(readKey(LAST_REVIEW)).toBeNull();
  });

  it("returns a valid stored review unchanged", () => {
    const review = validReview();
    localStorage.setItem(LAST_REVIEW.name, JSON.stringify(review));
    expect(readKey(LAST_REVIEW)).toEqual(review);
  });
});
