import { useEffect, useMemo, useRef } from "react";
import type { ApiBuildListItem } from "../../api/schema";
import type { ClockState } from "../../data/useClock";
import { columnsFor, gridTemplateColumns } from "../../lib/stepColumns";
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
  // The scrollable region is the wrapper (not the `<ol>`), so the sticky
  // header can live inside it as a non-scrolling sibling of the rows.
  const containerRef = useRef<HTMLDivElement>(null);
  // No row counts as active until the play-along clock has actually been
  // engaged — see the doc comment on `ClockState.active`.
  const activeIndex = clock.active ? activeStepIndex(build.steps, clock.elapsedSec) : -1;
  const columns = useMemo(() => columnsFor(build.steps, compact), [build.steps, compact]);
  const template = gridTemplateColumns(columns);

  useEffect(() => {
    if (activeIndex < 0) return;
    const activeRow = containerRef.current?.querySelector('[data-step][data-state="active"]');
    activeRow?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    // tabIndex makes the scrollable region itself keyboard-reachable (arrow
    // keys / space to scroll) without adding any of the *rows* to the tab
    // order — see the design direction's "rows are not focusable".
    <div ref={containerRef} tabIndex={0} className="overlay-steps-wrap">
      <div
        data-step-header
        aria-hidden="true"
        className="overlay-step-header"
        style={{ gridTemplateColumns: template }}
      >
        {columns.showIndex && (
          <span className="overlay-step-header__cell overlay-step-header__cell--index">#</span>
        )}
        {columns.showTime && (
          <span className="overlay-step-header__cell overlay-step-header__cell--time">Time</span>
        )}
        {columns.showSupply && (
          <span className="overlay-step-header__cell overlay-step-header__cell--supply">Food</span>
        )}
        <span className="overlay-step-header__cell">Step</span>
      </div>
      <ol aria-label="Build order steps" className="overlay-steps">
        {build.steps.map((step, index) => (
          <StepRow
            key={index}
            index={index}
            step={step}
            compact={compact}
            state={stateFor(index, activeIndex)}
            columns={columns}
          />
        ))}
      </ol>
    </div>
  );
}
