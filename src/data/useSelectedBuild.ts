import { BUILDS_CACHE, LOCAL_BUILDS, SELECTED_BUILD_SLUG, type BuildsCache, type LocalBuild } from "../store/keys";
import { readKey } from "../store/state";
import { useStoreValue } from "../store/useStore";
import type { AnyBuild } from "./useAllBuilds";

/** Shared lookup for both `useSelectedBuild` (reactive, via
 *  `useStoreValue`) and `getSelectedBuildSnapshot` (a one-off read, via
 *  `readKey`) below: kept as one function so the two never drift. Checks
 *  `LOCAL_BUILDS` first; a local slug always resolves from localStorage,
 *  never the network, so a private build's in-game panel works offline
 *  the same way the site cache already does. */
function selectBuild(slug: string | null, localBuilds: LocalBuild[], cache: BuildsCache): AnyBuild | null {
  if (!slug) return null;

  const local = localBuilds.find((build) => build.slug === slug);
  if (local) return local;

  const site = cache.builds.find((build) => build.slug === slug);
  return site ? { ...site, source: "site" as const } : null;
}

/** The selected build (steps included), or null when nothing is selected
 *  or the slug no longer exists anywhere. */
export function useSelectedBuild(): AnyBuild | null {
  const slug = useStoreValue(SELECTED_BUILD_SLUG);
  const localBuilds = useStoreValue(LOCAL_BUILDS);
  const cache = useStoreValue(BUILDS_CACHE);
  return selectBuild(slug, localBuilds, cache);
}

/** F009 (plan-vs-actual-engine): the same lookup as `useSelectedBuild`,
 *  as a plain value rather than a hook, for the review pipeline
 *  (`src/reviews/pipeline.ts`) to snapshot "what was selected" at the
 *  moment a replay comes in, outside of any React render. */
export function getSelectedBuildSnapshot(): AnyBuild | null {
  return selectBuild(readKey(SELECTED_BUILD_SLUG), readKey(LOCAL_BUILDS), readKey(BUILDS_CACHE));
}
