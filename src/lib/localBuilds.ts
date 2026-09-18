/**
 * Pure CRUD helpers over a `LocalBuild[]` list — no localStorage access
 * here (that's `data/localBuildsStore.ts`), so these are trivial to unit
 * test and safe to call from anywhere (editor forms, duplicate actions,
 * import/export) without worrying about *when* a write actually lands.
 *
 * Every function is immutable: the input list/build is never mutated, a
 * new array/object is always returned — same rule as the rest of the
 * codebase (see `store/state.ts::updateKey`).
 */

import type { ApiBuildListItem, ApiBuildStep } from "../api/schema";
import { LOCAL_SLUG_PATTERN, type LocalBuild } from "../store/keys";

/** Everything a caller supplies to mint a new local build — the rest
 *  (`slug`, `source`, `createdAt`, `updatedAt`) is derived. */
export type LocalBuildInput = Omit<LocalBuild, "slug" | "source" | "createdAt" | "updatedAt">;

/** True when `slug` has the `local-<uuid>` shape minted by
 *  `createLocalBuild`/`duplicateAsLocal` — the only reliable way to tell a
 *  local build's slug apart from a site slug (both are plain strings once
 *  they leave their respective schemas). */
export function isLocalSlug(slug: string): boolean {
  return LOCAL_SLUG_PATTERN.test(slug);
}

/** Mints a brand-new local build: a fresh `local-<uuid>` slug and matching
 *  `createdAt`/`updatedAt` timestamps. */
export function createLocalBuild(input: LocalBuildInput): LocalBuild {
  const now = new Date().toISOString();
  return {
    ...input,
    slug: `local-${crypto.randomUUID()}`,
    source: "local",
    createdAt: now,
    updatedAt: now,
  };
}

/** Returns a new list with the build at `slug` replaced by itself merged
 *  with `patch`, and `updatedAt` bumped to now. Builds that don't match
 *  `slug` (including the case where `slug` isn't in `list` at all) are
 *  returned unchanged — a fresh array, but the same build references. */
export function updateLocalBuild(
  list: LocalBuild[],
  slug: string,
  patch: Partial<LocalBuildInput>,
): LocalBuild[] {
  const now = new Date().toISOString();
  return list.map((build) =>
    build.slug === slug
      ? { ...build, ...patch, slug: build.slug, source: "local" as const, updatedAt: now }
      : build,
  );
}

/** Returns a new list with the build at `slug` removed. */
export function deleteLocalBuild(list: LocalBuild[], slug: string): LocalBuild[] {
  return list.filter((build) => build.slug !== slug);
}

/** Copies a build (site or local) into a brand-new private build: a fresh
 *  `local-<uuid>` slug, `"<title> (copy)"`, and every step verbatim
 *  (including `iconUrl`) — the site build itself is left untouched, this
 *  only ever produces a new object. */
export function duplicateAsLocal(build: ApiBuildListItem | LocalBuild): LocalBuild {
  const now = new Date().toISOString();
  return {
    slug: `local-${crypto.randomUUID()}`,
    title: `${build.title} (copy)`,
    race: build.race,
    vsRaces: build.vsRaces,
    difficulty: build.difficulty,
    patch: build.patch ?? undefined,
    tags: [...build.tags],
    summary: build.summary,
    author: build.author,
    steps: build.steps.map((step): ApiBuildStep => ({ ...step })),
    description: "description" in build ? build.description : undefined,
    source: "local",
    createdAt: now,
    updatedAt: now,
  };
}
