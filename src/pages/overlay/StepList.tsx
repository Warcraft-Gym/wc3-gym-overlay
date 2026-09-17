import { useEffect, useRef } from "react";
import type { ApiBuildListItem } from "../../api/schema";
import type { ClockState } from "../../data/useClock";
import { activeStepIndex } from "../../store/timer";
import { StepRow, type StepRowState } from "./StepRow";

function stateFor(index: number, activeIndex: number): StepRowState {
  if (activeIndex < 0) return "upcoming";
  if (index < activeIndex) return "past";
  if (index === activeIndex) return "active";
  return "upcoming";
}

export function StepList({
  build,
  clock,
  compact,
}: {
  build: ApiBuildListItem;
  clock: ClockState;
  compact: boolean;
}) {
  const containerRef = useRef<HTMLOListElement>(null);
  // No row counts as active until the play-along clock has actually been
  // engaged — see the doc comment on `ClockState.active`.
  const activeIndex = clock.active ? activeStepIndex(build.steps, clock.elapsedSec) : -1;

  useEffect(() => {
    if (activeIndex < 0) return;
    const activeRow = containerRef.current?.querySelector('[data-step][data-state="active"]');
    activeRow?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    // tabIndex makes the scrollable region itself keyboard-reachable (arrow
    // keys / space to scroll) without adding any of the *rows* to the tab
    // order — see the design direction's "rows are not focusable".
    <ol ref={containerRef} tabIndex={0} aria-label="Build order steps" className="overlay-steps">
      {build.steps.map((step, index) => (
        <StepRow
          key={index}
          index={index}
          step={step}
          compact={compact}
          state={stateFor(index, activeIndex)}
        />
      ))}
    </ol>
  );
}
