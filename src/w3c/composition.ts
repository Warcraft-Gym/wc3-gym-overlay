/**
 * The opponent's usual army: which units they train against your race.
 *
 * W3Champions has no unit breakdown (its score sheets only say "45 units
 * produced"), so this reads the replays themselves through our site's
 * replay importer: `POST ${apiBase}/api/replay-import` with `{ match }`
 * makes the site download the W3Champions replay and return every step
 * ("Train 3× Dryad"). About 1.5 s per game, measured 2026-10-03.
 *
 * The schema here is deliberately lenient (only the fields read below):
 * the composition must not fail because of an unrelated field.
 */

import { z } from "zod";

/** Replays parsed per opponent (one request each, 2 at a time). */
export const COMPOSITION_GAMES = 5;
/** Units shown on the card. */
export const UNITS_SHOWN = 5;
/** Trained continuously, so they say nothing about the army. */
export const WORKER_ICONS: readonly string[] = ["hu-peasant", "or-peon", "ud-acolyte", "ne-wisp"];

const stepSchema = z.object({ instruction: z.string(), icon: z.string().optional() });
const importSchema = z.object({
  players: z.array(z.object({ name: z.string(), build: z.object({ steps: z.array(stepSchema) }) })),
});
export type ImportedSteps = z.infer<typeof stepSchema>[];

export const compositionSchema = z.object({
  games: z.number(),
  units: z.array(
    z.object({
      name: z.string(),
      icon: z.string().nullable(),
      /** Average trained per game, over all `games`. */
      perGame: z.number(),
      /** In how many of the games they trained it at all. */
      inGames: z.number(),
    }),
  ),
});
export type Composition = z.infer<typeof compositionSchema>;

/** One W3Champions game's steps for `playerTag`, via our replay importer. */
export async function fetchMatchSteps(apiBase: string, matchId: string, playerTag: string, signal?: AbortSignal): Promise<ImportedSteps | null> {
  const response = await fetch(`${apiBase}/api/replay-import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ match: matchId, cutoffSeconds: 3600, includeUpgrades: false, includeItems: false }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`replay import answered ${response.status} for ${matchId}`);
  const parsed = importSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`replay import reply for ${matchId} failed validation`);
  const player = parsed.data.players.find((p) => p.name.toLowerCase() === playerTag.toLowerCase());
  return player ? player.build.steps : null;
}

const TRAIN = /^Train (?:(\d+)[×x] )?(.+)$/;

/** Units trained per game, averaged, most-trained first; workers excluded. */
export function buildComposition(games: ImportedSteps[]): Composition | null {
  if (games.length === 0) return null;
  const totals = new Map<string, { icon: string | null; total: number; inGames: number }>();
  for (const steps of games) {
    const seen = new Set<string>();
    for (const step of steps) {
      const match = TRAIN.exec(step.instruction);
      if (!match || (step.icon && WORKER_ICONS.includes(step.icon))) continue;
      const name = match[2];
      const entry = totals.get(name) ?? { icon: step.icon ?? null, total: 0, inGames: 0 };
      entry.total += Number(match[1] ?? 1);
      if (!seen.has(name)) {
        entry.inGames++;
        seen.add(name);
      }
      totals.set(name, entry);
    }
  }
  const units = [...totals.entries()]
    .map(([name, e]) => ({ name, icon: e.icon, perGame: Math.round((e.total / games.length) * 10) / 10, inGames: e.inGames }))
    .sort((a, b) => b.perGame - a.perGame || a.name.localeCompare(b.name))
    .slice(0, UNITS_SHOWN);
  return { games: games.length, units };
}
