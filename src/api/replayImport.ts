/**
 * F004 — client for the website's `POST /api/replay-import`, which replaces
 * the overlay's own `.w3g` parser (deleted alongside this file's addition —
 * see the removal of `src/replay/`). Validates the 200 body with zod and
 * turns every failure — a thrown `fetch` (network/CORS), a non-2xx
 * response, or a malformed 200 body — into a typed `ReplayImportError`
 * carrying a message fit to show the user verbatim. Nothing is swallowed:
 * every branch below either returns validated data or throws.
 *
 * Response shape verified live against production
 * (`https://warcraft-gym.com/api/replay-import`) — see the feature spec.
 * `players[].build` mirrors the overlay's own `EditorFormInput`
 * (`src/lib/buildEditorSchema.ts`) field-for-field; `replayBuildToFormInput`
 * below is the one place that adapts the wire types (e.g. `supply` as a
 * JSON number) into the form's all-string shape.
 *
 * F004a — restores the cutoff/upgrades/items controls F004 dropped when the
 * API only accepted `dropLikelyRejected`; the API now also accepts
 * `cutoffSeconds` (integer seconds), `includeUpgrades` and `includeItems`.
 * Unlike `dropLikelyRejected`, these three are sent explicitly on *every*
 * request (simplest, unambiguous) rather than only when they differ from
 * the server's default.
 *
 * F004c — F004's "response shape verified live" was wrong in one place:
 * `build.tags` was declared `z.string()`, but production sends (and always
 * has sent) a JSON string array — every real import was rejected by
 * `safeParse`. Re-verified field-by-field against a real captured response
 * (`src/api/__fixtures__/replay-import.production.json`); every other field
 * already matched. `tags` is now `z.array(z.string())`, and
 * `replayBuildToFormInput` joins it into the editor's comma-separated
 * string with the same convention `fromBuild` uses
 * (`src/lib/buildEditorSchema.ts`).
 */

import { z } from "zod";
import type { EditorFormInput, EditorStepInput } from "../lib/buildEditorSchema";

// F009 (plan-vs-actual-engine): exported so `reviews/types.ts` can validate
// a stored review's per-player steps against the exact same wire shape,
// instead of redeclaring it and risking the two drifting apart.
export const replayImportStepSchema = z.object({
  time: z.string(),
  supply: z.number(),
  instruction: z.string(),
  icon: z.string(),
  importNote: z.string().optional(),
});

const replayImportBuildSchema = z.object({
  title: z.string(),
  race: z.string(),
  vsRaces: z.array(z.string()),
  difficulty: z.string(),
  patch: z.string(),
  // F004c: production sends `tags` as a string array and always has — a
  // response captured before and after the site's latest deploy both had
  // `"tags": ["replay"]`. `z.string()` here rejected every real import.
  tags: z.array(z.string()),
  summary: z.string(),
  author: z.string(),
  authorDiscord: z.string(),
  sourceUrl: z.string(),
  description: z.string(),
  steps: z.array(replayImportStepSchema),
});

const replayImportPlayerSchema = z.object({
  id: z.number(),
  name: z.string(),
  race: z.string(),
  dropped: z.number(),
  build: replayImportBuildSchema,
});

export const replayImportResponseSchema = z.object({
  map: z.string(),
  duration: z.string(),
  version: z.string(),
  source: z.object({ label: z.string() }),
  players: z.array(replayImportPlayerSchema),
});

export type ReplayImportStep = z.infer<typeof replayImportStepSchema>;
export type ReplayImportBuild = z.infer<typeof replayImportBuildSchema>;
export type ReplayImportPlayer = z.infer<typeof replayImportPlayerSchema>;
export type ReplayImportResponse = z.infer<typeof replayImportResponseSchema>;

export type ReplayImportErrorKind = "network" | "http" | "rate_limited" | "invalid";

