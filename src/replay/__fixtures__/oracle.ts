/**
 * F002: converts a wc3.no / w3tools ground-truth `oracle_<matchId>.json`
 * fixture (attribution: `LICENSE-w3gjs.txt`) into the same
 * `{ kind, id, ms }` shape `parseReplay.ts` emits, so `oracle.test.ts` can
 * diff them directly. See the feature plan's F002 section.
 */

import { ID_MAP } from "../idMap";
import type { IdKind, ReplayRace } from "../types";

export interface OracleFixture {
  replayName: string;
  playerBuildOrders: { playerName: string; buildOrderItems: { timeSpan: string; type: string; obj: string }[] }[];
}

export interface OracleItem {
  kind: IdKind;
  id: string;
  ms: number;
}

const CUTOFF_MS = 480_000;

const BUILD_TYPES = new Set(["Build unit", "Build building", "Build hero"]);
const CANCEL_TYPES = new Set(["Cancel unit", "Cancel building", "Cancel hero"]);

const TYPE_KIND: Record<string, IdKind> = {
  "Build unit": "unit",
  "Cancel unit": "unit",
  "Build building": "building",
  "Cancel building": "building",
  "Build hero": "hero",
  "Cancel hero": "hero",
};

/** Oracle object names that don't match `ID_MAP`'s title verbatim, or that
 *  are ambiguous (two ids share a title — the first `ID_MAP` entry, in
 *  declaration order, always wins the reverse lookup below; these aliases
 *  exist only for names that wouldn't resolve at all otherwise). */
const NAME_ALIASES: Record<string, string> = {
  "Troll Berserker": "otbk",
  Berserker: "otbk",
  "Reinforced Orc Burrow": "orbr",
  // wc3.no shows the trained id (Headhunter) even once the unit is later
  // upgraded in place into a Berserker — verified against
  // `oracle_6aaef370d867fad24f913624.json` (Echo Isles).
  "Troll Headhunter / Berserker": "ohun",
  // The oracle's apostrophe is U+2019 (curly), ID_MAP's is a plain "'".
  "Hunter’s Hall": "edob",
};

/** `ID_MAP` id -> the first letter its FourCC always starts with for that
 *  race (case-insensitive: heroes are capitalised, units/buildings
 *  aren't). A small number of titles are shared *across* races (only
 *  "Barracks" today — `hbar`/`obar`) and would otherwise always resolve to
 *  whichever id happens to come first in `ID_MAP`'s declaration order,
 *  regardless of which race actually built it. */
const RACE_PREFIX: Record<ReplayRace, string> = { human: "h", orc: "o", nightelf: "e", undead: "u", random: "" };

function buildReverseTitleMap(prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, entry] of Object.entries(ID_MAP)) {
    if (prefix && id[0]?.toLowerCase() !== prefix) continue;
    if (!map.has(entry.title)) map.set(entry.title, id);
  }
  return map;
}

/** A global (race-agnostic) reverse map for ids `RACE_PREFIX` can't
 *  disambiguate anyway (neutral/tavern heroes, mercenary-camp units) —
 *  consulted when the race-specific map above has no entry. */
const REVERSE_TITLE_GLOBAL = buildReverseTitleMap("");
const REVERSE_TITLE_BY_RACE: Record<ReplayRace, Map<string, string>> = {
  human: buildReverseTitleMap(RACE_PREFIX.human),
  orc: buildReverseTitleMap(RACE_PREFIX.orc),
  nightelf: buildReverseTitleMap(RACE_PREFIX.nightelf),
  undead: buildReverseTitleMap(RACE_PREFIX.undead),
  random: REVERSE_TITLE_GLOBAL,
};

/** `"HH:MM:SS.fffffff"` -> ms. The oracle's fractional seconds carry more
 *  digits than a millisecond needs; `Number(...)` truncates cleanly. */
function parseTimeSpanMs(timeSpan: string): number {
  const [hours, minutes, secondsRaw] = timeSpan.split(":");
  const seconds = Number(secondsRaw);
  return (Number(hours) * 3600 + Number(minutes) * 60 + seconds) * 1000;
}

function resolveId(name: string, race: ReplayRace): string {
  const alias = NAME_ALIASES[name];
  if (alias) return alias;
  const id = REVERSE_TITLE_BY_RACE[race].get(name) ?? REVERSE_TITLE_GLOBAL.get(name);
  if (!id) throw new Error(`oracle.ts: no id mapping for oracle object name "${name}"`);
  return id;
}

/** Every `Build unit|building|hero` item in the first 8:00, in the oracle's
 *  own (chronological) order. `race` disambiguates ids two races' ids share
 *  a title for (see `RACE_PREFIX`). */
export function oracleBuildItems(player: OracleFixture["playerBuildOrders"][number], race: ReplayRace): OracleItem[] {
  return player.buildOrderItems
    .filter((item) => BUILD_TYPES.has(item.type))
    .map((item) => ({ kind: TYPE_KIND[item.type]!, id: resolveId(item.obj, race), ms: parseTimeSpanMs(item.timeSpan) }))
    .filter((item) => item.ms <= CUTOFF_MS);
}

/** Every `Cancel unit|building|hero` item in the first 8:00. */
export function oracleCancelItems(player: OracleFixture["playerBuildOrders"][number], race: ReplayRace): OracleItem[] {
  return player.buildOrderItems
    .filter((item) => CANCEL_TYPES.has(item.type))
    .map((item) => ({ kind: TYPE_KIND[item.type]!, id: resolveId(item.obj, race), ms: parseTimeSpanMs(item.timeSpan) }))
    .filter((item) => item.ms <= CUTOFF_MS);
}
