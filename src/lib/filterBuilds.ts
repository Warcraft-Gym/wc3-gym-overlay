/**
 * Pure client-side build filtering. Ported from the site's
 * `src/lib/builds/builds.ts::filterBuilds` — same semantics exactly, so a
 * filtered view here matches what the site would show for the same query.
 *
 * F005: a build's opponent is `vsRaces: BuildRace[]` (empty means "any
 * opponent"), not a single `vsRace`. `filter.vsRace` stays the UI's single
 * selection (one crest picked in the "Against" row); `"any"`/unset means no
 * filter, and a build with `vsRaces: []` matches every opponent filter.
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
    if (
      filter.vsRace &&
      filter.vsRace !== "any" &&
      build.vsRaces.length &&
      !build.vsRaces.includes(filter.vsRace as ApiBuildListItem["vsRaces"][number])
    ) {
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
