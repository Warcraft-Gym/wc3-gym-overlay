/**
 * F009 (plan-vs-actual-engine) – turns a freshly-picked-up replay
 * (`onLastReplay`, from `src/replayWatcher.ts`) into a stored review
 * (`LAST_REVIEW`, `store/keys.ts`):
 *
 *   snapshot the selected build (the plan) → import the replay →
 *   `pickMe` (who is "you") → `compareBuild` (plan vs. actual) → store.
 *
 * No UI here – this only produces `LAST_REVIEW` and the handful of
 * exported actions (`retryReview`, `resolveReview`, `markReviewSeen`) a
 * later feature's picker surface calls. `startReviewPipeline()` is called
 * once from the picker's bootstrap (`pages/picker/App.tsx`), same pattern
 * as `replayWatcher.ts`'s `startReplayWatcher()`.
 *
 * Only one import is ever in flight: a new replay arriving mid-import
 * aborts the previous request (the client's `AbortController` – see
 * `api/replayImport.ts`) and its result is discarded entirely, including
 * never writing a review for it – the newest replay always wins.
 */

import { requestReplayImport, ReplayImportError, type ReplayImportPlayer } from "../api/replayImport";
import { getSelectedBuildSnapshot } from "../data/useSelectedBuild";
import { host } from "../host";
import type { ReplayEvent } from "../host/bridge";
import { compareBuild, pickMe } from "../lib/planVsActual";
import { onLastReplay } from "../replayWatcher";
import { LAST_REVIEW, SETTINGS } from "../store/keys";
import { readKey, updateKey, writeKey } from "../store/state";
import type { Review, ReviewPlan, ReviewPlayer } from "./types";

/** F009's own cutoff/upgrades/items choice for every review import –
 *  deliberately different from the manual "Import replay" modal's
 *  defaults (480s/true/false, see `RequestReplayImportOptions`): a review
 *  wants the whole early game (most builds finish well before 15:00) and
 *  every upgrade/item order, not just what's "likely accepted" by the
 *  modal's shorter default cutoff. */
export const REVIEW_CUTOFF_SECONDS = 900;
export const REVIEW_INCLUDE_UPGRADES = true;
export const REVIEW_INCLUDE_ITEMS = true;

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

function reviewPlanFrom(plan: ReturnType<typeof getSelectedBuildSnapshot>): ReviewPlan | null {
  if (!plan) return null;
  return { slug: plan.slug, title: plan.title, race: plan.race, steps: plan.steps };
}

