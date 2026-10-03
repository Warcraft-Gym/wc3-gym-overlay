/**
 * Syncs the build-order timer to Warcraft III's own clock from the
 * `Host.onGameClock` samples. Pure math in `applyGameClock`; the only I/O
 * is in `startGameClockSync`, which writes `TIMER` when the state changes.
 */
import { host } from "../host";
import type { GameClockSample } from "../host/bridge";
import { TIMER, type TimerState } from "../store/keys";
import { readKey, writeKey } from "../store/state";
import { elapsedMs, isRunning, resetTimer } from "../store/timer";

/** Resync when the overlay clock drifts further than this from the game clock. */
export const DRIFT_MS = 300;
/** A clock that holds longer than this is a paused game. Three refreshes, at least 750 ms. */
export function holdLimitMs(refreshMs: number): number {
  return Math.max(750, refreshMs * 3);
}

/**
 * Next timer state for one sample. Returns `t` itself when nothing changes,
 * so the caller can skip the write.
 * `heldMs`: how long `clockMs` has kept its current value. `wasInGame`: the
 * previous sample's `inGame`, so leaving a game resets the timer once.
 */
export function applyGameClock(
  t: TimerState,
  sample: GameClockSample,
  heldMs: number,
  wasInGame: boolean,
  now: number,
): TimerState {
  if (!sample || !sample.inGame) return wasInGame ? resetTimer() : t;
  if (heldMs > holdLimitMs(sample.refreshMs)) {
    if (!isRunning(t) && t.baseElapsedMs === sample.clockMs) return t;
    return { startedAtMs: null, baseElapsedMs: sample.clockMs, engaged: true };
  }
  // Compare elapsed time, not start time: a step jump while running keeps
  // its target in `baseElapsedMs` (see `jumpTo` in store/timer.ts).
  if (isRunning(t) && Math.abs(elapsedMs(t, now) - sample.clockMs) <= DRIFT_MS) return t;
  return { startedAtMs: now - sample.clockMs, baseElapsedMs: 0, engaged: true };
}

/** Subscribes to the host's samples. Call once, in the overlay window only, so there is one writer. */
export function startGameClockSync(): () => void {
  let lastClockMs: number | null = null;
  let lastChangeAt = 0;
  let wasInGame = false;
  return host.onGameClock((sample) => {
    const now = Date.now();
    const clockMs = sample?.inGame ? sample.clockMs : null;
    if (clockMs !== lastClockMs) {
      lastClockMs = clockMs;
      lastChangeAt = now;
    }
    const current = readKey(TIMER);
    const next = applyGameClock(current, sample, now - lastChangeAt, wasInGame, now);
    wasInGame = Boolean(sample?.inGame);
    if (next !== current) void writeKey(TIMER, next);
  });
}
