/**
 * Thin fetch client for the public build-orders JSON API. Validates every
 * response with zod and never swallows a failure — callers get a typed
 * `ApiError` they can branch on.
 *
 * `cache: "no-store"` on every request (F003's caching concern): the API
 * sends `Cache-Control: public, s-maxage=300, ...`, whose `s-maxage` only
 * governs shared caches, but the response is still heuristically cacheable
 * by the browser's own HTTP cache. Without opting out, a browser can serve
 * a stale 200 from its disk cache even while the origin is completely
 * unreachable — silently defeating `useBuilds`'s offline detection. The
 * overlay keeps its own explicit offline cache (`BUILDS_CACHE`); it needs
 * `fetch` to report the real network state, not the browser's opinion of
 * a fresh-enough response.
 */

import {
  buildResponseSchema,
  buildsListResponseSchema,
  iconsResponseSchema,
  type ApiBuild,
  type ApiBuildListItem,
  type GameIconEntry,
} from "./schema";

export type ApiErrorKind = "network" | "http" | "invalid";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly cause?: unknown;

  constructor(kind: ApiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.cause = options?.cause;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (err) {
    throw new ApiError("network", `network error fetching ${url}`, { cause: err });
  }
  if (!response.ok) {
    throw new ApiError("http", `${response.status} ${response.statusText} for ${url}`);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new ApiError("invalid", `response body was not valid JSON from ${url}`, { cause: err });
  }
}

export async function fetchBuilds(apiBase: string): Promise<ApiBuildListItem[]> {
  const body = await fetchJson(`${apiBase}/api/builds`);
  const parsed = buildsListResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("invalid", `builds list response failed validation: ${parsed.error.message}`);
  }
  return parsed.data.builds;
}

export async function fetchBuild(apiBase: string, slug: string): Promise<ApiBuild> {
  const body = await fetchJson(`${apiBase}/api/builds/${slug}`);
  const parsed = buildResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("invalid", `build response failed validation: ${parsed.error.message}`);
  }
  return parsed.data.build;
}

/** F003: fetches the WC3 icon manifest the editor's icon picker renders,
 *  same offline-safe shape as `fetchBuilds`. */
export async function fetchIcons(apiBase: string): Promise<GameIconEntry[]> {
  const body = await fetchJson(`${apiBase}/api/icons`);
  const parsed = iconsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("invalid", `icons response failed validation: ${parsed.error.message}`);
  }
  return parsed.data.icons;
}