function reviewPlayersFrom(players: ReplayImportPlayer[]): ReviewPlayer[] {
  return players.map((player) => ({ id: player.id, name: player.name, race: player.race, steps: player.build.steps }));
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function describeImportError(err: unknown): string {
  if (err instanceof ReplayImportError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Builds and stores the review for a successful import – shared by the
 *  initial `onLastReplay` handler and `retryReview()`. `plan` is snapshot
 *  *before* the import starts (both callers already do this), so it never
 *  reflects a selection change made while the import was in flight. */
async function storeOkReview(
  source: { path: string; mtimeMs: number },
  plan: ReturnType<typeof getSelectedBuildSnapshot>,
  response: Awaited<ReturnType<typeof requestReplayImport>>,
): Promise<void> {
  const me = pickMe(response.players, { myBattleTag: readKey(SETTINGS).myBattleTag, planRace: plan?.race });
  const mePlayer = me.kind === "resolved" ? response.players.find((p) => p.id === me.player.id) ?? null : null;
  const comparison = plan && mePlayer ? compareBuild(plan.steps, mePlayer.build.steps) : null;

  const review: Review = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    status: "ok",
    map: response.map,
    duration: response.duration,
    players: reviewPlayersFrom(response.players),
    meId: mePlayer ? mePlayer.id : null,
    meStatus: me.kind,
    plan: reviewPlanFrom(plan),
    comparison,
    seen: false,
  };
  await writeKey(LAST_REVIEW, review);
}

async function storeErrorReview(
  source: { path: string; mtimeMs: number },
  message: string,
  plan: ReturnType<typeof getSelectedBuildSnapshot>,
): Promise<void> {
  const review: Review = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    status: "error",
    error: message,
    map: "",
    duration: "",
    players: [],
    meId: null,
    meStatus: "unresolved",
    plan: reviewPlanFrom(plan),
    comparison: null,
    seen: false,
  };
  await writeKey(LAST_REVIEW, review);
}

// --- in-flight tracking: newest replay wins -------------------------------

let currentImport: AbortController | null = null;

async function importReplay(event: ReplayEvent): Promise<void> {
  currentImport?.abort();
  const controller = new AbortController();
  currentImport = controller;

  const plan = getSelectedBuildSnapshot();
  const source = { path: event.path, mtimeMs: event.mtimeMs };
  const apiBase = readKey(SETTINGS).apiBase;

  try {
    const response = await requestReplayImport(
      apiBase,
      { kind: "file", bytes: event.bytes, fileName: basename(event.path) },
      {
        cutoffSeconds: REVIEW_CUTOFF_SECONDS,
        includeUpgrades: REVIEW_INCLUDE_UPGRADES,
        includeItems: REVIEW_INCLUDE_ITEMS,
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return;
    await storeOkReview(source, plan, response);
  } catch (err) {
    if (isAbortError(err)) return;
    await storeErrorReview(source, describeImportError(err), plan);
  } finally {
    if (currentImport === controller) currentImport = null;
  }
}

/** Starts the pipeline: subscribes to `onLastReplay` and imports/stores a
 *  review for every event. Returns an unsubscribe function. Call once from
 *  the picker's bootstrap, same as `startReplayWatcher()`. */
export function startReviewPipeline(): () => void {
  return onLastReplay((event) => {
    void importReplay(event);
  });
}

// --- retry (an earlier import that failed) --------------------------------

/** Retries the currently-stored review, only when it's `status: "error"`.
 *  Re-reads the replay file through the host; if its mtime no longer
 *  matches `source.mtimeMs`, the game has already been replaced by a newer
 *  one and the stored review is updated to say so instead of importing
 *  stale (or now-wrong) bytes. */
export async function retryReview(): Promise<void> {
  const current = readKey(LAST_REVIEW);
  if (!current || current.status !== "error") return;

  const plan = getSelectedBuildSnapshot();
  const file = await host.readReplayFile(current.source.path);
  if (!file) {
    await storeErrorReview(current.source, "The replay file is no longer there.", plan);
    return;
  }
  if (file.mtimeMs !== current.source.mtimeMs) {
    await storeErrorReview(current.source, "A newer game replaced this replay before the retry.", plan);
    return;
  }

  await importReplay({ path: current.source.path, mtimeMs: file.mtimeMs, bytes: file.bytes });
}

// --- resolving "which one is you" after the fact --------------------------

/** Recomputes a review's comparison for a different `meId` than the one
 *  `pickMe` landed on – every player's steps were stored at import time
 *  (see `reviewPlayersFrom`), so this needs no re-import. Stores the
 *  updated review and, when `rememberBattleTag` is given, saves it to
 *  `Settings.myBattleTag` so the next replay resolves automatically. */
export async function resolveReview(review: Review, meId: number, rememberBattleTag?: string): Promise<Review> {
  const mePlayer = review.players.find((player) => player.id === meId) ?? null;
  const comparison = review.plan && mePlayer ? compareBuild(review.plan.steps, mePlayer.steps) : null;
  const updated: Review = {
    ...review,
    meId: mePlayer ? mePlayer.id : null,
    meStatus: mePlayer ? "resolved" : "unresolved",
    comparison,
  };
  await writeKey(LAST_REVIEW, updated);
  if (rememberBattleTag) {
    await updateKey(SETTINGS, (settings) => ({ ...settings, myBattleTag: rememberBattleTag }));
  }
  return updated;
}

/** Marks the currently-stored review as seen (the picker UI's unread
 *  indicator) – a no-op when there is no review yet. */
export async function markReviewSeen(): Promise<void> {
  await updateKey(LAST_REVIEW, (current) => (current ? { ...current, seen: true } : current));
}
