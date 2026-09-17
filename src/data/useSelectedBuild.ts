import type { ApiBuildListItem } from "../api/schema";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG } from "../store/keys";
import { useStoreValue } from "../store/useStore";

/** The selected build's cached list item (steps included), or null when
 *  nothing is selected or the slug no longer exists in the cache. */
export function useSelectedBuild(): ApiBuildListItem | null {
  const slug = useStoreValue(SELECTED_BUILD_SLUG);
  const cache = useStoreValue(BUILDS_CACHE);

  if (!slug) return null;
  return cache.builds.find((build) => build.slug === slug) ?? null;
}
