/**
 * Resolves the timed steps for a selected build slug, the same
 * local-first/cache-fallback rule `useSelectedBuild.ts` uses for the
 * in-game panel — pulled out as a pure function (no React, no hook) so
 * `shortcuts.ts` (a plain module, not a component) can reuse it for the
 * `step_next`/`step_prev` global shortcuts instead of only ever reading
 * `BUILDS_CACHE`, which is empty/stale for a private (`local-<uuid>`) slug
 * and made the shortcuts silent no-ops on those builds.
 */

import { isLocalSlug } from "../lib/localBuilds";
import { BUILDS_CACHE, LOCAL_BUILDS } from "../store/keys";
import { readKey } from "../store/state";
import type { TimedStep } from "../store/timer";

/** Steps for `slug`, or `[]` when the slug is falsy or unknown anywhere. */
export function resolveSelectedSteps(slug: string | null): TimedStep[] {
  if (!slug) return [];

  if (isLocalSlug(slug)) {
    const local = readKey(LOCAL_BUILDS).find((build) => build.slug === slug);
    if (local) return local.steps;
    // Fall through: a stale local slug (e.g. deleted from another window)
    // still checks the site cache, matching `useSelectedBuild`'s behaviour.
  }

  const site = readKey(BUILDS_CACHE).builds.find((build) => build.slug === slug);
  return site?.steps ?? [];
}
