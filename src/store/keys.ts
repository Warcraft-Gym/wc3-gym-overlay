/**
 * localStorage keys used by the overlay app, each paired with a zod schema
 * (for validating whatever a browser/OS actually hands back) and a default
 * value used when the key is absent or fails validation.
 */

import { z } from "zod";
import { opponentCardSchema } from "../w3c/opponentCard";
import { PROFILE_PICKS, profileSchema, type ProfilePick } from "../w3c/profile";
import {
  apiBuildListItemSchema,
  apiBuildStepSchema,
  difficultySchema,
  gameIconEntrySchema,
  raceSchema,
  type ApiBuildListItem,
  type GameIconEntry,
} from "../api/schema";
import { DEFAULT_API_BASE, DEFAULT_SHORTCUTS, LEGACY_API_BASES, LEGACY_DEFAULT_SHORTCUTS } from "../config";
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
  /** Off registers no global shortcut, so every combo stays with other apps. */
  shortcutsEnabled: boolean;
  overlayBounds?: OverlayBounds;
  /** F002: whether the picker checks for an update a few seconds after
   *  launch. Defaults to `true` so the schema default (below) opts
   *  existing (pre-F002) installs in automatically. */
  autoUpdate: boolean;
  /** F002: the version the user chose "Skip this version" for, or `null`.
   *  A launch check that finds this exact version stays silent; the
   *  Settings manual check still surfaces it as "(skipped)". */
  skippedVersion: string | null;
  /** The player's W3Champions BattleTag ("Name#1234"), or `null` until set.
   *  Nothing polls W3Champions while this is empty. */
  myBattleTag: string | null;
  /** Show the opponent card when a W3Champions 1v1 starts. */
  opponentCard: boolean;
  /** Open the opponent window by itself when a new 1v1 is detected. */
  opponentAutoOpen: boolean;
  /** Last position/size of the opponent window. */
  opponentBounds?: OverlayBounds;
  /** The picker tab last open: your builds or your W3Champions profile. */
  pickerTab?: PickerTab;
  /** The race the Profile tab shows; null means the one you pick most. */
  profileRace?: ProfilePick | null;
};

export type PickerTab = "builds" | "profile";

/**
 * 0.6.0 moved the defaults: the build overlay from Shift+O to Shift+B, and
 * the new opponent window onto Shift+O. A saved map still holding an old
 * *default* is moved to the new one; a combo the user picked is kept. The
 * opponent shortcut only takes Shift+O when nothing else in the map uses it,
 * so a migration can never create a clash.
 */
export function migrateLegacyShortcuts(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const map = { ...(raw as Record<string, unknown>) };
  if (map.toggle_overlay === LEGACY_DEFAULT_SHORTCUTS.toggle_overlay) {
    map.toggle_overlay = DEFAULT_SHORTCUTS.toggle_overlay;
  }
  if (map.toggle_opponent === undefined || map.toggle_opponent === LEGACY_DEFAULT_SHORTCUTS.toggle_opponent) {
    const taken = Object.entries(map).some(
      ([action, combo]) => action !== "toggle_opponent" && combo === DEFAULT_SHORTCUTS.toggle_opponent,
    );
    map.toggle_opponent = taken
      ? (map.toggle_opponent ?? LEGACY_DEFAULT_SHORTCUTS.toggle_opponent)
      : DEFAULT_SHORTCUTS.toggle_opponent;
  }
  return map;
}

