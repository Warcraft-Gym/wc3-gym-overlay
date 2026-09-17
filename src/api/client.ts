/**
 * Thin fetch client for the public build-orders JSON API. Validates every
 * response with zod and never swallows a failure — callers get a typed
 * `ApiError` they can branch on. Caching is F003's concern.
 */

import {
  buildResponseSchema,
  buildsListResponseSchema,
  type ApiBuild,
  type ApiBuildListItem,
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
    response = await fetch(url);
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
