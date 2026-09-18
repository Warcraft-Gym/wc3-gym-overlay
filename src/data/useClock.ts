import { TIMER } from "../store/keys";
import { elapsedMs, isRunning } from "../store/timer";
import { useStoreValue } from "../store/useStore";

export type ClockState = {
  elapsedSec: number;
  running: boolean;
  /** Whether the play-along session has been engaged at least once (started,
   *  jumped to a step, or paused with nonzero elapsed). Distinct from
   *  `running`: a fresh, never-started timer sitting at 0:00 must not mark
   *  any step "active" even though a step timed at "0:00" would otherwise
   *  satisfy `activeStepIndex(steps, 0)`. `timer.engaged` is the primary
   *  signal (set by `startTimer`/`jumpToStep`); `running`/`baseElapsedMs`
   *  are kept as a fallback for values written directly to the store
   *  (tests, or state persisted before `engaged` existed). */
  active: boolean;
};

export function useClock(): ClockState {
  const timer = useStoreValue(TIMER);
  const running = isRunning(timer);
  const elapsedSec = elapsedMs(timer, Date.now()) / 1000;
  const active = Boolean(timer.engaged) || running || timer.baseElapsedMs > 0;

  return { elapsedSec, running, active };
}
