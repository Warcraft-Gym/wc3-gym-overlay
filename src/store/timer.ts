/**
 * Pure timer math over the `TimerState` store value. No I/O, no host calls —
 * every function takes the current value (and, where relevant, `now`) and
 * returns a new value or derived data. Ported from the site's `StepTable`
 * (`src/components/builds/StepTable.tsx`) and `src/lib/builds/types.ts`.
 */

import type { TimerState } from "./keys";

export type TimedStep = { time?: string };

/** Parse "mm:ss" → seconds; undefined when absent or malformed. */
export function parseClock(time?: string): number | undefined {
  if (!time) return undefined;
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isRunning(t: TimerState): boolean {
  return t.startedAtMs !== null;
}

/**
 * Single source of truth for "does the panel show an active row right now".
 * `engaged` alone can't cover every path a `TimerState` reaches this shape
 * through (values written directly to the store by tests, or persisted
 * before `engaged` existed) — `isRunning`/`baseElapsedMs > 0` are kept as a
 * fallback so any state that looks like "playing" or "sitting past 0:00" is
 * still treated as engaged. Used by both `jumpToStep` (to decide whether the
 * next `step_next`/`step_prev` press should target "the first timed step"
 * or "the neighbour of the currently active one") and `useClock.active` (to
 * decide whether any row should render as active) — the two must agree, or
 * step navigation and the active-row highlight can disagree with each other.
 */
export function isEngaged(t: TimerState): boolean {
  return Boolean(t.engaged) || isRunning(t) || t.baseElapsedMs > 0;
}

export function elapsedMs(t: TimerState, now: number): number {
  if (t.startedAtMs === null) return t.baseElapsedMs;
  return t.baseElapsedMs + (now - t.startedAtMs);
}

export function startTimer(t: TimerState, now: number): TimerState {
  if (isRunning(t)) return t;
  // Playing engages: once Play has been pressed, the panel is showing a
  // running clock, so the next step_next/step_prev press must treat the
  // currently active row (derived from elapsed time via `isEngaged`) as the
  // reference point rather than rewinding to the first timed step.
  return { startedAtMs: now, baseElapsedMs: t.baseElapsedMs, engaged: true };
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (!isRunning(t)) return t;
  return { startedAtMs: null, baseElapsedMs: elapsedMs(t, now), engaged: t.engaged };
}

export function resetTimer(): TimerState {
  return { startedAtMs: null, baseElapsedMs: 0, engaged: false };
}

/**
 * Index of the last step whose parsed `mm:ss` time is <= `elapsedSec`.
 * Steps without a parsable time never count. -1 when none has passed yet.
 */
export function activeStepIndex(steps: TimedStep[], elapsedSec: number): number {
  let active = -1;
  steps.forEach((step, index) => {
    const seconds = parseClock(step.time);
    if (seconds !== undefined && seconds <= elapsedSec) active = index;
  });
  return active;
}

function timedEntries(steps: TimedStep[]): { index: number; seconds: number }[] {
  return steps
    .map((step, index) => ({ index, seconds: parseClock(step.time) }))
    .filter((entry): entry is { index: number; seconds: number } => entry.seconds !== undefined);
}

function jumpTo(t: TimerState, now: number, targetMs: number): TimerState {
  return isRunning(t)
    ? { startedAtMs: now, baseElapsedMs: targetMs, engaged: true }
    : { startedAtMs: null, baseElapsedMs: targetMs, engaged: true };
}

/**
 * Jumps the clock to the neighbouring timed step in direction `dir`,
 * clamped at both ends. Preserves whether the timer is running.
 *
 * `currentPos` is derived from `isEngaged(t)`, not from elapsed time alone:
 * elapsed time can't distinguish "never touched" from "sitting on a step
 * timed at 0:00" (both are `elapsedSec === 0`). When the panel is not
 * engaged (fresh or freshly reset), `currentPos` starts at -1 regardless of
 * elapsed time, so `+1` always lands on the first timed step itself (even
 * when it's timed 0:00) and `-1` is a no-op (there's nothing before
 * "fresh"). Once engaged — whether by Play running, a prior jump, or a
 * paused nonzero elapsed — `currentPos` is the last timed step at-or-before
 * the current elapsed time, so `+1`/`-1` move to its neighbour without ever
 * rewinding a step_next press back past the row that's already active (the
 * C-015 step 5 defect this replaces: pressing Play, waiting, then
 * step_next must advance from the active row, not snap back to step 0).
 */
export function jumpToStep(
  t: TimerState,
  steps: TimedStep[],
  dir: 1 | -1,
  now: number,
): TimerState {
  const timed = timedEntries(steps);
  if (timed.length === 0) return t;

  if (!isEngaged(t)) {
    if (dir === -1) return t;
    return jumpTo(t, now, timed[0].seconds * 1000);
  }

  const elapsedSec = elapsedMs(t, now) / 1000;
  let currentPos = -1;
  timed.forEach((entry, pos) => {
    if (entry.seconds <= elapsedSec) currentPos = pos;
  });

  const nextPos = Math.min(Math.max(currentPos + dir, 0), timed.length - 1);
  return jumpTo(t, now, timed[nextPos].seconds * 1000);
}
