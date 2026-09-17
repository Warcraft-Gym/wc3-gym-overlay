/**
 * Timer mutations shared by the global-shortcut dispatcher (`shortcuts.ts`)
 * and the overlay panel's Play/Pause/Reset buttons, so a shortcut and a
 * click always produce the exact same store update.
 */

import { TIMER, type TimerState } from "../store/keys";
import { updateKey } from "../store/state";
import { isRunning, jumpToStep, pauseTimer, resetTimer, startTimer, type TimedStep } from "../store/timer";

export async function togglePlayPause(now: number = Date.now()): Promise<TimerState> {
  return updateKey(TIMER, (t) => (isRunning(t) ? pauseTimer(t, now) : startTimer(t, now)));
}

export async function reset(): Promise<TimerState> {
  return updateKey(TIMER, () => resetTimer());
}

export async function stepNext(steps: TimedStep[], now: number = Date.now()): Promise<TimerState> {
  return updateKey(TIMER, (t) => jumpToStep(t, steps, 1, now));
}

export async function stepPrev(steps: TimedStep[], now: number = Date.now()): Promise<TimerState> {
  return updateKey(TIMER, (t) => jumpToStep(t, steps, -1, now));
}
