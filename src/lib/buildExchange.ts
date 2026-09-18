/**
 * Export/import for private builds (F004) — turns a `LocalBuild` into a
 * small, portable JSON file (backup, sharing between machines) and back.
 * Deliberately its own shape, not a re-export of `localBuildSchema`: the
 * file never carries `slug`/`createdAt`/`updatedAt` (re-minted on import so
 * two people importing the same file don't collide) or `authorDiscord`/
 * `sourceUrl`/step `iconUrl` (site-submission-prefill fields with no
 * meaning outside this machine's icon manifest cache).
 *
 * Every function here is pure and synchronous except `fingerprint` and
 * `importBuilds`, which hash with Web Crypto (`crypto.subtle`) and are
 * therefore async.
 */

import { z } from "zod";
import { difficultySchema, raceSchema } from "../api/schema";
import { createLocalBuild, type LocalBuildInput } from "./localBuilds";
import type { LocalBuild } from "../store/keys";

export const EXPORT_FORMAT_SINGLE = "wc3gym-build";
export const EXPORT_FORMAT_MULTI = "wc3gym-builds";
export const EXPORT_VERSION = 1;

export const exportedStepSchema = z.object({
  time: z.string().optional(),
  supply: z.number().optional(),
  instruction: z.string(),
  icon: z.string().optional(),
});

export const exportedBuildSchema = z.object({
  title: z.string(),
  race: raceSchema,
  vsRaces: z.array(raceSchema).default([]),
  difficulty: difficultySchema,
  patch: z.string().optional(),
  tags: z.array(z.string()),
  summary: z.string(),
  author: z.string(),
  steps: z.array(exportedStepSchema).min(1),
  description: z.string().optional(),
});

export const singleExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT_SINGLE),
  version: z.literal(EXPORT_VERSION),
  build: exportedBuildSchema,
});

export const multiExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT_MULTI),
  version: z.literal(EXPORT_VERSION),
  builds: z.array(exportedBuildSchema),
});

export type ExportedStep = z.infer<typeof exportedStepSchema>;
export type ExportedBuild = z.infer<typeof exportedBuildSchema>;
export type SingleExportFile = z.infer<typeof singleExportSchema>;
export type MultiExportFile = z.infer<typeof multiExportSchema>;

/** Only the fields the export file keeps — anything else on a `LocalBuild`
 *  (slug, timestamps, authorDiscord, sourceUrl, a step's iconUrl) is
 *  dropped on the way out. */
function toExportedBuild(build: LocalBuild): ExportedBuild {
  return {
    title: build.title,
    race: build.race,
    vsRaces: [...build.vsRaces],
    difficulty: build.difficulty,
    patch: build.patch,
    tags: [...build.tags],
    summary: build.summary,
    author: build.author,
    steps: build.steps.map((step) => ({
      time: step.time,
      supply: step.supply,
      instruction: step.instruction,
      icon: step.icon,
    })),
    description: build.description,
  };
}

export function exportBuild(build: LocalBuild): SingleExportFile {
  return { format: EXPORT_FORMAT_SINGLE, version: EXPORT_VERSION, build: toExportedBuild(build) };
}

export function exportAll(builds: LocalBuild[]): MultiExportFile {
  return { format: EXPORT_FORMAT_MULTI, version: EXPORT_VERSION, builds: builds.map(toExportedBuild) };
}

/** Turns a title into a safe, human-readable filename stem — used for the
 *  single-build export's `<slug-or-title>.wc3gym.json` name since a
 *  `LocalBuild`'s own slug is an opaque `local-<uuid>`. */
export function slugifyForFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "private-build";
}

export type ParseImportResult = { builds: ExportedBuild[]; errors: string[] };

function issuesToMessages(error: z.ZodError, fallback: string): string[] {
  const messages = error.issues.map((issue) => `${issue.path.join(".") || fallback}: ${issue.message}`);
  return messages.length > 0 ? messages : [fallback];
}

