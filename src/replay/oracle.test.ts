import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReplay } from "./parseReplay";
import { describeId } from "./idMap";
import { HALL_LINE, PRODUCER_OF } from "./gameData";
import { oracleBuildItems, oracleCancelItems, type OracleFixture, type OracleItem } from "./__fixtures__/oracle";
import type { ReplayEvent } from "./types";

/**
 * F002: proves we never miss a cancel, or a build/train/hero event, that
 * the wc3.no / w3tools ground truth (`LICENSE-w3gjs.txt`) reports, for the
 * first 8:00 of three real ladder replays. Contract C-802.
 *
 * Both comparisons share one shape: every oracle item must be matched
 * (kind, id, ms within tolerance, order-preserving) in our output — a miss
 * fails loudly, naming the missing item. Anything we emit beyond that is an
 * "extra"; extras are bounded per player and must literally equal a
 * hand-verified entry in `KNOWN_EXTRA_CANCELS` / `KNOWN_EXTRA_BUILDS,` so a
 * regression that introduces a *new* kind of extra, or removes one of
 * these, fails loudly instead of silently widening the tolerance.
 *
 * Known cancel extras: an Esc press on a producer whose queued unit the
 * game had already silently refused for lack of gold (we do not model
 * gold — see docs/overlay.md's "What an import can and cannot know"
 * section).
 *
 * Known build extra: a Tavern hire click for a hero the oracle does not
 * list (order flags `0x44`) — the game likely refused the hire, or the
 * oracle's parser skips Tavern hires entirely; see `KNOWN_EXTRA_BUILDS`.
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

interface KnownExtraItem {
  kind: OracleItem["kind"];
  id: string;
  msApprox: number;
}

const MAX_EXTRA_CANCELS = 2;
const MAX_EXTRA_BUILDS = 1;

/** Cancels we emit that the oracle doesn't report, verified by hand
 *  against each fixture's oracle JSON: an Esc press on a producer whose
 *  queued unit the game had already silently refused for lack of gold
 *  (we don't model gold — docs/overlay.md's "What an import can and
 *  cannot know" section). Nothing was actually pending, so the extra
 *  cancel is harmless — but it's listed literally, not just counted, so a
 *  *different* extra appearing (a real regression) or one of these
 *  disappearing (the fixture or the parser changed) fails loudly instead
 *  of passing by coincidence. Keyed by replay file name, then by the
 *  oracle's player name. */
const KNOWN_EXTRA_CANCELS: Record<string, Record<string, KnownExtraItem[]>> = {
  "w3c_6a87c0c1f214d632276e68be_shallow_grave.w3g": {
    "React#21633": [
      { kind: "unit", id: "uaco", msApprox: 21751 },
      { kind: "unit", id: "uaco", msApprox: 284670 },
    ],
  },
  "w3c_6aaef370d867fad24f913624_echo_isles.w3g": {
    "Deathmark#21320": [
      { kind: "unit", id: "hpea", msApprox: 98880 },
      { kind: "unit", id: "hfoo", msApprox: 304860 },
    ],
  },
  "w3c_6aaef285d867fad24f9135d5_autumn_leaves.w3g": {
    "Sonik#21222": [
      { kind: "unit", id: "ewsp", msApprox: 82591 },
      { kind: "unit", id: "ewsp", msApprox: 438301 },
    ],
  },
};

/** Build/train/hero extras we emit that the oracle doesn't report, verified
 *  by hand against each fixture's oracle JSON: a Tavern hire click (order
 *  flags `0x44`) for a hero the oracle never lists — either the game
 *  silently refused the hire (we don't model gold — see
 *  KNOWN_EXTRA_CANCELS's docblock) or the oracle's parser skips Tavern
 *  hires outright. Keyed the same way as `KNOWN_EXTRA_CANCELS`. */
const KNOWN_EXTRA_BUILDS: Record<string, Record<string, KnownExtraItem[]>> = {
  "w3c_6aaef285d867fad24f9135d5_autumn_leaves.w3g": {
    "Sonik#21222": [{ kind: "hero", id: "Npal", msApprox: 330661 }],
  },
};

