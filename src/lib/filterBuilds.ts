/**
 * Pure client-side build filtering. Ported from the site's
 * `src/lib/builds/builds.ts::filterBuilds` — same semantics exactly, so a
 * filtered view here matches what the site would show for the same query.
 */

import type { ApiBuildListItem } from "../api/schema";

export type BuildFilter = {
  race?: string;
  vsRace?: string;
  q?: string;
};

export function filterBuilds(builds: ApiBuildListItem[], filter: BuildFilter): ApiBuildListItem[] {
  const q = filter.q?.trim().toLowerCase();
  return builds.filter((build) => {
    if (filter.race && build.race !== filter.race) return false;
    if (filter.vsRace && filter.vsRace !== "any" && build.vsRace !== filter.vsRace && build.vsRace !== "any") {
      return false;
    }
    if (q) {
      const haystack = [build.title, build.summary, build.author, ...build.tags].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
