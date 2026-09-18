/**
 * Pure client-side build filtering. Ported from the site's
 * `src/lib/builds/builds.ts::filterBuilds` — same semantics exactly, so a
 * filtered view here matches what the site would show for the same query.
 *
 * F005: a build's opponent is `vsRaces: BuildRace[]` (empty means "any
 * opponent"), not a single `vsRace`. `filter.vsRace` stays the UI's single
 * selection (one crest picked in the "Against" row); `"any"`/unset means no
 * filter, and a build with `vsRaces: []` matches every opponent filter.
 *
 * F002: `filter.source` (`"all" | "local" | "site"`) filters on a build's
 * `source` tag — a plain site `ApiBuildListItem` (which carries no
 * `source` field at all) is treated as `"site"`, so callers that still
 * pass raw site builds without stamping them keep working unfiltered.
 * Generic over `T` so this one function works for both `ApiBuildListItem[]`
 * (existing callers) and the merged `AnyBuild[]` (F002's picker).
 */

import type { ApiBuildListItem } from "../api/schema";

export type BuildFilter = {
  race?: string;
  vsRace?: string;
  q?: string;
  difficulty?: string;
  source?: "all" | "local" | "site";
};

type FilterableBuild = Pick<
  ApiBuildListItem,
  "race" | "vsRaces" | "difficulty" | "title" | "summary" | "author" | "tags"
> & {
  source?: "site" | "local";
};

export function filterBuilds<T extends FilterableBuild>(builds: T[], filter: BuildFilter): T[] {
  const q = filter.q?.trim().toLowerCase();
  return builds.filter((build) => {
    if (filter.race && build.race !== filter.race) return false;
    if (
      filter.vsRace &&
      filter.vsRace !== "any" &&
      build.vsRaces.length &&
      !build.vsRaces.includes(filter.vsRace as T["vsRaces"][number])
    ) {
      return false;
    }
    if (filter.difficulty && build.difficulty !== filter.difficulty) return false;
    if (filter.source && filter.source !== "all" && (build.source ?? "site") !== filter.source) {
      return false;
    }
    if (q) {
      const haystack = [build.title, build.summary, build.author, ...build.tags].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export type BuildSort = "updated" | "title";

type SortableBuild = Pick<ApiBuildListItem, "title" | "updatedAt">;

/** Pure sort, ported from the site's matchup-picker sort options (Recently
 *  updated / Title A-Z). Returns a new array — never mutates `builds`. */
export function sortBuilds<T extends SortableBuild>(builds: T[], sort: BuildSort): T[] {
  const copy = [...builds];
  if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return copy;
}
