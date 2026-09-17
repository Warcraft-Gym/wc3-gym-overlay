import { TIMER } from "../store/keys";
import { elapsedMs, isRunning } from "../store/timer";
import { useStoreValue } from "../store/useStore";

export type ClockState = {
  elapsedSec: number;
  running: boolean;
  /** Whether the play-along session has been engaged at least once (started
   *  now or paused with nonzero elapsed). Distinct from `running`: a fresh,
   *  never-started timer sitting at 0:00 must not mark any step "active"
   *  even though a step timed at "0:00" would otherwise satisfy
   *  `activeStepIndex(steps, 0)`. */
  active: boolean;
};

export function useClock(): ClockState {
  const timer = useStoreValue(TIMER);
  const running = isRunning(timer);
  const elapsedSec = elapsedMs(timer, Date.now()) / 1000;
  const active = running || timer.baseElapsedMs > 0;

  return { elapsedSec, running, active };
}
