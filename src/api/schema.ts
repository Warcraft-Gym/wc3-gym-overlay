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
 */

import { z } from "zod";

export const apiBuildStepSchema = z.object({
  time: z.string().optional(),
  supply: z.number().optional(),
  instruction: z.string(),
  icon: z.string().optional(),
  iconUrl: z.string().optional(),
});

const raceSchema = z.enum(["human", "orc", "nightelf", "undead"]);
const vsRaceSchema = z.enum(["human", "orc", "nightelf", "undead", "any"]);
const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

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
  vsRace: vsRaceSchema,
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

export type ApiBuildStep = z.infer<typeof apiBuildStepSchema>;
export type ApiBuildListItem = z.infer<typeof apiBuildListItemSchema>;
export type ApiBuild = z.infer<typeof apiBuildSchema>;
export type BuildsListResponse = z.infer<typeof buildsListResponseSchema>;
export type BuildResponse = z.infer<typeof buildResponseSchema>;
