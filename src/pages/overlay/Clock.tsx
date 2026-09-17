import { formatClock } from "../../store/timer";

/** The play-along clock. `aria-live="off"` — it ticks every 250ms and would
 *  spam a screen reader otherwise; the accessible name lives on the buttons
 *  next to it instead. */
export function Clock({ elapsedSec }: { elapsedSec: number }) {
  return (
    <span data-clock aria-live="off" className="overlay-clock">
      {formatClock(elapsedSec)}
    </span>
  );
}
