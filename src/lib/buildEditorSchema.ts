/**
 * Validation for the private-build editor — mirrors the site's own
 * submission rules (`src/lib/builds/submission.ts` in the Next site,
 * lines 10-60) field-for-field, so a private build validated here can
 * later be submitted to the site unchanged. The one deliberate deviation:
 * the site requires >= 3 steps for a public submission, this editor only
 * requires >= 1 (a private build order can be a single-step reminder) —
 * see spec.md's "Validation rules to mirror" section.
 *
 * Every field here is a plain string (the shape controlled `<input>`s
 * naturally produce) rather than the parsed union types the site's zod
 * schema accepts — `EditorFormInput` is what the form holds and posts to
 * `.safeParse`, `EditorFormValues` is what comes out the other side, ready
 * for `toLocalBuildInput`.
 */

import { z } from "zod";
import type { ApiBuildStep } from "../api/schema";
import type { AnyBuild } from "../data/useAllBuilds";
import type { LocalBuildInput } from "./localBuilds";

export const RACE_VALUES = ["human", "orc", "nightelf", "undead"] as const;
export const DIFFICULTY_VALUES = ["beginner", "intermediate", "advanced"] as const;

export type EditorRace = (typeof RACE_VALUES)[number];
export type EditorDifficulty = (typeof DIFFICULTY_VALUES)[number];

export type EditorStepInput = {
  time: string;
  supply: string;
  instruction: string;
  icon: string;
};

export type EditorFormInput = {
  title: string;
  race: string;
  vsRaces: string[];
  difficulty: string;
  patch: string;
  tags: string;
  summary: string;
  author: string;
  authorDiscord: string;
  sourceUrl: string;
  description: string;
  steps: EditorStepInput[];
};

/** Returns whether an icon key is known — the picker only ever offers keys
 *  from the loaded manifest, but the schema itself needs a checker so it can
 *  reject a hand-typed/stale key too. Defaults to "accept anything
 *  non-empty" so validation never blocks editing when the icon manifest
 *  hasn't loaded yet (see `data/useIcons.ts`'s offline fallback). */
export type IconKeyChecker = (key: string) => boolean;

const clockSchema = z
  .string()
  .trim()
  .max(5, "Use mm:ss, e.g. 1:30")
  .refine((v) => v === "" || /^\d{1,2}:\d{2}$/.test(v), "Use mm:ss, e.g. 1:30");

const supplySchema = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 100), "0–100, or leave blank");

function createStepSchema(isKnownIcon: IconKeyChecker) {
  return z.object({
    time: clockSchema,
    supply: supplySchema,
    instruction: z.string().trim().min(2, "Say what to do").max(160, "Keep it under 160 characters"),
    icon: z
      .string()
      .trim()
      .refine((v) => v === "" || isKnownIcon(v), "Unknown icon"),
  });
}

const raceFieldSchema = z
  .string()
  .refine((v): v is EditorRace => (RACE_VALUES as readonly string[]).includes(v), "Pick your race");

const difficultyFieldSchema = z
  .string()
  .refine((v): v is EditorDifficulty => (DIFFICULTY_VALUES as readonly string[]).includes(v), "Pick a difficulty");

const vsRaceFieldSchema = z
  .string()
  .refine((v): v is EditorRace => (RACE_VALUES as readonly string[]).includes(v));

/** Builds the editor's zod schema. `isKnownIcon` defaults to "anything
 *  non-empty is fine" — pass the loaded manifest's membership test once
 *  `useIcons` has data, for a real "known key or empty" check. */