export class ReplayImportError extends Error {
  readonly kind: ReplayImportErrorKind;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(kind: ReplayImportErrorKind, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "ReplayImportError";
    this.kind = kind;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

/** What to send to `/api/replay-import`: either a picked `.w3g` file (goes
 *  out as `multipart/form-data`) or a W3Champions link/id (goes out as
 *  JSON) — the server does its own link/id parsing, so the overlay no
 *  longer needs `parseMatchRef` client-side. */
export type ReplayImportSourcePayload =
  | { kind: "file"; bytes: Uint8Array; fileName: string }
  | { kind: "match"; match: string };

export interface RequestReplayImportOptions {
  /** Default `true` matches the API's own default (omit the field to drop
   *  likely-rejected orders) — only `false` is ever sent explicitly. */
  dropLikelyRejected?: boolean;
  /** F004a: cutoff in seconds (integer 1–3600 per the API), always sent
   *  explicitly — unlike `dropLikelyRejected`, there's no "send only when
   *  non-default" shortcut here since the field is required-shaped and the
   *  caller (the modal) always has a current value. Defaults to 480 (8:00),
   *  the API's own default. */
  cutoffSeconds?: number;
  /** F004a: sent explicitly on every request. Defaults match the API's own
   *  defaults (upgrades included, items not). */
  includeUpgrades?: boolean;
  includeItems?: boolean;
  /** F004b: forwarded to `fetch` as-is. The caller (`ReplayImportModal`)
   *  aborts this in its effect cleanup so a superseded or unmounted request
   *  is cancelled at the network level instead of just having its response
   *  ignored. The resulting `AbortError` is rethrown unwrapped (not turned
   *  into a `ReplayImportError`) so callers can tell an abort apart from a
   *  real network failure — see the `catch` below. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Best-effort host label for the network-error message — falls back to the
 *  raw `apiBase` string if it isn't a parseable URL. */
function hostLabel(apiBase: string): string {
  try {
    return new URL(apiBase).host;
  } catch {
    return apiBase;
  }
}

/** Turns a non-2xx `Response` into a `ReplayImportError` carrying the
 *  server's `error` text where present. 429 isn't guaranteed a JSON body
 *  (per the verified API shape), so that path never assumes one. */
async function errorFromResponse(response: Response): Promise<ReplayImportError> {
  if (response.status === 429) {
    return new ReplayImportError("rate_limited", "Too many imports in a minute, try again shortly.", {
      status: 429,
    });
  }
  let serverMessage: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string") {
      serverMessage = (body as { error: string }).error;
    }
  } catch {
    // Body wasn't JSON (or wasn't readable) — fall through to the generic message below.
  }
  return new ReplayImportError("http", serverMessage ?? `Import failed (HTTP ${response.status}).`, {
    status: response.status,
  });
}

/**
 * POSTs a `.w3g` file (multipart, field `replay`) or a W3Champions match
 * link/id (JSON `{ match }`) to `${apiBase}/api/replay-import` and
 * validates the 200 body. Every failure surfaces as a `ReplayImportError`;
 * `fetch` itself is never left to throw uncaught.
 */
export async function requestReplayImport(
  apiBase: string,
  source: ReplayImportSourcePayload,
  {
    dropLikelyRejected = true,
    cutoffSeconds = 480,
    includeUpgrades = true,
    includeItems = false,
    signal,
    fetchImpl = globalThis.fetch,
  }: RequestReplayImportOptions = {},
): Promise<ReplayImportResponse> {
  const url = `${apiBase}/api/replay-import`;

  let response: Response;
  try {
    if (source.kind === "file") {
      const form = new FormData();
      // `Uint8Array<ArrayBufferLike>` isn't assignable to `BlobPart` under
      // strict lib.dom typing (its `buffer` could be a `SharedArrayBuffer`)
      // — the bytes here always come from a real file read, never a shared
      // buffer, so the cast is safe.
      form.append("replay", new Blob([source.bytes as BlobPart]), source.fileName);
      if (!dropLikelyRejected) form.append("dropLikelyRejected", "false");
      // F004a: sent explicitly every time (not just when non-default) — see
      // `RequestReplayImportOptions`.
      form.append("cutoffSeconds", String(cutoffSeconds));
      form.append("includeUpgrades", includeUpgrades ? "true" : "false");
      form.append("includeItems", includeItems ? "true" : "false");
      response = await fetchImpl(url, { method: "POST", body: form, signal });
    } else {
      const body: {
        match: string;
        dropLikelyRejected?: false;
        cutoffSeconds: number;
        includeUpgrades: boolean;
        includeItems: boolean;
      } = { match: source.match, cutoffSeconds, includeUpgrades, includeItems };
      if (!dropLikelyRejected) body.dropLikelyRejected = false;
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    }
  } catch (err) {
    // F004b: an abort (a superseded or unmounted request, cancelled by the
    // caller's `AbortController`) is expected control flow, not a network
    // failure — rethrow it unwrapped so callers (`ReplayImportModal`) can
    // tell it apart from a real `fetch` failure and never show it as an
    // error.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ReplayImportError("network", `Couldn't reach ${hostLabel(apiBase)}. Check your connection.`, {
      cause: err,
    });
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    throw new ReplayImportError("invalid", "The server sent back something that wasn't a valid reply.", {
      cause: err,
    });
  }

  const parsed = replayImportResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ReplayImportError("invalid", "The server sent back something that wasn't a valid reply.", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Adapts a response player's `build` into the editor form's all-string
 *  shape (`supply` is a JSON number on the wire, a string in the form —
 *  same convention `toLocalBuildInput` uses the other way around). F004c:
 *  `tags` is a JSON string array on the wire; the editor stores it as a
 *  comma-separated string — the same convention `fromBuild` already uses
 *  (`src/lib/buildEditorSchema.ts`: `tags: build.tags.join(", ")`). */
export function replayBuildToFormInput(build: ReplayImportBuild): EditorFormInput {
  return {
    title: build.title,
    race: build.race,
    vsRaces: build.vsRaces,
    difficulty: build.difficulty,
    patch: build.patch,
    tags: build.tags.join(", "),
    summary: build.summary,
    author: build.author,
    authorDiscord: build.authorDiscord,
    sourceUrl: build.sourceUrl,
    description: build.description,
    steps: build.steps.map(
      (step): EditorStepInput => ({
        time: step.time,
        supply: String(step.supply),
        instruction: step.instruction,
        icon: step.icon,
        importNote: step.importNote,
      }),
    ),
  };
}