const shortcutMapSchema: z.ZodType<ShortcutMap> = z.preprocess(
  migrateLegacyShortcuts,
  z.object({
    toggle_overlay: z.string(),
    toggle_opponent: z.string(),
    timer_play_pause: z.string(),
    timer_reset: z.string(),
    step_next: z.string(),
    step_prev: z.string(),
  }),
);

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
    shortcutsEnabled: z.boolean().default(true), // absent up to 0.6.0
    overlayBounds: overlayBoundsSchema.optional(),
    // F002: absent in settings written by 0.3.x — zod fills in the default
    // below when the key is missing, which is the whole migration.
    autoUpdate: z.boolean().default(true),
    skippedVersion: z.string().nullable().default(null),
    // Opponent card: absent in settings written by 0.5.x.
    myBattleTag: z.string().nullable().default(null),
    opponentCard: z.boolean().default(true),
    opponentAutoOpen: z.boolean().default(true),
    opponentBounds: overlayBoundsSchema.optional(),
    pickerTab: z.enum(["builds", "profile"]).default("builds"),
    profileRace: z.enum(PROFILE_PICKS).nullable().default(null),
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
    shortcutsEnabled: true,
    autoUpdate: true,
    skippedVersion: null,
    myBattleTag: null,
    opponentCard: true,
    opponentAutoOpen: true,
    pickerTab: "builds",
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
 * have no `guide`/`featured`/`publishedAt`/`maintainer` (site-only
 * concepts), and `description` here is a plain string (no editor for the
 * site's rich-text `description` yet), not the site's portable-text array.
 *
 * F003: `authorDiscord`/`sourceUrl` were added (both optional, matching the
 * site submission form's own optional fields) so a private build already
 * carries everything the site's submission schema asks for and "Submit to
 * site" (a later feature) can send it unchanged.
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
  authorDiscord: z.string().optional(),
  sourceUrl: z.string().optional(),
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

// --- wc3gym.iconsCache (F003) ------------------------------------------------

/**
 * See `data/useIcons.ts`, the only consumer — it fetches the site's
 * `/api/icons` (schema: `gameIconEntrySchema` in `api/schema.ts`) once per
 * `apiBase` and caches the result here so the editor's icon picker opens
 * instantly (and still works offline) on every subsequent picker/editor
 * launch.
 */
export type IconsCache = {
  fetchedAt: string;
  apiBase: string;
  icons: GameIconEntry[];
};

export const iconsCacheSchema: z.ZodType<IconsCache> = z.object({
  fetchedAt: z.string(),
  apiBase: z.string(),
  icons: z.array(gameIconEntrySchema),
});

export const ICONS_CACHE: StoreKey<IconsCache> = {
  name: "wc3gym.iconsCache",
  schema: iconsCacheSchema,
  defaultValue: () => ({ fetchedAt: "", apiBase: DEFAULT_API_BASE, icons: [] }),
};

// --- wc3gym.opponent --------------------------------------------------------

/**
 * The opponent card for the player's current (or last) W3Champions 1v1,
 * written by the picker window's watcher (`opponentWatcher.ts`) and read by
 * the in-game overlay. `live` is false once the match has ended; the card
 * stays so the picker can still show who you just played.
 */
export const opponentStateSchema = z.object({
  status: z.enum(["idle", "loading", "ok", "error"]),
  matchId: z.string().nullable(),
  live: z.boolean(),
  error: z.string().nullable(),
  card: opponentCardSchema.nullable(),
  updatedAt: z.string().nullable(),
});
export type OpponentState = z.infer<typeof opponentStateSchema>;

export const OPPONENT: StoreKey<OpponentState> = {
  name: "wc3gym.opponent",
  schema: opponentStateSchema,
  defaultValue: () => ({ status: "idle", matchId: null, live: false, error: null, card: null, updatedAt: null }),
};

/**
 * Your own W3Champions profile for the picker's Profile tab, written by
 * `profileLoader.ts`. A refresh keeps the previous profile visible
 * (status "loading" with `profile` still set).
 */
/** Bump when `Profile` gains fields: a profile saved by an older version
 *  is reloaded instead of shown without them. */
export const PROFILE_STATE_VERSION = 2;

export const profileStateSchema = z.object({
  /** PROFILE_STATE_VERSION of the app that saved this (0: before 0.6). */
  version: z.number().default(0),
  status: z.enum(["idle", "loading", "ok", "error"]),
  tag: z.string().nullable(),
  /** The race asked for when this was loaded (null: the one you pick most). */
  race: z.enum(PROFILE_PICKS).nullable().default(null),
  profile: profileSchema.nullable(),
  error: z.string().nullable(),
  fetchedAt: z.string().nullable(),
});
export type ProfileState = z.infer<typeof profileStateSchema>;

export const PROFILE: StoreKey<ProfileState> = {
  name: "wc3gym.profile",
  schema: profileStateSchema,
  defaultValue: () => ({ version: PROFILE_STATE_VERSION, status: "idle", tag: null, race: null, profile: null, error: null, fetchedAt: null }),
};
