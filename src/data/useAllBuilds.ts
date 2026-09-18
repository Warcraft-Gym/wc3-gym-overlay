/**
 * Merges private local builds with the published site list into one array
 * the picker renders — local builds sort newest-`updatedAt`-first, ahead of
 * the site builds (`useBuilds`'s own order), and never depend on the
 * network: they come straight from `LOCAL_BUILDS` (localStorage), so they
 * render the same whether `useBuilds`'s status is `loading`/`ready`/
 * `offline`/`empty`.
 */

import { LOCAL_BUILDS } from "../store/keys";
import { useStoreValue } from "../store/useStore";
import type { ApiBuildListItem } from "../api/schema";
import type { LocalBuild } from "../store/keys";
import { useBuilds, type UseBuildsResult } from "./useBuilds";

/** A build as rendered by the picker, tagged with where it came from. Every
 *  site build is stamped `source: "site"` on the way out of `useAllBuilds`
 *  — the raw `BUILDS_CACHE`/`ApiBuildListItem` never carries this field. */
export type AnyBuild = (ApiBuildListItem & { source: "site" }) | LocalBuild;

export function isLocalBuild(build: AnyBuild): build is LocalBuild {
  return build.source === "local";
}

export type UseAllBuildsResult = Omit<UseBuildsResult, "builds"> & { builds: AnyBuild[] };

function byNewestUpdated<T extends { updatedAt: string }>(a: T, b: T): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function useAllBuilds(): UseAllBuildsResult {
  const localBuilds = useStoreValue(LOCAL_BUILDS);
  const site = useBuilds();

  const local = [...localBuilds].sort(byNewestUpdated);
  const stampedSite: AnyBuild[] = site.builds.map((build) => ({ ...build, source: "site" as const }));

  return {
    ...site,
    builds: [...local, ...stampedSite],
  };
}