/**
 * Validates a raw JSON string against the multi-build format, the
 * single-build format, and — when `format` is missing or unrecognized —
 * tolerates a bare build object (or array of them), so a hand-edited or
 * older file still imports. Never throws: malformed JSON and schema
 * failures both come back as `errors`, never an empty `builds` with no
 * explanation.
 */
export function parseImport(json: string): ParseImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return { builds: [], errors: [`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const format =
    parsed !== null && typeof parsed === "object" && "format" in parsed
      ? (parsed as { format?: unknown }).format
      : undefined;

  if (format === EXPORT_FORMAT_MULTI) {
    const result = multiExportSchema.safeParse(parsed);
    return result.success
      ? { builds: result.data.builds, errors: [] }
      : { builds: [], errors: issuesToMessages(result.error, "builds") };
  }

  if (format === EXPORT_FORMAT_SINGLE) {
    const result = singleExportSchema.safeParse(parsed);
    return result.success
      ? { builds: [result.data.build], errors: [] }
      : { builds: [], errors: issuesToMessages(result.error, "build") };
  }

  // No recognized `format` — tolerate a bare build, or an array of them.
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  const builds: ExportedBuild[] = [];
  const errors: string[] = [];
  candidates.forEach((candidate, index) => {
    const result = exportedBuildSchema.safeParse(candidate);
    if (result.success) {
      builds.push(result.data);
    } else {
      const prefix = candidates.length > 1 ? `builds.${index}` : "build";
      errors.push(...issuesToMessages(result.error, prefix));
    }
  });
  return { builds, errors };
}

/** A build's identity for dedupe purposes — its title plus a normalized
 *  view of its steps (trimmed instruction, blank-vs-unset collapsed to the
 *  same value). Two builds with the same title and steps but different
 *  patch/tags/summary/author still fingerprint identically — those fields
 *  don't change what the build order *does*. */
function normalizeForFingerprint(build: { title: string; steps: ExportedStep[] }): string {
  const steps = build.steps.map((step) => ({
    time: step.time ?? "",
    supply: step.supply ?? null,
    instruction: step.instruction.trim(),
    icon: step.icon ?? "",
  }));
  return JSON.stringify({ title: build.title.trim().toLowerCase(), steps });
}

/** SHA-256 (Web Crypto) hex digest of a build's fingerprint-relevant
 *  fields — used by `importBuilds` to skip a build that's already been
 *  imported (or created) locally, even under a different slug. */
export async function fingerprint(build: { title: string; steps: ExportedStep[] }): Promise<string> {
  const data = new TextEncoder().encode(normalizeForFingerprint(build));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type ImportResult = { next: LocalBuild[]; added: number; skipped: number };

/** Merges `incoming` exported builds into `existing`, minting a fresh
 *  `local-<uuid>` slug for each newly-added one (`createLocalBuild`) and
 *  skipping any whose fingerprint already matches something in `existing`
 *  — including another build already added earlier in the same call, so
 *  importing a file with an internal duplicate doesn't add it twice.
 *  Immutable: `existing` is never mutated, `next` is a new array. */
export async function importBuilds(existing: LocalBuild[], incoming: ExportedBuild[]): Promise<ImportResult> {
  const seen = new Set(await Promise.all(existing.map((build) => fingerprint(build))));
  const next = [...existing];
  let added = 0;
  let skipped = 0;

  for (const build of incoming) {
    const fp = await fingerprint(build);
    if (seen.has(fp)) {
      skipped += 1;
      continue;
    }
    seen.add(fp);
    const input: LocalBuildInput = {
      title: build.title,
      race: build.race,
      vsRaces: build.vsRaces,
      difficulty: build.difficulty,
      patch: build.patch,
      tags: build.tags,
      summary: build.summary,
      author: build.author,
      steps: build.steps,
      description: build.description,
    };
    next.push(createLocalBuild(input));
    added += 1;
  }

  return { next, added, skipped };
}