/** Consumes every oracle item against an advancing cursor into `ours`
 *  (both are already chronological): each oracle item must find a
 *  same-kind/id, ms-within-tolerance match in `ours` at or after the
 *  cursor, or the assertion fails with exactly which oracle item went
 *  missing — this is the "no misses, order-preserving" guarantee shared by
 *  the cancel and build/train/hero comparisons. Whatever in `ours` is never
 *  claimed as a match is returned as the "extras" for the caller to bound
 *  and enumerate. */
function matchItemsReturningExtras(ours: OracleItem[], oracle: OracleItem[], label: string): OracleItem[] {
  const matchedOursIndices = new Set<number>();
  let cursor = 0;
  for (const expected of oracle) {
    const foundIndex = ours.findIndex(
      (actual, index) =>
        index >= cursor &&
        actual.kind === expected.kind &&
        actual.id === expected.id &&
        Math.abs(actual.ms - expected.ms) <= TOLERANCE_MS,
    );
    expect(
      foundIndex,
      `${label}: missed oracle item ${expected.kind}:${expected.id}@${expected.ms} — no matching event in ours ` +
        `at or after position ${cursor}`,
    ).toBeGreaterThanOrEqual(0);
    matchedOursIndices.add(foundIndex);
    cursor = foundIndex + 1;
  }
  return ours.filter((_, index) => !matchedOursIndices.has(index));
}

/** Extras must be both bounded (a regression that starts emitting many
 *  spurious events fails even if none happen to collide with a known
 *  entry) and literally enumerated against the caller's known-extras table
 *  (a *different* extra, in kind/id or count, fails even though it's
 *  within the bound). */
function expectExtrasAreKnown(extras: OracleItem[], known: KnownExtraItem[], label: string, maxExtras: number): void {
  const render = (items: { kind: string; id: string; ms: number }[]) =>
    items.map((i) => `${i.kind}:${i.id}@${i.ms}`).join("\n") || "(none)";
  expect(
    extras.length,
    `${label}: too many extras (max ${maxExtras})\nextras:\n${render(extras)}`,
  ).toBeLessThanOrEqual(maxExtras);
  expect(
    extras.length,
    `${label}: extras don't match the known-extras table\nextras:\n${render(extras)}\nknown:\n${render(
      known.map((k) => ({ kind: k.kind, id: k.id, ms: k.msApprox })),
    )}`,
  ).toBe(known.length);
  known.forEach((expected, index) => {
    const actual = extras[index]!;
    expect(actual.kind, `${label} extra[${index}]`).toBe(expected.kind);
    expect(actual.id, `${label} extra[${index}]`).toBe(expected.id);
    expect(Math.abs(actual.ms - expected.msApprox), `${label} extra[${index}] ms delta`).toBeLessThanOrEqual(
      TOLERANCE_MS,
    );
  });
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
          const race = player!.raceDetected !== "random" ? player!.raceDetected : player!.race;

          const cancelLabel = `${replay}/${oraclePlayer.playerName} cancels`;
          const cancelExtras = matchItemsReturningExtras(
            ourCancelItems(events),
            oracleCancelItems(oraclePlayer, race),
            cancelLabel,
          );
          expectExtrasAreKnown(
            cancelExtras,
            KNOWN_EXTRA_CANCELS[replay]?.[oraclePlayer.playerName] ?? [],
            cancelLabel,
            MAX_EXTRA_CANCELS,
          );

          const buildLabel = `${replay}/${oraclePlayer.playerName} builds`;
          const buildExtras = matchItemsReturningExtras(
            ourBuildItems(events),
            oracleBuildItems(oraclePlayer, race),
            buildLabel,
          );
          expectExtrasAreKnown(
            buildExtras,
            KNOWN_EXTRA_BUILDS[replay]?.[oraclePlayer.playerName] ?? [],
            buildLabel,
            MAX_EXTRA_BUILDS,
          );
        }
      },
      FIXTURE_TIMEOUT_MS,
    );
  }
});
