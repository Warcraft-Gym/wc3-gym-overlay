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
  difficulty?: string;
};

export function filterBuilds(builds: ApiBuildListItem[], filter: BuildFilter): ApiBuildListItem[] {
  const q = filter.q?.trim().toLowerCase();
  return builds.filter((build) => {
    if (filter.race && build.race !== filter.race) return false;
    if (filter.vsRace && filter.vsRace !== "any" && build.vsRace !== filter.vsRace && build.vsRace !== "any") {
      return false;
    }
    if (filter.difficulty && build.difficulty !== filter.difficulty) return false;
    if (q) {
      const haystack = [build.title, build.summary, build.author, ...build.tags].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export type BuildSort = "updated" | "title";

/** Pure sort, ported from the site's matchup-picker sort options (Recently
 *  updated / Title A-Z). Returns a new array — never mutates `builds`. */
export function sortBuilds(builds: ApiBuildListItem[], sort: BuildSort): ApiBuildListItem[] {
  const copy = [...builds];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return copy;
}