export function createEditorFormSchema(isKnownIcon: IconKeyChecker = () => true) {
  return z.object({
    title: z.string().trim().min(6, "Give it a proper title").max(90, "Max 90 characters"),
    race: raceFieldSchema,
    vsRaces: z
      .array(vsRaceFieldSchema)
      .transform((v) => [...new Set(v)])
      .refine((v) => v.length <= 4, "Max 4 opponents"),
    difficulty: difficultyFieldSchema,
    patch: z.string().trim().max(16, "Max 16 characters"),
    tags: z
      .string()
      .trim()
      .max(200)
      .transform((v) =>
        v
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8),
      ),
    summary: z
      .string()
      .trim()
      .min(20, "A sentence or two, at least 20 characters")
      .max(200, "Max 200 characters"),
    author: z.string().trim().min(2, "Who should we credit?").max(60, "Max 60 characters"),
    authorDiscord: z.string().trim().max(60, "Max 60 characters"),
    sourceUrl: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !v || /^https?:\/\//.test(v), "Must start with http(s)://"),
    description: z.string().trim().max(6000, "Max 6000 characters"),
    steps: z.array(createStepSchema(isKnownIcon)).min(1, "Add at least one step"),
  });
}

export const editorFormSchema = createEditorFormSchema();

export type EditorFormValues = z.infer<typeof editorFormSchema>;

/** Field-level messages keyed by path ("title", "steps.2.instruction"). */
export type EditorFieldErrors = Record<string, string>;

export function flattenEditorErrors(err: z.ZodError): EditorFieldErrors {
  const out: EditorFieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** A build's step, expressed the way the editor's form fields want it — a
 *  step-level mirror of `EditorFormValues`'s `steps`. */
function stepToForm(step: ApiBuildStep): EditorStepInput {
  return {
    time: step.time ?? "",
    supply: step.supply === undefined ? "" : String(step.supply),
    instruction: step.instruction,
    icon: step.icon ?? "",
  };
}

/** Converts a site or local build into editable form values. Icon *keys*
 *  are preserved as-is; `iconUrl` is dropped here and re-derived from the
 *  *current* `apiBase` by `toLocalBuildInput` on save, since the build's own
 *  `iconUrl` may have been generated against a different origin (dev vs
 *  prod, or a stale cached site fetch). */
export function fromBuild(build: AnyBuild): EditorFormInput {
  const description = "description" in build && typeof build.description === "string" ? build.description : "";
  const authorDiscord = "authorDiscord" in build && build.authorDiscord ? build.authorDiscord : "";
  const sourceUrl = "sourceUrl" in build && build.sourceUrl ? build.sourceUrl : "";
  return {
    title: build.title,
    race: build.race,
    vsRaces: [...build.vsRaces],
    difficulty: build.difficulty,
    patch: build.patch ?? "",
    tags: build.tags.join(", "),
    summary: build.summary,
    author: build.author,
    authorDiscord,
    sourceUrl,
    description,
    steps: build.steps.map(stepToForm),
  };
}

/** Converts validated form values into what `createLocalBuild`/
 *  `updateLocalBuild` expect. `apiBase` re-derives each step's `iconUrl`
 *  from its (validated, known) icon key — see `fromBuild`'s note on why the
 *  build's own `iconUrl` isn't reused as-is. */
export function toLocalBuildInput(form: EditorFormValues, apiBase: string): LocalBuildInput {
  return {
    title: form.title,
    race: form.race,
    vsRaces: form.vsRaces,
    difficulty: form.difficulty,
    patch: form.patch || undefined,
    tags: form.tags,
    summary: form.summary,
    author: form.author,
    authorDiscord: form.authorDiscord || undefined,
    sourceUrl: form.sourceUrl || undefined,
    description: form.description || undefined,
    steps: form.steps.map(
      (step): ApiBuildStep => ({
        time: step.time || undefined,
        supply: step.supply === "" ? undefined : Number(step.supply),
        instruction: step.instruction,
        icon: step.icon || undefined,
        iconUrl: step.icon ? `${apiBase}/wc3-icons/${step.icon}.webp` : undefined,
      }),
    ),
  };
}

/** A blank form for "New private build". */
export function blankEditorForm(): EditorFormInput {
  return {
    title: "",
    race: "",
    vsRaces: [],
    difficulty: "",
    patch: "",
    tags: "",
    summary: "",
    author: "",
    authorDiscord: "",
    sourceUrl: "",
    description: "",
    steps: [],
  };
}
