/**
 * localStorage keys used by the overlay app, each paired with a zod schema
 * (for validating whatever a browser/OS actually hands back) and a default
 * value used when the key is absent or fails validation.
 */

import { z } from "zod";
import {
  apiBuildListItemSchema,
  apiBuildStepSchema,
  difficultySchema,
  raceSchema,
  type ApiBuildListItem,
} from "../api/schema";
import { DEFAULT_API_BASE, DEFAULT_SHORTCUTS, LEGACY_API_BASES } from "../config";
import type { ShortcutMap } from "../host/bridge";

/** JSON key name of the pre-F005 single-opponent field, before the site's
 *  `vsRaces` array model shipped. */
const LEGACY_SINGLE_OPPONENT_KEY = "vsRace"; // legacy key, pre-F005

/**
 * F005 legacy-migration: a cache written before the site's `vsRaces` array
 * model shipped carries a single opponent field (see
 * `LEGACY_SINGLE_OPPONENT_KEY`) and no `vsRaces` array, so migrate it in
 * place before validating against the current API schema — same mapping as
 * the site's GROQ projection: `"any"`/unset → `[]`, otherwise a
 * single-element array.
 */
function migrateLegacyVsRace(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if ("vsRaces" in record || !(LEGACY_SINGLE_OPPONENT_KEY in record)) return raw;
  const { [LEGACY_SINGLE_OPPONENT_KEY]: legacyOpponent, ...rest } = record;
  return {
    ...rest,
    vsRaces: legacyOpponent === "any" || legacyOpponent === undefined ? [] : [legacyOpponent],
  };
}

const migratedBuildListItemSchema: z.ZodType<ApiBuildListItem> = z.preprocess(
  migrateLegacyVsRace,
  apiBuildListItemSchema,
);

export type StoreKey<T> = {
  readonly name: string;
  readonly schema: z.ZodType<T>;
  readonly defaultValue: () => T;
};

// --- wc3gym.selectedBuildSlug ---------------------------------------------

export type SelectedBuildSlug = string | null;

export const selectedBuildSlugSchema: z.ZodType<SelectedBuildSlug> = z.string().nullable();

export const SELECTED_BUILD_SLUG: StoreKey<SelectedBuildSlug> = {
  name: "wc3gym.selectedBuildSlug",
  schema: selectedBuildSlugSchema,
  defaultValue: () => null,
};

// --- wc3gym.buildsCache -----------------------------------------------------

export type BuildsCache = {
  fetchedAt: string;
  apiBase: string;
  builds: ApiBuildListItem[];
};

export const buildsCacheSchema: z.ZodType<BuildsCache> = z.object({
  fetchedAt: z.string(),
  apiBase: z.string(),
  builds: z.array(migratedBuildListItemSchema),
});

export const BUILDS_CACHE: StoreKey<BuildsCache> = {
  name: "wc3gym.buildsCache",
  schema: buildsCacheSchema,
  defaultValue: () => ({ fetchedAt: "", apiBase: DEFAULT_API_BASE, builds: [] }),
};

// --- wc3gym.timer ------------------------------------------------------------

export type TimerState = {
  startedAtMs: number | null;
  baseElapsedMs: number;
  /** Whether the user has pressed Play or a step shortcut since the last
   *  reset. `{ startedAtMs: null, baseElapsedMs: 0 }` alone can't tell
   *  "fresh, never touched" apart from "jumped to a step timed at 0:00 and
   *  paused" — both have identical `startedAtMs`/`baseElapsedMs`. Read
   *  through `isEngaged()` (`store/timer.ts`), which additionally treats a
   *  running timer or a nonzero `baseElapsedMs` as engaged, so this raw
   *  field alone is not the full signal. Optional (defaults to `false`) so
   *  values persisted before this field existed still parse. */
  engaged?: boolean;
};

export const timerStateSchema: z.ZodType<TimerState> = z.object({
  startedAtMs: z.number().nullable(),
  baseElapsedMs: z.number(),
  engaged: z.boolean().optional().default(false),
});

export const TIMER: StoreKey<TimerState> = {
  name: "wc3gym.timer",
  schema: timerStateSchema,
  defaultValue: () => ({ startedAtMs: null, baseElapsedMs: 0, engaged: false }),
};

// --- wc3gym.settings ---------------------------------------------------------

export type OverlayBounds = { x: number; y: number; width: number; height: number };

export type Settings = {
  apiBase: string;
  opacity: number;
  scale: number;
  shortcuts: ShortcutMap;
  overlayBounds?: OverlayBounds;
};

const shortcutMapSchema: z.ZodType<ShortcutMap> = z.object({
  toggle_overlay: z.string(),
  timer_play_pause: z.string(),
  timer_reset: z.string(),
  step_next: z.string(),
  step_prev: z.string(),
});

const overlayBoundsSchema: z.ZodType<OverlayBounds> = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * F004 legacy-migration: settings written while a now-dead host (see
 * `config.ts`'s `LEGACY_API_BASES`) was still the default carry it as
 * `apiBase` — migrate it to the current `DEFAULT_API_BASE` on read (same
 * `z.preprocess` shape as `migrateLegacyVsRace` above). A custom `apiBase`
 * the user actually set (e.g. a local dev server) is left untouched.
 */
function migrateLegacyApiBase(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.apiBase !== "string" || !LEGACY_API_BASES.includes(record.apiBase)) {
    return raw;
  }
  return { ...record, apiBase: DEFAULT_API_BASE };
}

export const settingsSchema: z.ZodType<Settings> = z.preprocess(
  migrateLegacyApiBase,
  z.object({
    apiBase: z.string(),
    opacity: z.number(),
    scale: z.number(),
    shortcuts: shortcutMapSchema,
    overlayBounds: overlayBoundsSchema.optional(),
  }),
);

export const SETTINGS: StoreKey<Settings> = {
  name: "wc3gym.settings",
  schema: settingsSchema,
  defaultValue: () => ({
    apiBase: DEFAULT_API_BASE,
    opacity: 1,
    scale: 1,
    shortcuts: { ...DEFAULT_SHORTCUTS },
  }),
};

// --- wc3gym.localBuilds (F002) ----------------------------------------------

/**
 * Private build orders, created and edited entirely on this machine (F003
 * ships the editor) — never sent to the site. Slugs are minted as
 * `local-<uuid>` (see `lib/localBuilds.ts::createLocalBuild`) so they can
 * never collide with a site slug, and `isLocalSlug` can tell the two apart
 * from the string alone.
 *
 * Deliberately its own shape, not `apiBuildSchema` extended: local builds
 * have no `guide`/`featured`/`publishedAt`/`authorDiscord`/`maintainer`/
 * `sourceUrl` (site-only concepts), and `description` here is a plain
 * string (no editor for the site's rich-text `description` yet), not the
 * site's portable-text array.
 */
export const LOCAL_SLUG_PATTERN = /^local-[0-9a-f-]{36}$/;

export const localBuildSchema = z.object({
  slug: z.string().regex(LOCAL_SLUG_PATTERN),
  title: z.string(),
  race: raceSchema,
  vsRaces: z.array(raceSchema).default([]),
  difficulty: difficultySchema,
  patch: z.string().optional(),
  tags: z.array(z.string()),
  summary: z.string(),
  author: z.string(),
  steps: z.array(apiBuildStepSchema).min(1),
  description: z.string().optional(),
  source: z.literal("local"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalBuild = z.infer<typeof localBuildSchema>;

export const LOCAL_BUILDS: StoreKey<LocalBuild[]> = {
  name: "wc3gym.localBuilds",
  schema: z.array(localBuildSchema),
  defaultValue: () => [],
};
