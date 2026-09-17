/**
 * localStorage keys used by the overlay app, each paired with a zod schema
 * (for validating whatever a browser/OS actually hands back) and a default
 * value used when the key is absent or fails validation.
 */

import { z } from "zod";
import { apiBuildListItemSchema, type ApiBuildListItem } from "../api/schema";
import { DEFAULT_API_BASE, DEFAULT_SHORTCUTS } from "../config";
import type { ShortcutMap } from "../host/bridge";

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
  builds: z.array(apiBuildListItemSchema),
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
};

export const timerStateSchema: z.ZodType<TimerState> = z.object({
  startedAtMs: z.number().nullable(),
  baseElapsedMs: z.number(),
});

export const TIMER: StoreKey<TimerState> = {
  name: "wc3gym.timer",
  schema: timerStateSchema,
  defaultValue: () => ({ startedAtMs: null, baseElapsedMs: 0 }),
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

export const settingsSchema: z.ZodType<Settings> = z.object({
  apiBase: z.string(),
  opacity: z.number(),
  scale: z.number(),
  shortcuts: shortcutMapSchema,
  overlayBounds: overlayBoundsSchema.optional(),
});

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
