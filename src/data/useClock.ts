import { TIMER } from "../store/keys";
import { elapsedMs, isEngaged, isRunning } from "../store/timer";
import { useStoreValue } from "../store/useStore";

export type ClockState = {
  elapsedSec: number;
  running: boolean;
  /** Whether the play-along session has been engaged at least once (started,
   *  jumped to a step, or paused with nonzero elapsed). Distinct from
   *  `running`: a fresh, never-started timer sitting at 0:00 must not mark
   *  any step "active" even though a step timed at "0:00" would otherwise
   *  satisfy `activeStepIndex(steps, 0)`. Backed by `isEngaged` — the same
   *  function `jumpToStep` uses — so step navigation and the active-row
   *  highlight can never disagree about what counts as "engaged". */
  active: boolean;
};

export function useClock(): ClockState {
  const timer = useStoreValue(TIMER);
  const running = isRunning(timer);
  const elapsedSec = elapsedMs(timer, Date.now()) / 1000;
  const active = isEngaged(timer);

  return { elapsedSec, running, active };
}
