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
 */

import { z } from "zod";
import type { EditorFormInput, EditorStepInput } from "../lib/buildEditorSchema";

const replayImportStepSchema = z.object({
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
  tags: z.string(),
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
  { dropLikelyRejected = true, fetchImpl = globalThis.fetch }: RequestReplayImportOptions = {},
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
      response = await fetchImpl(url, { method: "POST", body: form });
    } else {
      const body: { match: string; dropLikelyRejected?: false } = { match: source.match };
      if (!dropLikelyRejected) body.dropLikelyRejected = false;
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
  } catch (err) {
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
 *  same convention `toLocalBuildInput` uses the other way around). */
export function replayBuildToFormInput(build: ReplayImportBuild): EditorFormInput {
  return {
    title: build.title,
    race: build.race,
    vsRaces: build.vsRaces,
    difficulty: build.difficulty,
    patch: build.patch,
    tags: build.tags,
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
