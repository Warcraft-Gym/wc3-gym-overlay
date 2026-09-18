import { BUILDS_CACHE, LOCAL_BUILDS, SELECTED_BUILD_SLUG } from "../store/keys";
import { useStoreValue } from "../store/useStore";
import type { AnyBuild } from "./useAllBuilds";

/** The selected build (steps included), or null when nothing is selected
 *  or the slug no longer exists anywhere. Checks `LOCAL_BUILDS` first — a
 *  local slug always resolves from localStorage, never the network — so a
 *  private build's in-game panel works offline the same way the site cache
 *  already does. */
export function useSelectedBuild(): AnyBuild | null {
  const slug = useStoreValue(SELECTED_BUILD_SLUG);
  const localBuilds = useStoreValue(LOCAL_BUILDS);
  const cache = useStoreValue(BUILDS_CACHE);

  if (!slug) return null;

  const local = localBuilds.find((build) => build.slug === slug);
  if (local) return local;

  const site = cache.builds.find((build) => build.slug === slug);
  return site ? { ...site, source: "site" as const } : null;
}
