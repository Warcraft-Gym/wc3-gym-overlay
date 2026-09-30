/**
 * Zod schemas mirroring the F001 public JSON API DTO exactly — see
 * `src/lib/builds/serialize.ts` and `src/lib/builds/types.ts` in the Next
 * site. Unknown extra keys are stripped (default `z.object` behaviour), not
 * rejected, so the overlay tolerates additive API changes.
 *
 * `patch` / `authorDiscord` / `maintainer` / `sourceUrl` are `.nullable()` in
 * addition to `.optional()`: the live API (backed by Sanity, which stores an
 * unset optional field as `null` rather than omitting the key) serializes
 * every build with these four keys present and `null` when unset. Every
 * build fetched from `http://localhost:3111/api/builds` failed validation
 * with `expected string, received null` before this fix — see the F003
 * handoff for the repro.
 *
 * `vsRaces` (F005): the site changed a build's opponent from a single value
 * to `vsRaces: BuildRace[]` (empty means "any opponent"). The API only
 * emits the array field now — the old singular field is dropped from the
 * schema entirely. Because unknown extra keys are stripped rather than
 * rejected, a payload that still carries the legacy singular key (with no
 * array field) parses fine and simply falls back to the `.default([])` —
 * "any" — rather than failing validation.
 */

import { z } from "zod";

export const apiBuildStepSchema = z.object({
  time: z.string().optional(),
  supply: z.number().optional(),
  instruction: z.string(),
  icon: z.string().optional(),
  iconUrl: z.string().optional(),
});

// Exported so `store/keys.ts` can build the local-build schema (F002) off
// the same race/difficulty enums instead of re-declaring them.
export const raceSchema = z.enum(["human", "orc", "nightelf", "undead"]);
export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

const guideSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
  })
  .nullable()
  .optional();

export const apiBuildListItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  race: raceSchema,
  vsRaces: z.array(raceSchema).default([]),
  difficulty: difficultySchema,
  patch: z.string().nullable().optional(),
  tags: z.array(z.string()),
  summary: z.string(),
  author: z.string(),
  authorDiscord: z.string().nullable().optional(),
  maintainer: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  guide: guideSchema,
  featured: z.boolean(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(apiBuildStepSchema),
});

export const apiBuildSchema = apiBuildListItemSchema.extend({
  description: z.array(z.unknown()).optional(),
});

export const buildsListResponseSchema = z.object({
  builds: z.array(apiBuildListItemSchema),
});

export const buildResponseSchema = z.object({
  build: apiBuildSchema,
});

/**
 * F003: mirrors the site's `GameIcon` (`src/lib/builds/icons.ts`) plus the
 * `url` its `/api/icons` route stamps on. Exported so `store/keys.ts` can
 * build `ICONS_CACHE`'s schema off the same shape instead of re-declaring
 * it, same pattern as `raceSchema`/`difficultySchema` above.
 *
 * F004d: the site added `kind: "ability"` on 2026-09-22 (150 of 832 icons
 * in the production catalogue at the time — see
 * `__fixtures__/icons.production.json`, captured 2026-09-30) with no
 * announcement. `gameIconEntrySchema`/`iconsResponseSchema` below are kept
 * *strict* — every `kind`/`race` must be one this build recognises — because
 * they also back `ICONS_CACHE`'s persisted schema (`store/keys.ts`) and
 * every entry that ever reaches that cache has already been normalised by
 * `parseIconsResponse` below, so strict-parsing it back out is a sanity
 * check, not a risk. The network response itself is *not* strict-parsed
 * with these: `parseIconsResponse` validates it tolerantly, because a site
 * deploy can add another new `kind`/`race` at any time and one unrecognised
 * enum value must never blank out the other 831 entries again (see the
 * F004d defect: it silently reproduces for every user once 0.5.0's new
 * default `apiBase` means no cache from an old `apiBase` is around to
 * mask it).
 */
export const iconRaceSchema = z.enum(["human", "orc", "nightelf", "undead", "neutral"]);
export const iconKindSchema = z.enum(["hero", "unit", "building", "upgrade", "misc", "ability"]);

export const gameIconEntrySchema = z.object({
  key: z.string(),
  title: z.string(),
  race: iconRaceSchema,
  kind: iconKindSchema,
  url: z.string(),
});

export const iconsResponseSchema = z.object({
  icons: z.array(gameIconEntrySchema),
});

/**
 * Loose shape for an icon entry straight off the wire: `key`/`title`/`url`
 * are required strings (a malformed entry missing one of those is useless
 * and gets dropped — that part of the defect, an entry that doesn't even
 * have the right shape, was never observed and isn't what this fixes), but
 * `race`/`kind` are only required to be *strings*, not one of the enum
 * values this build currently knows about.
 */
const rawGameIconEntrySchema = z.object({
  key: z.string(),
  title: z.string(),
  race: z.string(),
  kind: z.string(),
  url: z.string(),
});

const rawIconsResponseSchema = z.object({
  icons: z.array(rawGameIconEntrySchema),
});

export type ParsedIconsResponse = {
  icons: GameIconEntry[];
  /** Distinct `kind` values seen that this build doesn't recognise, mapped
   *  to `"misc"` in `icons` above. Empty when every entry's `kind` was
   *  recognised. */
  unknownKinds: string[];
  /** Same as `unknownKinds`, for `race` (mapped to `"neutral"`). */
  unknownRaces: string[];
};

/**
 * F004d: the tolerant counterpart to `iconsResponseSchema.safeParse` used
 * by `fetchIcons` — validates the outer `{ icons: [...] }` shape and each
 * entry's structural fields (`key`/`title`/`url`) strictly (`.parse`
 * throws, same "reject the whole response" behaviour as before, for a
 * response that isn't even shaped like an icon manifest), but maps an
 * entry's unrecognised `kind`/`race` to a safe fallback instead of
 * rejecting the entry, let alone the whole response. Every fallen-back
 * value is reported back (deduplicated) so the caller can log one warning
 * naming them, instead of either failing silently or logging once per
 * entry (150 of 832 entries currently carry `kind: "ability"` — a
 * per-entry warning would be 150 lines).
 */
export function parseIconsResponse(raw: unknown): ParsedIconsResponse {
  const { icons: rawIcons } = rawIconsResponseSchema.parse(raw);
  const unknownKinds = new Set<string>();
  const unknownRaces = new Set<string>();
  const icons = rawIcons.map((entry): GameIconEntry => {
    const kind = iconKindSchema.safeParse(entry.kind);
    if (!kind.success) unknownKinds.add(entry.kind);
    const race = iconRaceSchema.safeParse(entry.race);
    if (!race.success) unknownRaces.add(entry.race);
    return {
      key: entry.key,
      title: entry.title,
      url: entry.url,
      kind: kind.success ? kind.data : "misc",
      race: race.success ? race.data : "neutral",
    };
  });
  return { icons, unknownKinds: [...unknownKinds], unknownRaces: [...unknownRaces] };
}

export type ApiBuildStep = z.infer<typeof apiBuildStepSchema>;
export type ApiBuildListItem = z.infer<typeof apiBuildListItemSchema>;
export type ApiBuild = z.infer<typeof apiBuildSchema>;
export type BuildsListResponse = z.infer<typeof buildsListResponseSchema>;
export type BuildResponse = z.infer<typeof buildResponseSchema>;
export type GameIconEntry = z.infer<typeof gameIconEntrySchema>;
export type IconsResponse = z.infer<typeof iconsResponseSchema>;
export type IconRace = z.infer<typeof iconRaceSchema>;
export type IconKind = z.infer<typeof iconKindSchema>;
