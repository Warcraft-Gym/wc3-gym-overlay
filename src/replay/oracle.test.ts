import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReplay } from "./parseReplay";
import { describeId } from "./idMap";
import { HALL_LINE, PRODUCER_OF } from "./gameData";
import { oracleBuildItems, oracleCancelItems, type OracleFixture, type OracleItem } from "./__fixtures__/oracle";
import type { ReplayEvent } from "./types";

/**
 * F002: proves our resolved cancels — and, as a parity check that goes
 * beyond cancels, every build/train/hero event — match the wc3.no /
 * w3tools ground truth (`LICENSE-w3gjs.txt`) for the first 8:00 of three
 * real ladder replays. Contract C-802.
 */

const FIXTURES_DIR = join(__dirname, "__fixtures__");
const TOLERANCE_MS = 1_500;
const CUTOFF_MS = 480_000;

function loadReplay(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES_DIR, name)));
}

function loadOracle(name: string): OracleFixture {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf-8")) as OracleFixture;
}

/** Both sides are already chronologically ordered (the oracle's own
 *  `buildOrderItems`, and `parseReplay`'s per-player `events`) — a
 *  positional diff is the "order-preserving" comparison the contract asks
 *  for. Reported as one aggregate failure so a mismatch is easy to read. */
function expectItemsMatch(ours: OracleItem[], oracle: OracleItem[], label: string): void {
  const render = (items: OracleItem[]) => items.map((i) => `${i.kind}:${i.id}@${i.ms}`).join("\n");
  expect(ours.length, `${label}: length mismatch\nours:\n${render(ours)}\noracle:\n${render(oracle)}`).toBe(
    oracle.length,
  );
  oracle.forEach((expected, index) => {
    const actual = ours[index]!;
    expect(actual.kind, `${label}[${index}]`).toBe(expected.kind);
    expect(actual.id, `${label}[${index}]`).toBe(expected.id);
    expect(Math.abs(actual.ms - expected.ms), `${label}[${index}] ms delta`).toBeLessThanOrEqual(TOLERANCE_MS);
  });
}

/** wc3.no/w3tools classifies two of our `"unit"`/`"building"` categories
 *  differently, so they're excluded from this comparison (not from
 *  `parseReplay`'s real output — this is purely how the oracle itself
 *  categorises things):
 *   - mercenary-camp hires (`PRODUCER_OF[id] === undefined` for a `"unit"`
 *     — see `gameData.ts`'s "never queued" docblock) show up as `"Hire"`,
 *     not `"Build unit"`;
 *   - tower tiers (`HALL_LINE`, an in-place upgrade just like Keep/Castle)
 *     show up as `"Upgrade"`, not `"Build building"` (verified against
 *     `oracle_6a87c0c1f214d632276e68be.json`'s Scout/Guard/Arcane Tower
 *     chain). */
function ourBuildItems(events: readonly ReplayEvent[]): OracleItem[] {
  return events
    .filter((e) => (e.kind === "unit" || e.kind === "building" || e.kind === "hero") && e.ms <= CUTOFF_MS)
    .filter((e) => !(e.kind === "unit" && PRODUCER_OF[e.id] === undefined))
    .filter((e) => !(e.kind === "building" && e.id in HALL_LINE))
    .map((e) => ({ kind: e.kind as OracleItem["kind"], id: e.id, ms: e.ms }));
}

/** A cancel `ReplayEvent`'s own `kind` is always the literal `"cancel"` —
 *  its *effective* kind (unit/hero/building), for comparison against the
 *  oracle's `Cancel unit|hero|building` items, comes from what its `id`
 *  actually describes. */
function ourCancelItems(events: readonly ReplayEvent[]): OracleItem[] {
  return events
    .filter((e) => e.kind === "cancel" && e.ms <= CUTOFF_MS)
    .map((e) => ({ kind: describeId(e.id).kind as OracleItem["kind"], id: e.id, ms: e.ms }))
    .filter((e) => e.kind === "unit" || e.kind === "hero" || e.kind === "building");
}

const FIXTURE_TIMEOUT_MS = 15_000;

describe("oracle parity (C-802)", () => {
  const cases: { replay: string; oracleFile: string }[] = [
    { replay: "w3c_6a87c0c1f214d632276e68be_shallow_grave.w3g", oracleFile: "oracle_6a87c0c1f214d632276e68be.json" },
    { replay: "w3c_6aaef370d867fad24f913624_echo_isles.w3g", oracleFile: "oracle_6aaef370d867fad24f913624.json" },
    {
      replay: "w3c_6aaef285d867fad24f9135d5_autumn_leaves.w3g",
      oracleFile: "oracle_6aaef285d867fad24f9135d5.json",
    },
  ];

  for (const { replay, oracleFile } of cases) {
    it(
      `${replay}: our cancel and build/train/hero events match the oracle`,
      async () => {
        const summary = await parseReplay(loadReplay(replay));
        const oracle = loadOracle(oracleFile);

        for (const oraclePlayer of oracle.playerBuildOrders) {
          const player = summary.players.find((p) => p.name === oraclePlayer.playerName);
          expect(player, `${replay}: no matching player for oracle name "${oraclePlayer.playerName}"`).toBeDefined();
          const events = summary.events[player!.id] ?? [];

          expectItemsMatch(
            ourCancelItems(events),
            oracleCancelItems(oraclePlayer),
            `${replay}/${oraclePlayer.playerName} cancels`,
          );

          expectItemsMatch(
            ourBuildItems(events),
            oracleBuildItems(oraclePlayer),
            `${replay}/${oraclePlayer.playerName} builds`,
          );
        }
      },
      FIXTURE_TIMEOUT_MS,
    );
  }
});
