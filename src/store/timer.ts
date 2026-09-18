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

export function elapsedMs(t: TimerState, now: number): number {
  if (t.startedAtMs === null) return t.baseElapsedMs;
  return t.baseElapsedMs + (now - t.startedAtMs);
}

export function startTimer(t: TimerState, now: number): TimerState {
  if (isRunning(t)) return t;
  // Deliberately does NOT set `engaged: true`: `engaged` gates jumpToStep's
  // "first press" branch specifically, and Play running for a while before
  // the player's first `step_next` press must not pre-empt that branch —
  // see jumpToStep's doc comment. `useClock.active` still lights up while
  // running via its own `isRunning` check, independent of `engaged`.
  return { startedAtMs: now, baseElapsedMs: t.baseElapsedMs, engaged: t.engaged };
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
 * A fresh/reset timer (`!t.engaged`) is a special case: `elapsedSec` alone
 * can't distinguish "never touched" from "sitting on a step timed at
 * 0:00", so deriving `currentPos` purely from elapsed time would make the
 * very first `step_next` press skip straight past a build's first step
 * whenever that step is timed `0:00` (the common case). Instead, the first
 * `+1` since the last reset always lands on the first timed step itself,
 * and the first `-1` is a no-op (there's nothing before "fresh"). This
 * holds even if Play has already been running for a while: `engaged` here
 * tracks "has step_next/step_prev been used since reset", not "has Play
 * been pressed" — otherwise a player who presses Play and waits a moment
 * before their first `step_next` would see it skip step 1 exactly like the
 * original defect, just with the clock started instead of at boot.
 */
export function jumpToStep(
  t: TimerState,
  steps: TimedStep[],
  dir: 1 | -1,
  now: number,
): TimerState {
  const timed = timedEntries(steps);
  if (timed.length === 0) return t;

  if (!t.engaged) {
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
